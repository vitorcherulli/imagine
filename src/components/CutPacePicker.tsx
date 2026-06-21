"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  CUT_PACE_OPTIONS,
  NARRATION_MODE_OPTIONS,
  type CutPaceId,
  type NarrationModeId,
} from "@/lib/cut-pace";

interface CutPacePickerProps {
  value: CutPaceId;
  onChange: (value: CutPaceId) => void;
  className?: string;
}

export function CutPacePicker({ value, onChange, className }: CutPacePickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Cut pace"
      className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", className)}
    >
      {CUT_PACE_OPTIONS.map((option) => {
        const active = value === option.id;
        const Icon = option.icon;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.hint}
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded-lg border p-2 text-left transition-colors",
              active
                ? "border-accent bg-accent/10 ring-1 ring-accent/40"
                : "border-border bg-background hover:border-accent/30 hover:bg-muted/40",
            )}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border",
                  active
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border text-muted-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="text-xs font-medium">{option.label}</span>
            </div>
            <p className="mt-1 text-[10px] leading-tight text-muted-foreground">{option.hint}</p>
          </button>
        );
      })}
    </div>
  );
}

interface NarrationModePickerProps {
  value: NarrationModeId;
  onChange: (value: NarrationModeId) => void;
  className?: string;
}

export function NarrationModePicker({ value, onChange, className }: NarrationModePickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Narration mode"
      className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2", className)}
    >
      {NARRATION_MODE_OPTIONS.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.hint}
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded-lg border p-2.5 text-left transition-colors",
              active
                ? "border-accent bg-accent/10 ring-1 ring-accent/40"
                : "border-border bg-background hover:border-accent/30 hover:bg-muted/40",
            )}
          >
            <span className="text-xs font-medium">{option.label}</span>
            <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{option.hint}</p>
          </button>
        );
      })}
    </div>
  );
}
