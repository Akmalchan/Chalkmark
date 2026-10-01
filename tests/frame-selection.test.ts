import assert from "node:assert/strict";
import test from "node:test";
import { meanAbsoluteDifference, selectMeaningfulSamples, type PixelSample } from "../lib/frame-selection";

const sample = (time: number, value: number): PixelSample => ({ timestampSeconds: time, pixels: new Uint8Array(100).fill(value) });

test("meanAbsoluteDifference measures grayscale change", () => {
  assert.equal(meanAbsoluteDifference(new Uint8Array([0, 10]), new Uint8Array([10, 30])), 15);
});

test("persistent board changes are retained", () => {
  const selected = selectMeaningfulSamples([
    sample(0, 20), sample(5, 20), sample(10, 65), sample(15, 65), sample(20, 95), sample(25, 95),
  ], 6, 2);
  assert.deepEqual(selected.map((item) => item.timestampSeconds), [0, 10, 20, 25]);
});

test("a transient obstruction is rejected", () => {
  const selected = selectMeaningfulSamples([
    sample(0, 20), sample(5, 20), sample(10, 220), sample(15, 20), sample(20, 70), sample(25, 70),
  ], 6, 2);
  assert.equal(selected.some((item) => item.timestampSeconds === 10), false);
  assert.equal(selected.some((item) => item.timestampSeconds === 20), true);
});
