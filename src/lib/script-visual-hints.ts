import type { LucideIcon } from "lucide-react";
import {
  Bird,
  Building2,
  Handshake,
  Image,
  Mountain,
  Pause,
  Ship,
  Sparkles,
  Sun,
  Trees,
  Users,
  Waves,
  Waypoints,
} from "lucide-react";
import type { ScriptSegmentMarker, ScriptSegmentRole } from "./script-studio";

export type ScriptVisualHintKind =
  | "waterfall"
  | "water"
  | "boat"
  | "canyon"
  | "city"
  | "wildlife"
  | "swim"
  | "trail"
  | "sunset"
  | "sponsor"
  | "landscape"
  | "pause"
  | "generic";

export interface ScriptVisualHint {
  kind: ScriptVisualHintKind;
  label: string;
  icon: LucideIcon;
  iconClassName: string;
}

interface HintRule {
  kind: ScriptVisualHintKind;
  label: string;
  icon: LucideIcon;
  iconClassName: string;
  patterns: RegExp[];
}

const HINT_RULES: HintRule[] = [
  {
    kind: "pause",
    label: "Visual pause / hold",
    icon: Pause,
    iconClassName: "text-violet-400/90",
    patterns: [/^\[pause(?:\s+\d+(?:\.\d+)?s)?\]$/i, /^-{3,}$/],
  },
  {
    kind: "waterfall",
    label: "Waterfall",
    icon: Waves,
    iconClassName: "text-sky-500/90",
    patterns: [
      /\bwaterfall?s?\b/i,
      /\bcascat/i,
      /\bdiquadinha\b/i,
      /\bfalls?\b/i,
    ],
  },
  {
    kind: "boat",
    label: "Boat / on water",
    icon: Ship,
    iconClassName: "text-blue-500/90",
    patterns: [
      /\bboat\b/i,
      /\bhull\b/i,
      /\bspeedboat/i,
      /\bgliding across\b/i,
      /\bdrifted back\b/i,
      /\bferry\b/i,
    ],
  },
  {
    kind: "wildlife",
    label: "Wildlife / birds",
    icon: Bird,
    iconClassName: "text-emerald-500/90",
    patterns: [
      /\btoucan/i,
      /\bmacaw/i,
      /\bbird/i,
      /\bwildlife\b/i,
      /\bbiodivers/i,
      /\bcerrado\b/i,
    ],
  },
  {
    kind: "swim",
    label: "Swimming / pools",
    icon: Waves,
    iconClassName: "text-cyan-500/90",
    patterns: [
      /\bswim/i,
      /\bpool/i,
      /\bnatural pools?\b/i,
      /\bturquoise\b/i,
      /\blagoon\b/i,
    ],
  },
  {
    kind: "canyon",
    label: "Canyon / cliffs",
    icon: Mountain,
    iconClassName: "text-stone-500/90",
    patterns: [
      /\bcanyon/i,
      /\bcliff/i,
      /\blookout\b/i,
      /\bquartzite\b/i,
      /\bpenhasco/i,
      /\bvalley\b/i,
      /\bwalls?\b/i,
    ],
  },
  {
    kind: "trail",
    label: "Trail / path",
    icon: Waypoints,
    iconClassName: "text-amber-600/85",
    patterns: [
      /\btrail/i,
      /\bpath\b/i,
      /\bwander/i,
      /\bdescend/i,
      /\bclimb/i,
      /\bupper trails?\b/i,
    ],
  },
  {
    kind: "sunset",
    label: "Golden hour / light",
    icon: Sun,
    iconClassName: "text-amber-400/90",
    patterns: [
      /\bgolden hour\b/i,
      /\bsunset\b/i,
      /\blate light\b/i,
      /\bsun (?:dips?|sets?)\b/i,
      /\bglow\b/i,
    ],
  },
  {
    kind: "city",
    label: "Town / visitors",
    icon: Users,
    iconClassName: "text-orange-500/85",
    patterns: [
      /\bvisitor/i,
      /\bresidents?\b/i,
      /\btown\b/i,
      /\bcity\b/i,
      /\bmillion\b/i,
      /\btourism\b/i,
    ],
  },
  {
    kind: "sponsor",
    label: "Partner / CTA",
    icon: Handshake,
    iconClassName: "text-accent/90",
    patterns: [
      /\bmade possible by\b/i,
      /\bpartner/i,
      /\bsponsor/i,
      /\blink in the description\b/i,
      /\bleave your email\b/i,
      /\bturismo\b/i,
      /\bagency\b/i,
      /\b360go\b/i,
    ],
  },
  {
    kind: "water",
    label: "Lake / reservoir",
    icon: Waves,
    iconClassName: "text-sky-400/90",
    patterns: [
      /\blake\b/i,
      /\breservoir\b/i,
      /\bsea of\b/i,
      /\bshoreline\b/i,
      /\bhorizon\b/i,
      /\bdam\b/i,
      /\brio grande\b/i,
    ],
  },
  {
    kind: "landscape",
    label: "Landscape / vista",
    icon: Trees,
    iconClassName: "text-green-600/80",
    patterns: [
      /\blandscape\b/i,
      /\bhighlands?\b/i,
      /\bmeadow\b/i,
      /\bforest/i,
      /\bmountain/i,
      /\bscenic\b/i,
      /\bpanoram/i,
    ],
  },
  {
    kind: "city",
    label: "Architecture / place",
    icon: Building2,
    iconClassName: "text-muted-foreground",
    patterns: [/\btown of\b/i, /\bminas gerais\b/i, /\bcapit[óo]lio\b/i],
  },
];

const GENERIC_HINT: ScriptVisualHint = {
  kind: "generic",
  label: "Scene",
  icon: Image,
  iconClassName: "text-muted-foreground/70",
};

const ROLE_FALLBACK: Partial<Record<ScriptSegmentRole, ScriptVisualHint>> = {
  intro: {
    kind: "landscape",
    label: "Opening hook",
    icon: Sparkles,
    iconClassName: "text-sky-400/80",
  },
  cta: {
    kind: "sponsor",
    label: "Call to action",
    icon: Handshake,
    iconClassName: "text-accent/90",
  },
  pause: {
    kind: "pause",
    label: "Visual pause",
    icon: Pause,
    iconClassName: "text-violet-400/90",
  },
};

export function inferParagraphVisualHint(
  text: string,
  role?: ScriptSegmentRole,
): ScriptVisualHint | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  for (const rule of HINT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(trimmed))) {
      return {
        kind: rule.kind,
        label: rule.label,
        icon: rule.icon,
        iconClassName: rule.iconClassName,
      };
    }
  }

  if (role && ROLE_FALLBACK[role]) {
    return ROLE_FALLBACK[role]!;
  }

  return GENERIC_HINT;
}

export function buildScriptVisualHints(
  markers: ScriptSegmentMarker[],
): Array<ScriptVisualHint | null> {
  return markers.map((marker) =>
    inferParagraphVisualHint(marker.displayText, marker.role),
  );
}
