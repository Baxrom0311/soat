// tools/generate-tokens.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emitCss } from './lib/emit-css.mjs';

const tokens = JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url), 'utf8'));

test('emits light colour tokens on :root', () => {
  const css = emitCss(tokens);
  assert.match(css, /:root\s*\{[^}]*--color-bg:\s*#F6F7F7/s);
  assert.match(css, /:root\s*\{[^}]*--color-accent:\s*#0C6A62/s);
});

test('redefines only tokens in the dark blocks, guarded both ways', () => {
  const css = emitCss(tokens);
  assert.match(css, /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)/);
  assert.match(css, /:root\[data-theme="dark"\]/);
  assert.match(css, /--color-bg:\s*#0E1213/);
});

test('call fills emit as indexed step tokens', () => {
  const css = emitCss(tokens);
  assert.match(css, /--call-fill-1:\s*#C4241A/);
  assert.match(css, /--call-fill-3:\s*#8A100A/);
});

test('alert type step arrays emit one token per step', () => {
  const css = emitCss(tokens);
  assert.match(css, /--type-alert-room-desk-size-1:\s*72px/);
  assert.match(css, /--type-alert-room-desk-size-3:\s*96px/);
});

test('a css-excluded token is not emitted to css', () => {
  const css = emitCss(tokens);
  assert.doesNotMatch(css, /room-phone-solo/);
});
