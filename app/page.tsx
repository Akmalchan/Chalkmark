import Link from "next/link";
import { Logo, Mascot } from "@/components/brand/Logo";
import { EngineDemo } from "@/components/landing/EngineDemo";

export default function Home() {
  return (
    <main className="landing-shell">
      <header className="landing-nav sticky">
        <Logo size="md" />
        <nav className="nav-links" aria-label="Sections">
          <a href="#demo">Live engine</a>
          <a href="#pipeline">Pipeline</a>
          <a href="#accuracy">Accuracy</a>
        </nav>
        <div className="nav-actions">
          <Link className="nav-cta ghost" href="/studio?sample=1">Sample</Link>
          <Link className="nav-cta ghost" href="/studio?source=camera">Live capture</Link>
          <Link className="nav-cta primary" href="/studio">Scan a recording</Link>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="hero-mascot" aria-hidden="true"><Mascot size={96} /></div>
          <div className="hero-kicker">Lecture reconstruction, not recording</div>
          <h1>The board forgets.<br /><em>Your notes don’t.</em></h1>
          <p>Point any camera at the board. Chalkmark looks straight through the lecturer, saves every board the moment before it’s erased, and Gemini turns the ink — equations, graphs, even a sketch of a car — into a clean one-page study sheet.</p>
          <div className="hero-actions">
            <Link className="cta big primary" href="/studio">Scan a recording<span>MP4 / MOV / WebM · on-device</span></Link>
            <Link className="cta big" href="/studio?source=camera">Start live capture<span>phone or webcam</span></Link>
          </div>
          <Link className="cta-sample" href="/studio?sample=1">or watch it work on the sample lecture →</Link>
        </div>

        <div className="process-visual" aria-label="A board with a lecturer becomes saved board states and typeset notes">
          <div className="visual-input"><div className="video-grain" /><span className="rec-dot" /><div className="board-scribble">f′(x) = 2x + 3<br />v = dx/dt</div><small>CAMERA · LECTURER IN FRONT</small></div>
          <div className="visual-arrow"><span>board<br />memory</span>→</div>
          <div className="memory-stack"><div /><div /><div className="kept-frame"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg><span>saved before erase</span></div></div>
          <div className="visual-arrow">→</div>
          <div className="paper-output"><small>CALCULUS I</small><b>Derivatives<br />&amp; power rule</b><i /><i /><i className="short" /><span>0 MB video uploaded</span></div>
        </div>
      </section>

      <section className="tech" id="demo">
        <div className="tech-inner">
          <div className="tech-heading">
            <span className="tech-eyebrow">// live · the real engine, running in this page</span>
            <h2>It looks straight through the lecturer.</h2>
            <p>This is Chalkmark’s board engine processing a lecture right now, in your browser — no server, no AI. Every cell of the board must prove it is still, looks like board, and isn’t next to a person before it is trusted.</p>
          </div>
          <EngineDemo />
        </div>
      </section>

      <section className="tech pipeline-section" id="pipeline">
        <div className="tech-inner">
          <div className="tech-heading">
            <span className="tech-eyebrow">// pipeline</span>
            <h2>Four steps on your device. Three calls to Gemini.</h2>
          </div>
          <ol className="stages">
            <li>
              <PipelineArt kind="frames" />
              <b>01 · sample</b><h3>Frames, not video</h3>
              <p>~1 frame/s is decoded locally. The video file never leaves the device.</p>
            </li>
            <li>
              <PipelineArt kind="grid" />
              <b>02 · flatten</b><h3>Homography → grid</h3>
              <p>The board is warped straight-on and cut into a 32-column grid of cells with a lighting-robust ink model.</p>
            </li>
            <li>
              <PipelineArt kind="trust" />
              <b>03 · trust test</b><h3>See through people</h3>
              <p>Still for ≥1.2 s · looks like board · no occluded neighbour · MediaPipe person mask.</p>
            </li>
            <li>
              <PipelineArt kind="erase" />
              <b>04 · save before erase</b><h3>Keep what would be lost</h3>
              <p>Unsaved ink about to disappear triggers a snapshot. Camera pans are detected and handled.</p>
            </li>
            <li>
              <PipelineArt kind="read" />
              <b>05 · gemini read</b><h3>Boxes, LaTeX, figures</h3>
              <p>Each saved board → typed blocks with positions; timestamps are measured, never guessed.</p>
            </li>
            <li>
              <PipelineArt kind="check" />
              <b>06 · verify &amp; condense</b><h3>Math-checked figures</h3>
              <p>Redraws are snapped to the board’s own equations, then condensed into a 1–2 page sheet.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="tech accuracy" id="accuracy">
        <div className="tech-inner">
          <div className="tech-heading">
            <span className="tech-eyebrow">// measured, not claimed</span>
            <h2>Scored against a hand-checked answer key.</h2>
            <p>MIT 18.06SC recitation “Geometry of Linear Algebra” — 16 min, panning camera, chalkboard, 640×360.</p>
          </div>
          <div className="metrics">
            <div><strong>14/15</strong><span>board items captured</span></div>
            <div><strong>6/6</strong><span>core items (problem, solution, matrix form)</span></div>
            <div><strong>2/2</strong><span>figures pass the math check</span></div>
            <div><strong>21 → 9</strong><span>board states read after pruning</span></div>
            <div><strong>0 MB</strong><span>video uploaded</span></div>
          </div>
          <div className="stack" aria-label="Built with">
            {["Gemini · Vertex AI", "Gemma 4", "MediaPipe", "Cloud Run", "Firestore", "Cloud Storage", "WebCodecs", "KaTeX"].map(item => <span key={item}>{item}</span>)}
          </div>
        </div>
      </section>

      <section className="for-who">
        <div><h3>For students who can’t see the board</h3><p>Low vision, a bad seat, or a pillar in the way: the board comes to you, cleaned and readable.</p></div>
        <div><h3>For anyone who can’t write that fast</h3><p>Listen and think during class. Every erased derivation is still in your notes.</p></div>
        <div><h3>For learning in a second language</h3><p>Typeset math and a study sheet you can read at your own pace.</p></div>
      </section>

      <footer className="landing-footer"><span>Built at SF Hacks × GDG with Gemini on Google Cloud.</span><div><Link href="/studio?source=youtube">Only have a YouTube link? →</Link></div></footer>
    </main>
  );
}

