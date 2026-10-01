import { formatClock } from "./assemble";
import type { NotesDoc } from "./schema";

/** Markdown with LaTeX math; figures reference the crop files saved alongside. */
export function notesToMarkdown(doc: NotesDoc, figurePath = (name: string) => `figures/${name}`): string {
  const lines: string[] = [`# ${doc.title}`, "", `_${doc.course}${doc.stats.durationSeconds ? ` · ${formatClock(doc.stats.durationSeconds)}` : ""} · ${new Date(doc.createdAt).toLocaleDateString()}_`, ""];
  if (doc.summary) lines.push(doc.summary, "");
  doc.sections.forEach((section, index) => {
    lines.push(`## ${index + 1}. ${section.title}`, "");
    for (const paragraph of section.explanation) lines.push(paragraph, "");
    for (const block of section.blocks) {
      if (block.kind === "heading") lines.push(`### ${block.content}`, "");
      else if (block.kind === "equation") lines.push("$$", block.content, "$$", ...(block.detail ? [`_${block.detail}_`] : []), "");
      else if (block.kind === "table" && block.table) {
        if (block.content) lines.push(`**${block.content}**`, "");
        lines.push(`| ${block.table.columns.join(" | ")} |`, `| ${block.table.columns.map(() => "---").join(" | ")} |`);
        for (const row of block.table.rows) lines.push(`| ${block.table.columns.map((_, i) => row[i] ?? "").join(" | ")} |`);
        lines.push("");
      } else if (block.figure) lines.push(`![${block.content}](${figurePath(block.figure)})`, `*${block.content}*${block.detail ? ` — ${block.detail}` : ""}${block.redraw ? " (a clean redraw is in the Chalkmark notes)" : ""}`, "");
      else lines.push(block.content, "");
    }
    if (section.takeaways.length) lines.push("**Remember**", ...section.takeaways.map(item => `- ${item}`), "");
  });
  if (doc.transcript.length) {
    lines.push("---", "", "## Speech", "");
    for (const segment of doc.transcript) lines.push(`- \`${formatClock(segment.start)}\` ${segment.text}`);
  }
  return lines.join("\n");
}

export function slugify(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lecture-notes";
}
