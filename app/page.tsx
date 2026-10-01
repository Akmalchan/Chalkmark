import Link from "next/link";

export default function Home() {
  return (
    <main className="landing-shell">
      <nav className="landing-nav">
        <div className="wordmark"><span>CM</span> CHALKMARK</div>
        <div className="thesis"><i /> Board memory for every lecture</div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="hero-kicker">Lecture reconstruction, not recording</div>
          <h1>The board forgets.<br /><em>Your notes don’t.</em></h1>
          <p>Point any camera at the board. Chalkmark looks straight through the lecturer, saves every board the moment before it’s erased, and Gemini turns the ink — equations, graphs, even a sketch of a car — into clean, typeset notes.</p>
          <div className="hero-actions">
            <Link className="cta primary" href="/studio">Start live capture</Link>
            <Link className="cta" href="/studio?source=file">Scan a recording</Link>
            <Link className="cta subtle" href="/studio?sample=1">Try the sample lecture →</Link>
          </div>
          <div className="privacy-proof">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 9h6v6H9zM9 1v3m6-3v3M9 20v3m6-3v3M1 9h3m-3 6h3m16-6h3m-3 6h3" /></svg>
            <div><strong>The video never leaves your device</strong><span>Only the cleaned board states and compressed speech are sent to Gemini.</span></div>
          </div>
        </div>

        <div className="process-visual" aria-label="A board with a lecturer becomes saved board states and typeset notes">
          <div className="visual-input"><div className="video-grain" /><span className="rec-dot" /><div className="board-scribble">f′(x) = 2x + 3<br />v = dx/dt</div><small>CAMERA · LECTURER IN FRONT</small></div>
          <div className="visual-arrow"><span>board<br />memory</span>→</div>
          <div className="memory-stack"><div /><div /><div className="kept-frame"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg><span>saved before erase</span></div></div>
          <div className="visual-arrow">→</div>
          <div className="paper-output"><small>CALCULUS I</small><b>Derivatives<br />&amp; power rule</b><i /><i /><i className="short" /><span>0 MB video uploaded</span></div>
        </div>
      </section>

      <section className="how-it-works">
        <div className="section-heading"><span>How it works</span><p>Four steps on your device, one smart read in the cloud.</p></div>
        <div className="steps four">
          <div><b>01</b><h3>Flatten the board</h3><p>Four corners and a homography turn an angled phone shot into a straight-on board, split into a grid of cells.</p></div>
          <div><b>02</b><h3>See through the lecturer</h3><p>A cell is trusted only when it has been still, looks like board and ink, and touches nothing occluded. The lecturer never enters memory.</p></div>
          <div><b>03</b><h3>Save before erase</h3><p>Every cell knows when its ink was written. The moment unsaved ink is about to disappear, the whole board is kept — never a fixed frame rate.</p></div>
          <div><b>04</b><h3>Read, don’t watch</h3><p>Gemini reads each saved board at full resolution, with what was being said, and returns LaTeX, tables, and figure boxes cropped from the real ink.</p></div>
        </div>
      </section>

      <section className="for-who">
        <div><h3>For students who can’t see the board</h3><p>Low vision, a bad seat, or a pillar in the way: the board comes to you, cleaned and readable.</p></div>
        <div><h3>For anyone who can’t write that fast</h3><p>Listen and think during class. Every erased derivation is still in your notes.</p></div>
        <div><h3>For learning in a second language</h3><p>Typeset math and a transcript you can read at your own pace, linked to when it was written.</p></div>
      </section>

      <footer className="landing-footer"><span>Built at SF Hacks × GDG with Gemini on Google Cloud.</span><div><Link href="/quick">YouTube link? Quick mode →</Link></div></footer>
    </main>
  );
}
