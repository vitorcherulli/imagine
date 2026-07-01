import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tryUser } from "@/lib/auth";
import { getSocialSlideForUser, setSocialSlideFields } from "@/lib/publication-server";
import { runSocialSlideImageGeneration } from "@/lib/social-slide-generate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const patchSchema = z.object({
  headline: z.string().max(200).optional(),
  bodyText: z.string().max(1000).optional(),
  visualPrompt: z.string().max(4000).optional(),
  position: z.number().int().min(0).max(20).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await getSocialSlideForUser(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await req.json();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await setSocialSlideFields(params.id, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await getSocialSlideForUser(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  void runSocialSlideImageGeneration({
    project: owned.project,
    slide: owned.slide,
  }).catch(() => {});

  return NextResponse.json({ ok: true, status: "generating" });
}
