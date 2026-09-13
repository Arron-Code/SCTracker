import pg from "pg";
import { randomUUID } from "node:crypto";
import { loadConfig } from "./config.js";

if (process.env.SC_ALLOW_DEV_SEED !== "true" || process.env.NODE_ENV === "production") {
  throw new Error("Development seed requires SC_ALLOW_DEV_SEED=true and is forbidden in production");
}

const config = loadConfig();
const client = new pg.Client({ connectionString: config.DATABASE_URL });
await client.connect();
try {
  const tenantId = "00000000-0000-4000-8000-000000000001";
  await client.query(
    `INSERT INTO tenants (id, name) VALUES ($1, 'SCTracker Demo')
     ON CONFLICT (id) DO NOTHING`,
    [tenantId],
  );
  await client.query(
    `INSERT INTO suppliers (id, tenant_id, status, payload)
     VALUES ($1, $2, 'active', $3::jsonb)`,
    [
      randomUUID(),
      tenantId,
      JSON.stringify({ name: "Demo Coffee Cooperative", countryCode: "ET", status: "active" }),
    ],
  );
  console.log(`Seeded development tenant ${tenantId}`);
} finally {
  await client.end();
}
