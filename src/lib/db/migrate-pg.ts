import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as pgSchema from "./schema-pg";
import { applyPgSchemaHotfixes } from "./pg-hotfixes";
import { databaseUrl, isPostgresUrl } from "./url";

async function main(): Promise<void> {
  const url = databaseUrl();
  if (!isPostgresUrl(url)) {
    console.log("Skipping PostgreSQL migrations (DATABASE_URL is not postgres).");
    return;
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema: pgSchema });
  console.log("Applying migrations to PostgreSQL...");
  await migrate(db, { migrationsFolder: "./drizzle/pg" });
  console.log("Applying PostgreSQL schema hotfixes...");
  await applyPgSchemaHotfixes(client);
  await client.end();
  console.log("PostgreSQL migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
