import type { ScriptDeliveryAnalysis, ScriptDeliverySpan } from "./script-studio";

export type DeliveryEmphasisKind =
  | "hook"
  | "question"
  | "stat"
  | "contrast"
  | "emotion"
  | "punch"
  | "cta";

export interface DeliveryEmphasisMatch {
  start: number;
  end: number;
  kind: DeliveryEmphasisKind;
  label: string;
}

export type DeliveryHighlightSegment =
  | { type: "text"; value: string }
  | {
      type: "emphasis";
      value: string;
      kind: DeliveryEmphasisKind;
      label: string;
      spanId?: string;
    };

const EMPHASIS_RULES: Array<{
  kind: DeliveryEmphasisKind;
  label: string;
  regex: RegExp;
}> = [
  {
    kind: "question",
    label: "Question — lift intonation, slight pause after",
    regex: /[^.!?\n]{10,160}\?/g,
  },
  {
    kind: "contrast",
    label: "Contrast — stress the turn of phrase",
    regex:
      /\b(?:not|never|aren't|isn't|wasn't|weren't|no longer)\b[^.!?]{2,100}[.!?]/gi,
  },
  {
    kind: "punch",
    label: "Landing line — slow down, let it land",
    regex:
      /\b(?:some places are not[^.!?]{0,40}remembered|never supposed to exist|world drops open|hull hums|light tilts|drifted back|carry home|turned its eyes|quietly rewrites)[^.!?]{0,40}[.!?]?/gi,
  },
  {
    kind: "stat",
    label: "Fact / scale — clear, grounded delivery",
    regex:
      /\b(?:more than|over|nearly|almost|fewer than|less than|about|roughly)\s+\d[\d,]*[^.!?]{0,45}[.!?]?/gi,
  },
  {
    kind: "stat",
    label: "Number — crisp emphasis",
    regex:
      /\b\d[\d,]*(?:\.\d+)?\s*(?:km|kilometers|meters|metres|feet|miles|years|towns|waterfalls|residents|visitors|percent|hours|m)\b[^.!?]{0,25}[.!?]?/gi,
  },
  {
    kind: "stat",
    label: "Scale — let the magnitude land",
    regex:
      /\b(?:million|billion|thousand)\s+(?:visitors|people|residents|years|towns)[^.!?]{0,35}/gi,
  },
  {
    kind: "emotion",
    label: "Emotional beat — warmth or wonder",
    regex:
      /\b(?:remember(?:ed)?|quietly|impossible|stunning|breathtaking|jewels|hush|understand|glowing|effortless|perfectly warm|polished glass|impossible greens|impossible blues)\b[^.!?]{0,55}[.!?]?/gi,
  },
  {
    kind: "cta",
    label: "CTA — friendly, direct",
    regex:
      /\b(?:visit the link|leave your email|chance to win|made possible by|explore the full itinerary|link in the description)[^.!?]{0,90}[.!?]?/gi,
  },
];

function mergeDeliveryMatches(matches: DeliveryEmphasisMatch[]): DeliveryEmphasisMatch[] {
  if (matches.length === 0) return [];
  const sorted = [...matches].sort(
    (a, b) => a.start - b.start || b.end - a.end - (a.end - a.start),
  );
  const merged: DeliveryEmphasisMatch[] = [];
  for (const match of sorted) {
    const last = merged[merged.length - 1];
    if (!last || match.start >= last.end) {
      merged.push(match);
      continue;
    }
    if (match.end > last.end && match.end - match.start > last.end - last.start) {
      merged[merged.length - 1] = match;
    }
  }
  return merged;
}

function detectOpeningHook(script: string): DeliveryEmphasisMatch | null {
  const trimmed = script.trimStart();
  if (!trimmed) return null;
  const offset = script.length - trimmed.length;

  const questionEnd = trimmed.search(/\?/);
  if (questionEnd !== -1 && questionEnd <= 140) {
    const value = trimmed.slice(0, questionEnd + 1);
    return {
      start: offset,
      end: offset + value.length,
      kind: "hook",
      label: "Opening hook — curious, unhurried",
    };
  }

  const firstSentence = trimmed.match(/^[^.!?]+[.!?]/)?.[0];
  if (firstSentence && firstSentence.length <= 120) {
    return {
      start: offset,
      end: offset + firstSentence.length,
      kind: "hook",
      label: "Opening — draw the listener in",
    };
  }

  return null;
}

