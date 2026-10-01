import { NextResponse } from "next/server";
import { lectureStore, SAFE_NAME, typeOf, type StoredFile } from "@/lib/store/store";
import type { NotesDoc } from "@/lib/notes/schema";

export const runtime = "nodejs";

const MAX_TOTAL_BYTES = 28 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const doc = JSON.parse(String(form.get("doc") ?? "null")) as NotesDoc | null;
    if (!doc || doc.version !== 2 || !Array.isArray(doc.sections)) return NextResponse.json({ error: "Invalid notes document." }, { status: 400 });
    const files: StoredFile[] = [];
    let total = 0;
    for (const entry of form.getAll("file")) {
      if (!(entry instanceof File) || !SAFE_NAME.test(entry.name)) continue;
      const type = typeOf(entry.name);
      if (!type.startsWith("image/")) continue;
      total += entry.size;
      if (total > MAX_TOTAL_BYTES) return NextResponse.json({ error: "These notes have too many images to save (28 MB limit)." }, { status: 413 });
      files.push({ name: entry.name, type, bytes: new Uint8Array(await entry.arrayBuffer()) });
    }
    const id = await lectureStore().save(doc, files);
    return NextResponse.json({ id, path: `/l/${id}` });
  } catch (error) {
    console.error("[chalkmark] save failed", error);
    return NextResponse.json({ error: "Saving failed. On Google Cloud, check the bucket and Firestore permissions." }, { status: 500 });
  }
}
