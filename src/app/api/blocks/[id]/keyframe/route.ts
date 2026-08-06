import { NextRequest, NextResponse } from "next/server";
import { tryUser } from "@/lib/auth";
import { getBlockForUser, setBlockStatus } from "@/lib/block-helpers";
import { generateImage } from "@/lib/openrouter/images";
import { saveBuffer, deleteMediaByPublicUrl, withCacheBuster } from "@/lib/storage";
import { fitImageBufferToVideoFormat } from "@/lib/ffmpeg";
import { resolveProjectApiModels, imageModelSupportsPersonReferencePhotos } from "@/lib/project-api-models";
import {
  avatarHintForPrompt,
  avatarReferenceImages,
  resolveBlockAvatar,
} from "@/lib/avatar-block";
import {
  resolveBlockScenario,
  scenarioHintForPrompt,
  scenarioReferenceImages,
} from "@/lib/scenario-block";
import { getAspectRatio } from "@/lib/video-format";
import {
  buildSceneVisualPrompt,
  parseStyleBible,
} from "@/lib/style-bible";
import { loadEditorialReferenceDataUrls } from "@/lib/style-bible-server";
import { registerMediaLibraryAssetSafe } from "@/lib/media-library-server";

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
      const avatarRefs = (await avatarReferenceImages(avatar)) ?? [];

      const scenario = await resolveBlockScenario(owned.block, owned.project);
      const scenarioHint = scenarioHintForPrompt(scenario);
      const scenarioRefs = (await scenarioReferenceImages(scenario)) ?? [];

      const editorialRefs = await loadEditorialReferenceDataUrls(owned.project);

      const models = resolveProjectApiModels(owned.project);
      const attachAvatarRefs =
        avatarRefs.length > 0 && imageModelSupportsPersonReferencePhotos(models.imageModel);

      const prompt = buildSceneVisualPrompt({
        project: owned.project,
        block: owned.block,
        bible,
        avatarHint: avatarHintForPrompt(avatar, { referencePhotosAttached: attachAvatarRefs }),
        scenarioHint,
        hasEditorialReference: editorialRefs.length > 0,
      });

      const envRefs = [...editorialRefs, ...scenarioRefs];
      const img = await generateImage({
        prompt,
        model: models.imageModel,
        aspectRatio: getAspectRatio(owned.project.videoFormat),
        referenceImages: envRefs.length > 0 ? envRefs : undefined,
        personReferenceImages: avatarRefs.length > 0 ? avatarRefs : undefined,
      });
      let rawBuffer: Buffer;
      if (img.b64) {
        rawBuffer = Buffer.from(img.b64, "base64");
      } else if (img.url) {
        const res = await fetch(img.url);
        if (!res.ok) throw new Error("Could not download generated image.");
        rawBuffer = Buffer.from(await res.arrayBuffer());
      } else {
        throw new Error("No image data in response");
      }
      const framed = await fitImageBufferToVideoFormat(
        { buffer: rawBuffer, ext: ".png" },
        owned.project.videoFormat,
        owned.block.keyframeFitMode,
      );
      if (owned.block.keyframeUrl) {
        await deleteMediaByPublicUrl(owned.block.keyframeUrl);
      }
      const savedUrl = await saveBuffer(owned.project.id, owned.block.id, "keyframe.png", framed);
      const url = withCacheBuster(savedUrl);
      await setBlockStatus(params.id, {
        keyframeUrl: url,
        keyframeAiModel: models.imageModel,
        status: "image_ready",
      });
      registerMediaLibraryAssetSafe({
        userId,
        url,
        name: `Keyframe ¶${owned.block.position + 1}`,
        mimeType: "image/png",
        kind: "image",
        source: "keyframe_ai",
        projectId: owned.project.id,
        blockId: owned.block.id,
      });
    } catch (err) {
      await setBlockStatus(params.id, {
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Keyframe failed",
      });
    }
  })();

  return NextResponse.json({ ok: true, status: "image_generating" });
}
