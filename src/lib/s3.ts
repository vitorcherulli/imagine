import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import path from "node:path";

let client: S3Client | null = null;

export function isS3Enabled(): boolean {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKey =
    process.env.S3_ACCESS_KEY?.trim() || process.env.S3_ACCESS_KEY_ID?.trim();
  const secretKey =
    process.env.S3_SECRET_KEY?.trim() || process.env.S3_SECRET_ACCESS_KEY?.trim();
  return Boolean(endpoint && bucket && accessKey && secretKey);
}

export function s3Bucket(): string {
  return process.env.S3_BUCKET!.trim();
}

export function getS3Client(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || "auto",
      credentials: {
        accessKeyId:
          process.env.S3_ACCESS_KEY ||
          process.env.S3_ACCESS_KEY_ID ||
          "",
        secretAccessKey:
          process.env.S3_SECRET_KEY ||
          process.env.S3_SECRET_ACCESS_KEY ||
          "",
      },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    });
  }
  return client;
}

export function normalizeObjectKey(key: string): string {
  return key.replace(/^\/+/, "");
}

export function publicUrlForKey(key: string): string {
  const cleanKey = normalizeObjectKey(key);
  const publicBase = (
    process.env.S3_PUBLIC_URL ||
    process.env.S3_ENDPOINT ||
    ""
  ).replace(/\/$/, "");
  const bucket = s3Bucket();
  if (process.env.S3_FORCE_PATH_STYLE !== "false") {
    return `${publicBase}/${bucket}/${cleanKey}`;
  }
  return `${publicBase}/${cleanKey}`;
}

export function keyFromPublicUrl(publicUrl: string): string | null {
  const pathOnly = publicUrl.split("?")[0].split("#")[0];
  if (pathOnly.startsWith("/api/media/")) {
    return decodeURIComponent(pathOnly.slice("/api/media/".length));
  }
  if (pathOnly.startsWith("http://") || pathOnly.startsWith("https://")) {
    const url = new URL(pathOnly);
    const parts = url.pathname.split("/").filter(Boolean);
    const bucket = s3Bucket();
    if (parts[0] === bucket) {
      return parts.slice(1).join("/");
    }
    return parts.join("/");
  }
  if (pathOnly.startsWith("/")) {
    return pathOnly.slice(1);
  }
  return pathOnly || null;
}

export function isRemoteMediaUrl(publicUrl: string): boolean {
  return (
    publicUrl.startsWith("http://") || publicUrl.startsWith("https://")
  );
}

export function mimeFromFilename(filename: string): string {
  const ext = path.extname(filename).slice(1).toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "mp4") return "video/mp4";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "wav") return "audio/wav";
  if (ext === "m4a") return "audio/mp4";
  if (ext === "ass") return "text/plain";
  return "application/octet-stream";
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType?: string,
): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: s3Bucket(),
      Key: normalizeObjectKey(key),
      Body: body,
      ContentType: contentType ?? mimeFromFilename(key),
    }),
  );
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const res = await getS3Client().send(
    new GetObjectCommand({
      Bucket: s3Bucket(),
      Key: normalizeObjectKey(key),
    }),
  );
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await getS3Client().send(
      new HeadObjectCommand({
        Bucket: s3Bucket(),
        Key: normalizeObjectKey(key),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: s3Bucket(),
      Key: normalizeObjectKey(key),
    }),
  );
}

export async function deleteObjectsByPrefix(prefix: string): Promise<void> {
  let token: string | undefined;
  const normalized = normalizeObjectKey(prefix);
  do {
    const list = await getS3Client().send(
      new ListObjectsV2Command({
        Bucket: s3Bucket(),
        Prefix: normalized,
        ContinuationToken: token,
      }),
    );
    for (const obj of list.Contents ?? []) {
      if (obj.Key) await deleteObject(obj.Key);
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
}
