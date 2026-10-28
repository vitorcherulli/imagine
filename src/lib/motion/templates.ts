import {
  DEFAULT_MOTION_PROPS,
  type MotionField,
  type MotionProps,
  type MotionTemplate,
} from "./types";

const baseFields: MotionField[] = [
  { key: "tag", label: "Selo / etiqueta", kind: "text", group: "Texto", help: "Pequena etiqueta no topo." },
  {
    key: "title",
    label: "Título",
    kind: "textarea",
    group: "Texto",
    help: "Use *palavra* para destacar em cor de acento.",
  },
  { key: "subtitle", label: "Subtítulo", kind: "textarea", group: "Texto" },
  { key: "cta", label: "Botão / chamada", kind: "text", group: "Texto" },
  { key: "logoUrl", label: "Logo (URL)", kind: "image", group: "Marca", help: "Endereço da sua logomarca." },
  { key: "primary", label: "Cor principal", kind: "color", group: "Cores" },
  { key: "accent", label: "Cor de destaque", kind: "color", group: "Cores" },
  { key: "bg", label: "Fundo", kind: "color", group: "Cores" },
  { key: "duration", label: "Duração (s)", kind: "number", group: "Ritmo", min: 3, max: 30, step: 0.5 },
];

export const MOTION_TEMPLATES: MotionTemplate[] = [
  {
    id: "bold-intro",
    name: "Intro Bold",
    description: "Tipografia cinematográfica com selo, título gigante e chamada final. Ideal para aberturas.",
    aspect: "9:16",
    width: 1080,
    height: 1920,
    fps: 30,
    thumb: "Intro",
    defaultProps: {
      ...DEFAULT_MOTION_PROPS,
      tag: "PROCESSO SIMPLES",
      title: "Sua própria *revenda* White Label",
      subtitle: "mesmo que você nunca tenha trabalhado com software",
      cta: "FALE COM A GENTE",
    },
    fields: baseFields,
  },
  {
    id: "promo-social",
    name: "Promo Social",
    description: "Peça de impacto com logo, fundo animado e CTA. Perfeita para Reels e anúncios.",
    aspect: "9:16",
    width: 1080,
    height: 1920,
    fps: 30,
    thumb: "Promo",
    defaultProps: {
      ...DEFAULT_MOTION_PROPS,
      tag: "OFERTA",
      title: "A *oportunidade* do século",
      subtitle: "Tecnologia pronta para vender. Você só coloca a sua marca.",
      cta: "QUERO COMEÇAR",
    },
    fields: baseFields,
  },
];

export function getMotionTemplate(id: string): MotionTemplate {
  return MOTION_TEMPLATES.find((t) => t.id === id) ?? MOTION_TEMPLATES[0];
}

export function defaultPropsFor(templateId: string): MotionProps {
  return { ...getMotionTemplate(templateId).defaultProps };
}

/** Descrição dos campos editáveis para o prompt do chat (LLM). */
export function describeEditableFields(templateId: string): string {
  const t = getMotionTemplate(templateId);
  return t.fields
    .map((f) => `- ${String(f.key)} (${f.label}${f.kind === "color" ? ", cor hex" : ""}${f.help ? `: ${f.help}` : ""})`)
    .join("\n");
}
