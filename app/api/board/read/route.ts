import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { boardReadSchema } from "@/lib/notes/schema";
import { describeFailure, ModelChainError, providerOptions, usageOf, withModels } from "@/lib/ai/models";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const instructions = `You read photographed lecture boards (whiteboards, chalkboards, paper) for a note-taking app.

You receive the board twice: first a cleaned "paper" rendering (lecturer removed, background flattened), then the original photo for colour and faint strokes. Both share the same coordinates.

Split everything written or drawn into blocks, in the order a student would read them (top-to-bottom, left-to-right, following columns and arrows):
- heading, text: transcribe faithfully, fixing nothing the lecturer did not write. Use Markdown bullets for lists and $...$ for inline math.
- equation: one block per line of math, as KaTeX-compatible LaTeX (no $ delimiters). Keep the lecturer's notation, including subscripts, primes, limits and arrows.
- table: columns and rows exactly as drawn.
- graph: anything with axes. diagram: boxes, arrows, flowcharts, geometry, trees. drawing: any other sketch (a car, a cell, a circuit, a person). For these, content is a short caption and detail describes every label, axis, tick, arrow and part precisely.
- box_2d must tightly enclose the ink of that block on the image: [ymin, xmin, ymax, xmax] as integers 0-1000.
- Messy handwriting: use the spoken context (if given) and mathematical consistency to resolve ambiguous symbols. If something stays unreadable, write [?] in its place and set legibility to partial or unclear. Never invent content that is not on the board.
- The photo may show only part of the board (the camera can pan, the lecturer can block it). Skip writing that is cut off by the image edge, half-erased, or partly hidden — another photo holds the complete version. Never output fragments such as a lone word or the tail of a sentence.
- Ignore smudges, eraser marks, board edges, and anything that is not writing.`;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const paper = form.get("paper");
    const raw = form.get("raw");
    const context = String(form.get("context") ?? "").slice(0, 4000);
    if (!(paper instanceof File) || !paper.type.startsWith("image/") || paper.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Send the board as a PNG or JPEG under 12 MB." }, { status: 400 });
    }
    const content: Array<{ type: "text"; text: string } | { type: "file"; data: Uint8Array; mediaType: string }> = [
      { type: "text", text: "Cleaned board:" },
      { type: "file", data: new Uint8Array(await paper.arrayBuffer()), mediaType: paper.type },
    ];
    if (raw instanceof File && raw.type.startsWith("image/") && raw.size <= MAX_IMAGE_BYTES) {
      content.push({ type: "text", text: "Original photo of the same board:" });
      content.push({ type: "file", data: new Uint8Array(await raw.arrayBuffer()), mediaType: raw.type });
    }
    content.push({ type: "text", text: context ? `What the lecturer was saying while this was written (may be partial):\n${context}` : "No audio context is available." });

    const result = await withModels("read", async (model, meta) => {
      const response = await generateText({
        model,
        system: instructions,
        messages: [{ role: "user", content }],
        output: Output.object({ schema: boardReadSchema }),
        providerOptions: providerOptions(meta.provider, { mediaResolution: "MEDIA_RESOLUTION_HIGH", thinkingConfig: { thinkingLevel: "low" } }),
        maxRetries: 1,
        timeout: { totalMs: 60_000 },
      });
      return { read: response.output, usage: usageOf(response.usage) };
    });

    return NextResponse.json({ blocks: result.value.read.blocks, usage: result.value.usage, model: result.model, attempts: result.attempts });
  } catch (error) {
    const message = error instanceof ModelChainError ? error.message : describeFailure(error);
    console.error("[chalkmark] board read failed", error instanceof ModelChainError ? error.attempts : error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
