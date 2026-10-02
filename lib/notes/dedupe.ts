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
  // A partly-legible read whose readable pieces all appear, in order, in a clean block is a blurry
  // copy of that block ([?] gaps act as wildcards).
  const clear = textual.filter(t => t.key && t.block.legibility === "clear" && !drop.has(t.block.id));
  for (const t of textual) {
    if (!t.key || t.block.legibility === "clear" || drop.has(t.block.id) || !t.block.content.includes("[?]")) continue;
    const pieces = t.block.content.split("[?]").map(normalize).filter(piece => piece.length >= 2);
    if (!pieces.length) { drop.add(t.block.id); continue; }
    // Blur also garbles letters, so require most (not all) of the readable text to match, in order.
    const total = pieces.reduce((sum, piece) => sum + piece.length, 0);
    const covered = clear.some(c => {
      let at = 0, matched = 0;
      for (const piece of pieces) { const found = c.key!.indexOf(piece, at); if (found >= 0) { matched += piece.length; at = found + piece.length; } }
      return matched / total >= 0.7;
    });
    if (covered) drop.add(t.block.id);
  }
  return { kept: blocks.filter(block => !drop.has(block.id)), dropped: drop.size };
}

const EMPTY_FIGURE = /\b(empty|blank|incomplete|unfinished|bare)\b[^.]{0,40}\b(coordinate|axes|axis|cartesian|graph|plane|grid|frame)|\b(no|nothing)\b[^.]{0,20}\b(plotted|drawn|curves?|data)\b|\bonly (the )?axes\b/i;
/** A described figure that is just empty axes or a blank frame (scaffolding, not content). */
export const isEmptyFigure = (text: string) => EMPTY_FIGURE.test(text);
