import { ELEVENLABS_VOICE_OPTIONS } from "@/lib/project-api-models";

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";
const CACHE_TTL_MS = 10 * 60 * 1000;

export type AccountVoice = {
  voiceId: string;
  name: string;
  /** premade | cloned | generated | professional | library */
  category: string;
};

let cache: { at: number; voices: AccountVoice[] } | null = null;

export function clearAccountVoicesCache(): void {
  cache = null;
}

/** Voices in the ElevenLabs account (clones included). Falls back to the built-in list. */
export async function listAccountVoices(): Promise<AccountVoice[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.voices;
  const fallback = ELEVENLABS_VOICE_OPTIONS.map((o) => ({
    voiceId: o.value,
    name: o.label,
    category: "library",
  }));
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return fallback;
  try {
    const res = await fetch(`${ELEVENLABS_BASE}/voices`, { headers: { "xi-api-key": apiKey } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      voices?: Array<{ voice_id: string; name?: string; category?: string }>;
    };
    const account = (json.voices ?? [])
      // Throwaway clones made by the dubbing pipeline.
      .filter((v) => !(v.name ?? "").startsWith("dub_"))
      .map((v) => ({ voiceId: v.voice_id, name: v.name || v.voice_id, category: v.category || "premade" }));
    const known = new Set(account.map((v) => v.voiceId));
    const voices = [...account, ...fallback.filter((v) => !known.has(v.voiceId))];
    cache = { at: Date.now(), voices };
    return voices;
  } catch (err) {
    console.warn("[elevenlabs] could not list voices", err);
    return cache?.voices ?? fallback;
  }
}
