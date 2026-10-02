import { z } from "zod";

/**
 * A clean, vector redraw of a board figure. Graphs become a "plot" in real coordinates, so curves
 * given as equations are computed exactly; everything else becomes a "sketch" of simple shapes on a
 * 100-wide canvas. The original ink is always kept alongside for verification.
 */

const point = z.object({ x: z.number(), y: z.number() });
export const FIGURE_COLORS = ["ink", "blue", "red", "green", "orange", "purple"] as const;
const color = z.enum(FIGURE_COLORS);

export const STRUCTURE_TYPES = ["array", "linked-list", "doubly-linked-list", "stack", "queue", "tree", "graph", "hash-table"] as const;

/** A data structure, described as data; the renderer computes a clean layout (never hand coordinates). */
export const structureSchema = z.object({
  type: z.enum(STRUCTURE_TYPES),
  /** array / stack / queue: cells in order (stack: bottom → top; queue: front → rear). */
  cells: z.array(z.object({ label: z.string(), index: z.string(), highlight: z.boolean() })).max(40),
  /** linked lists, trees, graphs. */
  nodes: z.array(z.object({ id: z.string(), label: z.string(), highlight: z.boolean() })).max(40),
  /** linked list: next pointers; tree: parent → child (side left/right for binary trees); graph: edges. */
  edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string(), side: z.enum(["left", "right", "none"]) })).max(80),
  directed: z.boolean(),
  /** hash-table: one entry per bucket, items chained in order. */
  buckets: z.array(z.object({ key: z.string(), items: z.array(z.string()) })).max(20),
  /** Named pointers: head, tail, top, front, rear, root, cur, i… pointing at a node id or a cell index. */
  pointers: z.array(z.object({ label: z.string(), to: z.string() })).max(10),
});
export type StructureSpec = z.infer<typeof structureSchema>;

export const figureSpecSchema = z.object({
  kind: z.enum(["plot", "sketch", "structure"]),
  plot: z.object({
    xMin: z.number(), xMax: z.number(), yMin: z.number(), yMax: z.number(),
    xLabel: z.string(), yLabel: z.string(),
    grid: z.boolean(),
    curves: z.array(z.object({
      label: z.string(),
      expression: z.string().nullable(),
      points: z.array(point),
      color, dashed: z.boolean(),
    })).max(8),
    arrows: z.array(z.object({ from: point, to: point, label: z.string(), color, dashed: z.boolean() })).max(12),
    segments: z.array(z.object({ from: point, to: point, label: z.string(), color, dashed: z.boolean() })).max(20),
    points: z.array(z.object({ at: point, label: z.string(), color })).max(20),
    labels: z.array(z.object({ at: point, text: z.string(), color })).max(20),
  }).nullable(),
  sketch: z.object({
    height: z.number().positive(),
    shapes: z.array(z.object({
      type: z.enum(["line", "arrow", "polyline", "curve", "polygon", "circle", "ellipse", "rect", "text"]),
      points: z.array(point),
      rx: z.number().nullable(),
      ry: z.number().nullable(),
      text: z.string(),
      color, dashed: z.boolean(), fill: z.boolean(),
    })).max(80),
  }).nullable(),
  structure: structureSchema.nullable().optional(),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.string().nullable(),
});
export type FigureSpec = z.infer<typeof figureSpecSchema>;

