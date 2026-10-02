"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Mascot } from "@/components/brand/Logo";
import { StudySheet } from "@/components/StudySheet";
import type { NotesDoc } from "@/lib/notes/schema";
import type { StudySheet as Sheet } from "@/lib/notes/sheet";

/**
 * The study sheet laid out on real pages: every page is exactly US Letter (or A4) with two explicit
 * columns, filled page 1 left → page 1 right → page 2 left…, so the screen, Print and the PDF show
 * the very same pages. CSS multi-column is not used for paging because browsers print it inconsistently
 * (Safari runs a column down across pages).
 *
 * The sheet itself is rendered once off-screen by <StudySheet>; its sections are measured at the real
 * column width and placed whole. If the last page would be nearly empty, the type steps down a little
 * (never below MIN_SCALE) so the sheet fits on fewer pages.
 */

const PX_PER_MM = 96 / 25.4;
const PAGE = { Letter: { w: 816, h: 1056 }, A4: { w: 210 * PX_PER_MM, h: 297 * PX_PER_MM } };
const MARGIN_X = 13 * PX_PER_MM, MARGIN_Y = 11 * PX_PER_MM, FOOTER = 22, GAP = 9 * PX_PER_MM, HEADER_GAP = 10;
const MIN_SCALE = 0.84, STEP = 0.03;

type Piece = { html: string; height: number };

/**
 * The pages reuse the measured copy's HTML, so SVG ids (clip paths, arrow markers, gradients) would
 * exist twice and point at the hidden copy. Give every id a per-page suffix.
 */
function uniqueIds(html: string, suffix: string): string {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  let out = html;
  for (const id of new Set(ids)) {
    const safe = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`id="${safe}"`, "g"), `id="${id}${suffix}"`).replace(new RegExp(`#${safe}([)"])`, "g"), `#${id}${suffix}$1`);
  }
  return out;
}
type Layout = { header: Piece; pages: Array<{ columns: [string[], string[]] }>; takeaways: Piece | null; scale: number };

export function PagedSheet({ doc, sheet, urls, paper }: { doc: NotesDoc; sheet: Sheet; urls: Record<string, string>; paper: "Letter" | "A4" }) {
  const size = PAGE[paper];
  const contentW = size.w - 2 * MARGIN_X;
  const columnW = (contentW - GAP) / 2;
  const bodyH = size.h - 2 * MARGIN_Y - FOOTER;

  const measure = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [loaded, setLoaded] = useState(0); // bumps when a figure image finishes loading
  const [zoom, setZoom] = useState(1);

  // A new sheet or paper size starts again from full-size type.
  useEffect(() => { setScale(1); setLayout(null); }, [sheet, paper]);

  useLayoutEffect(() => {
    const root = measure.current;
    if (!root) return;
    const height = (element: Element | null) => {
      if (!element) return 0;
      const style = getComputedStyle(element);
      return element.getBoundingClientRect().height + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
    };
    const headerEl = root.querySelector(".sheet-header");
    const header = { html: headerEl?.outerHTML ?? "", height: height(headerEl) };
    const sections = [...root.querySelectorAll(".sheet-section")].map(el => ({ html: el.outerHTML, height: height(el) }));
    const takeawaysEl = root.querySelector(".sheet-takeaways");
    const takeaways = takeawaysEl ? { html: takeawaysEl.outerHTML, height: height(takeawaysEl) } : null;

    // Fill page by page, column by column; a section is never split.
    const pages: Array<{ columns: [Piece[], Piece[]] }> = [{ columns: [[], []] }];
    const used = (page: number, column: number) => pages[page].columns[column].reduce((sum, piece) => sum + piece.height, 0);
    const room = (page: number) => bodyH - (page === 0 ? header.height + HEADER_GAP : 0);
    let page = 0, column = 0;
    for (const section of sections) {
      while (pages[page].columns[column].length && used(page, column) + section.height > room(page)) {
        if (column === 0) column = 1; else { pages.push({ columns: [[], []] }); page += 1; column = 0; }
      }
      pages[page].columns[column].push(section);
    }
    let takeawaysPage = pages.length - 1;
    if (takeaways) {
      const last = pages.length - 1;
      if (Math.max(used(last, 0), used(last, 1)) + takeaways.height > room(last)) { pages.push({ columns: [[], []] }); takeawaysPage = pages.length - 1; }
    }
    // Is the last page worth its paper? If it holds little, step the type down and lay out again.
    const last = pages.length - 1;
    const lastUsed = Math.max(used(last, 0), used(last, 1)) + (takeaways && takeawaysPage === last ? takeaways.height : 0);
    if (pages.length > 1 && lastUsed < room(last) * 0.45 && scale - STEP >= MIN_SCALE) { setScale(s => Math.round((s - STEP) * 100) / 100); return; }
    setLayout({ header, takeaways, scale, pages: pages.map(p => ({ columns: [p.columns[0].map(x => x.html), p.columns[1].map(x => x.html)] })) });
  }, [doc, sheet, urls, paper, scale, loaded, bodyH]);

  // Figures that load late change heights: measure again when they do.
  useEffect(() => {
    const root = measure.current;
    if (!root) return;
    const images = [...root.querySelectorAll("img")].filter(image => !image.complete);
    const bump = () => setLoaded(n => n + 1);
    images.forEach(image => image.addEventListener("load", bump, { once: true }));
    void document.fonts?.ready.then(bump);
    return () => images.forEach(image => image.removeEventListener("load", bump));
  }, [doc, sheet, urls]);

  // On screens narrower than the paper, show the same pages scaled down.
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setZoom(Math.min(1, entry.contentRect.width / size.w)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [size.w]);

  const vars = { "--sheet-scale": String(layout?.scale ?? scale), "--page-w": `${size.w}px`, "--page-h": `${size.h}px`, "--column-w": `${columnW}px`, "--content-w": `${contentW}px`, "--margin-x": `${MARGIN_X}px`, "--margin-y": `${MARGIN_Y}px`, "--column-gap": `${GAP}px` } as React.CSSProperties;
  const title = sheet.title || doc.title;
  return (
    <div className={`paged-sheet paper-${paper.toLowerCase()}`} style={vars} ref={frame}>
      {/* Off-screen measuring copy: the same sheet, with sections at the real column width. */}
      <div className="paged-measure" ref={measure} aria-hidden="true"><StudySheet doc={doc} sheet={sheet} urls={urls} /></div>
      {layout ? layout.pages.map((page, index) => (
        <div className="paged-page-slot" key={index} style={{ width: size.w * zoom, height: size.h * zoom }}>
          <section className="paged-page sheet" style={{ zoom }} aria-label={`Page ${index + 1} of ${layout.pages.length}`}>
            {index === 0 && <div className="paged-header" dangerouslySetInnerHTML={{ __html: uniqueIds(layout.header.html, `-p${index}h`) }} />}
            <div className="paged-columns">
              {page.columns.map((column, c) => <div className="paged-column" key={c} dangerouslySetInnerHTML={{ __html: uniqueIds(column.join(""), `-p${index}c${c}`) }} />)}
            </div>
            {layout.takeaways && index === layout.pages.length - 1 && <div className="paged-takeaways" dangerouslySetInnerHTML={{ __html: uniqueIds(layout.takeaways.html, `-p${index}t`) }} />}
            <footer className="paged-footer">
              <span><Mascot size={12} title="" /> Chalkmark study sheet · {title}</span>
              <span>{index + 1} / {layout.pages.length}</span>
            </footer>
          </section>
        </div>
      )) : <div className="sheet-pending"><span className="spinner" /><p>Laying out the pages…</p></div>}
    </div>
  );
}
