/**
 * engine.js — fixed-timestep game loop tuned for weak devices.
 *
 * Design notes for low-end hardware:
 *  - Fixed simulation step (default 60 Hz) with an accumulator: gameplay speed
 *    is identical on a flagship phone and a 2015 budget tablet.
 *  - Hard cap on catch-up steps (maxSubSteps): after a long stall the game
 *    slows down for a moment instead of freezing while "fast-forwarding".
 *  - Optional frame skipping for rendering: simulation keeps 60 Hz while
 *    rendering can drop to 30 FPS on struggling GPUs.
 *  - Headless mode (`pump`) lets the test-suite run the exact same loop in Node.
 */
import { TimerManager } from './timer.js';
import { TweenManager } from './tween.js';

export const DEFAULTS = {
  fixedStep: 1 / 60,
  maxSubSteps: 4,
  maxFrameTime: 0.25,
  renderEvery: 1,
};

export class Engine {
  /**
   * @param {object} opts
   * @param {Function} opts.update called with fixed dt (seconds)
   * @param {Function} opts.render called with (alpha, frameNo) — alpha is the
   *        interpolation factor between the last two sim states
   * @param {number} [opts.fixedStep]
   * @param {number} [opts.maxSubSteps]
   */
  constructor(opts) {
    if (typeof opts.update !== 'function') throw new TypeError('engine requires an update fn');
    this.updateFn = opts.update;
    this.renderFn = opts.render || null;
    this.fixedStep = opts.fixedStep ?? DEFAULTS.fixedStep;
    this.maxSubSteps = opts.maxSubSteps ?? DEFAULTS.maxSubSteps;
    this.maxFrameTime = opts.maxFrameTime ?? DEFAULTS.maxFrameTime;
    this.renderEvery = opts.renderEvery ?? DEFAULTS.renderEvery;

    this.timers = new TimerManager();
    this.tweens = new TweenManager();

    this.running = false;
    this.paused = false;
    this.timeScale = 1;

    this._accumulator = 0;
    this._lastTs = 0;
    this._rafId = 0;
    this._frameNo = 0;
    this._renderCounter = 0;

    // diagnostics — cheap enough to always keep
    this.stats = {
      fps: 0,
      frameMs: 0,
      updateMs: 0,
      renderMs: 0,
      steps: 0,
      droppedFrames: 0,
      slowFrames: 0,
    };
    this._fpsWindow = [];
    this._onStats = opts.onStats || null;
  }

  /** Start the RAF loop (browser). */
  start() {
    if (this.running) return this;
    this.running = true;
    this._lastTs = 0;
    const loop = (ts) => {
      if (!this.running) return;
      this._rafId = requestAnimationFrame(loop);
      this._tick(ts);
    };
    if (typeof requestAnimationFrame === 'function') {
      this._rafId = requestAnimationFrame(loop);
    }
    return this;
  }

  stop() {
    this.running = false;
    if (this._rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._rafId);
    }
    this._rafId = 0;
    return this;
  }

  pause() {
    this.paused = true;
    return this;
  }

  resume() {
    this.paused = false;
    this._lastTs = 0;
    return this;
  }

  /** One outer frame: consume wall-clock time and run 0..maxSubSteps sim steps. */
  _tick(ts) {
    const t0 = now();
    if (this._lastTs === 0) this._lastTs = ts;
    let frameTime = (ts - this._lastTs) / 1000;
    this._lastTs = ts;
    if (frameTime > this.maxFrameTime) {
      // Tab was backgrounded or a GC pause happened — clamp instead of spiraling.
      this.stats.droppedFrames += 1;
      frameTime = this.maxFrameTime;
    }
    this.stats.frameMs = frameTime * 1000;

    if (!this.paused) {
      this._accumulator += frameTime * this.timeScale;
      let steps = 0;
      const u0 = now();
      while (this._accumulator >= this.fixedStep && steps < this.maxSubSteps) {
        this._stepOnce(this.fixedStep);
        this._accumulator -= this.fixedStep;
        steps += 1;
      }
      if (this._accumulator >= this.fixedStep) {
        // Could not keep up: drop the leftover time rather than freezing.
        this.stats.slowFrames += 1;
        this._accumulator = this.fixedStep * 0.5;
      }
      this.stats.steps = steps;
      this.stats.updateMs = now() - u0;
    }

    this._frameNo += 1;
    this._renderCounter += 1;
    const shouldRender = this._renderCounter % this.renderEvery === 0;
    if (this.renderFn && shouldRender) {
      const r0 = now();
      const alpha = this.paused ? 1 : Math.min(1, this._accumulator / this.fixedStep);
      try {
        this.renderFn(alpha, this._frameNo);
      } catch (err) {
        if (typeof console !== 'undefined') console.error('[Engine] render threw:', err);
      }
      this.stats.renderMs = now() - r0;
    }

    // FPS over a 30-frame rolling window (cheap).
    this._fpsWindow.push(frameTime);
    if (this._fpsWindow.length > 30) this._fpsWindow.shift();
    const avg = this._fpsWindow.reduce((a, b) => a + b, 0) / this._fpsWindow.length;
    this.stats.fps = avg > 0 ? 1 / avg : 0;
    if (this._onStats && this._frameNo % 30 === 0) this._onStats(this.stats);
    void t0;
  }

  /** A single simulation step: timers, tweens, then game logic. */
  _stepOnce(dt) {
    this.timers.update(dt);
    this.tweens.update(dt);
    try {
      this.updateFn(dt);
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[Engine] update threw:', err);
    }
  }

  /**
   * Headless pump — run `seconds` of simulation without RAF.
   * Used by tests and by the "fast-forward" debug console.
   */
  pump(seconds) {
    const steps = Math.max(0, Math.round(seconds / this.fixedStep));
    for (let i = 0; i < steps; i += 1) this._stepOnce(this.fixedStep);
    if (this.renderFn) {
      try {
        this.renderFn(1, this._frameNo);
      } catch (err) {
        if (typeof console !== 'undefined') console.error('[Engine] render threw:', err);
      }
    }
    return steps;
  }

  /** Set render frame skipping: 1 = every frame, 2 = 30 FPS render, … */
  setRenderEvery(n) {
    this.renderEvery = Math.max(1, Math.floor(n));
    return this;
  }

  get frameNo() {
    return this._frameNo;
  }
}

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
