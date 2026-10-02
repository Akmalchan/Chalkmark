"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardState } from "@/lib/client/session";

type Point = { t: number; memory: number; visible: number };

const H = 190, X0 = 54, Y0 = 18, Y1 = 150;
const REASON_LABEL: Record<string, string> = { erase: "before erase", view: "camera moved", final: "final board", manual: "saved by hand" };
const REASON_COLOR: Record<string, string> = { erase: "#ff6b35", view: "#3ea2f2", final: "#5d8a1f", manual: "#6f4aa5" };

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

/**
 * The lecture as the engine measures it, live: ink held in board memory (steady, it ignores the
 * lecturer) vs ink visible to the camera (dips whenever someone blocks the board), and every save.
 */
export function InkChart({ trace, boards, duration }: { trace: Point[]; boards: BoardState[]; duration: number }) {
  // Drawn at the container's real width so dots and labels never stretch.
  const box = useRef<HTMLElement>(null);
  const [W, setW] = useState(1000);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(320, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const X1 = W - 14;
  const end = Math.max(duration, trace.at(-1)?.t ?? 0, 30);
  const peak = Math.max(400, ...trace.map(p => Math.max(p.memory, p.visible)));
  const top = Math.ceil((peak * 1.12) / 500) * 500;
  const x = (t: number) => X0 + (t / end) * (X1 - X0);
  const y = (v: number) => Y1 - (Math.min(v, top) / top) * (Y1 - Y0);
  const path = (key: "memory" | "visible") => trace.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");
  const memoryAt = (t: number) => {
    let best = trace[0];
    for (const p of trace) { if (p.t > t) break; best = p; }
    return best?.memory ?? 0;
  };
  const last = trace.at(-1);
  const ticks = Array.from({ length: 6 }, (_, i) => (end * i) / 5);
  const area = trace.length > 1 ? `${path("memory")} L${x(last!.t).toFixed(1)} ${Y1} L${x(trace[0].t).toFixed(1)} ${Y1} Z` : "";

  return (
    <section className="ink-chart" ref={box} aria-label="Ink on the board over time">
      <header>
        <span className="ink-chart-title">Ink on the board over time</span>
        <span className="ink-legend"><i className="memory" />board memory <b>{compact(last?.memory ?? 0)}</b></span>
        <span className="ink-legend"><i className="visible" />visible to camera <b>{compact(last?.visible ?? 0)}</b></span>
        <span className="ink-legend"><i className="snap" />board saved <b>{boards.length}</b></span>
      </header>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, stroke: "none", fill: "none", display: "block" }}>
        <defs>
          <linearGradient id="ink-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#9fd84a" stopOpacity=".32" /><stop offset="1" stopColor="#9fd84a" stopOpacity="0" /></linearGradient>
        </defs>
        {[0, 0.5, 1].map(f => (
          <g key={f}>
            <line x1={X0} x2={X1} y1={y(top * f)} y2={y(top * f)} stroke="#e3dfd3" strokeWidth={1} />
            <text x={X0 - 8} y={y(top * f) + 4} textAnchor="end" className="ink-axis">{compact(top * f)}</text>
          </g>
        ))}
        {ticks.map(t => <text key={t} x={x(t)} y={H - 18} textAnchor="middle" className="ink-axis">{clock(t)}</text>)}
        <line x1={X0} x2={X1} y1={Y1} y2={Y1} stroke="#b9bfb6" strokeWidth={1} />
        {boards.map(board => (
          <g key={board.page.id}>
            <line x1={x(board.page.t)} x2={x(board.page.t)} y1={Y0} y2={Y1} stroke={REASON_COLOR[board.page.reason] ?? "#ff6b35"} strokeWidth={1} strokeDasharray="3 3" opacity={board.status === "skipped" ? 0.25 : 0.7} />
            <circle cx={x(board.page.t)} cy={y(memoryAt(board.page.t))} r={4.2} fill={REASON_COLOR[board.page.reason] ?? "#ff6b35"} opacity={board.status === "skipped" ? 0.35 : 1}>
              <title>{`${REASON_LABEL[board.page.reason] ?? "saved"} · ${clock(board.page.t)}${board.status === "skipped" ? " (draft, skipped)" : ""}`}</title>
            </circle>
          </g>
        ))}
        {area && <path d={area} fill="url(#ink-area)" />}
        <path d={path("visible")} fill="none" stroke="#3ea2f2" strokeWidth={1.2} strokeOpacity={0.85} strokeLinejoin="round" />
        <path d={path("memory")} fill="none" stroke="#5d8a1f" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
        {last && <circle cx={x(last.t)} cy={y(last.memory)} r={5} fill="#5d8a1f" className="ink-head" />}
      </svg>
    </section>
  );
}
