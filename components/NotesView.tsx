"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { NotesPaper } from "@/components/NotesPaper";
import { StudySheet } from "@/components/StudySheet";
import { NotesActions } from "@/components/studio/NotesActions";
import { transcriptText } from "@/lib/notes/assemble";
import { sheetToMarkdown } from "@/lib/notes/export";
import type { NotesDoc } from "@/lib/notes/schema";
import type { StudySheet as Sheet } from "@/lib/notes/sheet";

type Props = {
  doc: NotesDoc;
  urls: Record<string, string>;
  files?: Map<string, Blob>;
  sharedUrl?: string;
  onRestart?: () => void;
  banner?: ReactNode;
};

type PaperSize = "A4" | "Letter";

/** Notes screen: the 1–2 page study sheet by default, the full notes one click away, A4 or Letter print. */
export function NotesView({ doc, urls, files, sharedUrl, onRestart, banner }: Props) {
  const [view, setView] = useState<"sheet" | "full">("sheet");
  const [sheet, setSheet] = useState<Sheet | undefined>(doc.sheet);
  const [sheetError, setSheetError] = useState("");
  const [paper, setPaper] = useState<PaperSize>("Letter");
  const started = useRef(false);

  useEffect(() => {
    try { const saved = localStorage.getItem("chalkmark-paper"); if (saved === "A4" || saved === "Letter") setPaper(saved); } catch { /* storage unavailable */ }
  }, []);
  const choosePaper = (size: PaperSize) => { setPaper(size); try { localStorage.setItem("chalkmark-paper", size); } catch { /* ignore */ } };

  const generate = async () => {
    setSheetError("");
    try {
      const response = await fetch("/api/sheet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: doc.title, course: doc.course, summary: doc.summary,
          sections: doc.sections.map(section => ({
            title: section.title, explanation: section.explanation, takeaways: section.takeaways,
            blocks: section.blocks.map(({ id, kind, content, detail }) => ({ id, kind, content, detail })),
          })),
          transcript: transcriptText(doc.transcript, -Infinity, Infinity, 30_000),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The study sheet could not be written.");
      setSheet(payload.sheet);
    } catch (error) {
      setSheetError(error instanceof Error ? error.message : "The study sheet could not be written.");
    }
  };

  useEffect(() => {
    if (sheet || started.current || !doc.sections.length) return;
    started.current = true;
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = sheet ? { ...doc, sheet } : doc;
  return (
    <main className="studio-done">
      <style>{`@page { size: ${paper === "A4" ? "A4" : "letter"}; margin: 12mm 13mm; }`}</style>
      <NotesActions doc={current} files={files} urls={urls} sharedUrl={sharedUrl} onRestart={onRestart}
        markdown={view === "sheet" && sheet ? () => sheetToMarkdown(current, sheet) : undefined} />
      <div className="view-bar no-print">
        <div className="segmented" role="tablist" aria-label="Notes view">
          <button className={view === "sheet" ? "active" : ""} onClick={() => setView("sheet")}>Study sheet · 1–2 pages</button>
          <button className={view === "full" ? "active" : ""} onClick={() => setView("full")}>Full notes</button>
        </div>
        <div className="segmented" role="tablist" aria-label="Paper size">
          <button className={paper === "Letter" ? "active" : ""} onClick={() => choosePaper("Letter")}>US Letter</button>
          <button className={paper === "A4" ? "active" : ""} onClick={() => choosePaper("A4")}>A4</button>
        </div>
      </div>
      {banner}
      {view === "full" ? <NotesPaper doc={doc} urls={urls} /> : sheet ? (
        <div className={`sheet-page paper-${paper.toLowerCase()}`}><StudySheet doc={doc} sheet={sheet} urls={urls} /></div>
      ) : (
        <div className="sheet-pending no-print">
          {sheetError
            ? <><p>{sheetError}</p><button className="primary" onClick={() => void generate()}>Try again</button><button className="ghost" onClick={() => setView("full")}>Open full notes</button></>
            : <><span className="spinner" /><p>Condensing the lecture into a 1–2 page study sheet…</p></>}
        </div>
      )}
    </main>
  );
}
