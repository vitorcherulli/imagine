/**
 * ElevenLabs Instant Voice Cloning (IVC).
 *
 * Cria uma voz na conta a partir de uma amostra de áudio; devolve `voice_id`
 * que pode ser usado imediatamente com o TTS `text-to-speech/{voice_id}`.
 *
 * Docs: https://elevenlabs.io/docs/api-reference/voices/ivc/create
 */
const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

export interface VoiceCloneResult {
  voiceId: string;
  name: string;
  requiresVerification: boolean;
}

export async function cloneVoiceFromAudio(input: {
  name: string;
  description?: string;
  audio: Buffer;
  filename: string;
  mimeType?: string;
  labels?: Record<string, string>;
}): Promise<VoiceCloneResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY is not set. Add it to .env.local to clone voices.",
    );
  }

  const form = new FormData();
  form.append("name", input.name.slice(0, 100));
  if (input.description) {
    form.append("description", input.description.slice(0, 500));
  }
  const ab = new ArrayBuffer(input.audio.byteLength);
  new Uint8Array(ab).set(input.audio);
  form.append(
    "files",
    new Blob([ab], { type: input.mimeType || "audio/mpeg" }),
    input.filename || "sample.mp3",
  );
  if (input.labels) {
    form.append("labels", JSON.stringify(input.labels));
  }

  const res = await fetch(`${ELEVENLABS_BASE}/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    let message = body.slice(0, 400);
    try {
      const json = JSON.parse(body) as {
        detail?: { message?: string; status?: string } | string;
      };
      if (typeof json.detail === "string") message = json.detail;
      else if (json.detail?.message) message = json.detail.message;
    } catch {
      // keep raw
    }
    throw new Error(`ElevenLabs voice clone error ${res.status}: ${message}`);
  }

  const raw = (await res.json()) as {
    voice_id: string;
    name?: string;
    requires_verification?: boolean;
  };

  return {
    voiceId: raw.voice_id,
    name: raw.name || input.name,
    requiresVerification: Boolean(raw.requires_verification),
  };
}

export async function deleteClonedVoice(voiceId: string): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return;
  await fetch(
    `${ELEVENLABS_BASE}/voices/${encodeURIComponent(voiceId)}`,
    {
      method: "DELETE",
      headers: { "xi-api-key": apiKey },
    },
  ).catch(() => {});
}
