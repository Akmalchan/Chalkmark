import type { ReactNode } from "react";
import { mathHtml } from "@/components/math";

type ArtKind = "frames" | "grid" | "trust" | "erase" | "supersede" | "read" | "compose" | "check" | "sheet";

type Step = {
  art: ArtKind;
  title: string;
  text: string;
  /** Exactly what the code does (constants included): lib/board/engine.ts, lib/client/session.ts, lib/notes/assemble.ts. */
  latex?: string;
  /** Rendered width of `latex` in em (measured), so it can be scaled to fit its box exactly. */
  mathEm?: number;
  chips: string[];
  metric: { value: string; label: string };
  extra?: ReactNode;
};

/** Figure topics the redraw step handles (plots and sketches). Lines, vectors and intersections are also math-checked. */
const FIGURE_TOPICS = [
  "Linear systems", "Vectors", "Tangent lines", "Parabolas", "Sine & cosine", "Exponential growth", "Logarithms",
  "Limits", "Area under a curve", "Normal distribution", "Supply & demand", "Free-body diagrams", "Circuits",
  "Flowcharts", "Trees & graphs", "Geometry", "Phase diagrams", "Cell diagrams", "Sketches (yes, a car)",
];

const ON_DEVICE: Step[] = [
  {
    art: "frames",
    title: "Frames, not video",
    text: "The recording is decoded right in the browser at about one frame per second. Nothing is uploaded while it scans, so a 16-minute lecture never leaves the laptop.",
    chips: ["WebCodecs decode", "~1 fps sampling", "0 MB uploaded"],
    metric: { value: "1,200", label: "frames from a 16-min lecture" },
  },
  {
    art: "grid",
    title: "Flatten the board, model the light",
    text: "The board is warped straight-on and cut into a grid of cells. A smooth lighting surface is fitted with the lecturer trimmed out, so every stroke is measured against the board right behind it, not against a global threshold.",
    chips: ["homography warp", "quadratic light model", "outlier trimming"],
    metric: { value: "~550", label: "cells judged every frame" },
  },
  {
    art: "trust",
    title: "Look through the lecturer",
    text: "A cell is remembered only after it holds still, looks like board, and has no person in or next to it. The lecturer never gets in — the board behind them fills in as they move away.",
    latex: String.raw`T(c)=\big[\,\text{still}\ge 1.2\,\mathrm{s}\,\big]\cdot\big[\,\text{board}\ge 0.55\,\big]\cdot\!\!\prod_{n\in\mathcal N_8(c)}\!\!\big(1-\text{person}_n\big)`,
    mathEm: 26.1,
    chips: ["MediaPipe person mask", "8-neighbour buffer", "per-cell stillness"],
    metric: { value: "1.2 s", label: "of stillness before a cell is trusted" },
  },
  {
    art: "erase",
    title: "Save the board before it’s erased",
    text: "When remembered ink starts disappearing and it was never saved, the board is captured the instant before it’s gone. Camera pans are detected from 1-D ink profiles and saved the same way.",
    latex: String.raw`\text{save}\iff\sum_{c\ \in\ \text{losing ink}}\text{unsaved}(c)\cdot|\text{ink}_c|\;\ge\;48\ \text{px}`,
    mathEm: 21.6,
    chips: ["erase detection", "pan detection", "ink birth times"],
    metric: { value: "21", label: "board snapshots" },
  },
  {
    art: "supersede",
    title: "Drop the drafts",
    text: "A board whose ink sits almost entirely inside a later board is just an earlier draft of it, and near-empty views add nothing. Neither is ever sent to the model.",
    chips: ["ink-mask containment ≥ 86%", "shift-aligned", "near-empty filter"],
    metric: { value: "21 → 9", label: "boards worth reading" },
  },
];

