import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { createMotionDesign, listMotionDesigns, parseMessages, parseProps } from "@/lib/motion/server";
import { MOTION_TEMPLATES } from "@/lib/motion/templates";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await listMotionDesigns(userId);
  return NextResponse.json({
    designs: rows.map((r) => ({
      id: r.id,
      title: r.title,
      templateId: r.templateId,
      thumbUrl: r.thumbUrl,
      outputUrl: r.outputUrl,
      status: r.status,
      updatedAt: r.updatedAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const templateId = String(body.templateId ?? MOTION_TEMPLATES[0].id);
  const title = typeof body.title === "string" ? body.title : undefined;

  const row = await createMotionDesign(userId, templateId, title);
  return NextResponse.json({
    design: {
      id: row.id,
      title: row.title,
      templateId: row.templateId,
      props: parseProps(row.props, row.templateId),
      messages: parseMessages(row.messages),
    },
  });
}
