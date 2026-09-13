import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";
import { loadConfig } from "./config.js";
import { AppError } from "./errors.js";
import {
  EuInformationSystemV3Provider,
  S3StorageProvider,
  SentinelHubProvider,
  type DdsProvider,
  type SatelliteProvider,
  type StorageProvider,
} from "./providers.js";
import { PgRepository, type Repository, type Resource, type ResourceType } from "./repository.js";

export interface WorkerDependencies {
  repository: Repository;
  storage: StorageProvider;
  satellite: SatelliteProvider;
  dds: DdsProvider;
}

const jobTypes: ResourceType[] = ["analyses", "evidence_packs", "dds_submissions"];
const maxAttempts = 5;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function processEvidencePack(job: Resource, dependencies: WorkerDependencies): Promise<Record<string, unknown>> {
  const documentIds = zStringArray(job.documentIds);
  const analysisIds = zStringArray(job.analysisIds);
  const documents = await Promise.all(
    documentIds.map((id) => dependencies.repository.get("documents", job.tenantId, id)),
  );
  if (documents.some((document) => !document || document.status !== "complete")) {
    throw new AppError("EVIDENCE_INCOMPLETE", "All evidence documents must be complete", 409);
  }
  const analyses = await Promise.all(
    analysisIds.map((id) => dependencies.repository.get("analyses", job.tenantId, id)),
  );
  if (analyses.some((analysis) => !analysis || analysis.status !== "complete")) {
    throw new AppError("EVIDENCE_INCOMPLETE", "All analyses must be complete", 409);
  }
  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    shipmentId: job.shipmentId,
    documents: documents.map((document) => ({
      id: document!.id,
      sha256: document!.sha256,
      objectKey: document!.objectKey,
      versionId: document!.versionId,
    })),
    analyses: analyses.map((analysis) => ({ id: analysis!.id, result: analysis!.result })),
  };
  const bytes = new TextEncoder().encode(canonicalJson(manifest));
  const manifestHash = createHash("sha256").update(bytes).digest("hex");
  const object = await dependencies.storage.putImmutable(
    `${job.tenantId}/evidence-packs/${job.id}/manifest.json`,
    bytes,
    "application/json",
  );
  await dependencies.repository.appendAudit(job.tenantId, "system:worker", "evidence-pack.generated", {
    evidencePackId: job.id,
    manifestHash,
    storageSha256: object.sha256,
  });
  return { manifest, manifestHash, objectVersionId: object.versionId };
}

function zStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new AppError("INVALID_JOB", "Job contains invalid identifiers", 500);
  }
  return value;
}

export async function processOne(dependencies: WorkerDependencies): Promise<boolean> {
  const job = await dependencies.repository.claimJob(jobTypes);
  if (!job) return false;
  const resourceType = job.resourceType as ResourceType;
  try {
    let result: Record<string, unknown>;
    if (resourceType === "analyses") result = await dependencies.satellite.analyze(job);
    else if (resourceType === "evidence_packs") result = await processEvidencePack(job, dependencies);
    else if (resourceType === "dds_submissions") result = await dependencies.dds.submit(job);
    else throw new AppError("INVALID_JOB", "Unsupported job type", 500);
    await dependencies.repository.update(resourceType, job.tenantId, job.id, {
      status: "complete",
      result,
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    const attempts = Number(job.attempts ?? 0) + 1;
    const retryable =
      !(error instanceof AppError) || (error.code !== "NOT_CONFIGURED" && error.statusCode >= 500);
    const status = retryable && attempts < maxAttempts ? "queued" : "failed";
    await dependencies.repository.update(resourceType, job.tenantId, job.id, {
      status,
      attempts,
      nextAttemptAt: Date.now() + Math.min(60_000, 2 ** attempts * 1000),
      error: {
        code: error instanceof AppError ? error.code : "WORKER_ERROR",
        message: error instanceof Error ? error.message : "Unknown worker error",
      },
    });
  }
  return true;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const dependencies: WorkerDependencies = {
    repository: PgRepository.connect(config.DATABASE_URL),
    storage: new S3StorageProvider(config),
    satellite: new SentinelHubProvider(config),
    dds: new EuInformationSystemV3Provider(config),
  };
  for (;;) {
    const processed = await processOne(dependencies);
    if (!processed) await delay(config.WORKER_POLL_MS);
  }
}

if (process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
