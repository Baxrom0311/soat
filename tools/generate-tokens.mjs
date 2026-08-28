// tools/generate-tokens.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { emitCss } from './lib/emit-css.mjs';
import { contrastRatio, luminance } from './lib/contrast.mjs';

const ROOT = new URL('../', import.meta.url);
const tokens = JSON.parse(readFileSync(new URL('tokens.json', ROOT), 'utf8'));

const EMITTERS = { css: { path: tokens.meta.outputs.css, render: emitCss } };

export { emitCss };

const ALERT_TYPE_SCOPES = ['alert', 'watch'];

export function validate(t) {
  const errs = [];
  const inv = t.call.invariants;

  for (const theme of ['light', 'dark']) {
    const fills = t.call.fill[theme];
    const ink = t.call.ink[theme];
    const bg = t.color.bg[theme];

    fills.forEach((fill, i) => {
      const vsInk = contrastRatio(fill, ink);
      if (vsInk < inv.inkContrastMin) {
        errs.push(`Rule 2: call.fill.${theme}[${i}] ${fill} is ${vsInk.toFixed(2)}:1 against ink ${ink} (min ${inv.inkContrastMin})`);
      }
      const vsPage = contrastRatio(fill, bg);
      if (vsPage < inv.pageContrastMin) {
        errs.push(`Page invariant: call.fill.${theme}[${i}] ${fill} is ${vsPage.toFixed(2)}:1 against bg ${bg} (min ${inv.pageContrastMin})`);
      }
    });

    if (inv.luminanceMonotonic) {
      const lum = fills.map((f) => luminance(f));
      for (let i = 1; i < lum.length; i++) {
        if (lum[i] <= lum[i - 1]) {
          errs.push(`Luminance not monotonic in ${theme}: step ${i} (${lum[i].toFixed(4)}) <= step ${i - 1} (${lum[i - 1].toFixed(4)}) — an older call must look more alarming, not less`);
        }
      }
    }

    if (inv.adjacentStepMin && inv.adjacentStepMin[theme] != null) {
      const min = inv.adjacentStepMin[theme];
      for (let i = 1; i < fills.length; i++) {
        const r = contrastRatio(fills[i], fills[i - 1]);
        if (r < min) {
          errs.push(`Adjacent step contrast in ${theme}: step ${i - 1} vs ${i} (${fills[i - 1]} vs ${fills[i]}) is ${r.toFixed(3)}:1 (min ${min}) — the steps must be tellable apart`);
        }
      }
    }
  }

  // Rule 1: no alpha token may be referenced by the alert register.
  for (const scope of ALERT_TYPE_SCOPES) {
    for (const [name, style] of Object.entries(t.type[scope] ?? {})) {
      if (style && style.alpha) errs.push(`Rule 1: type.${scope}.${name} carries alpha; the alert register forbids it`);
    }
  }
  for (const [k, v] of Object.entries({ ...t.call.ink, ...t.call.edge, ...t.call.slab })) {
    if (typeof v === 'string' && v.length > 7) errs.push(`Rule 1: call token ${k} is 8-digit (${v}); the alert register forbids alpha`);
  }
  for (const theme of ['light', 'dark']) {
    (t.call.fill[theme] ?? []).forEach((v, i) => {
      if (typeof v === 'string' && v.length > 7) errs.push(`Rule 1: call.fill.${theme}[${i}] is 8-digit (${v}); the alert register forbids alpha`);
    });
  }

  // Weight enum.
  const allowed = new Set(t.font.weights);
  for (const [scope, styles] of Object.entries(t.type)) {
    for (const [name, s] of Object.entries(styles)) {
      if (s && typeof s === 'object' && s.weight != null && !allowed.has(s.weight)) {
        errs.push(`Weight enum: type.${scope}.${name}.weight = ${s.weight}; allowed ${[...allowed].join(', ')} (Inter ships no other static face, and RN resolves a family NAME per weight)`);
      }
    }
  }

  // Non-text contrast on the one border that carries meaning.
  for (const theme of ['light', 'dark']) {
    const r = contrastRatio(t.color.borderField[theme], t.color.surface[theme]);
    if (r < 3.0) errs.push(`Non-text contrast: borderField ${theme} is ${r.toFixed(2)}:1 against surface (min 3.0)`);
  }

  return errs;
}

// Correction 1: guard the CLI body so importing this module (e.g. from a later
// task's test suite) never runs the emitter loop or calls process.exit.
const isCli = process.argv[1] && process.argv[1].endsWith('generate-tokens.mjs');

if (isCli) {
  const check = process.argv.includes('--check');

  const problems = validate(tokens);
  if (problems.length) {
    console.error('tokens.json failed validation:\n' + problems.map((p) => '  - ' + p).join('\n'));
    process.exit(1);
  }

  let failed = false;
  for (const [target, { path, render }] of Object.entries(EMITTERS)) {
    const url = new URL(path, ROOT);
    const next = render(tokens);
    const prev = existsSync(url) ? readFileSync(url, 'utf8') : null;
    if (check) {
      if (prev !== next) {
        console.error(`STALE: ${path} does not match tokens.json — run: node tools/generate-tokens.mjs`);
        failed = true;
      }
    } else if (prev !== next) {
      writeFileSync(url, next);
      console.log(`wrote ${path}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
