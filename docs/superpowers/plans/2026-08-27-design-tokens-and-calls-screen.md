# Design Tokens + Calls Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the single-source token pipeline and rebuild the dashboard's Calls screen plus the new `/wall` route on top of it, so the owner can approve the visual direction from one real screen before the remaining three frontends are touched.

**Architecture:** One `tokens.json` at the repo root is the only place a colour, size or spacing value is authored. A Node generator emits `tokens.css` for the web dashboard and will later emit the phone theme, the Kotlin object and the landing block; a `--check` mode fails the build when a generated file is stale or when a token violates a stated invariant. On top of those tokens, one `<CallCard>` component and one `ageStep()` function serve both `/calls` and `/wall` — display-only on the wall is guaranteed by the component's type signature (the slab renders `if (onAck)`, and `/wall` never passes it) rather than by a string comparison.

**Tech Stack:** Node 18+ (`node --test`, zero new deps for the generator), React 19 + Vite + TypeScript, Vitest + @testing-library/react (new to this repo), plain CSS custom properties (no Tailwind, no CSS-in-JS).

**Spec:** `docs/superpowers/specs/2026-08-27-design-system-design.md`

## Global Constraints

Copied verbatim from the spec. Every task's requirements implicitly include this section.

- **Font weights: 400, 500, 600, 700 only, ever.** Inter ships no static 450/550/620/650 face.
- **Red is reserved.** `call.*` tokens may be consumed only by a component rendering a live patient call. Allowlist: `CallCard`, `WallView`, `ageStep`, the watch call composables, the landing hero figure.
- **Rule 1: no alpha in the alert register.** Every glyph on a red fill is pure `#FFFFFF`.
- **Rule 2:** every `call.fill` must measure ≥ 4.5:1 against `call.ink`.
- **Page invariant:** every `call.fill` ≥ 3:1 against `color.bg` in its own theme, and the three steps strictly increasing in page contrast.
- **Zero motion in the alert register**, on any target. `motion.alertRegister: "none"`.
- **`min-height`, never `height`** on any card, row or button.
- **Uzbek Latin:** minimum body size 15px; no negative letter-spacing below 22px; no all-caps except the `eyebrow` token; `U+02BB (ʻ)` is the canonical apostrophe.
- **`tabular-nums` mandatory** on every number in the product.
- **One gutter per screen module.** More than one `gutter.*` referenced in one module fails `--check`.
- **Backend and every API contract are untouched.** No feature added or removed.
- Ageing thresholds live in `tokens.json` as `call.thresholdsSec: [0, 30, 120]` **and nowhere else**.

---

## File Structure

| Path | Responsibility |
|---|---|
| `tokens.json` | Create. The single source of truth. Content: spec §7 verbatim. |
| `tools/generate-tokens.mjs` | Create. Reads `tokens.json`, emits targets, implements `--check`. |
| `tools/lib/contrast.mjs` | Create. WCAG relative-luminance contrast ratio. Pure, testable, no deps. |
| `tools/lib/emit-css.mjs` | Create. The CSS custom-property emitter. |
| `tools/generate-tokens.test.mjs` | Create. `node --test` suite for the generator and its invariants. |
| `web-dashboard/src/styles/tokens.css` | Generated. Never hand-edited. |
| `web-dashboard/src/lib/ageStep.ts` | Create. The one ageing function, shared by `/calls` and `/wall`. |
| `web-dashboard/src/components/calls/CallCard.tsx` | Create. One call, all sizes, all steps. Slab only when `onAck` given. |
| `web-dashboard/src/components/calls/CallsLive.tsx` | Create. The live grid + empty state for `/calls`. |
| `web-dashboard/src/components/calls/callcard.css` | Create. Alert-register styles, tokens only. |
| `web-dashboard/src/routes/WallView.tsx` | Create. The `/wall` route: forced dark, solo/grid/overflow. |
| `web-dashboard/src/styles/style.css` | Modify. Import `tokens.css`; delete the purple/cyan token block. |
| `web-dashboard/src/App.tsx` | Modify. Register the `/wall` route outside the authed layout. |
| `web-dashboard/package.json` | Modify. Add vitest + testing-library; add `test` script. |

---

## Task 1: tokens.json and the CSS emitter

**Files:**
- Create: `tokens.json`
- Create: `tools/lib/emit-css.mjs`
- Create: `tools/generate-tokens.mjs`
- Test: `tools/generate-tokens.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `emitCss(tokens) -> string`; CLI `node tools/generate-tokens.mjs [--check]` exiting 0 on success, 1 on failure.

- [ ] **Step 1: Create `tokens.json`**

Copy the JSONC block from spec §7 verbatim, then make it strict JSON: strip every `//` comment and trailing comma. Keep every key, every value and the key order unchanged. Do not invent, round or "tidy" any value — the contrast numbers in the spec were computed against these exact hexes.

- [ ] **Step 2: Write the failing test**

```js
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
  assert.match(css, /--type-alert-roomDesk-size-1:\s*72px/);
  assert.match(css, /--type-alert-roomDesk-size-3:\s*96px/);
});

test('a css-excluded token is not emitted to css', () => {
  const css = emitCss(tokens);
  assert.doesNotMatch(css, /roomPhoneSolo/);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tools/`
Expected: FAIL — `Cannot find module './lib/emit-css.mjs'`.

- [ ] **Step 4: Implement the emitter**

