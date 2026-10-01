import { createImage, quadSize, rectToQuadHomography, warpRegion, type Quad, type RGBAImage } from "./geometry";

/**
 * Board memory engine.
 *
 * The board is flattened into a fixed rectangle and split into cells. Each sample:
 *  1. Normalize lighting: every pixel becomes an "ink" value relative to the local board colour,
 *     so exposure drift and soft shadows don't register as writing.
 *  2. A cell's observation is only trusted when it has been still for a while, looks like bare
 *     board plus strokes (not a body), and none of its neighbours is occluded. A lecturer standing
 *     in front of the board is never committed, so the composite shows the board without them.
 *  3. Trusted observations that differ from the composite are committed. Ink birth times are
 *     recorded per cell, so we know when every part of the board was written.
 *  4. Before a commit would destroy ink that has not been saved yet (an erasure), the whole
 *     composite is snapshotted. Snapshots are therefore exactly the board states that would
 *     otherwise be lost: as many as the lecture needs, never a fixed count.
 */

export type Polarity = "light" | "dark";

export type EngineConfig = {
  analysisWidth: number;
  cellSize: number;
  maxHiResWidth: number;
  /** Seconds a cell must stay still before its observation is trusted. */
  stableSeconds: number;
  stillMeanDiff: number;
  stillPixelFraction: number;
  inkThreshold: number;
  minBoardFraction: number;
  changeMeanDiff: number;
  changePixelFraction: number;
  minInkPixels: number;
  /** Fraction of a cell's old ink that must survive for a change to count as an addition, not a loss. */
  survivalRatio: number;
  /** Unsaved ink (analysis pixels) that must be about to disappear before a snapshot fires. */
  minLostInk: number;
  denoiseObservations: number;
};

export const DEFAULT_CONFIG: EngineConfig = {
  analysisWidth: 512,
  cellSize: 16,
  maxHiResWidth: 1600,
  stableSeconds: 1.2,
  stillMeanDiff: 7,
  stillPixelFraction: 0.01,
  inkThreshold: 64,
  minBoardFraction: 0.55,
  changeMeanDiff: 5,
  changePixelFraction: 0.015,
  minInkPixels: 6,
  survivalRatio: 0.55,
  minLostInk: 48,
  denoiseObservations: 4,
};

export type SnapshotReason = "erase" | "final" | "manual";

export type Snapshot = {
  id: string;
  index: number;
  /** Time of the last trusted board state included in this snapshot (seconds). */
  t: number;
  reason: SnapshotReason;
  image: RGBAImage;
  polarity: Polarity;
  cols: number;
  rows: number;
  /** Committed ink pixel count per cell (analysis resolution). */
  ink: Uint16Array;
  /** First time ink appeared in each cell (NaN when empty). */
  birth: Float64Array;
  /** 1 when the cell holds ink that no earlier snapshot contains. */
  fresh: Uint8Array;
  /** Approximate cell area that was being erased when this snapshot fired. */
  erasedCells: number;
};

/** Person segmentation in source-frame space (any resolution; 1/true = person). */
export type PersonMask = { width: number; height: number; data: ArrayLike<number> };

export type FrameReport = {
  t: number;
  committed: number;
  occluded: number;
  moving: number;
  erasing: number;
  snapshot: Snapshot | null;
};

export type EngineStats = {
  samples: number;
  commits: number;
  snapshots: number;
  inkCells: number;
  cols: number;
  rows: number;
};

const LUMA = (r: number, g: number, b: number) => (r * 77 + g * 150 + b * 29) >> 8;

export class BoardEngine {
  readonly config: EngineConfig;
  readonly cols: number;
  readonly rows: number;
  readonly aw: number;
  readonly ah: number;
  readonly hiResWidth: number;
  readonly hiResHeight: number;
  polarity: Polarity | null = null;

  /** Hi-res composite of the board with occluders removed. */
  readonly composite: RGBAImage;
  readonly snapshots: Snapshot[] = [];

