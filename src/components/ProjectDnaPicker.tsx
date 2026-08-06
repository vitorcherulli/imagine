"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Dna, ExternalLink } from "lucide-react";
import type { ProjectDna } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { PROJECT_IDENTITY_LABEL } from "@/lib/project-identity";
import { formatDnaStyleSummary } from "@/lib/dna-style";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Props {
  items: ProjectDna[];
  value: string | null;
  onChange: (id: string | null) => void;
  manageHref?: string;
  disabled?: boolean;
}

function DnaChipTooltip({ item }: { item: ProjectDna }) {
  const styleSummary = formatDnaStyleSummary(item);
  return (
    <div className="max-w-[240px] space-y-1">
      <p className="text-xs font-semibold">{item.name}</p>
      {item.description?.trim() ? (
        <p className="text-[11px] leading-snug text-muted-foreground">{item.description}</p>
      ) : null}
      {styleSummary ? (
        <p className="text-[11px] leading-snug text-accent">{styleSummary}</p>
      ) : null}
    </div>
  );
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
    <TooltipProvider delayDuration={150}>
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
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(item.id)}
                  className={cn(
                    "relative flex h-9 max-w-[180px] items-center gap-1.5 rounded-lg border py-1 pl-1 pr-2.5 text-left transition-colors",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    active
                      ? "border-accent bg-accent/10 ring-1 ring-accent/40"
                      : "border-border bg-background hover:border-accent/30 hover:bg-muted/40",
                  )}
                >
                  <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md bg-muted">
                    {item.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.logoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <Dna className="h-3.5 w-3.5" />
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
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="start"
                className="border border-border bg-panel px-2.5 py-2 text-foreground shadow-lg"
              >
                <DnaChipTooltip item={item} />
              </TooltipContent>
            </Tooltip>
          );
        })}

        <Link
          href={manageHref}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-dashed border-border px-2.5 text-[10px] text-muted-foreground hover:border-accent/40 hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
          Manage {PROJECT_IDENTITY_LABEL.toLowerCase()}
        </Link>
      </div>
    </TooltipProvider>
  );
}
