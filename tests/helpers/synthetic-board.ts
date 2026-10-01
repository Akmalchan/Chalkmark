import { createImage, type RGBAImage } from "../../lib/board/geometry";

export type Stroke = { x0: number; y0: number; x1: number; y1: number; color: [number, number, number]; width: number };
export type Person = { x: number; y: number; w: number; h: number };

export const W = 640, H = 360;
const BOARD: [number, number, number] = [226, 229, 224];
const BLUE: [number, number, number] = [32, 58, 140];
const RED: [number, number, number] = [170, 40, 40];

let seed = 7;
const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed / 0x7fffffff - 0.5) * 8; };

/** Handwriting-ish block of short strokes inside a rectangle. */
export function textBlock(x: number, y: number, w: number, lines: number, color = BLUE): Stroke[] {
  const strokes: Stroke[] = [];
  for (let line = 0; line < lines; line += 1) {
    const ly = y + line * 22;
    for (let cx = x; cx < x + w; cx += 13) {
      strokes.push({ x0: cx, y0: ly + 12, x1: cx + 6, y1: ly, color, width: 3 });
      strokes.push({ x0: cx + 6, y0: ly, x1: cx + 10, y1: ly + 12, color, width: 3 });
    }
  }
  return strokes;
}

export function graph(x: number, y: number, size: number): Stroke[] {
  const strokes: Stroke[] = [
    { x0: x, y0: y + size, x1: x + size, y1: y + size, color: BLUE, width: 3 },
    { x0: x, y0: y, x1: x, y1: y + size, color: BLUE, width: 3 },
  ];
  let px = x, py = y + size;
  for (let i = 1; i <= 12; i += 1) {
    const nx = x + (size * i) / 12;
    const ny = y + size - (size * (i / 12) ** 2);
    strokes.push({ x0: px, y0: py, x1: nx, y1: ny, color: RED, width: 3 });
    px = nx; py = ny;
  }
  return strokes;
}

export function render(strokes: Stroke[], people: Person[] = [], exposure = 1): RGBAImage {
  const image = createImage(W, H);
  const d = image.data;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      // Mild vignette, like a real classroom.
      const v = 1 - 0.12 * (((x - W / 2) / W) ** 2 + ((y - H / 2) / H) ** 2) * 4;
      const i = (y * W + x) * 4;
      d[i] = BOARD[0] * v * exposure + noise();
      d[i + 1] = BOARD[1] * v * exposure + noise();
      d[i + 2] = BOARD[2] * v * exposure + noise();
      d[i + 3] = 255;
    }
  }
  for (const s of strokes) drawLine(image, s, exposure);
  for (const p of people) drawPerson(image, p, exposure);
  return image;
}

function drawLine(image: RGBAImage, s: Stroke, exposure: number) {
  const steps = Math.ceil(Math.hypot(s.x1 - s.x0, s.y1 - s.y0)) + 1;
  for (let k = 0; k <= steps; k += 1) {
    const cx = s.x0 + ((s.x1 - s.x0) * k) / steps, cy = s.y0 + ((s.y1 - s.y0) * k) / steps;
    for (let dy = -s.width / 2; dy <= s.width / 2; dy += 1) for (let dx = -s.width / 2; dx <= s.width / 2; dx += 1) {
      const x = Math.round(cx + dx), y = Math.round(cy + dy);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = (y * W + x) * 4;
      image.data[i] = s.color[0] * exposure; image.data[i + 1] = s.color[1] * exposure; image.data[i + 2] = s.color[2] * exposure;
    }
  }
}

function drawPerson(image: RGBAImage, p: Person, exposure: number) {
  const fill = (x0: number, y0: number, x1: number, y1: number, color: [number, number, number], ellipse = false) => {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, y1); y += 1) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, x1); x += 1) {
      if (ellipse) {
        const nx = (x - (x0 + x1) / 2) / ((x1 - x0) / 2), ny = (y - (y0 + y1) / 2) / ((y1 - y0) / 2);
        if (nx * nx + ny * ny > 1) continue;
      }
      const i = (y * W + x) * 4;
      image.data[i] = color[0] * exposure + noise(); image.data[i + 1] = color[1] * exposure + noise(); image.data[i + 2] = color[2] * exposure + noise();
    }
  };
  fill(p.x, p.y + p.h * 0.22, p.x + p.w, p.y + p.h, [52, 58, 74]);
  fill(p.x + p.w * 0.28, p.y, p.x + p.w * 0.72, p.y + p.h * 0.24, [205, 160, 130], true);
}
