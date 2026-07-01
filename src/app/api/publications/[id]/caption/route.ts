import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { chatCompletion, extractJson } from "@/lib/openrouter/llm";
import { resolveProjectIdentityForProject } from "@/lib/project-dna-server";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import { getSocialPublicationForUser } from "@/lib/publication-server";
import {
  buildSocialCaptionSystemPrompt,
  buildSocialCaptionUserPrompt,
} from "@/lib/social-prompts";
import { normalizeProjectScriptLanguage } from "@/lib/project-language";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await getSocialPublicationForUser(params.id, userId);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (data.slides.length === 0) {
    return NextResponse.json({ error: "Generate slides first" }, { status: 400 });
  }

  const { project, slides } = data;
  const models = resolveProjectApiModels(project);
  const scriptLanguage = normalizeProjectScriptLanguage(project.scriptLanguage);
  const resolvedIdentity = await resolveProjectIdentityForProject(project);

  try {
    const raw = await chatCompletion({
      messages: [
        { role: "system", content: buildSocialCaptionSystemPrompt(scriptLanguage) },
        {
          role: "user",
          content: buildSocialCaptionUserPrompt({
            project,
            resolvedIdentity: resolvedIdentity || undefined,
            slides,
          }),
        },
      ],
      model: models.llmModel,
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const json = extractJson<{
      hook_line?: string;
      caption?: string;
      hashtags?: unknown;
      slide_notes?: unknown;
    }>(raw);

    const hashtags = Array.isArray(json.hashtags)
      ? JSON.stringify(
          json.hashtags.filter((t): t is string => typeof t === "string" && t.trim().length > 0),
        )
      : "[]";
    const slideNotes = Array.isArray(json.slide_notes)
      ? JSON.stringify(
          json.slide_notes.filter((t): t is string => typeof t === "string" && t.trim().length > 0),
        )
      : "[]";

    const now = new Date();
    const payload = {
      hookLine: json.hook_line?.trim() || null,
      caption: json.caption?.trim() || null,
      hashtags,
      slideNotes,
      status: "ready",
      updatedAt: now,
    };

    if (data.metadata) {
      await db
        .update(schema.socialMetadata)
        .set(payload)
        .where(eq(schema.socialMetadata.id, data.metadata.id));
    } else {
      await db.insert(schema.socialMetadata).values({
        id: createId(),
        projectId: project.id,
        ...payload,
        createdAt: now,
      });
    }

    const refreshed = await getSocialPublicationForUser(params.id, userId);
    return NextResponse.json({ metadata: refreshed?.metadata ?? null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Caption generation failed" },
      { status: 500 },
    );
  }
}
