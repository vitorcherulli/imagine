import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { getBlockForUser, setBlockStatus } from "@/lib/block-helpers";
import { generateImage } from "@/lib/openrouter/images";
import { downloadToFile, readImageAsDataUrl, saveBase64 } from "@/lib/storage";
import { resolveProjectApiModels } from "@/lib/project-api-models";
import {
  avatarHintForPrompt,
  avatarReferenceImages,
  resolveBlockAvatar,
} from "@/lib/avatar-block";
import { getAspectRatio } from "@/lib/video-format";
import {
  buildSceneVisualPrompt,
  parseStyleBible,
} from "@/lib/style-bible";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await getBlockForUser(params.id, userId);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await setBlockStatus(params.id, { status: "image_generating", errorMessage: null });

  void (async () => {
    try {
      const bible = parseStyleBible(owned.project.styleBible);
      const avatar = await resolveBlockAvatar(owned.block, owned.project);
      const avatarHint = avatarHintForPrompt(avatar);
      const avatarRefs = (await avatarReferenceImages(avatar)) ?? [];

      let editorialRef: string | null = null;
      if (owned.project.anchorImageUrl) {
        try {
          editorialRef = await readImageAsDataUrl(owned.project.anchorImageUrl);
        } catch (e) {
          console.warn("[keyframe] failed to load editorial reference:", e);
        }
      }

      const referenceImages = [
        ...(editorialRef ? [editorialRef] : []),
        ...avatarRefs,
      ];

      const prompt = buildSceneVisualPrompt({
        project: owned.project,
        block: owned.block,
        bible,
        avatarHint,
        hasEditorialReference: !!editorialRef,
      });

      const models = resolveProjectApiModels(owned.project);
      const img = await generateImage({
        prompt,
        model: models.imageModel,
        aspectRatio: getAspectRatio(owned.project.videoFormat),
        imageSize: "1K",
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      });
      let url: string;
      if (img.url) {
        url = await downloadToFile(img.url, owned.project.id, owned.block.id, "keyframe.png");
      } else if (img.b64) {
        url = await saveBase64(owned.project.id, owned.block.id, "keyframe.png", img.b64);
      } else {
        throw new Error("No image data in response");
      }
      await setBlockStatus(params.id, { keyframeUrl: url, status: "image_ready" });
    } catch (err) {
      await setBlockStatus(params.id, {
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Keyframe failed",
      });
    }
  })();

  return NextResponse.json({ ok: true, status: "image_generating" });
}
