"use client";

import { BoardEngine, type EngineConfig, type FrameReport, type PersonMask, type Snapshot } from "../board/engine";
import type { Quad, RGBAImage } from "../board/geometry";
import { renderPaper } from "../board/paper";
import { freshness, fromGeminiBox, tightenToInk, writtenSpan, type Box } from "../board/blocks";
import { assembleSections, transcriptText } from "../notes/assemble";
import { FIGURE_KINDS, type BoardPage, type BoardRead, type Composition, type NoteBlock, type NotesDoc, type TranscriptSegment } from "../notes/schema";
import { cropImage, imageToBlob } from "./media";

export type SourceKind = "camera" | "file";

export type BoardState = {
  page: BoardPage;
  paperUrl: string;
  rawUrl: string;
  status: "reading" | "done" | "error";
  error?: string;
  blocks: NoteBlock[];
  skipped: number;
};

type Usage = { inputTokens: number; outputTokens: number };

/** Live Gemini cost of the old approach: whole video at default resolution (~100 tok/s) plus audio (~32 tok/s). */
const VIDEO_TOKENS_PER_SECOND = 132;
/** Blocks whose measured ink is mostly already saved in an earlier board are re-reads, not new content. */
const MIN_FRESHNESS = 0.3;
const COMPOSE_WARNING = "Gemini could not organise these notes into sections, so board content is shown in the order it was written:";

async function postForm<T>(url: string, form: FormData): Promise<T> {
  const response = await fetch(url, { method: "POST", body: form });
  const payload = await response.json().catch(() => ({ error: `Request failed (${response.status})` }));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload as T;
}

export class LectureSession {
  readonly engine: BoardEngine;
  readonly boards: BoardState[] = [];
  readonly files = new Map<string, Blob>();
  transcript: TranscriptSegment[] = [];
  warnings: string[] = [];
  framesAnalyzed = 0;
  durationSeconds = 0;
  usage: Usage = { inputTokens: 0, outputTokens: 0 };
  readonly models = new Set<string>();
  private readonly startedAt = performance.now();
  private readonly pending = new Set<Promise<unknown>>();
  private readonly paperImages = new Map<string, RGBAImage>();
  private readonly snapshots = new Map<string, Snapshot>();
  private readQueue: Array<() => Promise<void>> = [];
  private activeReads = 0;
  private listeners = new Set<() => void>();
  private version = 0;

  constructor(readonly source: SourceKind, quad: Quad, config: Partial<EngineConfig> = {}, private readonly title = "") {
    this.engine = new BoardEngine(quad, config);
  }

  /* ---------- observation ---------- */

  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  get revision() { return this.version; }
  private emit() { this.version += 1; for (const listener of this.listeners) listener(); }

  ingest(frame: RGBAImage, t: number, personMask?: PersonMask): FrameReport {
    const report = this.engine.ingest(frame, t, personMask);
    this.framesAnalyzed += 1;
    this.durationSeconds = Math.max(this.durationSeconds, t);
    if (report.snapshot) this.track(this.handleSnapshot(report.snapshot));
    return report;
  }

  /** Save the current board right now (e.g. the lecturer is about to slide the board away). */
  captureNow() {
    const snapshot = this.engine.flush("manual");
    if (snapshot) this.track(this.handleSnapshot(snapshot));
    return Boolean(snapshot);
  }

  addTranscript(segments: TranscriptSegment[]) {
    this.transcript = [...this.transcript, ...segments].sort((a, b) => a.start - b.start);
    this.emit();
  }

  transcribe(blob: Blob, offsetSeconds: number) {
    const form = new FormData();
    form.append("audio", blob, blob.type.includes("mp4") ? "audio.m4a" : "audio.webm");
    form.append("offsetSeconds", String(offsetSeconds));
    const job = postForm<{ segments: TranscriptSegment[]; usage: Usage; model: string }>("/api/transcribe", form)
      .then(result => { this.addUsage(result.usage, result.model); this.addTranscript(result.segments); })
      .catch(error => { this.warnings.push(`Part of the audio (from ${Math.round(offsetSeconds)}s) could not be transcribed: ${error.message}`); this.emit(); });
    this.track(job);
    return job;
  }

  private track<T>(promise: Promise<T>) {
    this.pending.add(promise);
    promise.finally(() => this.pending.delete(promise));
    return promise;
  }

  private addUsage(usage: Usage | undefined, model?: string) {
    if (usage) { this.usage.inputTokens += usage.inputTokens; this.usage.outputTokens += usage.outputTokens; }
    if (model) this.models.add(model);
  }

  /* ---------- board snapshots ---------- */

  private async handleSnapshot(snapshot: Snapshot) {
    const paper = renderPaper(snapshot.image, snapshot.polarity);
    const [paperBlob, rawBlob] = await Promise.all([imageToBlob(paper, "image/png"), imageToBlob(snapshot.image, "image/jpeg", 0.86)]);
    const page: BoardPage = {
      id: snapshot.id, t: snapshot.t, reason: snapshot.reason,
      paper: `${snapshot.id}.png`, raw: `${snapshot.id}.jpg`,
      width: paper.width, height: paper.height,
    };
    this.files.set(page.paper, paperBlob);
    this.files.set(page.raw, rawBlob);
    this.paperImages.set(snapshot.id, paper);
    this.snapshots.set(snapshot.id, { ...snapshot, image: { width: 0, height: 0, data: new Uint8ClampedArray(0) } });
    const state: BoardState = { page, paperUrl: URL.createObjectURL(paperBlob), rawUrl: URL.createObjectURL(rawBlob), status: "reading", blocks: [], skipped: 0 };
    this.boards.push(state);
    this.emit();
    await this.enqueueRead(() => this.readBoard(state, paperBlob, rawBlob));
  }

