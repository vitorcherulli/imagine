"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  PROJECT_SCRIPT_LANGUAGE_OPTIONS,
  normalizeProjectScriptLanguage,
  type ProjectScriptLanguage,
} from "@/lib/project-language";

interface ProjectScriptLanguagePickerProps {
  value: ProjectScriptLanguage;
  onChange: (value: ProjectScriptLanguage) => void;
  className?: string;
  compact?: boolean;
}

export function ProjectScriptLanguagePicker({
  value,
  onChange,
  className,
  compact,
}: ProjectScriptLanguagePickerProps) {
  const normalized = normalizeProjectScriptLanguage(value);

  return (
    <div
      role="radiogroup"
      aria-label="Script language"
      className={cn(
        compact ? "grid grid-cols-3 gap-1" : "grid grid-cols-3 gap-2",
        className,
      )}
    >
      {PROJECT_SCRIPT_LANGUAGE_OPTIONS.map((option) => {
        const active = normalized === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.label}
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded-lg border text-left transition-colors",
              compact ? "px-2 py-1.5" : "p-2",
              active
                ? "border-accent bg-accent/10 ring-1 ring-accent/40"
                : "border-border bg-background hover:border-accent/30 hover:bg-muted/40",
            )}
          >
            <span className={cn("block font-medium", compact ? "text-[10px]" : "text-xs")}>
              {option.nativeLabel}
            </span>
            {!compact ? (
              <span className="mt-0.5 block text-[10px] text-muted-foreground">{option.label}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
