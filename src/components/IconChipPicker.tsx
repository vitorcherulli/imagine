"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { CreativeOption } from "@/lib/project-creative-options";

interface Props {
  options: CreativeOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  compact?: boolean;
}

export function IconChipPicker({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  disabled,
  compact,
}: Props) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("flex flex-wrap", compact ? "gap-1" : "gap-2", className)}
    >
      {options.map((option) => {
        const active = value === option.id;
        const Icon = option.icon;

        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.label}
            disabled={disabled}
            onClick={() => {
              if (disabled || active) return;
              onChange(option.id);
            }}
            className={cn(
              "group flex flex-col items-center gap-1 rounded-lg transition-colors",
              compact ? "w-[3.75rem] p-0.5" : "w-[4.5rem] p-1",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            <span
              className={cn(
                "flex items-center justify-center rounded-full border transition-colors",
                compact ? "h-8 w-8" : "h-10 w-10",
                active
                  ? "border-accent bg-accent/15 text-accent ring-2 ring-accent/30"
                  : "border-border bg-muted/40 text-muted-foreground group-hover:border-accent/40 group-hover:bg-muted group-hover:text-foreground",
              )}
            >
              <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
            </span>
            <span
              className={cn(
                "w-full truncate text-center leading-tight",
                compact ? "text-[9px]" : "text-[10px]",
                active ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
