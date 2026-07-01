export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export const OPENROUTER_MODELS = {
  llm: process.env.OPENROUTER_LLM_MODEL ?? "anthropic/claude-opus-4.7",
  image: process.env.OPENROUTER_IMAGE_MODEL ?? "bytedance-seed/seedream-4.5",
  video: process.env.OPENROUTER_VIDEO_MODEL ?? "kwaivgi/kling-v3.0-pro",
  tts: process.env.OPENROUTER_TTS_MODEL ?? "google/gemini-3.1-flash-tts-preview",
  music: process.env.OPENROUTER_MUSIC_MODEL ?? "google/lyria-3-pro-preview",
} as const;

export function openRouterHeaders(extra: Record<string, string> = {}): HeadersInit {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY não está definida. Adicione em .env.local e reinicie o servidor.",
    );
  }
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

function extractOpenRouterMessage(text: string): string | null {
  try {
    const json = JSON.parse(text) as { error?: { message?: string }; message?: string };
    return json.error?.message ?? json.message ?? null;
  } catch {
    return null;
  }
}

/** Human-readable OpenRouter failure for API routes and toasts. */
export function formatOpenRouterError(status: number, text: string): string {
  const detail = extractOpenRouterMessage(text);
  if (status === 401) {
    return (
      "OpenRouter rejected the API key (401). Create a new key at openrouter.ai/settings/keys, " +
      "update OPENROUTER_API_KEY on the server, and restart the app."
    );
  }
  if (status === 402) {
    return "OpenRouter credits exhausted (402). Add credits at openrouter.ai/settings/credits.";
  }
  if (detail) return detail;
  return `OpenRouter error ${status}: ${text.slice(0, 280)}`;
}
