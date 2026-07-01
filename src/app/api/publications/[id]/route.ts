import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getSocialPublicationForUser } from "@/lib/publication-server";
import { clampSlideCount, normalizePostFormat, normalizePostKind } from "@/lib/social-content";
import { normalizeSocialAspectRatio } from "@/lib/social-aspect-ratio";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  storyDescription: z.string().min(1).max(4000).optional(),
  postFormat: z.enum(["carousel", "single"]).optional(),
  socialAspectRatio: z.enum(["4:5", "1:1"]).optional(),
  postKind: z
    .enum(["educational", "list", "quote", "promo", "story", "mixed"])
    .optional(),
  slideCount: z.number().int().min(1).max(10).optional(),
  socialUseAvatar: z.boolean().optional(),
  folderId: z.string().nullable().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await getSocialPublicationForUser(params.id, userId);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await getSocialPublicationForUser(params.id, userId);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await req.json();
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title != null) patch.title = parsed.data.title;
  if (parsed.data.storyDescription != null) patch.storyDescription = parsed.data.storyDescription;
  if (parsed.data.postFormat != null) patch.postFormat = normalizePostFormat(parsed.data.postFormat);
  if (parsed.data.socialAspectRatio != null) {
    patch.socialAspectRatio = normalizeSocialAspectRatio(parsed.data.socialAspectRatio);
  }
  if (parsed.data.postKind != null) patch.postKind = normalizePostKind(parsed.data.postKind);
  if (parsed.data.socialUseAvatar != null) patch.socialUseAvatar = parsed.data.socialUseAvatar;
  if (parsed.data.folderId !== undefined) patch.folderId = parsed.data.folderId;

  if (parsed.data.slideCount != null || parsed.data.postFormat != null) {
    const postFormat = normalizePostFormat(
      parsed.data.postFormat ?? data.project.postFormat,
    );
    patch.slideCount = clampSlideCount(
      parsed.data.slideCount ?? data.project.slideCount ?? 7,
      postFormat,
    );
  }

  await db
    .update(schema.projects)
    .set(patch)
    .where(and(eq(schema.projects.id, params.id), eq(schema.projects.userId, userId)));

  const updated = await getSocialPublicationForUser(params.id, userId);
  return NextResponse.json(updated);
}
