/**
 * Storage helpers dedicados ao pipeline de dublagem. Reutiliza `storage.ts` mas
 * usa prefixos previsíveis para conseguir listar/limpar arquivos por projeto.
 */
import { saveBuffer, withCacheBuster } from "@/lib/storage";

export async function saveDubSourceFile(input: {
  projectId: string;
  buffer: Buffer;
  filename: string;
}): Promise<string> {
  const url = await saveBuffer(input.projectId, "dub", input.filename, input.buffer);
  return withCacheBuster(url);
}

export async function saveDubExtractedAudio(input: {
  projectId: string;
  buffer: Buffer;
}): Promise<string> {
  const url = await saveBuffer(input.projectId, "dub", "source_audio.mp3", input.buffer);
  return withCacheBuster(url);
}

export async function saveDubSegmentAudio(input: {
  projectId: string;
  segmentId: string;
  buffer: Buffer;
  filename: string;
}): Promise<string> {
  const url = await saveBuffer(
    input.projectId,
    "dub-segments",
    `${input.segmentId}_${input.filename}`,
    input.buffer,
  );
  return withCacheBuster(url);
}

export async function saveDubRender(input: {
  projectId: string;
  buffer: Buffer;
  filename: string;
}): Promise<string> {
  const url = await saveBuffer(
    input.projectId,
    "dub-renders",
    `${Date.now()}_${input.filename}`,
    input.buffer,
  );
  return withCacheBuster(url);
}
