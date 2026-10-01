export type PixelSample = {
  timestampSeconds: number;
  pixels: Uint8Array;
};

export type RankedSample = PixelSample & {
  score: number;
};

export function meanAbsoluteDifference(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += Math.abs(a[i] - b[i]);
  return total / a.length;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Ranks persistent scene changes. A transient obstruction tends to differ from
 * both neighboring samples while those neighbors resemble each other, so it is
 * heavily penalized. Real writing tends to remain visible in the next sample.
 */
export function selectMeaningfulSamples(
  samples: PixelSample[],
  maxFrames = 10,
  minSpacingSeconds = 4,
): RankedSample[] {
  if (!samples.length) return [];
  if (samples.length === 1) return [{ ...samples[0], score: 100 }];

  const scored: RankedSample[] = samples.map((sample, index) => {
    if (index === 0) return { ...sample, score: 100 };
    const previous = samples[index - 1];
    const next = samples[index + 1];
    const novelty = meanAbsoluteDifference(previous.pixels, sample.pixels);
    if (!next) return { ...sample, score: Math.max(12, novelty) };

    const followThrough = meanAbsoluteDifference(sample.pixels, next.pixels);
    const neighborDistance = meanAbsoluteDifference(previous.pixels, next.pixels);
    const persistence = 1 - Math.min(1, followThrough / Math.max(1, novelty));
    const reverted = neighborDistance < novelty * 0.58;
    const score = novelty * (0.5 + persistence * 0.9) * (reverted ? 0.16 : 1);
    return { ...sample, score };
  });

  const adaptiveFloor = Math.max(5.5, median(scored.slice(1).map((item) => item.score)) * 1.08);
  const candidates = scored
    .filter((item, index) => index === 0 || index === scored.length - 1 || item.score >= adaptiveFloor)
    .sort((a, b) => b.score - a.score);

  const chosen: RankedSample[] = [];
  for (const candidate of candidates) {
    const isFarEnough = chosen.every(
      (item) => Math.abs(item.timestampSeconds - candidate.timestampSeconds) >= minSpacingSeconds,
    );
    if (isFarEnough) chosen.push(candidate);
    if (chosen.length >= maxFrames) break;
  }

  if (!chosen.some((item) => item.timestampSeconds === samples[0].timestampSeconds)) {
    chosen.push({ ...samples[0], score: 100 });
  }

  return chosen.sort((a, b) => a.timestampSeconds - b.timestampSeconds).slice(0, maxFrames);
}
