"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A replay of a real `chalkmark scan` run (MIT 18.06SC recitation, 16 min): the command types itself,
 * the board engine's scan bar fills, then the notes come out. Starts when scrolled into view, loops.
 */
type Line =
  | { kind: "cmd"; text: string }
  | { kind: "out"; text: string; tone?: "lime" | "dim" | "coral" | "bold" }
  | { kind: "scan" }
  | { kind: "count"; label: string; total: number };

const SCRIPT: Line[] = [
  { kind: "cmd", text: "chalkmark scan linear-algebra.mp4" },
  { kind: "out", text: "▟█ chalkmark · the board forgets, your notes don't", tone: "bold" },
  { kind: "out", text: "› scanning linear-algebra.mp4 · 17 min · 640×360 · on this machine", tone: "lime" },
  { kind: "scan" },
  { kind: "out", text: "› 1200 frames in 10.3 s → 22 snapshots → 10 boards worth reading", tone: "lime" },
  { kind: "out", text: "› sending 10 board images (813 KB — not the video)", tone: "lime" },
  { kind: "count", label: "reading boards with Gemini", total: 10 },
  { kind: "out", text: "  writing your notes · condensing a study sheet", tone: "dim" },
  { kind: "out", text: "" },
  { kind: "out", text: "Geometry of Linear Algebra: Row and Column Pictures", tone: "bold" },
  { kind: "out", text: "  1 Solving the System and the Row Picture · 12 blocks" },
  { kind: "out", text: "  2 The Column Picture · 6 blocks" },
  { kind: "out", text: "  3 Matrix Form and the Inverse Matrix · 6 blocks" },
  { kind: "out", text: "" },
  { kind: "out", text: "✓ chalkmark-notes/geometry-of-linear-algebra", tone: "lime" },
  { kind: "out", text: "  notes.md · study-sheet.md · boards/ (20) · notes.json", tone: "dim" },
];

const BAR = 24;

export function TerminalDemo() {
  const root = useRef<HTMLDivElement>(null);
  const [line, setLine] = useState(0);      // lines fully shown
  const [chars, setChars] = useState(0);    // typed characters of the current command
  const [progress, setProgress] = useState(0); // 0..1 of the current scan/count line
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setLine(SCRIPT.length); return; }
    const observer = new IntersectionObserver(entries => setVisible(entries.some(e => e.isIntersecting)), { threshold: 0.35 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (line >= SCRIPT.length) {
      const restart = window.setTimeout(() => { setLine(0); setChars(0); setProgress(0); }, 4200);
      return () => window.clearTimeout(restart);
    }
    const current = SCRIPT[line];
    let timer: number;
    if (current.kind === "cmd") {
      timer = chars < current.text.length
        ? window.setTimeout(() => setChars(c => c + 1), 38 + Math.random() * 40)
        : window.setTimeout(() => { setLine(l => l + 1); setChars(0); }, 420);
    } else if (current.kind === "scan" || current.kind === "count") {
      const steps = current.kind === "scan" ? 48 : current.total;
      timer = progress < 1
        ? window.setTimeout(() => setProgress(p => Math.min(1, p + 1 / steps)), current.kind === "scan" ? 45 : 230)
        : window.setTimeout(() => { setLine(l => l + 1); setProgress(0); }, 250);
    } else {
      timer = window.setTimeout(() => setLine(l => l + 1), current.text ? 140 : 60);
    }
    return () => window.clearTimeout(timer);
  }, [visible, line, chars, progress]);

  const render = (entry: Line, index: number, live: boolean) => {
    if (entry.kind === "cmd") {
      const text = live ? entry.text.slice(0, chars) : entry.text;
      return <div key={index} className="term-line"><span className="term-prompt">~/lectures $</span> {text}{live && <span className="term-caret" />}</div>;
    }
    if (entry.kind === "scan") {
      const p = live ? progress : 1;
      const t = Math.round(p * 995), filled = Math.round(p * BAR);
      return <div key={index} className="term-line"><span className="term-lime">{"█".repeat(filled)}</span><span className="term-dim">{"░".repeat(BAR - filled)}</span> <span className="term-dim">{Math.floor(t / 60)}:{String(t % 60).padStart(2, "0")} · {Math.round(p * 1200)} frames · {Math.round(p * 22)} boards saved</span></div>;
    }
    if (entry.kind === "count") {
      const n = live ? Math.round(progress * entry.total) : entry.total;
      return <div key={index} className="term-line term-dim">  {entry.label} · {n}/{entry.total}</div>;
    }
    return <div key={index} className={`term-line ${entry.tone ? `term-${entry.tone}` : ""}`}>{entry.text || " "}</div>;
  };

  return (
    <div className="terminal" ref={root} aria-label="A replay of the chalkmark command-line tool scanning a lecture">
      <div className="terminal-bar"><i /><i /><i /><span>chalkmark — zsh</span></div>
      <div className="terminal-body">
        {SCRIPT.slice(0, line).map((entry, i) => render(entry, i, false))}
        {line < SCRIPT.length && render(SCRIPT[line], line, true)}
      </div>
    </div>
  );
}
