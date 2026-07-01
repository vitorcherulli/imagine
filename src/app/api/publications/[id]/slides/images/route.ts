import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { getSocialPublicationForUser } from "@/lib/publication-server";
import { runSocialSlideImageGeneration } from "@/lib/social-slide-generate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await getSocialPublicationForUser(params.id, userId);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (data.slides.length === 0) {
    return NextResponse.json({ error: "Generate slide structure first" }, { status: 400 });
  }

  void (async () => {
    for (const slide of data.slides) {
      try {
        await runSocialSlideImageGeneration({ project: data.project, slide });
      } catch {
        // status stored on slide
      }
    }
  })();

  return NextResponse.json({ ok: true, status: "generating" });
}
