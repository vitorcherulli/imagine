import { z } from "zod";
import { normalizeTtsSpeed } from "./narration-speed";

export function resolveProjectTtsSpeed(project: { ttsSpeed?: number | null }): number {
  return normalizeTtsSpeed(project.ttsSpeed ?? 1);
}

export const ttsSpeedBodySchema = z.object({
  speed: z.number().min(0.75).max(1.35).optional(),
});

export async function parseTtsSpeedFromRequest(
  req: Request,
  project: { ttsSpeed?: number | null },
): Promise<number> {
  try {
    const body = await req.json();
    const parsed = ttsSpeedBodySchema.safeParse(body);
    if (parsed.success && parsed.data.speed !== undefined) {
      return normalizeTtsSpeed(parsed.data.speed);
    }
  } catch {
    // empty body is fine
  }
  return resolveProjectTtsSpeed(project);
}
