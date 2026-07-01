import path from "node:path";
import type { Project, StoryBlock } from "./db/schema";
import { buildNarrationTrackSpans } from "@/components/timeline/types";
import { getMediaDurationSeconds, keyframeCanvasSize } from "@/lib/ffmpeg";
import { isStoryBlockPause, resolveNeighborVisualBlock } from "./script-pause";
import {
  computeTimelineDurationSeconds,
  resolveNarrationSpanStartSeconds,
  resolveVideoStartSeconds,
  sortBlocksByPosition,
} from "./timeline-free-edit";
import { sanitizeExportFilename } from "./export-history";

export const PREMIERE_PACK_VERSION = 3 as const;
export const PREMIERE_PACK_FPS = 30;

export interface PremierePackAsset {
  zipPath: string;
  mediaUrl: string;
}

export interface PremierePackBlockEntry {
  id: string;
  position: number;
  label: string;
  startSec: number;
  durationSec: number;
  segmentType: string;
  narrativeText: string;
  visualPrompt: string;
  locationTag: string | null;
  isPause: boolean;
  files: {
    video?: string;
    keyframe?: string;
    sceneAudio?: string;
  };
  narrationFile?: string;
  narrationStartSec?: number;
}

export interface TimelinePremiereManifest {
  version: typeof PREMIERE_PACK_VERSION;
  kind: "timeline";
  generatedAt: string;
  projectTitle: string;
  projectId: string;
  fps: number;
  totalDurationSec: number;
  videoFormat: string | null;
  timelineXml: string;
  blocks: PremierePackBlockEntry[];
  narration: Array<{
    id: string;
    file: string;
    startSec: number;
    durationSec: number;
    blockIds: string[];
    narrativeText: string;
  }>;
  music?: {
    file: string;
    startSec: number;
    volume: number;
  };
  instructions: {
    premiere: string;
    relink: string;
  };
}

export interface PremierePackPlan {
  manifest: TimelinePremiereManifest;
  assets: PremierePackAsset[];
  readme: string;
  timelineXml: string;
  downloadFilename: string;
}

function roundSec(n: number): number {
  return Math.round(n * 100) / 100;
}

