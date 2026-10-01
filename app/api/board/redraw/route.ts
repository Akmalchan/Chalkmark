import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { describeFailure, ModelChainError, providerOptions, usageOf, withModels } from "@/lib/ai/models";
import { FIGURE_SPEC_GUIDE, normalizeFigureSpec } from "@/lib/notes/figure";

export const runtime = "nodejs";
export const maxDuration = 120;

const instructions = `You redraw a figure from a lecture board as clean, exact vector graphics for a student's notes.

Faithfulness comes first: draw only what is visible in the image of this figure. The surrounding board text and speech are there to read labels and values correctly — never to add curves, points or labels that are not drawn in this image (an empty pair of axes stays empty). If there is no image, draw exactly what the description says.

Choose "plot" for anything with coordinate axes (functions, lines, vectors, row/column pictures, data) and "sketch" for everything else (diagrams, geometry without axes, circuits, a car, a cell).

Plots must be mathematically right, not just look right:
- If a drawn line or curve is labeled with an equation (e.g. 2x + y = 3), draw it from its expression solved for y ("3 - 2*x") so it is exact. Vertical lines x = c become a segment.
- Compute intersections and marked points exactly (e.g. the solution (1, 1)), and place vectors at their true coordinates (v1 = (2, 1) is an arrow from (0,0) to (2,1)).
- Keep every label, arrow, dashed guide, parallelogram side and point that is on the board. Do not add things that are not there.
- Choose axis ranges that show all of it with a small margin.

Sketches must keep the composition of the original: same parts, relative sizes and positions, simplified to clean shapes. Add text labels exactly where the board has them.

Labels use plain Unicode, not LaTeX: v₁, x², θ, π, ≤, →. Keep them short.
If something cannot be determined, set confidence lower and say what in notes — never guess silently.

${FIGURE_SPEC_GUIDE}`;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const image = form.get("image");
    const kind = String(form.get("kind") ?? "drawing");
    const caption = String(form.get("caption") ?? "").slice(0, 400);
    const detail = String(form.get("detail") ?? "").slice(0, 2000);
    const context = String(form.get("context") ?? "").slice(0, 3000);
    const content: Array<{ type: "text"; text: string } | { type: "file"; data: Uint8Array; mediaType: string }> = [];
    if (image instanceof File && image.type.startsWith("image/") && image.size < 8 * 1024 * 1024) {
      content.push({ type: "text", text: "The figure as drawn on the board (cleaned photo):" });
      content.push({ type: "file", data: new Uint8Array(await image.arrayBuffer()), mediaType: image.type });
    }
    content.push({ type: "text", text: [
      `Kind on the board: ${kind}.`,
      caption && `Caption: ${caption}`,
      detail && `What the board shows: ${detail}`,
      context && `Board text and speech around it:\n${context}`,
      content.length ? "" : "No image is available: redraw from the description only and set confidence accordingly.",
    ].filter(Boolean).join("\n") });

    const result = await withModels("read", async (model, meta) => {
      const response = await generateText({
        model,
        system: instructions,
        messages: [{ role: "user", content }],
        // The nested drawing schema is too deep for Gemini's schema enforcement: ask for JSON and
        // normalise leniently, keeping every usable shape instead of rejecting the whole figure.
        output: Output.json(),
        providerOptions: providerOptions(meta.provider, { mediaResolution: "MEDIA_RESOLUTION_HIGH", thinkingConfig: { thinkingLevel: "medium" } }),
        maxRetries: 1,
        timeout: { totalMs: 70_000 },
      });
      const spec = normalizeFigureSpec(response.output);
      if (!spec) throw new Error("The redraw JSON had no usable shapes (validation)");
      return { spec, usage: usageOf(response.usage) };
    });
    const spec = result.value.spec;
    return NextResponse.json({ spec, usage: result.value.usage, model: result.model });
  } catch (error) {
    const message = error instanceof ModelChainError ? error.message : describeFailure(error);
    console.error("[chalkmark] redraw failed", error instanceof ModelChainError ? error.attempts : error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
