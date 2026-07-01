import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { getBlockForUser } from "@/lib/block-helpers";
import { getOwnedProjectBlocks } from "@/lib/blocks-sync-server";
import {
  buildBlockKeyframeSearchContext,
  fallbackBlockKeyframeSearchSuggestion,
  suggestBlockKeyframeSearchQuery,
} from "@/lib/block-keyframe-image-search";
import { resolveProjectApiModels } from "@/lib/project-api-models";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await getBlockForUser(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const blocks = (await getOwnedProjectBlocks(owned.project.id, userId)) ?? [];
  const fast = req.nextUrl.searchParams.get("fast") === "1";

  if (fast) {
    const context = buildBlockKeyframeSearchContext(owned.project, owned.block, blocks);
    const suggestion = fallbackBlockKeyframeSearchSuggestion(context);
    return NextResponse.json({
      query: suggestion.query,
      keywords: suggestion.keywords,
      source: suggestion.source,
      isPauseBlock: suggestion.context.isPauseBlock,
      location: suggestion.context.location,
    });
  }

  const models = resolveProjectApiModels(owned.project);

  const suggestion = await suggestBlockKeyframeSearchQuery({
    project: owned.project,
    block: owned.block,
    blocks,
    llmModel: models.llmModel,
  });

  return NextResponse.json({
    query: suggestion.query,
    keywords: suggestion.keywords,
    source: suggestion.source,
    isPauseBlock: suggestion.context.isPauseBlock,
    location: suggestion.context.location,
  });
}
