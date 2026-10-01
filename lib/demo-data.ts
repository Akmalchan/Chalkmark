import type { BoardFrame, LectureDocument } from "./lecture-schema";

const boardSvg = (title: string, lines: string[], accent: string) => {
  const rows = lines.map((line, index) => `<text x="70" y="${142 + index * 58}" font-size="28" fill="#f2efe4" font-family="ui-monospace, SFMono-Regular">${line}</text>`).join("");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#18231f"/><path d="M30 40h900v460H30z" fill="none" stroke="#31453d" stroke-width="3"/><text x="70" y="80" font-size="22" fill="${accent}" font-family="system-ui" font-weight="700">${title}</text>${rows}<path d="M650 130c80 0 120 40 120 100s-40 100-120 100" fill="none" stroke="${accent}" stroke-width="5"/><circle cx="650" cy="130" r="8" fill="${accent}"/><circle cx="650" cy="330" r="8" fill="${accent}"/></svg>`)} `;
};

export const demoFrames: BoardFrame[] = [
  { id: "board-01", timestampSeconds: 8, score: 100, width: 960, height: 540, dataUrl: boardSvg("BOARD STATE 01 · 00:08", ["Gradient descent", "θₙ₊₁ = θₙ − α∇J(θₙ)", "α → learning rate"], "#d8ff65") },
  { id: "board-02", timestampSeconds: 63, score: 24.8, width: 960, height: 540, dataUrl: boardSvg("BOARD STATE 02 · 01:03", ["too small → slow", "too large → diverges", "choose α by validation"], "#ff8b67") },
];

export const demoLecture: LectureDocument = {
  title: "Gradient Descent: Learning Rate and Convergence",
  course: "Introduction to Machine Learning",
  summary: "The lecture builds gradient descent from its update rule, then explains why the learning rate controls both speed and stability. The board’s first derivation is preserved even after it is erased for a convergence sketch.",
  durationSeconds: 94,
  transcript: [
    { timestampSeconds: 5, speaker: "Professor", text: "Today we are going to make the gradient descent update rule feel intuitive." },
    { timestampSeconds: 24, speaker: "Professor", text: "The gradient tells us uphill, so the negative sign is what sends the parameters downhill." },
    { timestampSeconds: 61, speaker: "Professor", text: "A tiny learning rate is safe but slow. Too large and we can jump across the valley forever." },
  ],
  sections: [
    {
      id: "update-rule",
      startSeconds: 0,
      endSeconds: 51,
      title: "The update rule",
      overview: "Gradient descent repeatedly moves each parameter in the direction that reduces the objective function.",
      boardContent: ["Start from parameters θₙ.", "Measure the local slope ∇J(θₙ).", "Step against that slope, scaled by α."],
      equations: [{ latex: "\\theta_{n+1}=\\theta_n-\\alpha\\nabla J(\\theta_n)", meaning: "One gradient-descent parameter update" }],
      diagram: null,
      visual: null,
      spokenDetails: ["The negative sign is essential: the gradient itself points toward steepest increase.", "This is an iterative method, not a closed-form solution."],
      takeaways: ["Gradient gives direction; learning rate gives step size."],
      frameIds: ["board-01"],
    },
    {
      id: "learning-rate",
      startSeconds: 52,
      endSeconds: 94,
      title: "Choosing the learning rate",
      overview: "The learning rate trades convergence speed against stability.",
      boardContent: ["Small α: stable, many iterations", "Large α: overshoot or divergence", "Validate α empirically"],
      equations: [],
      diagram: "A bowl-shaped loss curve with small steps descending smoothly and large steps bouncing across the minimum.",
      visual: {
        kind: "coordinate_graph",
        fidelity: "qualitative",
        uncertainty: "Illustrative sample data, not measurements extracted from a real lecture.",
        sourceTimestampSeconds: 63,
        table: null,
        panels: [{
          title: "Example loss histories", xLabel: "Iteration", yLabel: "Loss",
          xMin: 0, xMax: 5, yMin: 0, yMax: 10, xTicks: [], yTicks: [], annotations: [],
          series: [
            { label: "Stable α", expression: null, style: "solid", points: [{x:0,y:9},{x:1,y:6.2},{x:2,y:4.1},{x:3,y:2.7},{x:4,y:1.8},{x:5,y:1.3}] },
            { label: "Too large α", expression: null, style: "dashed", points: [{x:0,y:9},{x:1,y:3},{x:2,y:7.3},{x:3,y:2.1},{x:4,y:8.2},{x:5,y:1.7}] },
          ],
        }],
        title: "Learning rate changes the path to the minimum",
        description: "Small steps descend steadily, while an oversized learning rate repeatedly overshoots the loss minimum.",
        nodes: [],
        edges: [],
      },
      spokenDetails: ["The professor recommends comparing learning curves rather than picking α from the formula alone."],
      takeaways: ["Use the largest learning rate that remains stably convergent."],
      frameIds: ["board-02"],
    },
  ],
};
