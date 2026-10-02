import { asSubject, subjectHint } from "@/lib/notes/subject";
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
  subject: z.string().optional(),
});

/** A board line cut off mid-derivation ("⇒ 5y − 2 = 3 ⇒ x =") is not a formula worth printing. */
const unfinished = (latex: string) => {
  const text = latex.trim();
  if (/(=|\\Rightarrow|\\implies|\\to|[+\-*\/,])\s*$/.test(text)) return true;
  // A garbled or cut-off read: brackets that do not balance (escaped \{ \} and \left/\right pairs ignored).
  const plain = text.replace(/\\[{}]/g, "").replace(/\\(left|right)[.()[\]|]/g, "");
  const count = (c: string) => plain.split(c).length - 1;
  return count("(") !== count(")") || count("{") !== count("}") || count("[") !== count("]");
};

const instructions = `You write a short printable study sheet from a lecture's notes, the way a top student condenses a lecture before an exam.

- Be ruthless: keep only what matters for understanding and exams. Stay within the length given with the notes.
- Write like student notes: short bullets, arrows (→), abbreviations where natural, no full paragraphs, no "the lecturer explains".
- Plain words a student would actually write ("b is the diagonal of the parallelogram"), never filler or corporate verbs: no "encapsulates", "leverages", "fundamentally", "crucial", "delve", "robust", "seamless", "represented via".
- Formulas: only the key ones, in KaTeX LaTeX. Any math inside bullets, steps or takeaways goes between $…$ (e.g. "solved via $x = A^{-1}b$"), never bare.
- Formulas come from the board: copy them from the BOARD FORMULAS list (verbatim LaTeX, numbers included), preferring the ones with concrete numbers over general forms. Each section shows the board's own concrete formula for its idea (e.g. the actual vector equation, the actual matrix $A$).
- Every formula must be mathematically correct. If a board formula is clearly a misreading or slip (e.g. "D^2 = \\sqrt{(x_2-x_1)^2+(y_2-y_1)^2}"), write the correct standard form instead and end its label with "(corrected)". Never print a formula you believe is wrong.
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
    // Longer lectures get a longer sheet (still ruthless): 1–2 pages normally, up to 3 for a big lecture.
    const size = body.sections.length + Math.floor(body.sections.reduce((n, section) => n + section.blocks.length, 0) / 12);
    const length = size <= 5 ? { words: "300-450", pages: "one to two pages", sections: 6 } : size <= 9 ? { words: "450-650", pages: "two pages", sections: 8 } : { words: "650-900", pages: "up to three pages", sections: 10 };
    const prompt = [`Lecture: ${body.title} (${body.course})`, body.summary, `LENGTH: around ${length.words} words in total (${length.pages}), at most ${length.sections} sections.`, exerciseRule, "NOTES:", notes,
      boardFormulas.length ? `BOARD FORMULAS:\n${boardFormulas.join("\n")}` : "",
      body.transcript ? `SPEECH (for examples and emphasis):\n${body.transcript}` : ""].join("\n\n");

    const result = await withModels("compose", async (model, meta) => {
      const response = await generateText({
        model,
        system: instructions + subjectHint(asSubject(body.subject), "sheet"),
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
    sheet.sections = sheet.sections.slice(0, length.sections).map(section => {
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
