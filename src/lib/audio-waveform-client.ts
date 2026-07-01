export interface AudioWaveformData {
  peaks: number[];
  durationSeconds: number;
}

const CACHE_BUCKETS = 512;
const cache = new Map<string, AudioWaveformData>();
const inflight = new Map<string, Promise<AudioWaveformData | null>>();

function resolveAudioFetchUrl(audioUrl: string): string {
  const trimmed = audioUrl.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (typeof window !== "undefined" && trimmed.startsWith("/")) {
    return new URL(trimmed, window.location.origin).href;
  }
  return trimmed;
}

async function decodeAudioWaveform(audioUrl: string): Promise<AudioWaveformData | null> {
  if (typeof window === "undefined") return null;

  const fetchUrl = resolveAudioFetchUrl(audioUrl);
  if (!fetchUrl) return null;

  const response = await fetch(fetchUrl);
  if (!response.ok) return null;

  const arrayBuffer = await response.arrayBuffer();
  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  const audioContext = new AudioContextClass();
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const durationSeconds = audioBuffer.duration;
    const channelData = audioBuffer.getChannelData(0);
    const samplesPerBucket = Math.max(1, Math.floor(channelData.length / CACHE_BUCKETS));
    const peaks: number[] = [];

    for (let i = 0; i < CACHE_BUCKETS; i += 1) {
      const start = i * samplesPerBucket;
      const end = Math.min(channelData.length, start + samplesPerBucket);
      let max = 0;
      for (let j = start; j < end; j += 1) {
        const sample = Math.abs(channelData[j] ?? 0);
        if (sample > max) max = sample;
      }
      peaks.push(max);
    }

    return { peaks, durationSeconds };
  } catch {
    return null;
  } finally {
    void audioContext.close();
  }
}

export async function getAudioWaveform(
  audioUrl: string,
): Promise<AudioWaveformData | null> {
  const cached = cache.get(audioUrl);
  if (cached) return cached;

  const pending = inflight.get(audioUrl);
  if (pending) return pending;

  const task = decodeAudioWaveform(audioUrl).then((result) => {
    inflight.delete(audioUrl);
    if (result) cache.set(audioUrl, result);
    return result;
  });
  inflight.set(audioUrl, task);
  return task;
}

export function subsampleWaveformPeaks(peaks: number[], targetCount: number): number[] {
  if (targetCount <= 0) return [];
  if (peaks.length <= targetCount) return peaks;

  const out: number[] = [];
  const slice = peaks.length / targetCount;
  for (let i = 0; i < targetCount; i += 1) {
    const start = Math.floor(i * slice);
    const end = Math.max(start + 1, Math.floor((i + 1) * slice));
    let max = 0;
    for (let j = start; j < end; j += 1) {
      const value = peaks[j] ?? 0;
      if (value > max) max = value;
    }
    out.push(max);
  }
  return out;
}
