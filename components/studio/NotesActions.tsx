"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useState } from "react";
import { notesToMarkdown, slugify } from "@/lib/notes/export";
import type { NotesDoc } from "@/lib/notes/schema";

type Props = {
  doc: NotesDoc;
  files?: Map<string, Blob>;
  urls: Record<string, string>;
  onRestart?: () => void;
  sharedUrl?: string;
  /** Override what "Markdown" exports (e.g. the study sheet). */
  markdown?: () => string;
};

export function NotesActions({ doc, files, urls, onRestart, sharedUrl, markdown: customMarkdown }: Props) {
  const [share, setShare] = useState<{ url: string; qr: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const download = (blob: Blob, name: string) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  const exportMarkdown = () => {
    const markdown = customMarkdown?.() ?? notesToMarkdown(doc, name => urls[name]?.startsWith("blob:") ? `figures/${name}` : urls[name] ?? name);
    download(new Blob([markdown], { type: "text/markdown" }), `${slugify(doc.title)}.md`);
  };

  const showShare = async (url: string) => {
    setShare({ url, qr: await QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: "#16221e", light: "#fffdf8" } }) });
  };

  const save = async () => {
    if (sharedUrl) return showShare(sharedUrl);
    if (!files) return;
    setSaving(true); setError("");
    try {
      const form = new FormData();
      form.append("doc", JSON.stringify(doc));
      const referenced = new Set<string>([
        ...doc.boards.flatMap(board => [board.paper, board.raw]),
        ...doc.sections.flatMap(section => section.blocks.map(block => block.figure).filter((name): name is string => Boolean(name))),
      ]);
      for (const name of referenced) { const blob = files.get(name); if (blob) form.append("file", blob, name); }
      const response = await fetch("/api/lectures", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Saving failed");
      await showShare(new URL(payload.path, window.location.origin).toString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Saving failed");
    } finally { setSaving(false); }
  };

  return (
    <>
      <header className="notes-actions no-print app-chrome">
        <Link className="wordmark" href="/"><span>CM</span> CHALKMARK</Link>
        <div className="notes-actions-buttons">
          {error && <span className="action-error">{error}</span>}
          <button className="ghost" onClick={exportMarkdown}>Markdown</button>
          <button className="ghost" onClick={() => window.print()}>Print / PDF</button>
          <button className="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : sharedUrl ? "Share" : "Save & share"}</button>
          {onRestart && <button className="ghost" onClick={onRestart}>New capture</button>}
        </div>
      </header>
      {share && (
        <div className="share-overlay no-print" role="dialog" aria-label="Share these notes" onClick={() => setShare(null)}>
          <div className="share-card" onClick={event => event.stopPropagation()}>
            <img src={share.qr} alt="QR code linking to these notes" width={240} height={240} />
            <strong>Scan to open these notes</strong>
            <a href={share.url} target="_blank" rel="noreferrer">{share.url}</a>
            <div className="share-buttons">
              <button className="ghost" onClick={() => navigator.clipboard?.writeText(share.url)}>Copy link</button>
              <button className="primary" onClick={() => setShare(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
