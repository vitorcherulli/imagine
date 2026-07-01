import { OPENROUTER_MODELS, openRouterFetch, openRouterHeaders } from "./client";

export interface FrameImageInput {
  url: string;
  frame: "first_frame" | "last_frame";
}

export interface VideoSubmitInput {
  prompt: string;
  duration?: number;
  aspect_ratio?: string;
  resolution?: string;
  model?: string;
  /** OpenRouter generate_audio — omit for provider default. */
  generateAudio?: boolean;
  frame_images?: FrameImageInput[];
}

export interface VideoSubmitResult {
  id: string;
  polling_url: string;
  status?: string;
}

export interface VideoStatus {
  id: string;
  status: "queued" | "processing" | "completed" | "failed" | string;
  unsigned_urls?: string[];
  signed_urls?: string[];
  error?: string;
  progress?: number;
  usage?: {
    cost?: number | null;
    is_byok?: boolean;
  };
}

function toApiFrameImages(frames: FrameImageInput[]) {
  return frames.map((frame) => ({
    type: "image_url" as const,
    image_url: { url: frame.url },
    frame_type: frame.frame,
  }));
}

export async function submitVideo(input: VideoSubmitInput): Promise<VideoSubmitResult> {
  const model = input.model ?? OPENROUTER_MODELS.video;
  console.info(
    `[video] model=${model} duration=${input.duration ?? "default"}s ` +
      `aspect=${input.aspect_ratio ?? "default"} firstFrame=${input.frame_images?.length ?? 0} ` +
      `audio=${input.generateAudio === undefined ? "default" : input.generateAudio}`,
  );
  const body: Record<string, unknown> = {
    model,
    prompt: input.prompt,
  };
  if (input.duration) body.duration = input.duration;
  if (input.aspect_ratio) body.aspect_ratio = input.aspect_ratio;
  if (input.resolution) body.resolution = input.resolution;
  if (input.generateAudio !== undefined) body.generate_audio = input.generateAudio;
  if (input.frame_images && input.frame_images.length > 0) {
    body.frame_images = toApiFrameImages(input.frame_images);
  }

  const res = await openRouterFetch("/videos", { method: "POST", json: body });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter video submit error ${res.status}: ${text}`);
  }
  return (await res.json()) as VideoSubmitResult;
}

export async function getVideoStatus(jobId: string, pollingUrl?: string): Promise<VideoStatus> {
  const url = pollingUrl ?? `https://openrouter.ai/api/v1/videos/${jobId}`;
  const res = await fetch(url, { headers: openRouterHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter video status error ${res.status}: ${text}`);
  }
  return (await res.json()) as VideoStatus;
}

export async function waitForVideo(
  jobId: string,
  opts: { pollingUrl?: string; intervalMs?: number; timeoutMs?: number } = {},
): Promise<VideoStatus> {
  const intervalMs = opts.intervalMs ?? 6000;
  const timeoutMs = opts.timeoutMs ?? 15 * 60 * 1000;
  const start = Date.now();
  while (true) {
    const status = await getVideoStatus(jobId, opts.pollingUrl);
    if (status.status === "completed") return status;
    if (status.status === "failed") {
      throw new Error(status.error ?? "Video generation failed");
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error("Video generation timed out");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
