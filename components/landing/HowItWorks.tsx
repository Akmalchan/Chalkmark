import type { ReactNode } from "react";
import { mathHtml } from "@/components/math";

type ArtKind = "frames" | "grid" | "trust" | "erase" | "supersede" | "read" | "compose" | "check" | "sheet";

type Step = {
  art: ArtKind;
  title: string;
  text: string;
  /** Exactly what the code does (constants included): lib/board/engine.ts, lib/client/session.ts, lib/notes/assemble.ts. */
  latex?: string;
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
    latex: String.raw`\begin{aligned}T(c)=\;&\big[\,\text{still}\ge 1.2\,\mathrm{s}\,\big]\cdot\big[\,\text{board}\ge 0.55\,\big]\\ \cdot\;&\prod_{n\,\in\,\mathcal N_8(c)}\big(1-\text{person}(n)\big)\end{aligned}`,
    chips: ["MediaPipe person mask", "8-neighbour buffer", "per-cell stillness"],
    metric: { value: "1.2 s", label: "of stillness before a cell is trusted" },
  },
  {
    art: "erase",
    title: "Save the board before it’s erased",
    text: "When remembered ink starts disappearing and it was never saved, the board is captured the instant before it’s gone. Camera pans are detected from 1-D ink profiles and saved the same way.",
    latex: String.raw`\text{save}\iff\sum_{c\ \in\ \text{losing ink}}\text{unsaved}(c)\cdot|\text{ink}_c|\;\ge\;48\ \text{px}`,
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
    chips: ["clean + raw image", "speech context", "box_2d positions"],
    metric: { value: "22", label: "blocks read from 9 boards" },
  },
  {
    art: "compose",
    title: "Clean up in code, not on trust",
    text: "Gemini groups the blocks into sections and may flag duplicates — but a flag only counts if code finds the twin. Blurry copies with [?] match their sharp twin, and a smeared board keeps only what’s readable.",
    latex: String.raw`\begin{aligned}\text{merge}(b\to b')\iff\;&\underbrace{\mathrm{Gemini}_{\text{dup}}(b)}_{\text{proposed}}\\ \wedge\;&\underbrace{\big(\,b\subseteq b'\ \vee\ J(w_b,w_{b'})\ge 0.5\,\big)}_{\text{verified in code}}\end{aligned}`,
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
        {math && <div className="step-math" dangerouslySetInnerHTML={{ __html: math }} />}
        {step.extra}
        <div className="step-chips">{step.chips.map(chip => <span key={chip}>{chip}</span>)}</div>
        <div className="step-metric"><strong>{step.metric.value}</strong><span>{step.metric.label}</span></div>
      </div>
    </li>
  );
}

/* ---------- Diagrams (static SVG, 360×210; colours from the pa-* classes) ---------- */

function Board({ x, y, w, h, lines = 3, person, faded, hot, graph }: { x: number; y: number; w: number; h: number; lines?: number; person?: number; faded?: boolean; hot?: boolean; graph?: boolean }) {
  const rows = Array.from({ length: lines }, (_, i) => i);
  return (
    <g transform={`translate(${x} ${y})`} className={faded ? "faded" : undefined}>
      <rect width={w} height={h} rx="3" className={hot ? "pa-hot" : "pa-board"} />
      {rows.map(i => <path key={i} d={`M${w * 0.1} ${h * (0.2 + i * 0.16)} h${w * (i % 2 ? 0.32 : 0.45)}`} className="pa-ink" />)}
      {graph && <path d={`M${w * 0.62} ${h * 0.82} V${h * 0.25} M${w * 0.62} ${h * 0.82} H${w * 0.92} M${w * 0.64} ${h * 0.78} Q${w * 0.78} ${h * 0.74} ${w * 0.9} ${h * 0.32}`} className="pa-ink" />}
      {person !== undefined && (
        <g transform={`translate(${person * w} ${h * 0.3})`}>
          <circle cx="0" cy="0" r={h * 0.09} className="pa-person" />
          <rect x={-h * 0.13} y={h * 0.1} width={h * 0.26} height={h * 0.6} rx={h * 0.06} className="pa-person" />
        </g>
      )}
    </g>
  );
}

