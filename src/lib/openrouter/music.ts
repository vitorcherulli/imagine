import { OPENROUTER_MODELS, openRouterFetch } from "./client";

export interface MusicGenInput {
  prompt: string;
  model?: string;
  format?: "wav" | "mp3";
}

export interface MusicGenResult {
  buffer: Buffer;
  format: string;
  mimeType: string;
}

interface ChatChoiceMessageAudio {
  data?: string;
  url?: string;
  format?: string;
  mime_type?: string;
}

function decodeBase64(s: string): Buffer {
  const m = s.match(/^data:([^;]+);base64,(.*)$/);
  if (m) return Buffer.from(m[2], "base64");
  return Buffer.from(s, "base64");
}

interface StreamDelta {
  audio?: {
    data?: string;
    transcript?: string;
    format?: string;
  };
  content?: unknown;
}

interface StreamChunk {
  choices?: Array<{ delta?: StreamDelta; message?: { audio?: ChatChoiceMessageAudio } }>;
  error?: { message?: string; code?: number };
}

async function consumeAudioStream(
  res: Response,
  fallbackFormat: string,
): Promise<MusicGenResult> {
  if (!res.body) throw new Error("Music response had no body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const audioChunks: string[] = [];
  let format = fallbackFormat;
  let mime = `audio/${fallbackFormat}`;
  let errorMessage: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith(":")) continue;
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      let json: StreamChunk;
      try {
        json = JSON.parse(payload) as StreamChunk;
      } catch {
        continue;
      }
      if (json.error?.message) errorMessage = json.error.message;
      for (const choice of json.choices ?? []) {
        const delta = choice.delta?.audio;
        if (delta?.data) audioChunks.push(delta.data);
        if (delta?.format) {
          format = delta.format;
          mime = `audio/${delta.format}`;
        }
        const finalAudio = choice.message?.audio;
        if (finalAudio?.data) audioChunks.push(finalAudio.data);
        if (finalAudio?.format) {
          format = finalAudio.format;
        }
        if (finalAudio?.mime_type) mime = finalAudio.mime_type;
      }
    }
  }
  if (audioChunks.length === 0) {
    throw new Error(errorMessage ?? "Music stream contained no audio data");
  }
  const merged = audioChunks.join("");
  return { buffer: decodeBase64(merged), format, mimeType: mime };
}

export async function generateMusic(input: MusicGenInput): Promise<MusicGenResult> {
  const format = input.format ?? "wav";
  const body = {
    model: input.model ?? OPENROUTER_MODELS.music,
    messages: [{ role: "user", content: input.prompt }],
    modalities: ["text", "audio"],
    audio: { format },
    stream: true,
  };

  const res = await openRouterFetch("/chat/completions", {
    method: "POST",
    json: body,
    headers: { Accept: "text/event-stream" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter music error ${res.status}: ${text}`);
  }

  return consumeAudioStream(res, format);
}