  private readonly homAnalysis: Float64Array;
  private readonly homHiRes: Float64Array;
  private readonly analysis: RGBAImage;
  private readonly hiResScratch: RGBAImage;
  private readonly luma: Uint8Array;
  private readonly ink: Uint8Array;
  private readonly prevInk: Uint8Array;
  private readonly boardLikePx: Uint8Array;
  private readonly personScratch: Uint8Array;
  private hasPrev = false;

  private readonly cellBg: Float32Array;
  private readonly cellBgSmooth: Float32Array;
  private readonly cellColor: Float32Array;
  readonly stillCount: Uint16Array;
  readonly occluded: Uint8Array;
  readonly moving: Uint8Array;
  private readonly boardLike: Uint8Array;

  private readonly compInk: Uint8Array;
  private readonly compHas: Uint8Array;
  readonly inkCount: Uint16Array;
  readonly birth: Float64Array;
  private readonly dirty: Uint8Array;
  private readonly observations: Uint8Array;
  /** Expected board luminance per cell from a robust smooth fit (occluders trimmed as outliers). */
  private readonly refBg: Float32Array;
  private boardChroma: [number, number, number] = [0, 0, 0];

  private samples = 0;
  private commits = 0;
  private lastT = 0;
  private prevT = 0;
  private sampleInterval = 0.5;
  private snapshotSeq = 0;

  constructor(quad: Quad, config: Partial<EngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    const { cellSize, analysisWidth, maxHiResWidth } = this.config;
    const size = quadSize(quad);
    const aspect = size.width / size.height;
    this.cols = Math.max(4, Math.round(analysisWidth / cellSize));
    this.rows = Math.max(3, Math.round(analysisWidth / aspect / cellSize));
    this.aw = this.cols * cellSize;
    this.ah = this.rows * cellSize;

    // Never upscale past what the camera actually captured.
    const hiScale = Math.min(maxHiResWidth, Math.max(this.aw, size.width)) / this.aw;
    this.hiResWidth = Math.round(this.aw * hiScale);
    this.hiResHeight = Math.round(this.ah * hiScale);

    this.homAnalysis = rectToQuadHomography(this.aw, this.ah, quad);
    this.homHiRes = rectToQuadHomography(this.hiResWidth, this.hiResHeight, quad);

    const px = this.aw * this.ah;
    const cells = this.cols * this.rows;
    this.analysis = createImage(this.aw, this.ah);
    this.hiResScratch = createImage(this.hiResWidth, this.hiResHeight);
    this.composite = createImage(this.hiResWidth, this.hiResHeight);
    this.luma = new Uint8Array(px);
    this.ink = new Uint8Array(px);
    this.prevInk = new Uint8Array(px);
    this.boardLikePx = new Uint8Array(px);
    this.personScratch = new Uint8Array(px);
    this.compInk = new Uint8Array(px);
    this.cellBg = new Float32Array(cells);
    this.cellBgSmooth = new Float32Array(cells);
    this.cellColor = new Float32Array(cells * 3);
    this.stillCount = new Uint16Array(cells);
    this.occluded = new Uint8Array(cells);
    this.moving = new Uint8Array(cells);
    this.boardLike = new Uint8Array(cells);
    this.compHas = new Uint8Array(cells);
    this.inkCount = new Uint16Array(cells);
    this.birth = new Float64Array(cells).fill(Number.NaN);
    this.dirty = new Uint8Array(cells);
    this.observations = new Uint8Array(cells);
    this.refBg = new Float32Array(cells);
  }

  get stats(): EngineStats {
    let inkCells = 0;
    for (let c = 0; c < this.inkCount.length; c += 1) if (this.inkCount[c] >= this.config.minInkPixels) inkCells += 1;
    return { samples: this.samples, commits: this.commits, snapshots: this.snapshots.length, inkCells, cols: this.cols, rows: this.rows };
  }

  /** Current flattened (un-cleaned) analysis view, useful for debug overlays. */
  get analysisView(): RGBAImage { return this.analysis; }
  get inkView(): Uint8Array { return this.ink; }

