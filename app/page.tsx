"use client";

import Image from "next/image";
import katex from "katex";
import { useMemo, useRef, useState } from "react";
import { LectureVisual } from "@/app/lecture-visual";
import { demoFrames, demoLecture } from "@/lib/demo-data";
import { extractMeaningfulFrames } from "@/lib/extract-frames";
import type { BoardFrame, LectureDocument } from "@/lib/lecture-schema";

type SourceMode = "upload" | "youtube";
type Stage = "idle" | "scanning" | "analyzing" | "done" | "error";

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
};

const dataUrlToBlob = async (dataUrl: string) => (await fetch(dataUrl)).blob();

const MATH_SEGMENT = /(\$\$[\s\S]+?\$\$|\$[^$]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g;

function cleanLatex(value: string): string {
  let cleaned = value.trim()
    .replace(/^```(?:latex|tex|math)?\s*/i, "")
    .replace(/\s*```$/, "")
    .replace(/^latex\s*:\s*/i, "")
    .trim();
  const wrappers: Array<[string, string]> = [["$$", "$$"], ["$", "$"], ["\\[", "\\]"], ["\\(", "\\)"]];
  for (const [start, end] of wrappers) {
    if (cleaned.startsWith(start) && cleaned.endsWith(end)) {
      cleaned = cleaned.slice(start.length, -end.length).trim();
      break;
    }
  }
  return cleaned.replace(/\\\\(?=[A-Za-z])/g, "\\");
}

function mathHtml(value: string, displayMode: boolean): string | null {
  try {
    return katex.renderToString(cleanLatex(value), { throwOnError: true, displayMode, strict: false });
  } catch {
    return null;
  }
}

function MathText({ text }: { text: string }) {
  const segments = text.split(MATH_SEGMENT).filter(Boolean);
  const looksLikeStandaloneMath = segments.length === 1 && /\\[A-Za-z]+|[_^]\{/.test(text) && /[=<>+−-]/.test(text);

  if (looksLikeStandaloneMath) {
    const html = mathHtml(text, false);
    if (html) return <span className="inline-math standalone-math" dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return <>{segments.map((segment, index) => {
    const isWrappedMath = /^(\$\$|\$|\\\(|\\\[)/.test(segment);
    const html = isWrappedMath ? mathHtml(segment, segment.startsWith("$$") || segment.startsWith("\\[")) : null;
    return html ? <span className="inline-math" key={index} dangerouslySetInnerHTML={{ __html: html }} /> : <span key={index}>{segment}</span>;
  })}</>;
}

function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (url.hostname === "youtube.com" || url.hostname === "www.youtube.com") return url.searchParams.get("v");
  } catch {
    return null;
  }
  return null;
}

function Icon({ name }: { name: "upload" | "link" | "spark" | "check" | "download" | "memory" | "play" }) {
  const paths: Record<typeof name, React.ReactNode> = {
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 14v5h14v-5"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/></>,
    spark: <path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Zm7 14 .5 2 2 .5-2 .5-.5 2-.5-2-2-.5 2-.5.5-2Z"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 20h14"/></>,
    memory: <><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6v6H9zM9 1v3m6-3v3M9 20v3m6-3v3M1 9h3m-3 6h3m16-6h3m-3 6h3"/></>,
    play: <path d="m9 7 8 5-8 5V7Z"/>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function Equation({ latex, meaning }: { latex: string; meaning: string }) {
  const html = useMemo(() => mathHtml(latex, true), [latex]);
  if (!html) return <figure className="equation equation-fallback"><div>{cleanLatex(latex).replaceAll("\\", "")}</div><figcaption>{meaning}</figcaption></figure>;
  return <figure className="equation"><div dangerouslySetInnerHTML={{ __html: html }} /><figcaption>{meaning}</figcaption></figure>;
}

function SourceCard({ frame }: { frame: BoardFrame }) {
  return (
    <figure className="source-card">
      <div className="source-image">
        <Image src={frame.dataUrl.trim()} alt={`Original board at ${formatTime(frame.timestampSeconds)}`} width={frame.width} height={frame.height} unoptimized />
        <span>{formatTime(frame.timestampSeconds)}</span>
      </div>
      <figcaption><i /> Original board state · locally selected</figcaption>
    </figure>
  );
}

function VideoEvidence({ videoId, timestampSeconds, title }: { videoId: string; timestampSeconds: number | null; title: string }) {
  const [playing, setPlaying] = useState(false);
  const start = Math.max(0, Math.floor(timestampSeconds ?? 0));
  return (
    <figure className="video-evidence">
      <div className="evidence-heading"><span>Compare with the source video</span><time>{timestampSeconds === null ? "Timing unavailable" : `Approx. ${formatTime(start)}`}</time></div>
      <div className="video-frame">
        {playing ? (
          <iframe src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?start=${start}&rel=0&autoplay=1`} title={`${title} in the original lecture at ${formatTime(start)}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
        ) : (
          <button className="video-poster" style={{ backgroundImage: `linear-gradient(rgba(12,20,17,.08), rgba(12,20,17,.55)), url(https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg)` }} onClick={() => setPlaying(true)} aria-label={`Play the original lecture from ${formatTime(start)}`}>
            <span><Icon name="play" /> {timestampSeconds === null ? "Open original lecture" : `Play from ${formatTime(start)}`}</span>
          </button>
        )}
      </div>
      <figcaption>Video thumbnail, not a captured board frame. {timestampSeconds === null ? "Generated timestamps could not be validated." : "The jump time is AI-estimated; compare the actual board before trusting the reconstruction."}</figcaption>
    </figure>
  );
}

function NotesView({ document, frames, youtubeUrl, onReset }: { document: LectureDocument; frames: BoardFrame[]; youtubeUrl: string | null; onReset: () => void }) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const frameMap = new Map(frames.map((frame) => [frame.id, frame]));
  const videoId = youtubeUrl ? youtubeVideoId(youtubeUrl) : null;
  const showTimes = document.timelineStatus === "in_range" || !document.timelineStatus;
  const lengthLabel = document.durationSeconds > 0 ? formatTime(document.durationSeconds) : "Unknown";

  const exportMarkdown = () => {
    const body = [
      `# ${document.title}`,
      `_${document.course} · ${lengthLabel}_`,
      "",
      document.summary,
      ...(document.warnings ?? []).map(warning => `> ${warning}`),
      "",
      ...document.sections.flatMap((section) => [
        `## ${section.title}${showTimes ? ` (approx. ${formatTime(section.startSeconds)}–${formatTime(section.endSeconds)})` : ""}`,
        "",
        section.overview,
        "",
        ...section.boardContent.map((item) => `- ${item}`),
        ...section.equations.flatMap((item) => ["", `$$${item.latex}$$`, `_${item.meaning}_`]),
        ...(section.spokenDetails.length ? ["", "### Spoken explanation (paraphrased)", ...section.spokenDetails.map((item) => `- ${item}`)] : []),
        ...(section.visual ? ["", `### Visual interpretation: ${section.visual.title}`, section.visual.description, section.visual.uncertainty ?? "Compare with the original lecture.",
          ...(section.visual.panels ?? []).flatMap(panel => [panel.title, ...panel.series.map(series => `- ${series.label}${series.expression ? `: ${series.expression}` : " (qualitative trace)"}`)]),
          ...(section.visual.table ? ["", `| ${section.visual.table.columns.join(" | ")} |`, `| ${section.visual.table.columns.map(()=>"---").join(" | ")} |`, ...section.visual.table.rows.map(row=>`| ${row.join(" | ")} |`)] : [])] : []),
        ...(section.takeaways.length ? ["", "### Takeaways", ...section.takeaways.map((item) => `- ${item}`)] : []),
        "",
      ]),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/markdown" }));
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${document.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lecture-notes"}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="notes-shell">
      <header className="notes-topbar">
        <button className="wordmark" onClick={onReset}><span>CM</span> CHALKMARK</button>
        <div className="top-actions">
          <button className="ghost-button" onClick={() => setTranscriptOpen((value) => !value)}>Speech excerpts · {document.transcript.length}</button>
          <button className="export-button" onClick={exportMarkdown}><Icon name="download" /> Export notes</button>
        </div>
      </header>

      <article className="notes-document">
        <div className="document-kicker"><span>{document.course}</span><i /> Reconstructed lecture</div>
        <h1>{document.title}</h1>
        <p className="document-summary">{document.summary}</p>
        {(document.warnings ?? []).length > 0 && <aside className="quality-notice" role="status">{document.warnings!.map((warning,i)=><p key={i}>{warning}</p>)}</aside>}
        <div className="document-stats">
          <div><strong>{lengthLabel}</strong><span>{document.durationVerified ? "source video length" : "lecture length"}</span></div>
          <div><strong>{document.sections.length}</strong><span>sections</span></div>
          <div><strong>{videoId ? "Video" : frames.length}</strong><span>{videoId ? "input to Gemini" : "board states kept"}</span></div>
          <div className="zero-store"><strong>0 MB</strong><span>source video stored</span></div>
        </div>

        {transcriptOpen && (
          <section className="transcript-panel">
            <div className="section-label">Selected speech excerpts · not a complete transcript</div>
            {document.transcript.map((line, index) => (
              <div className="transcript-line" key={`${line.timestampSeconds}-${index}`}>
                <time>{showTimes ? `~${formatTime(line.timestampSeconds)}` : "—"}</time><p><strong>{line.speaker}</strong>{line.text}</p>
              </div>
            ))}
          </section>
        )}

        <div className="timeline-line" />
        {document.sections.map((section, index) => {
          const sectionFrames = section.frameIds.map((id) => frameMap.get(id)).filter((item): item is BoardFrame => Boolean(item));
          return (
            <section className="lecture-section" key={section.id}>
              <aside className="section-index"><span>{String(index + 1).padStart(2, "0")}</span>{showTimes && <time>~{formatTime(section.startSeconds)}</time>}</aside>
              <div className="section-content">
                <div className="section-label">{showTimes ? `Approx. ${formatTime(section.startSeconds)} — ${formatTime(section.endSeconds)}` : "Timing not verified"}</div>
                <h2>{section.title}</h2>
                <p className="section-overview">{section.overview}</p>

                {sectionFrames.length > 0 && <div className="source-grid">{sectionFrames.map((frame) => <SourceCard frame={frame} key={frame.id} />)}</div>}
                {videoId ? <VideoEvidence videoId={videoId} timestampSeconds={showTimes ? (section.visual?.sourceTimestampSeconds ?? section.startSeconds) : null} title={section.title} /> : null}

                {section.boardContent.length > 0 && (
                  <div className="reconstruction-card">
                    <div className="card-eyebrow"><Icon name="spark" /> Clean board reconstruction</div>
                    <ul>{section.boardContent.map((item, itemIndex) => <li key={itemIndex}><MathText text={item} /></li>)}</ul>
                  </div>
                )}

                {section.equations.map((equation, equationIndex) => <Equation {...equation} key={`${equation.latex}-${equationIndex}`} />)}

                {section.visual ? <LectureVisual visual={section.visual} /> : null}
                {section.diagram && <div className="diagram-note"><span>Diagram</span><p>{section.diagram}</p></div>}

                {section.spokenDetails.length > 0 && (
                  <div className="spoken-block"><div className="sound-wave">▮▮▮</div><div><span>Spoken explanation · paraphrased</span>{section.spokenDetails.map((detail, detailIndex) => <p key={detailIndex}><MathText text={detail} /></p>)}</div></div>
                )}

                {section.takeaways.length > 0 && <div className="takeaways"><span>Keep this</span><ul>{section.takeaways.map((item, itemIndex) => <li key={itemIndex}><MathText text={item} /></li>)}</ul></div>}
              </div>
            </section>
          );
        })}
      </article>
      <footer className="notes-footer"><span>CHALKMARK</span><p>What was erased is no longer lost.</p><button onClick={onReset}>Process another lecture →</button></footer>
    </main>
  );
}

export default function Home() {
  const [mode, setMode] = useState<SourceMode>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Ready when you are");
  const [error, setError] = useState("");
  const [document, setDocument] = useState<LectureDocument | null>(null);
  const [frames, setFrames] = useState<BoardFrame[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStage("idle"); setProgress(0); setStatus("Ready when you are"); setError(""); setDocument(null); setFrames([]);
  };

  const chooseFile = (next: File | null) => {
    if (!next) return;
    if (!next.type.startsWith("video/")) { setError("Choose an MP4, MOV, or WebM video."); return; }
    if (next.size > 85 * 1024 * 1024) { setError("Keep uploads under 85 MB for this test build, or use a YouTube link."); return; }
    setFile(next); setError("");
  };

  const processLecture = async () => {
    if (mode === "upload" && !file) { setError("Choose a lecture video first."); return; }
    if (mode === "youtube" && !youtubeUrl.trim()) { setError("Paste a public YouTube lecture URL first."); return; }
    setError(""); setStage(mode === "upload" ? "scanning" : "analyzing"); setProgress(mode === "upload" ? 2 : 18);
    const form = new FormData();

    try {
      let selectedFrames: BoardFrame[] = [];
      if (mode === "upload" && file) {
        const extraction = await extractMeaningfulFrames(file, (value, message) => { setProgress(value); setStatus(message); });
        selectedFrames = extraction.frames;
        setFrames(selectedFrames);
        form.append("sourceType", "upload");
        form.append("sourceName", file.name);
        form.append("video", file);
        form.append("durationSeconds", String(extraction.durationSeconds));
        form.append("frameMeta", JSON.stringify(selectedFrames.map(({ id, timestampSeconds }) => ({ id, timestampSeconds }))));
        for (const frame of selectedFrames) form.append(`frame:${frame.id}`, await dataUrlToBlob(frame.dataUrl), `${frame.id}.jpg`);
      } else {
        form.append("sourceType", "youtube");
        form.append("sourceName", youtubeUrl);
        form.append("youtubeUrl", youtubeUrl.trim());
        form.append("frameMeta", "[]");
      }

      setStage("analyzing"); setProgress(44); setStatus("Gemini is aligning speech with the visual timeline");
      const response = await fetch("/api/reconstruct", { method: "POST", body: form });
      const payload = await response.json() as { document?: LectureDocument; error?: string };
      if (!response.ok || !payload.document) throw new Error(payload.error || "The lecture could not be reconstructed.");
      setProgress(100); setStatus("Lecture memory reconstructed"); setStage("done"); setDocument(payload.document);
    } catch (caught) {
      setStage("error"); setProgress(0); setError(caught instanceof Error ? caught.message : "Something went wrong.");
    }
  };

  if (document) return <NotesView document={document} frames={frames} youtubeUrl={mode === "youtube" ? youtubeUrl.trim() : null} onReset={reset} />;

  return (
    <main className="landing-shell">
      <nav className="landing-nav"><div className="wordmark"><span>CM</span> CHALKMARK</div><div className="thesis"><i /> Continuous visual memory</div></nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="hero-kicker">Lecture reconstruction, not recording</div>
          <h1>The board forgets.<br/><em>Your notes don’t.</em></h1>
          <p>Turn a lecture video into clean, chronological notes that remember what was said, written, and erased.</p>
          <div className="privacy-proof"><Icon name="memory" /><div><strong>Only meaningful board states survive</strong><span>Frames are scored locally. The source video is never saved.</span></div></div>
        </div>

        <div className="process-visual" aria-label="Video becomes selected board states and polished notes">
          <div className="visual-input"><div className="video-grain"/><span className="rec-dot"/><div className="board-scribble">∫ f(x) dx<br/>= F(b) − F(a)</div><small>FULL LECTURE · TRANSIENT</small></div>
          <div className="visual-arrow"><span>local<br/>change<br/>detection</span>→</div>
          <div className="memory-stack"><div/><div/><div className="kept-frame"><Icon name="check"/><span>08 frames kept</span></div></div>
          <div className="visual-arrow">→</div>
          <div className="paper-output"><small>LECTURE 04</small><b>Fundamental<br/>Theorem</b><i/><i/><i className="short"/><span>0 MB video stored</span></div>
        </div>
      </section>

      <section className="ingest-card">
        <div className="mode-tabs">
          <button className={mode === "upload" ? "active" : ""} onClick={() => { setMode("upload"); setError(""); }}><Icon name="upload" /> Upload video</button>
          <button className={mode === "youtube" ? "active" : ""} onClick={() => { setMode("youtube"); setError(""); }}><Icon name="link" /> YouTube URL</button>
        </div>

        {mode === "upload" ? (
          <div className={`drop-zone ${dragActive ? "dragging" : ""} ${file ? "has-file" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={(event) => { event.preventDefault(); setDragActive(false); chooseFile(event.dataTransfer.files[0] || null); }}>
            <input ref={fileInput} type="file" accept="video/mp4,video/quicktime,video/webm,video/*" onChange={(event) => chooseFile(event.target.files?.[0] || null)} />
            <div className="drop-icon"><Icon name={file ? "check" : "upload"} /></div>
            {file ? <><strong>{file.name}</strong><span>{(file.size / 1024 / 1024).toFixed(1)} MB · ready to scan locally</span><button onClick={() => fileInput.current?.click()}>Choose a different video</button></> : <><strong>Drop a lecture video here</strong><span>MP4, MOV, or WebM · up to 85 MB for the prototype</span><button onClick={() => fileInput.current?.click()}>Browse files</button></>}
          </div>
        ) : (
          <div className="url-field"><label htmlFor="youtube">Public YouTube lecture</label><div><Icon name="link"/><input id="youtube" type="url" value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" /></div><span>Gemini reads the public video directly. Nothing is downloaded to this app.</span></div>
        )}

        {(stage === "scanning" || stage === "analyzing") && <div className="progress-wrap"><div className="progress-copy"><span>{status}</span><strong>{progress}%</strong></div><div className="progress-track"><i style={{ width: `${progress}%` }} /></div><div className="pipeline"><span className={progress > 3 ? "complete" : ""}>Ingest</span><span className={progress > 28 ? "complete" : ""}>Board states</span><span className={progress > 43 ? "active" : ""}>Gemini synthesis</span><span>Notes</span></div></div>}
        {error && <div className="error-box"><span>!</span><p>{error}</p></div>}

        <button className="process-button" disabled={stage === "scanning" || stage === "analyzing"} onClick={processLecture}><Icon name="spark" />{stage === "scanning" || stage === "analyzing" ? "Reconstructing…" : "Reconstruct lecture"}</button>
        <button className="demo-button" onClick={() => { setFrames(demoFrames); setDocument(demoLecture); setStage("done"); }}>No video handy? <span>Open the 90-second sample output →</span></button>
      </section>

      <section className="how-it-works"><div className="section-heading"><span>How it works</span><p>Three passes. No archive of the source video.</p></div><div className="steps"><div><b>01</b><h3>Notice change</h3><p>A lightweight browser pass compares low-resolution frames and rejects duplicate or transient states.</p></div><div><b>02</b><h3>Understand context</h3><p>Gemini aligns timestamped speech with the few board states that carry new information.</p></div><div><b>03</b><h3>Rebuild memory</h3><p>Clean sections preserve equations, diagrams, explanations, and content erased later.</p></div></div></section>
      <footer className="landing-footer"><span>Built for lectures that move faster than your pen.</span><div><i /> VIDEO STORED: NEVER</div></footer>
    </main>
  );
}
