# Chalkmark — hackathon playbook (SF Hacks × GDG, Fri Oct 2)

Hacking 11:00 → **submit by 4:45 (ShipYard, no late entries)** → 5-min table demos 5:00–5:45.
Tracks to enter: **GDG "Build with AI for Social Good"** and **SFSU "Build for SFSU"** (ask at check-in if one project can enter both; Gemma track is a bonus if time allows).

---

## 1. What exists right now (built and verified overnight)

| Piece | Status |
|---|---|
| Board-memory engine (`lib/board/engine.ts`) | ✅ unit-tested (lecturer removal, erase snapshots, fresh masks, exposure drift) |
| Clean "paper" rendering of boards (`lib/board/paper.ts`) | ✅ |
| Gemini board read → typed blocks + boxes (`/api/board/read`) | ✅ ~6 s per board on real handwriting fonts |
| Speech transcription (`/api/transcribe`) | ✅ live (rolling 75 s mic segments) and from recordings (audio extracted on-device) |
| Notes composition (`/api/compose`) + lossless assembly | ✅ with retry button if Gemini is busy |
| Studio: live camera / recorded video / **simulated camera** | ✅ end-to-end on the sample lecture (2 boards, 12 items, 9 speech lines) |
| Paper notes: typeset LaTeX, **real ink crops** for graphs/drawings with measured write times, board pages, transcript, Print/PDF, Markdown | ✅ |
| Save & share link + QR (`/l/[id]`) | ✅ locally (disk). Firestore + Cloud Storage code path written, **not yet run on GCP** |
| Cloud Run deploy (`Dockerfile`, `scripts/deploy-cloud-run.sh`) | ⚠️ written, `npm run build` passes, **not deployed yet** (needs your credits) |
| Real phone footage | ⚠️ **untested** — the #1 thing to do first tomorrow |

Pages: `/` landing · `/studio` live camera · `/studio?source=file` recording · `/studio?sample=1` bundled sample · `/studio?camera=simulated` simulated live camera · `/quick` old YouTube quick mode · `/lab` sample-video generator (dev only).

Run locally: `npm run dev` (Node 22: `/opt/homebrew/opt/node@22/bin`), open http://localhost:3000.

---

## 2. Tomorrow, in order

**Before 11:00 (setup only, no coding)**
- Bring: small whiteboard + 2–3 markers (black, blue, red) + eraser, phone stand / tripod, chargers.
- iPhone as webcam: same Apple ID + Wi-Fi/Bluetooth on → in Chrome the camera list shows "iPhone Camera". (Laptop webcam pointed at paper also works.)
- `brew install --cask google-cloud-sdk` and `gcloud auth login`.

**11:00–11:45 — Google Cloud (track requirement: must use the provided credits)**
1. Redeem the credits, create/select the project.
2. `cd ~/IdeaProjects/chalkmark && PROJECT=<project-id> ./scripts/deploy-cloud-run.sh`
   - enables Vertex AI, Cloud Run, Firestore, Cloud Storage, Cloud Build; creates the bucket + service account; deploys; prints the URL.
3. Open the URL → `/studio?sample=1` → Scan → Save & share. That one run proves Vertex (Gemini) + Firestore + Storage on credits.
   - If a model 404s on Vertex, the fallback chain moves on automatically; check logs: `gcloud run services logs read chalkmark --region us-central1`.
   - Camera needs HTTPS — Cloud Run gives you that.

**11:45–1:30 — Tune on real footage (the risky part)**
Prop the phone, frame the whiteboard, write → stand in front → erase → write. Watch the two live panels.
Knobs live in `DEFAULT_CONFIG` at the top of `lib/board/engine.ts`:

| Symptom | Fix |
|---|---|
| Faint marker not captured / clean view loses strokes | lower `inkThreshold` (64 → 50) |
| Board texture/glare shows up as "ink" | raise `inkThreshold` (64 → 80) |
| Lecturer's body leaks into "Board memory" | raise `minBoardFraction` (0.55 → 0.7) or `stableSeconds` (1.2 → 2) |
| Real writing takes forever to appear | lower `stableSeconds` (1.2 → 0.8) |
| Too many "saved before erase" boards | raise `minLostInk` (48 → 120) |
| An erase didn't save a board | lower `survivalRatio`… or press **Save board now** |

