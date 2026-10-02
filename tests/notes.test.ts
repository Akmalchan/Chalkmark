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

test("figures are checked against the board's own math and snapped to it", async () => {
  const { boardFacts, checkFigure } = await import("../lib/notes/figure-check");
  const { compileExpression } = await import("../lib/plot-math");
  const facts = boardFacts([
    "Solve $\\begin{cases} 2x+y=3 \\\\ x-2y=-1 \\end{cases}$",
    "\\begin{matrix}v_1\\\\||\\\\\\begin{bmatrix}2\\\\1\\end{bmatrix}\\end{matrix}x + \\begin{matrix}v_2\\\\||\\\\\\begin{bmatrix}1\\\\-2\\end{bmatrix}\\end{matrix}y = \\begin{bmatrix}3\\\\-1\\end{bmatrix}",
  ]);
  assert.equal(facts.lines.length, 2);
  assert.deepEqual(facts.vectors.map(v => [v.name, v.x, v.y]), [["v1", 2, 1], ["v2", 1, -2]]);

  // The wrong column picture from a real run: v2 drawn to (2,-1), parallelogram closing at (4,0).
  const base = { kind: "plot" as const, sketch: null, confidence: "high" as const, notes: null };
  const column = { ...base, plot: { xMin: -1, xMax: 5, yMin: -3, yMax: 3, xLabel: "x", yLabel: "y", grid: false, curves: [], points: [], labels: [],
    arrows: [{ from: { x: 0, y: 0 }, to: { x: 2, y: 1 }, label: "v₁", color: "ink" as const, dashed: false }, { from: { x: 0, y: 0 }, to: { x: 2, y: -1 }, label: "v₂", color: "ink" as const, dashed: false }],
    segments: [{ from: { x: 2, y: 1 }, to: { x: 4, y: 0 }, label: "", color: "ink" as const, dashed: true }, { from: { x: 2, y: -1 }, to: { x: 4, y: 0 }, label: "", color: "ink" as const, dashed: true }] } };
  const fixed = checkFigure(column, facts, compileExpression);
  assert.deepEqual(fixed.spec.plot!.arrows.map(a => [a.to.x, a.to.y]), [[2, 1], [1, -2]]);
  assert.deepEqual(fixed.spec.plot!.segments.map(s => [s.from.x, s.from.y, s.to.x, s.to.y]), [[2, 1, 3, -1], [1, -2, 3, -1]]);
  assert.ok(fixed.corrected.some(c => c.includes("v₂")) && fixed.checked.some(c => c.includes("v₁")));

  // Row picture: one labeled line, one unlabeled hand-drawn line, a slightly-off intersection mark.
  const row = { ...base, plot: { xMin: -2, xMax: 4, yMin: -3, yMax: 4, xLabel: "x", yLabel: "y", grid: false, arrows: [], segments: [], labels: [],
    curves: [{ label: "x - 2y = -1", expression: "(x+1)/2", points: [], color: "ink" as const, dashed: false },
      { label: "", expression: null, points: [{ x: -0.5, y: 4.1 }, { x: 1, y: 1.1 }, { x: 3, y: -2.9 }], color: "ink" as const, dashed: false }],
    points: [{ at: { x: 1.1, y: 0.9 }, label: "", color: "ink" as const }] } };
  const rowFixed = checkFigure(row, facts, compileExpression);
  const second = compileExpression(rowFixed.spec.plot!.curves[1].expression!);
  assert.ok(Math.abs(second(0) - 3) < 1e-9 && Math.abs(second(2) + 1) < 1e-9, "unlabeled line snapped to 2x + y = 3");
  assert.deepEqual(rowFixed.spec.plot!.points[0].at, { x: 1, y: 1 });

  // A real cloud run: the falling line drawn as x + y = 2 (slope −1, too far off to match by shape)
  // and labeled with the OTHER line's equation. Elimination pairs it with 2x + y = 3 and fixes the label.
  const mislabeled = { ...base, plot: { xMin: -2, xMax: 3, yMin: -1.5, yMax: 3.5, xLabel: "x", yLabel: "y", grid: false, arrows: [], segments: [], labels: [],
    curves: [{ label: "x-2y=-1", expression: "(x+1)/2", points: [], color: "ink" as const, dashed: false },
      { label: "x-2y=-1", expression: "2 - x", points: [], color: "ink" as const, dashed: false }],
    points: [{ at: { x: 0, y: 2 }, label: "", color: "ink" as const }, { at: { x: 1, y: 1 }, label: "", color: "ink" as const }] } };
  const mislabeledFixed = checkFigure(mislabeled, facts, compileExpression);
  const falling = compileExpression(mislabeledFixed.spec.plot!.curves[1].expression!);
  assert.ok(Math.abs(falling(0) - 3) < 1e-9 && Math.abs(falling(1.5)) < 1e-9, "falling line snapped to 2x + y = 3");
  assert.match(mislabeledFixed.spec.plot!.curves[1].label, /2x\s*\+\s*y\s*=\s*3/);
  assert.ok(mislabeledFixed.corrected.some(c => c.includes("2x")));
});

test("exercises are counted from the board: one problem read from several photos is one exercise", async () => {
  const { detectExercises } = await import("../lib/notes/exercises");
  const found = detectExercises([
    { kind: "text", content: "Solve $\\begin{cases} 2x+y=3 \\\\ x-2y=-1 \\end{cases}$, and find out its \"row picture\" and \"column picture\"" },
    { kind: "text", content: "Solve $\\begin{cases} 2x+y=3 \\\\ x-2y=-1 \\end{cases}$" },
    { kind: "equation", content: "x = 2y - 1" },
    { kind: "heading", content: "Row picture" },
    { kind: "text", content: "Example: find the derivative of $x^3$" },
  ]);
  assert.equal(found.length, 2);
});

