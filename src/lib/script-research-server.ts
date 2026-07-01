import type { Project } from "./db/schema";
import { chatCompletion, extractJson } from "./openrouter/llm";
import { normalizeProjectScriptLanguage } from "./project-language";
import {
  buildScriptResearchQuerySystemPrompt,
  buildScriptResearchQueryUserPrompt,
  buildScriptResearchSynthesisSystemPrompt,
  buildScriptResearchSynthesisUserPrompt,
} from "./script-prompts";
import {
  normalizeScriptResearchAnalysis,
  type ScriptResearchAnalysis,
} from "./script-studio";
import { searchWeb, webSearchProviderLabel } from "./web-search";

export async function runScriptWebResearch(input: {
  project: Pick<Project, "storyDescription" | "genre" | "scriptLanguage">;
  currentScript?: string;
  llmModel: string;
}): Promise<ScriptResearchAnalysis> {
  const currentScript = input.currentScript?.trim() || undefined;
  const provider = webSearchProviderLabel();
  const scriptLanguage = normalizeProjectScriptLanguage(input.project.scriptLanguage);

  const queryRaw = await chatCompletion({
    messages: [
      { role: "system", content: buildScriptResearchQuerySystemPrompt() },
      {
        role: "user",
        content: buildScriptResearchQueryUserPrompt({
          storyDescription: input.project.storyDescription,
          genre: input.project.genre,
          currentScript,
        }),
      },
    ],
    model: input.llmModel,
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const queryResult = extractJson<{ queries?: unknown }>(queryRaw);
  const queries = Array.isArray(queryResult.queries)
    ? queryResult.queries
        .filter((q): q is string => typeof q === "string" && q.trim().length > 2)
        .map((q) => q.trim().slice(0, 120))
        .slice(0, 5)
    : [];

  if (queries.length === 0) {
    throw new Error("Could not plan web searches for this brief.");
  }

  const searchResults: Array<{
    query: string;
    snippets: Array<{ title: string; url: string; content: string }>;
  }> = [];

  for (const query of queries) {
    const snippets = await searchWeb(query, 3);
    if (snippets.length > 0) {
      searchResults.push({ query, snippets });
    }
  }

  if (searchResults.length === 0) {
    throw new Error(
      "Web search returned no results. Add TAVILY_API_KEY to .env.local for broader search, or try a more specific brief.",
    );
  }

  const synthRaw = await chatCompletion({
    messages: [
      { role: "system", content: buildScriptResearchSynthesisSystemPrompt(scriptLanguage) },
      {
        role: "user",
        content: buildScriptResearchSynthesisUserPrompt({
          storyDescription: input.project.storyDescription,
          genre: input.project.genre,
          currentScript,
          searchResults,
        }),
      },
    ],
    model: input.llmModel,
    temperature: 0.25,
    response_format: { type: "json_object" },
  });

  const synthResult = extractJson<{
    summary?: string;
    facts?: unknown;
    curiosities?: unknown;
    fact_checks?: unknown;
  }>(synthRaw);

  const research = normalizeScriptResearchAnalysis(
    {
      summary: synthResult.summary,
      facts: synthResult.facts,
      curiosities: synthResult.curiosities,
      fact_checks: synthResult.fact_checks,
      queries,
    },
    provider,
  );

  if (!research) {
    throw new Error("Could not extract verified facts from web results. Try again.");
  }

  return research;
}
