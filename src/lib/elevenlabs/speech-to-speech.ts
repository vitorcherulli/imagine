/**
 * ElevenLabs Voice Changer (speech-to-speech): keeps the timing, emotion and delivery
 * of a recording and swaps the timbre for another voice.
 *
 * Docs: https://elevenlabs.io/docs/api-reference/speech-to-speech/convert
 */
const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

export const SPEECH_TO_SPEECH_MODEL = "eleven_multilingual_sts_v2";

export async function convertSpeechToVoice(input: {
  audio: Buffer;
  filename?: string;
  voiceId: string;
  /** Strip music/ambience first — the model would otherwise "sing" the background. */
  removeBackgroundNoise?: boolean;
}): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not set. Add it to .env.local to change voices.");
  }

  const form = new FormData();
  const ab = new ArrayBuffer(input.audio.byteLength);
  new Uint8Array(ab).set(input.audio);
  form.append("audio", new Blob([ab], { type: "audio/mpeg" }), input.filename || "speech.mp3");
  form.append("model_id", SPEECH_TO_SPEECH_MODEL);
  form.append("remove_background_noise", input.removeBackgroundNoise === false ? "false" : "true");

  const res = await fetch(
    `${ELEVENLABS_BASE}/speech-to-speech/${encodeURIComponent(input.voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, accept: "audio/mpeg" },
      body: form,
    },
  );

  if (!res.ok) {
    const body = await res.text();
    let message = body.slice(0, 400);
    try {
      const json = JSON.parse(body) as { detail?: { message?: string } | string };
      if (typeof json.detail === "string") message = json.detail;
      else if (json.detail?.message) message = json.detail.message;
    } catch {
      // keep raw
    }
    throw new Error(`ElevenLabs voice changer error ${res.status}: ${message}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
