import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { readMediaBuffer } from "@/lib/storage";
import { getOwnedPhotoBatch, listPhotoBatchItems } from "@/lib/photo-batch-server";
import { editedFileName } from "@/lib/photo-batch";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "batch";
}

/** `?scope=approved` (default) or `?scope=edited` for every finished photo. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const batch = await getOwnedPhotoBatch(params.id, userId);
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const onlyApproved = req.nextUrl.searchParams.get("scope") !== "edited";
  const items = (await listPhotoBatchItems(batch.id)).filter(
    (i) => i.status === "ready" && i.resultUrl && (!onlyApproved || i.approved),
  );
  if (items.length === 0) {
    return NextResponse.json(
      { error: onlyApproved ? "No approved photos yet" : "No edited photos yet" },
      { status: 400 },
    );
  }

  const archiver = (await import("archiver")).default;
  const archive = archiver("zip", { store: true });
  const used = new Set<string>();
  for (const item of items) {
    let name = editedFileName(item.originalName);
    for (let n = 2; used.has(name); n++) name = editedFileName(`${item.originalName.replace(/\.[^.]+$/, "")}-${n}`);
    used.add(name);
    archive.append(await readMediaBuffer(item.resultUrl!), { name });
  }
  void archive.finalize();

  return new NextResponse(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug(batch.name)}-${onlyApproved ? "approved" : "edited"}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
