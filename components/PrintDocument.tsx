"use client";

import { useEffect, useState } from "react";
import { NotesPaper } from "@/components/NotesPaper";
import { PagedSheet } from "@/components/PagedSheet";
import type { NotesDoc } from "@/lib/notes/schema";

type Payload = { view: "sheet" | "full"; paper: "Letter" | "A4"; doc: NotesDoc; urls: Record<string, string> };

/**
 * What the PDF renderer prints: the notes injected by headless Chrome (window.__CHALKMARK_PRINT__),
 * rendered with the same components as the app. Signals __printReady once every figure has loaded.
 */
export function PrintDocument() {
  const [payload, setPayload] = useState<Payload | null>(null);

  useEffect(() => {
    const data = (window as unknown as { __CHALKMARK_PRINT__?: Payload }).__CHALKMARK_PRINT__;
    if (data?.doc) {
      document.title = `${data.doc.title}${data.view === "sheet" ? " — study sheet" : " — notes"} · Chalkmark`;
      setPayload(data);
    }
  }, []);

  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    void (async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      // The study sheet lays itself out on pages after measuring: wait for those pages.
      for (let i = 0; i < 100 && payload.view === "sheet" && !document.querySelector(".paged-page"); i += 1) await new Promise(resolve => setTimeout(resolve, 100));
      await new Promise(resolve => setTimeout(resolve, 150));
      await Promise.all([...document.images].map(image => image.complete ? Promise.resolve() : image.decode().catch(() => {})));
      await document.fonts.ready;
      if (!cancelled) (window as unknown as { __printReady?: boolean }).__printReady = true;
    })();
    return () => { cancelled = true; };
  }, [payload]);

  if (!payload) return <main className="print-root print-empty">Open a lecture in Chalkmark and use “Download PDF”.</main>;
  const { view, paper, doc, urls } = payload;
  return (
    <main className={`print-root print-${view} paper-${paper.toLowerCase()}`}>
      {view === "sheet" && doc.sheet
        ? <><style>{`@page { size: ${paper === "A4" ? "A4" : "letter"}; margin: 0; }`}</style><PagedSheet doc={doc} sheet={doc.sheet} urls={urls} paper={paper} /></>
        : <NotesPaper doc={doc} urls={urls} />}
    </main>
  );
}
