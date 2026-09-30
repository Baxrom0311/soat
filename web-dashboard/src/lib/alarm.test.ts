import { beforeEach, describe, expect, test, vi } from 'vitest';
import { isAudioBlocked, playAlert, playConfirmation, resetForTests, subscribe, unlockAudio } from './alarm';

/** Minimal stand-in for the parts of AudioContext this module touches. jsdom has no Web
 *  Audio, and the behaviour worth pinning here is the blocked/allowed decision and what
 *  gets scheduled, not the waveform. */
function installAudioContext(initialState: AudioContextState) {
  const nodes = { started: 0, notes: [] as { wave: string; freq: number }[] };
  let constructed = 0;
  const ctx = {
    state: initialState,
    currentTime: 0,
    onstatechange: null as null | (() => void),
    resume: vi.fn(async () => {
      ctx.state = 'running';
      ctx.onstatechange?.();
    }),
    createOscillator: () => {
      const osc = {
        type: '',
        frequency: { value: 0 },
        connect: () => {},
        disconnect: () => {},
        start: () => {
          nodes.started += 1;
          nodes.notes.push({ wave: osc.type, freq: osc.frequency.value });
        },
        stop: () => {},
        onended: null,
      };
      return osc;
    },
    createGain: () => ({
      gain: {
        value: 0,
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      connect: () => {},
      disconnect: () => {},
    }),
    destination: {},
  };
  (window as unknown as { AudioContext: unknown }).AudioContext = vi.fn(() => {
    constructed += 1;
    return ctx;
  });
  return { ctx, nodes, constructedCount: () => constructed };
}

/** Sound is only ever allowed after a click, so most cases start from one. */
async function afterUnlock(state: AudioContextState = 'suspended') {
  const harness = installAudioContext(state);
  await unlockAudio();
  harness.nodes.started = 0; // ignore the unlock's own confirmation
  harness.nodes.notes.length = 0;
  return harness;
}

beforeEach(() => {
  resetForTests();
});

describe('alarm', () => {
  test('nothing is constructed before the first click', () => {
    // An AudioContext built during render is merely suspended in Chrome but can be
    // permanently mute in Safari, and a silently dead context is the worst state this
    // button can be in. So it is not created until the gesture that permits it.
    const h = installAudioContext('suspended');
    expect(isAudioBlocked()).toBe(true);
    expect(h.constructedCount()).toBe(0);
  });

  test('a browser with no Web Audio at all counts as blocked rather than throwing', async () => {
    (window as unknown as { AudioContext: unknown }).AudioContext = undefined;
    expect(isAudioBlocked()).toBe(true);
    expect(await unlockAudio()).toBe(false);
    expect(playAlert()).toBe(false);
  });

  test('playAlert reports failure before any unlock, so silence is never mistaken for an alert', () => {
    const h = installAudioContext('suspended');
    expect(playAlert()).toBe(false);
    expect(h.nodes.started).toBe(0);
  });

  test('unlocking makes a sound, so a working click is distinguishable from a dead one', async () => {
    // Switching sound on is the one action whose purpose is otherwise inaudible: with no
    // confirmation a successful click and a dead one look identical, which is how this
    // was reported from the ward.
    const h = installAudioContext('suspended');
    const ok = await unlockAudio();
    expect(ok).toBe(true);
    expect(h.nodes.started).toBeGreaterThan(0);
  });

  test('unlocking leaves sound allowed', async () => {
    await afterUnlock();
    expect(isAudioBlocked()).toBe(false);
  });

  test('unlockAudio tells subscribers it is no longer blocked', async () => {
    installAudioContext('suspended');
    const seen: boolean[] = [];
    subscribe(() => seen.push(isAudioBlocked()));
    await unlockAudio();
    expect(seen).toContain(false);
  });

  test('a failed unlock reports false and stays silent and blocked', async () => {
    const h = installAudioContext('suspended');
    h.ctx.resume = vi.fn(async () => {
      throw new Error('not allowed');
    });
    expect(await unlockAudio()).toBe(false);
    expect(h.nodes.started).toBe(0);
    expect(isAudioBlocked()).toBe(true);
  });

  test('a context the browser unblocks on its own still notifies', async () => {
    // Any click anywhere on the page can flip this; the prompt must stop showing.
    const h = installAudioContext('suspended');
    h.ctx.resume = vi.fn(async () => {}); // resume does not change state on its own
    await unlockAudio();

    const seen: boolean[] = [];
    subscribe(() => seen.push(isAudioBlocked()));
    h.ctx.state = 'running';
    h.ctx.onstatechange?.();

    expect(seen).toContain(false);
  });

  test('the alert is a repeating two-pitch see-saw, not a single blip', async () => {
    // A blip is missed across a room with people talking in it; alternation is what
    // makes a sound read as an alarm rather than a notification.
    const h = await afterUnlock();
    expect(playAlert()).toBe(true);
    expect(h.nodes.started).toBeGreaterThanOrEqual(4);
    const freqs = h.nodes.notes.map((n) => n.freq);
    expect(new Set(freqs).size).toBe(2);
    expect(freqs[0]).not.toBe(freqs[1]);
    expect(freqs[0]).toBe(freqs[2]);
  });

  test('a second alert inside the guard window does not double up', async () => {
    // A new-call websocket event and the repeat timer can land together; two overlapping
    // patterns read as noise rather than as two calls.
    const h = await afterUnlock();
    playAlert();
    const afterFirst = h.nodes.started;
    playAlert();
    expect(h.nodes.started).toBe(afterFirst);
  });

  test('the confirmation rises, and is a different voice from the alert', async () => {
    // Confirming the speakers must never be mistaken across a ward for a patient
    // calling, so it differs in both timbre and shape: a rising figure on a softer wave
    // against the alert's see-saw on a square one.
    const h = await afterUnlock();
    expect(playConfirmation()).toBe(true);
    const freqs = h.nodes.notes.map((n) => n.freq);
    expect(freqs.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < freqs.length; i++) expect(freqs[i]).toBeGreaterThan(freqs[i - 1]);
    expect(new Set(h.nodes.notes.map((n) => n.wave))).not.toContain('square');
  });

  test('the confirmation ignores the repeat guard, since it answers a click', async () => {
    const h = await afterUnlock();
    playConfirmation();
    const afterFirst = h.nodes.started;
    playConfirmation();
    expect(h.nodes.started).toBe(afterFirst * 2);
  });
});
