/**
 * Tradução batch dos segmentos de dublagem via LLM com **orçamento estrito de
 * caracteres por segmento**, calculado a partir da densidade natural de fala
 * do idioma alvo (`charsPerSecond`).
 *
 * O LLM recebe todos os segmentos numa call só e devolve um JSON com
 * `[{i, text}]`. Isso preserva coerência (tom, gênero, terminologia) entre
 * segmentos ao mesmo tempo que respeita a duração original de cada frase.
 */
import { chatCompletion, extractJson, type ChatMessage } from "@/lib/openrouter/llm";
import { dubLanguageInfo, maxCharsForDuration } from "@/lib/dub-languages";

export interface TranslateInput {
  sourceLanguage: string;
  targetLanguage: string;
  voiceTone?: string | null;
  model?: string | null;
  segments: Array<{
    id: string;
    text: string;
    durationSeconds: number;
  }>;
}

export interface TranslateResult {
  translations: Array<{ id: string; text: string; maxChars: number }>;
  usage?: { model: string };
}

const MAX_SEGMENTS_PER_CALL = 40;

export async function translateDubbingSegments(
  input: TranslateInput,
): Promise<TranslateResult> {
  if (input.segments.length === 0) return { translations: [] };

  const targetInfo = dubLanguageInfo(input.targetLanguage);
  const translations: Array<{ id: string; text: string; maxChars: number }> = [];
  const modelUsed = input.model ?? undefined;

  for (let i = 0; i < input.segments.length; i += MAX_SEGMENTS_PER_CALL) {
    const chunk = input.segments.slice(i, i + MAX_SEGMENTS_PER_CALL);
    const withBudget = chunk.map((s) => ({
      ...s,
      maxChars: maxCharsForDuration(input.targetLanguage, s.durationSeconds),
    }));

    const messages = buildMessages({
      source: input.sourceLanguage,
      targetName: targetInfo.llmName,
      voiceTone: input.voiceTone,
      segments: withBudget,
    });

    const raw = await chatCompletion({
      messages,
      model: input.model ?? undefined,
      temperature: 0.25,
      response_format: { type: "json_object" },
    });

    let parsed: { translations?: Array<{ id: string; text: string }> };
    try {
      parsed = extractJson(raw);
    } catch {
      throw new Error(
        `LLM translation returned invalid JSON. Model=${input.model ?? "default"}. Raw head: ${raw.slice(0, 200)}`,
      );
    }

    const list = Array.isArray(parsed?.translations) ? parsed.translations : [];
    const byId = new Map(list.map((t) => [String(t.id), String(t.text ?? "")]));
    for (const seg of withBudget) {
      const translated = byId.get(seg.id) ?? seg.text;
      translations.push({
        id: seg.id,
        text: translated.trim(),
        maxChars: seg.maxChars,
      });
    }
  }

  return {
    translations,
    usage: modelUsed ? { model: modelUsed } : undefined,
  };
}

/**
 * Pede ao LLM para *encurtar* uma única linha traduzida quando a síntese
 * TTS excede a janela original. Preserva sentido; retorna a nova linha.
 */
export async function shortenTranslatedLine(input: {
  targetLanguage: string;
  originalSource: string;
  currentTranslation: string;
  targetSeconds: number;
  model?: string | null;
  attempt: number;
}): Promise<string> {
  const targetInfo = dubLanguageInfo(input.targetLanguage);
  const maxChars = Math.round(
    maxCharsForDuration(input.targetLanguage, input.targetSeconds) *
      Math.max(0.55, 0.9 - input.attempt * 0.15),
  );

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You compress dub lines for lip-sync. Return only the shortened line in ${targetInfo.llmName}, nothing else.`,
    },
    {
      role: "user",
      content: `The following ${targetInfo.llmName} line is too long to fit inside a ${input.targetSeconds.toFixed(2)}s dub slot. Rewrite it MORE CONCISELY (target ≤ ${maxChars} characters) while keeping the exact same intent and tone. Preserve names and punctuation.

Original (source language): "${input.originalSource}"
Current translation (too long): "${input.currentTranslation}"

Return ONLY the shortened line, no quotes, no explanation.`,
    },
  ];

  const raw = await chatCompletion({
    messages,
    model: input.model ?? undefined,
    temperature: 0.2,
  });

  return cleanShortenedOutput(raw);
}

function cleanShortenedOutput(raw: string): string {
  return raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/```$/g, "")
    .trim();
}

function buildMessages(opts: {
  source: string;
  targetName: string;
  voiceTone?: string | null;
  segments: Array<{ id: string; text: string; durationSeconds: number; maxChars: number }>;
}): ChatMessage[] {
  const toneLine = opts.voiceTone?.trim()
    ? `\nSpeaker voice tone/style: ${opts.voiceTone.trim()}`
    : "";

  const system = `You are a professional dubbing translator. Translate short speech segments from ${opts.source} into ${opts.targetName}.

CRITICAL RULES for lip-sync dubbing:
- Each translated line MUST fit within its per-segment character budget (see "max_chars"). Going over means the dub will be crushed or spill over the original speaker's mouth — unacceptable.
- Prefer shorter, punchier translations. Cut filler words. Merge phrases. Use contractions.
- Preserve the speaker's intent, tone and emotion — but you are allowed (and expected) to rephrase freely to hit the length budget.
- Preserve proper nouns, brand names and technical terms.
- Preserve sentence-final punctuation (., ?, !) so the TTS speaks with the right cadence.
- Do NOT translate URLs, code, or numeric identifiers.
- Do NOT add explanations, notes or apologies.
- Output MUST be valid JSON matching the schema shown by the user.${toneLine}`;

  const userJson = {
    target_language: opts.targetName,
    segments: opts.segments.map((s) => ({
      id: s.id,
      duration_seconds: Number(s.durationSeconds.toFixed(2)),
      max_chars: s.maxChars,
      text: s.text,
    })),
    output_schema: {
      translations: [
        {
          id: "same id from input",
          text: `translated line in ${opts.targetName}, must be ≤ max_chars characters`,
        },
      ],
    },
  };

  const user = `Translate the following speech segments to ${opts.targetName}. Respect the per-segment "max_chars" budget as a hard constraint. Return ONLY a JSON object of the form {"translations":[{"id":"…","text":"…"}]}.

INPUT:
${JSON.stringify(userJson, null, 2)}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
