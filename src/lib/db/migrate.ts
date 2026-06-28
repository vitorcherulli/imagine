import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { migrate as migrateSqlite } from "drizzle-orm/better-sqlite3/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";
import * as sqliteSchema from "./schema";
import * as pgSchema from "./schema-pg";
import { databaseUrl, isPostgresUrl } from "./url";
import { applyPgSchemaHotfixes } from "./pg-hotfixes";
import { applySqliteSchemaHotfixes } from "./sqlite-hotfixes";

async function main(): Promise<void> {
  const url = databaseUrl();

  if (isPostgresUrl(url)) {
    const client = postgres(url, { max: 1 });
    const db = drizzlePostgres(client, { schema: pgSchema });
    console.log("Applying migrations to PostgreSQL...");
    await migratePostgres(db, { migrationsFolder: "./drizzle/pg" });
    console.log("Applying PostgreSQL schema hotfixes...");
    await applyPgSchemaHotfixes(client);
    await client.end();
    console.log("PostgreSQL migrations applied.");
    return;
  }

  const dataDir = path.dirname(url);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const sqlite = new Database(url);
  const db = drizzleSqlite(sqlite, { schema: sqliteSchema });
  console.log(`Applying migrations to SQLite ${url}...`);
  try {
    migrateSqlite(db, { migrationsFolder: "./drizzle" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("duplicate column")) throw err;
    console.warn("Migration skipped duplicate column — applying hotfixes instead.");
  }
  console.log("Applying SQLite schema hotfixes...");
  applySqliteSchemaHotfixes(sqlite);
  sqlite.close();
  console.log("SQLite migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
