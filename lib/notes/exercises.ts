/**
 * Exercises worked in the lecture, found from the board itself: problem statements ("Solve…",
 * "Find…", "Example:…"). The same statement is often read from several board photos, so near-copies
 * are merged. This count, not the model's impression, decides how many worked examples the study
 * sheet may contain.
 */

const PROBLEM = /^\s*(solve|find|compute|calculate|evaluate|determine|prove|show that|simplify|differentiate|integrate|factor|expand|example|ex\.|e\.g\.|problem|exercise|question|q\d)\b/i;
const STOP = new Set(["the", "and", "its", "for", "with", "out", "find", "solve", "that", "this", "are", "from"]);

const plain = (text: string) => text.replace(/\$[^$]*\$/g, " math ").replace(/\\[a-z]+/gi, " ");
export const words = (text: string) => new Set(text.toLowerCase().replace(/\\[a-z]+/g, " ").split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !STOP.has(w)));
export function overlap(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / Math.min(a.size, b.size);
}
const mathKey = (text: string) => text.toLowerCase().replace(/\\[a-z]+/g, "").replace(/[^0-9a-z=+\-]/g, "");

export function detectExercises(blocks: Array<{ kind: string; content: string }>): string[] {
  const found: string[] = [];
  for (const block of blocks) {
    if (block.kind !== "text" && block.kind !== "heading") continue;
    if (!PROBLEM.test(plain(block.content))) continue;
    const key = mathKey(block.content);
    const duplicate = found.some(existing => {
      const other = mathKey(existing);
      return other.includes(key) || key.includes(other) || overlap(words(existing), words(block.content)) >= 0.6;
    });
    if (!duplicate) found.push(block.content);
  }
  return found;
}