  /**
   * Feed one frame. `personMask` (optional) comes from a segmentation model (e.g. MediaPipe) in
   * source-frame space; cells touching a person are never trusted, which makes occlusion robust
   * even when clothes look like the board.
   */
  ingest(source: RGBAImage, t: number, personMask?: PersonMask): FrameReport {
    const { cellSize } = this.config;
    if (this.samples > 0) this.sampleInterval = this.sampleInterval * 0.8 + Math.max(0.05, t - this.lastT) * 0.2;
    this.prevT = this.lastT;
    this.lastT = t;
    this.samples += 1;

    warpRegion(source, this.homAnalysis, this.analysis);
    const mask = personMask ? this.warpMask(personMask, source.width, source.height) : null;
    if (this.samples === 1) warpRegion(source, this.homHiRes, this.composite);
    this.computeLumaAndBackground();
    this.fitBoardModel();
    this.computeInkAndBoardLikeness();

    const cells = this.cols * this.rows;
    const cellPx = cellSize * cellSize;
    const neededStill = Math.max(1, Math.ceil(this.config.stableSeconds / this.sampleInterval));

    // Per-cell motion, board-likeness, occlusion.
    let occludedCount = 0, movingCount = 0;
    for (let c = 0; c < cells; c += 1) {
      const { meanDiff, changedFraction, boardFraction } = this.cellMetrics(c, cellPx);
      const still = this.hasPrev && meanDiff < this.config.stillMeanDiff && changedFraction < this.config.stillPixelFraction;
      this.stillCount[c] = still ? Math.min(65535, this.stillCount[c] + 1) : 0;
      this.moving[c] = still || !this.hasPrev ? 0 : 1;
      this.boardLike[c] = boardFraction >= this.config.minBoardFraction ? 1 : 0;
      let personHit = false;
      if (mask) personHit = this.maskHitsCell(mask, c);
      this.occluded[c] = !this.boardLike[c] || personHit ? 1 : 0;
      if (this.occluded[c]) occludedCount += 1;
      if (this.moving[c]) movingCount += 1;
    }
    this.dilateOcclusion();

    // Decide which cells to commit and whether any of them would destroy unsaved ink.
    const toCommit: number[] = [];
    const losses: number[] = [];
    let unsavedLoss = 0;
    for (let c = 0; c < cells; c += 1) {
      if (this.occluded[c] || this.stillCount[c] < neededStill) continue;
      if (!this.compHas[c]) { toCommit.push(c); continue; }
      const change = this.compareWithComposite(c);
      if (!change.changed) {
        if (this.observations[c] < this.config.denoiseObservations) this.denoiseCell(c, source);
        continue;
      }
      toCommit.push(c);
      if (change.lost) {
        losses.push(c);
        if (this.dirty[c]) unsavedLoss += this.inkCount[c];
      }
    }

    let snapshot: Snapshot | null = null;
    // Tiny losses (a sleeve edge that sat still, a smudge) are not worth a board state of their own.
    if (unsavedLoss >= this.config.minLostInk) snapshot = this.takeSnapshot("erase", this.prevT, losses.length);

    for (const c of toCommit) this.commitCell(c, source, t);
    this.commits += toCommit.length;

    this.prevInk.set(this.ink);
    this.hasPrev = true;
    return { t, committed: toCommit.length, occluded: occludedCount, moving: movingCount, erasing: losses.length, snapshot };
  }

  /** Save whatever ink is not yet in a snapshot (end of lecture, or a manual capture). */
  flush(reason: SnapshotReason = "final"): Snapshot | null {
    let unsaved = false;
    for (let c = 0; c < this.dirty.length; c += 1) if (this.dirty[c] && this.inkCount[c] >= this.config.minInkPixels) { unsaved = true; break; }
    if (!unsaved) return null;
    return this.takeSnapshot(reason, this.lastT, 0);
  }

