export type Point = { x: number; y: number };
/** Board corners in source-frame pixels: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point];
export type RGBAImage = { width: number; height: number; data: Uint8ClampedArray };

export const createImage = (width: number, height: number): RGBAImage => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
});

export const fullFrameQuad = (width: number, height: number): Quad => [
  { x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height },
];

export const insetQuad = (width: number, height: number, inset = 0.08): Quad => {
  const dx = width * inset, dy = height * inset;
  return [
    { x: dx, y: dy }, { x: width - dx, y: dy }, { x: width - dx, y: height - dy }, { x: dx, y: height - dy },
  ];
};

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Width/height of the flattened board, estimated from the quad's edge lengths. */
export function quadSize(quad: Quad): { width: number; height: number } {
  const width = (distance(quad[0], quad[1]) + distance(quad[3], quad[2])) / 2;
  const height = (distance(quad[0], quad[3]) + distance(quad[1], quad[2])) / 2;
  return { width: Math.max(1, width), height: Math.max(1, height) };
}

/**
 * 3x3 homography mapping a destination rectangle [0,w]x[0,h] onto the source quad.
 * Solved with the standard 8-unknown linear system (h33 = 1).
 */
export function rectToQuadHomography(w: number, h: number, quad: Quad): Float64Array {
  const src: Point[] = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = src[i];
    const { x: u, y: v } = quad[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const solution = solveLinear(a, b);
  return Float64Array.from([...solution, 1]);
}

function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    if (Math.abs(m[pivot][col]) < 1e-12) throw new Error("Board corners are degenerate");
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = m[row][col] / m[col][col];
      for (let k = col; k <= n; k += 1) m[row][k] -= factor * m[col][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/**
 * Perspective-warps the destination rectangle (dx,dy,dw,dh) of a `target` image from `source`,
 * with bilinear sampling. `hom` maps target pixel coordinates (scaled by `scale`) into source pixels.
 */
export function warpRegion(
  source: RGBAImage,
  hom: Float64Array,
  target: RGBAImage,
  dx = 0, dy = 0, dw = target.width, dh = target.height,
  scale = 1,
) {
  const { data: src, width: sw, height: sh } = source;
  const out = target.data;
  const [h0, h1, h2, h3, h4, h5, h6, h7] = hom;
  for (let y = dy; y < dy + dh; y += 1) {
    const ty = (y + 0.5) * scale;
    for (let x = dx; x < dx + dw; x += 1) {
      const tx = (x + 0.5) * scale;
      const z = h6 * tx + h7 * ty + 1;
      const u = (h0 * tx + h1 * ty + h2) / z - 0.5;
      const v = (h3 * tx + h4 * ty + h5) / z - 0.5;
      const o = (y * target.width + x) * 4;
      const x0 = Math.floor(u), y0 = Math.floor(v);
      if (x0 < 0 || y0 < 0 || x0 >= sw - 1 || y0 >= sh - 1) {
        const cx = Math.min(sw - 1, Math.max(0, Math.round(u)));
        const cy = Math.min(sh - 1, Math.max(0, Math.round(v)));
        const i = (cy * sw + cx) * 4;
        out[o] = src[i]; out[o + 1] = src[i + 1]; out[o + 2] = src[i + 2]; out[o + 3] = 255;
        continue;
      }
      const fx = u - x0, fy = v - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      out[o] = src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
      out[o + 1] = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
      out[o + 2] = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
      out[o + 3] = 255;
    }
  }
}
