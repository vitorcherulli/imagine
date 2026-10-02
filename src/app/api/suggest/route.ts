import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { normalizeProjectScriptLanguage } from "@/lib/project-language";
import { tryUser } from "@/lib/auth";
import { resolveProjectIdentityForProject } from "@/lib/project-dna-server";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { SOCIAL_ASPECT_RATIO_IDS } from "@/lib/social-aspect-ratio";
import { POST_KIND_IDS } from "@/lib/social-content";
import {
  generateAiStoryIdeas,
  rankTopStoryPicks,
  runTrendStoryIdeas,
} from "@/lib/story-suggestions-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  genre: z.string().min(1),
  visualStyle: z.string().min(1),
  voiceTone: z.string().min(1),
  targetDurationSeconds: z.number().int().min(15).max(1800).optional(),
  videoFormat: z.enum(["horizontal", "vertical"]).optional(),
  projectDnaId: z.string().nullable().optional(),
  scriptLanguage: z.enum(["en", "pt", "es"]).optional(),
  contentType: z.enum(["video", "social"]).optional(),
  postFormat: z.enum(["carousel", "single"]).optional(),
  postKind: z.enum(POST_KIND_IDS).optional(),
  slideCount: z.number().int().min(1).max(10).optional(),
  socialAspectRatio: z.enum(SOCIAL_ASPECT_RATIO_IDS).optional(),
  referenceNotes: z.string().max(12000).optional(),
  referenceMode: z.enum(["inspire", "copy"]).optional(),
  /** Skip web trends and ranking — just the AI ideas. */
  ideasOnly: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  let projectIdentity: string | undefined;
  if (parsed.data.projectDnaId) {
    const [projectLike] = await db
      .select()
      .from(schema.projectDna)
      .where(
        and(eq(schema.projectDna.id, parsed.data.projectDnaId), eq(schema.projectDna.userId, userId)),
      )
      .limit(1);
    if (projectLike) {
      projectIdentity = await resolveProjectIdentityForProject({
        userId,
        projectDnaId: parsed.data.projectDnaId,
        projectIdentity: "",
      });
    }
  }

  const scriptLanguage = normalizeProjectScriptLanguage(parsed.data.scriptLanguage);
  const suggestInput = {
    genre: parsed.data.genre,
    visualStyle: parsed.data.visualStyle,
    voiceTone: parsed.data.voiceTone,
    targetDurationSeconds: parsed.data.targetDurationSeconds ?? 30,
    videoFormat: parsed.data.videoFormat,
    projectIdentity,
    scriptLanguage,
    contentType: parsed.data.contentType,
    postFormat: parsed.data.postFormat,
    postKind: parsed.data.postKind,
    slideCount: parsed.data.slideCount,
    socialAspectRatio: parsed.data.socialAspectRatio,
    referenceNotes: parsed.data.referenceNotes,
    referenceMode: parsed.data.referenceNotes ? parsed.data.referenceMode : undefined,
  };

  try {
    if (suggestInput.referenceMode === "copy" || parsed.data.ideasOnly) {
      const aiIdeas = await generateAiStoryIdeas(suggestInput);
      return NextResponse.json({ aiIdeas, trendIdeas: [], topPicks: [], trendsMeta: null, ideas: aiIdeas });
    }
    const [aiIdeas, trendResult] = await Promise.all([
      generateAiStoryIdeas(suggestInput),
      runTrendStoryIdeas(suggestInput),
    ]);

    const topPicks = await rankTopStoryPicks(suggestInput, aiIdeas, trendResult.trends);

    return NextResponse.json({
      aiIdeas,
      trendIdeas: trendResult.trends,
      topPicks,
      trendsMeta: trendResult.meta,
      /** @deprecated use aiIdeas */
      ideas: aiIdeas,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Suggestion failed" },
      { status: 500 },
    );
  }
}
