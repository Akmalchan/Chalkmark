"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { fullFrameQuad, insetQuad, type Quad } from "@/lib/board/geometry";
import { DEFAULT_CONFIG, type EngineConfig } from "@/lib/board/engine";
import { extractAudioChunks, FrameGrabber, listCameras, loadVideo, restartSimulatedCamera, SegmentedRecorder, seekTo, SIMULATED_CAMERA, startCamera } from "@/lib/client/media";
import { LectureSession, type BoardState } from "@/lib/client/session";
import { PersonMasker } from "@/lib/client/person";
import { runYouTube } from "@/lib/client/youtube";
import { youtubeId } from "@/lib/source-metadata";
import { formatClock } from "@/lib/notes/assemble";
import type { NotesDoc } from "@/lib/notes/schema";
import { MathText } from "@/components/math";
import { SAMPLE_QUAD } from "@/lib/demo/synthetic-lecture";
import { CornerPicker } from "./CornerPicker";
import { BoardMemoryView, EngineOverlay, type MemoryMode } from "./LiveViews";
import { NotesActions } from "./NotesActions";
import { NotesPaper } from "@/components/NotesPaper";

type Source = "camera" | "file" | "youtube";
type Phase = "setup" | "running" | "finishing" | "done";

const LIVE_INTERVAL_MS = 330;

type NumericKey = { [K in keyof EngineConfig]: EngineConfig[K] extends number ? K : never }[keyof EngineConfig];
const TUNABLES: Array<{ key: NumericKey; label: string; min: number; max: number; step: number; hint: string }> = [
  { key: "inkThreshold", label: "Ink sensitivity threshold", min: 30, max: 120, step: 2, hint: "Lower catches faint marker; higher ignores glare and texture." },
  { key: "stableSeconds", label: "Seconds a patch must be still", min: 0.4, max: 4, step: 0.1, hint: "Higher keeps a slow-moving lecturer out; lower shows writing sooner." },
  { key: "minBoardFraction", label: "How board-like a patch must look", min: 0.3, max: 0.9, step: 0.05, hint: "Raise if clothing leaks into the board memory." },
  { key: "minLostInk", label: "Ink lost before a board is saved", min: 10, max: 300, step: 5, hint: "Raise if you get too many saved boards." },
];

