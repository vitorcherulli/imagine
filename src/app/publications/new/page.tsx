import { desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { NewPublicationForm } from "@/components/NewPublicationForm";

export const dynamic = "force-dynamic";

export default async function NewPublicationPage({
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
          <h1 className="text-base font-semibold">New publication</h1>
          <p className="text-2xs text-muted-foreground">
            Carousel or single post for Instagram and feed — download images + caption.
          </p>
        </header>
        <section className="px-5 py-5">
          <NewPublicationForm
            avatars={avatars}
            projectDna={projectDna}
            defaultDnaId={defaultDnaId}
          />
        </section>
      </main>
    </div>
  );
}
