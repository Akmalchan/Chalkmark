# Chalkmark

**The board forgets. Your notes don't.**

Point any camera at a whiteboard or chalkboard. Chalkmark looks straight through the lecturer, saves every board the moment before it is erased, and Gemini turns the ink (equations, graphs, tables, sketches) into clean, typeset notes you can print or share. The video never leaves your device.

## How it works

```
camera / recording ──► on-device board memory ──► saved board states ──► Gemini ──► notes
                       (lib/board/engine.ts)        (clean "paper" PNGs)   (Vertex AI)
```

1. **Flatten the board.** Four corners → homography → a straight-on board split into a grid of cells.
2. **See through the lecturer.** Lighting is normalized against a robust model of the board's brightness (a quadratic surface fitted with outlier trimming, so a body can't define "board"). A cell's observation is trusted only when it has been still, looks like board plus strokes, and touches no occluded cell. The composite therefore never contains the lecturer.
3. **Save before erase.** Each cell records when its ink first appeared and whether that ink is already in a saved snapshot. When a commit would remove unsaved ink, the whole board is snapshotted first. The number of saved boards depends on the lecture, not a frame rate.
4. **Read, don't watch.** Each snapshot is rendered as clean "paper" (`lib/board/paper.ts`) and sent with the original photo and the speech around that time to Gemini, which returns typed blocks (text, LaTeX, tables, graphs, diagrams, drawings) with bounding boxes. Boxes are tightened to the real ink; figures are cropped from the lecturer's own strokes; each block gets its *measured* write time; blocks whose ink was already saved are dropped as re-reads.
5. **Compose.** Gemini groups blocks into sections and writes the connective explanation from the transcript. It never retypes board content, and a deterministic assembler guarantees every block appears exactly once.

Speech: live mode records the microphone in self-contained 75-second segments that are transcribed while class continues; recordings have their audio extracted on-device (WebCodecs via Mediabunny) and sent as small Opus chunks.

## Google Cloud

| Service | Role |
|---|---|
| Gemini on **Vertex AI** | board reading, transcription, note composition (strongest model first, automatic fallback) |
| **Cloud Run** | hosts the app (`Dockerfile`, `scripts/deploy-cloud-run.sh`) |
| **Firestore** | saved notes documents |
| **Cloud Storage** | board images and figure crops (never video) |
| **MediaPipe** (on-device) | person segmentation so the lecturer never enters board memory |
| **Gemma 4** (`gemma-4-26b-a4b-it` via the Gemini API) | instant topic titles for each saved board while the full Gemini read runs |

Locally, without `GOOGLE_VERTEX_PROJECT`, the app uses a Google AI Studio key (`GOOGLE_GENERATIVE_AI_API_KEY` in `.env.local`) and stores shared notes in `.data/`.

## Run it

```sh
nvm use 22            # or Homebrew node@22
npm ci
cp .env.example .env.local   # add GOOGLE_GENERATIVE_AI_API_KEY
npm run dev
```

- `/studio?source=camera`: live camera (an iPhone works through Continuity Camera; a "Simulated camera" plays the sample lecture)
- `/studio`: scan a recording, or `/studio?sample=1` for the bundled sample lecture
- `/studio?source=youtube`: YouTube board moments (Gemini scans at low resolution for the last second before each erase, then re-reads only those seconds at high resolution)
- `/l/<id>`: shared notes · `/quick`: older quick mode

Deploy: `PROJECT=<gcp-project> ./scripts/deploy-cloud-run.sh`

Checks: `npm test` · `npm run typecheck` · `npm run build`

## Limits

A still camera is required (desk or tripod). Sliding multi-panel boards and camera motion are not handled yet. Faint chalk far from the camera is limited by its resolution. Handwriting reads are AI interpretations: the original ink is always shown beside them and uncertain text is marked `[?]`.

## Credits

Built with Next.js, TypeScript, Gemini, Mediabunny, KaTeX. Built with help from Claude Code (Anthropic) as a coding assistant.
