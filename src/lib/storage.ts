import fs from "node:fs/promises";
import path from "node:path";
import { openRouterHeaders } from "./openrouter/client";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const GENERATED_DIR = path.join(PUBLIC_DIR, "generated");

export async function ensureProjectDir(projectId: string, blockId?: string): Promise<string> {
  const dir = blockId
    ? path.join(GENERATED_DIR, projectId, blockId)
    : path.join(GENERATED_DIR, projectId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function ensureAvatarDir(userId: string, avatarId: string): Promise<string> {
  const dir = path.join(GENERATED_DIR, "_avatars", userId, avatarId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function saveAvatarBuffer(
  userId: string,
  avatarId: string,
  filename: string,
  buf: Buffer,
): Promise<string> {
  const dir = await ensureAvatarDir(userId, avatarId);
  const file = path.join(dir, filename);
  await fs.writeFile(file, buf);
  return publicUrlFor(file);
}

export async function readImageAsDataUrl(publicUrl: string): Promise<string> {
  const abs = absoluteFromPublicUrl(publicUrl);
  const buf = await fs.readFile(abs);
  const ext = path.extname(abs).slice(1).toLowerCase();
  const mime =
    ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "webp"
        ? "image/webp"
        : ext === "gif"
          ? "image/gif"
          : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export function publicUrlFor(absPath: string): string {
  const rel = path.relative(PUBLIC_DIR, absPath).split(path.sep).join("/");
  return "/" + rel;
}

export async function saveBuffer(
  projectId: string,
  blockId: string | null,
  filename: string,
  buf: Buffer,
): Promise<string> {
  const dir = await ensureProjectDir(projectId, blockId ?? undefined);
  const file = path.join(dir, filename);
  await fs.writeFile(file, buf);
  return publicUrlFor(file);
}

export async function saveBase64(
  projectId: string,
  blockId: string | null,
  filename: string,
  b64: string,
): Promise<string> {
  const cleaned = b64.includes(",") ? b64.split(",", 2)[1] : b64;
  return saveBuffer(projectId, blockId, filename, Buffer.from(cleaned, "base64"));
}

export async function downloadToFile(
  url: string,
  projectId: string,
  blockId: string | null,
  filename: string,
  opts: { withAuth?: boolean } = {},
): Promise<string> {
  const headers: HeadersInit = opts.withAuth ? openRouterHeaders() : {};
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Download failed ${res.status} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return saveBuffer(projectId, blockId, filename, buf);
}

export function absoluteFromPublicUrl(publicUrl: string): string {
  const pathOnly = publicUrl.split("?")[0].split("#")[0];
  const clean = pathOnly.startsWith("/") ? pathOnly.slice(1) : pathOnly;
  return path.join(PUBLIC_DIR, clean);
}

export function withCacheBuster(publicUrl: string): string {
  const [pathOnly, query = ""] = publicUrl.split("?");
  const params = new URLSearchParams(query);
  params.set("v", Date.now().toString());
  return `${pathOnly}?${params.toString()}`;
}
