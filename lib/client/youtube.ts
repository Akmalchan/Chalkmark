"use client";

import { assembleSections, transcriptText } from "../notes/assemble";
import type { BoardRead, Composition, NoteBlock, NotesDoc, TranscriptSegment } from "../notes/schema";
import { redrawFigures } from "./redraw";

type Usage = { inputTokens: number; outputTokens: number };
type Scan = { id: string; title: string; durationSeconds: number; durationVerified: boolean; moments: Array<{ t: number; description: string }>; segments: TranscriptSegment[]; usage: Usage; model: string };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({ error: `Request failed (${response.status})` }));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload as T;
}

/**
 * YouTube board memory without downloading anything: Gemini scans the whole lecture cheaply at low
 * resolution to find the moments each board is fullest, then re-watches only those few seconds at
 * high resolution. Same idea as the camera engine, with Gemini doing the "where to look" step.
 */
export async function runYouTube(url: string, onStage: (label: string) => void): Promise<NotesDoc> {
  const started = performance.now();
  const usage: Usage = { inputTokens: 0, outputTokens: 0 };
  const models = new Set<string>();
  const add = (u?: Usage, model?: string) => { if (u) { usage.inputTokens += u.inputTokens; usage.outputTokens += u.outputTokens; } if (model) models.add(model); };
  const warnings: string[] = [];

  onStage("Gemini is scanning the lecture for board moments");
  const scan = await postJson<Scan>("/api/youtube/scan", { url });
  add(scan.usage, scan.model);
  if (!scan.durationVerified) warnings.push("The video length could not be verified from YouTube, so times are approximate.");

  const blocks: NoteBlock[] = [];
  let done = 0;
  const queue = scan.moments.map((moment, index) => async () => {
    try {
      const result = await postJson<{ blocks: BoardRead["blocks"]; usage: Usage; model: string }>("/api/youtube/read", {
        url, t: moment.t, durationSeconds: scan.durationSeconds, context: transcriptText(scan.segments, moment.t - 120, moment.t + 10, 3000),
      });
      add(result.usage, result.model);
      result.blocks.forEach((block, j) => blocks.push({
        id: `m${String(index + 1).padStart(2, "0")}-${String(j + 1).padStart(2, "0")}`,
        boardId: `moment-${index + 1}`, kind: block.kind, content: block.content, detail: block.detail, table: block.table,
        legibility: block.legibility, box: null, figure: null, writtenAt: Math.round(moment.t), graph: null,
      }));
    } catch (error) {
      warnings.push(`The board at ${Math.round(moment.t)}s could not be read: ${error instanceof Error ? error.message : "error"}`);
    }
    done += 1;
    onStage(`Reading board moments at high resolution · ${done}/${scan.moments.length}`);
  });
  onStage(`Reading board moments at high resolution · 0/${scan.moments.length}`);
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => { while (queue.length) await queue.shift()!(); });
  await Promise.all(workers);
  blocks.sort((a, b) => (a.writtenAt ?? 0) - (b.writtenAt ?? 0) || a.id.localeCompare(b.id));

  onStage("Writing your notes");
  let composition: Composition;
  let composed = true;
  try {
    const result = await postJson<{ composition: Composition; usage: Usage; model: string }>("/api/compose", {
      blocks: blocks.map(({ id, kind, content, detail, writtenAt }) => ({ id, kind, content, detail, writtenAt })),
      transcript: scan.segments, durationSeconds: scan.durationSeconds,
    });
    add(result.usage, result.model);
    composition = result.composition;
  } catch (error) {
    composed = false;
    warnings.push(`Gemini could not organise these notes into sections: ${error instanceof Error ? error.message : "error"}`);
    composition = { title: scan.title, course: "Lecture", summary: "", duplicateBlockIds: [], sections: [{ title: "Board notes", blockIds: blocks.map(b => b.id), explanation: [], takeaways: [] }] };
  }

  const sections = assembleSections(composition, blocks);
  await redrawFigures(sections, new Map(), (done, total) => onStage(total ? `Redrawing figures cleanly · ${done}/${total}` : "Finishing"), add);

  return {
    version: 2,
    title: composition.title || scan.title,
    course: composition.course,
    summary: composition.summary,
    createdAt: new Date().toISOString(),
    sections,
    boards: [],
    transcript: scan.segments,
    warnings,
    composed,
    timing: "estimated",
    transcriptKind: "summary",
    source: { kind: "youtube", videoId: scan.id },
    stats: {
      source: "youtube",
      durationSeconds: Math.round(scan.durationSeconds),
      framesAnalyzed: 0,
      boards: scan.moments.length,
      blocks: blocks.length,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      videoTokensEstimate: 0,
      models: [...models],
      processingSeconds: Math.round((performance.now() - started) / 1000),
    },
  };
}