export function detectDeliveryEmphasis(script: string): DeliveryEmphasisMatch[] {
  if (!script.trim()) return [];

  const matches: DeliveryEmphasisMatch[] = [];
  const hook = detectOpeningHook(script);
  if (hook) matches.push(hook);

  for (const rule of EMPHASIS_RULES) {
    rule.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.regex.exec(script)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (end - start < 6) continue;
      if (hook && start >= hook.start && end <= hook.end) continue;
      matches.push({ start, end, kind: rule.kind, label: rule.label });
    }
  }

  return mergeDeliveryMatches(matches).slice(0, 48);
}

function findDeliverySpanMatches(
  script: string,
  spans: ScriptDeliverySpan[],
): DeliveryEmphasisMatch[] {
  const matches: DeliveryEmphasisMatch[] = [];
  for (const span of spans) {
    const quote = span.quote.trim();
    if (!quote) continue;
    let from = 0;
    while (from < script.length) {
      const idx = script.indexOf(quote, from);
      if (idx === -1) break;
      matches.push({
        start: idx,
        end: idx + quote.length,
        kind: span.kind,
        label: span.hint,
      });
      from = idx + quote.length;
    }
  }
  return mergeDeliveryMatches(matches);
}

export function buildDeliveryHighlightSegments(
  script: string,
  deliveryAnalysis?: ScriptDeliveryAnalysis | null,
): DeliveryHighlightSegment[] {
  const aiMatches =
    deliveryAnalysis?.spans?.length && script
      ? findDeliverySpanMatches(script, deliveryAnalysis.spans)
      : [];

  const matches =
    aiMatches.length > 0 ? aiMatches : detectDeliveryEmphasis(script);

  if (!script || matches.length === 0) {
    return [{ type: "text", value: script }];
  }

  const spanByRange = new Map<string, ScriptDeliverySpan>();
  if (deliveryAnalysis?.spans) {
    for (const span of deliveryAnalysis.spans) {
      const key = span.quote.trim();
      if (key && !spanByRange.has(key)) spanByRange.set(key, span);
    }
  }

  const segments: DeliveryHighlightSegment[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      segments.push({ type: "text", value: script.slice(cursor, match.start) });
    }
    const quote = script.slice(match.start, match.end);
    const span = spanByRange.get(quote);
    segments.push({
      type: "emphasis",
      value: quote,
      kind: match.kind,
      label: match.label,
      spanId: span?.id,
    });
    cursor = match.end;
  }
  if (cursor < script.length) {
    segments.push({ type: "text", value: script.slice(cursor) });
  }
  return segments;
}

/** @deprecated Use buildDeliveryHighlightSegments(script, analysis) */
export function buildDeliveryHighlightSegmentsFromHeuristics(
  script: string,
): DeliveryHighlightSegment[] {
  return buildDeliveryHighlightSegments(script, null);
}

export function deliveryEmphasisSource(
  deliveryAnalysis?: ScriptDeliveryAnalysis | null,
): "ai" | "heuristic" {
  return deliveryAnalysis?.spans?.length ? "ai" : "heuristic";
}

export function deliveryEmphasisClass(kind: DeliveryEmphasisKind): string {
  switch (kind) {
    case "hook":
    case "question":
      return "bg-sky-400/10 underline decoration-wavy decoration-sky-500/85 decoration-2 underline-offset-[3px]";
    case "contrast":
    case "punch":
      return "bg-amber-400/12 underline decoration-wavy decoration-amber-500/90 decoration-2 underline-offset-[3px]";
    case "emotion":
      return "bg-rose-400/10 underline decoration-wavy decoration-rose-400/80 decoration-2 underline-offset-[3px]";
    case "stat":
      return "bg-teal-400/10 underline decoration-dotted decoration-teal-500/85 decoration-2 underline-offset-[3px]";
    case "cta":
      return "bg-accent/10 underline decoration-dashed decoration-accent/80 decoration-2 underline-offset-[3px]";
  }
}

export function deliveryEmphasisLegend(): Array<{ kind: DeliveryEmphasisKind; short: string }> {
  return [
    { kind: "hook", short: "Hook" },
    { kind: "question", short: "?" },
    { kind: "stat", short: "Fact" },
    { kind: "emotion", short: "Emotion" },
    { kind: "punch", short: "Landing" },
    { kind: "cta", short: "CTA" },
  ];
}
