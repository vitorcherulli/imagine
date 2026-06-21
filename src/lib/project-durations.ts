export const PROJECT_DURATIONS = [
  { label: "30 seconds", value: 30 },
  { label: "1 min", value: 60 },
  { label: "90 sec", value: 90 },
  { label: "3 min", value: 180 },
  { label: "5 min", value: 300 },
  { label: "10 min", value: 600 },
  { label: "15 min", value: 900 },
] as const;

export const DEFAULT_PROJECT_DURATION_SECONDS = 30;

export function isValidProjectDuration(seconds: number): boolean {
  return PROJECT_DURATIONS.some((d) => d.value === seconds);
}
