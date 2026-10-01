import { generateText, Output, type ModelMessage } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { lectureSchema } from "@/lib/lecture-schema";
import { youtubeDuration, youtubeId } from "@/lib/source-metadata";
import { validateLecture } from "@/lib/validate-lecture";
import { aiConfigured, isTimeout, ModelChainError, statusOf, withModels } from "@/lib/ai/models";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_VIDEO_BYTES = 85 * 1024 * 1024;
const MAX_FRAMES = 12;
const MODEL_TIMEOUT_MS = 90_000;

function isTransientModelError(error: unknown): boolean {
  const status = statusOf(error);
  return isTimeout(error) || status === 408 || status === 429 || (status !== undefined && status >= 500);
}

function isYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return (
      (url.hostname === "youtube.com" || url.hostname === "www.youtube.com") &&
      url.pathname === "/watch" &&
      Boolean(url.searchParams.get("v"))
    ) || (url.hostname === "youtu.be" && url.pathname.length > 1);
  } catch {
    return false;
  }
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Gemini could not reconstruct this lecture.";
}

const instructions = `You are Chalkmark, a meticulous lecture reconstruction engine.

Your job is to reconstruct the lecture chronologically by merging what was said with what appeared on the board. Treat the board as a changing external memory: preserve useful content even if it is erased later.

Rules:
1. Produce a timestamped transcript that is faithful but cleaned of filler. Do not invent speech.
2. Organize sections around topic changes, derivations, worked examples, or meaningful board changes.
3. Distinguish board content from spoken-only context.
4. Convert equations to valid KaTeX-compatible LaTeX without dollar delimiters.
5. Describe diagrams precisely enough that a student could redraw them.
6. When labeled board snapshots are supplied, cite only their exact frame IDs. Never invent a frame ID.
7. If text is illegible or uncertain, say so briefly instead of guessing.
8. Aim for concise, study-ready notes rather than a verbose summary.
9. Use seconds from the start of the video for every timestamp.
10. Inspect both the audio and the visual stream. The transcript alone is not enough: use visible board writing, slides, demonstrations, graphs, and later-erased material as evidence.
11. Put every mathematical expression in equations, not boardContent. equation.latex must contain only KaTeX-compatible LaTeX with no dollar signs, backticks, code fences, or "latex:" prefix.
12. When a meaningful graph, flow, or table is visibly used, populate visual. For coordinate_graph, use panels: one for EACH separate source graph, explicit axis ranges and source tick labels. For a clearly identified formula, supply its arithmetic expression so the app computes the curve precisely; leave points empty. Use points only for observed qualitative traces or discrete data. Include ALL source curves, tangent/secant lines, triangles, points and labels as annotations. Never describe a curve or triangle you omitted from the drawing. For concept_diagram use nodes/edges, empty panels. For table provide columns/rows, empty panels/nodes/edges. All unused arrays must be empty and unused table null.
13. Reconstruct only visuals actually supported by the lecture. Use diagram as a brief accessible text description of the same visual, or null when no visual was shown.
14. Mark formula_based only when the function is explicitly identified by the source. Qualitative drawings must say that coordinates/layout are approximate; use uncertain when details cannot be read. Give the visual's sourceTimestampSeconds. Never add example numerical measurements to a qualitative sketch without disclosing they are illustrative. Omit the visual when you cannot support it.
15. Honor the supplied source duration exactly. All timestamps are elapsed seconds (10:30 means 630), must lie within that duration, and must remain chronological. Never stretch timestamps to match a guessed lecture length.
16. The transcript is a set of selected speech excerpts, not a full transcription. spokenDetails are paraphrases, not verbatim quotations. Do not claim exact words without audio evidence.
17. Use tables to preserve actual board tables or paired lists; use $...$ around math within text/table cells. Do not put the same formula in boardContent and equations.

Return only a JSON object conforming to this schema. Use null for unavailable nullable fields and [] for unused arrays. Do not return the schema itself:
${JSON.stringify(z.toJSONSchema(lectureSchema))}`;

