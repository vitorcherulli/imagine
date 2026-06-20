import { auth } from "@clerk/nextjs/server";

export async function requireUser(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Response("Unauthorized", { status: 401 });
  return userId;
}

export async function tryUser(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}
