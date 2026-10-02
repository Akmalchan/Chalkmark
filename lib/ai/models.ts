import { google } from "@ai-sdk/google";
import { createVertex } from "@ai-sdk/google-vertex";
import { APICallError, NoObjectGeneratedError, NoOutputGeneratedError, RetryError, type LanguageModel } from "ai";
import { z } from "zod";

/**
 * Gemini access for every Chalkmark task.
 *
 * On Google Cloud (GOOGLE_VERTEX_PROJECT set) calls go through Vertex AI, billed to the project and
 * authenticated by the Cloud Run service account; locally they fall back to a Google AI Studio key.
 * Each task tries the strongest model first and falls through on capacity, timeout or
 * malformed-output failures, never on auth errors.
 */

export type Task = "read" | "transcribe" | "compose" | "quick" | "caption";
export type ProviderName = "vertex" | "google";

const STRONG = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash"];
const LIGHT = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

// Strongest first; lite models are a last resort so a busy or rate-limited model never ends a demo.
const TASK_MODELS: Record<Task, string[]> = {
  read: [...STRONG, ...LIGHT],
  transcribe: [...STRONG, ...LIGHT],
  compose: [...STRONG, ...LIGHT],
  quick: [...STRONG, ...LIGHT],
  // Optional open-weights path (Gemma via the Gemini API) for cheap live captions.
  caption: [process.env.GEMMA_MODEL?.trim() || "gemma-4-26b-a4b-it", "gemma-4-31b-it", ...LIGHT],
};

export function providerName(): ProviderName {
  return process.env.GOOGLE_VERTEX_PROJECT ? "vertex" : "google";
}

export function aiConfigured(): boolean {
  return Boolean(process.env.GOOGLE_VERTEX_PROJECT || process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

let vertex: ReturnType<typeof createVertex> | null = null;
function languageModel(id: string, provider: ProviderName): LanguageModel {
  if (provider === "google") return google(id);
  vertex ??= createVertex({
    project: process.env.GOOGLE_VERTEX_PROJECT,
    location: process.env.GOOGLE_VERTEX_LOCATION || "global",
  });
  return vertex(id);
}

export function candidates(task: Task): Array<{ id: string; provider: ProviderName }> {
  // Gemma 4 is served by the Gemini API (AI Studio key), so captions use it whenever a key exists,
  // even on Vertex deployments.
  if (task === "caption" && process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return [...new Set(TASK_MODELS.caption)].map(id => ({ id, provider: "google" as const }));
  }
  const provider = providerName();
  const override = process.env.GEMINI_MODEL?.trim();
  const ids = task === "caption" ? TASK_MODELS.caption : [override, ...TASK_MODELS[task]];
  return [...new Set(ids.filter((id): id is string => Boolean(id)))]
    // Gemma is served through the Gemini API, not Vertex's publisher models.
    .filter(id => provider === "google" || !id.startsWith("gemma"))
    .map(id => ({ id, provider }));
}

export function statusOf(error: unknown): number | undefined {
  if (APICallError.isInstance(error)) return error.statusCode;
  if (RetryError.isInstance(error) && APICallError.isInstance(error.lastError)) return error.lastError.statusCode;
  return undefined;
}

export function isTimeout(error: unknown) {
  return (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) ||
    (RetryError.isInstance(error) && error.reason === "abort");
}

function worthAnotherModel(error: unknown): boolean {
  const status = statusOf(error);
  if (status === 401 || status === 403) return false;
  return isTimeout(error) || status === 404 || status === 408 || status === 429 || (status !== undefined && status >= 500) ||
    NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error) || error instanceof z.ZodError ||
    // Model-specific 400s (an option one model rejects) are worth trying on the next model.
    (error instanceof Error && /schema|json|parse|validation|not supported|unsupported/i.test(error.message));
}

export type Attempted = { model: string; provider: ProviderName; status?: number; error?: string };
export type Usage = { inputTokens: number; outputTokens: number };

export class ModelChainError extends Error {
  constructor(message: string, readonly attempts: Attempted[], readonly cause: unknown) { super(message); }
}

/**
 * Models that just returned 429 (quota) or 503 (overloaded) are skipped for a short while, so the
 * next board read goes straight to a model that is answering instead of waiting on retries.
 */
const cooldownUntil = new Map<string, number>();
function coolDown(id: string, error: unknown) {
  const status = statusOf(error);
  // A spent daily quota will not come back in a minute: skip that model for a good while.
  const quota = status === 429 && error instanceof Error && /quota/i.test(error.message);
  const seconds = quota ? 15 * 60 : status === 429 ? 90 : status === 503 || status === 500 ? 25 : 0;
  if (seconds) cooldownUntil.set(id, Date.now() + seconds * 1000);
}

export async function withModels<T>(
  task: Task,
  run: (model: LanguageModel, meta: { id: string; provider: ProviderName }) => Promise<T>,
): Promise<{ value: T; model: string; provider: ProviderName; attempts: Attempted[] }> {
  if (!aiConfigured()) throw new ModelChainError("Gemini is not configured. Set GOOGLE_GENERATIVE_AI_API_KEY (local) or GOOGLE_VERTEX_PROJECT (Google Cloud).", [], null);
  const all = candidates(task);
  const available = all.filter(candidate => (cooldownUntil.get(candidate.id) ?? 0) <= Date.now());
  // If everything is cooling down, try them all anyway rather than failing outright.
  const list = available.length ? available : all;
  const attempts: Attempted[] = [];
  let lastError: unknown;
  for (const candidate of list) {
    try {
      const value = await run(languageModel(candidate.id, candidate.provider), candidate);
      return { value, model: candidate.id, provider: candidate.provider, attempts };
    } catch (error) {
      lastError = error;
      coolDown(candidate.id, error);
      attempts.push({ model: candidate.id, provider: candidate.provider, status: statusOf(error), error: error instanceof Error ? error.message.slice(0, 200) : String(error) });
      console.warn(`[chalkmark] ${task} failed on ${candidate.id}`, statusOf(error) ?? "", error instanceof Error ? error.message.slice(0, 160) : "");
      if (!worthAnotherModel(error)) break;
    }
  }
  throw new ModelChainError(describeFailure(lastError), attempts, lastError);
}

export function describeFailure(error: unknown): string {
  const status = statusOf(error);
  if (status === 429) return "Google reported a rate or quota limit (429). Wait a minute or switch to the hackathon's Vertex AI project.";
  if (status === 401 || status === 403) return "Gemini rejected the credentials. Check the API key or the Cloud Run service account's Vertex AI permission.";
  if (isTimeout(error)) return "Gemini took too long. Try again; shorter clips finish faster.";
  if (status !== undefined && status >= 500) return "Gemini is temporarily unavailable. Please retry.";
  if (error instanceof Error) return error.message;
  return "Gemini could not complete the request.";
}

export const providerOptions = (provider: ProviderName, options: Record<string, unknown>) =>
  ({ [provider]: options }) as Record<string, Record<string, never>>;

export const usageOf = (usage: { inputTokens: number | undefined; outputTokens: number | undefined } | undefined): Usage => ({
  inputTokens: usage?.inputTokens ?? 0,
  outputTokens: usage?.outputTokens ?? 0,
});
