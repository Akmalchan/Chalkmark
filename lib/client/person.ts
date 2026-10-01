"use client";

import type { PersonMask } from "../board/engine";

const MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

type Segmenter = import("@mediapipe/tasks-vision").ImageSegmenter;

/**
 * MediaPipe person segmentation. Optional: if it fails to load (no WebGL, offline), the board
 * engine's own occlusion rules still apply.
 */
export class PersonMasker {
  private lastTimestamp = 0;
  private constructor(private readonly segmenter: Segmenter) {}

  static async create(): Promise<PersonMasker | null> {
    try {
      const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      const options = (delegate: "GPU" | "CPU") => ({
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: "VIDEO" as const,
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
      const segmenter = await ImageSegmenter.createFromOptions(fileset, options("GPU"))
        .catch(() => ImageSegmenter.createFromOptions(fileset, options("CPU")));
      return new PersonMasker(segmenter);
    } catch (error) {
      console.warn("[chalkmark] person masking unavailable", error);
      return null;
    }
  }

  /** Person mask for the frame currently drawn on `canvas`. */
  mask(canvas: HTMLCanvasElement, timeMs: number): PersonMask | null {
    try {
      const timestamp = Math.max(this.lastTimestamp + 1, Math.round(timeMs));
      this.lastTimestamp = timestamp;
      const result = this.segmenter.segmentForVideo(canvas, timestamp);
      const confidence = result.confidenceMasks?.[0];
      if (!confidence) { result.close(); return null; }
      const values = confidence.getAsFloat32Array();
      const data = new Uint8Array(values.length);
      for (let i = 0; i < values.length; i += 1) data[i] = values[i] > 0.5 ? 1 : 0;
      const mask = { width: confidence.width, height: confidence.height, data };
      result.close();
      return mask;
    } catch {
      return null;
    }
  }

  close() { this.segmenter.close(); }
}
