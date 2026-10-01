import { createImage, type RGBAImage } from "./geometry";
import type { Polarity } from "./engine";

/** Warm white used for the notes paper; figures blend into the page. */
export const PAPER: [number, number, number] = [255, 253, 248];
const INK: [number, number, number] = [27, 33, 38];

/**
 * Turn a photographed board into "scanned paper": flat white background, crisp strokes,
 * marker colours kept (white balance corrected), chalk mapped to dark ink.
 */
export function renderPaper(image: RGBAImage, polarity: Polarity): RGBAImage {
  const { width, height, data } = image;
  const light = polarity === "light";
  const luma = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < luma.length; p += 1, i += 4) luma[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;

  // Background brightness and colour on a coarse grid, then interpolated per pixel.
  const block = Math.max(16, Math.round(width / 48));
  const gw = Math.ceil(width / block), gh = Math.ceil(height / block);
  const bgL = new Float32Array(gw * gh);
  const bgC = new Float32Array(gw * gh * 3);
  const hist = new Uint32Array(256);
  for (let gy = 0; gy < gh; gy += 1) for (let gx = 0; gx < gw; gx += 1) {
    hist.fill(0);
    let n = 0;
    const x1 = Math.min(width, (gx + 1) * block), y1 = Math.min(height, (gy + 1) * block);
    for (let y = gy * block; y < y1; y += 1) for (let x = gx * block; x < x1; x += 1) { hist[luma[y * width + x]] += 1; n += 1; }
    const target = n * (light ? 0.85 : 0.15);
    let acc = 0, value = 0;
    for (let v = 0; v < 256; v += 1) { acc += hist[v]; if (acc >= target) { value = v; break; } }
    let r = 0, g = 0, b = 0, m = 0;
    for (let y = gy * block; y < y1; y += 1) for (let x = gx * block; x < x1; x += 1) {
      const p = y * width + x;
      if (Math.abs(luma[p] - value) <= 6) { r += data[p * 4]; g += data[p * 4 + 1]; b += data[p * 4 + 2]; m += 1; }
    }
    const k = gy * gw + gx;
    bgL[k] = value;
    bgC[k * 3] = m ? r / m : value; bgC[k * 3 + 1] = m ? g / m : value; bgC[k * 3 + 2] = m ? b / m : value;
  }
  const smoothL = medianGrid(bgL, gw, gh, 1);
  const smoothC = [0, 1, 2].map(ch => medianGrid(bgC.filter((_, i) => i % 3 === ch), gw, gh, 1));

  const alpha = new Float32Array(width * height);
  const color = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    const fy = Math.min(gh - 1, Math.max(0, (y - block / 2) / block));
    const y0 = Math.floor(fy), yy = Math.min(gh - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < width; x += 1) {
      const fx = Math.min(gw - 1, Math.max(0, (x - block / 2) / block));
      const x0 = Math.floor(fx), xx = Math.min(gw - 1, x0 + 1), wx = fx - x0;
      const lerp = (grid: Float32Array) =>
        grid[y0 * gw + x0] * (1 - wx) * (1 - wy) + grid[y0 * gw + xx] * wx * (1 - wy) + grid[yy * gw + x0] * (1 - wx) * wy + grid[yy * gw + xx] * wx * wy;
      const bg = lerp(smoothL);
      const p = y * width + x, i = p * 4;
      const l = luma[p];
      const dev = light ? (bg - l) / Math.max(30, bg) : (l - bg) / Math.max(30, 255 - bg);
      const a = smoothstep(0.11, 0.34, dev);
      alpha[p] = a;
      if (a <= 0) continue;
      // White-balance against the local board colour, then decide: neutral ink or coloured marker.
      const br = lerp(smoothC[0]), bgg = lerp(smoothC[1]), bb = lerp(smoothC[2]);
      let r = data[i], g = data[i + 1], b = data[i + 2];
      if (light) { r = (r / Math.max(1, br)) * 255; g = (g / Math.max(1, bgg)) * 255; b = (b / Math.max(1, bb)) * 255; }
      else { r = r - br; g = g - bgg; b = b - bb; }
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const saturation = max <= 0 ? 0 : (max - min) / Math.max(1, max);
      let out: [number, number, number];
      if (saturation < (light ? 0.28 : 0.22)) out = INK;
      else {
        // Keep the hue, push to a readable darkness on white paper.
        const scale = (light ? 78 : 92) / Math.max(1, (r * 77 + g * 150 + b * 29) >> 8);
        const s = Math.min(light ? 1.15 : 2, scale);
        out = [clamp(r * s), clamp(g * s), clamp(b * s)];
        const boost = 1.08, mean = (out[0] + out[1] + out[2]) / 3;
        out = [clamp(mean + (out[0] - mean) * boost), clamp(mean + (out[1] - mean) * boost), clamp(mean + (out[2] - mean) * boost)];
      }
      color[p * 3] = out[0]; color[p * 3 + 1] = out[1]; color[p * 3 + 2] = out[2];
    }
  }

  const result = createImage(width, height);
  const o = result.data;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const p = y * width + x, i = p * 4;
    let a = alpha[p];
    // Despeckle: isolated dots are sensor noise or dust, not writing.
    if (a > 0 && isolated(alpha, width, height, x, y)) a = 0;
    o[i] = PAPER[0] * (1 - a) + color[p * 3] * a;
    o[i + 1] = PAPER[1] * (1 - a) + color[p * 3 + 1] * a;
    o[i + 2] = PAPER[2] * (1 - a) + color[p * 3 + 2] * a;
    o[i + 3] = 255;
  }
  return result;
}

function isolated(alpha: Float32Array, width: number, height: number, x: number, y: number) {
  let neighbours = 0;
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    if (!dx && !dy) continue;
    const px = x + dx, py = y + dy;
    if (px >= 0 && py >= 0 && px < width && py < height && alpha[py * width + px] > 0.15) neighbours += 1;
  }
  return neighbours < 2;
}

function medianGrid(grid: Float32Array, w: number, h: number, radius: number): Float32Array {
  const out = new Float32Array(grid.length);
  const window: number[] = [];
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    window.length = 0;
    for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      const px = x + dx, py = y + dy;
      if (px >= 0 && py >= 0 && px < w && py < h) window.push(grid[py * w + px]);
    }
    window.sort((a, b) => a - b);
    out[y * w + x] = window[window.length >> 1];
  }
  return out;
}

const smoothstep = (lo: number, hi: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};
const clamp = (v: number) => Math.max(0, Math.min(255, v));
