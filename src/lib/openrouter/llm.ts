import { OPENROUTER_MODELS, openRouterFetch } from "./client";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chatCompletion(opts: {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  response_format?: { type: "json_object" };
}): Promise<string> {
  const res = await openRouterFetch("/chat/completions", {
    method: "POST",
    json: {
      model: opts.model ?? OPENROUTER_MODELS.llm,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.8,
      ...(opts.response_format ? { response_format: opts.response_format } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter chat error ${res.status}: ${text}`);
  }
  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? "";
}

export function extractJson<T = unknown>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf("{");
  const startArr = candidate.indexOf("[");
  let begin = -1;
  let end = -1;
  if (start === -1 && startArr === -1) throw new Error("No JSON found in LLM output");
  if (start !== -1 && (startArr === -1 || start < startArr)) {
    begin = start;
    end = candidate.lastIndexOf("}");
  } else {
    begin = startArr;
    end = candidate.lastIndexOf("]");
  }
  if (begin === -1 || end === -1) throw new Error("Unbalanced JSON in LLM output");
  const slice = candidate.slice(begin, end + 1);
  return JSON.parse(slice) as T;
}
