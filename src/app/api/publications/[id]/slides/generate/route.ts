import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { eq, asc } from "drizzle-orm";
import { chatCompletion, extractJson } from "@/lib/openrouter/llm";
import { resolveProjectIdentityForProject } from "@/lib/project-dna-server";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { fetchAvatarById } from "@/lib/avatar-block";
import { getSocialPublicationForUser } from "@/lib/publication-server";
import {
  buildSlideStructureSystemPrompt,
  buildSlideStructureUserPrompt,
} from "@/lib/social-prompts";
import { normalizeProjectScriptLanguage } from "@/lib/project-language";
import { clampSlideCount, normalizePostFormat } from "@/lib/social-content";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface SlideDraft {
  position?: number;
  role?: string;
  headline?: string;
  body_text?: string;
  visual_prompt?: string;
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await getSocialPublicationForUser(params.id, userId);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { project } = data;
  const models = resolveProjectApiModels(project);
  const scriptLanguage = normalizeProjectScriptLanguage(project.scriptLanguage);
  const resolvedIdentity = await resolveProjectIdentityForProject(project);
  const avatar =
    project.socialUseAvatar && project.avatarId
      ? await fetchAvatarById(project.avatarId)
      : null;

  try {
    const raw = await chatCompletion({
      messages: [
        { role: "system", content: buildSlideStructureSystemPrompt(scriptLanguage) },
        {
          role: "user",
          content: buildSlideStructureUserPrompt({
            project,
            resolvedIdentity: resolvedIdentity || undefined,
            avatar,
          }),
        },
      ],
      model: models.llmModel,
      temperature: 0.75,
      response_format: { type: "json_object" },
    });

    const json = extractJson<{ slides?: SlideDraft[] }>(raw);
    const postFormat = normalizePostFormat(project.postFormat);
    const targetCount = clampSlideCount(project.slideCount ?? 7, postFormat);
    const drafts = (json.slides ?? []).slice(0, targetCount);
    if (drafts.length === 0) {
      return NextResponse.json({ error: "LLM returned no slides" }, { status: 502 });
    }

    await db.delete(schema.socialSlides).where(eq(schema.socialSlides.projectId, project.id));

    const now = new Date();
    const rows = drafts.map((draft, index) => ({
      id: createId(),
      projectId: project.id,
      position: draft.position ?? index,
      slideRole: draft.role?.trim() || (index === 0 ? "hook" : index === drafts.length - 1 ? "cta" : "body"),
      headline: draft.headline?.trim() || "",
      bodyText: draft.body_text?.trim() || "",
      visualPrompt: draft.visual_prompt?.trim() || "",
      status: "draft",
      avatarId: project.socialUseAvatar ? project.avatarId : null,
      createdAt: now,
      updatedAt: now,
    }));

    rows.sort((a, b) => a.position - b.position);
    rows.forEach((row, i) => {
      row.position = i;
    });

    await db.insert(schema.socialSlides).values(rows);

    await db
      .update(schema.projects)
      .set({ updatedAt: now, status: "draft" })
      .where(eq(schema.projects.id, project.id));

    const slides = await db
      .select()
      .from(schema.socialSlides)
      .where(eq(schema.socialSlides.projectId, project.id))
      .orderBy(asc(schema.socialSlides.position));

    return NextResponse.json({ slides });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Slide generation failed" },
      { status: 500 },
    );
  }
}
