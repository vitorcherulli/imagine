import Link from "next/link";
import { Wand2 } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { NewPublicationForm } from "@/components/NewPublicationForm";
import { toSocialArtBrand } from "@/lib/social-art/model";

export const dynamic = "force-dynamic";

export default async function NewPublicationPage({
  searchParams,
}: {
  searchParams: { dnaId?: string };
}) {
  const { userId } = await auth();
  if (!userId) return null;

  const [projects, avatars, projectDna, artKits] = await Promise.all([
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
    db.select().from(schema.socialArtBrandKits).where(eq(schema.socialArtBrandKits.userId, userId)),
  ]);

  const artBrands = Object.fromEntries(
    projectDna.map((dna) => [
      dna.id,
      toSocialArtBrand(dna, artKits.find((k) => k.projectDnaId === dna.id) ?? null),
    ]),
  );

  const defaultDnaId =
    searchParams.dnaId && projectDna.some((d) => d.id === searchParams.dnaId)
      ? searchParams.dnaId
      : null;

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} />
      <main className="flex-1 overflow-auto">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-background px-5 py-3">
          <div>
            <h1 className="text-base font-semibold">New publication</h1>
            <p className="text-2xs text-muted-foreground">
              Carousel or single post for Instagram and feed — download images + caption.
            </p>
          </div>
          <Link
            href="/variations"
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
            title="Drop one ad image and get new versions of it, or a video"
          >
            <Wand2 className="h-3.5 w-3.5 text-accent" /> Only variations of an image
          </Link>
        </header>
        <section className="px-5 py-5">
          <NewPublicationForm
            avatars={avatars}
            projectDna={projectDna}
            defaultDnaId={defaultDnaId}
            artBrands={artBrands}
          />
        </section>
      </main>
    </div>
  );
}
