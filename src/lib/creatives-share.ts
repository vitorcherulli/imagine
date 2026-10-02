import { randomBytes } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import type { Creative, CreativeShare } from "@/lib/db/schema";
import { toProductCode } from "@/lib/creatives";

export type ShareScope = "all" | "folder" | "concept";

export function isShareScope(v: unknown): v is ShareScope {
  return v === "all" || v === "folder" || v === "concept";
}

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export async function createShare(
  userId: string,
  scope: ShareScope,
  rawValue: string,
  expiresInDays: number | null,
): Promise<CreativeShare> {
  const c = schema.creatives;
  let scopeValue = "";
  if (scope === "folder") {
    scopeValue = toProductCode(rawValue);
    const [inside] = await db
      .select({ id: c.id })
      .from(c)
      .where(and(eq(c.userId, userId), eq(c.product, scopeValue)))
      .limit(1);
    if (!inside) throw new Error("This folder has no creatives to share");
  } else if (scope === "concept") {
    const code = Number(rawValue);
    const [inside] = Number.isInteger(code)
      ? await db.select({ id: c.id }).from(c).where(and(eq(c.userId, userId), eq(c.code, code))).limit(1)
      : [];
    if (!inside) throw new Error("Concept not found");
    scopeValue = String(code);
  }
  const days = expiresInDays && expiresInDays > 0 ? Math.min(expiresInDays, 365) : null;
  const row: CreativeShare = {
    id: createId(),
    userId,
    token: randomBytes(18).toString("base64url"),
    scope,
    scopeValue,
    expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null,
    views: 0,
    lastViewedAt: null,
    createdAt: new Date(),
  };
  await db.insert(schema.creativeShares).values(row);
  return row;
}

export async function listShares(userId: string): Promise<CreativeShare[]> {
  return db
    .select()
    .from(schema.creativeShares)
    .where(eq(schema.creativeShares.userId, userId))
    .orderBy(desc(schema.creativeShares.createdAt));
}

export async function deleteShare(userId: string, id: string): Promise<void> {
  await db
    .delete(schema.creativeShares)
    .where(and(eq(schema.creativeShares.userId, userId), eq(schema.creativeShares.id, id)));
}

/** The share behind a token, or null when unknown or expired. */
export async function resolveShare(token: string): Promise<CreativeShare | null> {
  if (!TOKEN_RE.test(token)) return null;
  const [share] = await db.select().from(schema.creativeShares).where(eq(schema.creativeShares.token, token));
  if (!share) return null;
  if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) return null;
  return share;
}

export async function recordShareView(id: string): Promise<void> {
  await db
    .update(schema.creativeShares)
    .set({ views: sql`${schema.creativeShares.views} + 1`, lastViewedAt: new Date() })
    .where(eq(schema.creativeShares.id, id));
}

function inScope(share: CreativeShare, c: Creative): boolean {
  if (c.userId !== share.userId) return false;
  if (share.scope === "concept") return c.code === Number(share.scopeValue);
  if (c.status === "archived") return false;
  return share.scope === "all" || c.product === share.scopeValue;
}

/** Files the link shows, newest concept first. Archived concepts stay hidden unless the link is for that concept. */
export async function sharedCreatives(share: CreativeShare): Promise<Creative[]> {
  const rows = await db
    .select()
    .from(schema.creatives)
    .where(eq(schema.creatives.userId, share.userId))
    .orderBy(desc(schema.creatives.code), desc(schema.creatives.version));
  return rows.filter((c) => inScope(share, c));
}

export async function sharedCreative(share: CreativeShare, id: string): Promise<Creative | null> {
  const [c] = await db
    .select()
    .from(schema.creatives)
    .where(and(eq(schema.creatives.userId, share.userId), eq(schema.creatives.id, id)));
  return c && inScope(share, c) ? c : null;
}

/** Whole buffer or the requested byte range, so videos can seek. */
export function mediaResponse(req: Request, buf: Buffer, mime: string, headers: Record<string, string>): NextResponse {
  const base = { "Content-Type": mime, "Accept-Ranges": "bytes", "X-Robots-Tag": "noindex", ...headers };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (m && (m[1] || m[2])) {
    const total = buf.length;
    const start = m[1] ? Number(m[1]) : Math.max(0, total - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
    if (start >= total || end < start) {
      return new NextResponse(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${total}` } });
    }
    const chunk = buf.subarray(start, end + 1);
    return new NextResponse(new Uint8Array(chunk), {
      status: 206,
      headers: { ...base, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(chunk.length) },
    });
  }
  return new NextResponse(new Uint8Array(buf), { headers: { ...base, "Content-Length": String(buf.length) } });
}
