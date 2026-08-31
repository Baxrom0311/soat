import { describe, it, expect } from 'vitest';
import { ageStep, elapsedLabel } from './ageStep';

const at = (secondsAgo: number) => new Date(Date.UTC(2026, 0, 1, 12, 0, 0) - secondsAgo * 1000).toISOString();
const NOW = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));

describe('ageStep', () => {
  it('is step 1 from 0s up to but not including 30s', () => {
    expect(ageStep(at(0), NOW)).toBe(1);
    expect(ageStep(at(29), NOW)).toBe(1);
  });
  it('is step 2 from 30s up to but not including 120s', () => {
    expect(ageStep(at(30), NOW)).toBe(2);
    expect(ageStep(at(119), NOW)).toBe(2);
  });
  it('is step 3 from 120s onward, without an upper bound', () => {
    expect(ageStep(at(120), NOW)).toBe(3);
    expect(ageStep(at(86_400), NOW)).toBe(3);
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
