import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { analyzeCreativeContent } from "@/lib/creatives-analyze";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    items?: unknown[];
    products?: string[];
    creators?: string[];
    knownGroups?: { group: string; product: string; angle: string; hook: string }[];
  };
  if (!Array.isArray(body.items) || !body.items.length) {
    return NextResponse.json({ error: "Nothing to analyze" }, { status: 400 });
  }
  try {
    const items = await analyzeCreativeContent(body.items, {
      products: Array.isArray(body.products) ? body.products : [],
      creators: Array.isArray(body.creators) ? body.creators : [],
      knownGroups: Array.isArray(body.knownGroups) ? body.knownGroups : [],
    });
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Analysis failed" }, { status: 502 });
  }
}