  private enqueueRead(task: () => Promise<void>): Promise<void> {
    return new Promise(resolve => {
      this.readQueue.push(async () => { try { await task(); } finally { resolve(); } });
      this.pumpReads();
    });
  }

  private pumpReads() {
    while (this.activeReads < 2 && this.readQueue.length) {
      const next = this.readQueue.shift()!;
      this.activeReads += 1;
      next().finally(() => { this.activeReads -= 1; this.pumpReads(); });
    }
  }

  private async readBoard(state: BoardState, paperBlob: Blob, rawBlob: Blob) {
    const snapshot = this.snapshots.get(state.page.id)!;
    const previous = this.boards[this.boards.indexOf(state) - 1];
    const context = transcriptText(this.transcript, (previous?.page.t ?? 0) - 20, state.page.t + 10, 4000);
    const form = new FormData();
    form.append("paper", paperBlob, state.page.paper);
    form.append("raw", rawBlob, state.page.raw);
    form.append("context", context);
    try {
      const result = await postForm<{ blocks: BoardRead["blocks"]; usage: Usage; model: string }>("/api/board/read", form);
      this.addUsage(result.usage, result.model);
      await this.acceptBlocks(state, snapshot, result.blocks);
      state.status = "done";
    } catch (error) {
      state.status = "error";
      state.error = error instanceof Error ? error.message : "Board could not be read.";
      this.warnings.push(`Board ${state.page.id} could not be read: ${state.error}`);
    }
    this.emit();
  }

  private async acceptBlocks(state: BoardState, snapshot: Snapshot, blocks: BoardRead["blocks"]) {
    const paper = this.paperImages.get(snapshot.id)!;
    const isFirst = this.boards[0] === state;
    let index = 0;
    for (const block of blocks) {
      const proposed = fromGeminiBox(block.box_2d);
      const box: Box | null = proposed ? tightenToInk(paper, proposed) : null;
      if (box && !isFirst) {
        const fresh = freshness(snapshot, box);
        if (fresh !== null && fresh < MIN_FRESHNESS) { state.skipped += 1; continue; }
      }
      const span = box ? writtenSpan(snapshot, box) : null;
      index += 1;
      const id = `${snapshot.id}-${String(index).padStart(2, "0")}`;
      const needsFigure = FIGURE_KINDS.includes(block.kind) || block.legibility === "unclear";
      let figure: string | null = null;
      if (needsFigure && box) {
        figure = `${id}.png`;
        this.files.set(figure, await imageToBlob(cropImage(paper, box), "image/png"));
      }
      state.blocks.push({
        id, boardId: snapshot.id, kind: block.kind, content: block.content, detail: block.detail,
        table: block.table, legibility: block.legibility, box, figure,
        writtenAt: span ? Math.round(span.start * 10) / 10 : null, graph: null,
      });
    }
  }

  figureUrl(name: string) {
    const blob = this.files.get(name);
    return blob ? URL.createObjectURL(blob) : "";
  }

  /* ---------- finishing ---------- */

  async finish(onStage?: (label: string) => void): Promise<NotesDoc> {
    onStage?.("Saving the last board state");
    const last = this.engine.flush("final");
    if (last) this.track(this.handleSnapshot(last));
    onStage?.("Reading every board with Gemini");
    while (this.pending.size) await Promise.allSettled([...this.pending]);
    for (const board of this.boards) if (board.status === "error") board.blocks.length = 0;
    this.paperImages.clear();
    onStage?.("Writing your notes");
    return this.compose();
  }

  /** Gemini's section pass. Safe to call again if it failed (e.g. the model was busy). */
  async compose(): Promise<NotesDoc> {
    const blocks = this.boards.flatMap(board => board.blocks)
      .sort((a, b) => (a.writtenAt ?? Infinity) - (b.writtenAt ?? Infinity));
    let composition: Composition;
    let composed = true;
    const warnings = this.warnings.filter(warning => !warning.startsWith(COMPOSE_WARNING));
    try {
      const response = await fetch("/api/compose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          blocks: blocks.map(({ id, kind, content, detail, writtenAt }) => ({ id, kind, content, detail, writtenAt })),
          transcript: this.transcript,
          durationSeconds: this.durationSeconds,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Compose failed");
      this.addUsage(payload.usage, payload.model);
      composition = payload.composition;
    } catch (error) {
      composed = false;
      warnings.push(`${COMPOSE_WARNING} ${error instanceof Error ? error.message : "unknown error"}`);
      composition = { title: this.title || "Lecture notes", course: "Lecture", summary: "", duplicateBlockIds: [], sections: [{ title: "Board notes", blockIds: blocks.map(b => b.id), explanation: [], takeaways: [] }] };
    }
    this.warnings = warnings;

    const doc: NotesDoc = {
      version: 2,
      title: composition.title,
      course: composition.course,
      summary: composition.summary,
      createdAt: new Date().toISOString(),
      sections: assembleSections(composition, blocks),
      boards: this.boards.map(board => board.page),
      transcript: this.transcript,
      warnings,
      composed,
      stats: {
        source: this.source,
        durationSeconds: Math.round(this.durationSeconds),
        framesAnalyzed: this.framesAnalyzed,
        boards: this.boards.length,
        blocks: blocks.length,
        inputTokens: this.usage.inputTokens,
        outputTokens: this.usage.outputTokens,
        videoTokensEstimate: Math.round(this.durationSeconds * VIDEO_TOKENS_PER_SECOND),
        models: [...this.models],
        processingSeconds: Math.round((performance.now() - this.startedAt) / 1000),
      },
    };
    this.emit();
    return doc;
  }
}
