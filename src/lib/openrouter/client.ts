export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export const OPENROUTER_MODELS = {
  llm: process.env.OPENROUTER_LLM_MODEL ?? "anthropic/claude-opus-4.7",
  image: process.env.OPENROUTER_IMAGE_MODEL ?? "bytedance-seed/seedream-4.5",
  video: process.env.OPENROUTER_VIDEO_MODEL ?? "kwaivgi/kling-v3.0-pro",
  tts: process.env.OPENROUTER_TTS_MODEL ?? "google/gemini-3.1-flash-tts-preview",
  music: process.env.OPENROUTER_MUSIC_MODEL ?? "google/lyria-3-pro-preview",
} as const;

export function openRouterHeaders(extra: Record<string, string> = {}): HeadersInit {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  const referer = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": referer,
    "X-Title": "Imagine",
    ...extra,
  };
}

export async function openRouterFetch(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<Response> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`${OPENROUTER_BASE}${path}`, {
    ...rest,
    headers: { ...openRouterHeaders(), ...(headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : init.body,
  });
  return res;
}
