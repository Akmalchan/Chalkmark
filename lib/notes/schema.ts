import { z } from "zod";
import { graphPanelSchema } from "../lecture-schema";

/* ---------- What Gemini returns when it reads one board snapshot ---------- */

export const BLOCK_KINDS = ["heading", "text", "equation", "table", "graph", "diagram", "drawing"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
export const FIGURE_KINDS: BlockKind[] = ["graph", "diagram", "drawing"];

export const boardReadSchema = z.object({
  blocks: z.array(z.object({
    kind: z.enum(BLOCK_KINDS).describe("heading: a title on the board; text: words/bullets; equation: one line of math; table: rows/columns; graph: axes with curves/points; diagram: boxes/arrows/flow/geometry; drawing: any sketch or picture (a car, a cell, a circuit)"),
    box_2d: z.array(z.number()).describe("[ymin, xmin, ymax, xmax] of this item on the image, integers 0-1000"),
    content: z.string().describe("heading/text: Markdown with $...$ around math. equation: KaTeX LaTeX only, no $ delimiters. table: a one-line title. graph/diagram/drawing: a short caption naming what is shown"),
    detail: z.string().describe("equation: what it means in plain words. graph/diagram/drawing: a precise description of every label, axis, arrow and part so a student could redraw it. Otherwise empty"),
    table: z.object({ columns: z.array(z.string()), rows: z.array(z.array(z.string())) }).nullable().describe("Only for kind=table; cells may use $...$ math. Otherwise null"),
    legibility: z.enum(["clear", "partial", "unclear"]),
  })),
});
export type BoardRead = z.infer<typeof boardReadSchema>;

/* ---------- Transcript ---------- */

export const transcriptSchema = z.object({
  segments: z.array(z.object({
    start: z.number().nonnegative().describe("Seconds from the start of the audio"),
    end: z.number().nonnegative(),
    text: z.string(),
  })),
});
export type TranscriptSegment = z.infer<typeof transcriptSchema>["segments"][number];

/* ---------- Composition: Gemini only orders and explains; it never retypes board content ---------- */

export const composeSchema = z.object({
  title: z.string().describe("Specific lecture title inferred from the content"),
  course: z.string().describe("Subject, e.g. 'Calculus I', or 'Lecture' if unknown"),
  summary: z.string().describe("Two or three sentences: what was taught and why it matters"),
  duplicateBlockIds: z.array(z.string()).describe("IDs of blocks that repeat another block's content (the same writing read twice from two board photos). Keep the clearer copy; list the other here. Usually empty"),
  sections: z.array(z.object({
    title: z.string(),
    blockIds: z.array(z.string()).describe("IDs of board blocks in this section, in teaching order. Every block ID not listed as a duplicate appears in exactly one section"),
    explanation: z.array(z.string()).describe("Short paragraphs connecting the board content, using what was said aloud when available. Paraphrase; never invent quotes. Use $...$ for math"),
    takeaways: z.array(z.string()).describe("1-3 crisp things to remember. Use $...$ for math"),
  })),
});
export type Composition = z.infer<typeof composeSchema>;

/* ---------- The notes document Chalkmark renders, exports and shares ---------- */

export type NoteBlock = {
  id: string;
  boardId: string;
  kind: BlockKind;
  content: string;
  detail: string;
  table: { columns: string[]; rows: string[][] } | null;
  legibility: "clear" | "partial" | "unclear";
  /** Normalized box on the board image (x0,y0,x1,y1). */
  box: [number, number, number, number] | null;
  /** Figure crop file name (clean paper), for graph/diagram/drawing/unclear blocks. */
  figure: string | null;
  /** When the ink was first written, measured by the board engine (seconds). */
  writtenAt: number | null;
  /** Optional computed redraw of a graph, rendered beside the original ink. */
  graph: z.infer<typeof graphPanelSchema> | null;
};

export type BoardPage = {
  id: string;
  /** Short topic title (Gemma 4), when available. */
  caption?: string;
  t: number;
  reason: "erase" | "final" | "manual";
  paper: string;
  raw: string;
  width: number;
  height: number;
};

export type NotesSection = {
  title: string;
  start: number | null;
  end: number | null;
  blocks: NoteBlock[];
  explanation: string[];
  takeaways: string[];
};

export type NotesStats = {
  source: "camera" | "file" | "youtube";
  durationSeconds: number;
  framesAnalyzed: number;
  boards: number;
  blocks: number;
  inputTokens: number;
  outputTokens: number;
  /** What sending the whole video to Gemini would have cost in input tokens (estimate). */
  videoTokensEstimate: number;
  models: string[];
  processingSeconds: number;
};

export type NotesDoc = {
  version: 2;
  id?: string;
  title: string;
  course: string;
  summary: string;
  createdAt: string;
  sections: NotesSection[];
  boards: BoardPage[];
  transcript: TranscriptSegment[];
  stats: NotesStats;
  warnings: string[];
  /** False when Gemini's section pass failed and blocks were laid out in time order instead. */
  composed?: boolean;
  /** "measured" = write times come from the board engine; "estimated" = model-estimated (YouTube mode). */
  timing?: "measured" | "estimated";
  /** "summary" when speech is summarised per board (YouTube mode) rather than transcribed. */
  transcriptKind?: "verbatim" | "summary";
  source?: { kind: "youtube"; videoId: string };
};
