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
  const [projects, avatars, projectDna] = await Promise.all([
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
  ]);

  const defaultDnaId =
    searchParams.dnaId && projectDna.some((d) => d.id === searchParams.dnaId)
      ? searchParams.dnaId
      : null;

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} />
      <main className="flex-1 overflow-auto">
        <header className="border-b border-border bg-background px-5 py-3">
          <h1 className="text-base font-semibold">New project</h1>
          <p className="text-2xs text-muted-foreground">
            Describe what you want to create — Imagine handles the rest.
          </p>
        </header>
        <section className="px-5 py-5">
          <NewProjectForm avatars={avatars} projectDna={projectDna} defaultDnaId={defaultDnaId} />
        </section>
      </main>
    </div>
  );
}
