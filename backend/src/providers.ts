import { createHash } from "node:crypto";
import {
  GetObjectLockConfigurationCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import type { Config } from "./config.js";
import { AppError } from "./errors.js";
import type { AttestationProviderName, AttestationStatus } from "./identity.js";
import type { Resource } from "./repository.js";

export interface UploadRequest {
  key: string;
  sha256: string;
  size: number;
  mimeType: string;
}

export interface StorageProvider {
  initiateUpload(request: UploadRequest): Promise<{ uploadUrl: string; headers: Record<string, string> }>;
  verifyUpload(request: UploadRequest): Promise<{ etag: string | null; versionId: string | null }>;
  putImmutable(key: string, body: Uint8Array, mimeType: string): Promise<{ sha256: string; versionId: string | null }>;
  getDownloadUrl(key: string, versionId?: string): Promise<string>;
}

export interface SatelliteProvider {
  analyze(job: Resource): Promise<Record<string, unknown>>;
}

export interface DdsProvider {
  submit(job: Resource): Promise<{ externalId: string; status: string }>;
}

export interface AttestationVerificationRequest {
  tenantId: string;
  actorId: string;
  deviceId: string;
  keyId: string | null;
  challengeId: string | null;
  challenge: string;
  provider: AttestationProviderName;
  proof: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface AttestationVerificationResult {
  status: AttestationStatus;
  verified: boolean;
  reason: string;
  providerReference: string | null;
  evidence: Record<string, unknown>;
}

export interface AttestationProvider {
  verify(request: AttestationVerificationRequest): Promise<AttestationVerificationResult>;
}

function notConfigured(provider: string): never {
  throw new AppError("NOT_CONFIGURED", `${provider} provider is not configured`, 503);
}

const attestationResponseSchema = z.object({
  verified: z.boolean(),
  reason: z.string().optional(),
  providerReference: z.string().nullable().optional(),
  evidence: z.record(z.string(), z.unknown()).optional(),
});

export class S3StorageProvider implements StorageProvider {
  private readonly client?: S3Client;
  private readonly bucket?: string;

  constructor(private readonly config: Config) {
    if (!config.S3_BUCKET || !config.AWS_REGION) return;
    this.bucket = config.S3_BUCKET;
    this.client = new S3Client({
      region: config.AWS_REGION,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT } : {}),
      ...(config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: config.S3_ACCESS_KEY_ID,
              secretAccessKey: config.S3_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }

  private configured(): { client: S3Client; bucket: string } {
    if (!this.client || !this.bucket) notConfigured("S3");
    return { client: this.client, bucket: this.bucket };
  }

  async verifyObjectLock(): Promise<void> {
    if (!this.config.S3_OBJECT_LOCK_REQUIRED) return;
    const { client, bucket } = this.configured();
    const result = await client.send(
      new GetObjectLockConfigurationCommand({ Bucket: bucket }),
    );
    if (result.ObjectLockConfiguration?.ObjectLockEnabled !== "Enabled") {
      throw new AppError(
        "OBJECT_LOCK_REQUIRED",
        "The configured S3 bucket does not have Object Lock enabled",
        503,
      );
    }
  }

  async initiateUpload(request: UploadRequest): Promise<{ uploadUrl: string; headers: Record<string, string> }> {
    await this.verifyObjectLock();
    const { client, bucket } = this.configured();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: request.key,
      ContentType: request.mimeType,
      ContentLength: request.size,
      ChecksumSHA256: request.sha256,
      ObjectLockMode: this.config.S3_OBJECT_LOCK_REQUIRED ? "COMPLIANCE" : undefined,
      ObjectLockRetainUntilDate: this.config.S3_OBJECT_LOCK_REQUIRED
        ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        : undefined,
      Metadata: { sha256: request.sha256 },
    });
    return {
      uploadUrl: await getSignedUrl(client, command, { expiresIn: 900 }),
      headers: {
        "content-type": request.mimeType,
        "x-amz-checksum-sha256": request.sha256,
      },
    };
  }

  async verifyUpload(request: UploadRequest): Promise<{ etag: string | null; versionId: string | null }> {
    const { client, bucket } = this.configured();
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: request.key }));
    if (result.ContentLength !== request.size || result.ContentType !== request.mimeType) {
      throw new AppError("UPLOAD_METADATA_MISMATCH", "Uploaded object metadata does not match initiation", 409);
    }
    if (result.Metadata?.sha256 !== request.sha256) {
      throw new AppError("UPLOAD_CHECKSUM_MISMATCH", "Uploaded object checksum metadata does not match", 409);
    }
    if (this.config.S3_OBJECT_LOCK_REQUIRED && (!result.ObjectLockMode || !result.ObjectLockRetainUntilDate)) {
      throw new AppError("OBJECT_LOCK_MISSING", "Uploaded object is not protected by Object Lock", 409);
    }
    return { etag: result.ETag ?? null, versionId: result.VersionId ?? null };
  }

  async putImmutable(key: string, body: Uint8Array, mimeType: string): Promise<{ sha256: string; versionId: string | null }> {
    await this.verifyObjectLock();
    const { client, bucket } = this.configured();
    const sha256 = createHash("sha256").update(body).digest("base64");
    const result = await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
        ChecksumSHA256: sha256,
        ObjectLockMode: this.config.S3_OBJECT_LOCK_REQUIRED ? "COMPLIANCE" : undefined,
        ObjectLockRetainUntilDate: this.config.S3_OBJECT_LOCK_REQUIRED
          ? new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000)
          : undefined,
        Metadata: { sha256 },
      }),
    );
    return { sha256, versionId: result.VersionId ?? null };
  }

  async getDownloadUrl(key: string, versionId?: string): Promise<string> {
    const { client, bucket } = this.configured();
    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(versionId ? { VersionId: versionId } : {}),
      }),
      { expiresIn: 300 },
    );
  }
}

