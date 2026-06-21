import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { chatCompletion, extractJson } from "@/lib/openrouter/llm";
import {
  buildSuggestionSystemPrompt,
  buildSuggestionUserPrompt,
} from "@/lib/story-prompts";
import { tryUser } from "@/lib/auth";
import { resolveProjectIdentityForProject } from "@/lib/project-dna-server";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  genre: z.string().min(1),
  visualStyle: z.string().min(1),
  voiceTone: z.string().min(1),
  targetDurationSeconds: z.number().int().min(30).max(1800),
  videoFormat: z.enum(["horizontal", "vertical"]).optional(),
  projectDnaId: z.string().nullable().optional(),
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

  try {
    const raw = await chatCompletion({
      messages: [
        { role: "system", content: buildSuggestionSystemPrompt() },
        {
          role: "user",
          content: buildSuggestionUserPrompt({
            ...parsed.data,
            projectIdentity,
          }),
        },
      ],
      temperature: 0.95,
      response_format: { type: "json_object" },
    });
    const json = extractJson<{ ideas: Array<{ title: string; summary: string }> }>(raw);
    return NextResponse.json({ ideas: json.ideas ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Suggestion failed" },
      { status: 500 },
    );
  }
}
