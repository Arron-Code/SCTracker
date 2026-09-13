import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { EuInformationSystemV3Provider, S3StorageProvider, SentinelHubProvider } from "./providers.js";
import { PgRepository } from "./repository.js";

const config = loadConfig();
const app = await buildApp({
  config,
  repository: PgRepository.connect(config.DATABASE_URL),
  providers: {
    storage: new S3StorageProvider(config),
    satellite: new SentinelHubProvider(config),
    dds: new EuInformationSystemV3Provider(config),
  },
});

await app.listen({ host: config.HOST, port: config.PORT });

const shutdown = async (): Promise<void> => {
  await app.close();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
