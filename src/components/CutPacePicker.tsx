"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  CUT_PACE_OPTIONS,
  type CutPaceId,
} from "@/lib/cut-pace";

interface CutPacePickerProps {
  value: CutPaceId;
  onChange: (value: CutPaceId) => void;
  className?: string;
  compact?: boolean;
}

export function CutPacePicker({ value, onChange, className, compact }: CutPacePickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Cut pace"
      className={cn(
        compact ? "grid grid-cols-4 gap-1" : "grid grid-cols-2 gap-2 sm:grid-cols-4",
        className,
      )}
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
            title={compact ? `${option.label} — ${option.hint}` : option.hint}
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded-lg border text-left transition-colors",
              compact ? "p-1.5" : "p-2",
              active
                ? "border-accent bg-accent/10 ring-1 ring-accent/40"
                : "border-border bg-background hover:border-accent/30 hover:bg-muted/40",
            )}
          >
            <div className={cn("flex items-center", compact ? "flex-col gap-1" : "gap-1.5")}>
              <span
                className={cn(
                  "flex items-center justify-center rounded-full border",
                  compact ? "h-6 w-6" : "h-7 w-7",
                  active
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border text-muted-foreground",
                )}
              >
                <Icon className="h-3 w-3" />
              </span>
              <span className={cn("font-medium", compact ? "text-[9px] leading-none" : "text-xs")}>
                {option.label}
              </span>
            </div>
            {!compact ? (
              <p className="mt-1 text-[10px] leading-tight text-muted-foreground">{option.hint}</p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
