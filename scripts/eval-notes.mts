// Score saved Chalkmark notes against an answer key.
// Usage: npm run eval -- [lecture-id | path/to/doc.json] [evals/key.json]
// With no arguments, scores the most recently saved lecture (Save & share) against evals/linalg-geometry.json.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { scoreNotes, type AnswerKey } from "../lib/eval/score.ts";
import type { NotesDoc } from "../lib/notes/schema.ts";

const [target, keyPath = "evals/linalg-geometry.json"] = process.argv.slice(2);
const lectures = ".data/lectures";
let docPath = target;
if (!docPath) {
  const latest = readdirSync(lectures).map(id => ({ id, time: statSync(path.join(lectures, id)).mtimeMs })).sort((a, b) => b.time - a.time)[0];
  if (!latest) throw new Error("No saved lectures. Run a lecture and press Save & share first.");
  docPath = path.join(lectures, latest.id, "doc.json");
} else if (!docPath.endsWith(".json")) docPath = path.join(lectures, docPath, "doc.json");

const doc = JSON.parse(readFileSync(docPath, "utf8")) as NotesDoc;
const key = JSON.parse(readFileSync(keyPath, "utf8")) as AnswerKey;
const report = scoreNotes(doc, key);

const pct = (a: number, b: number) => `${Math.round((100 * a) / Math.max(1, b))}%`;
console.log(`\n${report.lecture}\nnotes: ${docPath} — "${doc.title}"\n`);
console.log(`Board coverage: ${report.coverage.found}/${report.coverage.total} items (${pct(report.coverage.found, report.coverage.total)}), core ${report.coverage.coreFound}/${report.coverage.coreTotal}`);
for (const item of report.items) console.log(`  ${item.found ? "✓" : "✗"} ${item.core ? "★" : " "} ${item.label}${item.where ? `   ← ${item.where}` : ""}`);
console.log(`\nFigures (checked from the redraw data):`);
for (const figure of report.figures) console.log(`  ${figure.status.toUpperCase().padEnd(7)} ${figure.label}\n          ${figure.detail}`);
if (report.sheet) console.log(`\nStudy sheet: core items ${report.sheet.coreFound}/${report.sheet.coreTotal}`);
console.log(`\nNot in the answer key — check these by hand (misreads or invented content?): ${report.unmatched.length}`);
for (const line of report.unmatched) console.log(`  ? ${line}`);
console.log("");
