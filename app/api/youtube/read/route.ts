import { NextResponse } from "next/server";
import { describeFailure, ModelChainError, withModels } from "@/lib/ai/models";
import { generateContentRest, seconds } from "@/lib/ai/gemini-rest";
import { boardReadSchema } from "@/lib/notes/schema";
import { geminiJsonSchema } from "@/lib/notes/youtube";
import { youtubeId } from "@/lib/source-metadata";

export const runtime = "nodejs";
export const maxDuration = 120;

const instructions = `You see a few seconds of a lecture video at high resolution, ending at the moment the board is most complete.
Read everything written or drawn on the board as it is at the END of the clip, in reading order:
- heading/text: transcribe faithfully, Markdown bullets, $...$ for inline math.
- equation: one block per line, KaTeX LaTeX without $ delimiters.
- table: columns and rows as drawn.
- graph/diagram/drawing: content is a short caption; detail describes every axis, label, arrow and part precisely enough to redraw it.
- box_2d: [ymin, xmin, ymax, xmax] 0-1000 of the item in the frame.
Use the spoken context to resolve messy handwriting. Mark unreadable parts [?] and set legibility. Ignore the lecturer and anything that is not board content.`;

export async function POST(request: Request) {
  try {
    const { url, t, durationSeconds, context } = await request.json() as { url?: string; t?: number; durationSeconds?: number; context?: string };
    const id = youtubeId(String(url ?? ""));
    if (!id || typeof t !== "number" || !Number.isFinite(t)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const end = Math.min(durationSeconds && durationSeconds > 0 ? durationSeconds : Infinity, t + 1.5);
    const start = Math.max(0, end - 6);
    const result = await withModels("youtube-read", async (_model, meta) => {
      const response = await generateContentRest(meta.id, meta.provider, {
        system: instructions,
        parts: [
          { fileData: { fileUri: `https://www.youtube.com/watch?v=${id}`, mimeType: "video/mp4" }, videoMetadata: { startOffset: seconds(start), endOffset: seconds(end), fps: 1 } },
          { text: context ? `What the lecturer was saying around then:\n${String(context).slice(0, 3000)}` : "No speech context." },
        ],
        schema: geminiJsonSchema(boardReadSchema),
        mediaResolution: "MEDIA_RESOLUTION_HIGH",
        thinkingLevel: "low",
        timeoutMs: 90_000,
      });
      return { read: boardReadSchema.parse(JSON.parse(response.text)), usage: response.usage };
    });
    return NextResponse.json({ blocks: result.value.read.blocks, usage: result.value.usage, model: result.model });
  } catch (error) {
    const message = error instanceof ModelChainError ? error.message : describeFailure(error);
    console.error("[chalkmark] youtube read failed", error instanceof ModelChainError ? error.attempts : error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
