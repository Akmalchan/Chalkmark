import { mathHtml } from "@/components/math";

type ArtKind = "frames" | "grid" | "trust" | "erase" | "supersede" | "read" | "compose" | "check" | "sheet";

type Step = {
  art: ArtKind;
  title: string;
  text: string;
  /** Exactly as implemented (constants included) in lib/board/engine.ts and lib/board/supersede.ts. */
  latex?: string;
  metric: { value: string; label: string };
};

const ON_DEVICE: Step[] = [
  {
    art: "frames",
    title: "Frames, not video",
    text: "The recording is decoded in the browser at about one frame per second. The video file never leaves the laptop.",
    metric: { value: "1,200", label: "frames from a 16-min lecture" },
  },
  {
    art: "grid",
    title: "Flatten the board, model the light",
    text: "The board is warped straight-on and cut into a grid. A smooth lighting surface is fitted with the lecturer trimmed out, so ink is measured against the board it sits on.",
    latex: String.raw`\hat B(c)=\theta^{\top}[1,x,y,x^2,y^2,xy],\quad |B_c-\hat B_c|\le 0.12\,\hat B_c`,
    metric: { value: "~550", label: "cells judged every frame" },
  },
  {
    art: "trust",
    title: "Look through the lecturer",
    text: "A cell is remembered only if it has held still, looks like board, and nothing around it is a person.",
    latex: String.raw`T(c)=\big[\text{still}\ge 1.2\,\mathrm s\big]\cdot\big[\text{board}\ge 0.55\big]\cdot\!\!\prod_{n\in\mathcal N_8(c)}\!\!\big(1-\text{occluded}(n)\big)`,
    metric: { value: "1.2 s", label: "of stillness before a cell is trusted" },
  },
  {
    art: "erase",
    title: "Save the board before it’s erased",
    text: "When remembered ink starts disappearing and it was never saved, the board is captured the instant before. Camera pans are detected and saved the same way.",
    latex: String.raw`\text{save}\iff\sum_{c\ \text{losing ink}}\text{unsaved}(c)\cdot|\text{ink}_c|\ \ge\ 48`,
    metric: { value: "21", label: "board snapshots" },
  },
  {
    art: "supersede",
    title: "Drop the drafts",
    text: "A board whose ink is almost entirely inside a later board is just an earlier draft of it, so it is never sent.",
    latex: String.raw`\text{drop }A\iff\frac{|\text{ink}_A\cap\text{ink}_{B\,\text{later}}|}{|\text{ink}_A|}\ge 0.86`,
    metric: { value: "21 → 9", label: "boards worth reading" },
  },
];

const WITH_GEMINI: Step[] = [
  {
    art: "read",
    title: "Gemini reads each board",
    text: "Every board goes in twice, as a clean render and the raw photo, and comes back as typed blocks with positions: text, LaTeX, tables and graphs. The audio is transcribed in parallel.",
    metric: { value: "22", label: "blocks read from 9 boards" },
  },
  {
    art: "compose",
    title: "Clean up in code, not on trust",
    text: "Duplicates are merged, and a blurry copy matches its sharp twin. A smeared photo keeps only what is readable. When Gemini says “duplicate”, code checks the twin exists first.",
    metric: { value: "22 → 18", label: "blocks in the final notes" },
  },
  {
    art: "check",
    title: "Redraw figures, then check the math",
    text: "Graphs are redrawn as clean vectors. Then the plot is parsed back and compared with the equations written on the board, and anything wrong is snapped to the board.",
    metric: { value: "2 / 2", label: "figures match the board" },
  },
  {
    art: "sheet",
    title: "A study sheet, not a transcript",
    text: "Everything is condensed into one or two printable pages (A4 or Letter) with the lecture’s own worked example.",
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
          <div><strong>18 images leave the device.</strong><span>9 boards × (clean render + raw photo). That is the entire upload, not a 100 MB video.</span></div>
          <span className="upload-line" />
        </div>

        <div className="phase"><span>gemini on google cloud · then checked in code</span></div>
        <ol className="timeline" start={6}>
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
        <div className="step-metric"><strong>{step.metric.value}</strong><span>{step.metric.label}</span></div>
      </div>
    </li>
  );
}

