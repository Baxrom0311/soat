import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emitCss } from './lib/emit-css.mjs';
import { contrastRatio } from './lib/contrast.mjs';
import { validate } from './generate-tokens.mjs';

const tokens = JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url), 'utf8'));

test('emits light colour tokens on :root', () => {
  const css = emitCss(tokens);
  assert.match(css, /:root\s*\{[^}]*--color-bg:\s*#F8FAFC/s);
  assert.match(css, /:root\s*\{[^}]*--color-accent:\s*#0284C7/s);
});

test('redefines only tokens in the dark blocks, guarded both ways', () => {
  const css = emitCss(tokens);
  assert.match(css, /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)/);
  assert.match(css, /:root\[data-theme="dark"\]/);
  assert.match(css, /--color-bg:\s*#0F172A/);
});

test('call fills emit as indexed step tokens', () => {
  const css = emitCss(tokens);
  assert.match(css, /--call-fill-1:\s*#C4241A/);
  assert.match(css, /--call-fill-3:\s*#8A100A/);
});

test('alert type step arrays emit one token per step', () => {
  const css = emitCss(tokens);
  assert.match(css, /--type-alert-room-desk-size-1:\s*36px/);
  assert.match(css, /--type-alert-room-desk-size-3:\s*48px/);
});

test('a css-excluded token is not emitted to css', () => {
  const css = emitCss(tokens);
  assert.doesNotMatch(css, /roomPhoneSolo/);
});

test('contrastRatio matches known WCAG pairs', () => {
  assert.equal(Math.round(contrastRatio('#FFFFFF', '#000000') * 100) / 100, 21);
  assert.ok(Math.abs(contrastRatio('#14191A', '#FFFFFF') - 17.74) < 0.15);
});

test('the shipped tokens satisfy every invariant', () => {
  assert.deepEqual(validate(tokens), []);
});

test('a call fill below 4.5:1 against its ink fails Rule 2', () => {
  const bad = structuredClone(tokens);
  bad.call.fill.light[0] = '#FF9A90'; // far too light for white ink
  const errs = validate(bad);
  assert.ok(errs.some((e) => /Rule 2/.test(e)), errs.join('\n'));
});

test('a non-monotonic page-contrast ramp fails', () => {
  const bad = structuredClone(tokens);
  bad.call.fill.light = ['#8A100A', '#A81810', '#C4241A']; // reversed
  assert.ok(validate(bad).some((e) => /monotonic/i.test(e)));
});

test('a weight outside the enum fails', () => {
  const bad = structuredClone(tokens);
  bad.type.mgmt.body.weight = 620;
  assert.ok(validate(bad).some((e) => /weight/i.test(e)));
});

test('borderField clears 3:1 against surface in both themes', () => {
  for (const theme of ['light', 'dark']) {
    const r = contrastRatio(tokens.color.borderField[theme], tokens.color.surface[theme]);
    assert.ok(r >= 3.0, `${theme}: ${r}`);
  }
});