**1:30–3:30 — polish + backups**
- Record a 2–3 min real clip with the phone (write, stand in front, erase, draw a graph + a quick sketch). Run it through `/studio?source=file`, **Save & share**, keep the link — that's your backup demo if live fails.
- Optional extras if ahead: MediaPipe person mask, Gemma 4 live captions (see §7).

**3:30–4:30 — submit** (§6). Don't touch code after 4:15.

---

## 3. The 5-minute table demo

Have open in tabs: deployed `/studio` (camera framed), a finished shared notes link, the QR on screen.

1. **Problem (30 s)** — "Boards get erased. If you can't see the board, can't write fast enough, or are learning in your second language, that content is gone. Today, SF State students with a note-taking accommodation upload lecture recordings to a third-party service, photograph the board themselves, and wait 24–48 hours for typed notes. Chalkmark captures the board automatically and gives notes minutes after class — without keeping a recording." (Source: access.sfsu.edu/note-taking — DPRC uses Note-Taking Express.)
2. **Live (2 min)** — Start capturing. Write `f(x) = x² + 3x`, draw axes + a curve, sketch a car. *Stand in front of it* → point at **Board memory**: "it sees straight through me." Switch to **When written** (colored by time). **Erase** → a card pops in: *Saved before erase*, Gemini already reading it. Write one more line. **Finish & write notes.**
3. **The notes (1 min)** — typeset equations, the graph and the car are *your own ink*, cleaned, with the time each was written. "Print/PDF" works. **Save & share → QR** — judges scan it on their phones.
4. **Why it's smart (1 min)** — "We never send the video. On the device we flatten the board, trust a patch only when it's still, looks like board, and isn't next to a person — so the lecturer never enters memory. Every patch knows when it was written, and the instant unsaved ink is about to be erased, we keep the board. So the number of images depends on the lecture, not a frame rate. Gemini reads those few boards at full resolution with what was being said, so messy handwriting gets resolved by context. Look at the ledger: frames analyzed on-device, a handful of boards, 0 MB of video uploaded."
5. **Google stack (20 s)** — Gemini on **Vertex AI** (credits), **Cloud Run**, **Firestore**, **Cloud Storage**.
6. **Responsible AI (20 s)** — consent + privacy + accessibility (see Q&A).

If something breaks live: switch the camera dropdown to **Simulated camera** (same pipeline, sample lecture) or open the backup share link.

---

## 4. Judge Q&A cheat sheet

- **Why not just send the video to Gemini?** Gemini watches video at ~1 fps and low resolution (~70 tokens per frame) — handwriting is barely legible that way, and it costs tokens for every second. We send only the board states that matter, each at full resolution (~1,100 tokens per image), plus compressed audio. Longer lectures make the gap bigger, because boards scale with erasures, not minutes.
- **How do you remove the professor?** Per-cell rules: a cell must be still for ~1 s, look like board (robust brightness model of the board, fitted with outlier trimming so a body can't define "board"), and not touch an occluded cell. Bodies fail those tests; strokes pass.
- **How do you know when to save?** Every cell tracks if its ink is already in a saved snapshot. A commit that would remove *unsaved* ink triggers a snapshot of the whole board first. No content is lost; no duplicates are kept (each block is checked against which cells are new).
- **Are the timestamps made up?** No — they are measured: the engine records when ink first appeared in each cell. Gemini never invents times.
- **Can Gemini hallucinate the drawings?** Figures are cropped from the real ink, not redrawn. Gemini only writes captions/descriptions, and uncertain text is marked `[?]`.
- **What if the camera moves?** v1 needs a still camera (desk/tripod). Next: re-registration of the board each frame.
- **Privacy?** Video never leaves the device. Stored: cleaned board images + notes (Firestore/Storage in our project). Paid/Vertex usage isn't used for model training (the free AI Studio tier is).
- **Consent?** California's recording law (Penal Code 632) requires all-party consent for confidential conversations, and CSU campuses commonly require instructor permission to record class (I could not find SFSU's own policy text — say "follows the instructor-permission norm"). Chalkmark is meant to run with the instructor's OK or through DPRC: it never stores video, and the lecturer is removed from every image.
- **Accessibility?** Math renders as KaTeX with MathML for screen readers; clean high-contrast boards; transcript; print.
- **Bias / errors?** Handwriting recognition is weaker on unusual scripts and faint chalk; we show the original ink beside the reading and mark uncertainty instead of guessing.
- **What's next at SFSU?** A DPRC pilot alongside Note-Taking Express (board captured automatically, notes in minutes instead of 24–48 h), a fixed camera in large lecture halls, Canvas export, on-device Gemma for fully offline use.