/** Plain-text description of the JSON shape for the prompt (the nested schema is validated locally). */
export const FIGURE_SPEC_GUIDE = `Return JSON:
{
  "kind": "plot" | "sketch" | "structure",
  "plot": null | {
    "xMin", "xMax", "yMin", "yMax": numbers (math coordinates; include every key feature with a little margin),
    "xLabel", "yLabel": axis names as written (e.g. "x", "t", "v(t)"), "" if none,
    "grid": true only if the board shows a grid,
    "curves": [{ "label", "expression": "explicit y in terms of x using + - * / ^ ( ) x pi e sin cos tan exp log sqrt abs" or null, "points": [{x,y}] (only when expression is null: a hand-drawn shape, in drawing order), "color", "dashed" }],
    "arrows": [{ "from": {x,y}, "to": {x,y}, "label", "color", "dashed" }]   (vectors),
    "segments": [{ "from", "to", "label", "color", "dashed" }]   (straight construction lines, parallelogram sides, dashed guides),
    "points": [{ "at": {x,y}, "label", "color" }]   (marked points, intersections — compute exact coordinates),
    "labels": [{ "at": {x,y}, "text", "color" }]   (free text placed in the plot)
  },
  "sketch": null | {
    "height": canvas height when the width is 100 (keep the drawing's aspect ratio),
    "shapes": [{ "type": "line"|"arrow"|"polyline"|"curve"|"polygon"|"circle"|"ellipse"|"rect"|"text",
                 "points": [{x,y}] (canvas coordinates, x 0-100 left→right, y 0-height top→bottom; circle/ellipse: [center]; rect: [top-left, bottom-right]; text: [anchor]),
                 "rx", "ry": radii for circle/ellipse else null, "text": label text or "",
                 "color", "dashed", "fill" }]
  },
  "structure": null | {
    "type": "array" | "linked-list" | "doubly-linked-list" | "stack" | "queue" | "tree" | "graph" | "hash-table",
    "cells": [{ "label", "index": "" or the index written under it, "highlight" }]   (array: left→right; stack: bottom→top; queue: front→rear),
    "nodes": [{ "id": short unique id, "label": value shown in the node, "highlight" }]   (linked lists, trees, graphs),
    "edges": [{ "from": id, "to": id, "label": weight or "", "side": "left"|"right"|"none" (binary-tree child side) }]   (list: next pointers in order; tree: parent→child; graph: edges),
    "directed": true if edges have arrowheads (lists are always directed),
    "buckets": [{ "key": bucket index, "items": ["values chained in this bucket", ...] }]   (hash-table),
    "pointers": [{ "label": "head"|"tail"|"top"|"root"|"cur"|..., "to": node id or cell index }]
  },
  "confidence": "high" | "medium" | "low",
  "notes": what you could not determine, or null
}
color is one of: "ink", "blue", "red", "green", "orange", "purple".`;

/* ---------- Lenient normalisation: Gemini's free-form JSON often omits fields; keep what is usable. ---------- */

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const bool = (v: unknown) => v === true || v === "true";
const colour = (v: unknown): (typeof FIGURE_COLORS)[number] => {
  const name = str(v).toLowerCase();
  if ((FIGURE_COLORS as readonly string[]).includes(name)) return name as (typeof FIGURE_COLORS)[number];
  if (/black|white|chalk|gr[ae]y/.test(name)) return "ink";
  if (/yellow|amber/.test(name)) return "orange";
  if (/pink|magenta|violet/.test(name)) return "purple";
  return "ink";
};
const pt = (v: unknown) => {
  if (Array.isArray(v) && v.length >= 2) { const x = num(v[0]), y = num(v[1]); return x === null || y === null ? null : { x, y }; }
  const o = obj(v); const x = num(o.x), y = num(o.y);
  return x === null || y === null ? null : { x, y };
};
const pts = (v: unknown) => arr(v).map(pt).filter((p): p is { x: number; y: number } => p !== null);
const SHAPES = ["line", "arrow", "polyline", "curve", "polygon", "circle", "ellipse", "rect", "text"] as const;

