import { useId } from "react";
import type { FigureSpec } from "@/lib/notes/figure";
import { niceTicks, sampleExpression } from "@/lib/plot-math";
import { StructureFigure } from "./StructureFigure";

type Color = (typeof import("@/lib/notes/figure").FIGURE_COLORS)[number];
const PALETTE: Record<Color, string> = {
  ink: "#1d2622", blue: "#2a58a8", red: "#b3322d", green: "#2f7a45", orange: "#c4741a", purple: "#6f4aa5",
};
const ink = (color: Color) => PALETTE[color] ?? PALETTE.ink;

/** Single letters and subscripted symbols read as math variables: set them in italic. */
const isVariable = (text: string) => /^[A-Za-zα-ωΑ-Ω][₀-₉ⁿ²³'′]*$/.test(text.trim());

function Label({ x, y, text, color = "ink", anchor = "start", size = 21 }: { x: number; y: number; text: string; color?: Color; anchor?: "start" | "middle" | "end"; size?: number }) {
  if (!text) return null;
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fill={ink(color)} className={`redraw-label ${isVariable(text) ? "variable" : ""}`} paintOrder="stroke" stroke="#fffdf8" strokeWidth={5} strokeLinejoin="round">
      {text}
    </text>
  );
}

function Plot({ spec }: { spec: NonNullable<FigureSpec["plot"]> }) {
  const id = useId().replace(/:/g, "");
  const W = 640, H = 440, pad = { left: 48, right: 36, top: 26, bottom: 40 };
  let { xMin, xMax, yMin, yMax } = spec;
  if (!(xMax > xMin)) { xMin = -5; xMax = 5; }
  if (!(yMax > yMin)) { yMin = -5; yMax = 5; }
  const sx = (x: number) => pad.left + ((x - xMin) / (xMax - xMin)) * (W - pad.left - pad.right);
  const sy = (y: number) => H - pad.bottom - ((y - yMin) / (yMax - yMin)) * (H - pad.top - pad.bottom);
  const axisY = sy(Math.min(yMax, Math.max(yMin, 0)));
  const axisX = sx(Math.min(xMax, Math.max(xMin, 0)));
  const xTicks = niceTicks(xMin, xMax).filter(t => Math.abs(t.value) > 1e-9);
  const yTicks = niceTicks(yMin, yMax).filter(t => Math.abs(t.value) > 1e-9);
  // Labels always stay inside the plot (never spill over the text around the figure).
  const cx = (x: number) => Math.min(W - pad.right - 4, Math.max(pad.left + 4, x));
  const cy = (y: number) => Math.min(H - pad.bottom - 6, Math.max(pad.top + 14, y));
  const inView = (p: { x: number; y: number }) => p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax;
  const path = (points: Array<{ x: number; y: number }>) => points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="redraw-svg" role="img" aria-label="Redrawn graph">
      <defs>
        <clipPath id={`${id}-clip`}><rect x={pad.left} y={pad.top} width={W - pad.left - pad.right} height={H - pad.top - pad.bottom} /></clipPath>
        {(Object.keys(PALETTE) as Color[]).map(c => (
          <marker key={c} id={`${id}-arrow-${c}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={ink(c)} />
          </marker>
        ))}
      </defs>
      {spec.grid && xTicks.map((t, i) => <line key={`gx${i}`} x1={sx(t.value)} x2={sx(t.value)} y1={pad.top} y2={H - pad.bottom} className="redraw-grid" />)}
      {spec.grid && yTicks.map((t, i) => <line key={`gy${i}`} x1={pad.left} x2={W - pad.right} y1={sy(t.value)} y2={sy(t.value)} className="redraw-grid" />)}
      {/* Axes with arrowheads, ticks and labels, the way they are drawn on a board. */}
      <line x1={pad.left - 8} x2={W - pad.right + 14} y1={axisY} y2={axisY} className="redraw-axis" markerEnd={`url(#${id}-arrow-ink)`} />
      <line x1={axisX} x2={axisX} y1={H - pad.bottom + 8} y2={pad.top - 14} className="redraw-axis" markerEnd={`url(#${id}-arrow-ink)`} />
      {xTicks.map((t, i) => <g key={`tx${i}`}><line x1={sx(t.value)} x2={sx(t.value)} y1={axisY - 4} y2={axisY + 4} className="redraw-axis" /><text x={sx(t.value)} y={axisY + 22} textAnchor="middle" className="redraw-tick">{t.label}</text></g>)}
      {yTicks.map((t, i) => <g key={`ty${i}`}><line x1={axisX - 4} x2={axisX + 4} y1={sy(t.value)} y2={sy(t.value)} className="redraw-axis" /><text x={axisX - 9} y={sy(t.value) + 5} textAnchor="end" className="redraw-tick">{t.label}</text></g>)}
      <Label x={W - pad.right + 18} y={axisY + 5} text={spec.xLabel} />
      <Label x={axisX + 8} y={pad.top - 8} text={spec.yLabel} />
      {xMin < 0 && yMin < 0 && !spec.points.some(p => p.at.x === 0 && p.at.y === 0) && !spec.labels.some(l => /^[O0]$/.test(l.text.trim())) && <Label x={axisX - 18} y={axisY + 22} text="O" size={18} />}

      <g clipPath={`url(#${id}-clip)`}>
        {spec.curves.map((curve, i) => {
          let segments: Array<Array<{ x: number; y: number }>> = [];
          if (curve.expression) { try { segments = sampleExpression(curve.expression, xMin, xMax, yMin, yMax); } catch { segments = []; } }
          if (!segments.length && curve.points.length > 1) segments = [curve.points];
          return segments.map((points, j) => <path key={`c${i}-${j}`} d={path(points)} fill="none" stroke={ink(curve.color)} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={curve.dashed ? "10 8" : undefined} />);
        })}
        {spec.segments.map((segment, i) => <line key={`s${i}`} x1={sx(segment.from.x)} y1={sy(segment.from.y)} x2={sx(segment.to.x)} y2={sy(segment.to.y)} stroke={ink(segment.color)} strokeWidth={2.2} strokeDasharray={segment.dashed ? "8 7" : undefined} />)}
        {spec.arrows.map((arrow, i) => <line key={`a${i}`} x1={sx(arrow.from.x)} y1={sy(arrow.from.y)} x2={sx(arrow.to.x)} y2={sy(arrow.to.y)} stroke={ink(arrow.color)} strokeWidth={3.2} strokeDasharray={arrow.dashed ? "8 6" : undefined} markerEnd={`url(#${id}-arrow-${arrow.color})`} />)}
        {spec.points.map((point, i) => <circle key={`p${i}`} cx={sx(point.at.x)} cy={sy(point.at.y)} r={5.5} fill={ink(point.color)} />)}
      </g>

      {spec.curves.map((curve, i) => {
        if (!curve.label) return null;
        // Label each curve near its right end, inside the plot.
        let anchor: { x: number; y: number } | null = null;
        if (curve.expression) { try { const segs = sampleExpression(curve.expression, xMin, xMax, yMin, yMax); const last = segs.at(-1); anchor = last?.[Math.floor(last.length * 0.82)] ?? null; } catch { anchor = null; } }
        anchor ??= curve.points.at(-1) ?? null;
        return anchor ? <Label key={`cl${i}`} x={Math.min(W - pad.right - 4, sx(anchor.x) + 8)} y={Math.max(pad.top + 12, sy(anchor.y) - 8)} text={curve.label} color={curve.color} anchor={sx(anchor.x) > W - 160 ? "end" : "start"} size={19} /> : null;
      })}
      {spec.arrows.map((arrow, i) => <Label key={`al${i}`} x={cx(sx(arrow.to.x) + (arrow.to.x >= arrow.from.x ? 8 : -8))} y={cy(sy(arrow.to.y) + (arrow.to.y >= arrow.from.y ? -8 : 18))} text={arrow.label} color={arrow.color} anchor={arrow.to.x >= arrow.from.x ? "start" : "end"} />)}
      {spec.segments.map((segment, i) => segment.label ? <Label key={`sl${i}`} x={cx((sx(segment.from.x) + sx(segment.to.x)) / 2 + 6)} y={cy((sy(segment.from.y) + sy(segment.to.y)) / 2 - 6)} text={segment.label} color={segment.color} size={18} /> : null)}
      {spec.points.map((point, i) => <Label key={`pl${i}`} x={cx(sx(point.at.x) + 9)} y={cy(sy(point.at.y) - 9)} text={point.label} color={point.color} size={19} />)}
      {spec.labels.map((label, i) => !inView(label.at) ? null : <Label key={`l${i}`} x={cx(sx(label.at.x))} y={cy(sy(label.at.y))} text={label.text} color={label.color} size={19} anchor="middle" />)}
    </svg>
  );
}

/** Catmull-Rom spline through the points, as cubic Béziers. */
function smoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length < 3) return points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join("");
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    d += `C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`;
  }
  return d;
}

function Sketch({ spec }: { spec: NonNullable<FigureSpec["sketch"]> }) {
  const id = useId().replace(/:/g, "");
  const height = Math.min(200, Math.max(10, spec.height));
  const stroke = 0.7;
  return (
    <svg viewBox={`-3 -3 106 ${height + 6}`} className="redraw-svg" role="img" aria-label="Redrawn sketch">
      <defs>
        {(Object.keys(PALETTE) as Color[]).map(c => (
          <marker key={c} id={`${id}-arrow-${c}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={ink(c)} />
          </marker>
        ))}
      </defs>
      {spec.shapes.map((shape, i) => {
        const colour = ink(shape.color);
        const common = { stroke: colour, strokeWidth: stroke, strokeDasharray: shape.dashed ? "1.6 1.2" : undefined, fill: shape.fill ? `${colour}22` : "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
        const pts = shape.points;
        const [a, b] = pts;
        switch (shape.type) {
          case "line": return a && b ? <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...common} /> : null;
          case "arrow": return a && b ? <path key={i} d={pts.map((p, k) => `${k ? "L" : "M"}${p.x},${p.y}`).join("")} {...common} fill="none" markerEnd={`url(#${id}-arrow-${shape.color})`} /> : null;
          case "polyline": return pts.length > 1 ? <polyline key={i} points={pts.map(p => `${p.x},${p.y}`).join(" ")} {...common} fill="none" /> : null;
          case "curve": return pts.length > 1 ? <path key={i} d={smoothPath(pts)} {...common} fill="none" /> : null;
          case "polygon": return pts.length > 2 ? <polygon key={i} points={pts.map(p => `${p.x},${p.y}`).join(" ")} {...common} /> : null;
          case "circle": return a ? <circle key={i} cx={a.x} cy={a.y} r={shape.rx ?? 3} {...common} /> : null;
          case "ellipse": return a ? <ellipse key={i} cx={a.x} cy={a.y} rx={shape.rx ?? 4} ry={shape.ry ?? shape.rx ?? 3} {...common} /> : null;
          case "rect": return a && b ? <rect key={i} x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)} rx={0.6} {...common} /> : null;
          case "text": return a ? <text key={i} x={a.x} y={a.y} fontSize={4.6} fill={colour} className={`redraw-label ${isVariable(shape.text) ? "variable" : ""}`} paintOrder="stroke" stroke="#fffdf8" strokeWidth={0.8}>{shape.text}</text> : null;
          default: return null;
        }
      })}
    </svg>
  );
}

export function FigureRedraw({ spec }: { spec: FigureSpec }) {
  if (spec.kind === "plot" && spec.plot) return <Plot spec={spec.plot} />;
  if (spec.kind === "sketch" && spec.sketch) return <Sketch spec={spec.sketch} />;
  if (spec.kind === "structure" && spec.structure) return <StructureFigure spec={spec.structure} />;
  return null;
}
