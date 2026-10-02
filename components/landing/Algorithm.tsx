import { mathHtml } from "@/components/math";

/** The capture math, written exactly as lib/board/engine.ts and lib/board/supersede.ts implement it. */
const EQUATIONS = [
  {
    tag: "f₁ · board model",
    latex: String.raw`\hat B(c)=\theta^{\top}\phi_c,\quad \phi_c=[1,x,y,x^2,y^2,xy]\\[4pt]\theta=\arg\min_{\theta}\sum_{c\in\mathcal I}\big(B_c-\theta^{\top}\phi_c\big)^2,\;\; \mathcal I=\{c:|B_c-\hat B_c|\le 0.12\,\hat B_c\}`,
    note: "Lighting falls off smoothly, people don’t. A quadratic surface is fitted to the board brightness, and cells that deviate (the lecturer, dense drawings) are trimmed out over 4 rounds.",
    source: "engine.ts · fitBoardModel",
  },
  {
    tag: "f₂ · ink",
    latex: String.raw`\kappa(p)=420\cdot\max\!\Big(0,\;\frac{\hat B(p)-I(p)}{\max(24,\hat B(p))}\Big),\qquad \text{ink}(p)\iff\kappa(p)\ge 64`,
    note: "Ink is contrast against the board expected at that pixel, not a global threshold — so a shadowed corner and a glare spot read the same marker the same way.",
    source: "engine.ts · ink",
  },
  {
    tag: "f₃ · trust test",
    latex: String.raw`T_t(c)=\big[s_t(c)\ge\lceil 1.2\,\mathrm{s}/\Delta t\rceil\big]\cdot\big[b(c)\ge 0.55\big]\cdot\!\!\prod_{n\in\mathcal N_8(c)\cup\{c\}}\!\!\big(1-o_t(n)\big)`,
    note: "A cell enters memory only if it has been still ≥1.2 s, looks like board, and neither it nor any neighbour is occluded (MediaPipe person mask included).",
    source: "engine.ts · ingest",
  },
  {
    tag: "f₄ · save before erase",
    latex: String.raw`\text{save}_t\iff\sum_{c\in\mathcal L_t} d(c)\,|K_c|\;\ge\;48,\qquad \mathcal L_t=\Big\{c:\frac{|K_c\cap K'_c|}{|K_c|}<0.55\Big\}`,
    note: "When trusted cells show that remembered ink K is disappearing and that ink was never saved (d=1), the board is snapshotted the instant before it’s gone.",
    source: "engine.ts · compareWithComposite",
  },
  {
    tag: "f₅ · camera motion",
    latex: String.raw`s^{*}=\arg\min_{|s|\le 0.2W}\frac{1}{|\Omega_s|}\sum_{x\in\Omega_s}\big|P_{t-1}(x)-P_t(x+s)\big|`,
    note: "1-D ink profiles find a pan in microseconds. While the camera moves nothing is trusted; if it settles >1.5 cells away, the old view is saved and memory restarts clean.",
    source: "engine.ts · bestShift",
  },
  {
    tag: "f₆ · supersede",
    latex: String.raw`\text{drop }A\iff\exists B_{\text{later}}:\;\frac{|M_A\cap\tau_{s^{*}}M_B|}{|M_A|}\ge 0.86`,
    note: "A board whose ink is ≥86% contained in a later board (after shift alignment) is a draft of it. It is never sent to Gemini.",
    source: "supersede.ts · supersededBoards",
  },
];

/** Measured on the MIT 18.06SC recitation (16:35, panning camera, 640×360), saved lecture 4a760d603966. */
const FUNNEL = [
  { value: "995", unit: "s", label: "lecture video", note: "stays on the device", weight: 1 },
  { value: "1,200", unit: "frames", label: "analysed by the board engine", note: "f₁–f₅, in the browser", weight: 0.92 },
  { value: "21", unit: "snapshots", label: "saved before erase / pan", note: "only moments when ink would be lost", weight: 0.46 },
  { value: "9", unit: "boards", label: "sent to Gemini · 2 images each", note: "clean render + raw photo; f₆ dropped the drafts", weight: 0.34 },
  { value: "22", unit: "blocks", label: "read with boxes + LaTeX", note: "deduped, bad photos kept only where clear", weight: 0.3 },
  { value: "2", unit: "figures", label: "redrawn as vectors", note: "math-checked against the board’s own equations", weight: 0.18 },
  { value: "1", unit: "sheet", label: "two-page study sheet", note: "with the lecture’s real worked example", weight: 0.12 },
];

