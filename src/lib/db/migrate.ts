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

async function main(): Promise<void> {
  const url = databaseUrl();

  if (isPostgresUrl(url)) {
    const client = postgres(url, { max: 1 });
    const db = drizzlePostgres(client, { schema: pgSchema });
    console.log("Applying migrations to PostgreSQL...");
    await migratePostgres(db, { migrationsFolder: "./drizzle/pg" });
    await client.end();
    console.log("PostgreSQL migrations applied.");
    return;
  }

  const dataDir = path.dirname(url);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const sqlite = new Database(url);
  const db = drizzleSqlite(sqlite, { schema: sqliteSchema });
  console.log(`Applying migrations to SQLite ${url}...`);
  migrateSqlite(db, { migrationsFolder: "./drizzle" });
  sqlite.close();
  console.log("SQLite migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
