import { NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { fetchOpenRouterUsage } from "@/lib/openrouter/usage";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const usage = await fetchOpenRouterUsage();
    return NextResponse.json(usage);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load OpenRouter usage";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