function secToFrames(sec: number): number {
  return Math.max(1, Math.round(sec * PREMIERE_PACK_FPS));
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function slugPart(value: string, max = 28): string {
  const cleaned = value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return (cleaned || "clip").slice(0, max);
}

function extFromUrl(url: string, fallback: string): string {
  const base = url.split("?")[0] ?? "";
  const ext = path.extname(base).toLowerCase();
  if (ext && ext.length <= 6) return ext;
  return fallback;
}

function blockLabel(block: StoryBlock, position: number): string {
  const text = block.narrativeText.trim() || block.visualPrompt.trim();
  const short = text.split(/\s+/).slice(0, 4).join(" ");
  return `Block ${String(position + 1).padStart(2, "0")}${short ? ` — ${short}` : ""}`;
}

export function buildPremierePackPlan(input: {
  project: Pick<
    Project,
    "id" | "title" | "videoFormat" | "musicUrl" | "musicVolume" | "musicStartSeconds"
  >;
  blocks: StoryBlock[];
  assetMetaByZipPath?: Map<string, PremiereAssetMeta>;
}): PremierePackPlan {
  const sorted = sortBlocksByPosition(input.blocks);
  const root = sanitizeExportFilename(input.project.title || "project");
  const assets: PremierePackAsset[] = [];
  const zipPaths = new Set<string>();
  const fileIdByZipPath = new Map<string, string>();
  let fileCounter = 0;

  function addAsset(mediaUrl: string, zipPath: string): string {
    const normalized = zipPath.replace(/\\/g, "/");
    if (!zipPaths.has(normalized)) {
      zipPaths.add(normalized);
      fileCounter += 1;
      fileIdByZipPath.set(normalized, `file-${fileCounter}`);
      assets.push({ zipPath: normalized, mediaUrl });
    }
    return normalized;
  }

  const blockEntries: PremierePackBlockEntry[] = [];
  const narrationManifest: TimelinePremiereManifest["narration"] = [];
  const spans = buildNarrationTrackSpans(sorted);

  for (const span of spans) {
    const lead = span.leadBlock;
    if (!lead.audioUrl?.trim()) continue;
    const startSec = roundSec(resolveNarrationSpanStartSeconds(lead, span.blocks, sorted));
    const slug = slugPart(lead.narrativeText || lead.visualPrompt || span.id);
    const zipPath = addAsset(
      lead.audioUrl,
      `Footage/Audio/Narration/${String(narrationManifest.length + 1).padStart(3, "0")}-${slug}${extFromUrl(lead.audioUrl, ".mp3")}`,
    );
    narrationManifest.push({
      id: span.id,
      file: zipPath,
      startSec,
      durationSec: roundSec(span.durationSeconds),
      blockIds: span.blocks.map((b) => b.id),
      narrativeText: lead.narrativeText.trim(),
    });
  }

  const narrationFileByBlockId = new Map<string, { file: string; startSec: number }>();
  for (const span of spans) {
    const manifestSpan = narrationManifest.find((n) => n.id === span.id);
    if (!manifestSpan) continue;
    for (const block of span.blocks) {
      narrationFileByBlockId.set(block.id, {
        file: manifestSpan.file,
        startSec: manifestSpan.startSec,
      });
    }
  }

  for (const block of sorted) {
    const visual = isStoryBlockPause(block) ? resolveNeighborVisualBlock(sorted, block) : block;
    const startSec = roundSec(resolveVideoStartSeconds(block, sorted));
    const position = block.position;
    const slug = slugPart(block.narrativeText || block.visualPrompt || `block-${position + 1}`);
    const prefix = String(position + 1).padStart(3, "0");
    const entry: PremierePackBlockEntry = {
      id: block.id,
      position,
      label: blockLabel(block, position),
      startSec,
      durationSec: roundSec(block.durationSeconds),
      segmentType: block.segmentType,
      narrativeText: block.narrativeText,
      visualPrompt: block.visualPrompt,
      locationTag: block.locationTag,
      isPause: isStoryBlockPause(block),
      files: {},
    };

    const narration = narrationFileByBlockId.get(block.id);
    if (narration) {
      entry.narrationFile = narration.file;
      entry.narrationStartSec = narration.startSec;
    }

    if (visual.videoUrl?.trim()) {
      entry.files.video = addAsset(
        visual.videoUrl,
        `Footage/Video/${prefix}-${slug}${extFromUrl(visual.videoUrl, ".mp4")}`,
      );
    }

    if (visual.keyframeUrl?.trim()) {
      const imagePath = `Footage/Images/${prefix}-${slug}${extFromUrl(visual.keyframeUrl, ".jpg")}`;
      if (imagePath !== entry.files.video) {
        entry.files.keyframe = addAsset(visual.keyframeUrl, imagePath);
      }
    }

    if (block.sceneAudioUrl?.trim()) {
      entry.files.sceneAudio = addAsset(
        block.sceneAudioUrl,
        `Footage/Audio/Scene/${prefix}-${slug}${extFromUrl(block.sceneAudioUrl, ".mp3")}`,
      );
    }

    blockEntries.push(entry);
  }

  let musicEntry: TimelinePremiereManifest["music"];
  if (input.project.musicUrl?.trim()) {
    const zipPath = addAsset(
      input.project.musicUrl,
      `Footage/Audio/Music/background${extFromUrl(input.project.musicUrl, ".mp3")}`,
    );
    musicEntry = {
      file: zipPath,
      startSec: roundSec(input.project.musicStartSeconds ?? 0),
      volume: input.project.musicVolume ?? 30,
    };
  }

  const totalDurationSec = roundSec(computeTimelineDurationSeconds(sorted));
  const { width: seqWidth, height: seqHeight } = keyframeCanvasSize(input.project.videoFormat);
  const timelineXml = buildFcp7Xml({
    projectTitle: input.project.title || "Imagine Project",
    totalDurationSec,
    blockEntries,
    narrationManifest,
    music: musicEntry,
    fileIdByZipPath,
    assetMetaByZipPath: input.assetMetaByZipPath ?? new Map(),
    sequenceWidth: seqWidth,
    sequenceHeight: seqHeight,
  });

  const manifest: TimelinePremiereManifest = {
    version: PREMIERE_PACK_VERSION,
    kind: "timeline",
    generatedAt: new Date().toISOString(),
    projectTitle: input.project.title.trim() || "Untitled",
    projectId: input.project.id,
    fps: PREMIERE_PACK_FPS,
    totalDurationSec,
    videoFormat: input.project.videoFormat ?? null,
    timelineXml: "Timeline.xml",
    blocks: blockEntries,
    narration: narrationManifest,
    music: musicEntry,
    instructions: {
      premiere:
        "1) Extract the entire ZIP to one folder (keep Timeline.xml next to the Footage folder). 2) In Premiere Pro: File → Import → select Timeline.xml. 3) If any clips are offline, right-click → Link Media and point to the matching file inside Footage/.",
      relink:
        "Media paths are relative to the extracted package. Do not move Timeline.xml away from the Footage folder.",
    },
  };

  return {
    manifest,
    assets,
    readme: buildReadme(manifest, root),
    timelineXml,
    downloadFilename: `${root}-premiere.zip`,
  };
}

function buildReadme(manifest: TimelinePremiereManifest, folderName: string): string {
  return [
    "Imagine → Adobe Premiere Pro",
    `Project: ${manifest.projectTitle}`,
    `Generated: ${manifest.generatedAt}`,
    "",
    "CONTENTS",
    "- Timeline.xml          Premiere sequence (import this)",
    "- manifest.json         Machine-readable edit map",
    "- Footage/Video/        Video clips per timeline block",
    "- Footage/Images/       Keyframe stills (when available)",
    "- Footage/Audio/Narration/  Narration takes",
    "- Footage/Audio/Scene/      Scene / ambient audio",
    "- Footage/Audio/Music/      Background music",
    "",
    "IMPORT IN PREMIERE PRO",
    manifest.instructions.premiere,
    "",
    manifest.instructions.relink,
    "",
    "TIMELINE",
    `- Duration: ${manifest.totalDurationSec}s @ ${manifest.fps} fps`,
    `- Blocks: ${manifest.blocks.length}`,
    `- Narration spans: ${manifest.narration.length}`,
    manifest.music ? `- Music: ${manifest.music.file}` : "- Music: (none)",
    "",
    `Folder: ${folderName}`,
  ].join("\n");
}

export interface PremiereAssetMeta {
  durationSec: number;
  isStill: boolean;
  audioOnly?: boolean;
  width?: number;
  height?: number;
  hasAudio?: boolean;
}

/** Probe on-disk media so FCP7 clip durations match real files. */
export async function probePremiereAssets(
  assets: PremierePackAsset[],
  resolveAssetPath: (mediaUrl: string) => Promise<string>,
): Promise<Map<string, PremiereAssetMeta>> {
  const meta = new Map<string, PremiereAssetMeta>();
  for (const asset of assets) {
    try {
      const filePath = await resolveAssetPath(asset.mediaUrl);
      const ext = path.extname(asset.zipPath).toLowerCase();
      const isStill = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext);
      const audioOnly = [".wav", ".mp3", ".aac", ".m4a", ".ogg", ".flac"].includes(ext);
      const durationSec = isStill
        ? 1
        : Math.max(0.1, (await getMediaDurationSeconds(filePath)) ?? 1);
      meta.set(asset.zipPath, {
        durationSec,
        isStill,
        audioOnly,
        hasAudio: audioOnly || [".mp4", ".mov", ".m4v"].includes(ext),
      });
    } catch {
      meta.set(asset.zipPath, { durationSec: 1, isStill: false });
    }
  }
  return meta;
}

