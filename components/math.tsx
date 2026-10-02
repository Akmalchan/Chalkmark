import katex from "katex";
import { Fragment, type ReactNode } from "react";

const MATH_SEGMENT = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g;

/** Strip code fences, "latex:" prefixes and $ / \[ \( wrappers. Does not touch backslashes. */
function unwrapLatex(value: string): string {
  let cleaned = value.trim()
    .replace(/^```(?:latex|tex|math)?\s*/i, "")
    .replace(/\s*```$/, "")
    .replace(/^latex\s*:\s*/i, "")
    .trim();
  const wrappers: Array<[string, string]> = [["$$", "$$"], ["$", "$"], ["\\[", "\\]"], ["\\(", "\\)"]];
  for (const [start, end] of wrappers) {
    if (cleaned.startsWith(start) && cleaned.endsWith(end) && cleaned.length > start.length + end.length) {
      cleaned = cleaned.slice(start.length, -end.length).trim();
      break;
    }
  }
  return cleaned;
}

/**
 * Variants to try, most faithful first. Collapsing "\\frac" → "\frac" repairs JSON double-escaping,
 * but it would break a row break followed by a command ("\\\begin"), so it is only a fallback.
 */
function latexVariants(value: string): string[] {
  const base = unwrapLatex(value);
  return [...new Set([base, base.replace(/\\\\(?=[A-Za-z])/g, "\\")])];
}

export function cleanLatex(value: string): string {
  return latexVariants(value).at(-1)!;
}

export function mathHtml(value: string, displayMode: boolean): string | null {
  const options = { displayMode, strict: false as const, output: "htmlAndMathml" as const };
  for (const variant of latexVariants(value)) {
    try { return katex.renderToString(variant, { ...options, throwOnError: true }); } catch { /* try the next variant */ }
  }
  // Still render it (KaTeX marks only the broken command in red) instead of dumping raw LaTeX.
  try { return katex.renderToString(latexVariants(value)[0], { ...options, throwOnError: false }); } catch { return null; }
}

/** Inline text with $...$ math and **bold**. */
export function MathText({ text }: { text: string }) {
  // Models sometimes write LaTeX without $ delimiters ("\\frac{d}{dx} x^3 = 3x^2"): render that as math.
  if (!text.includes("$") && /\\[a-zA-Z]{2,}/.test(text) && !/\s[a-z]{4,}\s[a-z]{4,}\s/i.test(text.replace(/\\[a-zA-Z]+(\{[^}]*\})*/g, ""))) {
    const html = mathHtml(text, false);
    if (html) return <span className="inline-math" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  const segments = text.split(MATH_SEGMENT).filter(Boolean);
  return <>{segments.map((segment, index) => {
    const isMath = /^(\$\$|\$|\\\(|\\\[)/.test(segment);
    if (isMath) {
      const html = mathHtml(segment, segment.startsWith("$$") || segment.startsWith("\\["));
      if (html) return <span className="inline-math" key={index} dangerouslySetInnerHTML={{ __html: html }} />;
    }
    return <Fragment key={index}>{bold(segment)}</Fragment>;
  })}</>;
}

function bold(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>);
}

/** Small Markdown subset used for board text: bullet/numbered lists and paragraphs, with math. */
export function MarkdownLite({ text }: { text: string }) {
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((item, i) => <li key={i}><MathText text={item} /></li>);
    out.push(list.ordered ? <ol key={out.length}>{items}</ol> : <ul key={out.length}>{items}</ul>);
    list = null;
  };
  for (const line of lines) {
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((bullet ?? numbered)![1]);
    } else {
      flush();
      out.push(<p key={out.length}><MathText text={line.replace(/^#+\s*/, "")} /></p>);
    }
  }
  flush();
  return <>{out}</>;
}

export function Equation({ latex, meaning }: { latex: string; meaning?: string }) {
  const html = mathHtml(latex, true);
  return (
    <figure className="equation">
      {html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <div className="equation-fallback">{cleanLatex(latex)}</div>}
      {meaning ? <figcaption>{meaning}</figcaption> : null}
    </figure>
  );
}
