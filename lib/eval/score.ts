import { compileExpression } from "../plot-math";
import type { NotesDoc } from "../notes/schema";

/**
 * Score a Chalkmark notes document against a hand-made answer key: which board items are present,
 * which figures were redrawn with the right mathematics, and which items are not in the key (to be
 * checked by a person: possible misreads or invented content).
 */

export type AnswerKey = {
  lecture: string;
  items: Array<{ id: string; label: string; all?: string[]; orAll?: string[]; any?: string[]; core?: boolean }>;
  figures: Array<{ id: string; label: string; lines?: string[]; point?: [number, number]; arrows?: Array<[number, number]> }>;
};

/** LaTeX/plain math → a compact comparable string: "\begin{bmatrix}2&1\\1&-2\end{bmatrix}" → "[2,1;1,-2]". */
export function normalizeMath(text: string): string {
  return text.toLowerCase()
    .replace(/\\begin\{[bpv]?matrix\}/g, "[").replace(/\\end\{[bpv]?matrix\}/g, "]")
    .replace(/\\begin\{(cases|array|aligned)\}(\{[^}]*\})?/g, "").replace(/\\end\{(cases|array|aligned)\}/g, "")
    .replace(/\\\\/g, ";").replace(/&/g, ",")
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)")
    .replace(/\\(left|right|cdot|,|;|!|quad|qquad|displaystyle|mathbf|mathrm|text|boldsymbol|vec)/g, "")
    .replace(/\\(implies|rightarrow|longrightarrow|to)/g, "=>").replace(/⇒|→/g, "=>")
    .replace(/[−–]/g, "-").replace(/₁/g, "_1").replace(/₂/g, "_2").replace(/⁻¹/g, "^-1")
    .replace(/\^\{([^{}]*)\}/g, "^$1").replace(/_\{([^{}]*)\}/g, "_$1")
    .replace(/[{}$\s]/g, "")
    .replace(/\((\w)\)\/\((\w)\)/g, "$1/$2");
}

export type ScoreReport = {
  lecture: string;
  coverage: { found: number; total: number; coreFound: number; coreTotal: number };
  items: Array<{ id: string; label: string; found: boolean; core: boolean; where: string | null }>;
  figures: Array<{ id: string; label: string; status: "pass" | "partial" | "fail" | "missing"; detail: string }>;
  unmatched: string[];
  sheet: { present: boolean; coreFound: number; coreTotal: number } | null;
};

function matches(item: AnswerKey["items"][number], text: string) {
  if (item.any?.some(token => text.includes(token))) return true;
  if (item.all && item.all.every(token => text.includes(token))) return true;
  if (item.orAll && item.orAll.every(token => text.includes(token))) return true;
  return false;
}

const close = (a: number, b: number, tolerance = 0.2) => Math.abs(a - b) <= tolerance;

export function scoreNotes(doc: NotesDoc, key: AnswerKey): ScoreReport {
  const blocks = doc.sections.flatMap(section => section.blocks);
  const sources = [
    ...blocks.map(block => ({ where: `${block.kind} ${block.id}`, text: normalizeMath(`${block.content} ${block.table ? JSON.stringify(block.table) : ""}`) })),
    ...doc.sections.map((section, i) => ({ where: `explanation §${i + 1}`, text: normalizeMath([section.title, ...section.explanation, ...section.takeaways].join(" ")) })),
  ];
  const items = key.items.map(item => {
    const hit = sources.find(source => matches(item, source.text));
    return { id: item.id, label: item.label, core: Boolean(item.core), found: Boolean(hit), where: hit?.where ?? null };
  });

  // Blocks that match nothing in the key: possible misreads or invented content, for a human to check.
  const unmatched = blocks
    .filter(block => !["graph", "diagram", "drawing"].includes(block.kind))
    .filter(block => !key.items.some(item => matches(item, normalizeMath(block.content))))
    .map(block => `[${block.kind}] ${block.content.slice(0, 90)}`);

  const plots = blocks.map(block => block.redraw?.plot).filter((plot): plot is NonNullable<typeof plot> => Boolean(plot));
  const rank = { missing: 0, fail: 1, partial: 2, pass: 3 } as const;
  const figures = key.figures.map(figure => {
    let best: { status: ScoreReport["figures"][number]["status"]; detail: string } = { status: "missing", detail: "no redrawn plot in the notes" };
    for (const plot of plots) {
      const checks: Array<[string, boolean]> = [];
      for (const expected of figure.lines ?? []) {
        const want = compileExpression(expected);
        const ok = plot.curves.some(curve => {
          if (curve.expression) {
            try { const got = compileExpression(curve.expression); return [-1, 0, 2].every(x => close(got(x), want(x), 0.05)); } catch { return false; }
          }
          return curve.points.length > 1 && curve.points.every(p => close(p.y, want(p.x), 0.4));
        }) || plot.segments.some(s => close(s.from.y, want(s.from.x), 0.3) && close(s.to.y, want(s.to.x), 0.3));
        checks.push([`line y = ${expected}`, ok]);
      }
      if (figure.point) {
        const [px, py] = figure.point;
        checks.push([`point (${px}, ${py})`, plot.points.some(p => close(p.at.x, px) && close(p.at.y, py))]);
      }
      for (const [ax, ay] of figure.arrows ?? []) {
        checks.push([`vector to (${ax}, ${ay})`, plot.arrows.some(a => close(a.to.x, ax) && close(a.to.y, ay) && close(a.from.x, 0) && close(a.from.y, 0))]);
      }
      const passed = checks.filter(([, ok]) => ok).length;
      const status = passed === checks.length ? "pass" : passed > 0 ? "partial" : "fail";
      if (rank[status] > rank[best.status]) best = { status, detail: checks.map(([name, ok]) => `${ok ? "✓" : "✗"} ${name}`).join(", ") };
    }
    return { id: figure.id, label: figure.label, ...best };
  });

  let sheet: ScoreReport["sheet"] = null;
  if (doc.sheet) {
    const text = normalizeMath(JSON.stringify(doc.sheet).replace(/\\\\/g, "\\"));
    const core = key.items.filter(item => item.core);
    sheet = { present: true, coreTotal: core.length, coreFound: core.filter(item => matches(item, text)).length };
  }

  return {
    lecture: key.lecture,
    coverage: {
      found: items.filter(item => item.found).length, total: items.length,
      coreFound: items.filter(item => item.found && item.core).length, coreTotal: items.filter(item => item.core).length,
    },
    items, figures, unmatched, sheet,
  };
}
