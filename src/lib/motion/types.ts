// Tipos do sistema de Motion Design (modelos animados parametrizáveis).
// O mesmo MotionProps alimenta: controles da tela · preview (@remotion/player) · chat (LLM) · render MP4.

export type MotionFieldKind = "text" | "textarea" | "color" | "number" | "image";

export interface MotionField {
  /** Caminho do valor dentro de MotionProps, ex.: "title" ou "duration". */
  key: keyof MotionProps;
  label: string;
  kind: MotionFieldKind;
  group: "Texto" | "Cores" | "Marca" | "Ritmo";
  help?: string;
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Estado editável de uma peça de motion.
 * `title` e `subtitle` aceitam o marcador `*destaque*` para colorir com o accent.
 */
export interface MotionProps {
  tag: string;
  title: string;
  subtitle: string;
  cta: string;
  logoUrl: string;
  /** cor principal (texto/gradiente) */
  primary: string;
  /** cor de destaque (palavras marcadas, detalhes) */
  accent: string;
  /** cor de fundo */
  bg: string;
  /** duração total em segundos */
  duration: number;
  /** index signature para satisfazer o Record<string, unknown> do Remotion */
  [key: string]: unknown;
}

export type MotionAspect = "9:16" | "16:9" | "1:1";

export interface MotionTemplate {
  id: string;
  name: string;
  description: string;
  aspect: MotionAspect;
  width: number;
  height: number;
  fps: number;
  /** sugestão de título exibida no card da biblioteca */
  thumb: string;
  defaultProps: MotionProps;
  fields: MotionField[];
}

export const DEFAULT_MOTION_PROPS: MotionProps = {
  tag: "NOVIDADE",
  title: "Sua marca em *movimento*",
  subtitle: "Crie peças animadas em minutos, sem editar vídeo.",
  cta: "COMEÇAR AGORA",
  logoUrl: "",
  primary: "#5AD1C4",
  accent: "#8FF0DE",
  bg: "#081A1D",
  duration: 8,
};

/** Divide preservando as palavras marcadas com *asteriscos* (destaque). */
export function splitEmphasis(text: string): { text: string; emphasis: boolean }[] {
  const parts: { text: string; emphasis: boolean }[] = [];
  const regex = /\*([^*]+)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index), emphasis: false });
    parts.push({ text: match[1], emphasis: true });
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push({ text: text.slice(last), emphasis: false });
  return parts.filter((p) => p.text.length > 0);
}