```js
// tools/lib/emit-css.mjs
const KEBAB = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/** A token is emitted to a target when it declares no `targets` (all four) or lists it. */
export function allowsTarget(node, target) {
  return !node || !Array.isArray(node.targets) || node.targets.includes(target);
}

function colorVars(color, theme) {
  return Object.entries(color)
    .filter(([, v]) => allowsTarget(v, 'css'))
    .map(([k, v]) => `  --color-${KEBAB(k)}: ${v[theme]};`);
}

function callVars(call, theme) {
  const out = [];
  call.fill[theme].forEach((hex, i) => out.push(`  --call-fill-${i + 1}: ${hex};`));
  out.push(`  --call-ink: ${call.ink[theme]};`);
  out.push(`  --call-edge: ${call.edge[theme]};`);
  out.push(`  --call-slab: ${call.slab[theme]};`);
  for (const [surface, widths] of Object.entries(call.edgeWidth)) {
    widths.forEach((w, i) => out.push(`  --call-edge-w-${KEBAB(surface)}-${i + 1}: ${w}px;`));
  }
  return out;
}

/** Theme-invariant tokens: emitted once, in :root only. */
function staticVars(t) {
  const out = [];
  for (const [group, scale] of Object.entries({ space: t.space, gutter: t.gutter, control: t.control, border: t.border, radius: t.radius, size: t.size })) {
    for (const [k, v] of Object.entries(scale)) {
      if (Array.isArray(v) || typeof v === 'object') continue; // radius.bands, rail sub-objects
      out.push(`  --${group}-${KEBAB(k)}: ${typeof v === 'number' ? v + 'px' : v};`);
    }
  }
  for (const [k, v] of Object.entries(t.rail)) {
    if (typeof v === 'object') {
      for (const [dim, n] of Object.entries(v)) out.push(`  --rail-${KEBAB(k)}-${dim}: ${n}px;`);
    } else {
      out.push(`  --rail-${KEBAB(k)}: ${v};`);
    }
  }
  for (const [scope, styles] of Object.entries(t.type)) {
    for (const [name, s] of Object.entries(styles)) {
      if (!allowsTarget(s, 'css') || !allowsTarget(styles, 'css')) continue;
      if (name === 'targets' || name === 'unit') continue;
      const p = `--type-${KEBAB(scope)}-${name}`;
      if (Array.isArray(s.size)) s.size.forEach((n, i) => out.push(`  ${p}-size-${i + 1}: ${n}px;`));
      else if (Array.isArray(s.clamp)) out.push(`  ${p}-size: clamp(${s.clamp[0]}px, ${s.clamp[1]}, ${s.clamp[2]}px);`);
      else if (s.size != null) out.push(`  ${p}-size: ${s.size}px;`);
      if (s.lineHeight != null) out.push(`  ${p}-lh: ${s.lineHeight > 3 ? s.lineHeight + 'px' : s.lineHeight};`);
      if (s.weight != null) out.push(`  ${p}-weight: ${s.weight};`);
      if (s.tracking) out.push(`  ${p}-tracking: ${s.tracking}em;`);
    }
  }
  out.push(`  --font-sans: ${t.font.sans.stack.map((f) => (f.includes(' ') ? `"${f}"` : f)).join(', ')};`);
  out.push(`  --font-mono: ${t.font.mono.stack.map((f) => (f.includes(' ') ? `"${f}"` : f)).join(', ')};`);
  out.push(`  --motion-fast: ${t.motion.fast}ms;`);
  out.push(`  --motion-base: ${t.motion.base}ms;`);
  out.push(`  --motion-ease: ${t.motion.ease};`);
  return out;
}

function themeBlock(t, theme) {
  return [...colorVars(t.color, theme), ...callVars(t.call, theme), `  --shadow-pop: ${t.shadow.pop[theme]};`];
}

export function emitCss(t) {
  const header = `/* GENERATED by tools/generate-tokens.mjs from tokens.json v${t.meta.version}. DO NOT EDIT. */\n`;
  const light = [...themeBlock(t, 'light'), ...staticVars(t), '  color-scheme: light;'];
  const dark = [...themeBlock(t, 'dark'), '  color-scheme: dark;'];
  return (
    header +
    `\n:root {\n${light.join('\n')}\n}\n` +
    `\n@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n${dark.map((l) => '  ' + l).join('\n')}\n  }\n}\n` +
    `\n:root[data-theme="dark"] {\n${dark.join('\n')}\n}\n`
  );
}
```

- [ ] **Step 5: Implement the CLI**

```js
// tools/generate-tokens.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { emitCss } from './lib/emit-css.mjs';

const ROOT = new URL('../', import.meta.url);
const tokens = JSON.parse(readFileSync(new URL('tokens.json', ROOT), 'utf8'));
const check = process.argv.includes('--check');

const EMITTERS = { css: { path: tokens.meta.outputs.css, render: emitCss } };

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
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tools/`
Expected: PASS, 5 tests.

- [ ] **Step 7: Generate and eyeball the output**

Run: `node tools/generate-tokens.mjs && head -40 web-dashboard/src/styles/tokens.css`
Expected: a `:root` block with `--color-bg: #F6F7F7`, `--call-fill-1: #C4241A`, `--type-alert-room-desk-size-1: 72px`.
Then run `node tools/generate-tokens.mjs --check` — expect exit 0 and no output.

- [ ] **Step 8: Commit**

```bash
git add tokens.json tools/ web-dashboard/src/styles/tokens.css
git commit -m "Add tokens.json as the single source of design values, plus a CSS emitter

Hand-maintained parity is what already failed here: mobile-app/src/theme.ts opens with
a comment claiming the same tokens as the dashboard while holding the blue the dashboard
stopped using. --check makes that drift a build failure instead of a discovery."
```

---

## Task 2: the invariants that make `--check` worth having

**Files:**
- Create: `tools/lib/contrast.mjs`
- Modify: `tools/generate-tokens.mjs`
- Test: `tools/generate-tokens.test.mjs` (append)

**Interfaces:**
- Consumes: `tokens.json` from Task 1.
- Produces: `contrastRatio(hex1, hex2) -> number`; `validate(tokens) -> string[]` (list of human-readable failures, empty when clean).

- [ ] **Step 1: Write the failing tests**

