import { NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { listAccountVoices } from "@/lib/elevenlabs/voices";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ voices: await listAccountVoices() });
}
