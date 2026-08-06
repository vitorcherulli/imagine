import { desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { NewDubbingForm } from "@/components/NewDubbingForm";

export const dynamic = "force-dynamic";

export default async function NewDubbingPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId))
    .orderBy(desc(schema.projects.updatedAt));

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} />
      <main className="flex-1 overflow-auto">
        <header className="border-b border-border bg-background px-5 py-3">
          <h1 className="text-base font-semibold">New dubbing project</h1>
          <p className="text-2xs text-muted-foreground">
            Upload an MP4 or MP3 and the AI will transcribe, translate and re-voice it
            in your target language.
          </p>
        </header>
        <section className="px-5 py-5">
          <NewDubbingForm />
        </section>
      </main>
    </div>
  );
}
