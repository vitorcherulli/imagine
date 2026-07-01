import { NextRequest, NextResponse } from "next/server";
import { runProjectMp4Export } from "@/lib/project-export-mp4";

export const dynamic = "force-dynamic";
export const maxDuration = 900;
export const runtime = "nodejs";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "POST, OPTIONS",
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return runProjectMp4Export(req, params.id);
}
