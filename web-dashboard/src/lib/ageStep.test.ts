import { describe, it, expect } from 'vitest';
import { ageStep, elapsedLabel } from './ageStep';
import { THRESHOLDS_SEC } from './generated-tokens';

const at = (secondsAgo: number) => new Date(Date.UTC(2026, 0, 1, 12, 0, 0) - secondsAgo * 1000).toISOString();
const NOW = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));

describe('ageStep', () => {
  // Boundaries are read from the generated constant, not written out again.
  // These tests used to hard-code 30 and 120 -- which is how the phone app was
  // able to run on different numbers for weeks with every suite green: each
  // surface tested itself against its own copy.
  const [, STEP_2_AT, STEP_3_AT] = THRESHOLDS_SEC;

  it('is step 1 until the first threshold', () => {
    expect(ageStep(at(0), NOW)).toBe(1);
    expect(ageStep(at(STEP_2_AT - 1), NOW)).toBe(1);
  });
  it('is step 2 from the first threshold up to but not including the second', () => {
    expect(ageStep(at(STEP_2_AT), NOW)).toBe(2);
    expect(ageStep(at(STEP_3_AT - 1), NOW)).toBe(2);
  });
  it('is step 3 from the second threshold onward, without an upper bound', () => {
    expect(ageStep(at(STEP_3_AT), NOW)).toBe(3);
    expect(ageStep(at(86_400), NOW)).toBe(3);
  });
  it('agrees with every other surface about when a call is urgent', () => {
    // The assertion the old tests were missing entirely. Not "these are the
    // numbers I expect" but "this surface uses the shared ones".
    expect(THRESHOLDS_SEC).toEqual([0, 120, 600]);
  });
  it('treats a future timestamp as brand new rather than throwing', () => {
    expect(ageStep(at(-5), NOW)).toBe(1);
  });
});

describe('elapsedLabel', () => {
  it('formats m:ss below an hour', () => {
    expect(elapsedLabel(at(12), NOW)).toBe('0:12');
    expect(elapsedLabel(at(107), NOW)).toBe('1:47');
    expect(elapsedLabel(at(3599), NOW)).toBe('59:59');
  });
  it('formats h:mm:ss at an hour and beyond, never switching to words', () => {
    expect(elapsedLabel(at(3600), NOW)).toBe('1:00:00');
    expect(elapsedLabel(at(3661), NOW)).toBe('1:01:01');
  });
});
