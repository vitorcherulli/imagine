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

interface ParsedProviderError {
  code?: string;
  message: string;
}

/** Unwrap OpenRouter + upstream provider errors (often nested JSON strings). */
function parseVideoProviderError(text: string): ParsedProviderError | null {
  try {
    const outer = JSON.parse(text) as {
      error?: { message?: string; code?: string };
      message?: string;
    };
    let message = outer.error?.message ?? outer.message;
    let code = outer.error?.code;
    if (!message) return null;

    const httpMatch = message.match(/^HTTP \d+:\s*(\{[\s\S]+\})\s*$/);
    if (httpMatch) {
      try {
        const inner = JSON.parse(httpMatch[1]) as {
          error?: { message?: string; code?: string };
          message?: string;
        };
        message = inner.error?.message ?? inner.message ?? message;
        code = inner.error?.code ?? code;
      } catch {
        /* keep outer message */
      }
    }
    return { code, message };
  } catch {
    return null;
  }
}

function friendlyVideoProviderMessage(parsed: ParsedProviderError): string {
  const haystack = `${parsed.code ?? ""} ${parsed.message}`.toLowerCase();
  if (
    haystack.includes("inputimagesensitivecontentdetected") ||
    haystack.includes("privacyinformation") ||
    haystack.includes("real person") ||
    haystack.includes("sensitive content")
  ) {
    return (
      "Video provider rejected the keyframe — it may look like a real person (photo or ultra-realistic portrait). " +
      "Regenerate the keyframe with a more stylized look, use an illustrated avatar, or try again without a keyframe."
    );
  }
  return parsed.message;
}

export function formatVideoSubmitError(status: number, text: string): string {
  const parsed = parseVideoProviderError(text);
  if (parsed) return friendlyVideoProviderMessage(parsed);
  return `OpenRouter video submit error ${status}: ${text.slice(0, 280)}`;
}

/** True when the provider refused the first-frame image (privacy / likeness moderation). */
export function isVideoKeyframeRejectedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const haystack = message.toLowerCase();
  return (
    haystack.includes("inputimagesensitivecontentdetected") ||
    haystack.includes("privacyinformation") ||
    haystack.includes("real person") ||
    haystack.includes("rejected the keyframe")
  );
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
  const text = await res.text();
  if (!res.ok) {
    throw new Error(formatVideoSubmitError(res.status, text));
  }

  type VideoSubmitPayload = Partial<VideoSubmitResult> & {
    error?: { message?: string } | string;
  };
  let parsed: VideoSubmitPayload;
  try {
    parsed = JSON.parse(text) as VideoSubmitPayload;
  } catch {
    throw new Error(`OpenRouter video submit returned invalid JSON: ${text.slice(0, 200)}`);
  }

  // Some providers return HTTP 2xx with an error payload instead of a job id.
  const errMessage =
    typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
  if (errMessage) {
    throw new Error(formatVideoSubmitError(400, JSON.stringify({ error: { message: errMessage } })));
  }
  if (!parsed.id && !parsed.polling_url) {
    throw new Error(
      `OpenRouter video submit returned no job id (${model}). Response: ${text.slice(0, 200)}`,
    );
  }

  return {
    id: parsed.id ?? "",
    polling_url: parsed.polling_url ?? "",
    status: parsed.status,
  };
}

/** Prepend the OpenRouter host to a relative polling URL (`/api/v1/videos/...`). */
function resolvePollingUrl(pollingUrl: string | undefined, jobId: string | undefined): string {
  if (pollingUrl) {
    return pollingUrl.startsWith("http")
      ? pollingUrl
      : `https://openrouter.ai${pollingUrl.startsWith("/") ? "" : "/"}${pollingUrl}`;
  }
  if (!jobId) {
    throw new Error("Cannot poll video status: missing both job id and polling URL.");
  }
  return `https://openrouter.ai/api/v1/videos/${jobId}`;
}

export async function getVideoStatus(jobId: string, pollingUrl?: string): Promise<VideoStatus> {
  const url = resolvePollingUrl(pollingUrl, jobId);
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
    if (
      status.status === "failed" ||
      status.status === "cancelled" ||
      status.status === "expired"
    ) {
      throw new Error(status.error ?? `Video generation ${status.status}`);
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error("Video generation timed out");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
