# Chalkmark

**Continuous visual memory for lectures without storing the whole lecture video.**

Chalkmark is a hackathon prototype that accepts a local lecture video or a public YouTube URL and combines speech excerpts with evolving whiteboard content to produce structured study notes. Uploaded video frames are sampled and scored in the browser; selected board states are kept in memory for the final document. The current prototype still sends the full input video to Gemini. Sparse-only audio and frame processing is future work.

## Run it

1. Copy `.env.example` to `.env.local` and add a Google AI Studio API key. This private file is intentionally not committed or sent to the browser.
2. Use Node 22 (the project includes an `.nvmrc`), then install dependencies with `npm ci`.
3. Start the app with `npm run dev` and open `http://localhost:3000`.

The **sample output** button and `/visual-check` drawing examples work without an API key. Real processing tries the optional `GEMINI_MODEL` override first, followed by the configured fallback models. Google capacity and quota restrictions can still prevent a run from completing.

The same three steps work on another laptop. Each local machine needs its own `.env.local`; embedding an API key in the code would expose it to anyone who opens the site. For a single URL that works from any laptop, deploy the app and save the key as a server-side environment variable on the host.

Local development uses Webpack because this project lives in a cloud-synced Documents folder where Turbopack's disk cache can be offloaded by macOS. `npm run dev:turbo` remains available when the project is in a normal local folder.

## Prototype data flow

### Uploaded video

1. The browser seeks through at most 72 low-resolution samples.
2. A persistence-aware difference score rejects duplicates and transient obstructions.
3. Up to 10 board states are compressed to JPEG in memory.
4. The source video is sent transiently to Gemini for audio/transcript understanding, together with the selected board states.
5. Gemini returns validated structured notes. No source video is written to disk.

### YouTube URL

The public URL is passed directly to Gemini's YouTube video input. This path does not run the browser's local frame detector. Source duration is read from YouTube metadata; if unavailable, the app hides the guessed duration and timestamps. Playback links are approximate model-generated positions, and the poster is a video thumbnail, not a captured board frame.

Equations are rendered with KaTeX. Graphs use a restricted arithmetic parser (no generated JavaScript execution) to calculate curves from extracted formulas. The drawing format supports separate graph panels, explicit ticks, secants, tangents, triangles, points, arrows, and math tables. Concept-diagram labels wrap instead of truncating.

Gemini returns JSON, which is validated locally with Zod before rendering; the full nested drawing schema is provided in the prompt because provider-side schema enforcement rejected it. Timeline checks detect out-of-range or disordered timestamps and hide unreliable timing links. These checks do not establish that a timestamp or drawing matches the actual lecture. Speech excerpts are not a complete transcript, and spoken explanations are labeled as paraphrases.

## Check the prototype

```sh
npm test
npm run typecheck
npm run build
```

Tests cover persistent-frame selection, duration provenance, impossible timelines, formula evaluation, discontinuities, and graph/table rendering. `/visual-check` contains clearly labeled synthetic drawing examples. Real lecture content still needs comparison with the source.

## Data handling

The app does not write source videos to disk. Uploaded videos, selected frames, and public YouTube URLs are sent to Google's Gemini service for processing; provider retention and data-use policies still apply. Results remain in the browser unless exported. `.env.local`, dependencies, IDE settings, scratch files, and generated reviews are excluded from Git.

## Live-class path

The processing boundary already separates visual memory from synthesis. For live use, replace the video file with:

- webcam frames sampled locally through the same change detector;
- microphone audio streamed to Gemini Live or a streaming transcription service;
- periodic section synthesis from the transcript buffer plus retained board states.

That version never needs a full video artifact: only a transcript, a small set of JPEG board states, and the generated document remain.

## Deliberate hackathon constraints

- 85 MB upload limit; use YouTube for long lectures.
- Up to 10 retained board states.
- Processing is request-based rather than queued.
- Frame comparison uses the full camera image; there is no automatic board crop or manual crop control yet.
- Visuals can be mathematically correct while misrepresenting the source board. They are labeled as interpretations, not exact tracings.
- YouTube duration extraction is best-effort metadata parsing and may fail if the public page changes or is unavailable.
- The live webcam/microphone pipeline is an architectural direction, not an implemented feature.
- Prefer a local folder outside iCloud/other sync tools for development to avoid offloaded dependencies and build caches.