export function Studio({ initialSource, sampleSrc, simulated = false, dry = false }: { initialSource: Source; sampleSrc?: string; simulated?: boolean; dry?: boolean }) {
  const [source, setSource] = useState<Source>(initialSource);
  const [phase, setPhase] = useState<Phase>("setup");
  const video = useRef<HTMLVideoElement>(null);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  const [quad, setQuad] = useState<Quad | null>(null);
  const [error, setError] = useState("");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string>("");
  const [media, setMedia] = useState<{ blob: Blob; name: string } | null>(null);
  const [useAudio, setUseAudio] = useState(true);
  const [usePersonMask, setUsePersonMask] = useState(true);
  const [tuning, setTuning] = useState<Partial<EngineConfig>>({});
  const [maskActive, setMaskActive] = useState(false);
  const [title, setTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [memoryMode, setMemoryMode] = useState<MemoryMode>("photo");
  const [tick, setTick] = useState(0);
  const [stage, setStage] = useState("");
  const [scan, setScan] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [doc, setDoc] = useState<NotesDoc | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [session, setSession] = useState<LectureSession | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<SegmentedRecorder | null>(null);
  const running = useRef(false);
  const audioJob = useRef<Promise<unknown> | null>(null);
  const objectUrl = useRef<string | null>(null);

  const ready = videoSize.width > 0 && quad !== null;

  const adoptVideoSize = useCallback(() => {
    const element = video.current!;
    setVideoSize({ width: element.videoWidth, height: element.videoHeight });
    setQuad(current => current ?? insetQuad(element.videoWidth, element.videoHeight, 0.06));
  }, []);

  /* ---------- sources ---------- */

  const openRequest = useRef(0);
  const openCamera = useCallback(async (deviceId?: string) => {
    const request = ++openRequest.current;
    setError("");
    stream.current?.getTracks().forEach(track => track.stop());
    try {
      try { stream.current = await startCamera(video.current!, deviceId, true); }
      catch (cause) { if (deviceId === SIMULATED_CAMERA) throw cause; stream.current = await startCamera(video.current!, deviceId, false); }
      if (request !== openRequest.current) return;
      setQuad(deviceId === SIMULATED_CAMERA ? (SAMPLE_QUAD as Quad) : null);
      adoptVideoSize();
      setCameras(await listCameras().catch(() => []));
    } catch (cause) {
      if (request !== openRequest.current) return;
      setError(cause instanceof Error && cause.name === "NotAllowedError"
        ? "Camera access was blocked. Allow the camera for this site, use the simulated camera, or upload a recording."
        : "No camera could be opened. Plug one in (an iPhone works through Continuity Camera), use the simulated camera, or upload a recording.");
    }
  }, [adoptVideoSize]);

  const openMedia = useCallback(async (blob: Blob, name: string) => {
    setError("");
    try {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(blob);
      video.current!.srcObject = null;
      await loadVideo(video.current!, objectUrl.current);
      await seekTo(video.current!, video.current!.duration * 0.15);
      setMedia({ blob, name });
      setQuad(null);
      adoptVideoSize();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This video could not be opened.");
    }
  }, [adoptVideoSize]);

  const loadSample = useCallback(async (src: string) => {
    setStage("Loading the sample lecture…");
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error("Sample lecture is missing.");
      const isSample = src === "/demo/sample-lecture.mp4";
      await openMedia(await response.blob(), isSample ? "Sample lecture" : decodeURIComponent(src.split("/").pop() ?? "Lecture"));
      if (isSample) { setQuad(SAMPLE_QUAD as Quad); setTitle(title => title || "Sample lecture"); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sample could not be loaded.");
    } finally { setStage(""); }
  }, [openMedia]);

  useEffect(() => {
    if (source === "camera") { if (simulated) setCameraId(SIMULATED_CAMERA); void openCamera(simulated ? SIMULATED_CAMERA : undefined); }
    else if (sampleSrc) void loadSample(sampleSrc);
    return () => { stream.current?.getTracks().forEach(track => track.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  /* ---------- capture ---------- */

  const finish = useCallback(async (active: LectureSession) => {
    running.current = false;
    setPhase("finishing");
    setStage("Saving the last board state");
    await recorder.current?.stop();
    stream.current?.getTracks().forEach(track => track.stop());
    const notes = await active.finish(setStage, audioJob.current ?? undefined);
    const map: Record<string, string> = {};
    for (const [name, blob] of active.files) map[name] = URL.createObjectURL(blob);
    setUrls(map);
    setDoc(notes);
    setPhase("done");
  }, []);

  const startLive = useCallback(async () => {
    const element = video.current!;
    if (cameraId === SIMULATED_CAMERA) restartSimulatedCamera();
    const grabber = new FrameGrabber(element);
    const active = new LectureSession("camera", grabber.toCapture(quad!), { stableSeconds: 1.2, ...tuning }, title);
    const wakeLock = await navigator.wakeLock?.request("screen").catch(() => null);
    const masker = usePersonMask ? await PersonMasker.create() : null;
    setMaskActive(Boolean(masker));
    setSession(active);
    setPhase("running");
    running.current = true;
    const started = performance.now();
    const clock = () => (performance.now() - started) / 1000;
    if (useAudio && stream.current?.getAudioTracks().length) {
      recorder.current = new SegmentedRecorder(stream.current, clock, (blob, offset) => { void active.transcribe(blob, offset); });
      recorder.current.start();
    }
    while (running.current) {
      const begin = performance.now();
      const t = clock();
      const frame = grabber.grab();
      active.ingest(frame, t, masker?.mask(grabber.canvas, t * 1000) ?? undefined);
      setTick(value => value + 1);
      setElapsed(t);
      await new Promise(resolve => setTimeout(resolve, Math.max(10, LIVE_INTERVAL_MS - (performance.now() - begin))));
    }
    masker?.close();
    await wakeLock?.release().catch(() => undefined);
  }, [quad, title, useAudio, cameraId, usePersonMask, tuning]);

  const startFile = useCallback(async () => {
    const element = video.current!;
    const duration = element.duration;
    const interval = Math.min(2, Math.max(0.5, duration / 1200));
    const grabber = new FrameGrabber(element);
    const active = new LectureSession("file", grabber.toCapture(quad!), { stableSeconds: Math.max(1.2, interval * 2.2), ...tuning }, title || media?.name, dry);
    (window as unknown as { __session?: LectureSession }).__session = active;
    const masker = usePersonMask ? await PersonMasker.create() : null;
    setMaskActive(Boolean(masker));
    setSession(active);
    setPhase("running");
    running.current = true;
    if (useAudio && media && !dry) {
      // Audio is pulled out locally and transcribed while the board is being scanned.
      audioJob.current = extractAudioChunks(media.blob, duration, 300)
        .then(chunks => Promise.all(chunks.map(chunk => active.transcribe(chunk.blob, chunk.offset))))
        .catch(cause => { active.warnings.push(`Speech was not transcribed: ${cause instanceof Error ? cause.message : "audio could not be extracted"}.`); });
    }
    let stalled = 0;
    for (let t = 0; t <= duration && running.current; t += interval) {
      if (!(await seekTo(element, t))) { stalled += 1; if (stalled > 5) break; continue; }
      const frame = grabber.grab();
      active.ingest(frame, t, masker?.mask(grabber.canvas, t * 1000) ?? undefined);
      setScan(t / duration);
      setElapsed(t);
      setTick(value => value + 1);
    }
    if (stalled > 5) active.warnings.push("The browser stopped seeking through this video, so the end of it was not scanned.");
    masker?.close();
    if (dry) { running.current = false; await active.pruneAndReadQueued(); setStage("Dry run finished: engine only, no Gemini calls"); return; }
    await finish(active);
  }, [quad, title, media, useAudio, usePersonMask, tuning, finish, dry]);

  const startYouTube = useCallback(async () => {
    setError("");
    setPhase("finishing");
    try {
      const notes = await runYouTube(youtubeUrl.trim(), setStage);
      if (title.trim()) notes.title = title.trim();
      setUrls({});
      setDoc(notes);
      setPhase("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This video could not be read.");
      setPhase("setup");
    } finally { setStage(""); }
  }, [youtubeUrl, title]);

  /* ---------- render ---------- */

  const revision = useSyncExternalStore(
    useCallback(listener => session?.subscribe(listener) ?? (() => {}), [session]),
    () => session?.revision ?? 0,
    () => 0,
  );
  void revision;

  if (phase === "done" && doc) {
    const retry = async () => {
      setStage("Writing your notes");
      const next = await session!.compose();
      setDoc(next);
      setStage("");
    };
    return (
      <main className="studio-done">
        <NotesActions doc={doc} files={session?.files ?? new Map()} urls={urls} onRestart={() => window.location.reload()} />
        {doc.composed === false && session && (
          <div className="retry-banner no-print">
            <span>Gemini was busy when writing the section summaries.</span>
            <button className="primary" disabled={Boolean(stage)} onClick={retry}>{stage ? "Writing…" : "Retry writing notes"}</button>
          </div>
        )}
        <NotesPaper doc={doc} urls={urls} />
      </main>
    );
  }

  const boards = session?.boards ?? [];
  const blocksRead = boards.reduce((sum, board) => sum + board.blocks.length, 0);

  return (
    <main className={`studio phase-${phase}`}>
      <header className="studio-bar app-chrome">
        <Link className="wordmark" href="/"><span>CM</span> CHALKMARK</Link>
        {phase === "setup" ? (
          <div className="source-switch" role="tablist">
            <button className={source === "camera" ? "active" : ""} onClick={() => setSource("camera")}>Live camera</button>
            <button className={source === "file" ? "active" : ""} onClick={() => { stream.current?.getTracks().forEach(track => track.stop()); setSource("file"); setVideoSize({ width: 0, height: 0 }); }}>Recorded video</button>
            <button className={source === "youtube" ? "active" : ""} onClick={() => { stream.current?.getTracks().forEach(track => track.stop()); setSource("youtube"); setVideoSize({ width: 0, height: 0 }); }}>YouTube link</button>
          </div>
        ) : (
          <div className="live-status">
            {source === "camera" ? <span className="rec"><i /> REC {formatClock(elapsed)}</span> : <span className="rec scanning"><i /> SCANNING {Math.round(scan * 100)}%</span>}
            <span>{session?.framesAnalyzed ?? 0} frames</span>
            <span>{boards.length} boards saved</span>
            <span>{blocksRead} items read</span>
            {maskActive && <span className="mask-chip">MediaPipe lecturer mask</span>}
            {session && session.transcript.length > 0 && <span>{session.transcript.length} lines of speech</span>}
          </div>
        )}
        <div className="bar-actions">
          {phase === "running" && source === "camera" && <>
            <button className="ghost" onClick={() => session?.captureNow()}>Save board now</button>
            <button className="primary" onClick={() => session && finish(session)}>Finish &amp; write notes</button>
          </>}
          {phase === "running" && source === "file" && <button className="ghost" onClick={() => { running.current = false; }}>Stop early</button>}
        </div>
      </header>

      <div className="studio-stage">
        <section className="panel camera-panel">
          <div className="video-frame">
            <video ref={video} playsInline muted onLoadedMetadata={() => { if (source === "camera") adoptVideoSize(); }} />
            {phase === "setup" && ready && <CornerPicker width={videoSize.width} height={videoSize.height} quad={quad!} onChange={setQuad} />}
            {phase !== "setup" && quad && <EngineOverlay engine={session?.engine ?? null} quad={quad} width={videoSize.width} height={videoSize.height} tick={tick} />}
            {source === "youtube" && (
              <div className="youtube-preview">
                {youtubeId(youtubeUrl.trim())
                  ? <iframe src={`https://www.youtube-nocookie.com/embed/${youtubeId(youtubeUrl.trim())}?rel=0`} title="Lecture preview" allow="encrypted-media; picture-in-picture" allowFullScreen />
                  : <div><strong>Paste a public lecture link</strong><span>Gemini scans it at low resolution to find every moment a board is fullest, then re-reads only those seconds at high resolution. Nothing is downloaded.</span></div>}
              </div>
            )}
            {!videoSize.width && source === "file" && (
              <label className="file-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void openMedia(file, file.name); }}>
                <input type="file" accept="video/*" onChange={event => { const file = event.target.files?.[0]; if (file) void openMedia(file, file.name); }} />
                <strong>Drop a lecture recording</strong>
                <span>MP4, MOV or WebM. It is scanned on this device; only board images and audio are sent.</span>
                <span className="file-button" role="button">Choose a video file</span>
                <button type="button" onClick={event => { event.preventDefault(); void loadSample("/demo/sample-lecture.mp4"); }}>or try the sample lecture</button>
              </label>
            )}
          </div>
          <div className="panel-label">{source === "youtube" ? "YouTube · board moments are found by Gemini" : phase === "setup" ? "Drag the corners onto the board" : "Camera · red = ignored (lecturer or motion)"}</div>
        </section>

        {phase === "setup" ? (
          source === "youtube" ? (
          <aside className="setup-panel">
            <h1>Read a lecture from YouTube</h1>
            <ol className="setup-steps">
              <li><b>Scan.</b> Gemini watches the whole lecture at low resolution and marks the last second before each board is erased.</li>
              <li><b>Zoom in.</b> Only those few seconds are re-read at high resolution, with what was being said.</li>
              <li><b>Write.</b> The same clean notes as live capture. Times are model-estimated (≈), not measured.</li>
            </ol>
            <label className="field"><span>Public YouTube link</span><input value={youtubeUrl} onChange={event => setYoutubeUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" inputMode="url" /></label>
            <label className="field"><span>Lecture title <em>(optional)</em></span><input value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Calculus I — derivatives" /></label>
            {error && <div className="error-box"><span>!</span><p>{error}</p></div>}
            <button className="start-button" disabled={!youtubeId(youtubeUrl.trim())} onClick={startYouTube}>Find &amp; read the boards</button>
            <p className="setup-privacy">For the full pipeline (lecturer removed, real ink figures, measured times) use a recording or a live camera.</p>
          </aside>
          ) : (
          <aside className="setup-panel">
            <h1>{source === "camera" ? "Point a camera at the board" : "Scan a recorded lecture"}</h1>
            <ol className="setup-steps">
              <li>
                <b>Frame the board.</b> Drag the four corners onto the board&apos;s edges. Chalkmark flattens it and ignores everything outside.
                {ready && <div className="inline-actions"><button onClick={() => setQuad(fullFrameQuad(videoSize.width, videoSize.height))}>Use whole frame</button><button onClick={() => setQuad(insetQuad(videoSize.width, videoSize.height, 0.06))}>Reset</button></div>}
              </li>
              <li><b>Keep the camera still.</b> A phone on a desk or tripod is perfect. Walk, write and erase freely.</li>
              <li><b>Teach.</b> Every board state is saved right before it gets erased, and read by Gemini while you keep going.</li>
            </ol>
            {source === "camera" && (
              <label className="field"><span>Camera</span>
                <select value={cameraId} onChange={event => { setCameraId(event.target.value); void openCamera(event.target.value || undefined); }}>
                  {!cameras.some(camera => camera.deviceId === cameraId) && cameraId !== SIMULATED_CAMERA && <option value={cameraId}>Default camera</option>}
                  {cameras.map(camera => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || "Camera"}</option>)}
                  <option value={SIMULATED_CAMERA}>Simulated camera (sample lecture)</option>
                </select>
              </label>
            )}
            {source === "file" && media && <div className="field-note">{media.name} · {formatClock(video.current?.duration ?? 0)}</div>}
            <label className="field"><span>Lecture title <em>(optional)</em></span><input value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Calculus I — derivatives" /></label>
            <label className="toggle"><input type="checkbox" checked={useAudio} onChange={event => setUseAudio(event.target.checked)} /><span>{source === "camera" ? "Record speech from the microphone" : "Transcribe the video's audio"}</span></label>
            <label className="toggle"><input type="checkbox" checked={usePersonMask} onChange={event => setUsePersonMask(event.target.checked)} /><span>Detect the lecturer with MediaPipe <em>(on-device)</em></span></label>
            <details className="tuning">
              <summary>Advanced · tune the board engine</summary>
              {TUNABLES.map(knob => {
                const value = tuning[knob.key] ?? (knob.key === "stableSeconds" && source === "camera" ? 1.2 : DEFAULT_CONFIG[knob.key]);
                return (
                  <label key={knob.key}>
                    <span>{knob.label} <b>{value}</b></span>
                    <input type="range" min={knob.min} max={knob.max} step={knob.step} value={value} onChange={event => setTuning(current => ({ ...current, [knob.key]: Number(event.target.value) }))} />
                    <small>{knob.hint}</small>
                  </label>
                );
              })}
              {Object.keys(tuning).length > 0 && <button type="button" onClick={() => setTuning({})}>Reset to defaults</button>}
            </details>
            {error && <div className="error-box"><span>!</span><p>{error}</p></div>}
            {stage && <div className="field-note">{stage}</div>}
            <button className="start-button" disabled={!ready} onClick={() => (source === "camera" ? startLive() : startFile())}>
              {source === "camera" ? "Start capturing" : "Scan this lecture"}
            </button>
            <p className="setup-privacy">The video never leaves this device. Chalkmark sends Gemini only the cleaned board images it keeps{useAudio ? " and compressed speech" : ""}.</p>
          </aside>
          )
        ) : (
          <section className="panel memory-panel">
            <div className="memory-frame"><BoardMemoryView engine={session?.engine ?? null} tick={tick} mode={memoryMode} /></div>
            <div className="panel-label">
              <span>Board memory · lecturer removed</span>
              <div className="mode-toggle">
                {(["photo", "clean", "timeline"] as MemoryMode[]).map(mode => <button key={mode} className={memoryMode === mode ? "active" : ""} onClick={() => setMemoryMode(mode)}>{mode === "photo" ? "Photo" : mode === "clean" ? "Clean" : "When written"}</button>)}
              </div>
            </div>
          </section>
        )}
      </div>

      {phase !== "setup" && <BoardStrip boards={boards} />}

      {phase === "finishing" && (
        <div className="finishing-overlay" role="status">
          <div><span className="spinner" /><strong>{stage || "Finishing"}</strong>{session ? <p>{boards.filter(board => board.status !== "skipped").length} board states worth reading · {blocksRead} items read so far</p> : <p>A 30-minute lecture takes a minute or two.</p>}</div>
        </div>
      )}
    </main>
  );
}

function BoardStrip({ boards }: { boards: BoardState[] }) {
  if (!boards.length) {
    return <div className="board-strip empty">Saved board states appear here: one right before every erase, plus the final board.</div>;
  }
  return (
    <div className="board-strip">
      {boards.map(board => (
        <article key={board.page.id} className={`board-card status-${board.status}`} title={board.skipReason}>
          <img src={board.paperUrl} alt={`Board saved at ${formatClock(board.page.t)}`} />
          <div className="board-card-body">
            <div className="board-card-head">
              <strong>{board.page.reason === "erase" ? "Saved before erase" : board.page.reason === "view" ? "Saved before the camera moved" : board.page.reason === "manual" ? "Saved manually" : "Final board"}</strong>
              <time>{formatClock(board.page.t)}</time>
            </div>
            {board.caption && <p className="board-caption" title={`Instant title by ${board.caption.model}`}><span>{board.caption.model.startsWith("gemma") ? "Gemma 4" : "AI"}</span>{board.caption.title}</p>}
            {board.status === "reading" && <p className="reading"><span className="spinner small" /> Gemini is reading this board…</p>}
            {board.status === "queued" && <p className="reading">Queued · read after the scan</p>}
            {board.status === "skipped" && <p className="reading">Skipped · {board.skipReason}</p>}
            {board.status === "error" && <p className="board-error">{board.error}</p>}
            {board.status === "done" && (
              <ul>
                {board.blocks.slice(0, 4).map(block => <li key={block.id}><span className={`chip kind-${block.kind}`}>{block.kind}</span><MathText text={block.kind === "equation" ? `$${block.content}$` : block.content} /></li>)}
                {board.blocks.length > 4 && <li className="more">+{board.blocks.length - 4} more</li>}
                {board.skipped > 0 && <li className="more">{board.skipped} already saved earlier</li>}
              </ul>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
