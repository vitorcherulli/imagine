"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ExternalLink, Mountain } from "lucide-react";
import type { Scenario } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

interface Props {
  items: Scenario[];
  value: string | null;
  onChange: (id: string | null) => void;
  manageHref?: string;
  disabled?: boolean;
}

export function ScenarioPicker({
  items,
  value,
  onChange,
  manageHref = "/scenarios",
  disabled,
}: Props) {
  if (items.length === 0) {
    return (
      <Link
        href={manageHref}
        className="flex items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2 text-2xs text-muted-foreground hover:border-accent/40 hover:bg-muted/60"
      >
        <Mountain className="h-3.5 w-3.5" />
        No scenarios yet — add real or AI environments to reuse across scenes.
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(null)}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-60",
          value === null
            ? "border-accent bg-accent/10 text-foreground ring-1 ring-accent/40"
            : "border-border bg-background text-muted-foreground hover:border-accent/30 hover:bg-muted/40",
        )}
      >
        None
      </button>

      {items.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(item.id)}
            title={item.description?.trim() || item.name}
            className={cn(
              "relative flex h-9 max-w-[180px] items-center gap-1.5 rounded-lg border py-1 pl-1 pr-2.5 text-left transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-60",
              active
                ? "border-accent bg-accent/10 ring-1 ring-accent/40"
                : "border-border bg-background hover:border-accent/30 hover:bg-muted/40",
            )}
          >
            <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md bg-muted">
              {item.primaryImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.primaryImageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Mountain className="h-3.5 w-3.5" />
                </span>
              )}
            </span>
            <span className="truncate text-xs font-medium">{item.name}</span>
            {active && (
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Check className="h-2.5 w-2.5" />
              </span>
            )}
          </button>
        );
      })}

      <Link
        href={manageHref}
        className="inline-flex h-9 items-center gap-1 rounded-lg border border-dashed border-border px-2.5 text-[10px] text-muted-foreground hover:border-accent/40 hover:text-foreground"
      >
        <ExternalLink className="h-3 w-3" />
        Manage scenarios
      </Link>
    </div>
  );
}
