/** How imported/uploaded keyframes are framed to the project aspect ratio. */
export type KeyframeFitMode = "contain" | "cover";

export interface KeyframeFitOption {
  value: KeyframeFitMode;
  label: string;
  hint: string;
}

export const KEYFRAME_FIT_OPTIONS: KeyframeFitOption[] = [
  {
    value: "cover",
    label: "Fill",
    hint: "Fills the project frame (16:9 or 9:16) — may crop edges",
  },
  {
    value: "contain",
    label: "Fit",
    hint: "Shows the full image — may add letterbox bars",
  },
];

export function normalizeKeyframeFitMode(value: unknown): KeyframeFitMode {
  return value === "contain" ? "contain" : "cover";
}

export function keyframeFitModeLabel(mode: KeyframeFitMode): string {
  return KEYFRAME_FIT_OPTIONS.find((o) => o.value === mode)?.label ?? "Fill";
}
