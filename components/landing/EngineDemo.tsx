"use client";

import { useEffect, useRef, useState } from "react";
import { BoardEngine } from "@/lib/board/engine";
import type { Quad } from "@/lib/board/geometry";
import { renderPaper } from "@/lib/board/paper";
import { drawLecture, FRAME_H, FRAME_W, LECTURE_SECONDS, SAMPLE_QUAD } from "@/lib/demo/synthetic-lecture";
import { BoardMemoryView, EngineOverlay } from "@/components/studio/LiveViews";

const W = 640, H = 360;          // analysed frame size (half of the synthetic lecture frame)
const STEP = 0.5;                 // lecture seconds per engine sample
const TICK_MS = 140;              // ≈3.5× real time

type Saved = { url: string; t: number; reason: string };

/**
 * The real board engine, running in the page on the animated sample lecture: what the camera sees
 * (red = ignored cells), what Chalkmark remembers (lecturer removed), and every board it saves.
 */
export function EngineDemo() {
  const root = useRef<HTMLDivElement>(null);
  const camera = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<BoardEngine | null>(null);
  const [tick, setTick] = useState(0);
  const [clock, setClock] = useState(0);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [stats, setStats] = useState({ frames: 0, commits: 0, occluded: 0, moving: 0 });
  const quad = SAMPLE_QUAD.map(p => ({ x: p.x / 2, y: p.y / 2 })) as Quad;

  useEffect(() => {
    const source = document.createElement("canvas");
    source.width = FRAME_W; source.height = FRAME_H;
    const sourceContext = source.getContext("2d")!;
    const view = camera.current!;
    view.width = W; view.height = H;
    const viewContext = view.getContext("2d", { willReadFrequently: true })!;
    let current = new BoardEngine(quad);
    let t = 0, visible = true, timer = 0;
    setEngine(current);

    const observer = new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting); });
    if (root.current) observer.observe(root.current);

    const step = () => {
      timer = window.setTimeout(step, TICK_MS);
      if (!visible || document.hidden) return;
      if (t > LECTURE_SECONDS) {
        // Loop the lecture with a fresh memory.
        t = 0; current = new BoardEngine(quad); setEngine(current); setSaved([]);
      }
      drawLecture(sourceContext, t);
      viewContext.drawImage(source, 0, 0, W, H);
      const frame = viewContext.getImageData(0, 0, W, H);
      const report = current.ingest({ width: W, height: H, data: frame.data }, t);
      if (report.snapshot) {
        const paper = renderPaper(report.snapshot.image, report.snapshot.polarity);
        const canvas = document.createElement("canvas");
        canvas.width = paper.width; canvas.height = paper.height;
        canvas.getContext("2d")!.putImageData(new ImageData(paper.data as Uint8ClampedArray<ArrayBuffer>, paper.width, paper.height), 0, 0);
        const snap = { url: canvas.toDataURL("image/png"), t: report.snapshot.t, reason: report.snapshot.reason };
        setSaved(list => [...list, snap].slice(-4));
      }
      setStats(previous => ({ frames: previous.frames + 1, commits: previous.commits + report.committed, occluded: report.occluded, moving: report.moving }));
      setClock(t);
      setTick(n => n + 1);
      t += STEP;
    };
    // Paint the opening frame immediately so the panel is never an empty black box.
    drawLecture(sourceContext, 0);
    viewContext.drawImage(source, 0, 0, W, H);
    step();
    return () => { window.clearTimeout(timer); observer.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cells = engine ? engine.cols * engine.rows : 576;
  return (
    <div className="engine-demo" ref={root}>
      <div className="demo-panels">
        <figure className="demo-panel">
          <div className="demo-frame">
            <canvas ref={camera} />
            {engine && <EngineOverlay engine={engine} quad={quad} width={W} height={H} tick={tick} vivid now={clock} />}
            <span className="demo-tag">INPUT · CAMERA</span>
          </div>
          <figcaption>
            <b>What the camera sees.</b> Every cell is re-judged each frame.
            <span className="demo-legend">
              <i className="lg-person" />person · ignored
              <i className="lg-buffer" />safety buffer
              <i className="lg-moving" />still changing
              <i className="lg-fresh" />ink just captured
            </span>
          </figcaption>
        </figure>
        <div className="demo-arrow" aria-hidden="true"><span>board<br />engine</span></div>
        <figure className="demo-panel">
          <div className="demo-frame memory">
            <BoardMemoryView engine={engine} tick={tick} mode="photo" />
            <span className="demo-tag">OUTPUT · BOARD MEMORY</span>
          </div>
          <figcaption><b>What Chalkmark remembers.</b> Only cells that held still and look like board. The lecturer never gets in.</figcaption>
        </figure>
      </div>
      <div className="demo-telemetry">
        <div><span>lecture clock</span><strong>{Math.floor(clock / 60)}:{String(Math.floor(clock % 60)).padStart(2, "0")}</strong></div>
        <div><span>frames analysed</span><strong>{stats.frames}</strong></div>
        <div><span>grid cells</span><strong>{cells}</strong></div>
        <div><span>ignored now</span><strong>{stats.occluded}</strong></div>
        <div><span>cell commits</span><strong>{stats.commits}</strong></div>
        <div><span>boards saved</span><strong className="lime">{saved.length}</strong></div>
      </div>
      <div className="demo-saved">
        <span className="demo-saved-label">Saved the instant before erase →</span>
        {saved.length === 0 && <span className="demo-saved-empty">waiting for the lecturer to erase…</span>}
        {saved.map((snap, i) => (
          <figure key={`${snap.t}-${i}`} className="demo-saved-card">
            <img src={snap.url} alt={`Board saved at ${Math.round(snap.t)} seconds`} />
            <figcaption>{snap.reason === "erase" ? "before erase" : snap.reason} · {Math.floor(snap.t / 60)}:{String(Math.round(snap.t % 60)).padStart(2, "0")}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
