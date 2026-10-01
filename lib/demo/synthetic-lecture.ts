/**
 * A procedurally animated whiteboard lecture used to generate the bundled sample video and to test
 * the pipeline without a camera: handwriting appears stroke by stroke, a lecturer walks in front of
 * the board while writing, half the board is erased and rewritten.
 */

export const LECTURE_SECONDS = 76;
export const FRAME_W = 1280, FRAME_H = 720;

export const NARRATION: Array<{ at: number; src: string }> = [0, 7, 13, 21, 25, 36, 50, 56, 64, 71]
  .map((at, i) => ({ at, src: `/demo/voice/${String(i).padStart(2, "0")}.wav` }));

type Ctx = CanvasRenderingContext2D;
type Pt = { x: number; y: number };

const FONT = '"Bradley Hand", "Noteworthy", "Chalkboard SE", "Segoe Print", cursive';
const BLUE = "#1f3d8f", RED = "#a8262c", GREEN = "#1e6d3c", BLACK = "#1c2126";
// Board-space to frame-space: mild shear and scale, as if filmed slightly off-axis.
const M = { a: 0.955, b: -0.018, c: 0.022, d: 0.95, e: 38, f: 44 };
const toFrame = (p: Pt): Pt => ({ x: M.a * p.x + M.c * p.y + M.e, y: M.b * p.x + M.d * p.y + M.f });
const BOARD_W = 1230, BOARD_H = 660;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const progress = (t: number, start: number, end: number) => clamp01((t - start) / (end - start));

type TextItem = { kind: "text"; text: string; x: number; y: number; size: number; color: string; start: number; end: number; sub?: { text: string; dx: number } };
type PathItem = { kind: "path"; points: Pt[]; color: string; width: number; start: number; end: number; dashed?: boolean; closed?: boolean };
type Item = (TextItem | PathItem) & { erasable?: boolean };

const circle = (cx: number, cy: number, r: number, from = 0): Pt[] =>
  Array.from({ length: 41 }, (_, i) => ({ x: cx + r * Math.cos(from + (i / 40) * Math.PI * 2), y: cy + r * Math.sin(from + (i / 40) * Math.PI * 2) }));
const parabola: Pt[] = Array.from({ length: 40 }, (_, i) => { const u = i / 39; return { x: 790 + u * 360, y: 360 - 270 * u * u }; });

const ITEMS: Item[] = [
  { kind: "text", text: "Derivatives", x: 70, y: 100, size: 56, color: BLUE, start: 2, end: 5.5, erasable: true },
  { kind: "text", text: "f(x) = x² + 3x", x: 70, y: 190, size: 46, color: BLUE, start: 7, end: 11.5, erasable: true },
  { kind: "text", text: "f'(x) = lim  ( f(x+h) − f(x) ) / h", x: 70, y: 280, size: 42, color: BLUE, start: 13, end: 19.5, erasable: true, sub: { text: "h→0", dx: 196 } },
  { kind: "text", text: "= 2x + 3", x: 150, y: 370, size: 46, color: BLUE, start: 21, end: 23.5, erasable: true },
  { kind: "text", text: "slope of the tangent!", x: 70, y: 455, size: 40, color: RED, start: 23.5, end: 25, erasable: true },
  { kind: "path", points: [{ x: 780, y: 60 }, { x: 780, y: 380 }, { x: 1180, y: 380 }], color: BLACK, width: 5, start: 25.5, end: 28 },
  { kind: "path", points: parabola, color: RED, width: 5, start: 28, end: 31.5 },
  { kind: "path", points: [{ x: 905, y: 395 }, { x: 1160, y: 120 }], color: GREEN, width: 4, start: 31.5, end: 33.5, dashed: true },
  { kind: "text", text: "tangent", x: 1060, y: 150, size: 32, color: GREEN, start: 33.5, end: 34.5 },
  { kind: "text", text: "x", x: 1188, y: 392, size: 32, color: BLACK, start: 34.5, end: 34.8 },
  { kind: "text", text: "y", x: 758, y: 52, size: 32, color: BLACK, start: 34.8, end: 35.1 },
  { kind: "path", points: [{ x: 700, y: 610 }, { x: 726, y: 540 }, { x: 830, y: 525 }, { x: 885, y: 478 }, { x: 1010, y: 478 }, { x: 1066, y: 525 }, { x: 1140, y: 540 }, { x: 1158, y: 610 }], color: BLACK, width: 5, start: 36, end: 40, closed: true },
  { kind: "path", points: circle(780, 615, 36), color: BLACK, width: 5, start: 40, end: 41.5 },
  { kind: "path", points: circle(1080, 615, 36), color: BLACK, width: 5, start: 41.5, end: 43 },
  { kind: "path", points: [{ x: 948, y: 486 }, { x: 948, y: 525 }], color: BLACK, width: 5, start: 43, end: 43.4 },
  { kind: "text", text: "v = dx/dt", x: 480, y: 600, size: 44, color: BLUE, start: 44, end: 47 },
  { kind: "text", text: "Power rule", x: 70, y: 110, size: 52, color: BLUE, start: 56.5, end: 59 },
  { kind: "text", text: "d/dx  xⁿ = n·xⁿ⁻¹", x: 70, y: 210, size: 50, color: BLUE, start: 59, end: 63 },
  { kind: "text", text: "e.g.  d/dx  x³ = 3x²", x: 70, y: 320, size: 46, color: RED, start: 64, end: 69 },
];

