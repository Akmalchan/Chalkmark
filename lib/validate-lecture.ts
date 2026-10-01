import type { LectureDocument } from "./lecture-schema";

export function validateLecture(document: LectureDocument, duration: number | null, frameIds: string[]): LectureDocument {
  const warnings: string[] = [];
  const timestamps = [
    ...document.transcript.map(line => line.timestampSeconds),
    ...document.sections.flatMap(section => [section.startSeconds, section.endSeconds, ...(section.visual?.sourceTimestampSeconds == null ? [] : [section.visual.sourceTimestampSeconds])]),
  ];
  const invalid = duration !== null && (timestamps.some(t => !Number.isFinite(t) || t < 0 || t > duration) ||
    document.sections.some((s, i, sections) => s.endSeconds < s.startSeconds || (i > 0 && s.startSeconds < sections[i - 1].endSeconds)) ||
    document.transcript.some((s, i, lines) => i > 0 && s.timestampSeconds < lines[i - 1].timestampSeconds));
  if (duration === null) warnings.push("Source duration could not be verified. Model-generated times are hidden; upload the video to supply its duration.");
  if (invalid) warnings.push("Gemini returned timestamps outside the source timeline or out of order. Those times and playback shortcuts are hidden. Notes and drawings still need comparison with the lecture.");
  if (duration !== null && Math.abs(document.durationSeconds - duration) > 2) warnings.push("The model's lecture length disagreed with the source. The displayed length comes from the source video.");
  return {
    ...document, durationSeconds: duration ?? 0, durationVerified: duration !== null,
    timelineStatus: duration === null ? "unverified" : invalid ? "invalid" : "in_range", warnings,
    sections: document.sections.map(section => ({ ...section, frameIds: section.frameIds.filter(id => frameIds.includes(id)) })),
  };
}
