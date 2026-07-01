import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { createId } from "@paralleldrive/cuid2";
import {
  convertImageBufferToJpeg,
  detectImageExt,
  extractFirstFrameFromVideoBuffer,
  isJpegBuffer,
  isPngBuffer,
  isVideoMp4Buffer,
} from "./ffmpeg";
import { openRouterHeaders } from "./openrouter/client";
import {
  deleteObjectsByPrefix,
  deleteObject,
  getObjectBuffer,
  isRemoteMediaUrl,
  isS3Enabled,
  keyFromPublicUrl,
  mimeFromFilename,
  normalizeObjectKey,
  objectExists,
  publicUrlForKey,
  putObject,
} from "./s3";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const GENERATED_DIR = path.join(PUBLIC_DIR, "generated");
const MEDIA_CACHE_DIR = path.join(os.tmpdir(), "imagine-media-cache");

function mediaUrlForKey(key: string): string {
  return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

async function writeBytes(key: string, buf: Buffer): Promise<string> {
  if (isS3Enabled()) {
    await putObject(key, buf, mimeFromFilename(key));
    return mediaUrlForKey(key);
  }
  const abs = path.join(PUBLIC_DIR, key);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buf);
  return mediaUrlForKey(key);
}

export async function ensureLocalWorkDir(
  projectId: string,
  blockId?: string,
): Promise<string> {
  const dir = blockId
    ? path.join(MEDIA_CACHE_DIR, "work", projectId, blockId)
    : path.join(MEDIA_CACHE_DIR, "work", projectId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Isolated temp dir for one ffmpeg pass — avoids races on shared work/{blockId}. */
export async function ensureVideoProcessingDir(
  projectId: string,
  blockId: string,
): Promise<string> {
  const dir = path.join(MEDIA_CACHE_DIR, "work", projectId, blockId, createId());
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function assertReadableMediaFile(
  filePath: string,
  label = "media file",
): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size < 64) {
      throw new Error(`${label} is missing or empty (${filePath})`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("missing or empty")) throw err;
    throw new Error(`${label} not found (${filePath})`);
  }
}

async function readLocalFileHeader(filePath: string, maxBytes = 512): Promise<Buffer> {
  const fh = await fs.open(filePath, "r");
  try {
    const buf = Buffer.alloc(maxBytes);
    const { bytesRead } = await fh.read(buf, 0, maxBytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

/** First bytes of a project media URL — used to detect corrupt or mislabeled files. */
export async function readMediaHeader(
  publicUrl: string,
  maxBytes = 512,
): Promise<Buffer> {
  const pathOnly = publicUrl.split("?")[0].split("#")[0];
  if (pathOnly.startsWith("/api/media/")) {
    const key = decodeURIComponent(pathOnly.slice("/api/media/".length));
    if (isS3Enabled()) {
      const buf = await getObjectBuffer(key);
      return buf.subarray(0, Math.min(buf.length, maxBytes));
    }
    return readLocalFileHeader(path.join(PUBLIC_DIR, key), maxBytes);
  }
  if (isRemoteMediaUrl(publicUrl) && isS3Enabled()) {
    const key = keyFromPublicUrl(publicUrl);
    if (!key) throw new Error(`Invalid media URL: ${publicUrl}`);
    const buf = await getObjectBuffer(key);
    return buf.subarray(0, Math.min(buf.length, maxBytes));
  }
  if (isRemoteMediaUrl(publicUrl)) {
    const res = await fetch(publicUrl, {
      headers: { Range: `bytes=0-${maxBytes - 1}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch ${publicUrl}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readLocalFileHeader(localAbsoluteFromPublicUrl(pathOnly), maxBytes);
}

export function isValidImageMediaBuffer(buffer: Buffer): boolean {
  return detectImageExt(buffer) !== null;
}

export function isValidVideoMediaBuffer(buffer: Buffer): boolean {
  return isVideoMp4Buffer(buffer);
}

export async function isValidImageMediaUrl(publicUrl: string): Promise<boolean> {
  if (!(await mediaFileExists(publicUrl))) return false;
  try {
    const header = await readMediaHeader(publicUrl);
    return header.length >= 12 && isValidImageMediaBuffer(header);
  } catch {
    return false;
  }
}

export async function isValidVideoMediaUrl(publicUrl: string): Promise<boolean> {
  if (!(await mediaFileExists(publicUrl))) return false;
  try {
    const header = await readMediaHeader(publicUrl);
    return header.length >= 12 && isValidVideoMediaBuffer(header);
  } catch {
    return false;
  }
}

function mediaUrlBasename(publicUrl: string): string {
  const pathOnly = publicUrl.split("?")[0].split("#")[0] ?? "";
  return pathOnly.split("/").pop() ?? publicUrl;
}

export async function describeMediaUrlIssue(publicUrl: string): Promise<string | null> {
  if (!(await mediaFileExists(publicUrl))) return "missing";
  try {
    const header = await readMediaHeader(publicUrl);
    if (header.length < 12) return "empty or truncated";
    const name = mediaUrlBasename(publicUrl);
    if (/\.(mp4|mov|webm)$/i.test(name) && !isValidVideoMediaBuffer(header)) {
      return "not a valid video file";
    }
    if (/\.(jpe?g|png|webp|gif|avif|heic)$/i.test(name) && !isValidImageMediaBuffer(header)) {
      return "not a valid image file";
    }
    return null;
  } catch {
    return "unreadable";
  }
}

export async function ensureProjectDir(projectId: string, blockId?: string): Promise<string> {
  if (isS3Enabled()) {
    return ensureLocalWorkDir(projectId, blockId);
  }
  const rel = blockId
    ? path.join("generated", projectId, blockId)
    : path.join("generated", projectId);
  const dir = path.join(PUBLIC_DIR, rel);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function ensureAvatarDir(userId: string, avatarId: string): Promise<string> {
  const rel = path.join("generated", "_avatars", userId, avatarId);
  if (isS3Enabled()) {
    return rel;
  }
  const dir = path.join(PUBLIC_DIR, rel);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function ensureProjectDnaDir(userId: string, dnaId: string): Promise<string> {
  const rel = path.join("generated", "_project-dna", userId, dnaId);
  if (isS3Enabled()) {
    return rel;
  }
  const dir = path.join(PUBLIC_DIR, rel);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function saveAvatarBuffer(
  userId: string,
  avatarId: string,
  filename: string,
  buf: Buffer,
): Promise<string> {
  const key = path.posix.join("generated", "_avatars", userId, avatarId, filename);
  return writeBytes(key, buf);
}

export async function saveProjectDnaLogoBuffer(
  userId: string,
  dnaId: string,
  filename: string,
  buf: Buffer,
): Promise<string> {
  const key = path.posix.join("generated", "_project-dna", userId, dnaId, filename);
  return writeBytes(key, buf);
}

export async function saveGalleryBuffer(
  userId: string,
  filename: string,
  buf: Buffer,
): Promise<string> {
  const key = path.posix.join("generated", "_gallery", userId, filename);
  return writeBytes(key, buf);
}

export async function readImageAsDataUrl(publicUrl: string): Promise<string> {
  let buf: Buffer;
  const pathOnly = publicUrl.split("?")[0].split("#")[0];
  if (pathOnly.startsWith("/api/media/")) {
    const key = decodeURIComponent(pathOnly.slice("/api/media/".length));
    if (isS3Enabled()) {
      buf = await getObjectBuffer(key);
    } else {
      buf = await fs.readFile(path.join(PUBLIC_DIR, key));
    }
  } else if (isRemoteMediaUrl(publicUrl) && isS3Enabled()) {
    const key = keyFromPublicUrl(publicUrl);
    if (!key) throw new Error(`Invalid media URL: ${publicUrl}`);
    buf = await getObjectBuffer(key);
  } else if (isRemoteMediaUrl(publicUrl)) {
    const res = await fetch(publicUrl);
    if (!res.ok) throw new Error(`Failed to fetch ${publicUrl}`);
    buf = Buffer.from(await res.arrayBuffer());
  } else {
    buf = await fs.readFile(localAbsoluteFromPublicUrl(publicUrl));
  }

  const ext = path.extname(pathOnly).slice(1).toLowerCase();
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

function publicAppBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return null;
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return null;
    }
    return raw.replace(/\/$/, "");
  } catch {
    return null;
  }
}

/**
 * Prepare a keyframe for Kling / OpenRouter image-to-video.
 * Prefers a public HTTPS media URL when the stored file is already JPEG/PNG;
 * otherwise returns a JPEG data URL (WebP/GIF and other formats are converted).
 */
export async function readImageAsVideoFrameUrl(publicUrl: string): Promise<string> {
  const pathOnly = publicUrl.split("?")[0]?.split("#")[0] ?? publicUrl;
  const urlExt = path.extname(pathOnly).toLowerCase() || undefined;
  const buf = await readMediaBuffer(publicUrl);

  if (isVideoMp4Buffer(buf)) {
    const jpeg = await extractFirstFrameFromVideoBuffer(buf);
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  }

  const detectedExt = detectImageExt(buf);
  const needsConversion =
    detectedExt === ".webp" ||
    detectedExt === ".gif" ||
    urlExt === ".webp" ||
    urlExt === ".gif";

  const base = publicAppBaseUrl();
  const storedIsVideoSafe =
    ((urlExt === ".jpg" || urlExt === ".jpeg") && isJpegBuffer(buf)) ||
    (urlExt === ".png" && isPngBuffer(buf));

  if (base && pathOnly.startsWith("/api/media/") && storedIsVideoSafe && !needsConversion) {
    return `${base}${pathOnly}`;
  }

  const jpeg = await convertImageBufferToJpeg({ buffer: buf, ext: detectedExt ?? urlExt });
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

/** Load raw bytes for a project media URL (`/api/media/...` or local generated path). */
export async function readMediaBuffer(publicUrl: string): Promise<Buffer> {
  const pathOnly = publicUrl.split("?")[0].split("#")[0];
  if (pathOnly.startsWith("/api/media/")) {
    const key = decodeURIComponent(pathOnly.slice("/api/media/".length));
    if (isS3Enabled()) {
      return getObjectBuffer(key);
    }
    return fs.readFile(path.join(PUBLIC_DIR, key));
  }
  if (isRemoteMediaUrl(publicUrl) && isS3Enabled()) {
    const key = keyFromPublicUrl(publicUrl);
    if (!key) throw new Error(`Invalid media URL: ${publicUrl}`);
    return getObjectBuffer(key);
  }
  if (isRemoteMediaUrl(publicUrl)) {
    const res = await fetch(publicUrl);
    if (!res.ok) throw new Error(`Failed to fetch ${publicUrl}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return fs.readFile(localAbsoluteFromPublicUrl(publicUrl));
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
  const key = blockId
    ? path.posix.join("generated", projectId, blockId, filename)
    : path.posix.join("generated", projectId, filename);
  return writeBytes(key, buf);
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

function localAbsoluteFromPublicUrl(publicUrl: string): string {
  const pathOnly = publicUrl.split("?")[0].split("#")[0];
  if (pathOnly.startsWith("/api/media/")) {
    const key = decodeURIComponent(pathOnly.slice("/api/media/".length));
    return path.join(PUBLIC_DIR, key);
  }
  const clean = pathOnly.startsWith("/") ? pathOnly.slice(1) : pathOnly;
  return path.join(PUBLIC_DIR, clean);
}

export async function resolveMediaPath(publicUrl: string): Promise<string> {
  const pathOnly = publicUrl.split("?")[0].split("#")[0];
  if (pathOnly.startsWith("/api/media/")) {
    const key = decodeURIComponent(pathOnly.slice("/api/media/".length));
    if (key.startsWith("work/")) {
      throw new Error(
        `Invalid media URL (temporary work file): ${publicUrl}. Regenerate the block video.`,
      );
    }
    const cachePath = path.join(MEDIA_CACHE_DIR, key);
    try {
      const stat = await fs.stat(cachePath);
      if (stat.isFile() && stat.size >= 64) return cachePath;
    } catch {
      // cache miss or stale
    }
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    const buf = isS3Enabled()
      ? await getObjectBuffer(key)
      : await fs.readFile(path.join(PUBLIC_DIR, key));
    if (buf.length < 64) {
      throw new Error(`Media file is empty for ${publicUrl}`);
    }
    await fs.writeFile(cachePath, buf);
    return cachePath;
  }
  if (isRemoteMediaUrl(pathOnly)) {
    const key = keyFromPublicUrl(pathOnly);
    if (!key) throw new Error(`Cannot resolve media URL: ${publicUrl}`);
    const cachePath = path.join(MEDIA_CACHE_DIR, key);
    try {
      const stat = await fs.stat(cachePath);
      if (stat.isFile() && stat.size >= 64) return cachePath;
    } catch {
      // cache miss or stale
    }
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    const buf = isS3Enabled()
      ? await getObjectBuffer(key)
      : Buffer.from(await (await fetch(pathOnly)).arrayBuffer());
    if (buf.length < 64) {
      throw new Error(`Media file is empty for ${publicUrl}`);
    }
    await fs.writeFile(cachePath, buf);
    return cachePath;
  }
  return localAbsoluteFromPublicUrl(pathOnly);
}

/** @deprecated use resolveMediaPath */
export function absoluteFromPublicUrl(publicUrl: string): string {
  return localAbsoluteFromPublicUrl(publicUrl);
}

export async function mediaFileExists(publicUrl: string | null | undefined): Promise<boolean> {
  if (!publicUrl) return false;
  try {
    const pathOnly = publicUrl.split("?")[0].split("#")[0];
    if (pathOnly.startsWith("/api/media/")) {
      const key = decodeURIComponent(pathOnly.slice("/api/media/".length));
      if (isS3Enabled()) return objectExists(key);
      return fsSync.existsSync(path.join(PUBLIC_DIR, key));
    }
    if (isRemoteMediaUrl(pathOnly) && isS3Enabled()) {
      const key = keyFromPublicUrl(pathOnly);
      return key ? objectExists(key) : false;
    }
    if (isRemoteMediaUrl(pathOnly)) {
      const res = await fetch(pathOnly, { method: "HEAD" });
      return res.ok;
    }
    return fsSync.existsSync(localAbsoluteFromPublicUrl(pathOnly));
  } catch {
    return false;
  }
}

export function withCacheBuster(publicUrl: string): string {
  const [pathOnly, query = ""] = publicUrl.split("?");
  const params = new URLSearchParams(query);
  params.set("v", Date.now().toString());
  return `${pathOnly}?${params.toString()}`;
}

export async function deleteMediaByPublicUrl(
  publicUrl: string | null | undefined,
): Promise<void> {
  if (!publicUrl) return;
  const key = keyFromPublicUrl(publicUrl.split("?")[0].split("#")[0]);
  if (!key) return;
  await deleteMediaByKey(key);
}

export async function deleteMediaByKey(key: string): Promise<void> {
  const normalized = normalizeObjectKey(key);
  if (isS3Enabled()) {
    await deleteObject(normalized);
  } else {
    try {
      await fs.unlink(path.join(PUBLIC_DIR, normalized));
    } catch {
      // missing local file
    }
  }
  try {
    await fs.unlink(path.join(MEDIA_CACHE_DIR, normalized));
  } catch {
    // missing cache file
  }
}

export async function deleteMediaPrefix(prefix: string): Promise<void> {
  const normalized = normalizeObjectKey(prefix);
  if (isS3Enabled()) {
    await deleteObjectsByPrefix(normalized);
  } else {
    try {
      await fs.rm(path.join(PUBLIC_DIR, normalized), { recursive: true, force: true });
    } catch {
      // missing local dir
    }
  }
  try {
    await fs.rm(path.join(MEDIA_CACHE_DIR, normalized), { recursive: true, force: true });
  } catch {
    // missing cache dir
  }
}

export async function deleteAvatarMedia(
  userId: string,
  avatarId: string,
  imageUrlsJson?: string | null,
): Promise<void> {
  if (imageUrlsJson) {
    try {
      const urls = JSON.parse(imageUrlsJson) as string[];
      if (Array.isArray(urls)) {
        await Promise.all(urls.map((url) => deleteMediaByPublicUrl(url)));
      }
    } catch {
      // ignore bad json
    }
  }
  await deleteMediaPrefix(path.posix.join("generated", "_avatars", userId, avatarId));
}

export async function deleteProjectDnaMedia(
  userId: string,
  dnaId: string,
  logoUrl?: string | null,
): Promise<void> {
  await deleteMediaByPublicUrl(logoUrl);
  await deleteMediaPrefix(path.posix.join("generated", "_project-dna", userId, dnaId));
}

export async function deleteBlockMedia(projectId: string, blockId: string): Promise<void> {
  await deleteMediaPrefix(path.posix.join("generated", projectId, blockId));
}

export async function deleteProjectMedia(projectId: string): Promise<void> {
  await deleteMediaPrefix(path.posix.join("generated", projectId));
}
