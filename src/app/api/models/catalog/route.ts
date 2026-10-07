import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { filterSwapCapable, filterVariationCapable, getModelCatalog } from "@/lib/model-catalog-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const kind = req.nextUrl.searchParams.get("kind");
  if (kind !== "image" && kind !== "video") {
    return NextResponse.json({ error: "kind must be image or video" }, { status: 400 });
  }
  const models = await getModelCatalog(kind);
  const usage = req.nextUrl.searchParams.get("for");
  return NextResponse.json({
    models:
      usage === "variations"
        ? filterVariationCapable(kind, models)
        : usage === "swap" && kind === "video"
          ? filterSwapCapable(models)
          : models,
  });
}
