import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { NotesDoc } from "../notes/schema";

/**
 * Saved lectures. On Google Cloud: the notes document lives in Firestore and the board images
 * (never video) in a Cloud Storage bucket. Locally: a .data folder, so everything works offline.
 */

export type StoredFile = { name: string; type: string; bytes: Uint8Array };

export interface LectureStore {
  readonly kind: "gcp" | "local";
  save(doc: NotesDoc, files: StoredFile[]): Promise<string>;
  load(id: string): Promise<NotesDoc | null>;
  file(id: string, name: string): Promise<{ bytes: Uint8Array; type: string } | null>;
}

export const SAFE_NAME = /^[\w.-]{1,120}$/;
export const SAFE_ID = /^[a-z0-9]{6,32}$/;
const newId = () => randomUUID().replace(/-/g, "").slice(0, 12);

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", json: "application/json" };
const typeOf = (name: string) => TYPES[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

class LocalStore implements LectureStore {
  readonly kind = "local" as const;
  private root = path.join(process.cwd(), ".data", "lectures");

  async save(doc: NotesDoc, files: StoredFile[]) {
    const id = newId();
    const dir = path.join(this.root, id);
    await fs.mkdir(path.join(dir, "files"), { recursive: true });
    await fs.writeFile(path.join(dir, "doc.json"), JSON.stringify({ ...doc, id }));
    await Promise.all(files.map(file => fs.writeFile(path.join(dir, "files", file.name), file.bytes)));
    return id;
  }

  async load(id: string) {
    try { return JSON.parse(await fs.readFile(path.join(this.root, id, "doc.json"), "utf8")) as NotesDoc; }
    catch { return null; }
  }

  async file(id: string, name: string) {
    try { return { bytes: new Uint8Array(await fs.readFile(path.join(this.root, id, "files", name))), type: typeOf(name) }; }
    catch { return null; }
  }
}

class GcpStore implements LectureStore {
  readonly kind = "gcp" as const;
  private clients: Promise<{ db: import("@google-cloud/firestore").Firestore; bucket: import("@google-cloud/storage").Bucket }> | null = null;

  private connect() {
    this.clients ??= (async () => {
      const [{ Firestore }, { Storage }] = await Promise.all([import("@google-cloud/firestore"), import("@google-cloud/storage")]);
      const db = new Firestore({ projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_VERTEX_PROJECT, databaseId: process.env.FIRESTORE_DATABASE || "(default)", ignoreUndefinedProperties: true });
      const bucket = new Storage().bucket(process.env.GCS_BUCKET!);
      return { db, bucket };
    })();
    return this.clients;
  }

  async save(doc: NotesDoc, files: StoredFile[]) {
    const { db, bucket } = await this.connect();
    const id = newId();
    await Promise.all(files.map(file => bucket.file(`lectures/${id}/${file.name}`).save(Buffer.from(file.bytes), { contentType: file.type, resumable: false, metadata: { cacheControl: "public, max-age=31536000, immutable" } })));
    await db.collection("lectures").doc(id).set({
      title: doc.title, course: doc.course, createdAt: doc.createdAt,
      files: files.map(file => file.name),
      // Stored as a JSON string: Firestore rejects nested arrays (table rows) as field values.
      doc: JSON.stringify({ ...doc, id }),
    });
    return id;
  }

  async load(id: string) {
    const { db } = await this.connect();
    const snapshot = await db.collection("lectures").doc(id).get();
    const data = snapshot.data();
    return data?.doc ? (JSON.parse(data.doc) as NotesDoc) : null;
  }

  async file(id: string, name: string) {
    const { bucket } = await this.connect();
    const file = bucket.file(`lectures/${id}/${name}`);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [bytes] = await file.download();
    return { bytes: new Uint8Array(bytes), type: typeOf(name) };
  }
}

let store: LectureStore | null = null;
export function lectureStore(): LectureStore {
  store ??= process.env.GCS_BUCKET ? new GcpStore() : new LocalStore();
  return store;
}

export { typeOf };
