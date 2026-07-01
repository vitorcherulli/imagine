import type { Project } from "@/lib/db/schema";
import { chatCompletion, extractJson } from "@/lib/openrouter/llm";
import {
  buildScriptSplitLinesSystemPrompt,
  buildScriptSplitLinesUserPrompt,
  type NarratorSuggestion,
} from "@/lib/script-prompts";
import {
  assertNarrationSplitLossless,
  formatScriptForNarrationLines,
} from "@/lib/script-narration-split";
import { normalizeProjectScriptLanguage } from "@/lib/project-language";
import { normalizeScriptText } from "@/lib/script-studio";

export async function splitScriptForNarrator(input: {
  sourceScript: string;
  project: Project;
  narrator?: NarratorSuggestion | null;
  llmModel: string;
}): Promise<string> {
  const fallback = formatScriptForNarrationLines(input.sourceScript);

  try {
    const raw = await chatCompletion({
      messages: [
        { role: "system", content: buildScriptSplitLinesSystemPrompt(normalizeProjectScriptLanguage(input.project.scriptLanguage)) },
        {
          role: "user",
          content: buildScriptSplitLinesUserPrompt({
            sourceScript: input.sourceScript,
            project: input.project,
            narrator: input.narrator,
          }),
        },
      ],
      model: input.llmModel,
      temperature: 0.35,
      response_format: { type: "json_object" },
    });

    const json = extractJson<{ script?: string }>(raw);
    const candidate = normalizeScriptText(json.script ?? "");
    if (!candidate) return fallback;

    assertNarrationSplitLossless(input.sourceScript, candidate);
    return candidate;
  } catch {
    return fallback;
  }
}
