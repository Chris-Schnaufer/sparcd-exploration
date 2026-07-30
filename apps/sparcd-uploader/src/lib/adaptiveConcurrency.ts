// Adaptive upload concurrency: a hill climber over measured throughput.
//
// The right lane count for a long-haul, lossy path isn't knowable up front —
// too few lanes leave the pipe idle, too many draw server pushback and
// congestion loss. So the engine measures instead: every window it reports the
// bytes that landed, and this controller nudges the lane target up or down and
// keeps whichever direction is paying.
//
// Deliberately pure: no clock, no timers, no I/O. The engine supplies both the
// bytes and the elapsed time of each window, which makes the whole policy
// testable by feeding it a sequence.

export type WindowSample = { bytes: number; ms: number };

export type AdaptiveController = {
  /** Lane target the pool should currently hold. */
  target: () => number;
  /** Feed one measurement window; may move the target. */
  onWindow: (sample: WindowSample) => void;
};

export type AdaptiveOptions = {
  start?: number;
  step?: number;
  min?: number;
  max?: number;
  /** Relative rate change that counts as signal rather than noise. */
  threshold?: number;
};

export function createAdaptiveController(opts: AdaptiveOptions = {}): AdaptiveController {
  const { start = 8, step = 2, min = 2, max = 32, threshold = 0.05 } = opts;

  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  let target = clamp(start);
  let direction = 1; // climb first: the starting point is a guess, not a peak
  let best: number | null = null; // rate to beat; null until the first measured window
  let holding = false; // one settling window is skipped after a reversal
  let prevBytes = -1; // previous window's bytes; -1 = no window yet
  let probing = false; // the last window carried a fresh move awaiting its verdict
  let flats = 0; // consecutive settled flat windows since the last probe

  /** Step in the current direction; false when pinned at a bound. */
  const move = (): boolean => {
    const next = clamp(target + direction * step);
    if (next === target) return false;
    target = next;
    return true;
  };

  return {
    target: () => target,
    onWindow: ({ bytes, ms }) => {
      // Files under the streaming threshold report their bytes only once they
      // complete, so an all-zero window usually means "nothing has landed yet",
      // not "throughput collapsed". It's a real signal only when the window
      // before it was moving bytes.
      const wasMoving = prevBytes > 0;
      prevBytes = bytes;
      if (bytes === 0 && !wasMoving) return;

      const rate = ms > 0 ? bytes / ms : 0;
      if (best === null) {
        // First measured window is the baseline — and the first probe: a hill
        // climber has no gradient to read until the target actually moves.
        best = rate;
        probing = move();
        return;
      }
      if (holding) {
        // Post-reversal window: lanes were still draining, so it measures the
        // transition rather than the new size. Re-baseline on it and move on.
        holding = false;
        best = rate;
        return;
      }

      if (rate > best * (1 + threshold)) {
        best = rate;
        flats = 0;
        probing = move(); // still paying off — keep going; pinned at a bound = settled
      } else if (rate < best * (1 - threshold)) {
        best = rate; // re-baseline: the old peak may no longer be reachable
        flats = 0;
        direction = -direction;
        probing = move();
        holding = true;
      } else if (probing) {
        // The probe bought nothing — undo it. This is what stops flat
        // throughput from silently ratcheting lanes toward the cap.
        best = Math.max(best, rate);
        target = clamp(target - direction * step);
        probing = false;
        flats = 0;
      } else {
        // Settled and flat. Conditions drift, so sitting still forever means
        // never noticing new headroom — re-probe every third window; an
        // unpaying probe reverts above, a hurtful one reverses via regression.
        best = Math.max(best, rate);
        flats++;
        if (flats >= 3) {
          flats = 0;
          if (!move()) {
            direction = -direction;
            move();
          }
          probing = true;
        }
      }
    },
  };
}