test("a sum like v1 + v2 = [3;-1] is never read as the value of v2", async () => {
  const { boardFacts } = await import("../lib/notes/figure-check");
  const facts = boardFacts([
    "v_1 + v_2 = \\begin{bmatrix} 3 \\\\ -1 \\end{bmatrix}",
    "\\begin{matrix}v_1\\\\||\\\\\\begin{bmatrix}2\\\\1\\end{bmatrix}\\end{matrix}x + \\begin{matrix}v_2\\\\||\\\\\\begin{bmatrix}1\\\\-2\\end{bmatrix}\\end{matrix}y",
    "\\vec{v}_3 = [1, 1]^T", "\\vec{v}_3 = [2, 5]^T",
  ]);
  assert.deepEqual(facts.vectors.map(v => [v.name, v.x, v.y]), [["v1", 2, 1], ["v2", 1, -2]]);
});

test("vectors are also read from the columns of A = [v1 v2]", async () => {
  const { boardFacts } = await import("../lib/notes/figure-check");
  const facts = boardFacts(["A = \\begin{bmatrix} v_1 & v_2 \\end{bmatrix} = \\begin{bmatrix} 2 & 1 \\\\ 1 & -2 \\end{bmatrix}"]);
  assert.deepEqual(facts.vectors.map(v => [v.name, v.x, v.y]), [["v1", 2, 1], ["v2", 1, -2]]);
});

test("data structures are normalized from loose JSON: aliases, null nodes and dangling edges", async () => {
  const { normalizeFigureSpec } = await import("../lib/notes/figure");
  const bst = normalizeFigureSpec({ kind: "structure", structure: { type: "Binary Search Tree", nodes: [{ id: "8", label: "8" }, { id: "3", label: "3" }, { id: "n", label: "NIL" }],
    edges: [{ from: "8", to: "3", side: "LEFT" }, { from: "8", to: "n", side: "right" }, { from: "8", to: "ghost" }], pointers: [{ label: "root", to: "8" }] } });
  assert.equal(bst?.kind, "structure");
  assert.equal(bst?.structure?.type, "tree");
  assert.deepEqual(bst?.structure?.nodes.map(n => n.label), ["8", "3"]);
  assert.deepEqual(bst?.structure?.edges.map(e => [e.from, e.to, e.side]), [["8", "3", "left"]]);
  const list = normalizeFigureSpec({ kind: "structure", structure: { type: "linked list", nodes: ["12", "7"].map(v => ({ id: v, label: v })), edges: [{ from: "12", to: "7" }] } });
  assert.equal(list?.structure?.type, "linked-list");
  assert.equal(list?.structure?.directed, true);
  const hash = normalizeFigureSpec({ kind: "structure", structure: { type: "hashmap", buckets: [{ index: 0, chain: [20, 40] }, { key: "1", items: [] }] } });
  assert.deepEqual(hash?.structure?.buckets, [{ key: "0", items: ["20", "40"] }, { key: "1", items: [] }]);
  assert.equal(normalizeFigureSpec({ kind: "structure", structure: { type: "stack", cells: [] } }), null);
});

test("a figure's own caption beats other lines of the lecture, and marked points block wrong snaps", async () => {
  const { boardFacts, checkFigure } = await import("../lib/notes/figure-check");
  const { compileExpression } = await import("../lib/plot-math");
  // A real precalculus lecture: the board graphs y = ½x − 2 at 16:05; 4x + 2y = 3 is a different exercise at 22:05.
  const facts = boardFacts(["Write $4x + 2y = 3$ in slope-intercept form", "Find the line through $(6,7)$ perpendicular to $2x + 3y = 12$"]);
  assert.equal(facts.lines.length, 2);
  assert.equal(boardFacts(["Graph of $y = \\frac{1}{2}x - 2$"]).lines.length, 1, "slope-intercept with a fraction is parsed");
  const base = { kind: "plot" as const, sketch: null, confidence: "high" as const, notes: null };
  const points = [{ at: { x: 0, y: -2 }, label: "(0, -2)", color: "ink" as const }, { at: { x: 2, y: -1 }, label: "(2, -1)", color: "ink" as const }];
  const plot = (label: string, expression: string) => ({ ...base, plot: { xMin: -2, xMax: 10, yMin: -5, yMax: 5, xLabel: "x", yLabel: "y", grid: false, arrows: [], segments: [], labels: [], points,
    curves: [{ label, expression, points: [], color: "ink" as const, dashed: false }] } });

  // Drawn as the other exercise's line: the caption names y = ½x − 2, so the line is fixed to it.
  const wrong = checkFigure(plot("4x+2y=3", "1.5 - 2*x"), facts, compileExpression, boardFacts(["Graph of $y = \\frac{1}{2}x - 2$"]));
  const fixed = compileExpression(wrong.spec.plot!.curves[0].expression!);
  assert.ok(Math.abs(fixed(0) + 2) < 1e-9 && Math.abs(fixed(2) + 1) < 1e-9, "snapped to y = ½x − 2");

  // Drawn correctly but with no caption equation: it must not be "eliminated" onto 4x + 2y = 3.
  const right = checkFigure(plot("", "0.5*x - 2"), { lines: facts.lines.slice(0, 1), vectors: [] }, compileExpression);
  const kept = compileExpression(right.spec.plot!.curves[0].expression!);
  assert.ok(Math.abs(kept(0) + 2) < 1e-9 && Math.abs(kept(2) + 1) < 1e-9, "line through the marked points kept");
});
