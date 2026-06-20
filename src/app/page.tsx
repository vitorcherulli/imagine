import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Plus, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
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
        <header className="flex items-center justify-between border-b border-border bg-background px-5 py-3">
          <div>
            <h1 className="text-base font-semibold">Your projects</h1>
            <p className="text-2xs text-muted-foreground">
              Create AI-generated short videos with a Premiere-Pro-style timeline.
            </p>
          </div>
          <Link href="/projects/new">
            <Button variant="primary" size="md">
              <Plus className="h-3.5 w-3.5" />
              New project
            </Button>
          </Link>
        </header>

        <section className="px-5 py-5">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-panel py-16 text-center">
              <Sparkles className="h-6 w-6 text-accent" />
              <div>
                <h2 className="text-sm font-medium">Start your first story</h2>
                <p className="text-2xs text-muted-foreground">
                  Describe an idea, pick a genre and tone — Imagine writes, illustrates and narrates it.
                </p>
              </div>
              <Link href="/projects/new">
                <Button variant="primary" size="md">
                  <Plus className="h-3.5 w-3.5" />
                  New project
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="group block overflow-hidden rounded-lg border border-border bg-background transition-colors hover:border-accent/40"
                >
                  <div className="aspect-video w-full bg-muted">
                    <div className="flex h-full w-full items-center justify-center text-2xs text-muted-foreground">
                      {p.genre} · {p.visualStyle}
                    </div>
                  </div>
                  <div className="px-3 py-2">
                    <h3 className="truncate text-sm font-medium">{p.title || "Untitled"}</h3>
                    <p className="line-clamp-2 text-2xs text-muted-foreground">
                      {p.storyDescription}
                    </p>
                    <p className="mt-1 text-2xs text-muted-foreground/80">
                      Status: {p.status} · {p.targetDurationSeconds}s target
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
