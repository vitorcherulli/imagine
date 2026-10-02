import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import type { Creative } from "@/lib/db/schema";
import { readMediaBuffer } from "@/lib/storage";
import { buildAdName, type CreativeFormat } from "@/lib/creatives";
import { creativeFileName } from "@/lib/creatives-server";

/** Every size of one version as a ZIP named after the Meta ad, with the ad name in a text file. */
export async function versionZipResponse(files: Creative[]): Promise<NextResponse> {
  const head = files[0];
  const adName = buildAdName({ ...head, format: head.format as CreativeFormat });
  const archiver = (await import("archiver")).default;
  const archive = archiver("zip", { store: true });
  for (const f of files) archive.append(await readMediaBuffer(f.fileUrl), { name: creativeFileName(f) });
  const info = [`Ad name: ${adName}`];
  if (head.hook) info.push(`Hook: ${head.hook}`);
  info.push(`Sizes: ${files.map((f) => f.aspectRatio.replace("x", ":")).join(", ")}`);
  info.push("", "Use the ad name above in Meta so results can be matched back to this creative.");
  archive.append(info.join("\n"), { name: "ad-name.txt" });
  void archive.finalize();

  return new NextResponse(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${adName}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** The asked version (or the latest) of a concept's files. */
export function pickVersion(files: Creative[], asked: string | null): Creative[] {
  if (!files.length) return [];
  const n = Number(asked);
  const version = Number.isInteger(n) && n > 0 ? n : Math.max(...files.map((f) => f.version));
  return files.filter((f) => f.version === version);
}
