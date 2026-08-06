import { desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { MediaLibraryExplorer } from "@/components/MediaLibraryExplorer";

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const [projects, projectDna] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt)),
    db
      .select({ id: schema.projectDna.id, name: schema.projectDna.name })
      .from(schema.projectDna)
      .where(eq(schema.projectDna.userId, userId))
      .orderBy(desc(schema.projectDna.updatedAt)),
  ]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar projects={projects} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden p-4">
        <div className="mb-3">
          <h1 className="text-lg font-semibold">Media gallery</h1>
          <p className="text-sm text-muted-foreground">
            Imagens organizadas por projeto — cada pasta usa o nome do projeto, com subpastas
            Geradas por IA, Referências e Uploads.
          </p>
        </div>
        <div className="min-h-0 flex-1">
          <MediaLibraryExplorer dnas={projectDna} />
        </div>
      </main>
    </div>
  );
}
