import { FIGURE_KINDS, type Composition, type NoteBlock, type NotesSection, type TranscriptSegment } from "./schema";

export const formatClock = (seconds: number) => {
  const safe = Math.max(0, Math.round(seconds));
  const h = Math.floor(safe / 3600), m = Math.floor((safe % 3600) / 60), s = safe % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

/**
 * Turn Gemini's composition (section titles + block ID order) into sections of real blocks.
 * Unknown IDs are dropped, duplicates keep their first placement, and any block Gemini forgot is
 * placed in the section whose measured time is closest, so nothing on the board is ever lost.
 */
const STOP = new Set(["the", "and", "with", "from", "that", "this", "graph", "diagram", "drawing", "showing", "shows", "axis", "axes", "labeled", "labelled", "line", "lines"]);
const words = (text: string) => new Set(text.toLowerCase().replace(/\\[a-z]+/g, " ").split(/[^a-z0-9]+/).filter(w => w.length >= 2 && !STOP.has(w)));
const squash = (text: string) => text.toLowerCase().replace(/\\[a-z]+/g, "").replace(/[^a-z0-9=+\-*/^]/g, "");
const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / (a.size + b.size - shared);
};

/**
 * Gemini may only drop a block as a duplicate if it really resembles a block that is kept (or is a
 * meaningless scrap of a few characters). Nothing written on the board is silently deleted.
 */
export function confirmDuplicates(candidates: string[], blocks: NoteBlock[]): Set<string> {
  const byId = new Map(blocks.map(block => [block.id, block]));
  const proposed = new Set(candidates.filter(id => byId.has(id)));
  const kept = blocks.filter(block => !proposed.has(block.id));
  const confirmed = new Set<string>();
  for (const id of proposed) {
    const block = byId.get(id)!;
    const figure = FIGURE_KINDS.includes(block.kind);
    const key = squash(block.content);
    if (!figure && key.length <= 6) { confirmed.add(id); continue; }
    const mine = words(`${block.content} ${figure ? block.detail : ""}`);
    const twin = kept.some(other => {
      if (FIGURE_KINDS.includes(other.kind) !== figure) return false;
      if (!figure) {
        const otherKey = squash(other.content);
        return otherKey.includes(key) || jaccard(mine, words(other.content)) >= 0.5;
      }
      return jaccard(mine, words(`${other.content} ${other.detail}`)) >= 0.3;
    });
    if (twin) confirmed.add(id);
  }
  return confirmed;
}

export function assembleSections(composition: Composition, blocks: NoteBlock[]): NotesSection[] {
  const byId = new Map(blocks.map(block => [block.id, block]));
  const used = confirmDuplicates(composition.duplicateBlockIds, blocks);
  const sections: NotesSection[] = composition.sections.map(section => {
    const sectionBlocks: NoteBlock[] = [];
    for (const id of section.blockIds) {
      const block = byId.get(id);
      if (!block || used.has(id)) continue;
      used.add(id);
      sectionBlocks.push(block);
    }
    return { title: section.title, start: null, end: null, blocks: sectionBlocks, explanation: section.explanation, takeaways: section.takeaways };
  });
  if (!sections.length) sections.push({ title: "Board notes", start: null, end: null, blocks: [], explanation: [], takeaways: [] });

  for (const block of blocks) {
    if (used.has(block.id)) continue;
    used.add(block.id);
    let best = sections[sections.length - 1];
    if (block.writtenAt !== null) {
      let bestDistance = Infinity;
      for (const section of sections) {
        const times = section.blocks.map(b => b.writtenAt).filter((t): t is number => t !== null);
        if (!times.length) continue;
        const distance = Math.min(...times.map(t => Math.abs(t - block.writtenAt!)));
        if (distance < bestDistance) { bestDistance = distance; best = section; }
      }
    }
    best.blocks.push(block);
  }

  for (const section of sections) {
    const times = section.blocks.map(b => b.writtenAt).filter((t): t is number => t !== null);
    section.start = times.length ? Math.min(...times) : null;
    section.end = times.length ? Math.max(...times) : null;
  }
  return sections.filter(section => section.blocks.length || section.explanation.length);
}

export function transcriptText(segments: TranscriptSegment[], from = -Infinity, to = Infinity, limit = 12_000): string {
  const lines = segments
    .filter(segment => segment.end >= from && segment.start <= to)
    .map(segment => `[${formatClock(segment.start)}] ${segment.text}`);
  let text = lines.join("\n");
  if (text.length > limit) text = text.slice(0, limit) + "\n…";
  return text;
}
