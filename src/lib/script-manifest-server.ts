import type { Project } from "./db/schema";
import { chatCompletion, extractJson } from "./openrouter/llm";
import {
  buildScriptManifestSystemPrompt,
  buildScriptManifestUserPrompt,
} from "./script-prompts";
import {
  buildPremiereManifestTimeline,
  mergeVisualHintsIntoManifest,
  type ScriptPremiereManifest,
} from "./script-premiere-manifest";
import { normalizeScriptText, type ScriptDraftNotes } from "./script-studio";

export async function runScriptPremiereManifest(input: {
  project: Pick<Project, "id" | "title" | "storyDescription" | "genre" | "visualStyle">;
  script: string;
  notes: ScriptDraftNotes;
  llmModel: string;
  skipVisualHints?: boolean;
}): Promise<ScriptPremiereManifest> {
  const script = normalizeScriptText(input.script);
  const base = buildPremiereManifestTimeline({
    project: input.project,
    script,
    notes: input.notes,
  });

  if (input.skipVisualHints || !input.project.storyDescription?.trim()) {
    return base;
  }

  const speechSegments = base.segments
    .filter((s) => s.kind === "speech" && s.text)
    .map((s) => ({
      id: s.id,
      text: s.text!,
      durationSec: s.durationSec,
    }));

  if (speechSegments.length === 0) return base;

  const raw = await chatCompletion({
    messages: [
      { role: "system", content: buildScriptManifestSystemPrompt() },
      {
        role: "user",
        content: buildScriptManifestUserPrompt({
          storyDescription: input.project.storyDescription,
          genre: input.project.genre,
          visualStyle: input.project.visualStyle,
          segments: speechSegments,
        }),
      },
    ],
    model: input.llmModel,
    temperature: 0.4,
    response_format: { type: "json_object" },
  });

  const parsed = extractJson<{ segments?: unknown }>(raw);
  const hints = Array.isArray(parsed.segments)
    ? parsed.segments.filter((s): s is { id: string } => {
        const o = s as { id?: unknown };
        return typeof o.id === "string" && o.id.trim().length > 0;
      })
    : [];

  return mergeVisualHintsIntoManifest(base, hints);
}
