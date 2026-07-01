import fs from "node:fs/promises";
import path from "node:path";
import type { Project, SocialMetadata, SocialSlide } from "@/lib/db/schema";
import { formatSocialCaptionForExport } from "@/lib/social-slide-generate";
import { resolveMediaPath } from "@/lib/storage";

export async function createSocialPublicationZip(input: {
  project: Project;
  slides: SocialSlide[];
  metadata: SocialMetadata | null;
}): Promise<Buffer> {
  const archiver = (await import("archiver")).default;
  const caption = formatSocialCaptionForExport(input.metadata);
  const safeTitle = (input.project.title || "publicacao")
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);

  const slideFiles: Array<{ name: string; path: string }> = [];
  for (const slide of input.slides) {
    if (!slide.imageUrl) continue;
    const abs = await resolveMediaPath(slide.imageUrl);
    const num = String(slide.position + 1).padStart(2, "0");
    const role = slide.slideRole || "slide";
    slideFiles.push({
      name: `slides/${num}-${role}.png`,
      path: abs,
    });
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver("zip", { zlib: { level: 6 } });

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("error", reject);
    archive.on("end", () => resolve(Buffer.concat(chunks)));

    for (const file of slideFiles) {
      archive.file(file.path, { name: file.name });
    }

    if (caption) {
      archive.append(caption, { name: "legenda.txt" });
    }

    archive.append(
      [
        `Publicação: ${input.project.title}`,
        `Formato: ${input.project.postFormat}`,
        `Proporção: ${input.project.socialAspectRatio}`,
        `Slides com imagem: ${slideFiles.length} / ${input.slides.length}`,
        "",
        "Publique manualmente no Instagram ou outra rede.",
      ].join("\n"),
      { name: "README.txt" },
    );

    archive.finalize();
  });
}

export function socialExportFilename(project: Pick<Project, "title">): string {
  const safe = (project.title || "publicacao")
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${safe || "publicacao"}-feed.zip`;
}
