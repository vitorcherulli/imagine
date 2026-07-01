import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { getSocialPublicationForUser } from "@/lib/publication-server";
import {
  createSocialPublicationZip,
  socialExportFilename,
} from "@/lib/social-slide-export";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await getSocialPublicationForUser(params.id, userId);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const readySlides = data.slides.filter((s) => s.imageUrl);
  if (readySlides.length === 0) {
    return NextResponse.json({ error: "No slide images ready to export" }, { status: 400 });
  }

  try {
    const zip = await createSocialPublicationZip({
      project: data.project,
      slides: data.slides,
      metadata: data.metadata,
    });

    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${socialExportFilename(data.project)}"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      { status: 500 },
    );
  }
}
