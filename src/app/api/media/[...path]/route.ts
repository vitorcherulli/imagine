import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getObjectBuffer, isS3Enabled, mimeFromFilename, objectExists } from "@/lib/s3";

export const dynamic = "force-dynamic";

const PUBLIC_DIR = path.join(process.cwd(), "public");

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const key = params.path.map(decodeURIComponent).join("/");
  if (!key.startsWith("generated/")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    let body: Buffer;
    if (isS3Enabled()) {
      if (!(await objectExists(key))) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      body = await getObjectBuffer(key);
    } else {
      const abs = path.join(PUBLIC_DIR, key);
      body = await fs.readFile(abs);
    }
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": mimeFromFilename(key),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