function svg(children: ReactNode) {
  return <svg viewBox="0 0 360 210" className="pipe-art" aria-hidden="true">{children}</svg>;
}

function StepArt({ kind }: { kind: ArtKind }) {
  switch (kind) {
    case "frames":
      return svg(<>
        <text x="14" y="20" className="pa-label">lecture.mp4 · 16:35 · 24 MB</text>
        <rect x="14" y="28" width="332" height="16" rx="3" className="pa-box" />
        {Array.from({ length: 34 }, (_, i) => <path key={i} d={`M${20 + i * 9.6} 31 v10`} className={i % 7 === 0 ? "pa-tick hot" : "pa-tick"} />)}
        {[0, 1, 2, 3, 4].map(i => <path key={i} d={`M${20 + i * 7 * 9.6} 46 L${44 + i * 68} 70`} className="pa-guide" />)}
        {[0, 1, 2, 3, 4].map(i => (
          <g key={i}>
            <Board x={14 + i * 68} y={72} w={60} h={42} lines={2 + (i % 2)} person={0.2 + i * 0.15} hot={i === 2} />
            <text x={44 + i * 68} y={128} className="pa-mono" textAnchor="middle">{`0:${String(i * 7).padStart(2, "0")}`}</text>
          </g>
        ))}
        <rect x="14" y="146" width="332" height="48" rx="6" className="pa-panel" />
        <text x="26" y="166" className="pa-label">in the browser</text>
        <text x="26" y="184" className="pa-mono">seek → decode → 640×360 RGBA → engine</text>
        <text x="334" y="166" className="pa-mono lime" textAnchor="end">0 MB sent</text>
      </>);
    case "grid":
      return svg(<>
        <text x="14" y="20" className="pa-label">camera view</text>
        <rect x="14" y="28" width="150" height="104" rx="4" className="pa-panel" />
        <path d="M30 46 L150 38 L156 120 L24 124 Z" className="pa-board-quad" />
        {[[30, 46], [150, 38], [156, 120], [24, 124]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.5" className="pa-corner" />)}
        <path d="M44 62 h50 M44 76 h34 M44 90 h60" className="pa-ink" />
        <g transform="translate(118 64)"><circle r="8" className="pa-person" /><rect x="-11" y="10" width="22" height="50" rx="5" className="pa-person" /></g>
        <path d="M172 80 h26 m-8 -6 l8 6 -8 6" className="pa-arrow" />
        <text x="185" y="70" className="pa-mono" textAnchor="middle">H</text>
        <text x="206" y="20" className="pa-label">flattened · cell grid</text>
        <g transform="translate(206 28)">
          <rect width="140" height="104" rx="2" className="pa-board" />
          {Array.from({ length: 13 }, (_, i) => <path key={`v${i}`} d={`M${(i + 1) * 10} 0 V104`} className="pa-grid" />)}
          {Array.from({ length: 9 }, (_, i) => <path key={`h${i}`} d={`M0 ${(i + 1) * 10.4} H140`} className="pa-grid" />)}
          <path d="M14 20 h52 M14 36 h36 M14 52 h64" className="pa-ink" />
        </g>
        <rect x="14" y="146" width="332" height="48" rx="6" className="pa-panel" />
        <defs><linearGradient id="pa-light" x1="0" x2="1"><stop offset="0" stopColor="#4d5a52" /><stop offset=".55" stopColor="#e9efe6" /><stop offset="1" stopColor="#8a978f" /></linearGradient></defs>
        <text x="26" y="166" className="pa-label">lighting model B̂(x, y)</text>
        <rect x="26" y="174" width="150" height="10" rx="2" fill="url(#pa-light)" />
        <text x="190" y="166" className="pa-mono">ink = contrast vs B̂</text>
        <text x="190" y="184" className="pa-mono">lecturer trimmed as outlier</text>
      </>);
    case "trust": {
      const cols = 14, rows = 7;
      const person = new Set<number>(), buffer = new Set<number>(), ink = new Set<number>(), moving = new Set<number>();
      for (let r = 1; r < rows; r += 1) for (let c = 8; c <= 9; c += 1) person.add(r * cols + c);
      for (const p of person) {
        for (const d of [-1, 1, -cols, cols, -cols - 1, -cols + 1, cols - 1, cols + 1]) {
          const n = p + d;
          if (n >= 0 && n < cols * rows && !person.has(n) && Math.abs((n % cols) - (p % cols)) <= 1) buffer.add(n);
        }
      }
      [15, 16, 17, 18, 29, 30, 31, 43, 44, 45, 46, 47, 26, 27, 40, 41, 54, 55].forEach(i => { if (!person.has(i) && !buffer.has(i)) ink.add(i); });
      [33, 34].forEach(i => moving.add(i));
      const cls = (i: number) => person.has(i) ? "pa-red" : buffer.has(i) ? "pa-buffer" : moving.has(i) ? "pa-yellow" : ink.has(i) ? "pa-lime" : "pa-cell";
      return svg(<>
        <text x="14" y="20" className="pa-label">one frame, every cell judged</text>
        {Array.from({ length: cols * rows }, (_, i) => (
          <rect key={i} x={14 + (i % cols) * 15} y={30 + Math.floor(i / cols) * 15} width="13" height="13" rx="2" className={cls(i)} />
        ))}
        <g transform="translate(232 30)">
          {["still ≥ 1.2 s", "board-like ≥ 55%", "no person nearby"].map((label, i) => (
            <g key={label} transform={`translate(0 ${i * 26})`}>
              <rect width="114" height="20" rx="4" className="pa-gate" />
              <text x="8" y="14" className="pa-mono">✓ {label}</text>
            </g>
          ))}
          <path d="M57 80 v14 m-5 -6 l5 6 5 -6" className="pa-arrow" />
          <text x="57" y="110" className="pa-mono lime" textAnchor="middle">commit to memory</text>
        </g>
        <g transform="translate(14 148)" className="pa-legend">
          <rect width="10" height="10" rx="2" className="pa-red" /><text x="15" y="9">person</text>
          <rect x="70" width="10" height="10" rx="2" className="pa-buffer" /><text x="85" y="9">buffer</text>
          <rect x="138" width="10" height="10" rx="2" className="pa-yellow" /><text x="153" y="9">still changing</text>
          <rect x="246" width="10" height="10" rx="2" className="pa-lime" /><text x="261" y="9">trusted ink</text>
        </g>
        <rect x="14" y="170" width="332" height="26" rx="6" className="pa-panel" />
        <text x="26" y="187" className="pa-mono">memory = only cells that passed all three gates</text>
      </>);
    }
    case "erase":
      return svg(<>
        <text x="14" y="20" className="pa-label">ink on the board over time</text>
        <path d="M24 120 H346 M24 120 V28" className="pa-axis" />
        <path d="M24 118 C 60 112, 90 80, 130 64 S 190 40, 206 38 L 214 112 C 236 108, 280 84, 340 66" className="pa-line" />
        <path d="M70 120 V44" className="pa-dash blue" />
        <text x="74" y="52" className="pa-mono blue">camera pan → view saved</text>
        <path d="M206 38 V120" className="pa-dash" />
        <circle cx="206" cy="38" r="9" className="pa-pulse" />
        <circle cx="206" cy="38" r="5" className="pa-dot" />
        <text x="196" y="32" className="pa-mono coral" textAnchor="end">snapshot</text>
        <text x="218" y="134" className="pa-mono">erase starts</text>
        <text x="24" y="134" className="pa-mono">0:00</text>
        <g transform="translate(24 146)">
          <Board x={0} y={0} w={92} h={50} lines={3} graph hot />
          <text x={102} y={16} className="pa-mono lime">saved ✓</text>
          <text x={102} y={32} className="pa-mono">unsaved ink ≥ 48 px</text>
          <text x={102} y={46} className="pa-mono">about to be lost</text>
        </g>
        <g transform="translate(254 146)">
          <Board x={0} y={0} w={92} h={50} lines={1} person={0.7} faded />
        </g>
      </>);
    case "supersede":
      return svg(<>
        <text x="14" y="20" className="pa-label">snapshots, in time order</text>
        <Board x={14} y={32} w={74} h={52} lines={1} faded />
        <Board x={98} y={32} w={74} h={52} lines={2} faded />
        <Board x={182} y={32} w={74} h={52} lines={3} hot graph />
        <Board x={266} y={32} w={74} h={52} lines={0} faded />
        <text x="51" y="100" className="pa-mono coral" textAnchor="middle">97% inside</text>
        <text x="135" y="100" className="pa-mono coral" textAnchor="middle">94% inside</text>
        <text x="219" y="100" className="pa-mono lime" textAnchor="middle">kept</text>
        <text x="303" y="100" className="pa-mono coral" textAnchor="middle">near-empty</text>
        <rect x="14" y="118" width="332" height="76" rx="6" className="pa-panel" />
        <text x="26" y="138" className="pa-label">ink-mask containment</text>
        <g transform="translate(26 148)">
          <rect width="60" height="34" rx="2" className="pa-board faded" /><path d="M8 10 h30 M8 20 h20" className="pa-ink" />
          <text x="72" y="22" className="pa-mono big">⊂</text>
          <rect x="88" width="60" height="34" rx="2" className="pa-hot" /><path d="M96 10 h30 M96 20 h20 M96 28 h36" className="pa-ink" />
        </g>
        <text x="190" y="160" className="pa-mono">aligned for camera shift,</text>
        <text x="190" y="176" className="pa-mono">dropped before any API call</text>
      </>);
    case "read":
      return svg(<>
        <text x="14" y="20" className="pa-label">board 09 · clean render</text>
        <rect x="14" y="28" width="172" height="120" rx="4" className="pa-board" />
        <rect x="22" y="40" width="96" height="18" className="pa-bbox eq" /><text x="24" y="37" className="pa-tag">EQUATION</text>
        <path d="M28 50 h80" className="pa-ink" />
        <rect x="22" y="72" width="70" height="14" className="pa-bbox tx" /><text x="24" y="69" className="pa-tag">TEXT</text>
        <path d="M28 80 h56" className="pa-ink" />
        <rect x="22" y="100" width="70" height="40" className="pa-bbox tb" /><text x="24" y="97" className="pa-tag">TABLE</text>
        <path d="M22 113 h70 M22 126 h70 M45 100 v40 M68 100 v40" className="pa-grid strong" />
        <rect x="104" y="68" width="74" height="72" className="pa-bbox gr" /><text x="106" y="65" className="pa-tag">GRAPH</text>
        <path d="M112 132 V76 M112 132 H172 M114 128 L170 82 M114 94 L170 124" className="pa-ink" />
        <text x="14" y="168" className="pa-label">+ raw photo</text>
        <text x="14" y="188" className="pa-label">+ speech around it</text>
        <path d="M160 184 q4 -10 8 0 t8 0 t8 0" className="pa-wave" />
        <rect x="196" y="28" width="150" height="166" rx="6" className="pa-panel" />
        <g className="pa-code">
          <text x="206" y="48">{"{"}</text>
          <text x="214" y="64">{"kind: \"equation\","}</text>
          <text x="214" y="80">{"latex: \"2x+y=3\","}</text>
          <text x="214" y="96">{"box: [40,22,58,118],"}</text>
          <text x="214" y="112">{"legibility: \"clear\","}</text>
          <text x="214" y="128" className="dim">{"written: 4:12"}</text>
          <text x="214" y="144" className="dim">{"  ← from ink, not AI"}</text>
          <text x="206" y="160">{"}"}</text>
          <text x="206" y="182" className="dim">{"× 22 blocks"}</text>
        </g>
      </>);
    case "compose":
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
          <rect x="200" y="28" width="146" height="72" rx="5" className="pa-section" />
          <text x="210" y="44" className="lime">§1 The system</text>
          <text x="210" y="60">2x + y = 3</text>
          <text x="210" y="76">x − 2y = −1</text>
          <text x="210" y="92" className="dim">[?] matched its twin</text>
          <rect x="200" y="112" width="146" height="58" rx="5" className="pa-section" />
          <text x="210" y="128" className="lime">§2 Row picture</text>
          <text x="210" y="144">Row picture ✓ merged</text>
          <text x="210" y="160">A = [2 1; 1 −2]</text>
          <text x="200" y="192" className="coral">flag without a twin → kept</text>
        </g>
      </>);
    case "check":
      return svg(<>
        <text x="14" y="20" className="pa-label">redrawn plot, checked</text>
        <rect x="14" y="28" width="196" height="166" rx="4" className="pa-panel" />
        {[1, 2, 3, 4, 5, 6, 7].map(i => <path key={`g${i}`} d={`M${14 + i * 24.5} 28 V194 M14 ${28 + i * 20.75} H210`} className="pa-grid" />)}
        <path d="M14 111 H210 M112 28 V194" className="pa-axis" />
        {/* origin (112, 111); 1 unit = 24.5 px across, 20.75 px up. Lines 2x+y=3 and x−2y=−1 meet at (1, 1). */}
        <path d="M87.5 28 L210 131.75" className="pa-ghost" />
        <path d="M99.75 28 L197.75 194" className="pa-line" />
        <path d="M14 142.1 L210 59.1" className="pa-line alt" />
        <path d="M112 111 L161 90.25" className="pa-vec" />
        <path d="M112 111 L136.5 152.5" className="pa-vec" />
        <circle cx="136.5" cy="90.25" r="5" className="pa-dot" />
        <text x="164" y="100" className="pa-mono lime">v₁</text>
        <text x="122" y="166" className="pa-mono lime">v₂</text>
        <text x="20" y="44" className="pa-mono coral">wrong → snapped</text>
        <g className="pa-mono" transform="translate(222 40)">
          <text className="pa-label" y="-8">board says</text>
          <text y="14">✓ 2x + y = 3</text>
          <text y="32">✓ x − 2y = −1</text>
          <text y="50">✓ meet at (1, 1)</text>
          <text y="68">✓ v₁ = (2, 1)</text>
          <text y="86" className="coral">✎ v₂ → (1, −2)</text>
          <text y="118" className="dim">parsed from the</text>
          <text y="134" className="dim">board’s own text</text>
        </g>
      </>);
    case "sheet":
      return svg(<>
        {[0, 1].map(page => (
          <g key={page} transform={`translate(${30 + page * 160} 14) rotate(${page ? 2 : -2} 70 90)`}>
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
              <text x="18" y="157" className="pa-paper-text">Example</text>
              <path d="M18 165 h80" className="pa-paper-ink" />
            </> : <>
              <path d="M12 18 h60" className="pa-paper-ink thick" />
              <rect x="12" y="28" width="116" height="62" rx="2" className="pa-paper-example" />
              <text x="18" y="40" className="pa-paper-text">Worked example</text>
              <path d="M18 50 h90 M18 58 h70 M18 66 h84 M18 74 h60 M18 82 h40" className="pa-paper-ink" />
              <path d="M12 104 h60 M12 112 h48 M72 104 h50 M72 112 h40" className="pa-paper-ink" />
              <rect x="12" y="126" width="116" height="40" rx="2" className="pa-paper-takeaway" />
              <text x="18" y="138" className="pa-paper-text">Takeaways</text>
              <path d="M18 148 h80 M18 156 h64" className="pa-paper-ink" />
            </>}
          </g>
        ))}
      </>);
  }
}
