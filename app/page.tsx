import Link from "next/link";
import { Logo, Mascot } from "@/components/brand/Logo";
import { EngineDemo } from "@/components/landing/EngineDemo";
import { HowItWorks } from "@/components/landing/HowItWorks";

const GITHUB_URL = "https://github.com/Akmalchan/Chalkmark";
const LINKEDIN_URL = "https://www.linkedin.com/in/ashovkatov";

/**
 * Vision tokens for the MIT 18.06SC recitation (995 s), measured with Gemini countTokens:
 * whole video 299,791 (high) / 102,583 (default) minus audio at 32 tokens/s; Chalkmark's 9 boards × 2 images = 19,809.
 */
const VISION_TOKENS = [
  { label: "Whole video · high res", tokens: 299_791 - 995 * 32, ours: false },
  { label: "Whole video · default", tokens: 102_583 - 995 * 32, ours: false },
  { label: "Chalkmark · 9 boards", tokens: 19_809, ours: true },
];

export default function Home() {
  return (
    <main className="landing-shell">
      <header className="landing-nav sticky">
        <Logo size="md" />
        <nav className="nav-links" aria-label="Sections">
          <a href="#demo">Live engine</a>
          <a href="#how">How it works</a>
          <a href="#results">Results</a>
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

      <HowItWorks />

      <section className="tech results" id="results">
        <div className="tech-inner">
          <div className="tech-heading">
            <span className="tech-eyebrow">// results · measured, not claimed</span>
            <h2>13× fewer tokens, checked against an answer key.</h2>
            <p>MIT 18.06SC recitation “Geometry of Linear Algebra”: 16 minutes, panning camera, chalkboard, 640×360.</p>
          </div>
          <div className="metrics">
            <div><strong>13×</strong><span>fewer vision tokens than the whole video at the same detail</span></div>
            <div><strong>60×</strong><span>smaller upload: 403 KB of boards vs a 24 MB video</span></div>
            <div><strong>14/15</strong><span>board items captured · all 6 core items</span></div>
            <div><strong>2/2</strong><span>figures pass the math check</span></div>
          </div>
          <div className="compare">
            <div className="compare-head"><span>Vision tokens Gemini has to read · measured with countTokens</span></div>
            {VISION_TOKENS.map(row => (
              <div key={row.label} className="compare-row">
                <span>{row.label}</span>
                <div className="compare-track"><i style={{ width: `${(row.tokens / VISION_TOKENS[0].tokens) * 100}%` }} className={row.ours ? undefined : "bad"} /></div>
                <strong className={row.ours ? "lime" : undefined}>{row.tokens.toLocaleString("en-US")}</strong>
              </div>
            ))}
            <p className="compare-note">Same lecture, same model family. Chalkmark reads its boards at high resolution because handwriting needs it, so the fair comparison is the video at high resolution: 13.5× fewer. Even against the default low-detail video it is 3.6× fewer, and that video still has the lecturer standing in front of the board. Audio (≈32 tokens/s) is the same either way and excluded.</p>
          </div>
          <div className="stack" aria-label="Built with">
            {["Gemini · Vertex AI", "Gemma 4", "MediaPipe", "Cloud Run", "Firestore", "Cloud Storage", "WebCodecs", "KaTeX"].map(item => <span key={item}>{item}</span>)}
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="footer-brand">
          <Logo size="sm" href={null} />
          <span>Made with <b aria-label="love">♥</b> by Akmal at SF Hacks × GDG, with Gemini on Google Cloud.</span>
        </div>
        <nav className="footer-links" aria-label="Links">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
          <a href={LINKEDIN_URL} target="_blank" rel="noreferrer">LinkedIn</a>
        </nav>
      </footer>
    </main>
  );
}
