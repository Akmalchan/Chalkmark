import Link from "next/link";
import { Logo, Mascot } from "@/components/brand/Logo";
import { EngineDemo } from "@/components/landing/EngineDemo";
import { HowItWorks } from "@/components/landing/HowItWorks";

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
            <h2>Checked against a hand-made answer key.</h2>
            <p>MIT 18.06SC recitation “Geometry of Linear Algebra”: 16 minutes, panning camera, chalkboard, 640×360.</p>
          </div>
          <div className="metrics">
            <div><strong>14/15</strong><span>board items captured</span></div>
            <div><strong>6/6</strong><span>core items: problem, solution, matrix form</span></div>
            <div><strong>2/2</strong><span>figures pass the math check</span></div>
            <div><strong>0 MB</strong><span>of video uploaded</span></div>
          </div>
          <div className="compare">
            <div className="compare-row">
              <span>Send the whole video</span>
              <div className="compare-track"><i style={{ width: "100%" }} className="bad" /></div>
              <strong>≈131k tokens</strong>
            </div>
            <div className="compare-row">
              <span>Chalkmark, every call</span>
              <div className="compare-track"><i style={{ width: `${(70 / 131) * 100}%` }} /></div>
              <strong>70k tokens</strong>
            </div>
            <p className="compare-note">About half the tokens, counting every call (board reads, transcript, notes, redraws, study sheet), and the video baseline would still have the lecturer standing in front of the board. 57 seconds end-to-end.</p>
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
