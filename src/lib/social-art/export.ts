import { renderSlideBlob } from "@/lib/social-art/render";
import type { SocialArtBrand, SocialArtPost } from "@/lib/social-art/types";

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function socialArtSlideFile(
  brand: SocialArtBrand,
  post: SocialArtPost,
  index: number,
  baseName: string,
): Promise<File> {
  const blob = await renderSlideBlob({ brand, post, slide: post.slides[index], index });
  const suffix = post.slides.length > 1 ? `-${String(index + 1).padStart(2, "0")}` : "";
  return new File([blob], `${baseName}${suffix}.png`, { type: "image/png" });
}

/** Finished art for every slide plus legenda.txt. */
export async function socialArtZip(
  brand: SocialArtBrand,
  post: SocialArtPost,
  caption: string,
  baseName: string,
): Promise<{ blob: Blob; name: string }> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (let i = 0; i < post.slides.length; i++) {
    const file = await socialArtSlideFile(brand, post, i, baseName);
    zip.file(file.name, file);
  }
  if (caption) zip.file("legenda.txt", caption);
  return { blob: await zip.generateAsync({ type: "blob" }), name: `${baseName}.zip` };
}

export function canShareFiles(): boolean {
  try {
    return !!navigator.canShare?.({ files: [new File([""], "test.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}
