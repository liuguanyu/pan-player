export interface BeatSnapshot {
  position: number;
  confidence: number;
  periodMs: number;
  onset: boolean;
}

/** Frequency-domain beat tracker ported from pan-music-car-player's BeatTracker. */
export class BeatTracker {
  private static readonly MIN_PERIOD = 300;
  private static readonly MAX_PERIOD = 1000;
  private static readonly DEFAULT_PERIOD = 500;
  private static readonly FLUX_BINS = 24;
  private static readonly HISTORY = 24;
  private static readonly MAX_ONSETS = 64;

  private previous = new Float32Array(0);
  private history = new Float32Array(BeatTracker.HISTORY);
  private historyCount = 0;
  private historyIndex = 0;
  private lastFlux = 0;
  private lastOnset = -Infinity;
  private onsets: number[] = [];
  private period = BeatTracker.DEFAULT_PERIOD;
  private candidate = 0;
  private candidateVotes = 0;
  private anchorMs = 0;
  private anchorBeat = 0;
  private confidenceValue = 0;
  private started = false;
  private bestScore = 0;

  reset() {
    this.previous = new Float32Array(0);
    this.history.fill(0);
    this.historyCount = 0;
    this.historyIndex = 0;
    this.lastFlux = 0;
    this.lastOnset = -Infinity;
    this.onsets = [];
    this.period = BeatTracker.DEFAULT_PERIOD;
    this.candidate = 0;
    this.candidateVotes = 0;
    this.anchorMs = 0;
    this.anchorBeat = 0;
    this.confidenceValue = 0;
    this.started = false;
  }

  update(bytes: Uint8Array, nowMs: number): BeatSnapshot {
    const mags = new Float32Array(Math.min(BeatTracker.FLUX_BINS, bytes.length));
    for (let i = 0; i < mags.length; i++) mags[i] = bytes[i] / 255;
    if (!mags.length) return this.snapshot(nowMs, false);
    if (!this.started) { this.started = true; this.anchorMs = nowMs; }

    let flux = 0;
    if (this.previous.length === mags.length) {
      for (let i = 1; i < mags.length; i++) {
        const cur = Math.log1p(mags[i] * 60);
        const prev = Math.log1p(this.previous[i] * 60);
        flux += Math.max(0, cur - prev) * (i < 8 ? 1.5 : 1);
      }
    }
    this.previous = mags;

    const n = Math.min(this.historyCount, BeatTracker.HISTORY);
    let mean = 0;
    for (let i = 0; i < n; i++) mean += this.history[i];
    mean = n ? mean / n : 0;
    let variance = 0;
    for (let i = 0; i < n; i++) variance += (this.history[i] - mean) ** 2;
    const std = n > 1 ? Math.sqrt(variance / (n - 1)) : 0;
    this.history[this.historyIndex] = flux;
    this.historyIndex = (this.historyIndex + 1) % BeatTracker.HISTORY;
    this.historyCount++;

    const onset = n >= 6 && flux > mean + std * 1.2 && flux > .6 && flux >= this.lastFlux
      && nowMs - this.lastOnset >= 180;
    this.lastFlux = flux;
    if (onset) this.registerOnset(nowMs);
    if (nowMs - this.lastOnset > 4000) this.confidenceValue = Math.max(0, this.confidenceValue - .01);
    return this.snapshot(nowMs, onset);
  }

  private registerOnset(nowMs: number) {
    this.lastOnset = nowMs;
    this.onsets.push(nowMs);
    if (this.onsets.length > BeatTracker.MAX_ONSETS) this.onsets.shift();
    this.onsets = this.onsets.filter(t => nowMs - t <= 12000);
    if (this.onsets.length >= 4) {
      const best = this.estimatePeriod();
      if (Math.abs(best - this.period) / this.period < .08) {
        this.reanchor(nowMs);
        this.period = this.period * .85 + best * .15;
        this.candidateVotes = 0;
      } else {
        const locked = this.confidenceValue > .25;
        if (locked && this.bestScore < this.score(this.period) * 1.6) return;
        if (this.candidate && Math.abs(best - this.candidate) / this.candidate < .08) this.candidateVotes++;
        else { this.candidate = best; this.candidateVotes = 1; }
        if (locked && this.candidateVotes < 6) return;
        this.reanchor(nowMs); this.period = best; this.candidateVotes = 0;
      }
    }
    const pos = this.position(nowMs);
    const error = pos - Math.round(pos);
    if (Math.abs(error) < .3) {
      const gain = this.confidenceValue < .3 ? .6 : .25;
      this.anchorBeat = pos - error * gain;
      this.anchorMs = nowMs;
      this.confidenceValue = Math.min(1, this.confidenceValue + .12 * (1 - Math.abs(error) * 2));
    } else {
      this.confidenceValue = Math.max(0, this.confidenceValue - .06);
      if (this.confidenceValue < .15) { this.anchorBeat = Math.round(pos); this.anchorMs = nowMs; }
    }
  }

  private estimatePeriod() {
    this.bestScore = 0;
    let best = BeatTracker.DEFAULT_PERIOD;
    for (let p = BeatTracker.MIN_PERIOD; p <= BeatTracker.MAX_PERIOD; p += 5) {
      const score = this.score(p);
      if (score > this.bestScore) { this.bestScore = score; best = p; }
    }
    return best;
  }

  private score(period: number) {
    let score = 0;
    for (let i = 0; i < this.onsets.length; i++) for (let j = i + 1; j < this.onsets.length; j++) {
      const distance = this.onsets[j] - this.onsets[i];
      const beats = Math.round(distance / period);
      if (beats < 1 || beats > 4) continue;
      const error = (distance - beats * period) / (period * .08);
      score += Math.exp(-error * error) / beats;
    }
    const octave = Math.log2(60000 / period / 120);
    return score * Math.exp(-(octave * octave) / (.5 * .5 * 2));
  }

  private position(nowMs: number) { return this.anchorBeat + (nowMs - this.anchorMs) / this.period; }
  private reanchor(nowMs: number) { this.anchorBeat = this.position(nowMs); this.anchorMs = nowMs; }
  private snapshot(nowMs: number, onset: boolean): BeatSnapshot {
    const position = this.position(nowMs);
    const confidence = nowMs - this.lastOnset > 4000
      ? Math.max(0, this.confidenceValue - (nowMs - this.lastOnset - 4000) / 2000)
      : this.confidenceValue;
    return { position, confidence, periodMs: this.period, onset };
  }

  /** 无副作用地读取当前拍位置与可信度（供可视化做延迟补偿预测）。 */
  peek(nowMs: number): BeatSnapshot {
    return this.snapshot(nowMs, false);
  }
}