/** Small technical diagrams for each pipeline stage (static SVG, theme colours via CSS classes). */
function PipelineArt({ kind }: { kind: "frames" | "grid" | "trust" | "erase" | "read" | "check" }) {
  if (kind === "frames") {
    return (
      <svg viewBox="0 0 220 110" className="pipe-art" aria-hidden="true">
        {[0, 1, 2, 3, 4].map(i => (
          <g key={i} transform={`translate(${8 + i * 42} 22)`}>
            <rect width="36" height="52" rx="3" className={i === 2 ? "pa-hot" : "pa-box"} />
            <path d="M6 14h18M6 22h12M6 30h20" className="pa-ink" />
            <text x="18" y="66" className="pa-mono" textAnchor="middle">{`0:${String(i * 7).padStart(2, "0")}`}</text>
          </g>
        ))}
        <path d="M8 98h204" className="pa-axis" /><text x="8" y="14" className="pa-mono">decode · 1 fps · local</text>
      </svg>
    );
  }
  if (kind === "grid") {
    return (
      <svg viewBox="0 0 220 110" className="pipe-art" aria-hidden="true">
        <path d="M10 22 L84 14 L92 92 L6 84 Z" className="pa-box" />
        <text x="10" y="106" className="pa-mono">camera quad</text>
        <path d="M98 54 h18 m-6 -5 l6 5 -6 5" className="pa-axis" />
        <g transform="translate(124 18)">
          <rect width="88" height="72" className="pa-box" />
          {[1, 2, 3, 4, 5, 6, 7].map(i => <path key={`v${i}`} d={`M${i * 11} 0 V72`} className="pa-grid" />)}
          {[1, 2, 3, 4, 5].map(i => <path key={`h${i}`} d={`M0 ${i * 12} H88`} className="pa-grid" />)}
          <path d="M8 18 h30 M8 30 h20" className="pa-ink" />
        </g>
        <text x="124" y="106" className="pa-mono">32-col cell grid</text>
      </svg>
    );
  }
  if (kind === "trust") {
    const occluded = new Set([3, 4, 11, 12, 13, 19, 20, 21, 27, 28, 29]);
    const inked = new Set([0, 1, 8, 9, 16, 24, 6, 7, 15]);
    return (
      <svg viewBox="0 0 220 110" className="pipe-art" aria-hidden="true">
        {Array.from({ length: 32 }, (_, i) => (
          <rect key={i} x={8 + (i % 8) * 16} y={14 + Math.floor(i / 8) * 16} width="14" height="14" rx="2"
            className={occluded.has(i) ? "pa-red" : inked.has(i) ? "pa-lime" : "pa-cell"} />
        ))}
        <g className="pa-mono">
          <text x="146" y="26">✓ still ≥ 1.2 s</text>
          <text x="146" y="44">✓ board-like</text>
          <text x="146" y="62">✓ no person</text>
          <text x="146" y="80">  nearby</text>
        </g>
        <text x="8" y="100" className="pa-mono">red = ignored · lime = trusted ink</text>
      </svg>
    );
  }
  if (kind === "erase") {
    return (
      <svg viewBox="0 0 220 110" className="pipe-art" aria-hidden="true">
        <path d="M14 92 H210 M14 92 V12" className="pa-axis" />
        <path d="M14 90 C 40 86, 60 60, 90 46 S 130 26, 140 24 L 146 84 C 160 80, 180 60, 206 48" className="pa-line" />
        <path d="M140 24 V92" className="pa-dash" />
        <circle cx="140" cy="24" r="5" className="pa-dot" />
        <text x="96" y="18" className="pa-mono">snapshot ↓</text>
        <text x="150" y="100" className="pa-mono">erase</text>
        <text x="18" y="22" className="pa-mono">unsaved ink</text>
      </svg>
    );
  }
  if (kind === "read") {
    return (
      <svg viewBox="0 0 220 110" className="pipe-art" aria-hidden="true">
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
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 220 110" className="pipe-art" aria-hidden="true">
      <path d="M14 92 H120 M30 100 V10" className="pa-axis" />
      <path d="M20 26 L84 98" className="pa-line" />
      <path d="M16 62 L118 34" className="pa-line alt" />
      <circle cx="56" cy="51" r="4.5" className="pa-dot" />
      <g className="pa-mono">
        <text x="130" y="30">✓ 2x+y=3</text>
        <text x="130" y="48">✓ x−2y=−1</text>
        <text x="130" y="66">✓ (1, 1)</text>
        <text x="130" y="88" className="pa-fix">v₂ → (1, −2)</text>
      </g>
    </svg>
  );
}
