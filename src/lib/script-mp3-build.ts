import type { AudioConcatPiece } from "./ffmpeg";
import { readMediaBuffer } from "./storage";
import {
  listScriptSpeechParagraphs,
  narrationClipForSpeechIndex,
  scriptParagraphTextKey,
} from "./script-narration-utils";
import {
  DEFAULT_SPEECH_GAP_SECONDS,
  parseScriptNarrationSegments,
  type ScriptDraftNotes,
} from "./script-studio";

export interface ParagraphNarrationReadiness {
  total: number;
  ready: number;
  allReady: boolean;
}

export function paragraphNarrationReadiness(
  script: string,
  notes: ScriptDraftNotes,
): ParagraphNarrationReadiness {
  const paragraphs = listScriptSpeechParagraphs(script);
  const clips = notes.paragraphNarration ?? [];
  const ready = paragraphs.filter((p) =>
    narrationClipForSpeechIndex(clips, p.speechIndex, p.textKey),
  ).length;
  return {
    total: paragraphs.length,
    ready,
    allReady: paragraphs.length > 0 && ready === paragraphs.length,
  };
}

function clipFilename(audioUrl: string): string {
  const pathOnly = audioUrl.split("?")[0].split("#")[0] ?? "clip.mp3";
  const base = pathOnly.split("/").pop();
  return base && base.length > 0 ? base : "clip.mp3";
}

/** Build ffmpeg concat pieces from pre-generated paragraph clips (same takes as Play all). */
export async function buildMp3PiecesFromParagraphClips(
  script: string,
  notes: ScriptDraftNotes,
): Promise<AudioConcatPiece[]> {
  const segments = parseScriptNarrationSegments(script);
  const clips = notes.paragraphNarration ?? [];
  const pieces: AudioConcatPiece[] = [];
  let speechIndex = 0;

  for (const segment of segments) {
    if (segment.kind === "section") continue;
    if (segment.kind === "pause") {
      pieces.push({ kind: "silence", seconds: segment.pauseSeconds });
      continue;
    }

    const textKey = scriptParagraphTextKey(segment.text);
    const clip = narrationClipForSpeechIndex(clips, speechIndex, textKey);
    if (!clip) {
      throw new Error(
        `Paragraph ${speechIndex + 1} has no narration. Generate or re-narrate it before downloading MP3.`,
      );
    }

    if (
      speechIndex > 0 &&
      pieces.length > 0 &&
      pieces[pieces.length - 1]?.kind !== "silence"
    ) {
      pieces.push({ kind: "silence", seconds: DEFAULT_SPEECH_GAP_SECONDS });
    }

    const buffer = await readMediaBuffer(clip.audioUrl);
    pieces.push({
      kind: "clip",
      buffer,
      filename: clipFilename(clip.audioUrl),
    });
    speechIndex += 1;
  }

  if (pieces.length === 0) {
    throw new Error("No narration clips to merge.");
  }
  return pieces;
}
