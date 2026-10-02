"use client";

import type { FigureSpec } from "../notes/figure";
import { boardFacts, checkFigure, plotSignature } from "../notes/figure-check";
import { compileExpression } from "../plot-math";
import { FIGURE_KINDS, type NotesSection } from "../notes/schema";

type Usage = { inputTokens: number; outputTokens: number };

/**
 * Ask Gemini to redraw every figure that made it into the notes (after duplicates are removed, so
 * nothing is redrawn twice). Uses the ink crop when there is one, otherwise the description.
 */
export async function redrawFigures(
  sections: NotesSection[],
  files: Map<string, Blob>,
  onProgress: (done: number, total: number) => void,
  onUsage: (usage: Usage, model: string) => void,
): Promise<number> {
  const jobs = sections.flatMap(section => section.blocks
    .filter(block => FIGURE_KINDS.includes(block.kind))
    .map(block => ({ section, block })));
  let done = 0, ok = 0;
  // Exact values the board states anywhere in the lecture (line equations, vectors).
  const facts = boardFacts(sections.flatMap(section => section.blocks.filter(block => !FIGURE_KINDS.includes(block.kind)).map(block => block.content)));
  onProgress(0, jobs.length);
  const queue = [...jobs];
  const worker = async () => {
    while (queue.length) {
      const { section, block } = queue.shift()!;
      const attempt = async () => {
        const form = new FormData();
        const crop = block.figure ? files.get(block.figure) : undefined;
        if (crop) form.append("image", crop, block.figure!);
        form.append("kind", block.kind);
        form.append("caption", block.content);
        form.append("detail", block.detail);
        // Board text gives exact values (v₂ = (1, −2)) for what IS drawn; the prompt forbids using it
        // to add anything that is not drawn in this figure.
        const values = section.blocks.filter(other => other !== block && (other.kind === "equation" || other.kind === "text")).map(other => other.content).join("\n");
        form.append("context", values.slice(0, 2500));
        const response = await fetch("/api/board/redraw", { method: "POST", body: form });
        const payload = await response.json() as { spec?: FigureSpec; usage?: Usage; model?: string; error?: string };
        if (!response.ok || !payload.spec) return false;
        if (payload.usage && payload.model) onUsage(payload.usage, payload.model);
        if (isEmptyPlot(payload.spec)) {
          // The redraw confirms there is nothing on these axes: drop the figure rather than show blank axes.
          section.blocks.splice(section.blocks.indexOf(block), 1);
          return true;
        }
        // The board is the authority on numbers: check the drawing against it and snap what disagrees.
        const verified = checkFigure(payload.spec, facts, compileExpression);
        block.redraw = verified.spec;
        block.redrawCheck = { checked: verified.checked, corrected: verified.corrected };
        ok += 1;
        return true;
      };
      try {
        // One retry after a pause: a busy model is the usual reason a redraw fails.
        if (!(await attempt().catch(() => false))) { await new Promise(resolve => setTimeout(resolve, 4000)); await attempt().catch(() => false); }
      } catch {
        // Keep the original ink if a redraw fails.
      }
      done += 1;
      onProgress(done, jobs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, jobs.length) }, worker));
  // After checking, the same board figure read from two photos has the same lines/vectors: keep one,
  // the one with more drawn elements.
  const seen = new Map<string, { section: NotesSection; block: (typeof jobs)[number]["block"] }>();
  const size = (b: (typeof jobs)[number]["block"]) => { const p = b.redraw?.plot; return p ? p.curves.length + p.arrows.length + p.segments.length + p.points.length + p.labels.length : 0; };
  for (const { section, block } of jobs) {
    const signature = plotSignature(block.redraw);
    if (!signature || !section.blocks.includes(block)) continue;
    const first = seen.get(signature);
    if (!first) { seen.set(signature, { section, block }); continue; }
    const drop = size(block) > size(first.block) ? first : { section, block };
    drop.section.blocks.splice(drop.section.blocks.indexOf(drop.block), 1);
    if (drop === first) seen.set(signature, { section, block });
  }
  return ok;
}

/** Axes with nothing on them (at most an unlabeled dot at the origin). */
export function isEmptyPlot(spec: FigureSpec): boolean {
  if (spec.kind !== "plot" || !spec.plot) return false;
  const { curves, arrows, segments, points, labels } = spec.plot;
  const meaningfulPoints = points.filter(p => p.label.trim() && !/^[O0]$/.test(p.label.trim()) || Math.abs(p.at.x) > 1e-9 || Math.abs(p.at.y) > 1e-9);
  const meaningfulLabels = labels.filter(l => !/^[O0xy]$/i.test(l.text.trim()));
  return !curves.length && !arrows.length && !segments.length && !meaningfulPoints.length && !meaningfulLabels.length;
}
