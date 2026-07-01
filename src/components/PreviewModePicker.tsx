"use client";

import { cn } from "@/lib/utils";
import {
  PREVIEW_MODE_OPTIONS,
  PROJECT_PREVIEW_MODE_OPTIONS,
  type PreviewMode,
  type ProjectPreviewMode,
} from "@/lib/preview-settings";

export function PreviewModePicker({
  value,
  onChange,
  includeAuto = false,
}: {
  value: PreviewMode | ProjectPreviewMode;
  onChange: (mode: PreviewMode | ProjectPreviewMode) => void;
  includeAuto?: boolean;
}) {
  const options = includeAuto ? PROJECT_PREVIEW_MODE_OPTIONS : PREVIEW_MODE_OPTIONS;

  return (
    <div className="grid gap-2">
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded-md border px-3 py-2 text-left transition-colors",
              selected
                ? "border-accent bg-accent/10 ring-1 ring-accent/30"
                : "border-border bg-background hover:bg-muted/50",
            )}
          >
            <div className="text-sm font-medium">{option.label}</div>
            <div className="mt-0.5 text-2xs text-muted-foreground">{option.description}</div>
          </button>
        );
      })}
    </div>
  );
}
