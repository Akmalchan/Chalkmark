import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { describeFailure, ModelChainError, providerOptions, usageOf, withModels } from "@/lib/ai/models";
import { studySheetSchema } from "@/lib/notes/sheet";
import { detectExercises, overlap, words } from "@/lib/notes/exercises";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  title: z.string(),
  course: z.string(),
  summary: z.string(),
  sections: z.array(z.object({
    title: z.string(),
    explanation: z.array(z.string()),
    takeaways: z.array(z.string()),
    blocks: z.array(z.object({ id: z.string(), kind: z.string(), content: z.string(), detail: z.string() })),
  })).max(40),
  transcript: z.string().max(60_000),
});

/** A board line cut off mid-derivation ("⇒ 5y − 2 = 3 ⇒ x =") is not a formula worth printing. */
const unfinished = (latex: string) => /(=|\\Rightarrow|\\implies|\\to|[+\-*\/,])\s*$/.test(latex.trim());

const instructions = `You write a one-to-two-page study sheet from a lecture's notes, the way a top student condenses a lecture before an exam.

- Be ruthless: keep only what matters for understanding and exams. Around 300-450 words in total.
- Write like student notes: short bullets, arrows (→), abbreviations where natural, no full paragraphs, no "the lecturer explains".
- Formulas: only the key ones, in KaTeX LaTeX. Any math inside bullets, steps or takeaways goes between $…$ (e.g. "solved via $x = A^{-1}b$"), never bare.
- Formulas come from the board: copy them from the BOARD FORMULAS list (verbatim LaTeX, numbers included), preferring the ones with concrete numbers over general forms. Each section shows the board's own concrete formula for its idea (e.g. the actual vector equation, the actual matrix $A$).
- Be concrete, not generic: when the board writes specific objects (a matrix, vectors, values, a solution), show those exact objects — e.g. the actual $A$ and $b$, the actual vectors and the weights that solve it — instead of general statements like "analogous to scalar algebra". Keep the board's own notation and capitalisation.
- Count the distinct exercises actually worked in the lecture. Give each one exactly once, in the section where it belongs — never repeat the same problem as a second "example" in another section (if one problem is viewed several ways, show it once and mention the other views in bullets).
- Give each main idea a worked example. Prefer the lecture's own example (kind "lecture"), with the actual numbers from the board. If the lecture has no example for an important idea, write a short one yourself and mark it kind "practice".
- Figures: pick at most 3 figure blocks that carry real meaning and attach each to the section where it belongs (figureId). Never invent IDs.
- Stay faithful to the lecture: never add facts it does not support (practice examples are the only exception, and must be marked).`;

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const figureIds = new Set(body.sections.flatMap(section => section.blocks.filter(block => ["graph", "diagram", "drawing"].includes(block.kind)).map(block => block.id)));
    const notes = body.sections.map(section => [
      `## ${section.title}`,
      ...section.explanation,
      ...section.blocks.map(block => `[${block.id} · ${block.kind}] ${block.content}${block.detail ? ` — ${block.detail.slice(0, 200)}` : ""}`),
      ...(section.takeaways.length ? ["Remember: " + section.takeaways.join(" / ")] : []),
    ].join("\n")).join("\n\n");
    // How many exercises the lecture actually works is decided from the board, not by the model.
    const exercises = detectExercises(body.sections.flatMap(section => section.blocks));
    const exerciseRule = exercises.length
      ? `The lecture works exactly ${exercises.length} exercise${exercises.length > 1 ? "s" : ""}:\n${exercises.map((e, i) => `${i + 1}. ${e}`).join("\n")}\nGive exactly one worked example (kind "lecture") per exercise above, with the numbers from the board — no other examples, and never the same exercise twice (show its other views as bullets).`
      : "The lecture works no explicit exercise. You may add at most two short practice examples (kind \"practice\").";
    // The board's own formulas, listed separately so the sheet copies them instead of writing generic ones.
    const boardFormulas = body.sections.flatMap(section => section.blocks.filter(block => block.kind === "equation" && !unfinished(block.content)).map(block => `- (${section.title}) ${block.content}`));
    const prompt = [`Lecture: ${body.title} (${body.course})`, body.summary, exerciseRule, "NOTES:", notes,
      boardFormulas.length ? `BOARD FORMULAS:\n${boardFormulas.join("\n")}` : "",
      body.transcript ? `SPEECH (for examples and emphasis):\n${body.transcript}` : ""].join("\n\n");

    const result = await withModels("compose", async (model, meta) => {
      const response = await generateText({
        model,
        system: instructions,
        prompt,
        output: Output.object({ schema: studySheetSchema }),
        providerOptions: providerOptions(meta.provider, { thinkingConfig: { thinkingLevel: "low" } }),
        maxRetries: 0,
        timeout: { totalMs: 90_000 },
      });
      return { sheet: response.output, usage: usageOf(response.usage) };
    });
    // Keep the sheet short and its figure references real, whatever the model returned.
    const sheet = result.value.sheet;
    let figures = 0;
    sheet.sections = sheet.sections.slice(0, 6).map(section => {
      const figureId = section.figureId && figureIds.has(section.figureId) && figures < 3 ? section.figureId : null;
      if (figureId) figures += 1;
      return { ...section, points: section.points.slice(0, 4), formulas: section.formulas.filter(formula => !unfinished(formula.latex)).slice(0, 3), figureId, example: section.example ? { ...section.example, steps: section.example.steps.slice(0, 4) } : null };
    });
    sheet.takeaways = sheet.takeaways.slice(0, 4);
    // Enforce the exercise count: one example per real exercise (best match), nothing invented on top.
    const examples = sheet.sections.map((section, index) => ({ index, example: section.example })).filter(e => e.example);
    const keep = new Set<number>();
    if (exercises.length) {
      for (const exercise of exercises) {
        const best = examples.filter(e => e.example!.kind === "lecture" && !keep.has(e.index))
          .map(e => ({ index: e.index, score: overlap(words(exercise), words(`${e.example!.problem} ${e.example!.steps.join(" ")}`)) }))
          .sort((a, b) => b.score - a.score)[0];
        if (best) keep.add(best.index);
      }
    } else {
      examples.slice(0, 2).forEach(e => keep.add(e.index));
    }
    sheet.sections = sheet.sections.map((section, index) => (keep.has(index) ? section : { ...section, example: null }));
    return NextResponse.json({ sheet, usage: result.value.usage, model: result.model });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Malformed study sheet request." }, { status: 400 });
    const message = error instanceof ModelChainError ? error.message : describeFailure(error);
    console.error("[chalkmark] study sheet failed", error instanceof ModelChainError ? error.attempts : error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
