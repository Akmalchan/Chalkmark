"use client";

import { useEffect, useRef, useState } from "react";
import { drawLecture, FRAME_H, FRAME_W, LECTURE_SECONDS, NARRATION } from "@/lib/demo/synthetic-lecture";

/** Developer tool: renders the synthetic lecture and records it (with narration) as the bundled sample video. */
export function Lab() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [t, setT] = useState(30);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (context) drawLecture(context, t);
  }, [t]);

  /**
   * Deterministic offline render: every frame is drawn and encoded at an exact timestamp with
   * WebCodecs (via Mediabunny), and the narration is mixed offline. Works even in a background tab.
   */
  const record = async () => {
    const mb = await import("mediabunny");
    const fps = 24;
    const element = document.createElement("canvas");
    element.width = FRAME_W; element.height = FRAME_H;
    const context = element.getContext("2d")!;
    const avc = await mb.canEncodeVideo("avc", { width: FRAME_W, height: FRAME_H });
    const aac = await mb.canEncodeAudio("aac", { numberOfChannels: 1, sampleRate: 48000 });
    const mp4 = avc && aac;
    const output = new mb.Output({ format: mp4 ? new mb.Mp4OutputFormat({ fastStart: "in-memory" }) : new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
    const video = new mb.CanvasSource(element, { codec: mp4 ? "avc" : "vp9", bitrate: 1_600_000, keyFrameInterval: 2 });
    const audio = new mb.AudioBufferSource({ codec: mp4 ? "aac" : "opus", bitrate: 64_000 });
    output.addVideoTrack(video, { frameRate: fps });
    output.addAudioTrack(audio);
    await output.start();

    setStatus("Mixing narration…");
    const offline = new OfflineAudioContext(1, Math.ceil(48000 * LECTURE_SECONDS), 48000);
    for (const clip of NARRATION) {
      const buffer = await offline.decodeAudioData(await (await fetch(clip.src)).arrayBuffer());
      const source = offline.createBufferSource();
      source.buffer = buffer; source.connect(offline.destination); source.start(clip.at + 0.3);
    }
    const mixed = await offline.startRendering();

    const frames = Math.round(LECTURE_SECONDS * fps);
    for (let i = 0; i < frames; i += 1) {
      drawLecture(context, i / fps);
      await video.add(i / fps, 1 / fps);
      if (i % fps === 0) setStatus(`Encoding ${Math.round((100 * i) / frames)}%`);
    }
    await audio.add(mixed);
    await output.finalize();
    const bytes = (output.target as InstanceType<typeof mb.BufferTarget>).buffer!;
    const name = mp4 ? "sample-lecture.mp4" : "sample-lecture.webm";
    setStatus(`Saving ${(bytes.byteLength / 1e6).toFixed(1)} MB…`);
    const response = await fetch(`/api/dev/sample?name=${name}`, { method: "POST", body: bytes });
    setStatus(response.ok ? `Saved ${name} (${(bytes.byteLength / 1e6).toFixed(1)} MB)` : `Save failed: ${response.status}`);
  };

  return (
    <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, margin: 0 }}>Sample lecture lab</h1>
      <canvas ref={canvas} width={FRAME_W} height={FRAME_H} style={{ width: 960, maxWidth: "100%", borderRadius: 10 }} />
      <input type="range" min={0} max={LECTURE_SECONDS} step={0.1} value={t} onChange={event => setT(Number(event.target.value))} style={{ width: 960, maxWidth: "100%" }} />
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)" }}>t = {t.toFixed(1)}s</span>
        <button className="primary" id="record-sample" onClick={record}>Record sample video</button>
        <span id="lab-status">{status}</span>
      </div>
    </main>
  );
}
