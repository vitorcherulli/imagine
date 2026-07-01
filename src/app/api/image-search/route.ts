import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tryUser } from "@/lib/auth";
import { imageSearchProviderLabel, searchImagesGrouped, imageSearchProvidersStatus, getGoogleImageSearchConfigStatus, type ImageSearchOrientation } from "@/lib/image-search";
import { normalizeVideoFormat } from "@/lib/video-format";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    providers: imageSearchProvidersStatus(),
    googleConfig: getGoogleImageSearchConfigStatus(),
    providerLabel: imageSearchProviderLabel(),
  });
}

const bodySchema = z.object({
  query: z.string().min(1).max(120),
  limit: z.number().int().min(1).max(12).optional(),
  videoFormat: z.string().optional(),
});

function orientationForVideoFormat(videoFormat?: string): ImageSearchOrientation {
  return normalizeVideoFormat(videoFormat) === "vertical" ? "portrait" : "landscape";
}

async function searchWithFallback(
  query: string,
  limitPerGroup: number,
  orientation: ImageSearchOrientation,
) {
  let grouped = await searchImagesGrouped(query, limitPerGroup, orientation);
  if (grouped.results.length === 0) {
    const shorter = query.split(/\s+/).slice(0, 2).join(" ").trim();
    if (shorter && shorter !== query) {
      grouped = await searchImagesGrouped(shorter, limitPerGroup, orientation);
    }
  }
  if (grouped.results.length === 0) {
    const first = query.split(/\s+/)[0]?.trim();
    if (first && first.length > 3 && first !== query) {
      grouped = await searchImagesGrouped(first, limitPerGroup, orientation);
    }
  }
  return grouped;
}

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const query = parsed.data.query.trim();
    const limit = parsed.data.limit ?? 8;
    const limitPerGroup = Math.max(4, Math.ceil(limit / 2));
    const orientation = orientationForVideoFormat(parsed.data.videoFormat);
    const { groups, providers, results } = await searchWithFallback(query, limitPerGroup, orientation);
    return NextResponse.json({
      results,
      groups,
      providers,
      googleConfig: getGoogleImageSearchConfigStatus(),
      providerLabel: imageSearchProviderLabel(),
      query,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image search failed" },
      { status: 500 },
    );
  }
}
