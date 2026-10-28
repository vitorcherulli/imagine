import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import {
  deleteMotionDesign,
  getOwnedMotionDesign,
  parseMessages,
  parseProps,
  sanitizeProps,
  updateMotionDesign,
} from "@/lib/motion/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await getOwnedMotionDesign(params.id, userId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    design: {
      id: row.id,
      title: row.title,
      templateId: row.templateId,
      props: parseProps(row.props, row.templateId),
      messages: parseMessages(row.messages),
      outputUrl: row.outputUrl,
      thumbUrl: row.thumbUrl,
      status: row.status,
      updatedAt: row.updatedAt,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await getOwnedMotionDesign(params.id, userId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: Parameters<typeof updateMotionDesign>[1] = {};

  if (typeof body.title === "string") patch.title = body.title.slice(0, 200);
  if (body.props && typeof body.props === "object") {
    const merged = sanitizeProps(parseProps(row.props, row.templateId), body.props);
    patch.props = JSON.stringify(merged);
  }
  if (body.resetProps === true) {
    patch.props = JSON.stringify(parseProps(null, row.templateId));
  }

  await updateMotionDesign(row.id, patch);
  const fresh = await getOwnedMotionDesign(row.id, userId);
  return NextResponse.json({
    design: {
      id: fresh!.id,
      title: fresh!.title,
      templateId: fresh!.templateId,
      props: parseProps(fresh!.props, fresh!.templateId),
      messages: parseMessages(fresh!.messages),
      outputUrl: fresh!.outputUrl,
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await getOwnedMotionDesign(params.id, userId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteMotionDesign(row.id);
  return NextResponse.json({ ok: true });
}