function normalizeStructure(raw: Json): StructureSpec | null {
  const typeName = str(raw.type).toLowerCase().replace(/[\s_]+/g, "-");
  const alias: Record<string, (typeof STRUCTURE_TYPES)[number]> = { list: "linked-list", "singly-linked-list": "linked-list", "doubly-linked": "doubly-linked-list", "binary-tree": "tree", bst: "tree", heap: "tree", "binary-search-tree": "tree", hashtable: "hash-table", "hash-map": "hash-table", hashmap: "hash-table", dag: "graph" };
  const type = (STRUCTURE_TYPES as readonly string[]).includes(typeName) ? (typeName as (typeof STRUCTURE_TYPES)[number]) : alias[typeName];
  if (!type) return null;
  const cells = arr(raw.cells ?? raw.items ?? raw.elements).map(v => typeof v === "object" ? { label: str(obj(v).label ?? obj(v).value), index: str(obj(v).index), highlight: bool(obj(v).highlight) } : { label: str(v), index: "", highlight: false }).filter(c => c.label !== "" || c.index !== "").slice(0, 40);
  // A "null"/"NIL"/"∅" node is the end of a list or an empty child, which the renderer already draws.
  const isNull = (label: string) => /^(null|nil|none|nullptr|∅|ø|\/|x)$/i.test(label.trim());
  const nodes = arr(raw.nodes).map((v, i) => { const o = obj(v); const label = str(o.label ?? o.value ?? (typeof v !== "object" ? v : "")); return { id: str(o.id) || label || `n${i}`, label, highlight: bool(o.highlight) }; })
    .filter(n => !(type !== "graph" && isNull(n.label))).slice(0, 40);
  const ids = new Set(nodes.map(n => n.id));
  const edges = arr(raw.edges).map(v => { const o = obj(v); const side = str(o.side).toLowerCase(); return { from: str(o.from ?? o.source), to: str(o.to ?? o.target), label: str(o.label ?? o.weight), side: (side === "left" || side === "right" ? side : "none") as "left" | "right" | "none" }; })
    .filter(e => ids.has(e.from) && ids.has(e.to) && e.from !== e.to).slice(0, 80);
  const buckets = arr(raw.buckets).map((v, i) => { const o = obj(v); return { key: str(o.key ?? o.index) || String(i), items: arr(o.items ?? o.values ?? o.chain).map(str).filter(Boolean) }; }).slice(0, 20);
  const pointers = arr(raw.pointers).map(v => { const o = obj(v); return { label: str(o.label ?? o.name), to: str(o.to ?? o.target) }; }).filter(p => p.label && p.to).slice(0, 10);
  const usable = type === "hash-table" ? buckets.length > 0 : ["array", "stack", "queue"].includes(type) ? cells.length > 0 : nodes.length > 0;
  if (!usable) return null;
  return { type, cells, nodes, edges, directed: type.includes("list") || bool(raw.directed), buckets, pointers };
}

