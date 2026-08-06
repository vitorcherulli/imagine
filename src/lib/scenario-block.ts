import { eq } from "drizzle-orm";
import type { Project, Scenario, StoryBlock } from "@/lib/db/schema";
import { db, schema } from "@/lib/db";

export async function fetchScenarioById(id: string | null | undefined): Promise<Scenario | null> {
  if (!id) return null;
  const [row] = await db
    .select()
    .from(schema.scenarios)
    .where(eq(schema.scenarios.id, id))
    .limit(1);
  return row ?? null;
}

/** Resolve the scenario id for a block: block override > project default. "__none__" disables. */
export function resolveBlockScenarioId(
  block: Pick<StoryBlock, "scenarioId">,
  project: Pick<Project, "scenarioId">,
): string | null {
  if (block.scenarioId === "__none__") return null;
  if (block.scenarioId) return block.scenarioId;
  return project.scenarioId ?? null;
}

export async function resolveBlockScenario(
  block: Pick<StoryBlock, "scenarioId">,
  project: Pick<Project, "scenarioId">,
): Promise<Scenario | null> {
  return fetchScenarioById(resolveBlockScenarioId(block, project));
}

export function scenarioHintForPrompt(scenario: Scenario | null): string {
  if (!scenario) return "";
  const desc = scenario.description?.trim();
  return (
    ` Environment/setting reference: "${scenario.name}" — match its architecture, landscape, materials, palette and light from the reference photos. Do NOT copy any people from the references; only the place.` +
    (desc ? ` Location notes: ${desc}.` : "")
  );
}

export async function scenarioReferenceImages(
  scenario: Scenario | null,
): Promise<string[] | undefined> {
  if (!scenario) return undefined;
  const { readImageAsDataUrl } = await import("@/lib/storage");
  const urls = JSON.parse(scenario.imageUrls || "[]") as string[];
  const ordered = [
    ...(scenario.primaryImageUrl ? [scenario.primaryImageUrl] : []),
    ...urls,
  ].filter((url, index, arr) => url && arr.indexOf(url) === index);

  if (ordered.length === 0) return undefined;

  const dataUrls = await Promise.all(ordered.slice(0, 2).map((u) => readImageAsDataUrl(u)));
  return dataUrls.filter(Boolean);
}
