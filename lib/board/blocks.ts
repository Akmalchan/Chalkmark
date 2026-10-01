import type { RGBAImage } from "./geometry";

/** Normalized box: x0,y0,x1,y1 in 0..1 of the board image. */
export type Box = [number, number, number, number];

export type CellMaps = {
  cols: number;
  rows: number;
  ink: ArrayLike<number>;
  birth: ArrayLike<number>;
  fresh: ArrayLike<number>;
};

/** Gemini returns [ymin, xmin, ymax, xmax] on a 0–1000 scale. */
export function fromGeminiBox(box: number[]): Box | null {
  if (box.length !== 4 || box.some(v => !Number.isFinite(v))) return null;
  const [ymin, xmin, ymax, xmax] = box.map(v => Math.min(1000, Math.max(0, v)) / 1000);
  if (xmax - xmin < 0.005 || ymax - ymin < 0.005) return null;
  return [xmin, ymin, xmax, ymax];
}

function cellsInBox(maps: CellMaps, box: Box) {
  const out: number[] = [];
  const [x0, y0, x1, y1] = box;
  for (let cy = 0; cy < maps.rows; cy += 1) {
    const cyMid = (cy + 0.5) / maps.rows;
    if (cyMid < y0 || cyMid > y1) continue;
    for (let cx = 0; cx < maps.cols; cx += 1) {
      const cxMid = (cx + 0.5) / maps.cols;
      if (cxMid >= x0 && cxMid <= x1) out.push(cy * maps.cols + cx);
    }
  }
  return out;
}

/** How much of the ink inside a box is new in this snapshot (0..1); null if the box holds no measured ink. */
export function freshness(maps: CellMaps, box: Box, minInk = 6): number | null {
  let inked = 0, fresh = 0;
  for (const c of cellsInBox(maps, box)) {
    if (maps.ink[c] < minInk) continue;
    inked += 1;
    if (maps.fresh[c]) fresh += 1;
  }
  return inked ? fresh / inked : null;
}

/** Measured writing time of a block: when the ink inside its box first appeared. */
export function writtenSpan(maps: CellMaps, box: Box, minInk = 6): { start: number; end: number } | null {
  let start = Infinity, end = -Infinity;
  for (const c of cellsInBox(maps, box)) {
    const t = maps.birth[c];
    if (maps.ink[c] < minInk || !Number.isFinite(t)) continue;
    start = Math.min(start, t); end = Math.max(end, t);
  }
  return Number.isFinite(start) ? { start, end } : null;
}

/** Shrink a model-proposed box to the actual ink it contains (on the clean paper image), plus padding. */
export function tightenToInk(paper: RGBAImage, box: Box, padding = 0.012): Box {
  const { width, height, data } = paper;
  const x0 = Math.floor(box[0] * width), y0 = Math.floor(box[1] * height);
  const x1 = Math.ceil(box[2] * width), y1 = Math.ceil(box[3] * height);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = Math.max(0, y0); y < Math.min(height, y1); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(width, x1); x += 1) {
      const i = (y * width + x) * 4;
      if (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11 < 225) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (!Number.isFinite(minX)) return box;
  const pad = padding * Math.max(width, height);
  return [
    Math.max(0, (minX - pad) / width), Math.max(0, (minY - pad) / height),
    Math.min(1, (maxX + pad) / width), Math.min(1, (maxY + pad) / height),
  ];
}
