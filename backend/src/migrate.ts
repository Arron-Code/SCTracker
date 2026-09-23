import { loadConfig } from "./config.js";
import { runMigrations } from "./migration-runner.js";

const config = loadConfig();
await runMigrations(config.DATABASE_URL);
