import katex from "katex";
import { Fragment, type ReactNode } from "react";

const MATH_SEGMENT = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g;

export function cleanLatex(value: string): string {
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
  return cleaned.replace(/\\\\(?=[A-Za-z])/g, "\\");
}

export function mathHtml(value: string, displayMode: boolean): string | null {
  try {
    return katex.renderToString(cleanLatex(value), { throwOnError: true, displayMode, strict: false, output: "htmlAndMathml" });
  } catch {
    return null;
  }
}

/** Inline text with $...$ math and **bold**. */
export function MathText({ text }: { text: string }) {
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
