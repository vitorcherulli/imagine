import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import path from "node:path";
import fs from "node:fs";
import * as sqliteSchema from "./schema";
import * as pgSchema from "./schema-pg";
import { databaseUrl, isPostgresUrl } from "./url";
import { applySqliteSchemaHotfixes } from "./sqlite-hotfixes";

const url = databaseUrl();
const usePostgres = isPostgresUrl(url);

function createDb() {
  if (usePostgres) {
    const client = postgres(url);
    return drizzlePostgres(client, { schema: pgSchema });
  }

  const dataDir = path.dirname(url);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const sqlite = new Database(url);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  applySqliteSchemaHotfixes(sqlite);
  return drizzleSqlite(sqlite, { schema: sqliteSchema });
}

export const db = createDb() as ReturnType<typeof drizzleSqlite<typeof sqliteSchema>>;
export const schema: typeof sqliteSchema = (
  usePostgres ? pgSchema : sqliteSchema
) as typeof sqliteSchema;
