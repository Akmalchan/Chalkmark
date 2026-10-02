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

test("a partial board is superseded by its later, fuller version even after a camera shift", async () => {
  const { inkMask, containment, supersededBoards } = await import("../lib/board/supersede");
  const { createImage } = await import("../lib/board/geometry");
  const paper = (strokes: Array<[number, number, number, number]>, shift = 0) => {
    const image = createImage(480, 270);
    image.data.fill(255);
    for (const [x0, y0, x1, y1] of strokes) for (let y = y0; y < y1; y += 1) for (let x = x0 + shift; x < x1 + shift; x += 1) {
      if (x >= 0 && x < 480) image.data.set([20, 20, 20, 255], (y * 480 + x) * 4);
    }
    return image;
  };
  const lineA: [number, number, number, number] = [40, 40, 200, 46];
  const lineB: [number, number, number, number] = [40, 90, 260, 96];
  const lineC: [number, number, number, number] = [300, 150, 420, 156];
  const partial = inkMask(paper([lineA]));
  const fuller = inkMask(paper([lineA, lineB], 60));
  const other = inkMask(paper([lineC]));
  assert.ok(containment(partial, fuller) > 0.9, "partial board is inside the fuller, shifted one");
  assert.ok(containment(fuller, partial) < 0.7, "the fuller board is not inside the partial one");
  assert.deepEqual([...supersededBoards([partial, fuller, other])], [0]);
});

test("Gemini cannot delete real content by calling it a duplicate", async () => {
  const { confirmDuplicates } = await import("../lib/notes/assemble");
  const fig = (id: string, content: string, detail: string): NoteBlock => ({ ...block(id, 1), kind: "graph", content, detail });
  const txt = (id: string, content: string): NoteBlock => ({ ...block(id, 1), kind: "equation", content });
  const blocks = [
    fig("g1", "Row picture graph", "Two lines x-2y=-1 and 2x+y=3 intersect at (1,1)"),
    fig("g2", "Row picture graph showing two intersecting lines", "Lines 2x+y=3 and x-2y=-1 meet at (1,1)"),
    fig("g3", "Vectors v1 and v2", "Column picture with vectors v1 = (2,1) and v2 = (1,-2) and a parallelogram"),
    txt("e1", "A = \\begin{bmatrix} 2 & 1 \\\\ 1 & -2 \\end{bmatrix}"),
    txt("e2", "x = y = 1"),
    { ...block("f1", 1), content: 'ure"' },
  ];
  const confirmed = confirmDuplicates(["g2", "g3", "e1", "f1"], blocks);
  assert.ok(confirmed.has("g2"), "a real twin figure is a duplicate");
  assert.ok(confirmed.has("f1"), "a scrap is dropped");
  assert.ok(!confirmed.has("g3"), "a different figure is kept");
  assert.ok(!confirmed.has("e1"), "a unique equation is kept");
});

test("empty axes are recognised as scaffolding, real graphs are not", async () => {
  const { isEmptyFigure } = await import("../lib/notes/dedupe");
  const { isEmptyPlot } = await import("../lib/client/redraw");
  assert.ok(isEmptyFigure("Graph 2 An empty XY coordinate system with origin O, vertical axis labeled y"));
  assert.ok(isEmptyFigure("Coordinate axes with nothing plotted yet"));
  assert.ok(!isEmptyFigure("Row picture: two lines x-2y=-1 and 2x+y=3 intersect at (1,1)"));
  const plot = (extra: Partial<NonNullable<import("../lib/notes/figure").FigureSpec["plot"]>>) => ({
    kind: "plot" as const, sketch: null, confidence: "high" as const, notes: null,
    plot: { xMin: -2, xMax: 2, yMin: -2, yMax: 2, xLabel: "x", yLabel: "y", grid: false, curves: [], arrows: [], segments: [], points: [], labels: [], ...extra },
  });
  assert.ok(isEmptyPlot(plot({ points: [{ at: { x: 0, y: 0 }, label: "O", color: "ink" }] })));
  assert.ok(!isEmptyPlot(plot({ curves: [{ label: "y = x", expression: "x", points: [], color: "ink", dashed: false }] })));
  assert.ok(!isEmptyPlot(plot({ points: [{ at: { x: 1, y: 1 }, label: "(1,1)", color: "ink" }] })));
});

test("incomplete axes count as scaffolding too", async () => {
  const { isEmptyFigure } = await import("../lib/notes/dedupe");
  assert.ok(isEmptyFigure("Column picture axes. An incomplete set of axes with a y-axis pointing upwards"));
});

