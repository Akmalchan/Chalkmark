import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { transcriptSchema } from "@/lib/notes/schema";
import { describeFailure, ModelChainError, providerOptions, usageOf, withModels } from "@/lib/ai/models";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_AUDIO_BYTES = 30 * 1024 * 1024;

const instructions = `Transcribe this lecture audio into segments of one to three sentences.
- start/end are seconds from the beginning of this audio file and must be in order.
- Clean up filler words (um, uh, repeated starts) but never change meaning or invent words.
- Write spoken math in words or with $...$ LaTeX when clear (e.g. "the derivative of $x^2$ is $2x$").
- If there is no speech, return an empty list.`;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    const offset = Number(form.get("offsetSeconds") ?? 0) || 0;
    if (!(audio instanceof File) || audio.size === 0) return NextResponse.json({ error: "No audio received." }, { status: 400 });
    if (audio.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Audio chunk is larger than 30 MB." }, { status: 413 });
    const mediaType = (audio.type || "audio/webm").split(";")[0];
    const bytes = new Uint8Array(await audio.arrayBuffer());

    const result = await withModels("transcribe", async (model, meta) => {
      const response = await generateText({
        model,
        system: instructions,
        messages: [{ role: "user", content: [{ type: "file", data: bytes, mediaType }, { type: "text", text: "Transcribe." }] }],
        output: Output.object({ schema: transcriptSchema }),
        providerOptions: providerOptions(meta.provider, {
          // audioTimestamp is a Vertex-only field; the Gemini API rejects it.
          ...(meta.provider === "vertex" ? { audioTimestamp: true } : {}),
          thinkingConfig: { thinkingLevel: "low" },
        }),
        // No SDK retries: the model chain moves to the next model and cools this one down.
        maxRetries: 0,
        timeout: { totalMs: 240_000 },
      });
      return { segments: response.output.segments, usage: usageOf(response.usage) };
    });

    const segments = result.value.segments
      .filter(segment => segment.text.trim())
      .map(segment => ({ start: segment.start + offset, end: Math.max(segment.start, segment.end) + offset, text: segment.text.trim() }))
      .sort((a, b) => a.start - b.start);
    return NextResponse.json({ segments, usage: result.value.usage, model: result.model });
  } catch (error) {
    const message = error instanceof ModelChainError ? error.message : describeFailure(error);
    console.error("[chalkmark] transcription failed", error instanceof ModelChainError ? error.attempts : error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
