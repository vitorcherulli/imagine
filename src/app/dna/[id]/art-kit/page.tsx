import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db, schema } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { SocialArtKitEditor } from "@/components/social-art/SocialArtKitEditor";
import { listDnaClientGalleryAssets } from "@/lib/dna-gallery-server";
import { fetchProjectDnaById } from "@/lib/project-dna-server";
import { toSocialArtBrand } from "@/lib/social-art/model";
import { getOrCreateSocialArtKit } from "@/lib/social-art/server";

export const dynamic = "force-dynamic";

export default async function SocialArtKitPage({ params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return null;

  const [projects, dna] = await Promise.all([
    db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(desc(schema.projects.updatedAt)),
    fetchProjectDnaById(params.id, userId),
  ]);
  if (!dna) notFound();

  const [kit, photos] = await Promise.all([
    getOrCreateSocialArtKit(userId, dna.id),
    listDnaClientGalleryAssets(userId, dna.id),
  ]);

  return (
    <div className="flex h-screen w-full">
      <Sidebar projects={projects} />
      <main className="flex-1 overflow-auto">
        <SocialArtKitEditor
          key={dna.id}
          dnaId={dna.id}
          initialBrand={toSocialArtBrand(dna, kit)}
          samplePhoto={photos[0]?.url ?? ""}
        />
      </main>
    </div>
  );
}