test("blurry partial copies of clean writing are dropped, unique partial reads are kept", async () => {
  const { dedupeBlocks } = await import("../lib/notes/dedupe");
  const make = (id: string, content: string, legibility: NoteBlock["legibility"] = "clear") => ({ ...block(id, 1), content, legibility });
  const { kept } = dedupeBlocks([
    make("clean", 'its "row picture" and "column picture"'),
    make("blurry", 'in "[?]" [?] and "column pi [?]"', "partial"),
    make("blurry2", 'its "row picture" and "col [?] picture"', "partial"),
    make("unique", "the pivot is [?] when a = 0", "partial"),
  ]);
  assert.deepEqual(kept.map(b => b.id).sort(), ["clean", "unique"]);
});

test("the answer-key scorer recognises real Gemini LaTeX and checks figure mathematics", async () => {
  const { readFileSync } = await import("node:fs");
  const { scoreNotes } = await import("../lib/eval/score");
  const key = JSON.parse(readFileSync("evals/linalg-geometry.json", "utf8"));
  const eq = (id: string, content: string, kind: NoteBlock["kind"] = "equation"): NoteBlock => ({ ...block(id, 1), kind, content });
  const plot = (extra: object) => ({ kind: "plot" as const, sketch: null, confidence: "high" as const, notes: null,
    plot: { xMin: -2, xMax: 4, yMin: -3, yMax: 4, xLabel: "x", yLabel: "y", grid: false, curves: [], arrows: [], segments: [], points: [], labels: [], ...extra } });
  const rowPicture = { ...eq("g1", "Row picture", "graph"), redraw: plot({
    curves: [{ label: "2x+y=3", expression: "3 - 2*x", points: [], color: "ink", dashed: false }, { label: "x-2y=-1", expression: "(x + 1)/2", points: [], color: "ink", dashed: false }],
    points: [{ at: { x: 1, y: 1 }, label: "(1,1)", color: "ink" }] }) };
  const columnPicture = { ...eq("g2", "Column picture", "graph"), redraw: plot({
    arrows: [{ from: { x: 0, y: 0 }, to: { x: 2, y: 1 }, label: "v₁", color: "ink", dashed: false }] }) };
  const doc = {
    version: 2, title: "t", course: "c", summary: "", createdAt: "", boards: [], transcript: [], warnings: [],
    stats: {} as never,
    sections: [{ title: "Row picture", start: null, end: null, explanation: [], takeaways: [], blocks: [
      eq("a", "Solve $\\begin{cases} 2x+y=3 \\\\ x-2y=-1 \\end{cases}$", "text"),
      eq("b", "x = 2y - 1 \\implies 2(2y-1)+y = 3"),
      eq("c", "\\implies 5y-2=3 \\implies x=y=1"),
      eq("d", "\\begin{bmatrix} 2 \\\\ 1 \\end{bmatrix} x + \\begin{bmatrix} 1 \\\\ -2 \\end{bmatrix} y = \\begin{bmatrix} 3 \\\\ -1 \\end{bmatrix}"),
      eq("e", "A = \\begin{bmatrix} v_1 & v_2 \\end{bmatrix} = \\begin{bmatrix} 2 & 1 \\\\ 1 & -2 \\end{bmatrix}"),
      eq("f", "ax = b, \\quad x = \\frac{b}{a} = a^{-1}b"),
      eq("g", "A^{-1} A = \\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}"),
      eq("h", "\\begin{bmatrix} x \\\\ y \\end{bmatrix} = A^{-1} \\begin{bmatrix} 3 \\\\ -1 \\end{bmatrix}"),
      eq("z", "e^{i\\pi} + 1 = 0"),
      rowPicture, columnPicture,
    ] }],
  } as unknown as import("../lib/notes/schema").NotesDoc;
  const report = scoreNotes(doc, key);
  const found = new Set(report.items.filter(item => item.found).map(item => item.id));
  for (const id of ["problem", "subst-1", "subst-2", "subst-3", "solution", "col-equation", "matrix-A", "scalar-analogy", "inverse-identity", "solution-inverse"]) assert.ok(found.has(id), `should find ${id}`);
  assert.ok(!found.has("matrix-system"), "the matrix-vector system was not in these notes");
  assert.equal(report.figures.find(f => f.id === "row-picture")?.status, "pass");
  assert.equal(report.figures.find(f => f.id === "column-picture")?.status, "partial");
  assert.deepEqual(report.unmatched, ["[equation] e^{i\\pi} + 1 = 0"]);
});
