import { test } from "node:test";
import assert from "node:assert/strict";
import { compileExpression, niceTicks, sampleExpression } from "../lib/plot-math";
import { parseYouTubeDuration, youtubeId } from "../lib/source-metadata";
import { validateLecture } from "../lib/validate-lecture";
import { demoLecture } from "../lib/demo-data";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LectureVisual } from "../app/lecture-visual";
import { visualExamples } from "../lib/visual-examples";

test("duration comes from the requested video, never a recommendation", () => {
  const page = '"videoDetails":{"videoId":"T_I-CUOc_bk","title":"Big Picture: Derivatives","lengthSeconds":"1804"},"lengthSeconds":"3004"';
  assert.equal(parseYouTubeDuration(page,"T_I-CUOc_bk"),1804);
  assert.equal(parseYouTubeDuration(page,"other_id123"),null);
  assert.equal(youtubeId("https://youtu.be/T_I-CUOc_bk?si=tracking"),"T_I-CUOc_bk");
  assert.equal(youtubeId("https://evil.test/watch?v=T_I-CUOc_bk"),null);
});

test("regression: 50:04 model output for a 30:04 source hides invalid times without rescaling", () => {
  const lecture = structuredClone(demoLecture);
  lecture.durationSeconds=3004;
  lecture.sections[1].startSeconds=2504;
  lecture.sections[1].endSeconds=3004;
  const result=validateLecture(lecture,1804,[]);
  assert.equal(result.durationSeconds,1804);
  assert.equal(result.timelineStatus,"invalid");
  assert.equal(result.sections[1].startSeconds,2504);
  assert.deepEqual(result.sections[0].frameIds,[]);
  assert.ok(result.warnings?.length);
});

test("unavailable source duration never displays a model guess as fact", () => {
  const result=validateLecture(demoLecture,null,[]);
  assert.equal(result.durationSeconds,0);
  assert.equal(result.timelineStatus,"unverified");
});

test("reversed and overlapping sections are invalid", () => {
  const lecture=structuredClone(demoLecture);
  lecture.sections[1].startSeconds=30;
  assert.equal(validateLecture(lecture,94,[]).timelineStatus,"invalid");
});

test("mathematical curves are computed, including exponent precedence", () => {
  assert.equal(compileExpression("x^2")(3),9);
  assert.equal(compileExpression("-x^2")(3),-9);
  assert.equal(compileExpression("2*x+1")(3),7);
  assert.equal(compileExpression("2^3^2")(0),512);
  assert.ok(Math.abs(compileExpression("sin(pi/2)")(0)-1)<1e-12);
  assert.ok(Math.abs(compileExpression("cos(x)")(Math.PI)+1)<1e-12);
  assert.equal(compileExpression("sqrt(abs(x))")(-4),2);
  assert.throws(()=>compileExpression("globalThis.alert(1)"));
  assert.throws(()=>compileExpression("x;fetch('https://example.com')"));
});

test("sampling does not join across a pole and ticks stay readable", () => {
  const segments=sampleExpression("1/x",-2,2,-5,5);
  assert.ok(segments.length>=2);
  for(const segment of segments) assert.ok(segment.every(p=>p.x<0)||segment.every(p=>p.x>0));
  assert.deepEqual(niceTicks(-0.16,2.16).map(t=>t.value),[0,0.5,1,1.5,2]);
});

test("renderer preserves construction labels, both derivative panels, math tables and full node labels", () => {
  const rendered=visualExamples.map(visual=>renderToStaticMarkup(createElement(LectureVisual,{visual})));
  assert.ok(rendered[0].includes("Δx = 1") && rendered[0].includes("Δy = 3"));
  assert.equal((rendered[1].match(/class="graph-panel"/g)??[]).length,2);
  assert.ok(rendered[1].includes('aria-label="Function: y = sin x"') && rendered[1].includes('aria-label="Slope: dy/dx = cos x"'));
  assert.ok((rendered[1].match(/class="katex"/g)??[]).length >= 4);
  assert.ok(rendered[2].includes('<table') && rendered[2].includes('class="katex"'));
  assert.ok(!rendered[3].includes("…"));
  const invalid=structuredClone(visualExamples[0]);
  invalid.panels[0].series[0].expression="window.alert(1)";
  assert.ok(renderToStaticMarkup(createElement(LectureVisual,{visual:invalid})).includes("Formula could not be plotted"));
});
