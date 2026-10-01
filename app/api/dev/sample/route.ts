import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

/** Development only: saves the generated sample lecture into public/demo. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length < 10_000) return Response.json({ error: "Recording is empty" }, { status: 400 });
  const name = new URL(request.url).searchParams.get("name") === "sample-lecture.webm" ? "sample-lecture.webm" : "sample-lecture.mp4";
  const target = path.join(process.cwd(), "public", "demo", name);
  await fs.writeFile(target, bytes);
  return Response.json({ saved: target, bytes: bytes.length });
}
