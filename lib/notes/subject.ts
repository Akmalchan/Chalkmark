/** What kind of lecture this is. "auto" lets the models decide; the others steer what they look for. */
export const SUBJECTS = [
  { id: "auto", label: "Auto" },
  { id: "math", label: "Math & science" },
  { id: "cs", label: "Data structures" },
] as const;
export type Subject = (typeof SUBJECTS)[number]["id"];

export const asSubject = (value: unknown): Subject => (SUBJECTS.some(s => s.id === value) ? (value as Subject) : "auto");

/** One extra paragraph for the board-reading, redraw and study-sheet prompts. */
export function subjectHint(subject: Subject, step: "read" | "redraw" | "sheet"): string {
  if (subject === "cs") {
    if (step === "read") return "\n\nThis is a data structures & algorithms lecture: expect arrays, linked lists, stacks, queues, trees and heaps, graphs, hash tables, pseudocode, traces of algorithms step by step, and complexity tables. Read every data structure as a diagram with all node values, edges and pointers listed, and every routine as a code block.";
    if (step === "redraw") return "\n\nThis is a data structures & algorithms lecture: prefer \"structure\" for anything that is an array, list, stack, queue, tree, heap, graph or hash table.";
    return "\n\nThis is a data structures & algorithms lecture: for each structure or algorithm give its operations with time (and space) complexity in Big-O, the key idea of how it works, and the lecture's own trace as the worked example (e.g. inserting values step by step). Keep code short: the core lines as example steps.";
  }
  if (subject === "math") {
    if (step === "read") return "\n\nThis is a mathematics or science lecture: expect equations, derivations, graphs with axes and labelled diagrams.";
    if (step === "redraw") return "\n\nThis is a mathematics or science lecture: graphs with axes are \"plot\"; keep them mathematically exact.";
    return "";
  }
  return "";
}
