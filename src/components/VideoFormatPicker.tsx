"use client";

import * as React from "react";
import { Monitor, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { VIDEO_FORMATS, type VideoFormat } from "@/lib/video-format";

const FORMAT_IDS: VideoFormat[] = ["horizontal", "vertical"];

interface Props {
  value: VideoFormat;
  onChange: (format: VideoFormat) => void;
  className?: string;
  disabled?: boolean;
  compact?: boolean;
}

export function VideoFormatPicker({ value, onChange, className, disabled, compact }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Video format"
      className={cn("grid grid-cols-2 gap-2", className)}
    >
      {FORMAT_IDS.map((id) => {
        const fmt = VIDEO_FORMATS[id];
        const active = value === id;
        const Icon = id === "vertical" ? Smartphone : Monitor;

        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => {
              if (disabled || active) return;
              onChange(id);
            }}
            className={cn(
              "relative z-10 w-full cursor-pointer rounded-lg border text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-60",
              compact ? "p-2" : "p-3",
              active
                ? "border-accent bg-accent/10 ring-1 ring-accent/40"
                : "border-border bg-background hover:border-accent/30 hover:bg-muted/40",
            )}
          >
            <div className="pointer-events-none flex items-center gap-2">
              <Icon className={cn("h-4 w-4", active ? "text-accent" : "text-muted-foreground")} />
              <span className="text-xs font-medium">{fmt.label}</span>
            </div>
            {!compact ? (
              <>
                <p className="pointer-events-none mt-1 text-2xs text-muted-foreground">{fmt.description}</p>
                <p className="pointer-events-none mt-1 text-2xs font-mono text-muted-foreground/80">
                  {fmt.shortLabel}
                </p>
              </>
            ) : (
              <p className="pointer-events-none mt-0.5 text-[10px] text-muted-foreground">
                {fmt.shortLabel}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
