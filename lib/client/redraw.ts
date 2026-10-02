"use client";

import type { FigureSpec } from "../notes/figure";
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
        const nearby = section.blocks.filter(other => other !== block && !FIGURE_KINDS.includes(other.kind)).map(other => other.content).join("\n");
        form.append("context", [nearby, ...section.explanation].join("\n").slice(0, 3000));
        const response = await fetch("/api/board/redraw", { method: "POST", body: form });
        const payload = await response.json() as { spec?: FigureSpec; usage?: Usage; model?: string; error?: string };
        if (!response.ok || !payload.spec) return false;
        if (payload.usage && payload.model) onUsage(payload.usage, payload.model);
        if (isEmptyPlot(payload.spec)) {
          // The redraw confirms there is nothing on these axes: drop the figure rather than show blank axes.
          section.blocks.splice(section.blocks.indexOf(block), 1);
          return true;
        }
        block.redraw = payload.spec;
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
