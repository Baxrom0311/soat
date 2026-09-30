/** The audible half of the call alert, for a dashboard left open on a screen.
 *
 * Three things this owns that a bare `new AudioContext()` per beep did not:
 *
 *  - **Blocked-ness is observable.** Browsers refuse to play audio until the page has
 *    been interacted with, and the previous code swallowed that in a catch. On a kiosk
 *    nobody clicks, so the very first alert was silent and there was no way to find out
 *    — the worst failure this system can have is the one that looks like silence
 *    because nothing is happening. `subscribe()` lets the UI show it and offer a fix.
 *
 *  - **One context for the session.** Browsers cap concurrent AudioContexts, so a
 *    context per beep eventually stops producing sound on a long-lived display.
 *
 *  - **A pattern, not a blip.** Three pulses carry across a room; a single 0.35s tone
 *    at a nurses' station does not.
 */

type Listener = () => void;

let ctx: AudioContext | null = null;
const listeners = new Set<Listener>();

/** Guards against a new-call event and the repeat timer firing on top of each other. */
let lastPlayedAt = 0;
const MIN_GAP_MS = 3000;

function notify() {
  for (const fn of listeners) fn();
}

/** Returns the session's context, creating it only when `create` is set.
 *
 *  Creation is deliberately confined to the click handler. An AudioContext built during
 *  render -- before the page has been interacted with -- is merely suspended in Chrome,
 *  but Safari can hand back one that never produces sound no matter how often it is
 *  resumed, and a context that is silently dead is the worst possible state for this
 *  particular button. Built inside the gesture, every browser treats it as permitted.
 */
function context(create = false): AudioContext | null {
  try {
    if (ctx && ctx.state !== 'closed') return ctx;
    if (!create) return null;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    // Chrome can flip this to "running" on any gesture anywhere on the page without an
    // explicit resume(), so the indicator follows the context rather than our own flag.
    ctx.onstatechange = notify;
    return ctx;
  } catch {
    return null;
  }
}

/** True when the browser will not make sound yet. Drives the "turn sound on" prompt.
 *  Never creates a context: before the first click there is nothing to ask, and the
 *  honest answer is "blocked". */
export function isAudioBlocked(): boolean {
  return ctx === null || ctx.state !== 'running';
}

/** Must be called from inside a real user gesture (click/keydown) or it has no effect.
 *  Returns whether sound is now allowed.
 *
 *  Plays a short confirmation on success, and that is not decoration: switching sound on
 *  is the one action whose whole purpose is inaudible, so without it a working click and
 *  a failed one look exactly alike -- the button appears to do nothing, which is how this
 *  was first reported. Hearing the chirp IS the proof. */
export async function unlockAudio(): Promise<boolean> {
  const c = context(true); // created here, inside the gesture -- see context()
  if (!c) return false;
  try {
    await c.resume();
  } catch {
    // Nothing more to try: the indicator stays in its "blocked" state, which is the
    // honest answer rather than a silent failure.
  }
  notify();
  const ok = c.state === 'running';
  if (ok) playConfirmation();
  return ok;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

type Wave = OscillatorType;

/** One note. Ramped in and out rather than switched: an abrupt edge produces an audible
 *  click on most speakers, which over hundreds of repeats a day is worse than the tone. */
function tone(
  c: AudioContext,
  startAt: number,
  freq: number,
  dur: number,
  peak: number,
  wave: Wave,
) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = wave;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(c.destination);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.015);
  gain.gain.setValueAtTime(peak, startAt + dur - 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.01);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

/** Scheduled a beat ahead of `currentTime`, never at it: a context resumed a moment ago
 *  can have its audio thread already past "now", and a note scheduled in the past is not
 *  reliably heard. */
function startTime(c: AudioContext): number {
  return c.currentTime + 0.05;
}

/** A patient is waiting.
 *
 *  Four alternating tones over about 1.2 seconds, not a blip: this has to carry across a
 *  ward with people talking in it. The alternation is what makes it read as an alarm
 *  rather than a notification -- a steady tone blends into room noise, a two-pitch
 *  see-saw does not. Square wave for the same reason: its harmonics cut through speech
 *  where a sine disappears under it. */
export function playAlert(): boolean {
  const c = context();
  if (!c || c.state !== 'running') return false;
  const now = Date.now();
  if (now - lastPlayedAt < MIN_GAP_MS) return true;
  lastPlayedAt = now;
  const t = startTime(c);
  const step = 0.3;
  const dur = 0.22;
  tone(c, t, 880, dur, 0.42, 'square');
  tone(c, t + step, 1175, dur, 0.42, 'square');
  tone(c, t + step * 2, 880, dur, 0.42, 'square');
  tone(c, t + step * 3, 1175, dur, 0.42, 'square');
  return true;
}

/** The speakers work.
 *
 *  A rising major triad on a triangle wave: long enough to be unmistakable, and
 *  deliberately pleasant and nothing like the alert's see-saw, so confirming the sound
 *  is never mistaken across a ward for a patient calling. */
export function playConfirmation(): boolean {
  const c = context();
  if (!c || c.state !== 'running') return false;
  const t = startTime(c);
  tone(c, t, 523, 0.18, 0.4, 'triangle');
  tone(c, t + 0.17, 659, 0.18, 0.4, 'triangle');
  tone(c, t + 0.34, 784, 0.18, 0.4, 'triangle');
  tone(c, t + 0.51, 1047, 0.4, 0.4, 'triangle');
  return true;
}

/** Test seam: forget the session's context and listeners. */
export function resetForTests() {
  ctx = null;
  listeners.clear();
  lastPlayedAt = 0;
}
