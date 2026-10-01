import { z } from "zod";

export const youtubeScanSchema = z.object({
  title: z.string().describe("Specific lecture title"),
  moments: z.array(z.object({
    t: z.number().nonnegative().describe("Seconds from the start: the last moment the board/slide is complete, right before it is erased, changed or scrolled away"),
    description: z.string().describe("What that board state contains, in a few words"),
    spoken: z.string().describe("2-4 sentences summarising what the lecturer explained while building this board (paraphrase, use $...$ for math)"),
  })).max(30).describe("One per distinct board or slide state worth keeping, in time order, plus the final state"),
});
export type YouTubeScan = z.infer<typeof youtubeScanSchema>;

/** Gemini's responseJsonSchema accepts plain JSON Schema; drop zod's $schema marker. */
export function geminiJsonSchema(schema: z.ZodType) {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}
