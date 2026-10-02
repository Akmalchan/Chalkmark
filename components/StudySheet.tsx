"use client";

import { FigureRedraw } from "@/components/FigureRedraw";
import { Mascot } from "@/components/brand/Logo";
import { MathText, mathHtml } from "@/components/math";
import { formatClock } from "@/lib/notes/assemble";
import type { NoteBlock, NotesDoc } from "@/lib/notes/schema";
import type { StudySheet as Sheet } from "@/lib/notes/sheet";

/** The printable study sheet: two dense columns, real figures, one worked example per idea. */
export function StudySheet({ doc, sheet, urls }: { doc: NotesDoc; sheet: Sheet; urls: Record<string, string> }) {
  const blocks = new Map<string, NoteBlock>(doc.sections.flatMap(section => section.blocks).map(block => [block.id, block]));
  const date = new Date(doc.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return (
    <article className="sheet">
      <header className="sheet-header">
        <h1><MathText text={sheet.title || doc.title} /></h1>
        <p>{[sheet.subtitle || doc.course, date, doc.stats.durationSeconds ? formatClock(doc.stats.durationSeconds) : ""].filter(Boolean).join(" · ")}</p>
      </header>
      <div className="sheet-columns">
        {sheet.sections.map((section, index) => {
          const figure = section.figureId ? blocks.get(section.figureId) : undefined;
          return (
            <section className="sheet-section" key={index}>
              <h2><span>{index + 1}</span><MathText text={section.heading} /></h2>
              {section.points.length > 0 && <ul>{section.points.map((point, i) => <li key={i}><MathText text={point} /></li>)}</ul>}
              {section.formulas.map((formula, i) => {
                const html = mathHtml(formula.latex, true);
                return (
                  <div className="sheet-formula" key={i}>
                    {html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <code>{formula.latex}</code>}
                    {formula.label && <small>{formula.label}</small>}
                  </div>
                );
              })}
              {figure && (figure.redraw
                ? <figure className="sheet-figure"><FigureRedraw spec={figure.redraw} /><figcaption><MathText text={figure.content} /></figcaption></figure>
                : figure.figure && urls[figure.figure] ? <figure className="sheet-figure"><img src={urls[figure.figure]} alt={figure.content} /><figcaption><MathText text={figure.content} /></figcaption></figure> : null)}
              {section.example && (
                <div className={`sheet-example ${section.example.kind}`}>
                  <b>{section.example.kind === "lecture" ? "Example" : "Practice"}</b> <MathText text={section.example.problem} />
                  <ol>{section.example.steps.map((step, i) => <li key={i}><MathText text={step} /></li>)}</ol>
                  <p className="sheet-answer">⇒ <MathText text={section.example.answer} /></p>
                </div>
              )}
            </section>
          );
        })}
      </div>
      {sheet.takeaways.length > 0 && (
        <aside className="sheet-takeaways"><b>Before the exam</b><ul>{sheet.takeaways.map((item, i) => <li key={i}><MathText text={item} /></li>)}</ul></aside>
      )}
      <footer className="sheet-footer"><Mascot size={14} title="" /> Chalkmark study sheet · condensed from the board and the lecture{sheet.sections.some(s => s.example?.kind === "practice") ? " · “Practice” examples were written for you, not shown in class" : ""}</footer>
    </article>
  );
}
