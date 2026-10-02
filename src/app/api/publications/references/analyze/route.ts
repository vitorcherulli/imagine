import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tryUser } from "@/lib/auth";
import { socialReferenceIdsSchema } from "@/lib/social-art/schemas";
import { analyzeSocialReferences, resolveOwnedSocialReferences } from "@/lib/social-references-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({ assetIds: socialReferenceIdsSchema.min(1) });

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const refs = await resolveOwnedSocialReferences(userId, parsed.data.assetIds);
  if (refs.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    return NextResponse.json({ analysis: await analyzeSocialReferences(refs) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 },
    );
  }
}
