"use client";

import * as React from "react";
import { formatOpenRouterUsd, type OpenRouterUsageSnapshot } from "@/lib/openrouter/usage";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  /** compact = header chip; inline = one line in dialogs */
  variant?: "compact" | "inline";
}

export function OpenRouterUsageBadge({ className, variant = "compact" }: Props) {
  const [usage, setUsage] = React.useState<OpenRouterUsageSnapshot | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/openrouter/usage", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as OpenRouterUsageSnapshot;
        if (!cancelled) setUsage(data);
      } catch {
        // ignore — badge stays hidden
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!usage) return null;

  const title = [
    `OpenRouter saldo: ${formatOpenRouterUsd(usage.remaining)}`,
    `Hoje: ${formatOpenRouterUsd(usage.usageToday)}`,
    `Semana: ${formatOpenRouterUsd(usage.usageThisWeek)}`,
    `Mês: ${formatOpenRouterUsd(usage.usageThisMonth)}`,
    `Total usado: ${formatOpenRouterUsd(usage.totalUsage)}`,
  ].join(" · ");

  if (variant === "inline") {
    return (
      <p className={cn("text-[10px] tabular-nums text-muted-foreground", className)} title={title}>
        OpenRouter: {formatOpenRouterUsd(usage.usageToday)} hoje · {formatOpenRouterUsd(usage.remaining)}{" "}
        saldo
      </p>
    );
  }

  return (
    <span
      className={cn(
        "hidden shrink-0 rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground sm:inline",
        className,
      )}
      title={title}
    >
      {formatOpenRouterUsd(usage.usageToday)} hoje · {formatOpenRouterUsd(usage.remaining)} saldo
    </span>
  );
}