function premierePathUrl(zipPath: string): string {
  const relative = `./${zipPath.replace(/\\/g, "/")}`;
  return xmlEscape(relative);
}

function buildFileXml(
  fileId: string,
  zipPath: string,
  meta: PremiereAssetMeta | undefined,
  sequenceWidth: number,
  sequenceHeight: number,
): string {
  const name = path.basename(zipPath);
  const fileDuration = secToFrames(meta?.durationSec ?? 1);
  const audioOnly = meta?.audioOnly === true;

  const videoSection = audioOnly
    ? ""
    : [
        "                <video>",
        "                  <samplecharacteristics>",
        `                    <width>${meta?.width ?? sequenceWidth}</width>`,
        `                    <height>${meta?.height ?? sequenceHeight}</height>`,
        "                    <pixelaspectratio>square</pixelaspectratio>",
        "                  </samplecharacteristics>",
        meta?.isStill ? "                  <stillframe>TRUE</stillframe>" : null,
        "                </video>",
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n");

  const audioSection =
    audioOnly || meta?.hasAudio
      ? [
          "                <audio>",
          "                  <samplecharacteristics>",
          "                    <depth>16</depth>",
          "                    <samplerate>48000</samplerate>",
          "                  </samplecharacteristics>",
          "                  <channelcount>2</channelcount>",
          "                </audio>",
        ].join("\n")
      : "";

  return [
    `            <file id="${fileId}">`,
    `              <name>${xmlEscape(name)}</name>`,
    `              <pathurl>${premierePathUrl(zipPath)}</pathurl>`,
    `              <rate><timebase>${PREMIERE_PACK_FPS}</timebase><ntsc>FALSE</ntsc></rate>`,
    `              <duration>${fileDuration}</duration>`,
    `              <media>`,
    videoSection || null,
    audioSection || null,
    `              </media>`,
    `            </file>`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function buildClipItem(input: {
  id: string;
  name: string;
  timelineStart: number;
  timelineDuration: number;
  sourceIn?: number;
  sourceOut?: number;
  fileId: string;
  zipPath: string;
  fileMeta?: PremiereAssetMeta;
  sequenceWidth: number;
  sequenceHeight: number;
}): string {
  const duration = secToFrames(input.timelineDuration);
  const start = secToFrames(input.timelineStart);
  const end = start + duration;
  const sourceIn = input.sourceIn ?? 0;
  const sourceOut = input.sourceOut ?? input.timelineDuration;
  const inFrames = secToFrames(sourceIn);
  const outFrames = Math.max(inFrames + 1, secToFrames(sourceOut));

  return [
    `          <clipitem id="${input.id}">`,
    `            <name>${xmlEscape(input.name)}</name>`,
    `            <duration>${duration}</duration>`,
    `            <rate><timebase>${PREMIERE_PACK_FPS}</timebase><ntsc>FALSE</ntsc></rate>`,
    `            <start>${start}</start>`,
    `            <end>${end}</end>`,
    `            <in>${inFrames}</in>`,
    `            <out>${outFrames}</out>`,
    buildFileXml(
      input.fileId,
      input.zipPath,
      input.fileMeta,
      input.sequenceWidth,
      input.sequenceHeight,
    ),
    `          </clipitem>`,
  ].join("\n");
}

function buildFcp7Xml(input: {
  projectTitle: string;
  totalDurationSec: number;
  blockEntries: PremierePackBlockEntry[];
  narrationManifest: TimelinePremiereManifest["narration"];
  music?: TimelinePremiereManifest["music"];
  fileIdByZipPath: Map<string, string>;
  assetMetaByZipPath: Map<string, PremiereAssetMeta>;
  sequenceWidth: number;
  sequenceHeight: number;
}): string {
  const sequenceDuration = secToFrames(input.totalDurationSec);
  const videoClips: string[] = [];
  const narrationClips: string[] = [];
  const sceneClips: string[] = [];
  const musicClips: string[] = [];

  let clipCounter = 0;
  for (const block of input.blockEntries) {
    const mediaPath = block.files.video ?? block.files.keyframe;
    if (!mediaPath) continue;
    const fileId = input.fileIdByZipPath.get(mediaPath);
    if (!fileId) continue;
    clipCounter += 1;
    const fileMeta = input.assetMetaByZipPath.get(mediaPath);
    const timelineDuration = block.durationSec;
    const sourceDuration = fileMeta?.durationSec ?? timelineDuration;
    videoClips.push(
      buildClipItem({
        id: `vclip-${clipCounter}`,
        name: block.label,
        timelineStart: block.startSec,
        timelineDuration,
        sourceIn: 0,
        sourceOut: fileMeta?.isStill ? timelineDuration : Math.min(sourceDuration, timelineDuration),
        fileId,
        zipPath: mediaPath,
        fileMeta,
        sequenceWidth: input.sequenceWidth,
        sequenceHeight: input.sequenceHeight,
      }),
    );
  }

  clipCounter = 0;
  for (const span of input.narrationManifest) {
    const fileId = input.fileIdByZipPath.get(span.file);
    if (!fileId) continue;
    clipCounter += 1;
    const fileMeta = input.assetMetaByZipPath.get(span.file);
    narrationClips.push(
      buildClipItem({
        id: `aclip-${clipCounter}`,
        name: span.narrativeText.slice(0, 60) || span.id,
        timelineStart: span.startSec,
        timelineDuration: span.durationSec,
        sourceIn: 0,
        sourceOut: fileMeta?.durationSec ?? span.durationSec,
        fileId,
        zipPath: span.file,
        fileMeta,
        sequenceWidth: input.sequenceWidth,
        sequenceHeight: input.sequenceHeight,
      }),
    );
  }

  clipCounter = 0;
  for (const block of input.blockEntries) {
    if (!block.files.sceneAudio) continue;
    const fileId = input.fileIdByZipPath.get(block.files.sceneAudio);
    if (!fileId) continue;
    clipCounter += 1;
    const fileMeta = input.assetMetaByZipPath.get(block.files.sceneAudio);
    sceneClips.push(
      buildClipItem({
        id: `sclip-${clipCounter}`,
        name: `${block.label} scene`,
        timelineStart: block.startSec,
        timelineDuration: block.durationSec,
        sourceIn: 0,
        sourceOut: fileMeta?.durationSec ?? block.durationSec,
        fileId,
        zipPath: block.files.sceneAudio,
        fileMeta,
        sequenceWidth: input.sequenceWidth,
        sequenceHeight: input.sequenceHeight,
      }),
    );
  }

  if (input.music) {
    const fileId = input.fileIdByZipPath.get(input.music.file);
    if (fileId) {
      const fileMeta = input.assetMetaByZipPath.get(input.music.file);
      const startSec = input.music.startSec;
      const timelineDuration = Math.max(
        input.totalDurationSec - startSec,
        fileMeta?.durationSec ?? 1,
      );
      musicClips.push(
        buildClipItem({
          id: "mclip-1",
          name: "Background music",
          timelineStart: startSec,
          timelineDuration,
          sourceIn: 0,
          sourceOut: fileMeta?.durationSec ?? timelineDuration,
          fileId,
          zipPath: input.music.file,
          fileMeta,
          sequenceWidth: input.sequenceWidth,
          sequenceHeight: input.sequenceHeight,
        }),
      );
    }
  }

  const formatBlock = [
    `            <format>`,
    `              <samplecharacteristics>`,
    `                <width>${input.sequenceWidth}</width>`,
    `                <height>${input.sequenceHeight}</height>`,
    `                <pixelaspectratio>square</pixelaspectratio>`,
    `                <fielddominance>none</fielddominance>`,
    `                <rate><timebase>${PREMIERE_PACK_FPS}</timebase><ntsc>FALSE</ntsc></rate>`,
    `              </samplecharacteristics>`,
    `            </format>`,
  ].join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE xmeml>`,
    `<xmeml version="4">`,
    `  <project>`,
    `    <name>${xmlEscape(input.projectTitle)}</name>`,
    `    <children>`,
    `      <sequence id="imagine-sequence">`,
    `        <name>${xmlEscape(input.projectTitle)}</name>`,
    `        <duration>${sequenceDuration}</duration>`,
    `        <rate><timebase>${PREMIERE_PACK_FPS}</timebase><ntsc>FALSE</ntsc></rate>`,
    `        <timecode>`,
    `          <rate><timebase>${PREMIERE_PACK_FPS}</timebase><ntsc>FALSE</ntsc></rate>`,
    `          <string>00:00:00:00</string>`,
    `          <frame>0</frame>`,
    `          <displayformat>NDF</displayformat>`,
    `        </timecode>`,
    `        <media>`,
    `          <video>`,
    formatBlock,
    `            <track>`,
    videoClips.length > 0 ? videoClips.join("\n") : "              <!-- no video clips -->",
    `            </track>`,
    `          </video>`,
    `          <audio>`,
    `            <track>`,
    narrationClips.length > 0 ? narrationClips.join("\n") : "              <!-- no narration -->",
    `            </track>`,
    sceneClips.length > 0 ? `            <track>\n${sceneClips.join("\n")}\n            </track>` : "",
    musicClips.length > 0 ? `            <track>\n${musicClips.join("\n")}\n            </track>` : "",
    `          </audio>`,
    `        </media>`,
    `      </sequence>`,
    `    </children>`,
    `  </project>`,
    `</xmeml>`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function serializeTimelinePremiereManifest(manifest: TimelinePremiereManifest): string {
  return JSON.stringify(manifest, null, 2);
}

export async function createPremierePackZip(input: {
  plan: PremierePackPlan;
  resolveAssetPath: (mediaUrl: string) => Promise<string>;
  scriptDraft?: string | null;
}): Promise<Buffer> {
  const archiver = (await import("archiver")).default;

  const resolvedFiles: Array<{ zipPath: string; sourcePath: string }> = [];
  for (const asset of input.plan.assets) {
    const sourcePath = await input.resolveAssetPath(asset.mediaUrl);
    resolvedFiles.push({ zipPath: asset.zipPath, sourcePath });
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver("zip", { zlib: { level: 6 } });

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("error", reject);
    archive.on("end", () => resolve(Buffer.concat(chunks)));

    for (const file of resolvedFiles) {
      archive.file(file.sourcePath, { name: file.zipPath });
    }

    archive.append(input.plan.timelineXml, { name: "Timeline.xml" });
    archive.append(serializeTimelinePremiereManifest(input.plan.manifest), { name: "manifest.json" });
    archive.append(input.plan.readme, { name: "README.txt" });

    if (input.scriptDraft?.trim()) {
      archive.append(input.scriptDraft.trim(), { name: "Script/script.txt" });
    }

    archive.finalize();
  });
}
