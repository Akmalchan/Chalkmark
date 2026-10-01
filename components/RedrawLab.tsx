"use client";

import { useState } from "react";
import { FigureRedraw } from "@/components/FigureRedraw";
import type { FigureSpec } from "@/lib/notes/figure";

type Case = { name: string; src: string; t: number; crop: [number, number, number, number]; kind: string; caption: string; detail: string; context: string };

const CASES: Case[] = [
  { name: "Row picture (MIT 18.06SC)", src: "/dev/linalg.mp4", t: 455, crop: [0.25, 0.06, 0.72, 0.9], kind: "graph", caption: "Row picture", detail: "Axes x and y with origin O. Two lines labeled x-2y=-1 and 2x+y=3 cross at a marked point.", context: "Solve 2x + y = 3, x - 2y = -1. Solution x = y = 1. Row picture: each equation is a line." },
  { name: "Column picture (MIT 18.06SC)", src: "/dev/linalg.mp4", t: 725, crop: [0.18, 0.2, 0.6, 0.98], kind: "graph", caption: "Column picture", detail: "Axes with origin O, vectors v1 and v2 drawn from the origin, a dashed line completing a parallelogram.", context: "[2,1]x + [1,-2]y = [3,-1], v1 = (2,1), v2 = (1,-2), x = y = 1, v1 + v2 = b." },
  { name: "Car sketch (sample lecture)", src: "/demo/sample-lecture.mp4", t: 75, crop: [0.53, 0.62, 0.93, 0.97], kind: "drawing", caption: "Line drawing of a car", detail: "Side view of a car: body outline with a cabin, two round wheels, a window divider.", context: "Now think of a car. Its velocity is the derivative of its position, dx/dt." },
];

async function grab(item: Case): Promise<{ url: string; blob: Blob }> {
  const video = document.createElement("video");
  video.src = item.src; video.muted = true;
  await new Promise(resolve => video.addEventListener("loadeddata", resolve, { once: true }));
  video.currentTime = item.t;
  await new Promise(resolve => video.addEventListener("seeked", resolve, { once: true }));
  const [x0, y0, x1, y1] = item.crop;
  const sx = x0 * video.videoWidth, sy = y0 * video.videoHeight, sw = (x1 - x0) * video.videoWidth, sh = (y1 - y0) * video.videoHeight;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * 2); canvas.height = Math.round(sh * 2);
  canvas.getContext("2d")!.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), "image/png"));
  return { url: URL.createObjectURL(blob), blob };
}

/** Developer harness: real board crops → /api/board/redraw → vector figure, side by side. */
export function RedrawLab() {
  const [results, setResults] = useState<Record<string, { image?: string; spec?: FigureSpec; error?: string; model?: string; ms?: number }>>({});
  const run = async (item: Case) => {
    setResults(current => ({ ...current, [item.name]: { error: "running…" } }));
    const { url, blob } = await grab(item);
    setResults(current => ({ ...current, [item.name]: { image: url, error: "redrawing…" } }));
    const form = new FormData();
    form.append("image", blob, "crop.png");
    form.append("kind", item.kind); form.append("caption", item.caption); form.append("detail", item.detail); form.append("context", item.context);
    const started = performance.now();
    const response = await fetch("/api/board/redraw", { method: "POST", body: form });
    const payload = await response.json();
    setResults(current => ({ ...current, [item.name]: { image: url, spec: payload.spec, error: payload.error, model: payload.model, ms: Math.round(performance.now() - started) } }));
    (window as unknown as { __redraws?: Record<string, unknown> }).__redraws = { ...((window as unknown as { __redraws?: Record<string, unknown> }).__redraws ?? {}), [item.name]: payload };
  };
  return (
    <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, background: "#e9e6dc", minHeight: "100vh" }}>
      <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 400 }}>Redraw lab</h1>
      {CASES.map(item => {
        const result = results[item.name];
        return (
          <section key={item.name} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, background: "#fffdf8", padding: 16, borderRadius: 12 }}>
            <div>
              <strong>{item.name}</strong> <button className="run-case" onClick={() => run(item)}>Run</button>
              {result?.image && <img src={result.image} alt="" style={{ width: "100%", marginTop: 8, borderRadius: 8 }} />}
            </div>
            <div>
              {result?.spec && <FigureRedraw spec={result.spec} />}
              <small>{result?.error ?? ""} {result?.model ? `· ${result.model} · ${result.ms} ms · ${result.spec?.confidence}` : ""}</small>
              {result?.spec?.notes && <p style={{ fontSize: 12 }}>{result.spec.notes}</p>}
            </div>
          </section>
        );
      })}
    </main>
  );
}
