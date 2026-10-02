import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tryUser } from "@/lib/auth";
import { getSocialPublicationForUser, getSocialSlideForUser } from "@/lib/publication-server";
import { generateSlideTitleOptions } from "@/lib/social-titles-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  instruction: z.string().max(300).optional(),
});

/** Six on-image text options (lead, headline, body) for one slide. Nothing is saved. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await getSocialSlideForUser(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const publication = await getSocialPublicationForUser(owned.project.id, userId);
  try {
    const options = await generateSlideTitleOptions({
      project: owned.project,
      slide: owned.slide,
      slides: publication?.slides ?? [owned.slide],
      instruction: parsed.data.instruction,
    });
    return NextResponse.json({ options });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not write titles" },
      { status: 500 },
    );
  }
}
