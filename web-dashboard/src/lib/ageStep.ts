/** Mirrors call.thresholdsSec in tokens.json. The spec puts the thresholds there and
 *  nowhere else; this constant is the web target's copy and tokens.css carries the same
 *  numbers, so --check catches a divergence. */
const THRESHOLDS_SEC = [0, 30, 120] as const;

export type AgeStep = 1 | 2 | 3;

function elapsedSec(createdAtIso: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(createdAtIso).getTime();
  // A clock-skewed device must not produce a negative step or a NaN.
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
}

export function ageStep(createdAtIso: string, now?: Date): AgeStep {
  const s = elapsedSec(createdAtIso, now);
  if (s < THRESHOLDS_SEC[1]) return 1;
  if (s < THRESHOLDS_SEC[2]) return 2;
  return 3;
}

/** m:ss up to 59:59, then h:mm:ss. Never a word form: the wall shows several timers
 *  side by side and tabular figures buy nothing if one of them reads "12 daq". */
export function elapsedLabel(createdAtIso: string, now?: Date): string {
  const s = elapsedSec(createdAtIso, now);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}
