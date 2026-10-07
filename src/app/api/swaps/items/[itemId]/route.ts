import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import { normalizeDubLanguage } from "@/lib/dub-languages";
import {
  deleteSwapItemMedia,
  dubSwapItem,
  getOwnedSwap,
  getOwnedSwapItem,
  retrySwapItem,
  revoiceSwapItem,
} from "@/lib/person-swap-server";
import { isSwapWorking } from "@/lib/person-swap";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: { itemId: string } };

async function load(itemId: string) {
  const userId = await tryUser();
  if (!userId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const item = await getOwnedSwapItem(itemId, userId);
  const swap = item ? await getOwnedSwap(item.swapId, userId) : null;
  if (!item || !swap) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  return { item, swap } as const;
}

/** Actions: `retry` (optionally `newFrame`), `voice` (voiceId or null = original), `dub` (language). */
export async function POST(req: NextRequest, { params }: Ctx) {
  const loaded = await load(params.itemId);
  if ("error" in loaded) return loaded.error;
  const { item, swap } = loaded;
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    newFrame?: boolean;
    voiceId?: string | null;
    language?: string;
  };

  try {
    if (body.action === "retry") {
      if (isSwapWorking(item.status)) {
        return NextResponse.json({ error: "Still working on this one" }, { status: 409 });
      }
      await retrySwapItem(swap, item, { newFrame: Boolean(body.newFrame) });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "voice") {
      if (isSwapWorking(item.status)) {
        return NextResponse.json({ error: "Still working on this one" }, { status: 409 });
      }
      const voiceId = typeof body.voiceId === "string" && body.voiceId.trim() ? body.voiceId.trim().slice(0, 64) : null;
      await revoiceSwapItem(swap, item, voiceId);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "dub") {
      const dubId = await dubSwapItem(swap, item, normalizeDubLanguage(String(body.language ?? "en")));
      return NextResponse.json({ dubId });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const loaded = await load(params.itemId);
  if ("error" in loaded) return loaded.error;
  await db.delete(schema.personSwapItems).where(eq(schema.personSwapItems.id, loaded.item.id));
  await deleteSwapItemMedia(loaded.item);
  return NextResponse.json({ ok: true });
}
