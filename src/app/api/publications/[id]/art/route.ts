import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { getSocialPublicationForUser } from "@/lib/publication-server";
import { publicationArtPatchSchema } from "@/lib/social-art/schemas";
import { updatePublicationArt } from "@/lib/social-art/server";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = publicationArtPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const data = await getSocialPublicationForUser(params.id, userId);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await updatePublicationArt(params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save art" },
      { status: 500 },
    );
  }
}
