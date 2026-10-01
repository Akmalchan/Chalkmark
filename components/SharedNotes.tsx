"use client";

import { NotesPaper } from "@/components/NotesPaper";
import { NotesActions } from "@/components/studio/NotesActions";
import type { NotesDoc } from "@/lib/notes/schema";

export function SharedNotes({ doc, urls, shareUrl }: { doc: NotesDoc; urls: Record<string, string>; shareUrl: string }) {
  return (
    <main className="studio-done">
      <NotesActions doc={doc} urls={urls} sharedUrl={shareUrl} />
      <NotesPaper doc={doc} urls={urls} />
    </main>
  );
}
