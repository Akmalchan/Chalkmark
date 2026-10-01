import { APICallError } from "ai";
import type { ProviderName } from "./models";

/**
 * Minimal generateContent call for features the AI SDK does not expose yet — here, video clipping
 * (`videoMetadata.startOffset/endOffset/fps`) on YouTube inputs. Errors are thrown as APICallError
 * so the shared model-fallback logic treats them like SDK errors.
 */

type Part =
  | { text: string }
  | { fileData: { fileUri: string; mimeType?: string }; videoMetadata?: { startOffset?: string; endOffset?: string; fps?: number } };

export type RestRequest = {
  parts: Part[];
  system?: string;
  schema?: unknown;
  mediaResolution?: "MEDIA_RESOLUTION_LOW" | "MEDIA_RESOLUTION_MEDIUM" | "MEDIA_RESOLUTION_HIGH";
  thinkingLevel?: "low" | "medium" | "high";
  timeoutMs?: number;
};

export type RestResult = { text: string; usage: { inputTokens: number; outputTokens: number } };

let auth: import("google-auth-library").GoogleAuth | null = null;
async function vertexToken(): Promise<string> {
  if (!auth) {
    const { GoogleAuth } = await import("google-auth-library");
    auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  }
  const token = await auth.getAccessToken();
  if (!token) throw new Error("No Google Cloud credentials for Vertex AI");
  return token;
}

export async function generateContentRest(model: string, provider: ProviderName, request: RestRequest): Promise<RestResult> {
  const project = process.env.GOOGLE_VERTEX_PROJECT;
  const location = process.env.GOOGLE_VERTEX_LOCATION || "global";
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  const url = provider === "vertex"
    ? `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (provider === "vertex") headers.authorization = `Bearer ${await vertexToken()}`;
  else headers["x-goog-api-key"] = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "";

  const body = {
    contents: [{ role: "user", parts: request.parts }],
    ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
    generationConfig: {
      ...(request.schema ? { responseMimeType: "application/json", responseJsonSchema: request.schema } : {}),
      ...(request.mediaResolution ? { mediaResolution: request.mediaResolution } : {}),
      ...(request.thinkingLevel ? { thinkingConfig: { thinkingLevel: request.thinkingLevel } } : {}),
    },
  };

  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(request.timeoutMs ?? 120_000) });
  } catch (cause) {
    if (cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError")) throw cause;
    throw new APICallError({ message: `Network error calling Gemini: ${cause instanceof Error ? cause.message : cause}`, url, requestBodyValues: {}, cause, isRetryable: true });
  }
  const text = await response.text();
  if (!response.ok) {
    let message = text.slice(0, 300);
    try { message = JSON.parse(text).error?.message ?? message; } catch { /* keep raw */ }
    throw new APICallError({ message, url, requestBodyValues: {}, statusCode: response.status, responseBody: text.slice(0, 2000), isRetryable: response.status === 429 || response.status >= 500 });
  }
  const payload = JSON.parse(text);
  const parts: Array<{ text?: string; thought?: boolean }> = payload.candidates?.[0]?.content?.parts ?? [];
  const output = parts.filter(part => !part.thought && part.text).map(part => part.text).join("");
  if (!output) throw new Error(`Gemini returned no content (${payload.candidates?.[0]?.finishReason ?? "unknown reason"})`);
  return {
    text: output,
    usage: { inputTokens: payload.usageMetadata?.promptTokenCount ?? 0, outputTokens: payload.usageMetadata?.candidatesTokenCount ?? 0 },
  };
}

export const seconds = (value: number) => `${Math.max(0, Math.round(value * 10) / 10)}s`;
