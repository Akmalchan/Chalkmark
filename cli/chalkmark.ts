/**
 * chalkmark — lecture boards to clean notes, from the terminal.
 *
 *   chalkmark scan <video>        run the board engine locally (ffmpeg decodes), save every board, read them
 *   chalkmark board <photo...>    notes from photos of a board
 *   chalkmark youtube <url>       notes from a public YouTube lecture
 *
 * The board engine runs on your machine exactly as in the browser; reading and writing notes go to a
 * Chalkmark server (the public one by default, or your own with --server), so no API key is needed.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { BoardEngine, type Snapshot } from "../lib/board/engine";
import { fullFrameQuad, type RGBAImage } from "../lib/board/geometry";
import { renderPaper } from "../lib/board/paper";
import { inkMask, supersededBoards } from "../lib/board/supersede";
import { assembleSections } from "../lib/notes/assemble";
import { dedupeBlocks } from "../lib/notes/dedupe";
import { notesToMarkdown, sheetToMarkdown, slugify } from "../lib/notes/export";
import type { BoardRead, Composition, NoteBlock, NotesDoc } from "../lib/notes/schema";
import type { StudySheet } from "../lib/notes/sheet";
import { asSubject, type Subject } from "../lib/notes/subject";

const DEFAULT_SERVER = "https://chalkmark-513544387119.us-central1.run.app";

/* ---------- terminal ---------- */

const tty = process.stdout.isTTY;
const paint = (code: string) => (text: string) => (tty ? `\x1b[${code}m${text}\x1b[0m` : text);
const lime = paint("38;5;149"), green = paint("38;5;29"), dim = paint("2"), bold = paint("1"), coral = paint("38;5;209"), blue = paint("38;5;75");
const LOGO = `${lime("▟")}${green("█")} ${bold("chalkmark")} ${dim("· the board forgets, your notes don't")}`;
const step = (text: string) => process.stdout.write(`${lime("›")} ${text}\n`);
let lastStatus = "";
const status = (text: string) => {
  if (!tty) { if (text !== lastStatus) console.log(`  ${text}`); lastStatus = text; return; }
  process.stdout.write(`\r\x1b[2K  ${dim(text)}`);
};
const endStatus = () => { if (tty) process.stdout.write("\r\x1b[2K"); };
const fail = (message: string): never => { console.error(`${coral("✗")} ${message}`); process.exit(1); };

/* ---------- arguments ---------- */

type Options = { server: string; subject: Subject; out?: string; sheet: boolean; dry: boolean; title?: string; quick: boolean };

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const options: Options = { server: process.env.CHALKMARK_SERVER || DEFAULT_SERVER, subject: "auto", sheet: true, dry: false, quick: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => argv[++i] ?? fail(`${arg} needs a value`);
    if (arg === "--server") options.server = value().replace(/\/$/, "");
    else if (arg === "--subject") options.subject = asSubject(value());
    else if (arg === "--out" || arg === "-o") options.out = value();
    else if (arg === "--title") options.title = value();
    else if (arg === "--no-sheet") options.sheet = false;
    else if (arg === "--dry") options.dry = true;
    else if (arg === "--quick") options.quick = true;
    else if (arg === "-h" || arg === "--help") { help(); process.exit(0); }
    else positional.push(arg);
  }
  return { command: positional[0], inputs: positional.slice(1), options };
}

function help() {
  console.log(`${LOGO}

${bold("Usage")}
  chalkmark scan <video>          Run the board engine locally, save every board before it is erased, read them
  chalkmark board <photo...>      Notes from photos of a board (jpg/png)
  chalkmark youtube <url>         Notes from a public YouTube lecture

${bold("Options")}
  --subject auto|math|cs          What kind of lecture (cs = data structures & algorithms)
  --title "…"                     Lecture title
  -o, --out <dir>                 Where to write notes (default ./chalkmark-notes/<title>)
  --no-sheet                      Skip the one-to-two page study sheet
  --quick                         scan: fewer frames (faster)
  --dry                           scan: board engine only, no AI calls (just the saved boards)
  --server <url>                  Chalkmark server (default: the public one; env CHALKMARK_SERVER)

${dim("scan needs ffmpeg (brew install ffmpeg). The video never leaves your machine — only board images do.")}`);
}

/* ---------- server calls ---------- */