  private computeLumaAndBackground() {
    const { data } = this.analysis;
    const { cellSize } = this.config;
    const px = this.aw * this.ah;
    for (let p = 0, i = 0; p < px; p += 1, i += 4) this.luma[p] = LUMA(data[i], data[i + 1], data[i + 2]);

    if (this.polarity === null) {
      const sorted = Uint8Array.from(this.luma).sort();
      this.polarity = sorted[sorted.length >> 1] >= 100 ? "light" : "dark";
    }
    const light = this.polarity === "light";
    const hist = new Uint32Array(256);
    const cellPx = cellSize * cellSize;
    const target = Math.floor(cellPx * (light ? 0.88 : 0.12));
    for (let cy = 0; cy < this.rows; cy += 1) {
      for (let cx = 0; cx < this.cols; cx += 1) {
        hist.fill(0);
        for (let y = cy * cellSize; y < (cy + 1) * cellSize; y += 1) {
          const row = y * this.aw;
          for (let x = cx * cellSize; x < (cx + 1) * cellSize; x += 1) hist[this.luma[row + x]] += 1;
        }
        let acc = 0, value = 0;
        for (let v = 0; v < 256; v += 1) { acc += hist[v]; if (acc > target) { value = v; break; } }
        const c = cy * this.cols + cx;
        this.cellBg[c] = value;
        // Board colour of this cell: mean chroma of pixels near its background luminance.
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = cy * cellSize; y < (cy + 1) * cellSize; y += 1) {
          for (let x = cx * cellSize; x < (cx + 1) * cellSize; x += 1) {
            const p = y * this.aw + x;
            if (Math.abs(this.luma[p] - value) <= 8) { const i = p * 4; r += data[i] - value; g += data[i + 1] - value; b += data[i + 2] - value; n += 1; }
          }
        }
        this.cellColor[c * 3] = n ? r / n : 0;
        this.cellColor[c * 3 + 1] = n ? g / n : 0;
        this.cellColor[c * 3 + 2] = n ? b / n : 0;
      }
    }
    // 3x3 median of the cell backgrounds: robust to dense-ink cells and single occluded cells.
    const window: number[] = [];
    for (let cy = 0; cy < this.rows; cy += 1) {
      for (let cx = 0; cx < this.cols; cx += 1) {
        window.length = 0;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          const x = cx + dx, y = cy + dy;
          if (x >= 0 && y >= 0 && x < this.cols && y < this.rows) window.push(this.cellBg[y * this.cols + x]);
        }
        window.sort((a, b) => a - b);
        this.cellBgSmooth[cy * this.cols + cx] = window[window.length >> 1];
      }
    }
  }

  /**
   * Fit expected board brightness as a quadratic surface over the cell grid, iteratively trimming
   * cells that deviate (people, dense drawings). Lighting falloff is smooth; occluders are not.
   */
  private fitBoardModel() {
    const n = this.cols * this.rows;
    const inlier = new Uint8Array(n).fill(1);
    const features = (c: number) => {
      const x = (c % this.cols) / Math.max(1, this.cols - 1) - 0.5;
      const y = Math.floor(c / this.cols) / Math.max(1, this.rows - 1) - 0.5;
      return [1, x, y, x * x, y * y, x * y];
    };
    let coefficients = [median(this.cellBg), 0, 0, 0, 0, 0];
    for (let iteration = 0; iteration < 4; iteration += 1) {
      const ata = Array.from({ length: 6 }, () => new Array(6).fill(0));
      const atb = new Array(6).fill(0);
      let count = 0;
      for (let c = 0; c < n; c += 1) {
        if (!inlier[c]) continue;
        const f = features(c);
        for (let i = 0; i < 6; i += 1) { atb[i] += f[i] * this.cellBg[c]; for (let j = 0; j < 6; j += 1) ata[i][j] += f[i] * f[j]; }
        count += 1;
      }
      if (count < Math.max(12, n * 0.25)) break;
      for (let i = 0; i < 6; i += 1) ata[i][i] += 1e-6;
      try { coefficients = solveSymmetric(ata, atb); } catch { break; }
      const tolerance = iteration < 2 ? 0.22 : 0.12;
      for (let c = 0; c < n; c += 1) {
        const f = features(c);
        const predicted = f.reduce((sum, value, i) => sum + value * coefficients[i], 0);
        inlier[c] = Math.abs(this.cellBg[c] - predicted) <= Math.max(10, predicted * tolerance) ? 1 : 0;
      }
    }
    const chroma: number[][] = [[], [], []];
    for (let c = 0; c < n; c += 1) {
      const f = features(c);
      this.refBg[c] = Math.max(4, Math.min(255, f.reduce((sum, value, i) => sum + value * coefficients[i], 0)));
      if (inlier[c]) for (let k = 0; k < 3; k += 1) chroma[k].push(this.cellColor[c * 3 + k]);
    }
    this.boardChroma = [median(chroma[0]), median(chroma[1]), median(chroma[2])];
  }

  private computeInkAndBoardLikeness() {
    const { data } = this.analysis;
    const { cellSize } = this.config;
    const light = this.polarity === "light";
    const [cr, cg, cb] = this.boardChroma;
    const half = cellSize / 2;
    for (let y = 0; y < this.ah; y += 1) {
      // Bilinear interpolation of the smoothed background between cell centres.
      const fy = Math.min(this.rows - 1, Math.max(0, (y - half) / cellSize));
      const y0 = Math.floor(fy), y1 = Math.min(this.rows - 1, y0 + 1), wy = fy - y0;
      const cyIndex = Math.min(this.rows - 1, Math.floor(y / cellSize));
      for (let x = 0; x < this.aw; x += 1) {
        const fx = Math.min(this.cols - 1, Math.max(0, (x - half) / cellSize));
        const x0 = Math.floor(fx), x1 = Math.min(this.cols - 1, x0 + 1), wx = fx - x0;
        const bg =
          this.cellBgSmooth[y0 * this.cols + x0] * (1 - wx) * (1 - wy) +
          this.cellBgSmooth[y0 * this.cols + x1] * wx * (1 - wy) +
          this.cellBgSmooth[y1 * this.cols + x0] * (1 - wx) * wy +
          this.cellBgSmooth[y1 * this.cols + x1] * wx * wy;
        const p = y * this.aw + x;
        const l = this.luma[p];
        const dev = light ? (bg - l) / Math.max(24, bg) : (l - bg) / Math.max(24, 255 - bg);
        this.ink[p] = dev <= 0 ? 0 : Math.min(255, dev * 420);

        // Board-likeness compares against the board brightness model (not this frame's local
        // background), so a large uniform occluder can't pass as bare board.
        const c = cyIndex * this.cols + Math.min(this.cols - 1, Math.floor(x / cellSize));
        const refL = this.refBg[c];
        const i = p * 4;
        const lumaOk = Math.abs(l - refL) <= Math.max(16, refL * 0.16);
        const chromaOk = Math.abs(data[i] - l - cr) + Math.abs(data[i + 1] - l - cg) + Math.abs(data[i + 2] - l - cb) < 48;
        const isInk = this.ink[p] >= this.config.inkThreshold;
        this.boardLikePx[p] = (lumaOk && chromaOk) || (isInk && this.isStrokeLike(x, y)) ? 1 : 0;
      }
    }
  }

  /** Thin strokes have board around them within a few pixels; bodies don't. */
  private isStrokeLike(x: number, y: number): boolean {
    const reach = 4;
    let boardish = 0;
    const probes: Array<[number, number]> = [[reach, 0], [-reach, 0], [0, reach], [0, -reach], [reach, reach], [-reach, -reach], [reach, -reach], [-reach, reach]];
    for (const [dx, dy] of probes) {
      const px = x + dx, py = y + dy;
      if (px < 0 || py < 0 || px >= this.aw || py >= this.ah) continue;
      if (this.ink[py * this.aw + px] < this.config.inkThreshold * 0.5) boardish += 1;
    }
    return boardish >= 3;
  }

  private cellMetrics(c: number, cellPx: number) {
    const { cellSize } = this.config;
    const cx = c % this.cols, cy = Math.floor(c / this.cols);
    let diffSum = 0, changed = 0, board = 0;
    for (let y = cy * cellSize; y < (cy + 1) * cellSize; y += 1) {
      const row = y * this.aw;
      for (let x = cx * cellSize; x < (cx + 1) * cellSize; x += 1) {
        const p = row + x;
        const d = Math.abs(this.ink[p] - this.prevInk[p]);
        diffSum += d;
        if (d > 48) changed += 1;
        board += this.boardLikePx[p];
      }
    }
    return { meanDiff: diffSum / cellPx, changedFraction: changed / cellPx, boardFraction: board / cellPx };
  }

  /** Resample a source-space person mask onto the flattened analysis grid (every other pixel). */
  private warpMask(mask: PersonMask, sourceWidth: number, sourceHeight: number): Uint8Array {
    const out = this.personScratch;
    out.fill(0);
    const [h0, h1, h2, h3, h4, h5, h6, h7] = this.homAnalysis;
    const sx = mask.width / sourceWidth, sy = mask.height / sourceHeight;
    for (let y = 0; y < this.ah; y += 2) {
      for (let x = 0; x < this.aw; x += 2) {
        const tx = x + 0.5, ty = y + 0.5;
        const z = h6 * tx + h7 * ty + 1;
        const u = Math.floor(((h0 * tx + h1 * ty + h2) / z) * sx);
        const v = Math.floor(((h3 * tx + h4 * ty + h5) / z) * sy);
        if (u >= 0 && v >= 0 && u < mask.width && v < mask.height && mask.data[v * mask.width + u]) out[y * this.aw + x] = 1;
      }
    }
    return out;
  }

  private maskHitsCell(mask: Uint8Array, c: number): boolean {
    const { cellSize } = this.config;
    const cx = c % this.cols, cy = Math.floor(c / this.cols);
    for (let y = cy * cellSize; y < (cy + 1) * cellSize; y += 2) {
      const row = y * this.aw;
      for (let x = cx * cellSize; x < (cx + 1) * cellSize; x += 2) if (mask[row + x]) return true;
    }
    return false;
  }

  /** Cells touching an occluded cell are not trusted either: they may hold an arm, hair or shadow edge. */
  private dilateOcclusion() {
    const source = Uint8Array.from(this.occluded);
    for (let cy = 0; cy < this.rows; cy += 1) {
      for (let cx = 0; cx < this.cols; cx += 1) {
        const c = cy * this.cols + cx;
        if (source[c]) continue;
        for (let dy = -1; dy <= 1 && !this.occluded[c]; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const x = cx + dx, y = cy + dy;
            if (x >= 0 && y >= 0 && x < this.cols && y < this.rows && source[y * this.cols + x]) { this.occluded[c] = 2; break; }
          }
        }
      }
    }
  }

  private compareWithComposite(c: number) {
    const { cellSize, inkThreshold } = this.config;
    const cx = c % this.cols, cy = Math.floor(c / this.cols);
    let diffSum = 0, changed = 0, oldInk = 0, survived = 0;
    for (let y = cy * cellSize; y < (cy + 1) * cellSize; y += 1) {
      const row = y * this.aw;
      for (let x = cx * cellSize; x < (cx + 1) * cellSize; x += 1) {
        const p = row + x;
        const d = Math.abs(this.ink[p] - this.compInk[p]);
        diffSum += d;
        if (d > 48) changed += 1;
        if (this.compInk[p] >= inkThreshold) {
          oldInk += 1;
          if (this.ink[p] >= inkThreshold * 0.6 || this.nearInk(x, y)) survived += 1;
        }
      }
    }
    const cellPx = cellSize * cellSize;
    const isChanged = diffSum / cellPx >= this.config.changeMeanDiff || changed / cellPx >= this.config.changePixelFraction;
    const lost = isChanged && oldInk >= this.config.minInkPixels && survived / oldInk < this.config.survivalRatio;
    return { changed: isChanged, lost };
  }

  /** Tolerate one-pixel jitter when deciding whether old ink survived. */
  private nearInk(x: number, y: number): boolean {
    const threshold = this.config.inkThreshold * 0.6;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const px = x + dx, py = y + dy;
      if (px >= 0 && py >= 0 && px < this.aw && py < this.ah && this.ink[py * this.aw + px] >= threshold) return true;
    }
    return false;
  }

  private cellHiResRect(c: number) {
    const cx = c % this.cols, cy = Math.floor(c / this.cols);
    const sx = this.hiResWidth / this.aw, sy = this.hiResHeight / this.ah;
    const { cellSize } = this.config;
    const x0 = Math.round(cx * cellSize * sx), x1 = Math.round((cx + 1) * cellSize * sx);
    const y0 = Math.round(cy * cellSize * sy), y1 = Math.round((cy + 1) * cellSize * sy);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  private commitCell(c: number, source: RGBAImage, t: number) {
    const { cellSize, inkThreshold, minInkPixels } = this.config;
    const cx = c % this.cols, cy = Math.floor(c / this.cols);
    let count = 0, added = 0;
    for (let y = cy * cellSize; y < (cy + 1) * cellSize; y += 1) {
      const row = y * this.aw;
      for (let x = cx * cellSize; x < (cx + 1) * cellSize; x += 1) {
        const p = row + x;
        const isInk = this.ink[p] >= inkThreshold;
        if (isInk) { count += 1; if (this.compInk[p] < inkThreshold * 0.6) added += 1; }
        this.compInk[p] = this.ink[p];
      }
    }
    const hadInk = this.inkCount[c] >= minInkPixels;
    const first = !this.compHas[c];
    this.compHas[c] = 1;
    this.inkCount[c] = count;
    if (count >= minInkPixels) {
      if (!hadInk || added >= minInkPixels) {
        if (!hadInk || Number.isNaN(this.birth[c])) this.birth[c] = t;
        // Content already on the board when recording started is "fresh" for the first snapshot too.
        this.dirty[c] = 1;
      }
    } else {
      this.birth[c] = Number.NaN;
      this.dirty[c] = 0;
    }
    if (first) this.dirty[c] = count >= minInkPixels ? 1 : 0;
    this.observations[c] = 1;

    const rect = this.cellHiResRect(c);
    warpRegion(source, this.homHiRes, this.composite, rect.x, rect.y, rect.w, rect.h);
  }

  /** Average repeated stable observations of an unchanged cell: fewer compression artefacts and less sensor noise. */
  private denoiseCell(c: number, source: RGBAImage) {
    const rect = this.cellHiResRect(c);
    warpRegion(source, this.homHiRes, this.hiResScratch, rect.x, rect.y, rect.w, rect.h);
    const n = this.observations[c] + 1;
    const keep = (n - 1) / n, add = 1 / n;
    const out = this.composite.data, scratch = this.hiResScratch.data, w = this.hiResWidth;
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) {
        const i = (y * w + x) * 4;
        out[i] = out[i] * keep + scratch[i] * add;
        out[i + 1] = out[i + 1] * keep + scratch[i + 1] * add;
        out[i + 2] = out[i + 2] * keep + scratch[i + 2] * add;
      }
    }
    this.observations[c] = n;
  }

  private takeSnapshot(reason: SnapshotReason, t: number, erasedCells: number): Snapshot {
    const fresh = new Uint8Array(this.dirty.length);
    for (let c = 0; c < fresh.length; c += 1) fresh[c] = this.dirty[c] && this.inkCount[c] >= this.config.minInkPixels ? 1 : 0;
    this.snapshotSeq += 1;
    const snapshot: Snapshot = {
      id: `board-${String(this.snapshotSeq).padStart(2, "0")}`,
      index: this.snapshotSeq - 1,
      t,
      reason,
      image: { width: this.composite.width, height: this.composite.height, data: Uint8ClampedArray.from(this.composite.data) },
      polarity: this.polarity ?? "light",
      cols: this.cols,
      rows: this.rows,
      ink: Uint16Array.from(this.inkCount),
      birth: Float64Array.from(this.birth),
      fresh,
      erasedCells,
    };
    this.dirty.fill(0);
    this.snapshots.push(snapshot);
    return snapshot;
  }
}

function median(values: ArrayLike<number>): number {
  if (!values.length) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

function solveSymmetric(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    if (Math.abs(m[pivot][col]) < 1e-12) throw new Error("singular");
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = m[row][col] / m[col][col];
      for (let k = col; k <= n; k += 1) m[row][k] -= factor * m[col][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}
