"use client";

import * as React from "react";
import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  className?: string;
  accent?: "default" | "emerald" | "amber" | "cyan";
  compact?: boolean;
}

export function TimelineVolumeSlider({
  value,
  onChange,
  label,
  className,
  accent = "default",
  compact = false,
}: Props) {
  const muted = value === 0;
  const trackClass =
    accent === "emerald"
      ? "accent-emerald-400"
      : accent === "amber"
        ? "accent-amber-400"
        : accent === "cyan"
          ? "accent-cyan-400"
          : "accent-sky-400";

  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <div className="flex items-center justify-between gap-1">
        {label && (
          <span className="truncate text-[9px] font-medium uppercase tracking-wide text-white/60">
            {label}
          </span>
        )}
        <button
          type="button"
          onClick={() => onChange(muted ? 100 : 0)}
          className="shrink-0 rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white/90"
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn(
          "h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15",
          trackClass,
          compact ? "max-w-[52px]" : "max-w-full",
        )}
        aria-label={label ? `${label} volume` : "Volume"}
      />
      {!compact && (
        <span className="text-right font-mono text-[9px] text-white/45">{value}%</span>
      )}
    </div>
  );
}
