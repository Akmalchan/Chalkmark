import { generateText } from "ai";
import { NextResponse } from "next/server";
import { ModelChainError, usageOf, withModels } from "@/lib/ai/models";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Instant board title from Gemma 4 (open weights, via the Gemini API) while the full Gemini read runs.
 * Gemma is small enough to run on-device later, which is where Chalkmark is heading.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File) || !image.type.startsWith("image/") || image.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: "Send a small board image." }, { status: 400 });
    }
    const data = new Uint8Array(await image.arrayBuffer());
    const result = await withModels("caption", async model => {
      const response = await generateText({
        model,
        messages: [{
          role: "user",
          content: [
            { type: "file", data, mediaType: image.type },
            { type: "text", text: "This is a lecture whiteboard. Reply with only a short title (at most 7 words) naming the topic on it. No quotes, no punctuation at the end." },
          ],
        }],
        maxRetries: 0,
        timeout: { totalMs: 20_000 },
      });
      return { text: response.text, usage: usageOf(response.usage) };
    });
    const title = result.value.text.split("\n")[0].replace(/^["'*#\s]+|["'*.\s]+$/g, "").slice(0, 80);
    return NextResponse.json({ title, model: result.model, usage: result.value.usage });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ModelChainError ? error.message : "Caption failed" }, { status: 502 });
  }
}
