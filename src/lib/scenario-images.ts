import type { Scenario } from "@/lib/db/schema";

export const MAX_SCENARIO_IMAGES = 8;

export function parseScenarioImageUrls(scenario: Pick<Scenario, "imageUrls">): string[] {
  try {
    const arr = JSON.parse(scenario.imageUrls || "[]");
    return Array.isArray(arr)
      ? arr.filter((u): u is string => typeof u === "string" && !!u.trim())
      : [];
  } catch {
    return [];
  }
}

export function normalizeScenarioImages(input: {
  imageUrls: string[];
  primaryImageUrl?: string | null;
}): { imageUrls: string[]; primaryImageUrl: string | null } {
  const unique = [...new Set(input.imageUrls.map((u) => u.trim()).filter(Boolean))].slice(
    0,
    MAX_SCENARIO_IMAGES,
  );
  const primary =
    input.primaryImageUrl && unique.includes(input.primaryImageUrl)
      ? input.primaryImageUrl
      : unique[0] ?? null;
  return { imageUrls: unique, primaryImageUrl: primary };
}