export function normalizeFigureSpec(raw: unknown): FigureSpec | null {
  const root = obj(raw);
  const structureRaw = root.structure && typeof root.structure === "object" ? obj(root.structure) : null;
  if (str(root.kind) === "structure" || (structureRaw && !root.plot && !root.sketch)) {
    const structure = structureRaw ? normalizeStructure(structureRaw) : null;
    if (structure) {
      const confidence = ["high", "medium", "low"].includes(str(root.confidence)) ? (str(root.confidence) as FigureSpec["confidence"]) : "medium";
      return { kind: "structure", plot: null, sketch: null, structure, confidence, notes: str(root.notes).trim() || null };
    }
  }
  const plotRaw = root.plot && typeof root.plot === "object" ? obj(root.plot) : null;
  const sketchRaw = root.sketch && typeof root.sketch === "object" ? obj(root.sketch) : null;
  let kind: "plot" | "sketch" = str(root.kind) === "sketch" ? "sketch" : str(root.kind) === "plot" ? "plot" : plotRaw ? "plot" : "sketch";
  if (kind === "plot" && !plotRaw && sketchRaw) kind = "sketch";
  if (kind === "sketch" && !sketchRaw && plotRaw) kind = "plot";

  let plot: FigureSpec["plot"] = null;
  if (kind === "plot" && plotRaw) {
    const line = (v: unknown) => { const o = obj(v); const from = pt(o.from), to = pt(o.to); return from && to ? { from, to, label: str(o.label), color: colour(o.color), dashed: bool(o.dashed) } : null; };
    plot = {
      xMin: num(plotRaw.xMin) ?? -5, xMax: num(plotRaw.xMax) ?? 5, yMin: num(plotRaw.yMin) ?? -5, yMax: num(plotRaw.yMax) ?? 5,
      xLabel: str(plotRaw.xLabel), yLabel: str(plotRaw.yLabel), grid: bool(plotRaw.grid),
      curves: arr(plotRaw.curves).map(v => { const o = obj(v); const expression = str(o.expression).trim() || null; return { label: str(o.label), expression, points: pts(o.points), color: colour(o.color), dashed: bool(o.dashed) }; })
        .filter(c => c.expression || c.points.length > 1).slice(0, 8),
      arrows: arr(plotRaw.arrows).map(line).filter((a): a is NonNullable<ReturnType<typeof line>> => a !== null).slice(0, 12),
      segments: arr(plotRaw.segments).map(line).filter((a): a is NonNullable<ReturnType<typeof line>> => a !== null).slice(0, 20),
      points: arr(plotRaw.points).map(v => { const o = obj(v); const at = pt(o.at ?? o); return at ? { at, label: str(o.label), color: colour(o.color) } : null; }).filter((p): p is NonNullable<typeof p> => p !== null).slice(0, 20),
      labels: arr(plotRaw.labels).map(v => { const o = obj(v); const at = pt(o.at ?? o); const text = str(o.text ?? o.label); return at && text ? { at, text, color: colour(o.color) } : null; }).filter((p): p is NonNullable<typeof p> => p !== null).slice(0, 20),
    };
    // Free labels that repeat a curve/arrow/point label would be drawn twice.
    const squash = (text: string) => text.replace(/\s+/g, "").toLowerCase();
    const named = new Set([...plot.curves.map(c => c.label), ...plot.arrows.map(a => a.label), ...plot.points.map(p => p.label), ...plot.segments.map(s => s.label)].filter(Boolean).map(squash));
    plot.labels = plot.labels.filter(label => !named.has(squash(label.text)));
    if (plot.xMax <= plot.xMin) [plot.xMin, plot.xMax] = [-5, 5];
    if (plot.yMax <= plot.yMin) [plot.yMin, plot.yMax] = [-5, 5];
  }

  let sketch: FigureSpec["sketch"] = null;
  if (kind === "sketch" && sketchRaw) {
    sketch = {
      height: Math.min(200, Math.max(10, num(sketchRaw.height) ?? 60)),
      shapes: arr(sketchRaw.shapes).map(v => {
        const o = obj(v);
        const type = str(o.type).toLowerCase();
        if (!(SHAPES as readonly string[]).includes(type)) return null;
        const points = pts(o.points ?? (o.center ? [o.center] : o.at ? [o.at] : []));
        if (!points.length) return null;
        return { type: type as (typeof SHAPES)[number], points, rx: num(o.rx ?? o.r ?? o.radius), ry: num(o.ry), text: str(o.text ?? o.label), color: colour(o.color), dashed: bool(o.dashed), fill: bool(o.fill) };
      }).filter((s): s is NonNullable<typeof s> => s !== null).slice(0, 80),
    };
  }

  const usable = (plot && (plot.curves.length || plot.arrows.length || plot.segments.length || plot.points.length)) || (sketch && sketch.shapes.length);
  if (!usable) return null;
  const confidence = ["high", "medium", "low"].includes(str(root.confidence)) ? (str(root.confidence) as FigureSpec["confidence"]) : "medium";
  return { kind: kind as FigureSpec["kind"], plot, sketch, confidence, notes: str(root.notes).trim() || null };
}
