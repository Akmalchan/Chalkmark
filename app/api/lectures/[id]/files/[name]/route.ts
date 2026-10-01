import { lectureStore, SAFE_ID, SAFE_NAME } from "@/lib/store/store";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; name: string }> }) {
  const { id, name } = await params;
  if (!SAFE_ID.test(id) || !SAFE_NAME.test(name)) return new Response("Not found", { status: 404 });
  const file = await lectureStore().file(id, name);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(file.bytes), {
    headers: { "content-type": file.type, "cache-control": "public, max-age=31536000, immutable" },
  });
}