```js
// append to tools/generate-tokens.test.mjs
import { contrastRatio } from './lib/contrast.mjs';
import { validate } from './generate-tokens.mjs';

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
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tools/`
Expected: FAIL — `Cannot find module './lib/contrast.mjs'`.

- [ ] **Step 3: Implement contrast**

```js
// tools/lib/contrast.mjs
function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Accepts #RGB, #RRGGBB and #RRGGBBAA (alpha ignored — alpha tokens are never
 *  compared, they are rejected outright in the alert register by Rule 1). */
export function luminance(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
```

- [ ] **Step 4: Implement `validate` and wire it into the CLI**

Add to `tools/generate-tokens.mjs`, above the emitter loop, and export it:

```js
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
```

Then, immediately before the emitter loop:

```js
const problems = validate(tokens);
if (problems.length) {
  console.error('tokens.json failed validation:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
```

Guard the CLI body so importing the module for tests does not run it:

```js
const isCli = process.argv[1] && process.argv[1].endsWith('generate-tokens.mjs');
if (isCli) { /* validation + emitter loop + process.exit */ }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tools/`
Expected: PASS, 11 tests. The `validate(tokens)` test passing is the meaningful one — it proves the spec's published contrast figures are real.

- [ ] **Step 6: Commit**

```bash
git add tools/
git commit -m "Fail the build on a design invariant, not just on stale output

Three independent design proposals were reviewed for this system and each shipped a
measurable contrast defect: one put the newest call at 2.39:1 against the dark canvas,
another had 1.16:1 between ageing steps. Those are arithmetic mistakes, so they get an
arithmetic guard rather than a code-review convention."
```

---

## Task 3: `ageStep()` — one function, both routes

**Files:**
- Create: `web-dashboard/src/lib/ageStep.ts`
- Modify: `web-dashboard/package.json`
- Create: `web-dashboard/vitest.config.ts`
- Test: `web-dashboard/src/lib/ageStep.test.ts`

**Interfaces:**
- Consumes: `call.thresholdsSec` from `tokens.json` (hard-coded here as a typed constant mirroring it; Task 2's `--check` rule 1 keeps them equal because `tokens.css` carries the same numbers).
- Produces: `export type AgeStep = 1 | 2 | 3`; `export function ageStep(createdAtIso: string, now?: Date): AgeStep`; `export function elapsedLabel(createdAtIso: string, now?: Date): string`.

- [ ] **Step 1: Add the test runner**

```bash
cd web-dashboard
npm i -D vitest@^2 @testing-library/react@^16 @testing-library/dom@^10 jsdom@^25
```

Add to `web-dashboard/package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

Create `web-dashboard/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true },
});
```

- [ ] **Step 2: Write the failing test**

```ts
// web-dashboard/src/lib/ageStep.test.ts
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
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./ageStep`.

- [ ] **Step 4: Implement**

```ts
// web-dashboard/src/lib/ageStep.ts

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
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add web-dashboard/package.json web-dashboard/package-lock.json web-dashboard/vitest.config.ts web-dashboard/src/lib/
git commit -m "Add ageStep(), the one definition of how a call escalates

This repo had no test suite at all. It gets one here because ageStep is the function
that decides which patient a nurse runs to first, and because /calls and /wall must
never disagree about a call's step -- a shared function makes disagreement impossible
rather than unlikely."
```

---

## Task 4: `<CallCard>` — the alert register

**Files:**
- Create: `web-dashboard/src/components/calls/CallCard.tsx`
- Create: `web-dashboard/src/components/calls/callcard.css`
- Test: `web-dashboard/src/components/calls/CallCard.test.tsx`

**Interfaces:**
- Consumes: `ageStep`, `elapsedLabel` from Task 3; `tokens.css` from Task 1.
- Produces:
```ts
export type CallCardSize = 'desk' | 'wall' | 'wallSolo';
export interface CallCardProps {
  roomNumber: string;
  floor: number;
  createdAt: string;
  size?: CallCardSize;          // default 'desk'
  onAck?: () => void | Promise<void>;   // ABSENT => no slab is rendered
  now?: Date;                   // tests only
}
export function CallCard(props: CallCardProps): JSX.Element;
```

- [ ] **Step 1: Write the failing test**

```tsx
// web-dashboard/src/components/calls/CallCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CallCard } from './CallCard';

const NOW = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
const ago = (s: number) => new Date(NOW.getTime() - s * 1000).toISOString();