let SERVER = DEFAULT_SERVER;
const realFetch = globalThis.fetch;
// The app's own client code calls relative /api/… paths; send them to the chosen server.
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  realFetch(typeof input === "string" && input.startsWith("/") ? SERVER + input : input, init)) as typeof fetch;

async function api<T>(route: string, body: unknown): Promise<T> {
  const response = await fetch(route, body instanceof FormData ? { method: "POST", body } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload as T;
}

/* ---------- PNG (no native dependencies) ---------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (bytes: Buffer) => { let c = 0xffffffff; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function encodePng(image: RGBAImage): Buffer {
  const chunk = (type: string, data: Buffer) => { const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, "ascii"); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0); return Buffer.concat([head, data, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(image.width, 0); ihdr.writeUInt32BE(image.height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const stride = image.width * 4, raw = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) Buffer.from(image.data.buffer, image.data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
}

/* ---------- notes from board blocks (same steps as the web app) ---------- */

type Read = { blocks: BoardRead["blocks"]; usage?: unknown; model?: string };
const imageType = (file: string) => (/\.png$/i.test(file) ? "image/png" : /\.webp$/i.test(file) ? "image/webp" : "image/jpeg");

async function readBoards(boards: Array<{ id: string; t: number | null; paper: Buffer; paperType: string; raw?: Buffer }>, subject: Subject): Promise<NoteBlock[]> {
  const blocks: NoteBlock[] = [];
  let done = 0;
  const queue = boards.map(board => async () => {
    const form = new FormData();
    form.append("paper", new File([new Uint8Array(board.paper)], `${board.id}.png`, { type: board.paperType }));
    if (board.raw) form.append("raw", new File([new Uint8Array(board.raw)], `${board.id}-raw.png`, { type: "image/png" }));
    form.append("context", "");
    form.append("subject", subject);
    try {
      const result = await api<Read>("/api/board/read", form);
      result.blocks.forEach((block, j) => blocks.push({ id: `${board.id}-${String(j + 1).padStart(2, "0")}`, boardId: board.id, kind: block.kind, content: block.content, detail: block.detail, table: block.table, legibility: block.legibility, box: null, figure: null, writtenAt: board.t, graph: null }));
    } catch (error) {
      endStatus(); console.log(`  ${coral("!")} ${board.id} could not be read: ${error instanceof Error ? error.message : error}`);
    }
    status(`reading boards with Gemini · ${++done}/${boards.length}`);
  });
  status(`reading boards with Gemini · 0/${boards.length}`);
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => { while (queue.length) await queue.shift()!(); }));
  endStatus();
  return blocks.sort((a, b) => (a.writtenAt ?? 0) - (b.writtenAt ?? 0) || a.id.localeCompare(b.id));
}

async function compose(allBlocks: NoteBlock[], options: Options, source: NotesDoc["stats"]["source"], durationSeconds: number): Promise<NotesDoc> {
  const { kept: blocks } = dedupeBlocks(allBlocks);
  status("writing your notes");
  let composition: Composition;
  try {
    composition = (await api<{ composition: Composition }>("/api/compose", { blocks: blocks.map(({ id, kind, content, detail, writtenAt }) => ({ id, kind, content, detail, writtenAt })), transcript: [], durationSeconds })).composition;
  } catch {
    composition = { title: options.title || "Lecture notes", course: "Lecture", summary: "", duplicateBlockIds: [], sections: [{ title: "Board notes", blockIds: blocks.map(b => b.id), explanation: [], takeaways: [] }] };
  }
  endStatus();
  return {
    version: 2, subject: options.subject, title: options.title || composition.title, course: composition.course, summary: composition.summary,
    createdAt: new Date().toISOString(), sections: assembleSections(composition, blocks), boards: [], transcript: [], warnings: [], composed: true,
    stats: { source, durationSeconds, framesAnalyzed: 0, boards: 0, blocks: blocks.length, inputTokens: 0, outputTokens: 0, videoTokensEstimate: 0, models: [], processingSeconds: 0 },
  } as unknown as NotesDoc;
}

async function studySheet(doc: NotesDoc): Promise<StudySheet | null> {
  status("condensing a study sheet");
  try {
    const { sheet } = await api<{ sheet: StudySheet }>("/api/sheet", {
      title: doc.title, course: doc.course, summary: doc.summary, subject: doc.subject ?? "auto", transcript: "", durationSeconds: doc.stats?.durationSeconds ?? 0,
      sections: doc.sections.map(section => ({ title: section.title, explanation: section.explanation, takeaways: section.takeaways, blocks: section.blocks.map(({ id, kind, content, detail }) => ({ id, kind, content, detail })) })),
    });
    return sheet;
  } catch (error) {
    endStatus(); console.log(`  ${coral("!")} no study sheet: ${error instanceof Error ? error.message : error}`);
    return null;
  } finally { endStatus(); }
}

