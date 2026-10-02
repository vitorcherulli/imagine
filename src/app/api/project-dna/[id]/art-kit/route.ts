import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { fetchProjectDnaById } from "@/lib/project-dna-server";
import { toSocialArtBrand } from "@/lib/social-art/model";
import { socialArtKitPatchSchema } from "@/lib/social-art/schemas";
import { getOrCreateSocialArtKit, updateSocialArtKit } from "@/lib/social-art/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dna = await fetchProjectDnaById(params.id, userId);
  if (!dna) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const kit = await getOrCreateSocialArtKit(userId, dna.id);
    return NextResponse.json({ brand: toSocialArtBrand(dna, kit) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load brand kit" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = socialArtKitPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const dna = await fetchProjectDnaById(params.id, userId);
  if (!dna) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const kit = await updateSocialArtKit(userId, dna.id, parsed.data);
    return NextResponse.json({ brand: toSocialArtBrand(dna, kit) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save brand kit" },
      { status: 500 },
    );
  }
}
