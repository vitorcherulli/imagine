"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Dna, ExternalLink } from "lucide-react";
import type { ProjectDna } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { PROJECT_IDENTITY_HINT, PROJECT_IDENTITY_LABEL } from "@/lib/project-identity";

interface Props {
  items: ProjectDna[];
  value: string | null;
  onChange: (id: string | null) => void;
  manageHref?: string;
  disabled?: boolean;
}

export function ProjectDnaPicker({
  items,
  value,
  onChange,
  manageHref = "/dna",
  disabled,
}: Props) {
  if (items.length === 0) {
    return (
      <div className="space-y-1.5">
        <Link
          href={manageHref}
          className="flex items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2 text-2xs text-muted-foreground hover:border-accent/40 hover:bg-muted/60"
        >
          <Dna className="h-3.5 w-3.5" />
          No project DNA yet — create your series or brand identity.
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-muted-foreground">{PROJECT_IDENTITY_HINT}</p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(null)}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
            "disabled:cursor-not-allowed disabled:opacity-60",
            value === null
              ? "border-accent bg-accent/10 ring-1 ring-accent/40"
              : "border-border bg-background hover:border-accent/30 hover:bg-muted/40",
          )}
        >
          <span className="text-xs font-medium text-muted-foreground">None</span>
        </button>
        {items.map((item) => {
          const active = value === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(item.id)}
              className={cn(
                "relative flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
                "disabled:cursor-not-allowed disabled:opacity-60",
                active
                  ? "border-accent bg-accent/10 ring-1 ring-accent/40"
                  : "border-border bg-background hover:border-accent/30 hover:bg-muted/40",
              )}
            >
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-muted">
                {item.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.logoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <Dna className="h-4 w-4" />
                  </div>
                )}
                {active && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{item.name}</p>
                {item.description?.trim() ? (
                  <p className="line-clamp-2 text-[10px] text-muted-foreground">{item.description}</p>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
      <Link
        href={manageHref}
        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
      >
        <ExternalLink className="h-3 w-3" />
        Manage {PROJECT_IDENTITY_LABEL.toLowerCase()} library
      </Link>
    </div>
  );
}