export class SentinelHubProvider implements SatelliteProvider {
  constructor(private readonly config: Config) {}

  async analyze(job: Resource): Promise<Record<string, unknown>> {
    if (!this.config.SENTINEL_HUB_CLIENT_ID || !this.config.SENTINEL_HUB_CLIENT_SECRET) {
      return notConfigured("Sentinel Hub");
    }
    const tokenResponse = await fetch(`${this.config.SENTINEL_HUB_BASE_URL}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.config.SENTINEL_HUB_CLIENT_ID,
        client_secret: this.config.SENTINEL_HUB_CLIENT_SECRET,
      }),
    });
    if (!tokenResponse.ok) throw new AppError("PROVIDER_ERROR", "Sentinel Hub authentication failed", 502);
    const token = (await tokenResponse.json()) as { access_token: string };
    const response = await fetch(`${this.config.SENTINEL_HUB_BASE_URL}/api/v1/process`, {
      method: "POST",
      headers: { authorization: `Bearer ${token.access_token}`, "content-type": "application/json" },
      body: JSON.stringify(job.request),
    });
    if (!response.ok) throw new AppError("PROVIDER_ERROR", "Sentinel Hub analysis failed", 502);
    return { response: await response.json() };
  }
}

export class EuInformationSystemV3Provider implements DdsProvider {
  constructor(private readonly config: Config) {}

  async submit(job: Resource): Promise<{ externalId: string; status: string }> {
    if (!this.config.EU_IS_BASE_URL || !this.config.EU_IS_CLIENT_ID || !this.config.EU_IS_CLIENT_SECRET) {
      return notConfigured("EU Information System V3 Acceptance");
    }
    const response = await fetch(`${this.config.EU_IS_BASE_URL}/v3/acceptance/dds`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-client-id": this.config.EU_IS_CLIENT_ID,
        "x-client-secret": this.config.EU_IS_CLIENT_SECRET,
      },
      body: JSON.stringify(job.draft),
    });
    if (!response.ok) throw new AppError("PROVIDER_ERROR", "EU Information System submission failed", 502);
    return (await response.json()) as { externalId: string; status: string };
  }
}

export class ProviderBackedAttestationProvider implements AttestationProvider {
  constructor(private readonly config: Config) {}

  private providerConfig(provider: AttestationProviderName): {
    label: string;
    url: string;
    token: string;
  } | null {
    if (provider === "play_integrity") {
      return this.config.PLAY_INTEGRITY_VERIFY_URL && this.config.PLAY_INTEGRITY_VERIFY_TOKEN
        ? {
            label: "Play Integrity",
            url: this.config.PLAY_INTEGRITY_VERIFY_URL,
            token: this.config.PLAY_INTEGRITY_VERIFY_TOKEN,
          }
        : null;
    }
    return this.config.APP_ATTEST_VERIFY_URL && this.config.APP_ATTEST_VERIFY_TOKEN
      ? {
          label: "App Attest",
          url: this.config.APP_ATTEST_VERIFY_URL,
          token: this.config.APP_ATTEST_VERIFY_TOKEN,
        }
      : null;
  }

  async verify(request: AttestationVerificationRequest): Promise<AttestationVerificationResult> {
    const target = this.providerConfig(request.provider);
    if (!target) {
      return {
        status: "NOT_CONFIGURED",
        verified: false,
        reason: `${request.provider} verifier is not configured`,
        providerReference: null,
        evidence: {},
      };
    }

    const response = await fetch(target.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${target.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new AppError("PROVIDER_ERROR", `${target.label} attestation verification failed`, 502);
    }

    const parsed = attestationResponseSchema.parse(await response.json());
    return {
      status: parsed.verified ? "VERIFIED" : "UNVERIFIED",
      verified: parsed.verified,
      reason: parsed.reason ?? (parsed.verified ? `${target.label} verified attestation` : `${target.label} did not verify attestation`),
      providerReference: parsed.providerReference ?? null,
      evidence: parsed.evidence ?? {},
    };
  }
}
