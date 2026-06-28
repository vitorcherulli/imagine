import type { ScriptDeliverySpan } from "./script-studio";

/** Spans whose quote appears inside this speech block (paragraph). */
export function deliverySpansInText(
  speechText: string,
  spans: ScriptDeliverySpan[] | undefined,
): ScriptDeliverySpan[] {
  if (!spans?.length || !speechText.trim()) return [];
  return spans.filter((span) => {
    const quote = span.quote.trim();
    return quote.length >= 2 && speechText.includes(quote);
  });
}

/** Director notes + per-phrase hints for TTS preamble (Gemini). */
export function buildTtsDeliveryNotes(
  narratorNotes: string | undefined,
  spans: ScriptDeliverySpan[],
): string | undefined {
  const parts: string[] = [];
  if (narratorNotes?.trim()) parts.push(narratorNotes.trim());
  if (spans.length > 0) {
    const lines = spans.map((s) => `"${s.quote}": ${s.hint}`);
    parts.push(`Phrase emphasis: ${lines.join("; ")}`);
  }
  const combined = parts.join("\n").trim();
  return combined ? combined.slice(0, 1400) : undefined;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function oralPrefixForKind(kind: ScriptDeliverySpan["kind"]): string {
  switch (kind) {
    case "hook":
    case "question":
      return "... ";
    case "punch":
    case "emotion":
    case "contrast":
      return " — ";
    case "stat":
    case "cta":
      return ", ";
    default:
      return " ";
  }
}

/** Insert micro-pauses before emphasized phrases (Kokoro / Grok plain text). */
export function applyOralEmphasisPauses(
  text: string,
  spans: ScriptDeliverySpan[],
): string {
  if (!spans.length) return text;

  type Insert = { index: number; quote: string; prefix: string };
  const inserts: Insert[] = [];

  for (const span of spans) {
    const quote = span.quote.trim();
    if (quote.length < 2) continue;
    const index = text.indexOf(quote);
    if (index === -1) continue;
    inserts.push({ index, quote, prefix: oralPrefixForKind(span.kind) });
  }

  if (inserts.length === 0) return text;

  inserts.sort((a, b) => b.index - a.index);
  let result = text;
  for (const ins of inserts) {
    const idx = result.indexOf(ins.quote);
    if (idx === -1) continue;
    result =
      result.slice(0, idx) + ins.prefix + result.slice(idx);
  }
  return result;
}

/** ElevenLabs SSML — short break before emphasized phrases. */
export function applySsmlEmphasisPauses(
  text: string,
  spans: ScriptDeliverySpan[],
): string {
  if (!spans.length) return text;

  type Insert = { index: number; quote: string };
  const inserts: Insert[] = [];

  for (const span of spans) {
    const quote = span.quote.trim();
    if (quote.length < 2) continue;
    const index = text.indexOf(quote);
    if (index === -1) continue;
    inserts.push({ index, quote });
  }

  if (inserts.length === 0) return text;

  inserts.sort((a, b) => b.index - a.index);
  let result = text;
  for (const ins of inserts) {
    const idx = result.indexOf(ins.quote);
    if (idx === -1) continue;
    const breakTag = '<break time="0.35s" />';
    result =
      result.slice(0, idx) + breakTag + escapeXml(ins.quote) + result.slice(idx + ins.quote.length);
  }
  return result;
}

export function formatGeminiDeliverySpanBlock(spans: ScriptDeliverySpan[]): string {
  if (!spans.length) return "";
  return (
    "Performance emphasis — apply while reading; do NOT read these bullets aloud:\n" +
    spans.map((s) => `• On "${s.quote}": ${s.hint}`).join("\n") +
    "\n\n"
  );
}

export function prepareSpeechTextForTts(input: {
  text: string;
  deliverySpans?: ScriptDeliverySpan[];
  ttsModel: string;
  isGemini: boolean;
  isElevenLabs: boolean;
}): string {
  const spans = input.deliverySpans ?? [];
  if (!spans.length) return input.text;
  if (input.isGemini) return input.text;
  if (input.isElevenLabs) return applySsmlEmphasisPauses(input.text, spans);
  return applyOralEmphasisPauses(input.text, spans);
}
