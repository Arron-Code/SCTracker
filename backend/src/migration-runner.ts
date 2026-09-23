import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const migrationLockId = 736_287_421;

export async function runMigrations(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  let locked = false;
  try {
    await client.query("SELECT pg_advisory_lock($1)", [migrationLockId]);
    locked = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      DELETE FROM schema_migrations
      WHERE name = '004_identity_trust_registry.sql'
        AND (
          to_regclass('public.organization_users') IS NULL
          OR to_regclass('public.organization_devices') IS NULL
          OR to_regclass('public.organization_signing_keys') IS NULL
          OR to_regclass('public.organization_trust_state') IS NULL
          OR to_regclass('public.organization_trust_history') IS NULL
        )
    `);

    const directory = new URL("../migrations/", import.meta.url);
    for (const name of (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort()) {
      const existing = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
      if (existing.rowCount) continue;
      const sql = await readFile(fileURLToPath(new URL(name, directory)), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
        console.log(`Applied ${name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock($1)", [migrationLockId]);
    }
    await client.end();
  }
}
