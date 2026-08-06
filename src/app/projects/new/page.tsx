import { desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { NewProjectForm } from "@/components/NewProjectForm";

export const dynamic = "force-dynamic";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: { dnaId?: string };
}) {
  const { userId } = await auth();
  if (!userId) return null;
  const [projects, avatars, projectDna, scenarios] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt)),
    db
      .select()
      .from(schema.avatars)
      .where(eq(schema.avatars.userId, userId))
      .orderBy(desc(schema.avatars.updatedAt)),
    db
      .select()
      .from(schema.projectDna)
      .where(eq(schema.projectDna.userId, userId))
      .orderBy(desc(schema.projectDna.updatedAt)),
    db
      .select()
      .from(schema.scenarios)
      .where(eq(schema.scenarios.userId, userId))
      .orderBy(desc(schema.scenarios.updatedAt)),
  ]);

  const defaultDnaId =
    searchParams.dnaId && projectDna.some((d) => d.id === searchParams.dnaId)
      ? searchParams.dnaId
      : null;

  // Backfill each DNA's "new video" defaults from its most recent project so
  // selecting a DNA created before this feature still prefills instantly.
  const enrichedDna = projectDna.map((dna) => {
    const last = projects.find((p) => p.projectDnaId === dna.id);
    if (!last) return dna;
    return {
      ...dna,
      llmModel: dna.llmModel ?? last.llmModel,
      imageModel: dna.imageModel ?? last.imageModel,
      videoModel: dna.videoModel ?? last.videoModel,
      videoClipAudio: dna.videoClipAudio ?? last.videoClipAudio,
      ttsModel: dna.ttsModel ?? last.ttsModel,
      ttsVoice: dna.ttsVoice ?? last.ttsVoice,
      videoFormat: dna.videoFormat ?? last.videoFormat,
      cutPace: dna.cutPace ?? last.cutPace,
      scriptLanguage: dna.scriptLanguage ?? last.scriptLanguage,
      targetDurationSeconds: dna.targetDurationSeconds ?? last.targetDurationSeconds,
    };
  });

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} />
      <main className="flex-1 overflow-auto">
        <header className="border-b border-border bg-background px-5 py-2.5">
          <h1 className="text-sm font-semibold">New project</h1>
          <p className="text-2xs text-muted-foreground">
            Describe what you want to create — Imagine handles the rest.
          </p>
        </header>
        <section className="px-4 py-3">
          <NewProjectForm
            avatars={avatars}
            projectDna={enrichedDna}
            scenarios={scenarios}
            defaultDnaId={defaultDnaId}
          />
        </section>
      </main>
    </div>
  );
}
