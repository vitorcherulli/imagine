import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tryUser } from "@/lib/auth";
import { createMediaLibraryFolder } from "@/lib/media-library-server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().min(1).max(80),
  parentId: z.string().min(1).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const folder = await createMediaLibraryFolder({
      userId,
      name: parsed.data.name,
      parentId: parsed.data.parentId ?? null,
    });
    return NextResponse.json({ folder });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create folder" },
      { status: 400 },
    );
  }
}
