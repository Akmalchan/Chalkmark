import type { RGBAImage } from "./geometry";

/**
 * Board states saved while a board is still being written (the camera left, came back, left again)
 * are earlier, partial versions of a later state. A board is "superseded" when almost all of its ink
 * also appears in a later board, after allowing for the camera having shifted between the two.
 */

const MASK_W = 96;

export type InkMask = { width: number; height: number; data: Uint8Array; count: number };

/** Low-resolution, slightly dilated ink mask of a clean paper image. */
export function inkMask(paper: RGBAImage): InkMask {
  const width = MASK_W;
  const height = Math.max(8, Math.round((paper.height / paper.width) * MASK_W));
  const raw = new Uint8Array(width * height);
  const sx = paper.width / width, sy = paper.height / height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Any dark pixel inside this block counts as ink.
      let ink = 0;
      const x0 = Math.floor(x * sx), x1 = Math.floor((x + 1) * sx), y0 = Math.floor(y * sy), y1 = Math.floor((y + 1) * sy);
      for (let py = y0; py < y1 && !ink; py += 2) for (let px = x0; px < x1; px += 2) {
        const i = (py * paper.width + px) * 4;
        if (paper.data[i] * 0.3 + paper.data[i + 1] * 0.59 + paper.data[i + 2] * 0.11 < 200) { ink = 1; break; }
      }
      raw[y * width + x] = ink;
    }
  }
  const data = new Uint8Array(width * height);
  let count = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let v = 0;
    for (let dy = -1; dy <= 1 && !v; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const px = x + dx, py = y + dy;
      if (px >= 0 && py >= 0 && px < width && py < height && raw[py * width + px]) { v = 1; break; }
    }
    data[y * width + x] = v;
  }
  for (let i = 0; i < raw.length; i += 1) count += raw[i];
  return { width, height, data, count: Math.max(count, 0) };
}

/** Fraction of `a`'s ink found in `b` at the best camera shift (0..1). */
export function containment(a: InkMask, b: InkMask, maxShiftX = 0.45, maxShiftY = 0.3): number {
  if (!a.count || a.width !== b.width || a.height !== b.height) return 0;
  const { width, height } = a;
  const rawA: Array<[number, number]> = [];
  // Undilated pixels of a are the ones to find; b is dilated, which tolerates small jitter.
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (!a.data[y * width + x]) continue;
    // Keep only pixels whose 4-neighbourhood is all ink: approximately the undilated strokes.
    const core = (x > 0 && a.data[y * width + x - 1]) && (x < width - 1 && a.data[y * width + x + 1]) && (y > 0 && a.data[(y - 1) * width + x]) && (y < height - 1 && a.data[(y + 1) * width + x]);
    if (core) rawA.push([x, y]);
  }
  if (rawA.length < 6) return 0;
  const mx = Math.round(width * maxShiftX), my = Math.round(height * maxShiftY);
  let best = 0;
  for (let dy = -my; dy <= my; dy += 1) {
    for (let dx = -mx; dx <= mx; dx += 1) {
      let hit = 0, inside = 0;
      for (const [x, y] of rawA) {
        const bx = x + dx, by = y + dy;
        if (bx < 0 || by < 0 || bx >= width || by >= height) continue;
        inside += 1;
        hit += b.data[by * width + bx];
      }
      // Ink that moved out of b's frame cannot be checked; require most of a to be visible in b.
      if (inside < rawA.length * 0.8) continue;
      const score = hit / rawA.length;
      if (score > best) best = score;
    }
  }
  return best;
}

/**
 * Indices of boards that are fully contained in a later board (compared against the next few
 * boards in time). The latest, most complete version is the one worth reading.
 */
export function supersededBoards(masks: InkMask[], lookahead = 6, threshold = 0.86): Set<number> {
  const superseded = new Set<number>();
  for (let i = 0; i < masks.length; i += 1) {
    for (let j = i + 1; j < Math.min(masks.length, i + 1 + lookahead); j += 1) {
      if (masks[j].count < masks[i].count * 0.9) continue;
      if (containment(masks[i], masks[j]) >= threshold) { superseded.add(i); break; }
    }
  }
  return superseded;
}