async function finish(doc: NotesDoc, options: Options, files: Array<{ name: string; bytes: Buffer }>) {
  const sheet = options.sheet ? await studySheet(doc) : null;
  const dir = path.resolve(options.out ?? path.join("chalkmark-notes", slugify(doc.title) || "lecture"));
  fs.mkdirSync(path.join(dir, "boards"), { recursive: true });
  for (const file of files) fs.writeFileSync(path.join(dir, "boards", file.name), file.bytes);
  fs.writeFileSync(path.join(dir, "notes.md"), notesToMarkdown(doc, name => `boards/${name}`));
  if (sheet) fs.writeFileSync(path.join(dir, "study-sheet.md"), sheetToMarkdown(doc, sheet));
  fs.writeFileSync(path.join(dir, "notes.json"), JSON.stringify(sheet ? { ...doc, sheet } : doc, null, 2));
  console.log(`\n${bold(doc.title)}  ${dim(doc.course ?? "")}`);
  for (const [i, section] of doc.sections.entries()) console.log(`  ${lime(String(i + 1))} ${section.title} ${dim(`· ${section.blocks.length} block${section.blocks.length === 1 ? "" : "s"}`)}`);
  if (sheet?.takeaways?.length) { console.log(`\n${coral("Before the exam")}`); for (const item of sheet.takeaways) console.log(`  • ${item}`); }
  console.log(`\n${lime("✓")} ${dir}`);
  console.log(`  ${dim("notes.md")}${sheet ? dim(" · study-sheet.md") : ""}${files.length ? dim(` · boards/ (${files.length})`) : ""}${dim(" · notes.json")}`);
}

/* ---------- commands ---------- */

