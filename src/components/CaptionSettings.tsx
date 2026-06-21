"use client";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CAPTION_MODE_OPTIONS, type CaptionMode } from "@/lib/captions";

interface Props {
  value: CaptionMode;
  onChange: (mode: CaptionMode) => void;
  disabled?: boolean;
}

export function CaptionSettings({ value, onChange, disabled }: Props) {
  return (
    <div>
      <Label className="text-2xs text-muted-foreground">On-screen captions</Label>
      <p className="mb-1.5 mt-0.5 text-2xs text-muted-foreground">
        Uses each block&apos;s narration text as captions in preview and MP4 export.
      </p>
      <div role="radiogroup" aria-label="On-screen captions" className="space-y-1.5">
        {CAPTION_MODE_OPTIONS.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => {
                if (disabled || active) return;
                onChange(opt.id);
              }}
              className={cn(
                "relative z-10 w-full cursor-pointer rounded-lg border px-2.5 py-2 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-60",
                active
                  ? "border-accent bg-accent/10 ring-1 ring-accent/40"
                  : "border-border bg-background hover:border-accent/30 hover:bg-muted/40",
              )}
            >
              <span className="pointer-events-none text-xs font-medium">{opt.label}</span>
              {opt.hint ? (
                <p className="pointer-events-none mt-0.5 text-2xs text-muted-foreground">{opt.hint}</p>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