const WITH_GEMINI: Step[] = [
  {
    art: "read",
    title: "Gemini reads each board",
    text: "Each board goes in twice — the clean render and the raw photo — with what the lecturer was saying around it. Gemini returns typed blocks with positions. When each block was written is measured from the ink, never guessed by the model.",
    latex: String.raw`\begin{aligned}\mathcal B_k&=\mathrm{Gemini}\big(P_k,\;R_k,\;A_{[\,t_{k-1}-20\mathrm{s},\;t_k+10\mathrm{s}\,]}\big)\\&=\big\{(\text{kind},\ \text{latex},\ \text{box},\ \text{legibility})_i\big\}\\[4pt] t_i^{\,\text{written}}&=\min\{\,\text{birth}(c)\;:\;c\in\text{box}_i\,\}\end{aligned}`,
    mathEm: 19.2,
    chips: ["clean + raw image", "speech context", "box_2d positions"],
    metric: { value: "22", label: "blocks read from 9 boards" },
  },
  {
    art: "compose",
    title: "Clean up in code, not on trust",
    text: "Gemini groups the blocks into sections and may flag duplicates — but a flag only counts if code finds the twin. Blurry copies with [?] match their sharp twin, and a smeared board keeps only what’s readable.",
    latex: String.raw`\text{merge}(b\to b')\iff\mathrm{Gemini}_{\text{dup}}(b)\;\wedge\;\big(\,b\subseteq b'\ \vee\ J(w_b,w_{b'})\ge 0.5\,\big)`,
    mathEm: 29,
    chips: ["duplicate check", "[?] wildcard match", "bad-photo rule ≥ 50%"],
    metric: { value: "22 → 18", label: "blocks in the final notes" },
  },
  {
    art: "check",
    title: "Redraw figures, then check the math",
    text: "Every graph and drawing is redrawn as a clean vector. Plots are then parsed back and compared with the equations written on the board; anything that disagrees is snapped to the board.",
    chips: ["vector redraw", "board facts parser", "auto-correct"],
    metric: { value: "2 / 2", label: "figures match the board" },
    extra: (
      <div className="topics">
        <div className="topics-checked"><span>math-checked</span><b>lines</b><b>vectors</b><b>intersections</b></div>
        <div className="topics-marquee" aria-label="Figure topics that are redrawn">
          <div className="topics-track">
            {[...FIGURE_TOPICS, ...FIGURE_TOPICS].map((topic, i) => <span key={i} aria-hidden={i >= FIGURE_TOPICS.length}>{topic}</span>)}
          </div>
        </div>
      </div>
    ),
  },
  {
    art: "sheet",
    title: "A study sheet, not a transcript",
    text: "Everything is condensed into one or two printable pages, A4 or Letter: key points, the formulas, the figures, and the lecture’s own worked example written out step by step.",
    chips: ["A4 / Letter", "worked example", "markdown export"],
    metric: { value: "1–2", label: "pages for a whole lecture" },
  },
];

export function HowItWorks() {
  return (
    <section className="tech" id="how">
      <div className="tech-inner">
        <div className="tech-heading">
          <span className="tech-eyebrow">// how it works</span>
          <h2>From a messy video to a clean page, in nine steps.</h2>
          <p>The first five run on your laptop with no AI at all. Only what survives them is sent to Gemini.</p>
        </div>

        <div className="phase"><span>on your device · no AI</span><b>995 s of video in</b></div>
        <ol className="timeline">
          {ON_DEVICE.map((step, i) => <StepRow key={step.art} step={step} index={i + 1} />)}
        </ol>

        <div className="upload-divider" role="note">
          <span className="upload-line" />
          <div><strong>18 images leave the device.</strong><span>9 boards × (clean render + raw photo) = 403 KB. That is the entire upload, instead of a 24 MB video.</span></div>
          <span className="upload-line" />
        </div>

        <div className="phase"><span>gemini on google cloud · then checked in code</span></div>
        <ol className="timeline">
          {WITH_GEMINI.map((step, i) => <StepRow key={step.art} step={step} index={i + 6} />)}
        </ol>
      </div>
    </section>
  );
}

function StepRow({ step, index }: { step: Step; index: number }) {
  const math = step.latex ? mathHtml(step.latex, true) : null;
  return (
    <li className="step">
      <div className="step-num">{String(index).padStart(2, "0")}</div>
      <div className="step-art"><StepArt kind={step.art} /></div>
      <div className="step-copy">
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        {math && <div className="step-math" style={{ ["--math-em" as string]: step.mathEm ?? 22 }} dangerouslySetInnerHTML={{ __html: math }} />}
        {step.extra}
        <div className="step-chips">{step.chips.map(chip => <span key={chip}>{chip}</span>)}</div>
        <div className="step-metric"><strong>{step.metric.value}</strong><span>{step.metric.label}</span></div>
      </div>
    </li>
  );
}

/* ---------- Illustrations: pictures only, no text inside (360×210; colours from the pa-* classes) ---------- */

