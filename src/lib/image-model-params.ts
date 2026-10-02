import { IMAGE_MODEL_OPTIONS } from "@/lib/project-api-models";
import { closestSupportedAspect, preferredImageResolution } from "@/lib/model-catalog";
import { getCatalogModel } from "@/lib/model-catalog-server";

/** Built-in models keep their tuned sizing; new catalog models use the parameters they advertise. */
export async function catalogImageParams(
  model: string,
  aspectRatio: string,
  opts: { withReferences: boolean },
): Promise<{ aspectRatio: string; resolution?: string | null; forceDedicatedApi?: boolean }> {
  if (IMAGE_MODEL_OPTIONS.some((o) => o.value === model)) return { aspectRatio };
  const info = await getCatalogModel("image", model);
  if (!info) return { aspectRatio, forceDedicatedApi: true };
  if (opts.withReferences && info.maxReferences === 0) {
    throw new Error(`${info.label} can't use reference images — pick another image AI.`);
  }
  return {
    aspectRatio: closestSupportedAspect(aspectRatio, info.aspectRatios),
    resolution: preferredImageResolution(info.resolutions),
    forceDedicatedApi: true,
  };
}

export async function imageResultToBuffer(img: {
  b64?: string | null;
  url?: string | null;
}): Promise<Buffer> {
  if (img.b64) return Buffer.from(img.b64, "base64");
  if (img.url) {
    const res = await fetch(img.url);
    if (!res.ok) throw new Error("Could not download generated image.");
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("No image data in response.");
}
