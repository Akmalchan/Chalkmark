import { NextResponse } from "next/server";
import { describeFailure, ModelChainError, withModels } from "@/lib/ai/models";
import { generateContentRest } from "@/lib/ai/gemini-rest";
import { geminiJsonSchema, youtubeScanSchema } from "@/lib/notes/youtube";
import { youtubeDuration, youtubeId } from "@/lib/source-metadata";

export const runtime = "nodejs";
export const maxDuration = 300;

const instructions = `You are scanning a lecture video to decide where to look closely.

1. Find every moment where the board (or slide) is at its most complete, right before the lecturer erases it, slides it away, scrolls, or switches to new content — plus the final state. One moment per distinct board state. Be precise: pick the last second before content disappears.
2. For each moment, summarise what the lecturer explained while building that board (paraphrase; never invent).
3. Give the lecture a specific title.
All times must be within the video's length and in order.`;

export async function POST(request: Request) {
  try {
    const { url } = await request.json() as { url?: string };
    const id = youtubeId(String(url ?? "").trim());
    if (!id) return NextResponse.json({ error: "Paste a public YouTube watch link (youtube.com/watch?v=… or youtu.be/…)." }, { status: 400 });
    const duration = await youtubeDuration(id);
    const result = await withModels("youtube-scan", async (_model, meta) => {
      const response = await generateContentRest(meta.id, meta.provider, {
        system: instructions,
        parts: [
          { fileData: { fileUri: `https://www.youtube.com/watch?v=${id}`, mimeType: "video/mp4" }, videoMetadata: { fps: 0.25 } },
          { text: duration ? `The video is exactly ${duration} seconds long.` : "Scan the whole video." },
        ],
        schema: geminiJsonSchema(youtubeScanSchema),
        mediaResolution: "MEDIA_RESOLUTION_LOW",
        thinkingLevel: "low",
        timeoutMs: 150_000,
      });
      return { scan: youtubeScanSchema.parse(JSON.parse(response.text)), usage: response.usage };
    });
    const limit = duration ?? Infinity;
    const { scan } = result.value;
    const moments = scan.moments.filter(moment => moment.t <= limit).sort((a, b) => a.t - b.t);
    // Spoken summaries become coarse "speech" segments spanning the time each board was built.
    const segments = moments.map((moment, i) => ({ start: i ? moments[i - 1].t : 0, end: moment.t, text: moment.spoken }));
    return NextResponse.json({
      id, title: scan.title, durationSeconds: duration ?? Math.max(0, ...segments.map(s => s.end), ...moments.map(m => m.t)),
      durationVerified: duration !== null, moments, segments, usage: result.value.usage, model: result.model,
    });
  } catch (error) {
    const message = error instanceof ModelChainError ? error.message : describeFailure(error);
    console.error("[chalkmark] youtube scan failed", error instanceof ModelChainError ? error.attempts : error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
