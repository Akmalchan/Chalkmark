"use client";

import { useState } from "react";
import { LectureVisual } from "@/app/lecture-visual";
import { Equation, MarkdownLite, MathText } from "@/components/math";
import { FigureRedraw } from "@/components/FigureRedraw";
import { formatClock } from "@/lib/notes/assemble";
import type { NoteBlock, NotesDoc } from "@/lib/notes/schema";

type Props = {
  doc: NotesDoc;
  /** file name → URL (object URLs while capturing, API URLs when shared). */
  urls: Record<string, string>;
};

const KIND_LABEL: Record<string, string> = { graph: "Graph", diagram: "Diagram", drawing: "Drawing", table: "Table" };

export function NotesPaper({ doc, urls }: Props) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [boardView, setBoardView] = useState<Record<string, "paper" | "raw">>({});
  const created = new Date(doc.createdAt);
  const savings = doc.stats.videoTokensEstimate > 0 && doc.stats.inputTokens > 0
    ? doc.stats.videoTokensEstimate / doc.stats.inputTokens : null;
  const approx = doc.timing === "estimated" ? "≈" : "";
  const youtube = doc.source?.kind === "youtube" ? doc.source.videoId : null;

  return (
    <article className="paper">
      <header className="paper-header">
        <div className="paper-kicker"><span>{doc.course}</span><span>{created.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>{doc.stats.durationSeconds > 0 && <span>{formatClock(doc.stats.durationSeconds)}</span>}</div>
        <h1>{doc.title}</h1>
        {doc.summary && <p className="paper-summary"><MathText text={doc.summary} /></p>}
      </header>

      {youtube ? (
        <div className="paper-ledger no-print" aria-label="How these notes were made">
          <div><strong>{doc.stats.boards}</strong><span>board moments found by a low-res scan</span></div>
          <div><strong>{doc.stats.blocks}</strong><span>items read at high resolution</span></div>
          <div><strong>{doc.stats.durationSeconds ? formatClock(doc.stats.durationSeconds) : "—"}</strong><span>lecture length</span></div>
          <div><strong>{doc.stats.inputTokens ? `${(doc.stats.inputTokens / 1000).toFixed(1)}k` : "—"}</strong><span>Gemini input tokens used</span></div>
          <div className="ledger-zero"><strong>0 MB</strong><span>downloaded · read from YouTube</span></div>
        </div>
      ) : (
        <div className="paper-ledger no-print" aria-label="How these notes were made">
          <div><strong>{doc.stats.boards}</strong><span>board states kept</span></div>
          <div><strong>{doc.stats.blocks}</strong><span>items read from the board</span></div>
          <div><strong>{doc.stats.framesAnalyzed}</strong><span>frames analysed on-device</span></div>
          <div><strong>{doc.stats.inputTokens ? `${(doc.stats.inputTokens / 1000).toFixed(1)}k` : "—"}</strong><span>{savings && savings >= 1.5 ? `Gemini tokens · ${savings.toFixed(savings < 10 ? 1 : 0)}× fewer than sending the video` : "Gemini input tokens used"}</span></div>
          <div className="ledger-zero"><strong>0 MB</strong><span>video uploaded</span></div>
        </div>
      )}

      {doc.warnings.length > 0 && <aside className="paper-warnings no-print">{doc.warnings.map((warning, i) => <p key={i}>{warning}</p>)}</aside>}

      {doc.sections.map((section, index) => (
        <section className="paper-section" key={index}>
          <div className="paper-section-head">
            <span className="paper-section-number">{String(index + 1).padStart(2, "0")}</span>
            <h2><MathText text={section.title} /></h2>
            {section.start !== null && <time>{youtube ? "around" : "written"} {approx}{formatClock(section.start)}{section.end !== null && section.end - section.start >= 5 ? `–${approx}${formatClock(section.end)}` : ""}</time>}
          </div>
          {section.explanation.length > 0 && <div className="paper-explanation">{section.explanation.map((paragraph, i) => <p key={i}><MathText text={paragraph} /></p>)}</div>}
          <div className="paper-blocks">{section.blocks.map(block => <Block key={block.id} block={block} urls={urls} approx={approx} youtube={youtube} />)}</div>
          {section.takeaways.length > 0 && (
            <aside className="paper-takeaways"><span>Remember</span><ul>{section.takeaways.map((item, i) => <li key={i}><MathText text={item} /></li>)}</ul></aside>
          )}
        </section>
      ))}

      {doc.boards.length > 0 && (
        <section className="paper-appendix">
          <h3>Board pages <small>every state the board reached before it was erased or left the frame</small></h3>
          <div className="board-pages">
            {doc.boards.map(board => {
              const view = boardView[board.id] ?? "paper";
              return (
                <figure key={board.id}>
                  <img src={urls[view === "paper" ? board.paper : board.raw]} alt={`Board as it was at ${formatClock(board.t)}`} width={board.width} height={board.height} />
                  <figcaption>
                    <span>{board.caption ? `${board.caption} · ` : ""}{board.reason === "erase" ? "saved before erase" : board.reason === "view" ? "saved before the camera moved" : board.reason === "manual" ? "captured" : "final board"} · {formatClock(board.t)}</span>
                    <button className="no-print" onClick={() => setBoardView(state => ({ ...state, [board.id]: view === "paper" ? "raw" : "paper" }))}>{view === "paper" ? "Show photo" : "Show clean"}</button>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </section>
      )}

      {doc.transcript.length > 0 && (
        <section className="paper-appendix">
          <h3>
            Speech <small>{doc.transcriptKind === "summary" ? "what was explained while each board was built (summarised)" : "timestamped transcript of what was said"}</small>
            <button className="no-print" onClick={() => setTranscriptOpen(open => !open)}>{transcriptOpen ? "Hide" : `Show ${doc.transcript.length} lines`}</button>
          </h3>
          {transcriptOpen && <div className="paper-transcript">{doc.transcript.map((segment, i) => <p key={i}><time>{formatClock(segment.start)}</time><MathText text={segment.text} /></p>)}</div>}
        </section>
      )}

      <footer className="paper-footer">Reconstructed by Chalkmark from the board itself. Figures are the lecturer&apos;s own ink, cleaned; text and math were read by Gemini — check anything marked [?].</footer>
    </article>
  );
}

function Block({ block, urls, approx, youtube }: { block: NoteBlock; urls: Record<string, string>; approx: string; youtube: string | null }) {
  const uncertain = block.legibility !== "clear";
  if (block.kind === "heading") return <h3 className="paper-heading"><MathText text={block.content} /></h3>;
  if (block.kind === "equation") {
    return <div className={`paper-equation ${uncertain ? "uncertain" : ""}`}><Equation latex={block.content} meaning={block.detail || undefined} /></div>;
  }
  if (block.kind === "table" && block.table) {
    return (
      <figure className="paper-table">
        {block.content && <figcaption><MathText text={block.content} /></figcaption>}
        <table>
          <thead><tr>{block.table.columns.map((column, i) => <th key={i}><MathText text={column} /></th>)}</tr></thead>
          <tbody>{block.table.rows.map((row, r) => <tr key={r}>{block.table!.columns.map((_, c) => <td key={c}><MathText text={row[c] ?? ""} /></td>)}</tr>)}</tbody>
        </table>
      </figure>
    );
  }
  if (block.redraw && (block.kind === "graph" || block.kind === "diagram" || block.kind === "drawing")) {
    return <RedrawnFigure block={block} original={block.figure ? urls[block.figure] : undefined} approx={approx} youtube={youtube} />;
  }
  if (block.figure && urls[block.figure]) {
    return (
      <figure className={`paper-figure kind-${block.kind}`}>
        <div className="paper-figure-art">
          <img src={urls[block.figure]} alt={block.detail || block.content} />
          {block.graph && <div className="paper-redraw"><LectureVisual visual={{ kind: "coordinate_graph", title: "Clean redraw", description: block.content, panels: [block.graph], table: null, sourceTimestampSeconds: null, fidelity: "qualitative", uncertainty: null, nodes: [], edges: [] }} /></div>}
        </div>
        <figcaption>
          <span className="paper-figure-kind">{KIND_LABEL[block.kind] ?? "From the board"}{block.writtenAt !== null && ` · ${approx}${formatClock(block.writtenAt)}`}</span>
          <strong><MathText text={block.content} /></strong>
          {block.detail && block.kind !== "text" && <span className="paper-figure-detail"><MathText text={block.detail} /></span>}
          {block.kind === "text" && <span className="paper-figure-detail">Handwriting was hard to read, so the original ink is shown.</span>}
        </figcaption>
      </figure>
    );
  }
  if (block.kind === "graph" || block.kind === "diagram" || block.kind === "drawing") {
    // No pixels to crop (YouTube mode): describe the figure and link to the moment it is on screen.
    return (
      <figure className="paper-figure described">
        <figcaption>
          <span className="paper-figure-kind">{KIND_LABEL[block.kind]}{block.writtenAt !== null && ` · ${approx}${formatClock(block.writtenAt)}`}</span>
          <strong><MathText text={block.content} /></strong>
          {block.detail && <span className="paper-figure-detail"><MathText text={block.detail} /></span>}
          {youtube && block.writtenAt !== null && <a className="watch-link no-print" href={`https://www.youtube.com/watch?v=${youtube}&t=${Math.max(0, Math.round(block.writtenAt) - 3)}s`} target="_blank" rel="noreferrer">Watch it on the board ↗</a>}
        </figcaption>
      </figure>
    );
  }
  return <div className={`paper-text ${uncertain ? "uncertain" : ""}`}><MarkdownLite text={block.content} /></div>;
}

function RedrawnFigure({ block, original, approx, youtube }: { block: NoteBlock; original?: string; approx: string; youtube: string | null }) {
  const spec = block.redraw!;
  const [showInk, setShowInk] = useState(spec.confidence === "low");
  return (
    <figure className={`paper-figure redrawn kind-${block.kind}`}>
      <div className="paper-figure-art">
        <div className="redraw-frame"><FigureRedraw spec={spec} /></div>
        {original && showInk && <div className="compare-ink"><small>Original ink from the board</small><img src={original} alt={`Original drawing: ${block.content}`} /></div>}
      </div>
      <figcaption>
        <span className="paper-figure-kind">{KIND_LABEL[block.kind]} · redrawn{block.writtenAt !== null && ` · ${approx}${formatClock(block.writtenAt)}`}</span>
        <strong><MathText text={block.content} /></strong>
        {block.detail && <span className="paper-figure-detail"><MathText text={block.detail} /></span>}
        {spec.confidence !== "high" && <span className="redraw-note">{spec.confidence === "low" ? "Approximate redraw" : "Redraw may simplify details"}{spec.notes ? ` — ${spec.notes}` : ""}. Compare with the board.</span>}
        {original && <button className="compare-toggle no-print" onClick={() => setShowInk(value => !value)}>{showInk ? "Hide the original" : "Compare with the board"}</button>}
        {!original && youtube && block.writtenAt !== null && <a className="watch-link no-print" href={`https://www.youtube.com/watch?v=${youtube}&t=${Math.max(0, Math.round(block.writtenAt) - 3)}s`} target="_blank" rel="noreferrer">Watch it on the board ↗</a>}
      </figcaption>
    </figure>
  );
}