---

## 5. Track requirement checklist

GDG — Build with AI for Social Good
- [x] Gemini is core (reads every board, transcribes, composes notes) — not a chatbot
- [x] Clear social problem (access to lecture content: disability, ESL, working students)
- [ ] ≥1 Google tool besides Gemini — Cloud Run, Firestore, Cloud Storage, Vertex AI (**after deploy**)
- [ ] Uses the provided credits (**after deploy**)
- [x] Working demo

SFSU — Build for SFSU
- [x] Clear SFSU problem: DPRC note-taking accommodations currently mean uploading recordings to Note-Taking Express and waiting 24–48 h (access.sfsu.edu/note-taking); beneficiaries: DPRC students, ESL students, commuters/working students, instructors
- [x] AI performs a meaningful function
- [x] Working prototype
- [x] Realistic path: DPRC pilot, classroom cameras, Canvas
- [x] Responsible AI: consent, privacy, accessibility, error handling (§4)
- [x] ≥1 SFSU student (you)

---

## 6. Submission draft (paste into ShipYard)

**Chalkmark — the board forgets, your notes don't.**
Point any camera at a whiteboard or chalkboard. Chalkmark removes the lecturer, saves every board right before it gets erased, and uses Gemini to turn the handwriting — equations, graphs, even sketches — into clean, typeset, shareable notes. The video never leaves your device.

How it works: on-device board memory (homography flattening, stable-cell compositing that ignores the lecturer, per-cell ink birth times, snapshot-before-erase), then Gemini on Vertex AI reads each saved board at full resolution with the spoken context, transcribes speech, and organises the notes. Figures are the lecturer's real ink, cleaned. Notes are saved in Firestore + Cloud Storage and shared by link/QR; the app runs on Cloud Run.

Built with: Next.js, TypeScript, Gemini (Vertex AI), Cloud Run, Firestore, Cloud Storage, Mediabunny/WebCodecs, KaTeX.

AI tools disclosure: built with Claude Code (Anthropic) as a coding assistant. The project grew from a prototype started before the event (organizers confirmed this was fine).

---

## 7. Optional extras (only if ahead of schedule)

- **MediaPipe person mask** — the engine already accepts a `personMask` (`BoardEngine.ingest(frame, t, mask)`); wiring MediaPipe's selfie segmenter makes occlusion bulletproof on chalkboards with dark clothes, and is another Google tool.
- **Gemma 4 captions** — `caption` task in `lib/ai/models.ts` already prefers `gemma-4-31b-it` via the Gemini API; a tiny route + a caption on each board card qualifies for the Gemma track.
- **YouTube board memory** — two-pass Gemini: find board-peak times at low resolution, then re-read those few seconds at high resolution (needs `videoMetadata` clipping via raw REST).

## 8. Honest limitations to say out loud if asked
Still camera required · sliding/multi-panel boards not handled · faint chalk at distance is limited by the camera · free-tier Gemini is flaky (that's why we run on Vertex) · real-classroom tuning is ongoing.
