import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { composeSchema, BLOCK_KINDS } from "@/lib/notes/schema";
import { formatClock, transcriptText } from "@/lib/notes/assemble";
import { describeFailure, ModelChainError, providerOptions, usageOf, withModels } from "@/lib/ai/models";

export const runtime = "nodejs";
export const maxDuration = 180;

const requestSchema = z.object({
  blocks: z.array(z.object({
    id: z.string(),
    kind: z.enum(BLOCK_KINDS),
    content: z.string(),
    detail: z.string(),
    writtenAt: z.number().nullable(),
  })).max(400),
  transcript: z.array(z.object({ start: z.number(), end: z.number(), text: z.string() })).max(4000),
  durationSeconds: z.number().nonnegative(),
});

const instructions = `You turn a lecture's board content into clean, study-ready notes.

You get every block that was written on the board (already transcribed, with the measured time it was written) and, when available, what the lecturer said.

- Group blocks into sections by topic, in teaching order. Use the written times to keep chronology.
- Every block ID must appear in exactly one section. Do not rewrite or merge blocks: they are rendered from the board as-is.
- If two blocks are the same writing read twice (identical or near-identical content from two board photos), list the less complete one in duplicateBlockIds instead of a section.
- explanation: connect the blocks the way a great TA would, using the lecturer's spoken reasoning when available. Paraphrase; never invent quotes, facts, or steps that are not supported by the board or the speech.
- takeaways: the few things a student must remember from the section.
- Use $...$ for math in explanation and takeaways.`;

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    if (!body.blocks.length && !body.transcript.length) {
      return NextResponse.json({ error: "Nothing to compose yet: no board content or speech was captured." }, { status: 400 });
    }
    const blockLines = body.blocks.map(block => {
      const time = block.writtenAt === null ? "" : ` @${formatClock(block.writtenAt)}`;
      const detail = block.detail ? ` — ${block.detail.slice(0, 280)}` : "";
      return `${block.id} [${block.kind}${time}] ${block.content.slice(0, 400)}${detail}`;
    }).join("\n");
    const prompt = [
      `Lecture length: ${body.durationSeconds ? formatClock(body.durationSeconds) : "unknown"}.`,
      "BOARD BLOCKS:", blockLines || "(none)",
      "SPEECH:", body.transcript.length ? transcriptText(body.transcript, -Infinity, Infinity, 40_000) : "(no audio)",
    ].join("\n\n");

    const result = await withModels("compose", async (model, meta) => {
      const response = await generateText({
        model,
        system: instructions,
        prompt,
        output: Output.object({ schema: composeSchema }),
        providerOptions: providerOptions(meta.provider, { thinkingConfig: { thinkingLevel: "low" } }),
        maxRetries: 1,
        timeout: { totalMs: 120_000 },
      });
      return { composition: response.output, usage: usageOf(response.usage) };
    });
    return NextResponse.json({ composition: result.value.composition, usage: result.value.usage, model: result.model });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Malformed compose request." }, { status: 400 });
    const message = error instanceof ModelChainError ? error.message : describeFailure(error);
    console.error("[chalkmark] compose failed", error instanceof ModelChainError ? error.attempts : error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