describe('CallCard', () => {
  it('shows the room number with no "Xona" prefix', () => {
    render(<CallCard roomNumber="214" floor={2} createdAt={ago(5)} now={NOW} />);
    expect(screen.getByText('214')).toBeTruthy();
    expect(screen.queryByText(/Xona/)).toBeNull();
  });

  it('shows floor and a counting timer', () => {
    render(<CallCard roomNumber="108" floor={1} createdAt={ago(107)} now={NOW} />);
    expect(screen.getByText('1-qavat')).toBeTruthy();
    expect(screen.getByText('1:47')).toBeTruthy();
  });

  it('renders three rail slots always, with `step` of them filled', () => {
    const { container, rerender } = render(<CallCard roomNumber="1" floor={1} createdAt={ago(5)} now={NOW} />);
    expect(container.querySelectorAll('[data-rail-slot]').length).toBe(3);
    expect(container.querySelectorAll('[data-rail-slot="on"]').length).toBe(1);
    rerender(<CallCard roomNumber="1" floor={1} createdAt={ago(300)} now={NOW} />);
    expect(container.querySelectorAll('[data-rail-slot="on"]').length).toBe(3);
  });

  it('carries the age step as a data attribute so CSS selects the fill', () => {
    const { container } = render(<CallCard roomNumber="1" floor={1} createdAt={ago(60)} now={NOW} />);
    expect(container.querySelector('[data-step="2"]')).toBeTruthy();
  });

  // The constraint-6 guarantee, enforced by the type signature.
  it('renders NO acknowledge control when onAck is not supplied', () => {
    render(<CallCard roomNumber="214" floor={2} createdAt={ago(5)} now={NOW} size="wall" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/Tasdiqlash/)).toBeNull();
  });

  it('renders the slab when onAck is supplied and calls it once', async () => {
    const onAck = vi.fn();
    render(<CallCard roomNumber="214" floor={2} createdAt={ago(5)} now={NOW} onAck={onAck} />);
    screen.getByRole('button', { name: /Tasdiqlash/ }).click();
    expect(onAck).toHaveBeenCalledTimes(1);
  });

  it('disables the slab and swaps the label while in flight, without changing its width', async () => {
    let resolve!: () => void;
    const onAck = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    render(<CallCard roomNumber="214" floor={2} createdAt={ago(5)} now={NOW} onAck={onAck} />);
    const btn = screen.getByRole('button');
    btn.click();
    await Promise.resolve();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.textContent).toMatch(/Yuborilmoqda/);
    resolve();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./CallCard`.

- [ ] **Step 3: Implement the component**

```tsx
// web-dashboard/src/components/calls/CallCard.tsx
import { useEffect, useState } from 'react';
import { ageStep, elapsedLabel } from '../../lib/ageStep';
import './callcard.css';

export type CallCardSize = 'desk' | 'wall' | 'wallSolo';

export interface CallCardProps {
  roomNumber: string;
  floor: number;
  createdAt: string;
  size?: CallCardSize;
  /** Absent => display-only. /wall never passes this, so the wall cannot acknowledge a
   *  call: the guarantee lives in the type signature, not in a variant string a typo
   *  could defeat or a future third variant could silently escape. */
  onAck?: () => void | Promise<void>;
  /** Tests only: freezes the clock. */
  now?: Date;
}

const RAIL_SLOTS = 3;

export function CallCard({ roomNumber, floor, createdAt, size = 'desk', onAck, now }: CallCardProps) {
  // Re-render once a second so the timer counts and the step escalates between polls.
  const [, tick] = useState(0);
  useEffect(() => {
    if (now) return; // frozen clock in tests: no interval
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [now]);

  const [busy, setBusy] = useState(false);
  const step = ageStep(createdAt, now);

  async function handleAck() {
    if (!onAck || busy) return;
    setBusy(true);
    try {
      await onAck();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="call-card" data-step={step} data-size={size}>
      <div className="call-card__rail" aria-hidden="true">
        {Array.from({ length: RAIL_SLOTS }, (_, i) => (
          <span key={i} data-rail-slot={i < step ? 'on' : 'off'} />
        ))}
      </div>

      <div className="call-card__body">
        <div className="call-card__room">{roomNumber}</div>
        <div className="call-card__meta">
          <span className="call-card__floor">{floor}-qavat</span>
          <span className="call-card__timer">{elapsedLabel(createdAt, now)}</span>
        </div>

        {onAck && (
          <button type="button" className="call-card__slab" onClick={handleAck} disabled={busy}>
            {busy ? 'Yuborilmoqda…' : 'Tasdiqlash'}
          </button>
        )}
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Implement the CSS**

```css
/* web-dashboard/src/components/calls/callcard.css
   Alert register: token values only, no literals, no motion, no shadow, no alpha. */

.call-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-16);
  align-items: center;
  padding: var(--space-20);
  border-radius: var(--radius-3);
  min-height: 0;              /* never `height` — OS font scaling must grow the card */
  color: var(--call-ink);
  background: var(--call-fill-1);
  outline: var(--call-edge-w-desk-phone-1) solid var(--call-edge);
  outline-offset: calc(-1 * var(--call-edge-w-desk-phone-1));
}
.call-card[data-step='2'] { background: var(--call-fill-2); outline-width: var(--call-edge-w-desk-phone-2); outline-offset: calc(-1 * var(--call-edge-w-desk-phone-2)); }
.call-card[data-step='3'] { background: var(--call-fill-3); outline-width: var(--call-edge-w-desk-phone-3); outline-offset: calc(-1 * var(--call-edge-w-desk-phone-3)); }

.call-card__rail { display: flex; flex-direction: column; gap: var(--rail-desk-gap); }
.call-card__rail > span {
  display: block;
  width: var(--rail-desk-w);
  height: var(--rail-desk-h);
  border-radius: 1px;
  border: var(--rail-empty-stroke, 1.5px) solid var(--call-ink);
}
.call-card__rail > [data-rail-slot='on'] { background: var(--call-ink); }

.call-card__room {
  font-size: var(--type-alert-room-desk-size-1);
  line-height: var(--type-alert-room-desk-lh);
  font-weight: var(--type-alert-room-desk-weight);
  letter-spacing: var(--type-alert-room-desk-tracking);
  font-variant-numeric: tabular-nums;
  /* Cap OS scaling on the two already-huge values so a 4-digit room cannot overflow. */
  max-font-size: none;
}
.call-card[data-step='2'] .call-card__room { font-size: var(--type-alert-room-desk-size-2); }
.call-card[data-step='3'] .call-card__room { font-size: var(--type-alert-room-desk-size-3); }

.call-card__meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-12);
  margin-top: var(--space-12);
}
.call-card__floor {
  font-size: var(--type-alert-floor-desk-size);
  line-height: var(--type-alert-floor-desk-lh);
  font-weight: var(--type-alert-floor-desk-weight);
}
.call-card__timer {
  font-family: var(--font-mono);
  font-size: var(--type-alert-timer-desk-size);
  line-height: var(--type-alert-timer-desk-lh);
  font-weight: var(--type-alert-timer-desk-weight);
  font-variant-numeric: tabular-nums;
}

.call-card__slab {
  display: block;
  width: 100%;
  margin-top: var(--space-16);
  min-height: var(--control-36);
  border: 0;
  border-radius: var(--radius-2);
  background: var(--call-slab);
  color: var(--call-fill-1);
  font-family: inherit;
  font-size: var(--type-alert-ack-desk-size);
  font-weight: var(--type-alert-ack-desk-weight);
  cursor: pointer;
}
.call-card[data-step='2'] .call-card__slab { color: var(--call-fill-2); }
.call-card[data-step='3'] .call-card__slab { color: var(--call-fill-3); }
.call-card__slab:disabled { cursor: default; }
.call-card__slab:focus-visible { outline: var(--border-focus) solid var(--call-ink); outline-offset: var(--border-focus-offset); }

/* --- wall sizes: same component, different token arrays --- */
.call-card[data-size='wall'] .call-card__room { font-size: var(--type-alert-room-wall-size-1); }
.call-card[data-size='wall'][data-step='2'] .call-card__room { font-size: var(--type-alert-room-wall-size-2); }
.call-card[data-size='wall'][data-step='3'] .call-card__room { font-size: var(--type-alert-room-wall-size-3); }
.call-card[data-size='wall'] .call-card__floor { font-size: var(--type-alert-floor-wall-size); }
.call-card[data-size='wall'] .call-card__timer { font-size: var(--type-alert-timer-wall-size); }
.call-card[data-size='wall'] .call-card__rail > span { width: var(--rail-wall-w); height: var(--rail-wall-h); }
.call-card[data-size='wall'] .call-card__rail { gap: var(--rail-wall-gap); }
.call-card[data-size='wallSolo'] .call-card__room { font-size: var(--type-alert-room-wall-solo-size-1); }
.call-card[data-size='wallSolo'][data-step='2'] .call-card__room { font-size: var(--type-alert-room-wall-solo-size-2); }
.call-card[data-size='wallSolo'][data-step='3'] .call-card__room { font-size: var(--type-alert-room-wall-solo-size-3); }
```

Note: delete the `max-font-size: none;` line — it is not a real property. The OS-scaling cap for the room number is handled on the phone target (`maxFontSizeMultiplier`) and on the web by the fixed px sizes, which do not scale with the browser's text-size setting.

- [ ] **Step 5: Run to verify it passes**

Run: `npm test`
Expected: PASS, 13 tests total.

- [ ] **Step 6: Commit**

```bash
git add web-dashboard/src/components/calls/
git commit -m "Add CallCard: one component for desk and wall, ageing in four channels

Display-only on the wall is enforced by the type signature -- the slab renders if(onAck)
and /wall never passes one -- rather than by a variant string comparison a typo defeats.
Ageing carries position, a 1-of-3 rail, numeral size and edge width alongside the fill,
so a colour-blind nurse reads the full ordering."
```

---

## Task 5: `/calls` — header, live grid, empty state, history

**Files:**
- Create: `web-dashboard/src/components/calls/CallsLive.tsx`
- Modify: `web-dashboard/src/components/tabs/CallsTab.tsx`
- Modify: `web-dashboard/src/styles/style.css`
- Test: `web-dashboard/src/components/calls/CallsLive.test.tsx`

**Interfaces:**
- Consumes: `CallCard` (Task 4), `ageStep` (Task 3), and the existing `useCallsFeed` hook — **read it first**; it already supplies `activeCalls: Map<number, ActiveCall>`, `history`, `connStatus` and `ackCall`.
- Produces: `export function CallsLive(props: { calls: ActiveCall[]; onAck: (id: number) => Promise<void>; connStatus: ConnStatus; now?: Date }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

```tsx
// web-dashboard/src/components/calls/CallsLive.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CallsLive } from './CallsLive';

const NOW = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
const call = (id: number, room: string, secondsAgo: number) => ({
  call_id: id, room_number: room, floor: 2,
  created_at: new Date(NOW.getTime() - secondsAgo * 1000).toISOString(),
  status: 'active' as const,
});

describe('CallsLive', () => {
  it('sorts oldest first, unconditionally', () => {
    render(<CallsLive calls={[call(1, '101', 5), call(2, '202', 300), call(3, '303', 60)]} onAck={vi.fn()} connStatus="live" now={NOW} />);
    const rooms = Array.from(document.querySelectorAll('.call-card__room')).map((n) => n.textContent);
    expect(rooms).toEqual(['202', '303', '101']);
  });

  it('shows a teal count pill, never red', () => {
    render(<CallsLive calls={[call(1, '101', 5)]} onAck={vi.fn()} connStatus="live" now={NOW} />);
    expect(screen.getByText('1 faol')).toBeTruthy();
  });

  it('proves liveness in the empty state instead of reassuring', () => {
    render(<CallsLive calls={[]} onAck={vi.fn()} connStatus="live" now={NOW} />);
    expect(screen.getByText('Faol chaqiruv yoʻq')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('passes onAck through, so the desk CAN acknowledge', () => {
    render(<CallsLive calls={[call(1, '101', 5)]} onAck={vi.fn()} connStatus="live" now={NOW} />);
    expect(screen.getByRole('button', { name: /Tasdiqlash/ })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./CallsLive`.

- [ ] **Step 3: Implement**

```tsx
// web-dashboard/src/components/calls/CallsLive.tsx
import { CallCard } from './CallCard';
import type { ActiveCall } from '../../api/types';
import type { ConnStatus } from '../../hooks/useCallsFeed';

interface Props {
  calls: ActiveCall[];
  onAck: (callId: number) => Promise<void>;
  connStatus: ConnStatus;
  now?: Date;
}

const CONN_LABEL: Record<ConnStatus, string> = {
  connecting: 'Ulanmoqda…',
  live: 'Ulanish faol',
  disconnected: 'Ulanish yoʻq',
};

export function CallsLive({ calls, onAck, connStatus, now }: Props) {
  // Oldest first, always. Position is the one ageing channel that survives colour
  // blindness, glare and a glance from the side, so it is never made optional.
  const ordered = [...calls].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const clock = (now ?? new Date()).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

  return (
    <section className="calls-live">
      <header className="calls-live__head">
        <h1 className="calls-live__title">Chaqiruvlar</h1>
        {ordered.length > 0 && <span className="calls-live__pill">{ordered.length} faol</span>}
        <a className="btn btn-ghost btn-sm calls-live__wall" href="/wall" target="_blank" rel="noopener">
          Devor rejimi ↗
        </a>
      </header>

      {ordered.length === 0 ? (
        <div className="calls-live__empty">
          <p className="calls-live__empty-line">
            <span className="dot dot--ok" aria-hidden="true" /> Faol chaqiruv yo{'ʻ'}q
          </p>
          <p className="calls-live__empty-meta">
            {CONN_LABEL[connStatus]} · {clock}
          </p>
        </div>
      ) : (
        <div className="calls-live__grid">
          {ordered.map((c) => (
            <CallCard
              key={c.call_id}
              roomNumber={c.room_number}
              floor={c.floor}
              createdAt={c.created_at}
              onAck={() => onAck(c.call_id)}
              now={now}
            />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Add the management-register styles**

Append to `web-dashboard/src/styles/style.css`:

```css
/* ================= /calls ================= */
.calls-live__head {
  display: flex;
  align-items: center;
  gap: var(--space-12);
  min-height: var(--control-64);
  padding-bottom: var(--space-16);
  border-bottom: var(--border-hairline) solid var(--color-border);
  margin-bottom: var(--space-24);
}
.calls-live__title {
  font-size: var(--type-mgmt-page-title-size);
  line-height: var(--type-mgmt-page-title-lh);
  font-weight: var(--type-mgmt-page-title-weight);
  letter-spacing: var(--type-mgmt-page-title-tracking);
  margin: 0;
}
/* The pill counts calls; it is a number, not a call, so it is teal. */
.calls-live__pill {
  border-radius: var(--radius-full);
  background: var(--color-accent-soft);
  color: var(--color-accent);
  padding: 2px var(--space-8);
  font-size: var(--type-mgmt-dense-size);
  font-weight: var(--type-mgmt-dense-weight);
  font-variant-numeric: tabular-nums;
}
.calls-live__wall { margin-left: auto; }

.calls-live__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--size-desk-card-min), 1fr));
  gap: var(--space-16);
}

.calls-live__empty { padding: var(--space-24) 0; }
.calls-live__empty-line {
  margin: 0;
  font-size: var(--type-mgmt-body-size);
  color: var(--color-text2);
}
.calls-live__empty-meta {
  margin: var(--space-4) 0 0;
  font-size: var(--type-mgmt-meta-size);
  color: var(--color-text3);
  font-variant-numeric: tabular-nums;
}
.dot--ok {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%;
  background: var(--color-ok); margin-right: var(--space-8);
}
```

- [ ] **Step 5: Wire it into `CallsTab.tsx`**

Read `web-dashboard/src/components/tabs/CallsTab.tsx` first. Replace only its active-calls section with `<CallsLive calls={[...activeCalls.values()]} onAck={ackCall} connStatus={connStatus} />`, leaving the history table and the `historyBlocked` handling untouched — the history redesign is Plan 2.

- [ ] **Step 6: Run to verify it passes**

Run: `npm test && npm run build`
Expected: tests PASS (17 total), build succeeds.

- [ ] **Step 7: Commit**

```bash
git add web-dashboard/src/components/calls/ web-dashboard/src/components/tabs/CallsTab.tsx web-dashboard/src/styles/style.css
git commit -m "Rebuild the /calls live region in the alert register

Cards sit directly on the page with no wrapper panel, in an auto-fill grid, sorted
oldest-first unconditionally. The count pill is teal on purpose: it is a number, not a
call, and red is reserved. The empty state proves liveness with a clock rather than
reassuring with an illustration, because a large empty state occupies the exact screen
region the eye has learned to scan for red."
```

---

## Task 6: `/wall` — the display-only route

**Files:**
- Create: `web-dashboard/src/routes/WallView.tsx`
- Create: `web-dashboard/src/routes/wall.css`
- Modify: `web-dashboard/src/App.tsx`
- Test: `web-dashboard/src/routes/WallView.test.tsx`

**Interfaces:**
- Consumes: `CallCard` (Task 4), `ageStep`/`elapsedLabel` (Task 3), `useCallsFeed`.
- Produces: `export function WallView(): JSX.Element` mounted at `/wall`.

- [ ] **Step 1: Write the failing test**

```tsx
// web-dashboard/src/routes/WallView.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WallGrid } from './WallView';

const NOW = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
const mk = (n: number) => Array.from({ length: n }, (_, i) => ({
  call_id: i + 1, room_number: String(101 + i), floor: 1,
  created_at: new Date(NOW.getTime() - (n - i) * 60_000).toISOString(),
  status: 'active' as const,
}));

describe('WallGrid', () => {
  it('never renders an acknowledge control, at any call count', () => {
    for (const n of [1, 4, 12, 20]) {
      const { container, unmount } = render(<WallGrid calls={mk(n)} now={NOW} />);
      expect(container.querySelectorAll('button').length).toBe(0);
      expect(screen.queryByText(/Tasdiqlash/)).toBeNull();
      unmount();
    }
  });

  it('renders a single call at wallSolo size', () => {
    const { container } = render(<WallGrid calls={mk(1)} now={NOW} />);
    expect(container.querySelector('[data-size="wallSolo"]')).toBeTruthy();
  });

  it('renders 2-11 calls as a grid at wall size', () => {
    const { container } = render(<WallGrid calls={mk(5)} now={NOW} />);
    expect(container.querySelectorAll('[data-size="wall"]').length).toBe(5);
  });

  it('caps at 11 cards and states how many are hidden, and how old the worst is', () => {
    const { container } = render(<WallGrid calls={mk(18)} now={NOW} />);
    expect(container.querySelectorAll('.call-card').length).toBe(11);
    expect(screen.getByText('+7')).toBeTruthy();
    expect(screen.getByText(/eng qadimgisi/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./WallView`.

- [ ] **Step 3: Implement**

```tsx
// web-dashboard/src/routes/WallView.tsx
import { useEffect } from 'react';
import { CallCard } from '../components/calls/CallCard';
import { elapsedLabel } from '../lib/ageStep';
import type { ActiveCall } from '../api/types';
import './wall.css';

const MAX_CARDS = 11; // 12 grid slots on 1920x1080; slot 12 is the overflow tile

/** Exported separately so the display-only guarantee can be tested without the feed. */
export function WallGrid({ calls, now }: { calls: ActiveCall[]; now?: Date }) {
  const ordered = [...calls].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  if (ordered.length === 1) {
    const c = ordered[0];
    // NOTE: no onAck. The wall cannot acknowledge; see CallCard's signature.
    return (
      <div className="wall__solo">
        <CallCard roomNumber={c.room_number} floor={c.floor} createdAt={c.created_at} size="wallSolo" now={now} />
      </div>
    );
  }

  const shown = ordered.slice(0, MAX_CARDS);
  const hidden = ordered.slice(MAX_CARDS);

  return (
    <div className="wall__grid">
      {shown.map((c) => (
        <CallCard key={c.call_id} roomNumber={c.room_number} floor={c.floor} createdAt={c.created_at} size="wall" now={now} />
      ))}
      {hidden.length > 0 && (
        <div className="wall__overflow">
          <span className="wall__overflow-count">+{hidden.length}</span>
          <span className="wall__overflow-meta">
            eng qadimgisi {elapsedLabel(hidden[hidden.length - 1].created_at, now)}
          </span>
        </div>
      )}
    </div>
  );
}
```

The route wrapper (same file), which forces dark and reads the floor scope:

```tsx
export function WallView() {
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.getAttribute('data-theme');
    // A wall monitor runs 24/7 including night shifts: desk brightness is wrong in a corridor.
    root.setAttribute('data-theme', 'dark');
    document.body.classList.add('wall-body');
    return () => {
      if (prev) root.setAttribute('data-theme', prev);
      else root.removeAttribute('data-theme');
      document.body.classList.remove('wall-body');
    };
  }, []);
  // Feed wiring: reuse useCallsFeed exactly as CallsTab does, filtering by the
  // read-only ?floor= query param when present. Render <WallGrid> plus the top bar
  // (clinic name, blinking-colon clock, connection dot) per spec 6.2.
  // ...
}
```

Implement that wrapper fully against the existing `useCallsFeed` signature — read the hook before writing it, and mirror how `CallsTab` obtains `activeCalls` and `connStatus`.

- [ ] **Step 4: Add `wall.css`**

Full-bleed, no scroll, tokens only:

```css
/* web-dashboard/src/routes/wall.css */
.wall-body { overflow: hidden; cursor: none; }
.wall { min-height: 100vh; padding: var(--gutter-wall); background: var(--color-bg); }
.wall__top {
  display: flex; align-items: baseline; justify-content: space-between;
  min-height: var(--control-64); margin-bottom: var(--space-24);
}
.wall__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--size-wall-card-min), 1fr));
  gap: var(--space-24);
}
.wall__solo { display: grid; place-items: stretch; min-height: calc(100vh - var(--control-64) - var(--space-24) - (2 * var(--gutter-wall))); }
.wall__overflow {
  display: flex; flex-direction: column; justify-content: center; gap: var(--space-8);
  padding: var(--space-24);
  background: var(--color-surface);
  border: var(--border-hairline) solid var(--color-border-strong);
  border-radius: var(--radius-4);
}
.wall__overflow-count {
  font-size: var(--type-alert-overflow-count-size);
  line-height: var(--type-alert-overflow-count-lh);
  font-weight: var(--type-alert-overflow-count-weight);
  color: var(--color-text1);
  font-variant-numeric: tabular-nums;
}
.wall__overflow-meta {
  font-size: var(--type-alert-overflow-meta-size);
  font-weight: var(--type-alert-overflow-meta-weight);
  color: var(--color-text2);
}
/* 1 Hz blinking colon: the cheapest proof that the page is not a frozen tab. */
@keyframes wall-colon { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
.wall__clock-colon { animation: wall-colon 1s steps(1, end) infinite; }
@media (prefers-reduced-motion: reduce) { .wall__clock-colon { animation: none; } }
```

- [ ] **Step 5: Register the route**

In `web-dashboard/src/App.tsx`, add `/wall` **outside** the authed layout wrapper so it renders no nav and no theme toggle, but still inside the auth guard (the feed needs a token; a wall monitor is logged in once and left).

- [ ] **Step 6: Run to verify it passes**

Run: `npm test && npm run build`
Expected: tests PASS (21 total), build succeeds.

- [ ] **Step 7: Commit**

```bash
git add web-dashboard/src/routes/ web-dashboard/src/App.tsx
git commit -m "Add /wall: a bookmarkable, display-only monitor sharing one CallCard

Four tests assert no button exists at 1, 4, 12 and 20 calls. That is the point of the
route: anyone walking past a wall screen could otherwise clear a call, the patient would
be abandoned, and the audit answer 'who acknowledged? -- the wall' is worthless.
Overflow names the age of the oldest hidden call, because a count alone does not support
a triage decision."
```

---

## Task 7: retire the purple tokens

**Files:**
- Modify: `web-dashboard/src/styles/style.css`
- Modify: `web-dashboard/package.json`

- [ ] **Step 1: Import the generated tokens**

Add as the **first** line of `web-dashboard/src/styles/style.css`:

```css
@import './tokens.css';
```

- [ ] **Step 2: Delete the old token blocks**

Remove the hand-written `:root`, `@media (prefers-color-scheme: dark)` and `:root[data-theme="dark"]` blocks (spec §9 lists them: `--accent: #696cff`, `--accent-hover`, `--accent-soft`, `--accent-2`, `--accent-2-soft`, `--blob-a/b/c`, `--shadow-sm/md/lg`). Then map every remaining rule from the old names to the generated ones (`--accent` → `--color-accent`, `--surface` → `--color-surface`, `--text-1` → `--color-text1`, `--border` → `--color-border`, `--radius-md` → `--radius-2`, and so on).

- [ ] **Step 3: Prove nothing purple survives**

```bash
cd web-dashboard
grep -rniE "696cff|6C5CE7|03c3ec|blob-|--accent-2" src/ && echo "LEFTOVERS" || echo "clean"
npx tsc --noEmit && npm run build
```
Expected: `clean`, then a clean typecheck and a successful build.

- [ ] **Step 4: Add the guard to the build script**

In `web-dashboard/package.json`, change `"build"` to `"node ../tools/generate-tokens.mjs --check && tsc -b && vite build"`, so a stale `tokens.css` fails the build rather than shipping.

- [ ] **Step 5: Verify the guard actually bites**

```bash
printf '\n/* tamper */\n' >> src/styles/tokens.css
npm run build   # expect: STALE, exit 1
git checkout src/styles/tokens.css
npm run build   # expect: success
```

- [ ] **Step 6: Commit**

```bash
git add web-dashboard/
git commit -m "Point the dashboard at generated tokens and delete the purple set

The build now fails on a stale tokens.css, verified by tampering with the file and
watching it fail. Without that, the generator is a convention and conventions are what
produced three divergent palettes in this repo."
```

---

## Task 8: verify on screen, then hand to the owner

**Files:** none — verification only.

- [ ] **Step 1: Run the full local check**

```bash
node --test tools/
cd web-dashboard && npm test && npm run build
```
Expected: all green.

- [ ] **Step 2: Screenshot against real production data**

Use this repo's established pattern: temporarily point `web-dashboard/vite.config.ts` at production (`base: '/'`, proxy target `https://nurcecall.boos.uz`), mint a token on the server with `create_access_token`, pre-seed `localStorage.nc_token` via Puppeteer's `evaluateOnNewDocument`, and capture:

- `/app` Calls tab — light and dark, 1440px
- `/app` Calls tab — 390px
- `/wall` — 1920×1080, with 1, 4 and 13 simultaneous calls
- All three ageing steps visible in one shot

**Revert `vite.config.ts` before committing.** Seed the extra calls by POSTing to `/api/v1/calls` with a real device key against a TEST clinic — never Profmedmax.

- [ ] **Step 3: Check the three things the spec says to check**

From spec §11: (a) does the light-mode darkening ramp read as escalation to someone who has not read this document; (b) is a 4-digit room number still legible at 130% OS font scale on a phone-width viewport; (c) does the wall's 11-card cap plus overflow tile actually fit 1080p without a scrollbar.

- [ ] **Step 4: Present to the owner and STOP**

Post the screenshots. The agreed gate (Q15) is that the direction is approved from this one screen before the remaining three frontends are touched. Do not start Plan 2 or Plan 3 without an explicit go.

---

## Remaining plans (not written yet — deliberately)

- **Plan 2 — rest of the web dashboard + landing page.** Two-group nav, unassigned-signals folded into Devices, the dense table treatment (§6.4), and the landing page rebuilt on the same tokens with the `landing` emitter and the base64 Inter subset.
- **Plan 3 — phone + watch, shipped together.** The `ts` and `kotlin` emitters, `expo-font` Inter loading with the `phoneFamilies` name map, the phone Calls screen and login, onboarding removal, safe areas, the watch `NurseCallTokens.kt`, the launcher-name and notification-icon identity fixes, and real ack attribution. Q18: these two release as one, because a nurse holding a new phone and an old watch sees a worse product than today.

Each gets its own plan after its predecessor's gate passes.

---

## Self-Review

**Spec coverage.** §2 colour → Task 1; §2.4 invariants → Task 2; §3 type → Task 1 (emitted) and Tasks 4–6 (consumed); §4 space/radius/control → Task 1; §5 ageing → Tasks 3–4; §6.1 `/calls` → Task 5; §6.2 `/wall` → Task 6; §7 tokens.json → Task 1; §8 `--check` rules 1, 2, 4, 5, 6, 8 → Task 2. **Gaps, deliberate and assigned:** §6.3 nav/IA, §6.4 tables and §6.7 landing → Plan 2. §6.5 phone, §6.6 watch → Plan 3. `--check` rules 3 (reserved-red allowlist), 7 (target mismatch), 9 (gutter uniqueness) and 10 (fixed heights) are lint rules over source files rather than over `tokens.json`; they need the other emitters to exist to be meaningful, so they land in Plan 3 with a note in Plan 2. That is a real deferral, not an omission — rule 3 in particular is the one that stops a red toast shipping in six months, and it must not be forgotten.

**Placeholder scan.** One genuine defect found and fixed inline: Task 4 Step 4's CSS contained `max-font-size: none`, which is not a CSS property — a note now instructs its deletion and explains how OS scaling is actually handled per target. Task 6 Step 3's route wrapper is intentionally left as a directed instruction rather than full code, because it must be written against `useCallsFeed`'s real signature; the instruction names the file to read and the component to mirror.

**Type consistency.** `ageStep(createdAtIso, now?)` and `elapsedLabel(createdAtIso, now?)` are used with that signature in Tasks 4, 5 and 6. `CallCardProps.onAck` is `() => void | Promise<void>` in Task 4 and called as `() => onAck(c.call_id)` in Task 5 — consistent. `WallGrid` is exported from `WallView.tsx` and imported by name in its test. `emitCss(tokens)` and `validate(tokens)` keep their signatures across Tasks 1, 2 and 7.
