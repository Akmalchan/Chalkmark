import type { BoardFrame } from "./lecture-schema";
import { selectMeaningfulSamples, type PixelSample } from "./frame-selection";

const ANALYSIS_WIDTH = 96;
const ANALYSIS_HEIGHT = 54;

function once(target: EventTarget, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error("The browser could not decode this video."));
    };
    const cleanup = () => {
      target.removeEventListener(event, done);
      target.removeEventListener("error", fail);
    };
    target.addEventListener(event, done, { once: true });
    target.addEventListener("error", fail, { once: true });
  });
}

async function seek(video: HTMLVideoElement, time: number) {
  if (Math.abs(video.currentTime - time) < 0.02 && video.readyState >= 2) return;
  const ready = once(video, "seeked");
  video.currentTime = Math.min(time, Math.max(0, video.duration - 0.04));
  await ready;
}

function grayscale(context: CanvasRenderingContext2D): Uint8Array {
  const rgba = context.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT).data;
  const result = new Uint8Array(rgba.length / 4);
  for (let source = 0, target = 0; source < rgba.length; source += 4, target += 1) {
    result[target] = Math.round(rgba[source] * 0.299 + rgba[source + 1] * 0.587 + rgba[source + 2] * 0.114);
  }
  return result;
}

export async function extractMeaningfulFrames(
  file: File,
  onProgress: (value: number, message: string) => void,
): Promise<{ frames: BoardFrame[]; durationSeconds: number; sampledCount: number }> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;

  try {
    await once(video, "loadedmetadata");
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("This video has no readable duration.");

    const sampleCount = Math.min(72, Math.max(12, Math.ceil(video.duration / 3)));
    const analysisCanvas = document.createElement("canvas");
    analysisCanvas.width = ANALYSIS_WIDTH;
    analysisCanvas.height = ANALYSIS_HEIGHT;
    const analysisContext = analysisCanvas.getContext("2d", { willReadFrequently: true });
    if (!analysisContext) throw new Error("Canvas analysis is unavailable in this browser.");

    const samples: PixelSample[] = [];
    for (let index = 0; index < sampleCount; index += 1) {
      const timestampSeconds = (video.duration * index) / Math.max(1, sampleCount - 1);
      await seek(video, timestampSeconds);
      analysisContext.drawImage(video, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
      samples.push({ timestampSeconds, pixels: grayscale(analysisContext) });
      onProgress(4 + Math.round((index / sampleCount) * 24), `Scanning board state ${index + 1} of ${sampleCount}`);
    }

    const ranked = selectMeaningfulSamples(samples, 10, Math.max(3, video.duration / 40));
    const outputCanvas = document.createElement("canvas");
    const scale = Math.min(1, 1280 / video.videoWidth, 720 / video.videoHeight);
    outputCanvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    outputCanvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const outputContext = outputCanvas.getContext("2d");
    if (!outputContext) throw new Error("Canvas export is unavailable in this browser.");

    const frames: BoardFrame[] = [];
    for (let index = 0; index < ranked.length; index += 1) {
      const item = ranked[index];
      await seek(video, item.timestampSeconds);
      outputContext.drawImage(video, 0, 0, outputCanvas.width, outputCanvas.height);
      frames.push({
        id: `board-${String(index + 1).padStart(2, "0")}`,
        timestampSeconds: Math.round(item.timestampSeconds * 10) / 10,
        score: Math.round(item.score * 10) / 10,
        dataUrl: outputCanvas.toDataURL("image/jpeg", 0.74),
        width: outputCanvas.width,
        height: outputCanvas.height,
      });
      onProgress(30 + Math.round((index / ranked.length) * 8), `Keeping ${ranked.length} meaningful board states`);
    }

    return { frames, durationSeconds: video.duration, sampledCount: sampleCount };
  } finally {
    URL.revokeObjectURL(objectUrl);
    video.removeAttribute("src");
    video.load();
  }
}
