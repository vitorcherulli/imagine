import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { chatCompletion, extractJson } from "@/lib/openrouter/llm";
import {
  buildSuggestionSystemPrompt,
  buildSuggestionUserPrompt,
} from "@/lib/story-prompts";
import { tryUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  genre: z.string().min(1),
  visualStyle: z.string().min(1),
  voiceTone: z.string().min(1),
  targetDurationSeconds: z.number().int().min(30).max(1800),
});

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const raw = await chatCompletion({
      messages: [
        { role: "system", content: buildSuggestionSystemPrompt() },
        { role: "user", content: buildSuggestionUserPrompt(parsed.data) },
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
