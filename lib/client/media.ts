"use client";

import type { Quad, RGBAImage } from "../board/geometry";

/** Longest side we analyse; 4K phone video is downscaled, the board engine never needs more. */
const MAX_CAPTURE_SIDE = 1920;

export class FrameGrabber {
  private canvas = document.createElement("canvas");
  private context: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly scale: number;

  constructor(readonly video: HTMLVideoElement) {
    this.scale = Math.min(1, MAX_CAPTURE_SIDE / Math.max(video.videoWidth, video.videoHeight));
    this.width = Math.max(1, Math.round(video.videoWidth * this.scale));
    this.height = Math.max(1, Math.round(video.videoHeight * this.scale));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    const context = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas is unavailable in this browser.");
    this.context = context;
  }

  grab(): RGBAImage {
    this.context.drawImage(this.video, 0, 0, this.width, this.height);
    const image = this.context.getImageData(0, 0, this.width, this.height);
    return { width: image.width, height: image.height, data: image.data };
  }

  /** Board corners are picked in the video's own pixels; the engine works in capture pixels. */
  toCapture(quad: Quad): Quad {
    return quad.map(point => ({ x: point.x * this.scale, y: point.y * this.scale })) as Quad;
  }
}

export function waitFor(target: EventTarget, event: string, timeoutMs: number): Promise<boolean> {
  return new Promise(resolve => {
    const done = (ok: boolean) => { clearTimeout(timer); target.removeEventListener(event, onEvent); target.removeEventListener("error", onError); resolve(ok); };
    const onEvent = () => done(true);
    const onError = () => done(false);
    const timer = setTimeout(() => done(false), timeoutMs);
    target.addEventListener(event, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

/** Seek with a timeout: some browsers occasionally never fire `seeked`. Returns false if it stalled. */
export async function seekTo(video: HTMLVideoElement, time: number, timeoutMs = 5000): Promise<boolean> {
  const target = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.05));
  if (Math.abs(video.currentTime - target) < 0.01 && video.readyState >= 2) return true;
  const seeked = waitFor(video, "seeked", timeoutMs);
  video.currentTime = target;
  return seeked;
}

export async function loadVideo(video: HTMLVideoElement, src: string): Promise<void> {
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = src;
  const ok = await waitFor(video, "loadeddata", 20_000);
  if (!ok || !video.videoWidth) throw new Error("The browser could not decode this video. Try an MP4 (H.264) or WebM file.");
  if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("This video has no readable duration.");
}

export async function startCamera(video: HTMLVideoElement, deviceId?: string, withAudio = true): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: deviceId ? undefined : "environment" },
    audio: withAudio ? { echoCancellation: true, noiseSuppression: true, channelCount: 1 } : false,
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (!video.videoWidth) await waitFor(video, "loadedmetadata", 5000);
  return stream;
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(device => device.kind === "videoinput");
}

/**
 * Records the microphone in standalone segments (each a complete file) so speech can be
 * transcribed while the lecture is still running.
 */
export class SegmentedRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private segmentStart = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private readonly mimeType: string;

  constructor(
    private readonly stream: MediaStream,
    private readonly clock: () => number,
    private readonly onSegment: (blob: Blob, offsetSeconds: number) => void,
    private readonly segmentSeconds = 75,
  ) {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    this.mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type)) ?? "";
  }

  get supported() { return this.stream.getAudioTracks().length > 0 && typeof MediaRecorder !== "undefined"; }

  start() {
    if (!this.supported) return;
    this.startSegment();
    this.timer = setInterval(() => this.rotate(), this.segmentSeconds * 1000);
  }

  private startSegment() {
    const audioOnly = new MediaStream(this.stream.getAudioTracks());
    this.recorder = new MediaRecorder(audioOnly, { mimeType: this.mimeType || undefined, audioBitsPerSecond: 32_000 });
    this.chunks = [];
    this.segmentStart = this.clock();
    const chunks = this.chunks, offset = this.segmentStart;
    this.recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    this.recorder.onstop = () => {
      const blob = new Blob(chunks, { type: this.mimeType.split(";")[0] || "audio/webm" });
      if (blob.size > 2000) this.onSegment(blob, offset);
    };
    this.recorder.start(1000);
  }

  private rotate() {
    if (this.stopped || !this.recorder) return;
    this.recorder.stop();
    this.startSegment();
  }

  stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    const recorder = this.recorder;
    if (!recorder || recorder.state === "inactive") return Promise.resolve();
    return new Promise(resolve => { recorder.addEventListener("stop", () => setTimeout(resolve, 0), { once: true }); recorder.stop(); });
  }
}

/**
 * Extract the audio track of a local video as small mono Opus/WebM (or AAC/MP4 fallback) chunks,
 * entirely in the browser with WebCodecs. Only these few MB ever leave the device, never the video.
 */
export async function extractAudioChunks(
  file: Blob,
  durationSeconds: number,
  chunkSeconds = 300,
  onProgress?: (fraction: number) => void,
): Promise<Array<{ blob: Blob; offset: number }>> {
  const mb = await import("mediabunny");
  const probe = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const track = await probe.getPrimaryAudioTrack();
  if (!track) return [];
  const opus = await mb.canEncodeAudio("opus", { numberOfChannels: 1, sampleRate: 48000 });
  const chunks: Array<{ blob: Blob; offset: number }> = [];
  const count = Math.max(1, Math.ceil(durationSeconds / chunkSeconds));
  for (let index = 0; index < count; index += 1) {
    const start = index * chunkSeconds;
    const end = Math.min(durationSeconds, start + chunkSeconds);
    if (end - start < 0.5) break;
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const output = new mb.Output({
      format: opus ? new mb.WebMOutputFormat() : new mb.Mp4OutputFormat(),
      target: new mb.BufferTarget(),
    });
    const conversion = await mb.Conversion.init({
      input,
      output,
      video: { discard: true },
      audio: { codec: opus ? "opus" : "aac", numberOfChannels: 1, sampleRate: opus ? 48000 : 44100, bitrate: 32_000, forceTranscode: true },
      trim: { start, end },
    });
    if (!conversion.isValid) throw new Error("This browser cannot re-encode the video's audio.");
    conversion.onProgress = progress => onProgress?.((index + progress) / count);
    await conversion.execute();
    const buffer = (output.target as InstanceType<typeof mb.BufferTarget>).buffer;
    if (buffer) chunks.push({ blob: new Blob([buffer], { type: opus ? "audio/webm" : "audio/mp4" }), offset: start });
  }
  onProgress?.(1);
  return chunks;
}

export function imageToBlob(image: RGBAImage, type: "image/png" | "image/jpeg", quality = 0.88): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d")!;
  context.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Image encoding failed")), type, quality));
}

export function cropImage(image: RGBAImage, box: [number, number, number, number]): RGBAImage {
  const x0 = Math.max(0, Math.floor(box[0] * image.width)), y0 = Math.max(0, Math.floor(box[1] * image.height));
  const x1 = Math.min(image.width, Math.ceil(box[2] * image.width)), y1 = Math.min(image.height, Math.ceil(box[3] * image.height));
  const width = Math.max(1, x1 - x0), height = Math.max(1, y1 - y0);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const from = ((y0 + y) * image.width + x0) * 4;
    data.set(image.data.subarray(from, from + width * 4), y * width * 4);
  }
  return { width, height, data };
}