const AFTER = [
  { step: "prune", text: "Drafts and duplicate views dropped by ink-mask containment (f₆) before any API call." },
  { step: "read ∥ listen", text: "Each board is read (paper render + raw photo) while audio is transcribed in parallel 5-min chunks." },
  { step: "dedupe", text: "Blocks merged by text containment; a blurry copy with [?] matches its sharp twin as a wildcard." },
  { step: "bad-photo rule", text: "A board with ≥50% unclear blocks keeps only its clear ones — no guessing on smears." },
  { step: "compose", text: "Gemini proposes duplicates; each is confirmed in code against a similar kept twin, or it stays." },
  { step: "verify", text: "Redrawn plots are parsed back into lines and vectors and snapped to the board’s equations." },
];

export function Algorithm() {
  return (
    <>
      <section className="tech" id="algorithm">
        <div className="tech-inner">
          <div className="tech-heading">
            <span className="tech-eyebrow">// the algorithm · on-device, no AI</span>
            <h2>Six equations decide what’s worth sending.</h2>
            <p>Instead of streaming a whole video to a model, Chalkmark runs a small, deterministic vision system per frame. Every number below is the actual constant in the code.</p>
          </div>
          <div className="eq-grid">
            {EQUATIONS.map(eq => (
              <article key={eq.tag} className="eq-card">
                <header><span>{eq.tag}</span><code>{eq.source}</code></header>
                <div className="eq-math" dangerouslySetInnerHTML={{ __html: mathHtml(eq.latex, true) ?? eq.latex }} />
                <p>{eq.note}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="tech" id="paperwork">
        <div className="tech-inner">
          <div className="tech-heading">
            <span className="tech-eyebrow">// pixels → paper · measured on a real lecture</span>
            <h2>Gemini sees 18 images, not 995 frames.</h2>
            <p>A video upload is sampled at 1 frame per second: 995 frames, lecturer included. Here each stage throws away what the next one doesn’t need, so the model only sees the boards that matter — and then code, not the model, checks what comes back.</p>
          </div>
          <div className="funnel">
            {FUNNEL.map((row, i) => (
              <div key={row.unit} className="funnel-row" style={{ ["--w" as string]: row.weight, ["--i" as string]: i }}>
                <div className="funnel-bar"><strong>{row.value}</strong><span>{row.unit}</span></div>
                <div className="funnel-copy"><b>{row.label}</b><small>{row.note}</small></div>
              </div>
            ))}
          </div>
          <div className="compare">
            <div className="compare-row">
              <span>Whole video → Gemini</span>
              <div className="compare-track"><i style={{ width: "100%" }} className="bad" /></div>
              <strong>≈131k tokens</strong>
            </div>
            <div className="compare-row">
              <span>Chalkmark, every call</span>
              <div className="compare-track"><i style={{ width: `${(70 / 131) * 100}%` }} /></div>
              <strong>70k tokens</strong>
            </div>
            <p className="compare-note">Measured input tokens for the whole run (board reads, transcript, compose, redraws, sheet) vs. the video-only estimate for reading the same lecture once — and the video baseline still has the lecturer in front of the board. 57 s end-to-end for a 16.5-minute lecture.</p>
          </div>
          <ol className="after-steps">
            {AFTER.map((item, i) => <li key={item.step}><b>{String(i + 1).padStart(2, "0")} · {item.step}</b><span>{item.text}</span></li>)}
          </ol>
        </div>
      </section>
    </>
  );
}
