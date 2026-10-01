import assert from "node:assert/strict";
import test from "node:test";
import { BoardEngine, type Snapshot } from "../lib/board/engine";
import { fullFrameQuad } from "../lib/board/geometry";
import { graph, H, render, textBlock, W, type Person, type Stroke } from "./helpers/synthetic-board";

const STEP = 0.5;

/** Ink cells inside a board-space rectangle (synthetic frame pixels). */
function cellsIn(snapshot: Snapshot, x0: number, y0: number, x1: number, y1: number, field: "ink" | "fresh") {
  let count = 0;
  for (let cy = 0; cy < snapshot.rows; cy += 1) for (let cx = 0; cx < snapshot.cols; cx += 1) {
    const px = ((cx + 0.5) / snapshot.cols) * W, py = ((cy + 0.5) / snapshot.rows) * H;
    if (px < x0 || px > x1 || py < y0 || py > y1) continue;
    const c = cy * snapshot.cols + cx;
    if (field === "ink" ? snapshot.ink[c] >= 6 : snapshot.fresh[c]) count += 1;
  }
  return count;
}

function lecture() {
  const engine = new BoardEngine(fullFrameQuad(W, H), { analysisWidth: 512, cellSize: 16 });
  const equation = textBlock(40, 40, 200, 3);
  const plot = graph(400, 40, 150);
  const rewrite = textBlock(40, 40, 160, 2);
  const events: Array<{ t: number; snapshot: Snapshot | null }> = [];
  let t = 0;
  const feed = (strokes: Stroke[], people: Person[] = [], exposure = 1) => {
    const report = engine.ingest(render(strokes, people, exposure), t);
    events.push({ t, snapshot: report.snapshot });
    t += STEP;
    return report;
  };

  for (let i = 0; i < 4; i += 1) feed([]);
  // Write the equation progressively, standing just to its right.
  for (let i = 1; i <= 16; i += 1) feed(equation.slice(0, Math.ceil((equation.length * i) / 16)), [{ x: 250 + (i % 3) * 4, y: 60, w: 90, h: 300 }]);
  // Walk across the board.
  for (let x = 250; x <= 560; x += 30) feed(equation, [{ x, y: 60, w: 90, h: 300 }]);
  // Draw the graph, standing to its left.
  for (let i = 1; i <= 12; i += 1) feed([...equation, ...plot.slice(0, Math.ceil((plot.length * i) / 12))], [{ x: 290, y: 60, w: 90, h: 300 }]);
  // Stand perfectly still in front of blank board for 5 seconds.
  for (let i = 0; i < 10; i += 1) feed([...equation, ...plot], [{ x: 260, y: 140, w: 100, h: 220 }]);
  // Walk to the equation and erase it.
  for (let i = 0; i < 4; i += 1) feed([...equation, ...plot], [{ x: 250, y: 60, w: 90, h: 300 }]);
  for (let i = 1; i <= 6; i += 1) feed([...equation.slice(Math.ceil((equation.length * i) / 6)), ...plot], [{ x: 250, y: 60, w: 90, h: 300 }]);
  // Write something new in its place.
  for (let i = 1; i <= 10; i += 1) feed([...rewrite.slice(0, Math.ceil((rewrite.length * i) / 10)), ...plot], [{ x: 250, y: 60, w: 90, h: 300 }]);
  // Step away and let the camera settle.
  for (let i = 0; i < 6; i += 1) feed([...rewrite, ...plot]);
  const final = engine.flush();
  return { engine, events, final };
}

test("an erasure snapshots the full board before content is lost", () => {
  const { engine, events, final } = lecture();
  const erase = events.filter(event => event.snapshot?.reason === "erase").map(event => event.snapshot!);
  assert.equal(erase.length, 1, `expected one erase snapshot, got ${erase.length}`);
  const [before] = erase;
  assert.ok(cellsIn(before, 40, 40, 240, 100, "ink") >= 18, "equation must be in the pre-erase snapshot");
  assert.ok(cellsIn(before, 400, 40, 550, 190, "ink") >= 12, "graph must be in the pre-erase snapshot");
  assert.ok(final, "unsaved rewrite must produce a final snapshot");
  assert.equal(engine.snapshots.length, 2);
});

test("fresh masks mark only content not saved by an earlier snapshot", () => {
  const { final } = lecture();
  assert.ok(final);
  assert.ok(cellsIn(final, 40, 40, 200, 80, "fresh") >= 8, "rewrite is fresh");
  assert.equal(cellsIn(final, 400, 40, 550, 190, "fresh"), 0, "graph was already saved");
});

test("a lecturer standing still never enters the composite", () => {
  const { engine } = lecture();
  // Where the lecturer stood still (blank board), the composite must look like board, not body.
  const { composite } = engine;
  const sx = composite.width / W, sy = composite.height / H;
  let dark = 0, total = 0;
  for (let y = 200; y < 340; y += 6) for (let x = 270; x < 350; x += 6) {
    const i = (Math.round(y * sy) * composite.width + Math.round(x * sx)) * 4;
    const luma = (composite.data[i] * 77 + composite.data[i + 1] * 150 + composite.data[i + 2] * 29) >> 8;
    if (luma < 150) dark += 1;
    total += 1;
  }
  assert.ok(dark / total < 0.02, `lecturer leaked into composite: ${(100 * dark / total).toFixed(1)}% dark`);
});

test("exposure drift is not mistaken for writing or erasing", () => {
  const engine = new BoardEngine(fullFrameQuad(W, H));
  const strokes = textBlock(60, 60, 200, 3);
  let snapshots = 0;
  for (let i = 0; i < 30; i += 1) {
    const exposure = 1 - 0.25 * Math.min(1, i / 20);
    if (engine.ingest(render(strokes, [], exposure), i * STEP).snapshot) snapshots += 1;
  }
  assert.equal(snapshots, 0);
  assert.ok(engine.stats.inkCells >= 20);
});
