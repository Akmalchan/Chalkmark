"use client";

import { useRef } from "react";
import type { Point, Quad } from "@/lib/board/geometry";

type Props = {
  /** Intrinsic size of the video, which is the coordinate space of `quad`. */
  width: number;
  height: number;
  quad: Quad;
  onChange: (quad: Quad) => void;
};

const LABELS = ["top-left", "top-right", "bottom-right", "bottom-left"];

/** Four draggable corners over the video; the board inside becomes a flat rectangle. */
export function CornerPicker({ width, height, quad, onChange }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);

  const toVideo = (event: React.PointerEvent): Point => {
    const rect = svg.current!.getBoundingClientRect();
    // The SVG uses preserveAspectRatio="xMidYMid meet", same as object-fit: contain on the video.
    const scale = Math.min(rect.width / width, rect.height / height);
    const offsetX = (rect.width - width * scale) / 2, offsetY = (rect.height - height * scale) / 2;
    return {
      x: Math.min(width, Math.max(0, (event.clientX - rect.left - offsetX) / scale)),
      y: Math.min(height, Math.max(0, (event.clientY - rect.top - offsetY) / scale)),
    };
  };

  const move = (event: React.PointerEvent) => {
    if (dragging.current === null) return;
    const next = [...quad] as Quad;
    next[dragging.current] = toVideo(event);
    onChange(next);
  };

  const handle = Math.max(width, height) * 0.014;
  const points = quad.map(p => `${p.x},${p.y}`).join(" ");
  return (
    <svg
      ref={svg}
      className="corner-picker"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerMove={move}
      onPointerUp={() => { dragging.current = null; }}
      onPointerLeave={() => { dragging.current = null; }}
    >
      <defs>
        <mask id="board-mask">
          <rect width={width} height={height} fill="white" />
          <polygon points={points} fill="black" />
        </mask>
      </defs>
      <rect width={width} height={height} fill="rgba(10,16,14,.55)" mask="url(#board-mask)" />
      <polygon points={points} fill="none" stroke="#d8ff65" strokeWidth={handle * 0.28} strokeDasharray={`${handle} ${handle * 0.6}`} />
      {quad.map((p, i) => (
        <g key={i}>
          <circle
            cx={p.x} cy={p.y} r={handle * 1.6}
            className="corner-handle"
            aria-label={`Drag the ${LABELS[i]} corner of the board`}
            onPointerDown={event => { (event.target as Element).setPointerCapture(event.pointerId); dragging.current = i; }}
          />
          <circle cx={p.x} cy={p.y} r={handle * 0.45} fill="#16221e" pointerEvents="none" />
        </g>
      ))}
    </svg>
  );
}
