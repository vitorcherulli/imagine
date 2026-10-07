import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { addSwapPeople, getOwnedSwap, peopleFromForm } from "@/lib/person-swap-server";
import { PERSON_SWAP_MAX_PEOPLE } from "@/lib/person-swap";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const swap = await getOwnedSwap(params.id, userId);
  if (!swap) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const people = (await peopleFromForm(await req.formData(), userId, swap.id)).slice(0, PERSON_SWAP_MAX_PEOPLE);
    if (people.length === 0) {
      return NextResponse.json({ error: "Pick an avatar with photos or upload a photo" }, { status: 400 });
    }
    const items = await addSwapPeople(swap, people);
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not add the people" },
      { status: 400 },
    );
  }
}
