import type { Composition, NoteBlock, NotesSection, TranscriptSegment } from "./schema";

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
export function assembleSections(composition: Composition, blocks: NoteBlock[]): NotesSection[] {
  const byId = new Map(blocks.map(block => [block.id, block]));
  const used = new Set<string>(composition.duplicateBlockIds.filter(id => byId.has(id)));
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
