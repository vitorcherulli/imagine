import Link from "next/link";
import { desc, eq, asc } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { ProjectsLibrary } from "@/components/ProjectsLibrary";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { loadLibraryItems } from "@/lib/library-items-server";
import { isLibraryKind } from "@/lib/library-items";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const { userId } = await auth();
  if (!userId) return null;

  const [projects, folders] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt)),
    db
      .select()
      .from(schema.projectFolders)
      .where(eq(schema.projectFolders.userId, userId))
      .orderBy(asc(schema.projectFolders.position), asc(schema.projectFolders.name)),
  ]);

  const items = await loadLibraryItems(userId, projects);
  const initialType = isLibraryKind(searchParams.type) ? searchParams.type : "all";

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} />
      <main className="flex-1 overflow-auto">
        <header className="flex items-center justify-between border-b border-border bg-background px-5 py-3">
          <div>
            <h1 className="text-base font-semibold">Your projects</h1>
            <p className="text-2xs text-muted-foreground">
              Everything you make lives here — filter by type, organize by folder.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link href="/projects/new">
              <Button variant="primary" size="md">
                <Plus className="h-3.5 w-3.5" />
                New video
              </Button>
            </Link>
            <Link href="/publications/new">
              <Button variant="outline" size="md">
                <Plus className="h-3.5 w-3.5" />
                New publication
              </Button>
            </Link>
          </div>
        </header>

        <section className="px-5 py-5">
          <ProjectsLibrary
            initialItems={items}
            initialFolders={folders}
            initialType={initialType}
          />
        </section>
      </main>
    </div>
  );
}
