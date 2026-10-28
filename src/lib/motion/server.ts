import { createId } from "@paralleldrive/cuid2";
import { desc, eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { MotionDesign, NewMotionDesign } from "@/lib/db/schema";
import { DEFAULT_MOTION_PROPS, type MotionProps } from "./types";
import { getMotionTemplate } from "./templates";
import { chatCompletion, extractJson } from "@/lib/openrouter/llm";

export interface MotionChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Props resultantes (no assistant) para permitir undo/replay. */
  props?: MotionProps;
  createdAt: number;
}

const STRING_KEYS = ["tag", "title", "subtitle", "cta", "logoUrl"] as const;
const COLOR_KEYS = ["primary", "accent", "bg"] as const;

/** Mescla `patch` no estado atual aceitando apenas campos válidos e com coerção de tipo. */
export function sanitizeProps(current: MotionProps, patch: unknown): MotionProps {
  const next: MotionProps = { ...current };
  if (!patch || typeof patch !== "object") return next;
  const p = patch as Record<string, unknown>;

  for (const key of STRING_KEYS) {
    if (typeof p[key] === "string") next[key] = (p[key] as string).slice(0, 600);
  }
  for (const key of COLOR_KEYS) {
    const val = p[key];
    if (typeof val === "string") {
      const hex = val.trim();
      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) next[key] = hex;
      else if (/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) next[key] = `#${hex}`;
    }
  }
  if (typeof p.duration === "number" && Number.isFinite(p.duration)) {
    next.duration = Math.min(30, Math.max(3, Math.round(p.duration * 2) / 2));
  }
  return next;
}

export function parseProps(raw: string | null | undefined, templateId: string): MotionProps {
  const base = { ...DEFAULT_MOTION_PROPS, ...getMotionTemplate(templateId).defaultProps };
  if (!raw) return base;
  try {
    return sanitizeProps(base, JSON.parse(raw));
  } catch {
    return base;
  }
}

export function parseMessages(raw: string | null | undefined): MotionChatMessage[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as MotionChatMessage[]) : [];
  } catch {
    return [];
  }
}

export async function listMotionDesigns(userId: string): Promise<MotionDesign[]> {
  return db
    .select()
    .from(schema.motionDesigns)
    .where(eq(schema.motionDesigns.userId, userId))
    .orderBy(desc(schema.motionDesigns.updatedAt));
}

export async function getOwnedMotionDesign(id: string, userId: string): Promise<MotionDesign | null> {
  const [row] = await db
    .select()
    .from(schema.motionDesigns)
    .where(and(eq(schema.motionDesigns.id, id), eq(schema.motionDesigns.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createMotionDesign(
  userId: string,
  templateId: string,
  title?: string,
): Promise<MotionDesign> {
  const t = getMotionTemplate(templateId);
  const props = { ...t.defaultProps };
  const values: NewMotionDesign = {
    id: createId(),
    userId,
    title: title?.trim() || props.title.replace(/\*/g, "") || t.name,
    templateId: t.id,
    props: JSON.stringify(props),
    messages: "[]",
  };
  const [row] = await db.insert(schema.motionDesigns).values(values).returning();
  return row;
}

export async function updateMotionDesign(
  id: string,
  patch: Partial<Pick<MotionDesign, "title" | "props" | "messages" | "outputUrl" | "thumbUrl" | "status">>,
): Promise<void> {
  await db
    .update(schema.motionDesigns)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.motionDesigns.id, id));
}

export async function deleteMotionDesign(id: string): Promise<void> {
  await db.delete(schema.motionDesigns).where(eq(schema.motionDesigns.id, id));
}

/**
 * Edição por chat: envia o estado atual + instrução ao LLM e devolve
 * { reply, props } já sanitizado. Suporta o marcador *destaque*.
 */
export async function applyChatEdit(input: {
  templateId: string;
  props: MotionProps;
  history: MotionChatMessage[];
  message: string;
}): Promise<{ reply: string; props: MotionProps }> {
  const { templateId, props, history, message } = input;
  const template = getMotionTemplate(templateId);

  const convo = history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Usuário" : "Editor"}: ${m.content}`)
    .join("\n");

  const system = [
    "Você é um editor de Motion Design dentro do app Imagine. Você recebe o estado atual de uma peça animada e uma instrução do usuário em linguagem natural, e devolve a peça atualizada.",
    "",
    `Modelo/template atual: ${template.name} (${template.description})`,
    "",
    "Campos editáveis (chave: descrição):",
    "- tag: selo/etiqueta curta no topo",
    "- title: título grande. Use *palavra* para destacar em cor de acento (pode ter várias).",
    "- subtitle: subtítulo",
    "- cta: texto do botão/chamada final",
    "- logoUrl: URL da logomarca (deixe vazio para remover)",
    "- primary: cor principal em hex, ex: #5AD1C4",
    "- accent: cor de destaque em hex",
    "- bg: cor de fundo em hex",
    "- duration: duração total em segundos (3 a 30)",
    "",
    "Regras:",
    "- Respeite o idioma do texto pedido pelo usuário.",
    "- Mantenha os campos que o usuário não mencionou exatamente como estão.",
    "- Escreva textos curtos e de impacto, adequados a uma peça animada rápida.",
    "- Não invente campos fora da lista.",
    "",
    "Responda SOMENTE com JSON no formato:",
    '{ "reply": "uma frase curta confirmando a mudança em português", "props": { ...objeto completo e atualizado com todos os campos acima... } }',
  ].join("\n");

  const userMsg = `Estado atual (JSON):\n${JSON.stringify(props, null, 2)}\n\n${
    convo ? `Conversa anterior:\n${convo}\n\n` : ""
  }Instrução do usuário: ${message}`;

  const raw = await chatCompletion({
    messages: [
      { role: "system", content: system },
      { role: "user", content: userMsg },
    ],
    temperature: 0.6,
    response_format: { type: "json_object" },
  });

  const parsed = extractJson<{ reply?: string; props?: unknown }>(raw);
  const nextProps = sanitizeProps(props, parsed.props);
  const reply = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : "Atualizado.";
  return { reply, props: nextProps };
}
