import { FIGURE_KINDS, type NoteBlock } from "./schema";

const normalize = (text: string) => text.toLowerCase()
  .replace(/\\(?:left|right|text|mathrm|mathbf|displaystyle|,|;|!|quad)/g, "")
  .replace(/\\[a-z]+/g, match => match.slice(1))
  .replace(/[^a-z0-9=+\-*/^<>]/g, "");

const quality = (block: NoteBlock) => (block.legibility === "clear" ? 2 : block.legibility === "partial" ? 1 : 0);

/**
 * The same writing is read from several board photos (the board grows, the camera pans). Drop text,
 * heading and equation blocks whose content is contained in a more complete block. Figures are left
 * to Gemini's composition pass, which compares their descriptions.
 */
export function dedupeBlocks(blocks: NoteBlock[]): { kept: NoteBlock[]; dropped: number } {
  const textual = blocks.map((block, index) => ({ block, index, key: FIGURE_KINDS.includes(block.kind) || block.kind === "table" ? null : normalize(block.content) }));
  const drop = new Set<string>();
  for (const a of textual) {
    if (!a.key || a.key.length < 3) continue;
    for (const b of textual) {
      if (a === b || !b.key || drop.has(b.block.id)) continue;
      if (!b.key.includes(a.key)) continue;
      // Exact ties keep the earlier block.
      const better = b.key.length > a.key.length || quality(b.block) > quality(a.block) ||
        (b.key.length === a.key.length && quality(b.block) === quality(a.block) && b.index < a.index);
      if (better) { drop.add(a.block.id); break; }
    }
  }
  return { kept: blocks.filter(block => !drop.has(block.id)), dropped: drop.size };
}
