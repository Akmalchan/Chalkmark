import assert from "node:assert/strict";
import test from "node:test";
import { freshness, fromGeminiBox, tightenToInk, writtenSpan } from "../lib/board/blocks";
import { createImage } from "../lib/board/geometry";
import { assembleSections } from "../lib/notes/assemble";
import type { NoteBlock } from "../lib/notes/schema";

const maps = {
  cols: 4, rows: 2,
  ink: [10, 10, 0, 0, 10, 0, 10, 10],
  birth: [5, 7, NaN, NaN, 9, NaN, 40, 42],
  fresh: [0, 0, 0, 0, 0, 0, 1, 1],
};

test("Gemini boxes convert from [ymin,xmin,ymax,xmax]/1000 to normalized x0,y0,x1,y1", () => {
  assert.deepEqual(fromGeminiBox([100, 200, 500, 900]), [0.2, 0.1, 0.9, 0.5]);
  assert.equal(fromGeminiBox([100, 200, 100, 900]), null);
  assert.equal(fromGeminiBox([1, 2, 3]), null);
});

test("freshness and written time come from measured ink, not the model", () => {
  assert.equal(freshness(maps, [0, 0, 0.5, 1]), 0);
  assert.equal(freshness(maps, [0.5, 0.5, 1, 1]), 1);
  assert.equal(freshness(maps, [0.5, 0, 1, 0.5]), null);
  assert.deepEqual(writtenSpan(maps, [0, 0, 0.5, 1]), { start: 5, end: 9 });
});

test("boxes tighten to the ink they contain", () => {
  const paper = createImage(100, 100);
  paper.data.fill(255);
  for (let y = 40; y < 50; y += 1) for (let x = 20; x < 60; x += 1) paper.data.set([0, 0, 0, 255], (y * 100 + x) * 4);
  const [x0, y0, x1, y1] = tightenToInk(paper, [0, 0, 1, 1], 0);
  assert.ok(Math.abs(x0 - 0.2) < 0.02 && Math.abs(y0 - 0.4) < 0.02 && Math.abs(x1 - 0.59) < 0.02 && Math.abs(y1 - 0.49) < 0.02);
});

const block = (id: string, writtenAt: number | null): NoteBlock => ({
  id, boardId: "board-01", kind: "text", content: id, detail: "", table: null, legibility: "clear", box: null, figure: null, writtenAt, graph: null,
});

test("assembly never loses a block and honours duplicates", () => {
  const blocks = [block("a", 5), block("b", 10), block("c", 300), block("d", 302), block("e", 11)];
  const sections = assembleSections({
    title: "T", course: "C", summary: "S", duplicateBlockIds: ["e", "ghost"],
    sections: [
      { title: "One", blockIds: ["a", "b", "b", "unknown"], explanation: [], takeaways: [] },
      { title: "Two", blockIds: ["c"], explanation: ["x"], takeaways: [] },
    ],
  }, blocks);
  const placed = sections.flatMap(section => section.blocks.map(b => b.id));
  assert.deepEqual(placed.sort(), ["a", "b", "c", "d"]);
  assert.ok(sections[1].blocks.some(b => b.id === "d"), "forgotten block joins the section closest in time");
  assert.deepEqual([sections[0].start, sections[0].end], [5, 10]);
});

test("repeated writing from several photos collapses to the most complete copy", async () => {
  const { dedupeBlocks } = await import("../lib/notes/dedupe");
  const make = (id: string, content: string, kind: NoteBlock["kind"] = "text", legibility: NoteBlock["legibility"] = "clear") =>
    ({ ...block(id, 1), kind, content, legibility });
  const { kept } = dedupeBlocks([
    make("a", "ROW PICTURE", "heading"), make("b", "Row picture:", "text"), make("c", "picture.", "text"),
    make("d", "2x + y = 3", "equation"), make("e", "2x+y=3", "equation", "partial"), make("f", "x - 2y = -1", "equation"),
  ]);
  assert.deepEqual(kept.map(b => b.id).sort(), ["a", "d", "f"]);
});
