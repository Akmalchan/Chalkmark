import { normalizeMath } from "../eval/score";
import type { FigureSpec } from "./figure";

/**
 * The board is the authority on numbers. A redraw is a model's reading of a hand-drawn sketch, so
 * when the board states exact values — a line's equation, a vector's components — the drawing is
 * checked against them and snapped to them. Every check and correction is reported.
 */

type Line = { a: number; b: number; c: number; label: string };   // a·x + b·y = c
type Vec = { name: string; x: number; y: number };                 // e.g. v1 = (2, 1)
export type BoardFacts = { lines: Line[]; vectors: Vec[] };
export type FigureCheck = { spec: FigureSpec; checked: string[]; corrected: string[] };

const num = (s: string | undefined, fallback: number) => {
  if (s === undefined || s === "" || s === "+") return fallback;
  if (s === "-") return -fallback;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
};

/** Parse "ax + by = c" (either term order, implicit coefficients, signs) from normalized text. */
function parseLines(text: string): Line[] {
  const lines: Line[] = [];
  // Spaces are stripped by normalization, so "Solve 2x+y=3" arrives as "solve2x+y=3": only digits and
  // variables may not precede the first coefficient.
  const re = /(?<![\d.^_xy])([+-]?\d*\.?\d*)([xy])([+-]\d*\.?\d*)([xy])=([+-]?\d+\.?\d*)(?![\d.])/g;
  for (const m of text.matchAll(re)) {
    if (m[2] === m[4]) continue;
    const c1 = num(m[1], 1), c2 = num(m[3], 1), c = Number(m[5]);
    if (![c1, c2, c].every(Number.isFinite)) continue;
    const a = m[2] === "x" ? c1 : c2, b = m[2] === "x" ? c2 : c1;
    if (!a && !b) continue;
    lines.push({ a, b, c, label: m[0] });
  }
  // Slope-intercept "y = mx + b" (m may be a fraction: 1/2, ½, -2/3).
  const value = (s: string) => {
    const vulgar: Record<string, number> = { "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75 };
    if (s in vulgar) return vulgar[s];
    const [p, q] = s.split("/");
    return q === undefined ? Number(p) : Number(p) / Number(q);
  };
  const si = /(?<![\d.^_xyz])y=([+-]?)(\d+\.?\d*(?:\/\d+\.?\d*)?|[½⅓⅔¼¾])?x(?:([+-])(\d+\.?\d*(?:\/\d+\.?\d*)?|[½⅓⅔¼¾]))?(?![\d.\/a-z(^])/g;
  for (const m of text.matchAll(si)) {
    const slope = (m[1] === "-" ? -1 : 1) * (m[2] ? value(m[2]) : 1);
    const intercept = m[4] ? (m[3] === "-" ? -1 : 1) * value(m[4]) : 0;
    if (!Number.isFinite(slope) || !Number.isFinite(intercept)) continue;
    // y = mx + b  ⇔  -m·x + 1·y = b
    lines.push({ a: -slope, b: 1, c: intercept, label: m[0] });
  }
  return lines;
}

/** Parse "v_1 = [2;1]", "v1=(2,1)", "v_1 ... [2;1]" (label stacked above the column) from normalized text. */
function parseVectors(text: string): Vec[] {
  const vectors: Vec[] = [];
  const re = /v_?(\d)([^\[(\d]{0,24}?)[\[(](-?\d+\.?\d*)[;,](-?\d+\.?\d*)[\])]/g;
  for (const m of text.matchAll(re)) {
    const before = text[(m.index ?? 0) - 1] ?? "";
    // "v_1+v_2=[3;-1]" defines a sum, not v2: skip names that are part of an expression.
    if (/[+\-*/]/.test(before) || /[+\-*/]/.test(m[2])) continue;
    vectors.push({ name: `v${m[1]}`, x: Number(m[3]), y: Number(m[4]) });
  }
  // "A = [v_1 v_2] = [2,1;1,-2]": the matrix columns are the named vectors.
  const columns = /\[v_?(\d),?v_?(\d)\]=\[(-?\d+\.?\d*),(-?\d+\.?\d*);(-?\d+\.?\d*),(-?\d+\.?\d*)\]/g;
  for (const m of text.matchAll(columns)) {
    vectors.push({ name: `v${m[1]}`, x: Number(m[3]), y: Number(m[5]) });
    vectors.push({ name: `v${m[2]}`, x: Number(m[4]), y: Number(m[6]) });
  }
  return vectors;
}

export function boardFacts(texts: string[]): BoardFacts {
  const lines: Line[] = [], vectors: Vec[] = [];
  for (const raw of texts) {
    const text = normalizeMath(raw).replace(/\\vec/g, "").replace(/\^t/g, "");
    for (const line of parseLines(text)) if (!lines.some(l => same(l, line))) lines.push(line);
    for (const vector of parseVectors(text)) vectors.push(vector);
  }
  // A name read with two different values is not trustworthy: never snap to it.
  const consistent = vectors.filter(v => vectors.every(w => w.name !== v.name || (w.x === v.x && w.y === v.y)));
  const unique = consistent.filter((v, i) => consistent.findIndex(w => w.name === v.name) === i);
  return { lines, vectors: unique };
}

function same(p: Line, q: Line) {
  const s = Math.abs(p.a) + Math.abs(p.b) + Math.abs(p.c), t = Math.abs(q.a) + Math.abs(q.b) + Math.abs(q.c);
  return [p.a / s - q.a / t, p.b / s - q.b / t, p.c / s - q.c / t].every(d => Math.abs(d) < 1e-6) ||
    [p.a / s + q.a / t, p.b / s + q.b / t, p.c / s + q.c / t].every(d => Math.abs(d) < 1e-6);
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
const lineExpression = (l: Line) => `(${fmt(l.c)} - (${fmt(l.a)})*x)/(${fmt(l.b)})`;
const lineY = (l: Line, x: number) => (l.c - l.a * x) / l.b;
const vectorName = (label: string) => { const m = /v\s*_?\s*([0-9₀-₉])/i.exec(label); return m ? `v${"₀₁₂₃₄₅₆₇₈₉".indexOf(m[1]) >= 0 ? "₀₁₂₃₄₅₆₇₈₉".indexOf(m[1]) : m[1]}` : null; };

function curveValue(curve: NonNullable<FigureSpec["plot"]>["curves"][number], x: number, evaluate: (expression: string) => ((x: number) => number) | null): number | null {
  if (curve.expression) { const f = evaluate(curve.expression); return f ? f(x) : null; }
  if (curve.points.length < 2) return null;
  const sorted = [...curve.points].sort((p, q) => p.x - q.x);
  for (let i = 1; i < sorted.length; i += 1) if (x >= sorted[i - 1].x && x <= sorted[i].x) {
    const t = (x - sorted[i - 1].x) / ((sorted[i].x - sorted[i - 1].x) || 1);
    return sorted[i - 1].y + t * (sorted[i].y - sorted[i - 1].y);
  }
  return null;
}

/**
 * Check a redrawn plot against the board's equations and vectors; snap what disagrees.
 * `compile` turns an arithmetic expression into a function (lib/plot-math compileExpression).
 */
export function checkFigure(spec: FigureSpec, facts: BoardFacts, compile: (expression: string) => (x: number) => number, own?: BoardFacts): FigureCheck {
  const checked: string[] = [], corrected: string[] = [];
  if (spec.kind !== "plot" || !spec.plot) return { spec, checked, corrected };
  const plot = structuredClone(spec.plot);
  const evaluate = (expression: string) => { try { return compile(expression); } catch { return null; } };
  const span = Math.max(1, plot.yMax - plot.yMin);
  const used = new Set<Line>();

  // Lines, pass 1: a curve takes the board line its label names (unless another curve already took it),
  // or the board line it already follows closely.
  type Curve = (typeof plot.curves)[number];
  const sampleXs = (curve: Curve) => {
    // Sample where the curve actually exists (a hand-drawn trace may not span the whole plot).
    const lo = curve.expression || !curve.points.length ? plot.xMin : Math.min(...curve.points.map(p => p.x));
    const hi = curve.expression || !curve.points.length ? plot.xMax : Math.max(...curve.points.map(p => p.x));
    return [0.15, 0.5, 0.85].map(t => lo + t * (hi - lo));
  };
  const errorTo = (curve: Curve, l: Line) => Math.max(...sampleXs(curve).map(x => { const y = curveValue(curve, x, evaluate); return y === null ? Infinity : Math.abs(y - lineY(l, x)); }));
  const isStraight = (curve: Curve) => {
    const [x0, x1, x2] = sampleXs(curve);
    const [y0, y1, y2] = [x0, x1, x2].map(x => curveValue(curve, x, evaluate));
    if (y0 === null || y1 === null || y2 === null) return false;
    return Math.abs(y1 - (y0 + (y2 - y0) * (x1 - x0) / ((x2 - x0) || 1))) < span * 0.03;
  };
  const snapped = new Set<Curve>();
  const snap = (curve: Curve, target: Line, relabel: boolean) => {
    used.add(target);
    snapped.add(curve);
    const drawn = [plot.xMin, plot.xMax].map(x => curveValue(curve, x, evaluate));
    const exact = curve.expression && drawn.every((y, i) => y !== null && Math.abs(y - lineY(target, i ? plot.xMax : plot.xMin)) < 1e-6);
    curve.expression = lineExpression(target);
    curve.points = [];
    if (!curve.label || relabel) curve.label = target.label.replace(/\*/g, "");
    (exact ? checked : corrected).push(`line ${target.label}`);
  };
  // The figure's own caption/description names its lines ("Graph of y = ½x − 2"): those come first, and a
  // label naming some other line of the lecture is not trusted over them.
  const ownLines = (own?.lines ?? []).map(l => facts.lines.find(f => same(f, l)) ?? l);
  const pool = ownLines.length ? ownLines : facts.lines;
  // Marked points a curve passes through pin it down: never move it onto a line that misses them all.
  const tolerance = span * 0.04;
  const onCurve = (curve: Curve) => plot.points.filter(p => { const y = curveValue(curve, p.at.x, evaluate); return y !== null && Math.abs(y - p.at.y) < tolerance; });
  const keepsPoints = (curve: Curve, l: Line) => { const pinned = onCurve(curve); return !pinned.length || pinned.some(p => Math.abs(lineY(l, p.at.x) - p.at.y) < tolerance); };
  const pending: Curve[] = [];
  for (const curve of plot.curves) {
    const labeled = parseLines(normalizeMath(curve.label))[0];
    const known = labeled ? (ownLines.find(l => same(l, labeled)) ?? (ownLines.length ? undefined : facts.lines.find(l => same(l, labeled)))) : undefined;
    const named = known ?? (labeled && !facts.lines.length && !ownLines.length ? labeled : undefined);
    if (named && named.b !== 0 && !used.has(named) && keepsPoints(curve, named)) { snap(curve, named, false); continue; }
    const scored = pool.filter(l => l.b !== 0 && !used.has(l) && keepsPoints(curve, l)).map(l => ({ l, error: errorTo(curve, l) })).sort((p, q) => p.error - q.error);
    if (scored[0] && scored[0].error < span * 0.12) { snap(curve, scored[0].l, Boolean(labeled)); continue; }
    pending.push(curve);
  }
  // Pass 2: when the straight lines left over and the board lines left over are equally many, each drawn
  // line is a wrong copy of one board line — pair them by best fit and fix them (labels included).
  const leftover = pool.filter(l => l.b !== 0 && !used.has(l));
  const straight = pending.filter(isStraight);
  if (straight.length && straight.length === leftover.length && leftover.length <= 3) {
    const pairs = straight.flatMap(curve => leftover.filter(l => keepsPoints(curve, l)).map(l => ({ curve, l, error: errorTo(curve, l) }))).sort((p, q) => p.error - q.error);
    const taken = new Set<Curve>();
    for (const { curve, l } of pairs) if (!taken.has(curve) && !used.has(l)) { taken.add(curve); snap(curve, l, true); }
  }
  // A labeled line that is not on the board (and was not paired above) still matches its own label exactly.
  for (const curve of pending) {
    const labeled = parseLines(normalizeMath(curve.label))[0];
    if (labeled && labeled.b !== 0 && !snapped.has(curve) && !facts.lines.some(l => same(l, labeled)) && keepsPoints(curve, labeled)) snap(curve, labeled, false);
  }

  // Vectors: labeled arrows take the board's components exactly.
  const moved = new Map<string, { x: number; y: number }>();
  const key = (p: { x: number; y: number }) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
  const vectorArrows = plot.arrows.filter(arrow => vectorName(arrow.label));
  const before = vectorArrows.map(arrow => ({ ...arrow.to }));
  for (const arrow of vectorArrows) {
    const fact = facts.vectors.find(v => v.name === vectorName(arrow.label));
    if (!fact) continue;
    const want = { x: arrow.from.x + fact.x, y: arrow.from.y + fact.y };
    if (Math.abs(arrow.to.x - want.x) < 1e-6 && Math.abs(arrow.to.y - want.y) < 1e-6) { checked.push(`${arrow.label} = (${fmt(fact.x)}, ${fmt(fact.y)})`); continue; }
    moved.set(key(arrow.to), want);
    corrected.push(`${arrow.label} → (${fmt(fact.x)}, ${fmt(fact.y)})`);
    arrow.to = want;
  }
  if (moved.size) {
    // The parallelogram corner (sum of the two vectors) moves with them; guides follow their endpoints.
    if (vectorArrows.length >= 2) {
      const oldSum = { x: before[0].x + before[1].x - vectorArrows[0].from.x, y: before[0].y + before[1].y - vectorArrows[0].from.y };
      const newSum = { x: vectorArrows[0].to.x + vectorArrows[1].to.x - vectorArrows[0].from.x, y: vectorArrows[0].to.y + vectorArrows[1].to.y - vectorArrows[0].from.y };
      moved.set(key(oldSum), newSum);
    }
    const near = (p: { x: number; y: number }) => [...moved.entries()].find(([k]) => { const [x, y] = k.split(",").map(Number); return Math.hypot(p.x - x, p.y - y) < Math.max(0.35, span * 0.06); })?.[1];
    for (const segment of plot.segments) { segment.from = near(segment.from) ?? segment.from; segment.to = near(segment.to) ?? segment.to; }
    for (const arrow of plot.arrows) if (!vectorName(arrow.label)) arrow.to = near(arrow.to) ?? arrow.to;
    for (const point of plot.points) point.at = near(point.at) ?? point.at;
    for (const label of plot.labels) label.at = near(label.at) ?? label.at;
  }

  // Marked points near the intersection of two board lines sit exactly on it.
  const drawnLines = [...used];
  for (let i = 0; i < drawnLines.length; i += 1) for (let j = i + 1; j < drawnLines.length; j += 1) {
    const p = drawnLines[i], q = drawnLines[j];
    const det = p.a * q.b - q.a * p.b;
    if (Math.abs(det) < 1e-9) continue;
    const at = { x: (p.c * q.b - q.c * p.b) / det, y: (p.a * q.c - q.a * p.c) / det };
    const point = plot.points.find(pt => Math.hypot(pt.at.x - at.x, pt.at.y - at.y) < Math.max(0.4, span * 0.08));
    if (point) {
      if (Math.hypot(point.at.x - at.x, point.at.y - at.y) > 1e-6) corrected.push(`intersection → (${fmt(at.x)}, ${fmt(at.y)})`);
      else checked.push(`intersection (${fmt(at.x)}, ${fmt(at.y)})`);
      point.at = at;
    }
  }

  // Keep everything in view after corrections.
  const xs = [...plot.arrows.flatMap(a => [a.from.x, a.to.x]), ...plot.points.map(p => p.at.x)];
  const ys = [...plot.arrows.flatMap(a => [a.from.y, a.to.y]), ...plot.points.map(p => p.at.y)];
  if (xs.length) { plot.xMin = Math.min(plot.xMin, Math.min(...xs) - 0.5); plot.xMax = Math.max(plot.xMax, Math.max(...xs) + 0.5); }
  if (ys.length) { plot.yMin = Math.min(plot.yMin, Math.min(...ys) - 0.5); plot.yMax = Math.max(plot.yMax, Math.max(...ys) + 0.5); }

  return { spec: { ...spec, plot }, checked, corrected };
}

/** A canonical description of a checked plot (its lines and vectors), to spot the same figure twice. */
export function plotSignature(spec: FigureSpec | null | undefined): string | null {
  const plot = spec?.kind === "plot" ? spec.plot : null;
  if (!plot) return null;
  const round = (v: number) => Math.round(v * 10) / 10;
  const lines = plot.curves.map(c => c.expression ?? "").filter(Boolean).sort();
  const arrows = plot.arrows.map(a => `${round(a.to.x - a.from.x)},${round(a.to.y - a.from.y)}`).sort();
  if (!lines.length && !arrows.length) return null;
  return JSON.stringify({ lines, arrows });
}
