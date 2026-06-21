export function isPostgresUrl(url: string): boolean {
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? "./data/app.db";
}