/** Eraser sweeps over the left half of the board between 50 s and 55 s. */
const ERASE = { start: 50, end: 55, x0: 50, x1: 700, y0: 40, y1: 480, rows: 5 };
function eraserAt(t: number): Pt | null {
  if (t < ERASE.start || t > ERASE.end) return null;
  const u = progress(t, ERASE.start, ERASE.end) * ERASE.rows;
  const row = Math.min(ERASE.rows - 1, Math.floor(u)), f = u - row;
  const y = ERASE.y0 + ((row + 0.5) / ERASE.rows) * (ERASE.y1 - ERASE.y0);
  const x = row % 2 === 0 ? ERASE.x0 + f * (ERASE.x1 - ERASE.x0) : ERASE.x1 - f * (ERASE.x1 - ERASE.x0);
  return { x, y };
}

const measure = new Map<string, number>();
function textWidth(ctx: Ctx, item: TextItem) {
  const key = `${item.size}|${item.text}`;
  if (!measure.has(key)) { ctx.font = `${item.size}px ${FONT}`; measure.set(key, ctx.measureText(item.text).width); }
  return measure.get(key)!;
}

function pathLength(points: Pt[]) {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return length;
}

/** Where the pen is at time t (board coordinates), or null when nobody is writing. */
function penAt(ctx: Ctx, t: number): Pt | null {
  const eraser = eraserAt(t);
  if (eraser) return eraser;
  for (const item of ITEMS) {
    if (t < item.start || t > item.end) continue;
    const p = progress(t, item.start, item.end);
    if (item.kind === "text") return { x: item.x + p * textWidth(ctx, item), y: item.y - item.size * 0.3 };
    let remaining = p * pathLength(item.points);
    for (let i = 1; i < item.points.length; i += 1) {
      const a = item.points[i - 1], b = item.points[i], segment = Math.hypot(b.x - a.x, b.y - a.y);
      if (remaining <= segment) return { x: a.x + ((b.x - a.x) * remaining) / segment, y: a.y + ((b.y - a.y) * remaining) / segment };
      remaining -= segment;
    }
    return item.points[item.points.length - 1];
  }
  return null;
}

function standingTarget(ctx: Ctx, t: number): { body: Pt; hand: Pt | null } {
  const pen = penAt(ctx, t);
  if (pen) return { body: { x: pen.x + 120, y: pen.y }, hand: pen };
  // Between strokes the lecturer steps back to the side and talks.
  if (t < 2) return { body: { x: 1120, y: 300 }, hand: null };
  if (t > 47 && t < 50) return { body: { x: 560, y: 320 }, hand: null };
  if (t > 69) return { body: { x: 1260, y: 330 }, hand: null };
  return { body: { x: 640, y: 330 }, hand: null };
}

