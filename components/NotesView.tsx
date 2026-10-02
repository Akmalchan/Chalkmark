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
  const [mode, setMode] = useState<"screen" | "pages">("screen");
  const [pdf, setPdf] = useState<{ key: string; url: string; name: string } | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
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
          subject: doc.subject ?? "auto",
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
  const pdfView = view === "sheet" && sheet ? "sheet" : "full";
  const pdfKey = `${pdfView}-${paper}-${sheet ? "s" : "n"}`;

  /** Real US Letter / A4 pages, rendered by the server from the same components (see /api/pdf). */
  const makePdf = async () => {
    if (pdf?.key === pdfKey) return pdf;
    setPdfBusy(true);
    setPdfError("");
    try {
      // Figures and boards live in blob: URLs on this device; the renderer needs them inline.
      const inline: Record<string, string> = {};
      await Promise.all(Object.entries(urls).map(async ([name, url]) => {
        if (!url.startsWith("blob:")) { inline[name] = url; return; }
        const blob = await (await fetch(url)).blob();
        inline[name] = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(blob); });
      }));
      const response = await fetch("/api/pdf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ view: pdfView, paper, doc: current, urls: inline }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "The PDF could not be made.");
      const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "chalkmark.pdf";
      const made = { key: pdfKey, url: URL.createObjectURL(await response.blob()), name };
      if (pdf) URL.revokeObjectURL(pdf.url);
      setPdf(made);
      return made;
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "The PDF could not be made.");
      return null;
    } finally { setPdfBusy(false); }
  };
  const downloadPdf = async () => {
    const made = await makePdf();
    if (!made) return;
    const link = document.createElement("a");
    link.href = made.url; link.download = made.name;
    document.body.append(link); link.click(); link.remove();
  };
  useEffect(() => {
    if (mode === "pages" && pdf?.key !== pdfKey && !pdfBusy) void makePdf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pdfKey]);

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
        <div className="segmented" role="tablist" aria-label="Show as">
          <button className={mode === "screen" ? "active" : ""} onClick={() => setMode("screen")}>Screen</button>
          <button className={mode === "pages" ? "active" : ""} onClick={() => setMode("pages")}>Pages</button>
        </div>
        <button className="pdf-download" disabled={pdfBusy || (view === "sheet" && !sheet)} onClick={() => void downloadPdf()}>
          {pdfBusy ? "Making PDF…" : `Download PDF · ${paper === "A4" ? "A4" : "US Letter"}`}
        </button>
      </div>
      {pdfError && <p className="pdf-error no-print">{pdfError}</p>}
      {banner}
      {mode === "pages" ? (
        <div className="pdf-pages no-print">
          {pdf?.key === pdfKey
            ? <iframe src={`${pdf.url}#view=FitH&toolbar=1`} title={`${doc.title} — ${paper} pages`} />
            : <div className="sheet-pending"><span className="spinner" /><p>Laying out {paper === "A4" ? "A4" : "US Letter"} pages…</p></div>}
        </div>
      ) : view === "full" ? <NotesPaper doc={doc} urls={urls} /> : sheet ? (
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
