import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { clearMetrics, deleteMetricImport, importMetaCsv } from "@/lib/creatives-server";

export const dynamic = "force-dynamic";

const MAX_CSV_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose the CSV exported from Meta Ads Manager" }, { status: 400 });
  }
  if (file.size > MAX_CSV_BYTES) return NextResponse.json({ error: "CSV is larger than 10MB" }, { status: 400 });

  try {
    const result = await importMetaCsv(userId, await file.text(), file.name);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Import failed" }, { status: 400 });
  }
}

/** `?import=<id>` removes one period; without it every period is cleared. */
export async function DELETE(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const importId = req.nextUrl.searchParams.get("import");
  if (importId) await deleteMetricImport(userId, importId);
  else await clearMetrics(userId);
  return NextResponse.json({ ok: true });
}