async function scanCommand(video: string, options: Options) {
  if (!fs.existsSync(video)) fail(`No such file: ${video}`);
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) fail("scan needs ffmpeg to decode the video: brew install ffmpeg (or apt install ffmpeg)");
  const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", video], { encoding: "utf8" });
  const info = JSON.parse(probe.stdout || "{}") as { streams?: Array<{ width: number; height: number }>; format?: { duration?: string } };
  const source = info.streams?.[0];
  const duration = Number(info.format?.duration ?? 0);
  if (!source?.width || !duration) fail("ffprobe could not read this video");
  const width = 640, height = Math.round((640 * source!.height) / source!.width / 2) * 2;
  // Same sampling as the studio: ~1 frame/s (one per ~3 s for --quick).
  const interval = options.quick ? Math.min(4, Math.max(2.5, duration / 360)) : Math.min(2, Math.max(0.5, duration / 1200));
  step(`scanning ${path.basename(video)} ${dim(`· ${Math.round(duration / 60)} min · ${width}×${height} · 1 frame / ${interval.toFixed(2)} s · on this machine`)}`);

  const engine = new BoardEngine(fullFrameQuad(width, height), { stableSeconds: options.quick ? interval * 1.6 : Math.max(1.2, interval * 2.2) });
  const snapshots: Snapshot[] = [];
  const keep = (snapshot: Snapshot | null | undefined) => { if (snapshot) snapshots.push(snapshot); };
  const frameBytes = width * height * 4;
  const ffmpeg = spawn("ffmpeg", ["-v", "error", "-i", video, "-vf", `fps=1/${interval},scale=${width}:${height}`, "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"], { stdio: ["ignore", "pipe", "inherit"] });
  let pending: Buffer = Buffer.alloc(0), frame = 0;
  const started = Date.now();
  for await (const chunk of ffmpeg.stdout) {
    pending = pending.length ? Buffer.concat([pending, chunk as Buffer]) : (chunk as Buffer);
    while (pending.length >= frameBytes) {
      const data = new Uint8ClampedArray(pending.buffer.slice(pending.byteOffset, pending.byteOffset + frameBytes));
      pending = pending.subarray(frameBytes);
      const t = frame * interval;
      keep(engine.ingest({ width, height, data }, t).snapshot);
      frame += 1;
      const bar = Math.round((Math.min(t, duration) / duration) * 24);
      status(`${lime("█".repeat(bar))}${dim("░".repeat(24 - bar))} ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")} · ${frame} frames · ${snapshots.length} boards saved`);
    }
  }
  keep(engine.flush("final"));
  endStatus();
  const papers = snapshots.map(snapshot => renderPaper(snapshot.image, snapshot.polarity));
  // Drop drafts (ink contained in a later board) and near-empty views, exactly like the web app.
  const masks = papers.map(paper => inkMask(paper));
  const typical = masks.map(m => m.count).sort((a, b) => a - b)[Math.floor(masks.length / 2)] ?? 0;
  const superseded = supersededBoards(masks);
  const kept = snapshots.map((snapshot, i) => ({ snapshot, paper: papers[i], i })).filter(({ i }) => !superseded.has(i) && masks[i].count >= Math.max(12, typical * 0.12));
  step(`${frame} frames in ${((Date.now() - started) / 1000).toFixed(1)} s → ${snapshots.length} snapshots → ${bold(String(kept.length))} boards worth reading ${dim("(drafts and empty views dropped)")}`);

  const files = kept.flatMap(({ snapshot, paper }, n) => {
    const id = `board-${String(n + 1).padStart(2, "0")}`;
    return [{ id, t: snapshot.t, name: `${id}.png`, bytes: encodePng(paper) }, { id, t: snapshot.t, name: `${id}-photo.png`, bytes: encodePng(snapshot.image) }];
  });
  if (options.dry || !kept.length) {
    const dir = path.resolve(options.out ?? path.join("chalkmark-notes", slugify(options.title || path.parse(video).name)));
    fs.mkdirSync(dir, { recursive: true });
    for (const file of files) fs.writeFileSync(path.join(dir, file.name), file.bytes);
    console.log(`${lime("✓")} ${dir} ${dim(`· ${kept.length} boards (dry run: no AI calls)`)}`);
    return;
  }
  const boards = kept.map((_, n) => { const paper = files[n * 2], photo = files[n * 2 + 1]; return { id: paper.id, t: paper.t, paper: paper.bytes, paperType: "image/png", raw: photo.bytes }; });
  step(`sending ${boards.length} board images to ${dim(new URL(SERVER).host)} ${dim(`(${Math.round(files.reduce((s, f) => s + f.bytes.length, 0) / 1024)} KB — not the video)`)}`);
  const blocks = await readBoards(boards, options.subject);
  const doc = await compose(blocks, { ...options, title: options.title }, "file", duration);
  await finish(doc, options, files.map(file => ({ name: file.name, bytes: file.bytes })));
}

async function boardCommand(photos: string[], options: Options) {
  if (!photos.length) fail("board needs at least one photo: chalkmark board whiteboard.jpg");
  for (const photo of photos) if (!fs.existsSync(photo)) fail(`No such file: ${photo}`);
  step(`reading ${photos.length} board photo${photos.length > 1 ? "s" : ""} ${dim(`via ${new URL(SERVER).host}`)}`);
  const boards = photos.map((photo, n) => ({ id: `board-${String(n + 1).padStart(2, "0")}`, t: null, paper: fs.readFileSync(photo), paperType: imageType(photo) }));
  const blocks = await readBoards(boards, options.subject);
  const doc = await compose(blocks, options, "file", 0);
  await finish(doc, options, boards.map((board, n) => ({ name: `${board.id}${path.extname(photos[n]).toLowerCase() || ".jpg"}`, bytes: board.paper })));
}

async function youtubeCommand(url: string, options: Options) {
  if (!url) fail("youtube needs a link: chalkmark youtube https://www.youtube.com/watch?v=…");
  step(`reading ${url} ${dim(`via ${new URL(SERVER).host} · Gemini finds the board moments`)}`);
  const { runYouTube } = await import("../lib/client/youtube");
  const doc = await runYouTube(url, label => status(label));
  endStatus();
  if (options.title) doc.title = options.title;
  doc.subject = options.subject;
  await finish(doc, options, []);
}

async function main() {
  const { command, inputs, options } = parseArgs(process.argv.slice(2));
  SERVER = options.server;
  console.log(LOGO);
  if (!command) { help(); return; }
  if (command === "scan") return scanCommand(inputs[0], options);
  if (command === "board") return boardCommand(inputs, options);
  if (command === "youtube" || command === "yt") return youtubeCommand(inputs[0], options);
  fail(`Unknown command "${command}". Try: chalkmark --help`);
}

main().catch(error => fail(error instanceof Error ? error.message : String(error)));