export async function POST(request: Request) {
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "Gemini is not configured yet. Add GOOGLE_GENERATIVE_AI_API_KEY to .env.local, then restart the app." },
      { status: 503 },
    );
  }

  try {
    const form = await request.formData();
    const sourceType = String(form.get("sourceType") ?? "");
    const sourceName = String(form.get("sourceName") ?? "lecture");
    const rawFrameMeta = String(form.get("frameMeta") ?? "[]");
    const frameMeta = JSON.parse(rawFrameMeta) as Array<{ id: string; timestampSeconds: number }>;
    let sourceDuration: number | null = null;

    const content: Extract<ModelMessage, { role: "user" }>["content"] = [
      {
        type: "text",
        text: `Reconstruct this lecture titled or named "${sourceName}". The attached media is the source of truth. Labeled still images are locally selected persistent board states and should be used to recover exact visual content.`,
      },
    ];

    if (sourceType === "youtube") {
      const youtubeUrl = String(form.get("youtubeUrl") ?? "").trim();
      const videoId = youtubeId(youtubeUrl);
      if (!isYouTubeUrl(youtubeUrl) || !videoId) {
        return NextResponse.json({ error: "Enter a public YouTube watch URL." }, { status: 400 });
      }
      sourceDuration = await youtubeDuration(videoId);
      content.push({ type: "file", data: `https://www.youtube.com/watch?v=${videoId}`, mediaType: "video/mp4" });
      content.push({ type: "text", text: "Explore the YouTube timeline as needed. No local board snapshots were available, so return empty frameIds unless labeled snapshots follow." });
    } else if (sourceType === "upload") {
      const video = form.get("video");
      if (!(video instanceof File) || video.size === 0) {
        return NextResponse.json({ error: "Choose a readable lecture video." }, { status: 400 });
      }
      if (video.size > MAX_VIDEO_BYTES) {
        return NextResponse.json({ error: "For this prototype, uploaded videos must be 85 MB or smaller. A YouTube URL can be longer." }, { status: 413 });
      }
      if (!video.type.startsWith("video/")) {
        return NextResponse.json({ error: "The uploaded file must be a video." }, { status: 415 });
      }
      content.push({ type: "file", data: new Uint8Array(await video.arrayBuffer()), mediaType: video.type });
      const reportedDuration = Number(form.get("durationSeconds"));
      sourceDuration = Number.isFinite(reportedDuration) && reportedDuration > 0 ? reportedDuration : null;
    } else {
      return NextResponse.json({ error: "Choose an upload or YouTube source." }, { status: 400 });
    }

    content.push({ type: "text", text: sourceDuration !== null
      ? `SOURCE METADATA: This video is exactly ${sourceDuration} elapsed seconds long. Set durationSeconds to ${sourceDuration}. No timestamp may exceed ${sourceDuration}. Check every section, visual and transcript timestamp before returning.`
      : "Source duration is unavailable. Never guess precise timing from general knowledge of the topic." });
    const limitedMeta = frameMeta.slice(0, MAX_FRAMES);
    const suppliedFrameIds: string[] = [];
    for (const meta of limitedMeta) {
      const frame = form.get(`frame:${meta.id}`);
      if (!(frame instanceof File) || !frame.type.startsWith("image/")) continue;
      suppliedFrameIds.push(meta.id);
      content.push({
        type: "text",
        text: `Board snapshot ${meta.id}, captured at ${meta.timestampSeconds.toFixed(1)} seconds:`,
      });
      content.push({ type: "file", data: new Uint8Array(await frame.arrayBuffer()), mediaType: frame.type });
    }

    // Strongest model first; a malformed or schema-invalid answer falls through to the next model.
    const result = await withModels("quick", async model => {
      const response = await generateText({
        model,
        system: instructions,
        messages: [{ role: "user", content }],
        // Gemini rejects the nested drawing schema in responseJsonSchema.
        // Request JSON syntax, then enforce the full schema locally before rendering.
        output: Output.json(),
        maxRetries: 0,
        timeout: { totalMs: MODEL_TIMEOUT_MS },
      });
      return lectureSchema.parse(response.output);
    });

    return NextResponse.json({
      document: validateLecture(result.value, sourceDuration, suppliedFrameIds),
      analysis: {
        model: result.model,
        attemptedModels: [...result.attempts.map(attempt => attempt.model), result.model],
        selectedFrames: limitedMeta.length,
        sourceType,
        videoStored: false,
      },
    });
  } catch (error) {
    console.error("Lecture reconstruction failed", error instanceof ModelChainError ? error.attempts : error);
    if (error instanceof ModelChainError) error = error.cause ?? error;
    const message = asErrorMessage(error);
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Gemini returned incomplete drawing or lecture data. The result was rejected rather than shown as reliable notes. Try a shorter clip." }, { status: 502 });
    if (isTransientModelError(error)) {
      const status = statusOf(error);
      return NextResponse.json(
        { error: status === 429 ? "Google reported a rate or quota limit (429). Check your project's limits in AI Studio before retrying."
          : isTimeout(error) ? "The lecture analysis exceeded the time limit. Try a shorter clip; this error does not establish that your free quota is exhausted."
          : "Google's video models are currently unavailable (503). Please retry later." },
        { status: status === 429 ? 429 : 503 },
      );
    }
    const isModelError = message.includes("API key") || message.includes("quota") || message.includes("429");
    return NextResponse.json(
      { error: isModelError ? `Gemini request failed: ${message}` : message },
      { status: 500 },
    );
  }
}
