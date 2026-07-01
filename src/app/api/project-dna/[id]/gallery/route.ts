import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { fetchProjectDnaById } from "@/lib/project-dna-server";
import {
  listDnaClientGalleryAssets,
  uploadDnaClientGalleryImage,
} from "@/lib/dna-gallery-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/jpg"]);

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dna = await fetchProjectDnaById(params.id, userId);
  if (!dna) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const assets = await listDnaClientGalleryAssets(userId, params.id);
  return NextResponse.json({ assets, galleryFolderId: dna.galleryFolderId });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dna = await fetchProjectDnaById(params.id, userId);
  if (!dna) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose an image file." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Image is larger than 20MB." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Use JPG, PNG, or WebP." }, { status: 400 });
  }

  try {
    const asset = await uploadDnaClientGalleryImage({
      userId,
      dnaId: params.id,
      buffer: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      mimeType: file.type,
    });
    return NextResponse.json({ asset });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}