/** Small technical diagrams for each step (static SVG; colours come from the pa-* classes). */
function StepArt({ kind }: { kind: ArtKind }) {
  const svg = (children: React.ReactNode) => <svg viewBox="0 0 220 110" className="pipe-art" aria-hidden="true">{children}</svg>;
  switch (kind) {
    case "frames":
      return svg(<>
        {[0, 1, 2, 3, 4].map(i => (
          <g key={i} transform={`translate(${8 + i * 42} 22)`}>
            <rect width="36" height="52" rx="3" className={i === 2 ? "pa-hot" : "pa-box"} />
            <path d="M6 14h18M6 22h12M6 30h20" className="pa-ink" />
            <text x="18" y="66" className="pa-mono" textAnchor="middle">{`0:${String(i * 7).padStart(2, "0")}`}</text>
          </g>
        ))}
        <path d="M8 98h204" className="pa-axis" /><text x="8" y="14" className="pa-mono">decode · ~1 fps · local</text>
      </>);
    case "grid":
      return svg(<>
        <path d="M10 22 L84 14 L92 92 L6 84 Z" className="pa-box" />
        <text x="10" y="106" className="pa-mono">camera view</text>
        <path d="M98 54 h18 m-6 -5 l6 5 -6 5" className="pa-axis" />
        <g transform="translate(124 18)">
          <rect width="88" height="72" className="pa-box" />
          {[1, 2, 3, 4, 5, 6, 7].map(i => <path key={`v${i}`} d={`M${i * 11} 0 V72`} className="pa-grid" />)}
          {[1, 2, 3, 4, 5].map(i => <path key={`h${i}`} d={`M0 ${i * 12} H88`} className="pa-grid" />)}
          <path d="M8 18 h30 M8 30 h20" className="pa-ink" />
        </g>
        <text x="124" y="106" className="pa-mono">straight-on grid</text>
      </>);
    case "trust": {
      const person = new Set([3, 4, 11, 12, 13, 19, 20, 21, 27, 28, 29]);
      const inked = new Set([0, 1, 8, 9, 16, 24, 6, 7, 15]);
      return svg(<>
        {Array.from({ length: 32 }, (_, i) => (
          <rect key={i} x={8 + (i % 8) * 16} y={14 + Math.floor(i / 8) * 16} width="14" height="14" rx="2"
            className={person.has(i) ? "pa-red" : inked.has(i) ? "pa-lime" : "pa-cell"} />
        ))}
        <g className="pa-mono">
          <text x="146" y="26">✓ still ≥ 1.2 s</text>
          <text x="146" y="44">✓ looks like board</text>
          <text x="146" y="62">✓ no person</text>
          <text x="146" y="74">   nearby</text>
        </g>
        <text x="8" y="100" className="pa-mono">red = ignored · lime = remembered</text>
      </>);
    }
    case "erase":
      return svg(<>
        <path d="M14 92 H210 M14 92 V12" className="pa-axis" />
        <path d="M14 90 C 40 86, 60 60, 90 46 S 130 26, 140 24 L 146 84 C 160 80, 180 60, 206 48" className="pa-line" />
        <path d="M140 24 V92" className="pa-dash" />
        <circle cx="140" cy="24" r="5" className="pa-dot" />
        <text x="96" y="18" className="pa-mono">snapshot ↓</text>
        <text x="150" y="102" className="pa-mono">erase</text>
        <text x="18" y="22" className="pa-mono">ink on the board</text>
      </>);
    case "supersede":
      return svg(<>
        <g transform="translate(10 18)">
          <rect width="84" height="62" rx="3" className="pa-box faded" />
          <path d="M8 14h40M8 26h28" className="pa-ink faded" />
          <text x="0" y="78" className="pa-mono">0:42 draft</text>
        </g>
        <path d="M100 49 h14 m-5 -5 l5 5 -5 5" className="pa-axis" />
        <g transform="translate(124 18)">
          <rect width="84" height="62" rx="3" className="pa-hot" />
          <path d="M8 14h40M8 26h28M8 38h56M8 50h34" className="pa-ink" />
          <text x="0" y="78" className="pa-mono">1:10 kept</text>
        </g>
        <text x="10" y="12" className="pa-mono">draft ink 94% inside → dropped</text>
      </>);
    case "read":
      return svg(<>
        <rect x="8" y="12" width="110" height="80" rx="4" className="pa-box" />
        <rect x="14" y="18" width="58" height="12" className="pa-bbox eq" /><text x="16" y="15.5" className="pa-tag">EQ</text>
        <rect x="14" y="40" width="44" height="10" className="pa-bbox tx" /><text x="16" y="37.5" className="pa-tag">TEXT</text>
        <rect x="70" y="40" width="42" height="46" className="pa-bbox gr" /><text x="72" y="37.5" className="pa-tag">GRAPH</text>
        <path d="M76 80 L106 48 M76 80 H108 M76 80 V46" className="pa-ink" />
        <g className="pa-code">
          <text x="128" y="26">{"{ kind: \"equation\","}</text>
          <text x="128" y="38">{"  latex: \"2x+y=3\","}</text>
          <text x="128" y="50">{"  box: [.06,.08,.32,.2],"}</text>
          <text x="128" y="62">{"  written: \"4:12\" }"}</text>
        </g>
      </>);
    case "compose":
      return svg(<>
        <g className="pa-mono">
          <rect x="8" y="14" width="78" height="20" rx="3" className="pa-box" /><text x="14" y="27">x² + 3x</text>
          <rect x="8" y="42" width="78" height="20" rx="3" className="pa-box faded" /><text x="14" y="55">x² + [?]x</text>
          <rect x="8" y="70" width="78" height="20" rx="3" className="pa-box" /><text x="14" y="83">v = dx/dt</text>
        </g>
        <path d="M90 24 C 108 24, 108 40, 124 40 M90 52 C 108 52, 108 40, 124 40 M90 80 H124" className="pa-axis" />
        <g className="pa-mono">
          <rect x="128" y="30" width="84" height="20" rx="3" className="pa-hot" /><text x="134" y="43">x² + 3x</text>
          <rect x="128" y="70" width="84" height="20" rx="3" className="pa-hot" /><text x="134" y="83">v = dx/dt</text>
          <text x="128" y="20">[?] matches twin</text>
        </g>
      </>);
    case "check":
      return svg(<>
        <path d="M14 92 H120 M30 100 V10" className="pa-axis" />
        <path d="M20 26 L84 98" className="pa-line" />
        <path d="M16 62 L118 34" className="pa-line alt" />
        <circle cx="56" cy="51" r="4.5" className="pa-dot" />
        <g className="pa-mono">
          <text x="130" y="30">✓ 2x+y=3</text>
          <text x="130" y="48">✓ x−2y=−1</text>
          <text x="130" y="66">✓ meet at (1, 1)</text>
          <text x="130" y="88" className="pa-fix">fixed: v₂ = (1, −2)</text>
        </g>
      </>);
    case "sheet":
      return svg(<>
        <rect x="56" y="6" width="108" height="98" rx="3" className="pa-paper" />
        <path d="M64 18 h50" className="pa-paper-ink thick" />
        <path d="M64 30 h40 M64 37 h36 M64 44 h42 M114 30 h40 M114 37 h30" className="pa-paper-ink" />
        <rect x="114" y="42" width="40" height="24" rx="2" className="pa-paper-fig" />
        <path d="M118 62 L150 46" className="pa-paper-curve" />
        <rect x="64" y="72" width="90" height="24" rx="2" className="pa-paper-example" />
        <path d="M70 80 h50 M70 88 h34" className="pa-paper-ink" />
        <text x="172" y="86" className="pa-mono">A4 /</text>
        <text x="172" y="98" className="pa-mono">Letter</text>
      </>);
  }
}
