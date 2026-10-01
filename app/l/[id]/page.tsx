import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SharedNotes } from "@/components/SharedNotes";
import { lectureStore, SAFE_ID } from "@/lib/store/store";

type Params = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!SAFE_ID.test(id)) return null;
  return lectureStore().load(id);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const doc = await load((await params).id);
  return doc ? { title: `${doc.title} · Chalkmark notes`, description: doc.summary } : { title: "Notes not found · Chalkmark" };
}

export default async function SharedLecture({ params }: Params) {
  const { id } = await params;
  const doc = await load(id);
  if (!doc) notFound();
  const names = [...doc.boards.flatMap(board => [board.paper, board.raw]), ...doc.sections.flatMap(section => section.blocks.map(block => block.figure).filter((name): name is string => Boolean(name)))];
  const urls = Object.fromEntries(names.map(name => [name, `/api/lectures/${id}/files/${encodeURIComponent(name)}`]));
  const host = (await headers()).get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  return <SharedNotes doc={doc} urls={urls} shareUrl={host ? `${protocol}://${host}/l/${id}` : `/l/${id}`} />;
}
