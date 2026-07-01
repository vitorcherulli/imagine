import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getObjectBuffer, isS3Enabled, mimeFromFilename, objectExists } from "@/lib/s3";

export const dynamic = "force-dynamic";

const PUBLIC_DIR = path.join(process.cwd(), "public");

async function loadGeneratedMedia(key: string): Promise<Buffer | null> {
  if (!key.startsWith("generated/")) return null;
  try {
    if (isS3Enabled()) {
      if (!(await objectExists(key))) return null;
      return getObjectBuffer(key);
    }
    return fs.readFile(path.join(PUBLIC_DIR, key));
  } catch {
    return null;
  }
}

async function sizeFor(key: string, buf: Buffer): Promise<number> {
  if (buf.length > 0) return buf.length;
  try {
    if (!isS3Enabled()) {
      const stat = await fs.stat(path.join(PUBLIC_DIR, key));
      return stat.size;
    }
  } catch {
    // ignore
  }
  return buf.length;
}

function parseRange(rangeHeader: string | null, total: number): { start: number; end: number } | null {
  if (!rangeHeader || !rangeHeader.startsWith("bytes=")) return null;
  const spec = rangeHeader.slice("bytes=".length).trim();
  const [startStr, endStr] = spec.split("-");
  const start = startStr ? parseInt(startStr, 10) : NaN;
  const end = endStr ? parseInt(endStr, 10) : NaN;
  if (Number.isNaN(start) && Number.isNaN(end)) return null;
  // `bytes=-N` → last N bytes
  if (Number.isNaN(start)) {
    const suffix = Math.max(0, end);
    const s = Math.max(0, total - suffix);
    return { start: s, end: total - 1 };
  }
  if (start < 0 || start >= total) return null;
  // `bytes=N-` → from N to end
  if (Number.isNaN(end)) return { start, end: total - 1 };
  if (end < start) return null;
  return { start, end: Math.min(end, total - 1) };
}

export async function HEAD(
  _req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const key = params.path.map(decodeURIComponent).join("/");
  if (!key.startsWith("generated/")) {
    return new NextResponse(null, { status: 404 });
  }

  const exists = isS3Enabled()
    ? await objectExists(key)
    : await fs
        .access(path.join(PUBLIC_DIR, key))
        .then(() => true)
        .catch(() => false);

  if (!exists) return new NextResponse(null, { status: 404 });

  return new NextResponse(null, {
    status: 200,
    headers: {
      "Content-Type": mimeFromFilename(key),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Accept-Ranges": "bytes",
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  try {
    const key = params.path.map(decodeURIComponent).join("/");
    const body = await loadGeneratedMedia(key);
    if (!body) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const total = await sizeFor(key, body);
    const range = parseRange(req.headers.get("range"), total);
    const contentType = mimeFromFilename(key);

    // Always advertise range support so the player knows it can seek.
    const baseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Accept-Ranges": "bytes",
    };

    if (range) {
      const { start, end } = range;
      const chunk = body.subarray(start, end + 1);
      return new NextResponse(new Uint8Array(chunk), {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Content-Length": String(chunk.length),
        },
      });
    }

    return new NextResponse(new Uint8Array(body), {
      headers: {
        ...baseHeaders,
        "Content-Length": String(total),
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not read media" }, { status: 404 });
  }
}