function Board({ x, y, w, h, lines = 3, person, faded, hot, graph }: { x: number; y: number; w: number; h: number; lines?: number; person?: number; faded?: boolean; hot?: boolean; graph?: boolean }) {
  const lengths = [0.5, 0.34, 0.44, 0.28];
  return (
    <g transform={`translate(${x} ${y})`} className={faded ? "faded" : undefined}>
      <rect width={w} height={h} rx="4" className={hot ? "pa-hot" : "pa-board"} />
      {Array.from({ length: lines }, (_, i) => <path key={i} d={`M${w * 0.1} ${h * (0.24 + i * 0.18)} h${w * lengths[i % 4]}`} className="pa-ink" />)}
      {graph && <path d={`M${w * 0.66} ${h * 0.8} V${h * 0.28} M${w * 0.66} ${h * 0.8} H${w * 0.92} M${w * 0.68} ${h * 0.74} Q${w * 0.8} ${h * 0.72} ${w * 0.9} ${h * 0.34}`} className="pa-ink" />}
      {person !== undefined && (
        <g transform={`translate(${person * w} ${h * 0.34})`} className="pa-person">
          <circle r={h * 0.1} />
          <rect x={-h * 0.14} y={h * 0.12} width={h * 0.28} height={h * 0.56} rx={h * 0.08} />
        </g>
      )}
    </g>
  );
}

const Check = ({ x, y }: { x: number; y: number }) => <path d={`M${x - 6} ${y} l4 4 8 -9`} className="pa-check" />;
const Cross = ({ x, y }: { x: number; y: number }) => <path d={`M${x - 5} ${y - 5} l10 10 M${x + 5} ${y - 5} l-10 10`} className="pa-cross" />;
const Arrow = ({ x1, x2, y }: { x1: number; x2: number; y: number }) => <path d={`M${x1} ${y} H${x2} m-7 -5 l7 5 -7 5`} className="pa-arrow" />;

function svg(children: ReactNode) {
  return <svg viewBox="0 0 360 210" className="pipe-art" aria-hidden="true">{children}</svg>;
}

