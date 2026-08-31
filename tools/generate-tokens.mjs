import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { emitCss, emitLanding, emitTs, emitKotlin } from './lib/emit-css.mjs';
import { contrastRatio } from './lib/contrast.mjs';

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

    if (inv.pageContrastMonotonic) {
      const ramp = fills.map((f) => contrastRatio(f, bg));
      for (let i = 1; i < ramp.length; i++) {
        if (ramp[i] <= ramp[i - 1]) {
          errs.push(`Page contrast not monotonic in ${theme}: step ${i} (${ramp[i].toFixed(2)}) <= step ${i - 1} (${ramp[i - 1].toFixed(2)}) — a step nobody can see is not a step`);
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

const isCli = process.argv[1] && process.argv[1].endsWith('generate-tokens.mjs');
if (isCli) {
  const ROOT = new URL('../', import.meta.url);
  const tokens = JSON.parse(readFileSync(new URL('tokens.json', ROOT), 'utf8'));
  const check = process.argv.includes('--check');

  const problems = validate(tokens);
  if (problems.length) {
    console.error('tokens.json failed validation:\n' + problems.map((p) => '  - ' + p).join('\n'));
    process.exit(1);
  }

  const EMITTERS = {
    css: { path: tokens.meta.outputs.css, render: (t) => emitCss(t) },
    ts: { path: tokens.meta.outputs.ts, render: (t) => emitTs(t) },
    kotlin: { path: tokens.meta.outputs.kotlin, render: (t) => emitKotlin(t) },
    landing: { path: tokens.meta.outputs.landing, render: (t, prev) => emitLanding(t, prev) },
  };

  let failed = false;
  for (const [target, { path, render }] of Object.entries(EMITTERS)) {
    const url = new URL(path, ROOT);
    const prev = existsSync(url) ? readFileSync(url, 'utf8') : null;
    const next = render(tokens, prev);
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