function person(ctx: Ctx, t: number) {
  // Smooth motion: average the target over the last ~0.9 s.
  let bx = 0, by = 0;
  const samples = 7;
  for (let k = 0; k < samples; k += 1) { const target = standingTarget(ctx, t - k * 0.15).body; bx += target.x; by += target.y; }
  const body = toFrame({ x: bx / samples, y: by / samples });
  const hand = standingTarget(ctx, t).hand;
  const headY = Math.min(body.y - 10, 330);
  // Torso
  ctx.fillStyle = "#2d3a52";
  ctx.beginPath();
  ctx.moveTo(body.x - 78, headY + 70);
  ctx.quadraticCurveTo(body.x, headY + 40, body.x + 78, headY + 70);
  ctx.lineTo(body.x + 98, FRAME_H + 10);
  ctx.lineTo(body.x - 98, FRAME_H + 10);
  ctx.closePath();
  ctx.fill();
  // Arm reaching to the pen or eraser
  const shoulder = { x: body.x - 58, y: headY + 92 };
  const target = hand ? toFrame(hand) : { x: body.x - 70, y: headY + 260 };
  ctx.strokeStyle = "#2d3a52"; ctx.lineWidth = 30; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(shoulder.x, shoulder.y); ctx.quadraticCurveTo(shoulder.x - 30, (shoulder.y + target.y) / 2 + 40, target.x + 8, target.y + 6); ctx.stroke();
  ctx.fillStyle = "#c99779";
  ctx.beginPath(); ctx.arc(target.x + 6, target.y + 6, 13, 0, Math.PI * 2); ctx.fill();
  if (eraserAt(t)) { ctx.fillStyle = "#3d3d3d"; ctx.fillRect(target.x - 30, target.y - 16, 60, 30); }
  // Head and hair
  ctx.fillStyle = "#c99779";
  ctx.beginPath(); ctx.ellipse(body.x, headY, 40, 50, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#2a2018";
  ctx.beginPath(); ctx.ellipse(body.x + 4, headY - 22, 43, 32, 0, Math.PI, Math.PI * 2); ctx.fill();
}

function drawItem(ctx: Ctx, item: Item, t: number) {
  const p = progress(t, item.start, item.end);
  if (p <= 0) return;
  if (item.kind === "text") {
    ctx.save();
    ctx.font = `${item.size}px ${FONT}`;
    ctx.fillStyle = item.color;
    const width = textWidth(ctx, item);
    ctx.beginPath(); ctx.rect(item.x - 4, item.y - item.size * 1.1, width * p + 6, item.size * 1.8); ctx.clip();
    ctx.fillText(item.text, item.x, item.y);
    if (item.sub) { ctx.font = `${Math.round(item.size * 0.5)}px ${FONT}`; ctx.fillText(item.sub.text, item.x + item.sub.dx, item.y + item.size * 0.55); }
    ctx.restore();
    return;
  }
  const total = pathLength(item.points);
  ctx.save();
  ctx.strokeStyle = item.color; ctx.lineWidth = item.width; ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (item.dashed) ctx.setLineDash([16, 12]);
  ctx.beginPath();
  let remaining = p * total;
  ctx.moveTo(item.points[0].x, item.points[0].y);
  for (let i = 1; i < item.points.length && remaining > 0; i += 1) {
    const a = item.points[i - 1], b = item.points[i], segment = Math.hypot(b.x - a.x, b.y - a.y);
    const f = Math.min(1, remaining / segment);
    ctx.lineTo(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
    remaining -= segment;
  }
  if (item.closed && p >= 1) ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

export function drawLecture(ctx: Ctx, t: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Classroom wall
  const wall = ctx.createLinearGradient(0, 0, 0, FRAME_H);
  wall.addColorStop(0, "#b9b2a4"); wall.addColorStop(1, "#9f988a");
  ctx.fillStyle = wall; ctx.fillRect(0, 0, FRAME_W, FRAME_H);

  ctx.setTransform(M.a, M.b, M.c, M.d, M.e, M.f);
  ctx.fillStyle = "#8b9197"; ctx.fillRect(-14, -14, BOARD_W + 28, BOARD_H + 28);
  const board = ctx.createLinearGradient(0, 0, BOARD_W, BOARD_H);
  board.addColorStop(0, "#f3f4f1"); board.addColorStop(0.6, "#e9ebe7"); board.addColorStop(1, "#dcdfda");
  ctx.fillStyle = board; ctx.fillRect(0, 0, BOARD_W, BOARD_H);

  for (const item of ITEMS) if (!item.erasable || t < ERASE.end || item.start > ERASE.end) drawItem(ctx, item, t);
  // Erased region so far (boustrophedon sweeps), painted with the board itself.
  if (t >= ERASE.start && t < ERASE.end + 1) {
    const u = progress(t, ERASE.start, ERASE.end) * ERASE.rows;
    const rowH = (ERASE.y1 - ERASE.y0) / ERASE.rows;
    ctx.fillStyle = board;
    for (let row = 0; row < ERASE.rows; row += 1) {
      const f = clamp01(u - row);
      if (f <= 0) break;
      const y = ERASE.y0 + row * rowH - 6, w = f * (ERASE.x1 - ERASE.x0);
      const x = row % 2 === 0 ? ERASE.x0 : ERASE.x1 - w;
      ctx.fillRect(x - 10, y, w + 20, rowH + 12);
    }
    // A little residue, like a real eraser leaves.
    ctx.fillStyle = "rgba(120,130,150,.05)"; ctx.fillRect(ERASE.x0, ERASE.y0, (ERASE.x1 - ERASE.x0) * Math.min(1, u / ERASE.rows), ERASE.y1 - ERASE.y0);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  person(ctx, t);
  // Camera: slight vignette and exposure flicker.
  const vignette = ctx.createRadialGradient(FRAME_W / 2, FRAME_H / 2, FRAME_H * 0.4, FRAME_W / 2, FRAME_H / 2, FRAME_W * 0.75);
  vignette.addColorStop(0, "rgba(0,0,0,0)"); vignette.addColorStop(1, "rgba(0,0,0,.18)");
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, FRAME_W, FRAME_H);
  ctx.fillStyle = `rgba(0,0,0,${0.012 + 0.012 * Math.sin(t * 1.7)})`; ctx.fillRect(0, 0, FRAME_W, FRAME_H);
}

/** Board corners in the video frame, for tests and the sample's default framing. */
export const SAMPLE_QUAD = [toFrame({ x: 0, y: 0 }), toFrame({ x: BOARD_W, y: 0 }), toFrame({ x: BOARD_W, y: BOARD_H }), toFrame({ x: 0, y: BOARD_H })];
