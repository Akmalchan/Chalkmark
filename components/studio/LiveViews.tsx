"use client";

import { useEffect, useRef } from "react";
import type { BoardEngine } from "@/lib/board/engine";
import { rectToQuadHomography, type Quad } from "@/lib/board/geometry";
import { renderPaper } from "@/lib/board/paper";

export type MemoryMode = "photo" | "clean" | "timeline";

/** Early ink is blue, recent ink is amber: the board's writing order at a glance. */
function timelineColor(fraction: number): [number, number, number] {
  const stops: Array<[number, number, number]> = [[40, 92, 200], [32, 160, 150], [150, 190, 60], [240, 160, 40]];
  const scaled = Math.min(0.999, Math.max(0, fraction)) * (stops.length - 1);
  const i = Math.floor(scaled), f = scaled - i;
  return [0, 1, 2].map(k => stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f) as [number, number, number];
}

/**
 * The board as Chalkmark remembers it: the composite with the lecturer removed,
 * optionally cleaned to paper or coloured by when each part was written.
 */
export function BoardMemoryView({ engine, tick, mode }: { engine: BoardEngine | null; tick: number; mode: MemoryMode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const lastClean = useRef(0);

  useEffect(() => {
    if (!engine || !canvas.current) return;
    const { composite } = engine;
    const element = canvas.current;
    if (element.width !== composite.width) { element.width = composite.width; element.height = composite.height; }
    const context = element.getContext("2d")!;
    if (mode === "clean") {
      // Paper rendering is heavier; refresh it at most every 1.2 s while live.
      const now = performance.now();
      if (now - lastClean.current < 1200 && lastClean.current) return;
      lastClean.current = now;
      const paper = renderPaper(composite, engine.polarity ?? "light");
      context.putImageData(new ImageData(paper.data as Uint8ClampedArray<ArrayBuffer>, paper.width, paper.height), 0, 0);
      return;
    }
    context.putImageData(new ImageData(Uint8ClampedArray.from(composite.data), composite.width, composite.height), 0, 0);
    if (mode === "timeline") {
      const births = Array.from(engine.birth).filter(Number.isFinite);
      if (!births.length) return;
      const first = Math.min(...births), last = Math.max(...births);
      const cw = composite.width / engine.cols, ch = composite.height / engine.rows;
      context.fillStyle = "rgba(255,253,248,.55)";
      context.fillRect(0, 0, composite.width, composite.height);
      for (let c = 0; c < engine.birth.length; c += 1) {
        const t = engine.birth[c];
        if (!Number.isFinite(t) || engine.inkCount[c] < engine.config.minInkPixels) continue;
        const [r, g, b] = timelineColor(last > first ? (t - first) / (last - first) : 0);
        context.fillStyle = `rgba(${r},${g},${b},.5)`;
        context.fillRect((c % engine.cols) * cw, Math.floor(c / engine.cols) * ch, cw + 0.5, ch + 0.5);
      }
    }
  }, [engine, tick, mode]);

  return <canvas ref={canvas} className="memory-canvas" />;
}

/** Draws the board outline and the cells the engine is currently ignoring (lecturer, motion) over the camera. */
export function EngineOverlay({ engine, quad, width, height, tick }: { engine: BoardEngine | null; quad: Quad; width: number; height: number; tick: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element || !width) return;
    if (element.width !== width) { element.width = width; element.height = height; }
    const context = element.getContext("2d")!;
    context.clearRect(0, 0, width, height);
    context.lineWidth = Math.max(2, width / 500);
    context.strokeStyle = "#d8ff65";
    context.beginPath();
    quad.forEach((p, i) => (i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y)));
    context.closePath();
    context.stroke();
    if (!engine) return;
    const hom = rectToQuadHomography(engine.cols, engine.rows, quad);
    const project = (x: number, y: number) => {
      const z = hom[6] * x + hom[7] * y + 1;
      return [(hom[0] * x + hom[1] * y + hom[2]) / z, (hom[3] * x + hom[4] * y + hom[5]) / z];
    };
    for (let c = 0; c < engine.occluded.length; c += 1) {
      const occluded = engine.occluded[c], moving = engine.moving[c];
      if (!occluded && !moving) continue;
      const cx = c % engine.cols, cy = Math.floor(c / engine.cols);
      context.fillStyle = occluded === 1 ? "rgba(255,112,82,.32)" : occluded === 2 ? "rgba(255,112,82,.14)" : "rgba(216,255,101,.18)";
      context.beginPath();
      [[cx, cy], [cx + 1, cy], [cx + 1, cy + 1], [cx, cy + 1]].forEach(([x, y], i) => {
        const [px, py] = project(x, y);
        if (i) context.lineTo(px, py); else context.moveTo(px, py);
      });
      context.closePath();
      context.fill();
    }
  }, [engine, quad, width, height, tick]);
  return <canvas ref={canvas} className="engine-overlay" />;
}