function StepArt({ kind }: { kind: ArtKind }) {
  switch (kind) {
    case "frames":
      // A film strip; a few frames are sampled out of it.
      return svg(<>
        <rect x="20" y="22" width="320" height="58" rx="6" className="pa-film" />
        {Array.from({ length: 16 }, (_, i) => <g key={i}><rect x={28 + i * 19.6} y="26" width="8" height="5" rx="1" className="pa-hole" /><rect x={28 + i * 19.6} y="71" width="8" height="5" rx="1" className="pa-hole" /></g>)}
        {Array.from({ length: 6 }, (_, i) => <Board key={i} x={26 + i * 52.5} y={35} w={46} h={32} lines={2} person={0.25 + (i % 3) * 0.25} faded={i % 2 === 1} />)}
        {[0, 2, 4].map((frame, i) => <path key={frame} d={`M${49 + frame * 52.5} 82 C ${49 + frame * 52.5} 104, ${70 + i * 110} 100, ${70 + i * 110} 118`} className="pa-guide" />)}
        {[0, 1, 2].map(i => <Board key={i} x={22 + i * 110} y={120} w={96} h={66} lines={3} person={0.3 + i * 0.25} hot={i === 1} />)}
      </>);
    case "grid":
      // Slanted camera view with the lecturer → straight-on board cut into cells.
      return svg(<>
        <path d="M24 48 L150 36 L158 172 L18 168 Z" className="pa-board" />
        {[[24, 48], [150, 36], [158, 172], [18, 168]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" className="pa-corner" />)}
        <path d="M40 74 h62 M40 96 h44 M40 118 h70" className="pa-ink" />
        <g transform="translate(118 92)" className="pa-person"><circle r="10" /><rect x="-14" y="13" width="28" height="62" rx="8" /></g>
        <Arrow x1={170} x2={196} y={104} />
        <g transform="translate(208 36)">
          <rect width="136" height="136" rx="3" className="pa-board" />
          {Array.from({ length: 7 }, (_, i) => <path key={`v${i}`} d={`M${(i + 1) * 17} 0 V136`} className="pa-grid" />)}
          {Array.from({ length: 7 }, (_, i) => <path key={`h${i}`} d={`M0 ${(i + 1) * 17} H136`} className="pa-grid" />)}
          <path d="M16 38 h62 M16 60 h44 M16 82 h70" className="pa-ink" />
        </g>
      </>);
    case "trust":
      return <TrustArt />;
    case "erase":
      return <EraseChart />;
    case "supersede":
      // Drafts are dropped; the finished board is kept.
      return svg(<>
        {[0, 1, 2, 3].map(i => (
          <g key={i}>
            <Board x={12 + i * 86} y={46} w={76} h={80} lines={[1, 2, 3, 0][i]} graph={i === 2} hot={i === 2} faded={i !== 2} />
            {i === 2 ? <Check x={50 + i * 86} y={156} /> : <Cross x={50 + i * 86} y={156} />}
          </g>
        ))}
        {[0, 1, 2].map(i => <path key={i} d={`M${89 + i * 86} 86 h8`} className="pa-tick-arrow" />)}
      </>);
    case "read":
      // A board with typed regions → structured blocks.
      return svg(<>
        <rect x="16" y="30" width="170" height="150" rx="4" className="pa-board" />
        <rect x="28" y="44" width="96" height="24" rx="3" className="pa-bbox eq" /><path d="M36 56 h80" className="pa-ink" />
        <rect x="28" y="84" width="72" height="20" rx="3" className="pa-bbox tx" /><path d="M36 94 h56" className="pa-ink" />
        <rect x="28" y="120" width="72" height="46" rx="3" className="pa-bbox tb" /><path d="M28 135 h72 M28 150 h72 M52 120 v46 M76 120 v46" className="pa-grid strong" />
        <rect x="110" y="84" width="66" height="82" rx="3" className="pa-bbox gr" /><path d="M118 158 V92 M118 158 H170 M120 152 L166 100" className="pa-ink" />
        <Arrow x1={194} x2={220} y={105} />
        {[["eq", 34], ["tx", 76], ["tb", 118]].map(([type, y], i) => (
          <g key={i} transform={`translate(232 ${y})`}>
            <rect width="112" height="34" rx="5" className="pa-card" />
            <rect width="5" height="34" rx="2" className={`pa-strip ${type}`} />
            <path d={`M16 13 h${70 - i * 12} M16 23 h${44 + i * 8}`} className="pa-card-line" />
          </g>
        ))}
        <g transform="translate(232 160)">
          <rect width="112" height="20" rx="5" className="pa-card" /><rect width="5" height="20" rx="2" className="pa-strip gr" />
          <path d="M16 10 h60" className="pa-card-line" />
        </g>
      </>);
    case "compose":
      // Blocks read from different boards (two blurry re-reads) → merged sections.
      return svg(<>
        <text x="14" y="20" className="pa-label">blocks from many boards</text>
        <g className="pa-mono">
          {[
            ["2x + y = 3", "b04", ""], ["2x + y = [?]", "b09", "faded"], ["x − 2y = −1", "b09", ""],
            ["Row picture", "b11", ""], ["Row picture", "b13", "faded"], ["A = [2 1; 1 −2]", "b20", ""],
          ].map(([label, board, state], i) => (
            <g key={i} transform={`translate(14 ${30 + i * 26})`} className={state || undefined}>
              <rect width="128" height="20" rx="3" className="pa-box" />
              <text x="8" y="14">{label}</text>
              <text x="122" y="14" textAnchor="end" className="dim">{board}</text>
            </g>
          ))}
        </g>
        <path d="M146 40 C 170 40, 170 52, 196 52 M146 66 C 170 66, 170 52, 196 52 M146 92 C 170 92, 172 76, 196 76 M146 118 C 170 118, 172 132, 196 132 M146 144 C 170 144, 172 132, 196 132 M146 170 C 170 170, 172 156, 196 156" className="pa-guide strong" />
        <g className="pa-mono">
          <text x="200" y="20" className="pa-label">notes</text>
          <rect x="200" y="28" width="146" height="72" rx="5" className="pa-section" />
          <text x="210" y="44" className="lime">§1 The system</text>
          <text x="210" y="60">2x + y = 3</text>
          <text x="210" y="76">x − 2y = −1</text>
          <text x="210" y="92" className="dim">[?] matched its twin</text>
          <rect x="200" y="112" width="146" height="58" rx="5" className="pa-section" />
          <text x="210" y="128" className="lime">§2 Row picture</text>
          <text x="210" y="144">Row picture</text>
          <text x="210" y="160">A = [2 1; 1 −2]</text>
          <text x="200" y="192" className="coral">a flag with no twin → kept</text>
        </g>
      </>);
    case "check":
      // Two board lines meet at (1, 1); a wrong redraw (dashed) is snapped onto the right line.
      // Origin (112, 111); 1 unit = 24.5 px across, 20.75 px up.
      return svg(<>
        <g transform="translate(60 0)">
          {[1, 2, 3, 4, 5, 6, 7].map(i => <path key={i} d={`M${14 + i * 24.5} 28 V194 M14 ${28 + i * 20.75} H210`} className="pa-grid" />)}
          <path d="M14 111 H210 M112 28 V194" className="pa-axis" />
          <path d="M87.5 28 L210 131.75" className="pa-ghost" />
          <path d="M99.75 28 L197.75 194" className="pa-line thin" />
          <path d="M14 142.1 L210 59.1" className="pa-line thin alt" />
          <path d="M186 116 C 196 128, 196 140, 184 152" className="pa-snap" />
          <path d="M184 152 l1 -9 m-1 9 l8 -4" className="pa-snap" />
          <circle cx="136.5" cy="90.25" r="9" className="pa-pulse" />
          <circle cx="136.5" cy="90.25" r="4.5" className="pa-dot" />
        </g>
        <circle cx="318" cy="44" r="16" className="pa-badge" />
        <path d="M310 44 l5 5 10 -11" className="pa-check" />
      </>);
    case "sheet":
      return svg(<>
        {[0, 1].map(page => (
          <g key={page} transform={`translate(${32 + page * 156} 14) rotate(${page ? 2 : -2} 70 90)`}>
            <rect width="140" height="182" rx="3" className="pa-paper" />
            {page === 0 ? <>
              <path d="M12 18 h80" className="pa-paper-ink thick" />
              <path d="M12 28 h56" className="pa-paper-ink light" />
              <path d="M12 44 h50 M12 52 h44 M12 60 h52 M12 68 h38" className="pa-paper-ink" />
              <rect x="72" y="40" width="56" height="34" rx="2" className="pa-paper-fig" />
              <path d="M76 70 L124 46 M76 52 L124 68" className="pa-paper-curve" />
              <rect x="12" y="84" width="116" height="22" rx="2" className="pa-paper-formula" />
              <path d="M20 95 h70" className="pa-paper-ink" />
              <path d="M12 118 h50 M12 126 h56 M12 134 h40 M72 118 h50 M72 126 h44" className="pa-paper-ink" />
              <rect x="12" y="146" width="116" height="26" rx="2" className="pa-paper-example" />
              <path d="M18 156 h50 M18 164 h80" className="pa-paper-ink" />
            </> : <>
              <path d="M12 18 h60" className="pa-paper-ink thick" />
              <rect x="12" y="28" width="116" height="62" rx="2" className="pa-paper-example" />
              <path d="M18 40 h50 M18 50 h90 M18 58 h70 M18 66 h84 M18 74 h60 M18 82 h40" className="pa-paper-ink" />
              <path d="M12 104 h60 M12 112 h48 M72 104 h50 M72 112 h40" className="pa-paper-ink" />
              <rect x="12" y="126" width="116" height="40" rx="2" className="pa-paper-takeaway" />
              <path d="M18 138 h44 M18 148 h80 M18 156 h64" className="pa-paper-ink" />
            </>}
          </g>
        ))}
      </>);
  }
}

/** Deterministic pseudo-random numbers, so server and client render the same grid. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The cell grid: irregular bunches of cells light up together, each rippling out from its centre, slowly. */
function TrustArt() {
  const COLS = 26, ROWS = 13, SIZE = 10, GAP = 3, X0 = 11, Y0 = 21, PERIOD = 10;
  const random = seeded(11);
  // Seed points split the grid into irregular patches; each patch has its own moment and colour.
  const seeds = Array.from({ length: 20 }, () => {
    const roll = random();
    return { c: random() * COLS, r: random() * ROWS, phase: random(), tone: roll < 0.14 ? "coral" : roll < 0.72 ? "lime" : null };
  });
  return svg(<>
    {Array.from({ length: COLS * ROWS }, (_, i) => {
      const c = i % COLS, r = Math.floor(i / COLS);
      let best = seeds[0], dist = Infinity;
      for (const seed of seeds) {
        const d = Math.hypot((c - seed.c) * 0.9, r - seed.r);
        if (d < dist) { dist = d; best = seed; }
      }
      const props = { x: X0 + c * (SIZE + GAP), y: Y0 + r * (SIZE + GAP), width: SIZE, height: SIZE, rx: 2.5 };
      if (!best.tone || dist > 3.6) return <rect key={i} {...props} className="pa-cell" />;
      const phase = (best.phase + dist * 0.035) % 1;
      return (
        <rect key={i} {...props} className={`pa-shine ${best.tone}`}
          style={{ animationDuration: `${PERIOD}s`, animationDelay: `-${(phase * PERIOD).toFixed(2)}s` }} />
      );
    })}
  </>);
}

/**
 * A full lecture as the engine measures it: ink visible to the camera (dips whenever the lecturer
 * blocks the board), the steadier board memory, and a snapshot just before each erase.
 */
function EraseChart() {
  const T = 960, X0 = 44, X1 = 344, Y0 = 26, Y1 = 166, VMAX = 2400;
  const cycles = [
    { start: 0, peakT: 300, base: 0, peak: 1600 },
    { start: 330, peakT: 625, base: 160, peak: 2120 },
    { start: 655, peakT: 950, base: 220, peak: 1460 },
  ];
  const memory = (t: number) => {
    for (let i = cycles.length - 1; i >= 0; i -= 1) {
      const c = cycles[i];
      if (t < c.start) continue;
      if (t <= c.peakT) {
        const u = (t - c.start) / (c.peakT - c.start);
        // Writing comes in bursts with pauses: a monotone curve with two irregular rhythms.
        const written = u - 0.6 * Math.sin(2 * Math.PI * 7 * u) / (2 * Math.PI * 7) - 0.3 * Math.sin(2 * Math.PI * 13 * u + 1) / (2 * Math.PI * 13);
        return c.base + (c.peak - c.base) * Math.min(1, Math.max(0, written));
      }
      const next = cycles[i + 1];
      if (!next) return c.peak;
      const u = Math.min(1, (t - c.peakT) / (next.start - c.peakT));
      return c.peak + (next.base - c.peak) * u;
    }
    return 0;
  };
  // Deterministic "lecturer in the way" dips and sensor noise.
  const occlusion = (t: number) => 0.55 * Math.max(0, Math.sin(t / 17) * Math.sin(t / 47 + 1)) ** 1.5 + 0.05 * Math.sin(t * 1.7) ** 2;
  const visible = (t: number) => Math.max(0, memory(t) * (1 - occlusion(t)) + 30 * Math.sin(t * 3.1) + 14 * Math.sin(t * 7.3));
  const x = (t: number) => X0 + (t / T) * (X1 - X0);
  const y = (v: number) => Y1 - (v / VMAX) * (Y1 - Y0);
  const path = (f: (t: number) => number) => Array.from({ length: T / 4 + 1 }, (_, i) => `${i ? "L" : "M"}${x(i * 4).toFixed(1)} ${y(f(i * 4)).toFixed(1)}`).join(" ");
  const snapshots = cycles.map(c => c.peakT);
  return svg(<>
    {[0, 800, 1600, 2400].map(v => (
      <g key={v}>
        <path d={`M${X0} ${y(v)} H${X1}`} className="pa-grid" />
        <text x={X0 - 6} y={y(v) + 3} className="pa-axis-label" textAnchor="end">{v ? `${v / 1000}k` : "0"}</text>
      </g>
    ))}
    {[0, 240, 480, 720, 960].map(t => (
      <text key={t} x={x(t)} y={Y1 + 14} className="pa-axis-label" textAnchor="middle">{`${t / 60}:00`}</text>
    ))}
    <path d={`M${X0} ${Y0 - 4} V${Y1} H${X1}`} className="pa-axis" />
    {snapshots.map(t => <path key={t} d={`M${x(t)} ${Y0} V${Y1}`} className="pa-dash" />)}
    <path d={path(visible)} className="pa-series camera" />
    <path d={path(memory)} className="pa-series memory" />
    {snapshots.map(t => <circle key={t} cx={x(t)} cy={y(memory(t))} r="3.6" className="pa-dot" />)}
    <g transform={`translate(${X0} 194)`} className="pa-chart-legend">
      <path d="M0 -3 h14" className="pa-series memory" /><text x="19" y="0">board memory</text>
      <path d="M104 -3 h14" className="pa-series camera" /><text x="123" y="0">visible to camera</text>
      <circle cx="232" cy="-3" r="3.4" className="pa-dot" /><text x="240" y="0">snapshot</text>
    </g>
  </>);
}
