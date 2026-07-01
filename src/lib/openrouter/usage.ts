import { formatOpenRouterError, openRouterFetch } from "./client";

export interface OpenRouterUsageSnapshot {
  remaining: number;
  totalCredits: number;
  totalUsage: number;
  usageToday: number;
  usageThisWeek: number;
  usageThisMonth: number;
}

export async function fetchOpenRouterUsage(): Promise<OpenRouterUsageSnapshot> {
  const [creditsRes, keyRes] = await Promise.all([
    openRouterFetch("/credits"),
    openRouterFetch("/key"),
  ]);

  if (!creditsRes.ok) {
    const text = await creditsRes.text();
    throw new Error(formatOpenRouterError(creditsRes.status, text));
  }
  if (!keyRes.ok) {
    const text = await keyRes.text();
    throw new Error(formatOpenRouterError(keyRes.status, text));
  }

  const credits = (await creditsRes.json()) as {
    data?: { total_credits?: number; total_usage?: number };
  };
  const key = (await keyRes.json()) as {
    data?: {
      usage_daily?: number;
      usage_weekly?: number;
      usage_monthly?: number;
    };
  };

  const totalCredits = credits.data?.total_credits ?? 0;
  const totalUsage = credits.data?.total_usage ?? 0;

  return {
    totalCredits,
    totalUsage,
    remaining: Math.max(0, totalCredits - totalUsage),
    usageToday: key.data?.usage_daily ?? 0,
    usageThisWeek: key.data?.usage_weekly ?? 0,
    usageThisMonth: key.data?.usage_monthly ?? 0,
  };
}

export function formatOpenRouterUsd(amount: number): string {
  if (!Number.isFinite(amount)) return "$0.00";
  if (amount >= 100) return `$${amount.toFixed(0)}`;
  if (amount >= 10) return `$${amount.toFixed(1)}`;
  return `$${amount.toFixed(2)}`;
}
