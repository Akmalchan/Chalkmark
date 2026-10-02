"use client";

import { NotesView } from "@/components/NotesView";
import type { NotesDoc } from "@/lib/notes/schema";

export function SharedNotes({ doc, urls, shareUrl }: { doc: NotesDoc; urls: Record<string, string>; shareUrl: string }) {
  return <NotesView doc={doc} urls={urls} sharedUrl={shareUrl} />;
}
