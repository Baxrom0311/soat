# Dashboard IA, Tables, History and Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the web dashboard's management register (nav groups, tables, history, forms) and rebuild `server/static/landing.html` on the same generated tokens, adding a `landing` emitter and the four deferred `--check` rules.

**Architecture:** One `tokens.json` feeds two emitters — the existing `css` emitter writing `web-dashboard/src/styles/tokens.css`, and a new `landing` emitter that injects a token block plus a base64 Inter subset into marker regions inside the single self-contained `landing.html`. The dashboard's management surfaces are rebuilt on four new shared React primitives (`TablePanel`, `StatusDot`, `MonoId`, `PageHeader`) plus a grouped `Sidebar`, and the landing page's two "real component" figures reuse the *shipped* `callcard.css` verbatim, injected by the same generator so drift fails the build.

**Tech Stack:** Node 25 (`node --test`), React 19 + Vite + TypeScript + Vitest, plain CSS custom properties (no Tailwind), one self-contained HTML file with an inline `<style>`, fontTools/pyftsubset for the one-time font artifact.

**Spec:** docs/superpowers/specs/2026-08-27-design-system-design.md

## Global Constraints

- Repo root for every path in this plan: `/Users/baxrom/ish_full/soat-design`, branch `design-tokens-calls`.
- **`server/app/` and every API contract are untouched.** The only file under `server/` this plan edits is `server/static/landing.html`. (Spec scope guard, §10.)
- **The phone app (`mobile-app/`) and the watch (`app/`) are Plan 3.** Do not edit them. Rule-3's allowlist names their files ahead of time; that is deliberate.
- **Merge order and ownership of `tools/generate-tokens.mjs`.** This plan lands FIRST, in full, on `design-tokens-calls`. Plan 3 (`2026-08-27-phone-and-watch.md`) branches from this plan's finished tip, not from Plan 1's. This plan **owns** the `EMITTERS` registry, the reserved-red scanner (`tools/lib/reserved-red.mjs`) and the CSS lints (`tools/lib/lint-css.mjs`); Plan 3 registers its two emitters (`ts`, `kotlin`) into the `EMITTERS` object this plan creates and imports `RESERVED_RED_ALLOWLIST`/`scanReservedRed` rather than shipping a second copy. Every edit to `EMITTERS` and to the `export { … }` line in this plan is written as an **addition to the existing object/list**, never a wholesale replacement, precisely so a later plan's entries survive.
- Run the generator test suite with the glob, never the directory: `node --test tools/*.test.mjs` (the directory form is broken in this machine's Node 25 build).
- Run the frontend suite with `cd web-dashboard && npm test`.
- Red is reserved for live patient calls only (§2.4 Rule 0). Destructive actions and every warning are `attn` amber (§2.3). **There is no red in the history table, ever, including a missed call** (§6.1).
- Teal is the only interactive colour; surfaces stay neutral (§2.2).
- **Every `<td>` must carry a `data-label` attribute.** Under 640px `style.css` collapses tables into cards via `content: attr(data-label)`; a cell without one breaks mobile silently. Task 9 adds a lint that fails the build on a missing one.
- **`min-height`, never `height`, on any card, row or button** (§3.5, §8 rule 10).
- One gutter per screen module (§4.2, §8 rule 9). `gutter.app` 24 and `gutter.appNarrow` 16 are the same gutter at two breakpoints and count as one family.
- Zero motion, zero shadow, zero alpha, zero icons in the alert register (§1, §4.5).
- Exact values copied verbatim from the spec, used as tokens (never literals):
  - Table container: `surface`, 1px `border-strong`, `radius.3` (12px), `overflow: hidden`, `shadow.none` (§6.4).
  - Toolbar strip 44px, `surface-sunken`, `border.hairline` bottom (§6.4).
  - Header row 36px, `surface-sunken`, `dense` 13/18/500, sentence case, `border-strong` bottom (§6.4).
  - Body rows `min-height: 44px`, `dense`; column 1 `text-1` at 600, others `text-2` at 500; `border.hairline` bottom; `surface-soft` hover; 2px inset `accent` focus ring; **no zebra** (§6.4).
  - Cell padding `space.12` horizontal, `space.16` on first and last (§6.4).
  - Mono IDs: `mono-sm` 12/16/500 with `letter-spacing: 0.02em`, middle-truncated, full value in `title` (§6.4).
  - Status: 8px dot + word. Filled `ok`, hollow `text-3` ring, filled `attn`. Never a pill, never coloured text, never red (§6.4).
  - Sidebar 240px; brand row 56px; Group 1 item 48px `body-lg` (600 when active), 22px icon, `accent-soft`/`accent` count pill, 3px `accent` left bar; `space.24` + `border-strong` rule + `space.24`; Group 2 caption `eyebrow` `text-3`, items 36px `dense`, 18px icon, `text-2` at rest (§6.3).
  - Page header pattern: `page-title` · `body` `text-2` one-line description · one right-aligned `control.36` `accent` button · `border.hairline` rule · `space.24` gap (§6.3).
  - Forms: label `dense` 600 **above** the field; input `control.36`, `body` 15, `border.field` 1.5px, `radius.2`, `surface` fill; focus 2px `accent` ring at 2px offset (§6.4).
  - Modals: `radius.3`, `space.32` padding, `shadow.pop`, `max-width` 480, 48×48 close hit box (§6.4).
  - Stat tiles: `surface`, `border.hairline`, `radius.3`, `shadow.none`, `space.20` padding, `eyebrow` label `text-3`, value `stat` 28/700 tabular (§6.4).
  - Landing: bands alternate `bg` / `surface-sunken` with a 1px `border` rule at the top edge; content max-width 1120, bands 1280, `gutter.landing` 24; sections `space.112`/`80`/`64`; `radius.4`; every section opens with `eyebrow` `accent` kicker → `landing-h2` → `landing-lede` `text-2` at 62ch, then `space.48` (§6.7).
  - Landing font subset ranges, verbatim: `U+0000-00FF, U+0100-017F, U+02BB, U+02BC, U+2018, U+2019`; canonical apostrophe **U+02BB** (§7 `font.subset`, §3).
  - Weights 400/500/600/700 only (§3).

### Deviations and spec gaps — read before Task 6, 13 and 14

The spec wins over instinct. Where two spec clauses contradict each other, the **machine-checkable** clause wins, because it is the one that can fail a build. Each deviation below records the one-line `tokens.json` change that would reverse it, so the owner can overrule cheaply. **Do not make those `tokens.json` changes as part of this plan.**

1. **Hero figure is the desk-variant call card, not the wall variant.** §6.7(3) asks for "an actual wall-variant `<CallCard>`". But §7 declares `type.alert.roomWall`, `roomWallSolo`, `timerWall` and `floorWall` with `targets: ["css"]`, and §8 rule 7 fails the build when an emitter reads a token whose targets exclude it. `type.alert.roomDesk`/`timerDesk`/`floorDesk`/`ackDesk` declare no `targets`, so they reach every target including `landing` — they are the only target-legal alert sizes for this page. The figure therefore renders `data-size="desk" data-step="2"`, room "214", rail ●●○, mono timer, which is exactly the shipped desk card. Reversal: add `"landing"` to `type.alert.roomWall.targets` (and `timerWall`, `floorWall`).
2. **The hero figure panel carries no shadow.** §6.7 says `shadow.pop` on the one floating figure; §7 declares `shadow` with `targets: ["css","ts"]`, which excludes `landing`. The figure gets `surface` + `border.hairline` only. Reversal: add `"landing"` to `shadow.targets`.
3. **The "Ikki rejim" watch half is an inline SVG, not a shipped component.** Compose cannot render in a browser, and `type.watch` is `targets: ["kotlin"]` so the landing emitter must not read it. The watch half is a 192-unit round `<svg>` face — a viewBox unit is unitless, so 40 user units in a 192-unit face *is* 40sp on a 192dp face — reusing `--call-fill-2`, `--call-ink`, `--rail-watch-*`, `--control-48` and `--radius-*`. A **test** (Task 14), not the emitter, asserts those SVG numbers equal `type.watch.*` in `tokens.json`; rule 7 governs emitters, and a test is not an emitter. This is stated out loud because it is the one figure that is a faithful drawing rather than the shipped pixels.
4. **The dashboard-table half of "Ikki rejim" and the hero figure are the shipped CSS.** The generator injects `web-dashboard/src/components/calls/callcard.css` verbatim into a second marker region in `landing.html`, and Task 14 injects the new `table.css` the same way. Changing either stylesheet makes `--check` fail until the landing page is regenerated, so the figures cannot drift. Only the JSX wrapper is re-expressed as static HTML, and a Vitest contract test pins the class/attribute contract to `CallCard.tsx`.
5. **No search input is added to the table toolbar.** §6.4 describes the 44px toolbar strip as "holding a `control.32` search input and any filter controls", but no table in this product has search today and the scope guard says features are neither added nor removed. `TablePanel` takes an optional `toolbar` slot; the only page that fills it is `AdminDevicesTab`, whose filter row already exists.
6. **`.sub-pill` stays a pill.** §6.4's "never a coloured pill" governs a row's *status* column (Onlayn/Oflayn/Faol). Subscription state is a settled owner decision (active=ok, trial=accent, grace=attn+dashed, overdue=attn+solid-1.5px, suspended=surface-sunken/text3) and is not relitigated here.
7. **`role-pill` becomes plain text.** Spec is silent on a role cell. A role is a value, not a status, so it renders as `dense` `text-2` text with the Uzbek label.
8. **Superadmin nav grouping.** §6.3 is written for the clinic dashboard and is silent on `/admin`. The same two-group mechanism is used, with caption "BOSHQARUV" instead of "SOZLAMALAR".
9. **The landing page keeps its extra sections and its single price panel.** §6.7 specifies ten sections; it does not instruct anyone to delete the owner's existing selling copy (pain/benefit, install, FAQ), and §6.7(8)'s three price columns presuppose published prices this business deliberately does not publish. Those sections are restyled onto the repeated section head, not deleted or invented.
10. **No Content-Security-Policy exists anywhere in this repo.** `grep -rn "Content-Security-Policy" server/` returns nothing. §6.7's `font-src` requirement therefore applies to a header that does not exist yet; server config is out of scope. This plan removes *every* external request from `landing.html` regardless, and Task 13 records the required directive in a comment for whoever writes the header: `font-src 'self' data:`.
11. **Producing the Inter subset needs two things the repo does not have** (Task 5): the Inter font file (one network fetch from the upstream release) and a brotli-capable fontTools (`python3 -c "import brotli"` currently fails with `ModuleNotFoundError`). The produced `.b64` is committed, so no other machine and no CI job ever needs the font toolchain again. There is no acceptable fallback that satisfies §6.7, so Task 5 blocks Task 6.
12. **U+02BB apostrophe normalisation is out of scope for this plan.** §3 makes U+02BB canonical and requires U+2019/U+0027 to be normalised to it in all copy. Measured today, `web-dashboard/src` has hundreds of U+0027 apostrophes against a handful of U+02BB (the ones this plan's own new Uzbek strings introduce), and the same split exists in `mobile-app/src` and `app/src` (Plan 3) and in `server/static/landing.html` (this plan, Task 13). A repo-wide mechanical normalisation plus a lint (`tools/apostrophe.test.mjs` asserting zero `[og]'` across all four source trees) is real, cheap work, but it touches every screen's copy in both plans at once and is not safe to do as a side effect of an unrelated task. Recorded here rather than silently dropped; the owner should schedule it as its own small pass across both plans once both have landed, or explicitly waive it.
13. **The management sidebar footer's third icon button is "change password", not "help".** §6.3 names the three footer icon buttons as theme / help / logout; Task 7 ships theme / change-password (`KeyIcon`) / logout, because a working "Parolni o'zgartirish" action already exists in this codebase and a "help" destination does not. Reversal: add a help destination and a fourth icon, or rename the middle button — either is a product decision, not a token change, so it is recorded rather than guessed at.
14. **The landing nav gets no dedicated rule set or 64px-sticky assertion.** §6.7(1) describes a 64px sticky nav with specific link and button treatments. Task 13 sweeps the page's existing `nav`/`.header` rules onto the generated tokens mechanically (deviation 8 above) but does not add a `position: sticky` rule or a height assertion, because the page's current nav already renders correctly and no bug report names it. If the nav's current height and stickiness need auditing against the 64px figure, that is a follow-up screenshot check, not a code change this plan makes.
15. **`type.landing.h1.maxWidth` (`22ch`) is a literal in `landing.html`, not an emitted variable.** `emitLanding`/`staticVars` (Task 2, Task 6) emit only `-size`, `-lh`, `-weight` and `-tracking` per type style; no emitter writes a `-max-width` custom property for any scope. Task 13's `.hero h1 { max-width: 22ch; }` is therefore a hand-copied literal, pinned by `tools/landing.test.mjs`'s `max-width: 22ch` assertion so a `tokens.json` edit to that value is caught as a test failure (not a silent drift) even though it is not caught by `--check`. Reversal: extend `staticVars` to emit `--type-{scope}-{name}-max-width` for any style carrying a `maxWidth` key.
16. **The web ageing scale has no `clamp()` ceiling; `maxScale: 1.2` is honoured only on the phone.** §3.5 asks for a `clamp()` ceiling on room-number and timer sizing on web; `tokens.json` carries `maxScale` on `roomDesk`/`timerDesk`, but `staticVars()` (Task 2) never reads it, and `callcard.css` sizes those elements with bare `font-size: var(...)`. Implementing a web `clamp()` ceiling would need the *unscaled* px alongside a browser-zoom-aware ceiling, which is a real design decision (what caps a desktop zoom vs. a phone's `maxFontSizeMultiplier`) and not a one-line addition. Left undone and recorded here rather than silently ignored; Plan 3 implements the phone side correctly (`maxFontSizeMultiplier`).
17. **`web-dashboard/src/lib/ageStep.ts`'s `THRESHOLDS_SEC = [0, 120, 600]` is a hand-pinned literal, not read from `tokens.css`.** §5 says thresholds live in `tokens.json` and nowhere else, but the web `ageStep` cannot read a CSS custom property at module-load time the way a component can at render time, so the constant is duplicated by hand. Plan 3's `tools/parity.test.mjs` (Task 16) pins all four targets' thresholds against `tokens.json` and would catch a drift on this file too, so the guard exists — but only once Plan 3 has landed. If Plan 3 is not adopted, this file has no automated guard against drifting from `tokens.json` and should get one (a small `tools/`-side test reading both `tokens.json` and the file's source text) as a follow-up.
18. **Two modal payment-history tables in `AdminClinicsTab.tsx` intentionally keep the existing `.pay-history` pattern instead of `TablePanel`.** `AdminClinicsTab.tsx` renders three `<table>` elements: one page-level device/clinic table (migrated to `TablePanel` in Task 10) and two compact tables inside modals (payment history, staff list) using the pre-existing `.pay-history` class — the same pattern `BillingTab` already uses for its own payment history and that Task 10's mobile CSS explicitly keeps supporting (`.table-panel table, .pay-history { … }`). A modal-scoped receipt list is not the toolbar-strip-and-header-strip container §6.4 describes for a page's primary table, so it is left as `.pay-history` rather than wrapped in a second, nested `TablePanel`. Recorded so Task 10's migration test (fixed below to be occurrence-counted rather than file-level) does not read as though these two tables were missed by accident.

---

## File Structure

| Path | Responsibility | Action |
|---|---|---|
| `tools/lib/targets.mjs` | `forTarget()` / `assertNoUndefined()` — §8 rule 7, enforced by construction | Create |
| `tools/lib/emit-vars.mjs` | Shared CSS custom-property emitters (colour, call, static) used by both targets | Create |
| `tools/lib/emit-css.mjs` | Composes the three CSS blocks; now delegates to `emit-vars` + `forTarget` | Modify |
| `tools/lib/emit-landing.mjs` | Landing token block, `@font-face` data URI, marker injection | Create |
| `tools/lib/reserved-red.mjs` | §8 rule 3 — reserved-red allowlist scanner | Create |
| `tools/lib/lint-css.mjs` | §8 rules 9 and 10 — gutter uniqueness, fixed heights | Create |
| `tools/generate-tokens.mjs` | Registers the `landing` emitter; runs the three repo lints in `--check` | Modify |
| `tools/build-inter-subset.sh` | One-time, documented production of the woff2 subset artifact | Create |
| `tools/inter-subset.woff2.b64` | Committed base64 woff2 subset (§7 `font.subset.woff2Base64File`) | Create |
| `tools/alert-register-css.test.mjs` | Guards that no management stylesheet styles `.call-card` | Create |
| `tools/targets.test.mjs` | Rule 7 tests | Create |
| `tools/emit-landing.test.mjs` | Landing emitter + injection tests | Create |
| `tools/reserved-red.test.mjs` | Rule 3 tests, including a proven failure | Create |
| `tools/lint-css.test.mjs` | Rules 9 and 10 tests | Create |
| `tools/inter-subset.test.mjs` | Verifies the committed font artifact | Create |
| `tools/landing.test.mjs` | Landing page markup/CSS tests (Task 13, extended by Task 14) | Create |
| `web-dashboard/src/styles/style.css` | Dead alert CSS deleted; tables/forms/modals/tiles/gutters retokenised | Modify |
| `web-dashboard/src/components/Sidebar.tsx` | Two nav groups, count pill, static conn dot | Modify |
| `web-dashboard/src/components/Sidebar.test.tsx` | Nav-group tests | Create |
| `web-dashboard/src/components/DashboardLayout.tsx` | Two groups; `unassigned` removed from nav | Modify |
| `web-dashboard/src/components/SuperAdminLayout.tsx` | Two groups, caption "BOSHQARUV" | Modify |
| `web-dashboard/src/components/ui/table.css` | The §6.4 container + three strips | Create |
| `web-dashboard/src/components/ui/TablePanel.tsx` | Container + optional toolbar slot | Create |
| `web-dashboard/src/components/ui/StatusDot.tsx` | 8px dot + word, three tones | Create |
| `web-dashboard/src/components/ui/MonoId.tsx` | `mono-sm` middle-truncated ID with full `title` | Create |
| `web-dashboard/src/components/ui/PageHeader.tsx` | The one shared page-header pattern | Create |
| `web-dashboard/src/components/ui/ui.test.tsx` | Primitive unit tests | Create |
| `web-dashboard/src/components/ui/dataLabel.test.ts` | Every `<td>` carries `data-label` | Create |
| `web-dashboard/src/components/tabs/DeviceScopeTabs.tsx` | "Barchasi / Biriktirilmagan (n)" segmented control | Create |
| `web-dashboard/src/components/tabs/DeviceScopeTabs.test.tsx` | Segmented-control tests | Create |
| `web-dashboard/src/components/tabs/DevicesTab.tsx` | Hosts the scope control and the unassigned view | Modify |
| `web-dashboard/src/components/tabs/UnassignedTab.tsx` | Becomes the inner view of Devices | Modify |
| `web-dashboard/src/components/tabs/CallsTab.tsx` | §6.1 history table | Modify |
| `web-dashboard/src/components/tabs/CallsTab.test.tsx` | History-table tests, including "no red" | Create |
| `web-dashboard/src/components/tabs/{RoomsTab,StaffTab,BillingTab}.tsx` | Migrated to `TablePanel`/`PageHeader` | Modify |
| `web-dashboard/src/components/admin/*.tsx` | Migrated to `TablePanel`/`PageHeader`/`StatusDot` | Modify |
| `web-dashboard/src/lib/ageStep.ts` | Adds `durationLabel(fromIso, toIso)` | Modify |
| `server/static/landing.html` | Token markers, teal palette, Inter subset, new composition | Modify |

---

### Task 1: Delete the dead alert-register CSS from `style.css`

Plan 1 left the pre-redesign `.call-card` rules in the management stylesheet. They are not dead: `backdrop-filter: blur(22px)`, `box-shadow: var(--shadow-pop)` and `transition: box-shadow .3s, border-color .3s` are *not* re-declared in `callcard.css`, so they cascade onto every live patient call — which directly violates §1 ("zero motion, zero shadow" in the alert register) on the product's most important surface.

**Files:**
- Modify: `web-dashboard/src/styles/style.css:366-427`, `:1030-1032`, `:934-936`
- Test: `tools/alert-register-css.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing importable. Deliverable is a stylesheet with no alert-register rules.

- [ ] **Step 1: Write the failing test**

Create `tools/alert-register-css.test.mjs`:

```js
// tools/alert-register-css.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the management stylesheet declares no rule for the alert register', () => {
  // A management rule that reaches .call-card cascades shadow, blur and a transition
  // onto a live patient call, because callcard.css never re-declares those properties.
  // Alert-register CSS lives ONLY in components/calls/callcard.css and routes/wall.css.
  const style = read('web-dashboard/src/styles/style.css');
  assert.doesNotMatch(style, /\.call-card/);
  assert.doesNotMatch(style, /\.ack-btn/);
  assert.doesNotMatch(style, /\.active-grid/);
  assert.doesNotMatch(style, /@keyframes\s+pulse\b/);
});

test('the alert register itself carries no shadow, blur, transition or animation', () => {
  const card = read('web-dashboard/src/components/calls/callcard.css');
  for (const forbidden of [/backdrop-filter/, /box-shadow/, /transition/, /animation/]) {
    assert.doesNotMatch(card, forbidden, `callcard.css must not use ${forbidden}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design && node --test tools/*.test.mjs`
Expected: FAIL — `the management stylesheet declares no rule for the alert register` reports the `/\.call-card/` assertion (the string appears at style.css:382 and in three other places).

- [ ] **Step 3: Write minimal implementation**

In `web-dashboard/src/styles/style.css`, delete the whole run from `.call-card {` through `.ack-btn:disabled { … }` inclusive, plus `.active-grid` and the `@keyframes pulse` rule. Keep `.empty-msg` — `ContactRequestsTab` and `CallsTab` still use it. The section becomes exactly:

```css
/* ================= EMPTY STATE ================= */
/* The alert register lives in components/calls/callcard.css and routes/wall.css.
   Nothing in this file may style .call-card: unre-declared properties (shadow, blur,
   transition) would cascade into it and break the zero-motion/zero-shadow rule. */
.empty-msg {
  color: var(--color-text3);
  grid-column: 1 / -1;
  padding: 30px;
  text-align: center;
  border: 1px dashed var(--color-border-strong);
  border-radius: 16px;
  font-size: 0.92rem;
}
```

In the `@media (max-width: 640px)` block, delete these two lines:

```css
  .active-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
  .call-card .room { font-size: 1.4rem; }
```

In the reduced-motion block, replace:

```css
@media (prefers-reduced-motion: reduce) {
  .call-card.age-2, .call-card.age-3, .pairing-dot { animation: none; }
}
```

with:

```css
@media (prefers-reduced-motion: reduce) {
  .pairing-dot { animation: none; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/baxrom/ish_full/soat-design && node --test tools/*.test.mjs && cd web-dashboard && npm test`
Expected: all `tools/` tests pass; the 24 existing Vitest tests still pass.

- [ ] **Step 5: Screenshot verification — this one is only visible on screen**

A unit test cannot see a shadow. Run `cd web-dashboard && npm run dev`, log in, and with at least one active call screenshot `/app`. Confirm by eye: the red card has a **hard edge with no blur or drop shadow**, no translucency over the page, and no visible transition when the age step changes. Note: the card must look flat and printed-on, like an instrument panel, not like a floating UI card.

- [ ] **Step 6: Commit**

```bash
git add web-dashboard/src/styles/style.css tools/alert-register-css.test.mjs
git commit -m "Alert register: delete the management .call-card rules that cascaded shadow, blur and a transition onto live calls"
```

---

### Task 2: `forTarget()` — §8 rule 7 enforced by construction

Rule 7 fails the build when "an emitter reads a token whose `targets` excludes it". Implement it structurally: each emitter receives a tree with out-of-scope nodes **removed**, so it cannot read them; and every emitter output is checked for the string `undefined`, so an attempt to read a removed node is loud rather than silent.

**Files:**
- Create: `tools/lib/targets.mjs`
- Create: `tools/lib/emit-vars.mjs`
- Modify: `tools/lib/emit-css.mjs`
- Test: `tools/targets.test.mjs`

**Interfaces:**
- Consumes: `tokens.json` as parsed JSON.
- Produces:
  - `allowsTarget(node: object|undefined, target: string): boolean`
  - `forTarget<T>(node: T, target: string): T` — deep clone with `targets` keys stripped and out-of-scope nodes omitted.
  - `assertNoUndefined(text: string, target: string): void` — throws `TargetMismatchError` if the emitted text contains `undefined` or `NaN`.
  - `class TargetMismatchError extends Error`
  - From `emit-vars.mjs`: `colorVars(color, theme)`, `callVars(call, theme)`, `staticVars(t)`, `themeBlock(t, theme)`, all returning `string[]` of `  --name: value;` lines.
  - `emitCss(t)` keeps its exact current signature and byte-identical output.

- [ ] **Step 1: Write the failing test**

Create `tools/targets.test.mjs`:

```js
// tools/targets.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allowsTarget, forTarget, assertNoUndefined, TargetMismatchError } from './lib/targets.mjs';
import { emitCss } from './lib/emit-css.mjs';

const tokens = JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url), 'utf8'));

test('allowsTarget: no targets key means every target', () => {
  assert.equal(allowsTarget({ size: 12 }, 'landing'), true);
  assert.equal(allowsTarget({ targets: ['css'] }, 'landing'), false);
  assert.equal(allowsTarget({ targets: ['css', 'landing'] }, 'landing'), true);
});

test('forTarget removes what a target may not read (Rule 7)', () => {
  const landing = forTarget(tokens, 'landing');
  assert.equal(landing.type.watch, undefined, 'type.watch is kotlin-only');
  assert.equal(landing.type.alert.roomWall, undefined, 'alert.roomWall is css-only');
  assert.equal(landing.type.alert.roomPhone, undefined, 'alert.roomPhone is ts-only');
  assert.equal(landing.shadow, undefined, 'shadow is css+ts only');
  assert.equal(landing.notify, undefined, 'notify is kotlin-only');
  assert.ok(landing.type.alert.roomDesk, 'alert.roomDesk declares no targets => all four');
  assert.ok(landing.type.landing.h1, 'type.landing is css+landing');
  assert.ok(landing.font.subset, 'font.subset is landing-only');
});

test('forTarget keeps the css target exactly as the shipped emitter needs it', () => {
  const css = forTarget(tokens, 'css');
  assert.equal(css.type.alert.roomPhone, undefined);
  assert.equal(css.type.watch, undefined);
  assert.equal(css.font.subset, undefined, 'font.subset is landing-only');
  assert.ok(css.type.alert.roomWall);
  assert.ok(css.shadow.pop.light);
});

test('forTarget strips the targets bookkeeping key itself', () => {
  const css = forTarget(tokens, 'css');
  assert.equal(css.type.landing.targets, undefined);
  assert.equal(css.font.mono.targets, undefined);
});

test('assertNoUndefined turns a removed read into a loud failure', () => {
  assert.throws(() => assertNoUndefined('  --x: undefined;', 'landing'), TargetMismatchError);
  assert.throws(() => assertNoUndefined('  --x: NaNpx;', 'landing'), TargetMismatchError);
  assert.doesNotThrow(() => assertNoUndefined('  --x: 12px;', 'landing'));
});

test('the shipped css output is unchanged by the refactor', () => {
  const onDisk = readFileSync(new URL('../web-dashboard/src/styles/tokens.css', import.meta.url), 'utf8');
  assert.equal(emitCss(tokens), onDisk);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design && node --test tools/targets.test.mjs`
Expected: FAIL with `Cannot find module '.../tools/lib/targets.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Create `tools/lib/targets.mjs`:

```js
// tools/lib/targets.mjs
// Spec §8 rule 7: "an emitter reads a token whose `targets` excludes it" must fail the
// build. Enforced by construction rather than by review: each emitter is handed a tree
// with everything out of its scope removed, so the read is impossible. An attempt to
// read a removed node yields `undefined`, which assertNoUndefined() turns into an error.

export class TargetMismatchError extends Error {}

/** A node reaches a target when it declares no `targets` (all of them) or lists it. */
export function allowsTarget(node, target) {
  if (!node || typeof node !== 'object') return true;
  if (!Array.isArray(node.targets)) return true;
  return node.targets.includes(target);
}

/** Deep clone for one target: `targets` keys stripped, out-of-scope nodes omitted. */
export function forTarget(node, target) {
  if (Array.isArray(node)) return node.map((v) => forTarget(v, target));
  if (node === null || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'targets') continue;
    if (!allowsTarget(v, target)) continue;
    out[k] = forTarget(v, target);
  }
  return out;
}

/** A generated file containing `undefined` or `NaN` means an emitter read past its scope.
 *  Contract for every caller: pass only text THIS emitter composed from token values —
 *  never opaque committed binary data (e.g. a base64 font). Base64's alphabet contains
 *  N, a and n, so a large base64 blob has a non-trivial chance of containing the literal
 *  substring "NaN" by coincidence, which would otherwise read as a real rule-7 violation
 *  on a deterministic, correct input. emitLanding (Task 6) validates its token block
 *  before concatenating the inlined font for exactly this reason. */
export function assertNoUndefined(text, target) {
  const m = /(undefined|NaN)/.exec(text);
  if (m) {
    const line = text.slice(0, m.index).split('\n').length;
    throw new TargetMismatchError(
      `Rule 7: the "${target}" emitter produced "${m[1]}" on line ${line} — it read a token whose targets exclude it`
    );
  }
}
```

Create `tools/lib/emit-vars.mjs` by moving the four private functions out of `emit-css.mjs` unchanged, except that `themeBlock` now guards `shadow` (absent for the landing target) and the `allowsTarget` filters are gone because `forTarget` already applied them:

```js
// tools/lib/emit-vars.mjs
// CSS custom-property lines shared by the `css` and `landing` targets. Both receive a
// tree already narrowed by forTarget(), so nothing here re-checks `targets`.
export const KEBAB = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

export function colorVars(color, theme) {
  return Object.entries(color).map(([k, v]) => `  --color-${KEBAB(k)}: ${v[theme]};`);
}

export function callVars(call, theme) {
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
export function staticVars(t) {
  const out = [];
  for (const [group, scale] of Object.entries({ space: t.space, gutter: t.gutter, control: t.control, border: t.border, radius: t.radius, size: t.size })) {
    for (const [k, v] of Object.entries(scale)) {
      if (Array.isArray(v) || typeof v === 'object') continue; // radius.bands
      out.push(`  --${group}-${KEBAB(k)}: ${typeof v === 'number' ? v + 'px' : v};`);
    }
  }
  for (const [k, v] of Object.entries(t.rail)) {
    if (typeof v === 'object') {
      for (const [dim, n] of Object.entries(v)) out.push(`  --rail-${KEBAB(k)}-${dim}: ${n}px;`);
    } else if (k === 'slots') {
      // rail.slots is a count of rail segments (a loop bound), not a length — no unit.
      out.push(`  --rail-${KEBAB(k)}: ${v};`);
    } else {
      out.push(`  --rail-${KEBAB(k)}: ${v}px;`);
    }
  }
  for (const [scope, styles] of Object.entries(t.type)) {
    for (const [name, s] of Object.entries(styles)) {
      if (name === 'unit') continue;
      const p = `--type-${KEBAB(scope)}-${KEBAB(name)}`;
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
  out.push(`  --call-threshold-2: ${t.call.thresholdsSec[1]};`);
  out.push(`  --call-threshold-3: ${t.call.thresholdsSec[2]};`);
  return out;
}

export function themeBlock(t, theme) {
  const out = [...colorVars(t.color, theme), ...callVars(t.call, theme)];
  // shadow declares targets ["css","ts"]; it is absent from the landing tree.
  if (t.shadow) out.push(`  --shadow-pop: ${t.shadow.pop[theme]};`);
  return out;
}
```

Replace `tools/lib/emit-css.mjs` entirely with:

```js
// tools/lib/emit-css.mjs
import { allowsTarget, forTarget, assertNoUndefined } from './targets.mjs';
import { staticVars, themeBlock } from './emit-vars.mjs';

export { allowsTarget };

export function emitCss(rawTokens) {
  const t = forTarget(rawTokens, 'css');
  const header = `/* GENERATED by tools/generate-tokens.mjs from tokens.json v${t.meta.version}. DO NOT EDIT. */\n`;
  const light = [...themeBlock(t, 'light'), ...staticVars(t), '  color-scheme: light;'];
  const dark = [...themeBlock(t, 'dark'), '  color-scheme: dark;'];
  const out =
    header +
    `\n:root {\n${light.join('\n')}\n}\n` +
    `\n@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n${dark.map((l) => '  ' + l).join('\n')}\n  }\n}\n` +
    `\n:root[data-theme="dark"] {\n${dark.join('\n')}\n}\n`;
  assertNoUndefined(out, 'css');
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/baxrom/ish_full/soat-design && node --test tools/*.test.mjs && node tools/generate-tokens.mjs --check`
Expected: every test passes — including `the shipped css output is unchanged by the refactor` — and `--check` exits 0 with no `STALE:` line, proving `tokens.css` is byte-identical.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/targets.mjs tools/lib/emit-vars.mjs tools/lib/emit-css.mjs tools/targets.test.mjs
git commit -m "Tokens: rule 7 (target mismatch) enforced by construction; share the var emitters between targets"
```

---

### Task 3: §8 rule 3 — the reserved-red allowlist

The guard that stops somebody shipping a red toast in six months. Any file outside the allowlist that references a `call.*` token fails the build.

**Files:**
- Create: `tools/lib/reserved-red.mjs`
- Modify: `tools/generate-tokens.mjs`
- Test: `tools/reserved-red.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `RESERVED_RED_ALLOWLIST: string[]` — repo-relative POSIX paths.
  - `SCANNED_ROOTS: string[]`
  - `scanReservedRed(rootDir: string): { file: string, line: number, text: string }[]`

- [ ] **Step 1: Write the failing test**

Create `tools/reserved-red.test.mjs`:

```js
// tools/reserved-red.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { scanReservedRed, RESERVED_RED_ALLOWLIST } from './lib/reserved-red.mjs';

const REPO = fileURLToPath(new URL('../', import.meta.url));

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'reserved-red-'));
  for (const [rel, text] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, text);
  }
  return dir;
}

test('the shipped repo has no reserved-red violation', () => {
  assert.deepEqual(scanReservedRed(REPO), []);
});

test('a red toast outside the allowlist is a violation (Rule 3)', () => {
  const dir = fixture({
    'web-dashboard/src/components/Toast.tsx':
      "export const Toast = () => <div style={{ background: 'var(--call-fill-3)' }} />;\n",
  });
  try {
    const found = scanReservedRed(dir);
    assert.equal(found.length, 1, JSON.stringify(found));
    assert.equal(found[0].file, 'web-dashboard/src/components/Toast.tsx');
    assert.equal(found[0].line, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the same reference inside an allowlisted file is fine', () => {
  const dir = fixture({
    'web-dashboard/src/components/calls/callcard.css': '.call-card { background: var(--call-fill-1); }\n',
  });
  try {
    assert.deepEqual(scanReservedRed(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a Kotlin or RN spelling of the same token is caught too', () => {
  const dir = fixture({
    'mobile-app/src/components/Banner.tsx': 'const bg = theme.call.fill[2];\n',
    'app/src/main/java/uz/soat/reminder/Billing.kt': 'val c = NurseCallTokens.call.fill[2]\n',
  });
  try {
    assert.equal(scanReservedRed(dir).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the allowlist is exactly the §8 set plus generated definition files', () => {
  // Naming the list in a test makes widening it a deliberate, reviewed act.
  assert.ok(RESERVED_RED_ALLOWLIST.includes('web-dashboard/src/components/calls/CallCard.tsx'));
  assert.ok(RESERVED_RED_ALLOWLIST.includes('web-dashboard/src/routes/WallView.tsx'));
  assert.ok(RESERVED_RED_ALLOWLIST.includes('web-dashboard/src/lib/ageStep.ts'));
  assert.ok(RESERVED_RED_ALLOWLIST.includes('server/static/landing.html'));
  assert.ok(!RESERVED_RED_ALLOWLIST.includes('web-dashboard/src/styles/style.css'));
  // Plan 3's actual filenames (verified against its task bodies, not guessed): the
  // watch's alert register is CallScreens.kt (plural) plus its own theme mapping file
  // and both files' JVM tests, and the phone's CallCard test reads call.edgeWidth.
  assert.ok(RESERVED_RED_ALLOWLIST.includes('app/src/main/java/uz/soat/reminder/CallScreens.kt'));
  assert.ok(RESERVED_RED_ALLOWLIST.includes('app/src/main/java/uz/soat/reminder/NurseCallTheme.kt'));
  assert.ok(RESERVED_RED_ALLOWLIST.includes('app/src/test/java/uz/soat/reminder/CallScreensTest.kt'));
  assert.ok(RESERVED_RED_ALLOWLIST.includes('app/src/test/java/uz/soat/reminder/NurseCallThemeTest.kt'));
  assert.ok(RESERVED_RED_ALLOWLIST.includes('mobile-app/src/components/CallCard.test.tsx'));
  // ChromeScreens.kt (idle/login/outdated/billing) renders the live call-list row too
  // (§6.6 State B), so it legitimately reads callFill/callEdge/callInk.
  assert.ok(RESERVED_RED_ALLOWLIST.includes('app/src/main/java/uz/soat/reminder/ChromeScreens.kt'));
  assert.ok(!RESERVED_RED_ALLOWLIST.includes('app/src/main/java/uz/soat/reminder/CallScreen.kt'), 'CallScreen.kt (singular) is not a file Plan 3 creates — CallScreens.kt (plural) is');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design && node --test tools/reserved-red.test.mjs`
Expected: FAIL with `Cannot find module '.../tools/lib/reserved-red.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Create `tools/lib/reserved-red.mjs`:

```js
// tools/lib/reserved-red.mjs
// Spec §2.4 Rule 0 / §8 rule 3: call.* tokens may be consumed only by a component that
// renders a live patient call. Somebody WILL ship a red toast within six months; this is
// the guard, not a comment.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** §8's list — CallCard, WallView, ageStep, the watch call composables, the landing hero
 *  figure — plus their CSS/test siblings and the generated files that DEFINE the tokens.
 *  The watch and phone entries are listed ahead of Plan 3 on purpose: the file appearing
 *  must not also require editing the allowlist in the same commit. Filenames below are
 *  copied verbatim from Plan 3's task bodies (2026-08-27-phone-and-watch.md), not guessed:
 *  the alert register there is CallScreens.kt (PLURAL — there is no CallScreen.kt), plus
 *  its own theme-mapping file NurseCallTheme.kt, both files' JVM tests, and the phone's
 *  CallCard.test.tsx (which reads call.edgeWidth.deskPhone directly). ChromeScreens.kt
 *  (idle/login/outdated/billing) also renders the live multi-call list row (§6.6 State B)
 *  and so legitimately reads callFill/callEdge/callInk too. */
export const RESERVED_RED_ALLOWLIST = [
  'web-dashboard/src/components/calls/CallCard.tsx',
  'web-dashboard/src/components/calls/CallCard.test.tsx',
  'web-dashboard/src/components/calls/CallsLive.tsx',
  'web-dashboard/src/components/calls/CallsLive.test.tsx',
  'web-dashboard/src/components/calls/callcard.css',
  'web-dashboard/src/routes/WallView.tsx',
  'web-dashboard/src/routes/WallView.test.tsx',
  'web-dashboard/src/routes/wall.css',
  'web-dashboard/src/lib/ageStep.ts',
  'web-dashboard/src/lib/ageStep.test.ts',
  'web-dashboard/src/styles/tokens.css',
  'mobile-app/src/theme.ts',
  'mobile-app/src/components/CallCard.tsx',
  'mobile-app/src/components/CallCard.test.tsx',
  'mobile-app/src/components/Rail.tsx',
  'app/src/main/java/uz/soat/reminder/NurseCallTokens.kt',
  'app/src/main/java/uz/soat/reminder/NurseCallTheme.kt',
  'app/src/main/java/uz/soat/reminder/CallScreens.kt',
  'app/src/main/java/uz/soat/reminder/ChromeScreens.kt',
  'app/src/test/java/uz/soat/reminder/CallScreensTest.kt',
  'app/src/test/java/uz/soat/reminder/NurseCallThemeTest.kt',
  'server/static/landing.html',
  // The landing hero figure DEPICTS a real call card, so spec 8 rule 3 lists it as an
  // allowed consumer -- and its test necessarily names the same tokens to assert the
  // figure renders them. Omitting the test file while allowing the page it tests would
  // fail the build on the one file proving the rule is honoured.
  'web-dashboard/src/components/calls/landingFigure.test.tsx',
];

export const SCANNED_ROOTS = ['web-dashboard/src', 'mobile-app/src', 'app/src', 'server/static'];

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '__snapshots__']);
const SCANNED_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|css|kt|kts|html)$/;

/** Every spelling of a call.* token across the four targets. */
const CALL_TOKEN =
  /--call-(fill|ink|edge|slab|edge-w)[a-z0-9-]*|\bcall\.(fill|ink|edge|slab|edgeWidth)\b|\bcallFill\b|\bcallInk\b|\bNurseCallTokens\.call\b/;

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // a scanned root that does not exist yet (mobile-app/app before Plan 3)
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    const abs = join(dir, e.name);
    if (e.isDirectory()) yield* walk(abs);
    else if (SCANNED_EXT.test(e.name) && statSync(abs).isFile()) yield abs;
  }
}

export function scanReservedRed(rootDir) {
  const allow = new Set(RESERVED_RED_ALLOWLIST);
  const found = [];
  for (const root of SCANNED_ROOTS) {
    for (const abs of walk(join(rootDir, root))) {
      const rel = relative(rootDir, abs).split(sep).join('/');
      if (allow.has(rel)) continue;
      readFileSync(abs, 'utf8')
        .split('\n')
        .forEach((text, i) => {
          if (CALL_TOKEN.test(text)) found.push({ file: rel, line: i + 1, text: text.trim() });
        });
    }
  }
  return found;
}
```

Wire it into the CLI. In `tools/generate-tokens.mjs`, add the import and a lint step that runs on every invocation (not only `--check`), immediately after `validate`:

```js
import { scanReservedRed } from './lib/reserved-red.mjs';
```

```js
  const reds = scanReservedRed(fileURLToPath(ROOT));
  if (reds.length) {
    console.error(
      'Rule 3 (reserved red): call.* tokens may only be consumed by a live-call component:\n' +
        reds.map((r) => `  - ${r.file}:${r.line}  ${r.text}`).join('\n')
    );
    process.exit(1);
  }
```

and add `import { fileURLToPath } from 'node:url';` at the top.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/baxrom/ish_full/soat-design && node --test tools/*.test.mjs && node tools/generate-tokens.mjs --check`
Expected: all tests pass; `--check` exits 0.

Then prove the guard bites end to end:

```bash
printf 'body { color: var(--call-fill-3); }\n' >> web-dashboard/src/styles/style.css
node tools/generate-tokens.mjs --check; echo "exit=$?"
git checkout -- web-dashboard/src/styles/style.css
```
Expected: `Rule 3 (reserved red): …  web-dashboard/src/styles/style.css:1056` and `exit=1`.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/reserved-red.mjs tools/reserved-red.test.mjs tools/generate-tokens.mjs
git commit -m "Tokens: rule 3 — call.* tokens are lint-restricted to the live-call allowlist"
```

---

### Task 4: §8 rules 9 and 10 — gutter uniqueness and fixed heights

Rule 9: no screen module may reference two different gutters (§4.2 — "a hard prohibition, not a guideline"). Rule 10: no card, row or button carries a `height:` (§3.5 — a 130% OS font scale must grow the row, not clip it). Both are file scans over the dashboard's own stylesheets, and both fix real offenders in `style.css` in the same task so the repo stays green.

**Files:**
- Create: `tools/lib/lint-css.mjs`
- Modify: `tools/generate-tokens.mjs`
- Modify: `web-dashboard/src/styles/style.css` (8 `height:` declarations → `min-height:`)
- Test: `tools/lint-css.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `SCANNED_CSS: string[]` — repo-relative stylesheets under lint.
  - `gutterViolations(rootDir: string): { file: string, families: string[] }[]`
  - `fixedHeightViolations(rootDir: string): { file: string, selector: string, value: string }[]`
  - `lintCss(rootDir: string): string[]` — human-readable messages, empty when clean.

- [ ] **Step 1: Write the failing test**

Create `tools/lint-css.test.mjs`:

```js
// tools/lint-css.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { lintCss, gutterViolations, fixedHeightViolations } from './lib/lint-css.mjs';

const REPO = fileURLToPath(new URL('../', import.meta.url));

function fixture(rel, text) {
  const dir = mkdtempSync(join(tmpdir(), 'lint-css-'));
  const abs = join(dir, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, text);
  return dir;
}

test('the shipped stylesheets pass both rules', () => {
  assert.deepEqual(lintCss(REPO), []);
});

test('two different gutters in one module fail rule 9', () => {
  const dir = fixture(
    'web-dashboard/src/styles/style.css',
    '.content-area { padding: var(--gutter-app); }\n.tab-panel { padding: var(--gutter-phone); }\n'
  );
  try {
    const v = gutterViolations(dir);
    assert.equal(v.length, 1);
    assert.deepEqual(v[0].families.sort(), ['app', 'phone']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gutter.app and gutter.appNarrow are one family, not two', () => {
  const dir = fixture(
    'web-dashboard/src/styles/style.css',
    '.content-area { padding: var(--gutter-app); }\n@media (max-width: 767px) { .content-area { padding: var(--gutter-app-narrow); } }\n'
  );
  try {
    assert.deepEqual(gutterViolations(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a fixed height on a button fails rule 10', () => {
  const dir = fixture('web-dashboard/src/styles/style.css', '.btn { height: 2.5rem; }\n');
  try {
    const v = fixedHeightViolations(dir);
    assert.equal(v.length, 1, JSON.stringify(v));
    assert.match(v[0].selector, /\.btn/);
    assert.equal(v[0].value, '2.5rem');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('min-height on the same selector is fine, and so is height: auto', () => {
  const dir = fixture(
    'web-dashboard/src/styles/style.css',
    '.btn { min-height: 2.5rem; }\n.table-input { height: auto; }\n.card { height: 100%; }\n'
  );
  try {
    assert.deepEqual(fixedHeightViolations(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a fixed height on a decoration that is not a card, row or button is allowed', () => {
  // §3.5 constrains cards, rows and buttons. An 8px status dot is a dot.
  const dir = fixture('web-dashboard/src/styles/style.css', '.dot { width: 8px; height: 8px; }\n');
  try {
    assert.deepEqual(fixedHeightViolations(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a rail slot inside .call-card keeps its exact token height', () => {
  // §4.5 sizes rail slots exactly (desk 10x28). The selector contains "card", but a rail
  // slot is a geometric glyph, not a row that OS font scaling should grow.
  const dir = fixture(
    'web-dashboard/src/components/calls/callcard.css',
    ".call-card__rail > span { width: var(--rail-desk-w); height: var(--rail-desk-h); }\n"
  );
  try {
    assert.deepEqual(fixedHeightViolations(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an SVG glyph inside a button/card/item keeps its exact pixel height', () => {
  // CONTROL_ISH matches on the SELECTOR TEXT, so ".btn svg" and ".sidebar-item svg" both
  // match "btn"/"item" even though the rule the icon SITS INSIDE, not the icon itself, is
  // what §3.5 means by "a card, row or button". An <svg> glyph has an intrinsic square
  // aspect ratio the spec fixes exactly (§4.3: 16/18/20/22px depending on context) and is
  // never a text container that OS font scaling needs to grow.
  const dir = fixture(
    'web-dashboard/src/styles/style.css',
    '.btn svg { width: 16px; height: 16px; }\n.sidebar-item svg { width: 20px; height: 20px; }\n'
  );
  try {
    assert.deepEqual(fixedHeightViolations(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design && node --test tools/lint-css.test.mjs`
Expected: FAIL with `Cannot find module '.../tools/lib/lint-css.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Create `tools/lib/lint-css.mjs`:

```js
// tools/lib/lint-css.mjs
// Spec §8 rule 9 (gutter uniqueness, §4.2) and rule 10 (no fixed heights, §3.5).
// Generated files are excluded: tokens.css DEFINES every gutter, so counting its
// definitions as references would make the rule meaningless.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SCANNED_CSS = [
  'web-dashboard/src/styles/style.css',
  'web-dashboard/src/components/calls/callcard.css',
  'web-dashboard/src/components/ui/table.css',
  'web-dashboard/src/routes/wall.css',
];

/** --gutter-app and --gutter-app-narrow are the same gutter at two breakpoints. */
const gutterFamily = (name) => name.replace(/^--gutter-/, '').replace(/-narrow$/, '');

/** Rule 10 applies to "any card, row or button" — matched on the selector text. */
const CONTROL_ISH = /(card|row|btn|button|item|slab|cell|panel|toolbar|tile|input|toggle|chip)/i;
const HEIGHT_OK = /^(auto|inherit|initial|unset|revert|100%|100vh|min-content|max-content|fit-content)$/;
/** Fixed-size geometric glyphs the spec sizes exactly: rail slots (§4.5, desk 10x28), the
 *  40px brand tile and the 20px icon (§4.3). None of them is a card, row or button. */
const GLYPH_TOKEN = /var\(\s*--(rail-|size-tile-brand|size-icon)/;
/** An SVG glyph is exempt regardless of value: CONTROL_ISH matches on the SELECTOR TEXT,
 *  so ".btn svg" and ".sidebar-item svg" match "btn"/"item" even though the icon sitting
 *  inside a button is not itself the card/row/button the rule constrains. §4.3 fixes icon
 *  sizes exactly (16/18/20/22px by context) and an <svg> is never a text container that
 *  needs to grow with an OS font-scale setting. Matched on the selector's last simple
 *  selector, so ".btn svg:hover" is still exempt but ".btn" itself is not. */
const IS_SVG_GLYPH_SELECTOR = /(^|[\s>+~])(svg|path)(:[a-z-]+)*\s*$/i;
const BLOCK = /([^{}]+)\{([^{}]*)\}/g;

/** For an .html file, scan ONLY its <style> block(s). Task 13 adds `landing.html` to
 *  SCANNED_CSS, and that file's inline <script> contains its own `{ }` braces — running
 *  the CSS block regex over the whole document would parse JS fragments as selectors
 *  and silently misreport (or silently miss) a violation. */
function extractStyle(text) {
  return [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
}

function read(rootDir) {
  return SCANNED_CSS.filter((rel) => existsSync(join(rootDir, rel))).map((rel) => {
    const raw = readFileSync(join(rootDir, rel), 'utf8');
    return { rel, text: rel.endsWith('.html') ? extractStyle(raw) : raw };
  });
}

export function gutterViolations(rootDir) {
  const out = [];
  for (const { rel, text } of read(rootDir)) {
    const families = new Set();
    for (const m of text.matchAll(/var\(\s*(--gutter-[a-z-]+)/g)) families.add(gutterFamily(m[1]));
    if (families.size > 1) out.push({ file: rel, families: [...families] });
  }
  return out;
}

export function fixedHeightViolations(rootDir) {
  const out = [];
  for (const { rel, text } of read(rootDir)) {
    for (const [, selector, body] of text.matchAll(BLOCK)) {
      const sel = selector.trim();
      if (!CONTROL_ISH.test(sel)) continue;
      if (IS_SVG_GLYPH_SELECTOR.test(sel)) continue;
      for (const decl of body.split(';')) {
        const m = /(^|\s)height\s*:\s*(.+)$/.exec(decl.trim());
        if (!m) continue;
        if (/(min|max|line)-height/.test(decl)) continue;
        const value = m[2].trim();
        if (HEIGHT_OK.test(value) || GLYPH_TOKEN.test(value)) continue;
        out.push({ file: rel, selector: sel, value });
      }
    }
  }
  return out;
}

export function lintCss(rootDir) {
  return [
    ...gutterViolations(rootDir).map(
      (v) => `Rule 9 (gutter uniqueness): ${v.file} references ${v.families.length} gutters (${v.families.join(', ')}); one screen module gets exactly one`
    ),
    ...fixedHeightViolations(rootDir).map(
      (v) => `Rule 10 (no fixed heights): ${v.file} sets height: ${v.value} on "${v.selector}"; use min-height so a 130% OS font scale grows the row instead of clipping it`
    ),
  ];
}
```

Wire it into `tools/generate-tokens.mjs` right after the rule-3 block:

```js
import { lintCss } from './lib/lint-css.mjs';
```

```js
  const cssProblems = lintCss(fileURLToPath(ROOT));
  if (cssProblems.length) {
    console.error('CSS lint failed:\n' + cssProblems.map((p) => '  - ' + p).join('\n'));
    process.exit(1);
  }
```

Rule 10, run over the shipped stylesheet, finds fourteen `height:` declarations inside a `CONTROL_ISH`-matching selector: the eight real control offenders below, plus six SVG icon rules (`.theme-toggle svg`, `.btn svg`, `.sidebar-collapse-btn svg`, `.sidebar-item svg`, `.panel-card h3 svg`, `.hamburger-btn svg`) that `IS_SVG_GLYPH_SELECTOR` exempts by construction — an icon's intrinsic pixel size is not the "card, row or button" §3.5 is protecting from OS font scaling. Fix the eight real offenders in `web-dashboard/src/styles/style.css`. Change each `height:` to `min-height:` and nothing else; leave every `… svg { width: …px; height: …px; }` rule exactly as it is — it is exempt, not an offender:

```css
.theme-toggle {
  width: 34px; min-height: 34px;
```

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 2.5rem;
```

```css
.btn-sm { min-height: 2rem; padding: 0 0.85rem; font-size: 0.8125rem; border-radius: var(--radius-1); }
```

```css
input, select, textarea, .table-input {
  min-height: 2.5rem;
```

```css
.sidebar-collapse-btn {
  width: 28px; min-height: 28px;
```

```css
.sidebar-item {
  display: flex; align-items: center; gap: 12px;
  min-height: 44px;
```

```css
.icon-btn {
  width: 34px;
  min-height: 34px;
```

```css
  .hamburger-btn {
    width: 36px; min-height: 36px;
```

Note: `textarea { height: auto; … }` and `.edit-field--check input { height: auto; … }` are already allowed values and stay as they are.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/baxrom/ish_full/soat-design && node --test tools/*.test.mjs && node tools/generate-tokens.mjs --check && cd web-dashboard && npm test`
Expected: `the shipped stylesheets pass both rules` passes, `--check` exits 0, Vitest stays green.

- [ ] **Step 5: Screenshot verification**

`height` → `min-height` on a flex button changes nothing at 100% scale but *can* change layout when content is taller than the box. Run `npm run dev`, open `/app`, and screenshot the sidebar and one table page. Confirm buttons, inputs and sidebar rows are visually unchanged. Then set the browser's minimum font size to 24px (Chrome → Settings → Appearance → Customise fonts) and confirm rows and buttons **grow** rather than clipping their labels.

- [ ] **Step 6: Commit**

```bash
git add tools/lib/lint-css.mjs tools/lint-css.test.mjs tools/generate-tokens.mjs web-dashboard/src/styles/style.css
git commit -m "Tokens: rules 9 and 10 (one gutter per module, no fixed heights) plus the eight height: offenders they found"
```

---

### Task 5: Produce the committed Inter woff2 subset artifact

§6.7 and §7 require Inter inlined as a base64 woff2 subset in `tools/inter-subset.woff2.b64`. **Be honest about the prerequisites: this repo cannot produce it as it stands.** `pyftsubset` and fontTools 4.63 are installed, but `python3 -c "import brotli"` fails with `ModuleNotFoundError`, so `--flavor=woff2` cannot compress; and there is no Inter font file anywhere in the repo or in the system font directories. Two one-time prerequisites are therefore unavoidable:

```bash
python3 -m pip install --user 'fonttools[woff]' brotli   # brotli is what --flavor=woff2 needs
```

plus **one network fetch** of the upstream Inter release. Both happen once, on one machine; the resulting `.b64` is committed, so no other machine and no CI job ever needs a font toolchain or network access again. There is no fallback that satisfies §6.7 — shipping the sales page in a different family than the product *is* the owner's original complaint (§0) — so this task blocks Task 6.

**Files:**
- Create: `tools/build-inter-subset.sh`
- Create: `tools/inter-subset.woff2.b64` (generated by the script, committed)
- Test: `tools/inter-subset.test.mjs`

**Interfaces:**
- Consumes: `tokens.json` → `font.subset.unicodeRanges`, `font.subset.woff2Base64File`.
- Produces: `tools/inter-subset.woff2.b64` — one line, no trailing newline, standard base64 of a woff2 file. Task 6 reads it as `interB64`.

- [ ] **Step 1: Write the failing test**

Create `tools/inter-subset.test.mjs`:

```js
// tools/inter-subset.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tokens = JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url), 'utf8'));

test('tokens.json still points at the artifact this task produces', () => {
  assert.equal(tokens.font.subset.woff2Base64File, 'tools/inter-subset.woff2.b64');
  assert.equal(tokens.font.subset.canonicalApostrophe, 'U+02BB');
  assert.deepEqual(tokens.font.subset.unicodeRanges, [
    'U+0000-00FF', 'U+0100-017F', 'U+02BB', 'U+02BC', 'U+2018', 'U+2019',
  ]);
});

test('the committed subset is one line of valid base64', () => {
  const raw = readFileSync(new URL('../tools/inter-subset.woff2.b64', import.meta.url), 'utf8');
  assert.ok(!/\s/.test(raw), 'must be a single line with no whitespace: it goes inside a data: URI');
  assert.match(raw, /^[A-Za-z0-9+/]+={0,2}$/);
});

test('the committed subset decodes to a woff2 of a plausible size', () => {
  const raw = readFileSync(new URL('../tools/inter-subset.woff2.b64', import.meta.url), 'utf8');
  const bin = Buffer.from(raw, 'base64');
  assert.equal(bin.subarray(0, 4).toString('latin1'), 'wOF2', 'woff2 magic number');
  // §6.7 predicts ~38 KB woff2 / ~51 KB base64. Bound it loosely enough to survive an
  // Inter version bump, tightly enough to catch "somebody committed the full font".
  assert.ok(bin.length > 20_000, `${bin.length} bytes — too small to be Latin + Latin-Ext`);
  assert.ok(bin.length < 150_000, `${bin.length} bytes — that is not a subset`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design && node --test tools/inter-subset.test.mjs`
Expected: FAIL with `ENOENT: no such file or directory, open '.../tools/inter-subset.woff2.b64'` (the first test, about `tokens.json`, passes).

- [ ] **Step 3: Write the build script and run it**

Create `tools/build-inter-subset.sh`:

```bash
#!/usr/bin/env bash
# Regenerates tools/inter-subset.woff2.b64 — the base64 woff2 subset the landing page
# inlines as a data: URI (spec §6.7, §7 font.subset). Run this ONCE; the .b64 artifact is
# committed, so no other machine and no CI job needs a font toolchain or the network.
#
# Prerequisites (one time, this machine only):
#   python3 -m pip install --user 'fonttools[woff]' brotli
# fontTools alone is not enough: --flavor=woff2 needs brotli.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 -c 'import brotli' 2>/dev/null || {
  echo "FATAL: python3 has no brotli module, so --flavor=woff2 cannot compress." >&2
  echo "       Run: python3 -m pip install --user 'fonttools[woff]' brotli" >&2
  exit 1
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 1. Inter, from the upstream release (SIL Open Font License 1.1). The only network step.
INTER_VERSION="4.1"
curl -fsSL -o "$WORK/inter.zip" \
  "https://github.com/rsms/inter/releases/download/v${INTER_VERSION}/Inter-${INTER_VERSION}.zip"
unzip -q "$WORK/inter.zip" -d "$WORK/inter"
VAR="$(find "$WORK/inter" -name 'InterVariable.ttf' -print -quit)"
[ -n "$VAR" ] || { echo "FATAL: InterVariable.ttf not found in the release archive" >&2; exit 1; }

# 2. Clamp the weight axis to the four weights the system allows (§3: 400/500/600/700 and
#    no others). One variable file then serves all four, so the page inlines ONE face.
python3 -m fontTools.varLib.instancer "$VAR" wght=400:700 -o "$WORK/inter-400-700.ttf"

# 3. Subset to font.subset.unicodeRanges from tokens.json (§7) and compress to woff2.
#    U+02BB is the canonical Uzbek apostrophe and is NOT in Latin-1 — losing it would
#    turn every o' and g' on the page into a fallback-font glyph.
python3 -m fontTools.subset "$WORK/inter-400-700.ttf" \
  --unicodes="U+0000-00FF,U+0100-017F,U+02BB,U+02BC,U+2018,U+2019" \
  --layout-features='kern,liga,calt,tnum' \
  --flavor=woff2 \
  --output-file="$WORK/inter-subset.woff2"

# 4. Prove the canonical apostrophe survived before anything gets committed.
python3 - "$WORK/inter-subset.woff2" <<'PY'
import sys
from fontTools.ttLib import TTFont
font = TTFont(sys.argv[1])
cmap = font.getBestCmap()
missing = [hex(cp) for cp in (0x02BB, 0x02BC, 0x2018, 0x2019, 0x011F, 0x2019) if cp not in cmap]
assert not missing, f"subset is missing codepoints: {missing}"
print(f"cmap OK: {len(cmap)} codepoints, U+02BB present")
PY

# 5. One line of base64, no trailing newline: it is going inside a url(data:...) value.
base64 < "$WORK/inter-subset.woff2" | tr -d '\n' > tools/inter-subset.woff2.b64
printf 'wrote tools/inter-subset.woff2.b64 (%s base64 bytes)\n' "$(wc -c < tools/inter-subset.woff2.b64 | tr -d ' ')"
```

Then run it:

```bash
cd /Users/baxrom/ish_full/soat-design
python3 -m pip install --user 'fonttools[woff]' brotli
chmod +x tools/build-inter-subset.sh
./tools/build-inter-subset.sh
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/baxrom/ish_full/soat-design && node --test tools/*.test.mjs`
Expected: the three `inter-subset` tests pass; the script's own output reported `cmap OK: … U+02BB present` and a base64 size near 51 KB.

- [ ] **Step 5: Commit**

```bash
git add tools/build-inter-subset.sh tools/inter-subset.woff2.b64 tools/inter-subset.test.mjs
git commit -m "Landing: commit the Inter woff2 subset (Latin + Latin-Ext + U+02BB) plus the one-time script that builds it"
```

---

### Task 6: The `landing` emitter and its two marker regions

The generator gains a second emitter. It writes a token block **and** the shipped `callcard.css` verbatim into two marker regions inside `landing.html`, so the landing page's call-card figure is literally the product's stylesheet and `--check` fails the moment either drifts.

This task deliberately leaves the page's legacy `:root` palette in place and appends the generated block after it. The generated names (`--color-*`, `--space-*`, `--type-*`, `--call-*`) do not collide with the legacy names (`--bg-0`, `--text-1`, `--accent`, `--radius-md`) except for `--font-mono`, where the two values are equivalent. The page therefore still renders exactly as it does today; Task 13 moves it onto the new variables and deletes the legacy block.

**Files:**
- Create: `tools/lib/emit-landing.mjs`
- Modify: `tools/generate-tokens.mjs`
- Modify: `server/static/landing.html` (add the four markers)
- Test: `tools/emit-landing.test.mjs`

**Interfaces:**
- Consumes: `forTarget`, `assertNoUndefined` from `tools/lib/targets.mjs`; `staticVars`, `themeBlock` from `tools/lib/emit-vars.mjs`; `tools/inter-subset.woff2.b64` from Task 5.
- Produces:
  - `TOKENS_START = '/* @tokens:start */'`, `TOKENS_END = '/* @tokens:end */'`
  - `COMPONENT_START = '/* @component-css:start */'`, `COMPONENT_END = '/* @component-css:end */'`
  - `emitLanding(tokens, { interB64 }): string` — the CSS text for the token region.
  - `injectLanding(html, { tokensBlock, componentCss }): string` — full HTML with both regions replaced; throws `Error` when a marker is missing.

- [ ] **Step 1: Write the failing test**

Create `tools/emit-landing.test.mjs`:

```js
// tools/emit-landing.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  emitLanding, injectLanding,
  TOKENS_START, TOKENS_END, COMPONENT_START, COMPONENT_END,
} from './lib/emit-landing.mjs';

const tokens = JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url), 'utf8'));
const B64 = 'd09GMkFBQQ'; // a stand-in: the emitter must never care what the bytes are
const block = () => emitLanding(tokens, { interB64: B64 });

test('emits the light palette on :root and the dark palette under [data-theme=dark]', () => {
  const css = block();
  assert.match(css, /:root\s*\{[^}]*--color-bg:\s*#F6F7F7/s);
  assert.match(css, /:root\[data-theme="dark"\]\s*\{[^}]*--color-bg:\s*#0E1213/s);
});

test('emits NO prefers-color-scheme block: the landing page is light unless toggled', () => {
  // The page's inline <script> deliberately ignores the OS setting -- a visitor whose
  // laptop is in dark mode should not decide how a product page for clinic owners looks.
  assert.doesNotMatch(block(), /prefers-color-scheme/);
});

test('inlines Inter as a data: URI with the §7 unicode ranges', () => {
  const css = block();
  assert.match(css, /@font-face\s*\{/);
  assert.match(css, /font-family:\s*"Inter"/);
  assert.match(css, /font-weight:\s*400 700;/);
  assert.match(css, new RegExp(`url\\(data:font/woff2;base64,${B64}\\)\\s*format\\("woff2"\\)`));
  assert.match(css, /unicode-range:\s*U\+0000-00FF, U\+0100-017F, U\+02BB, U\+02BC, U\+2018, U\+2019;/);
});

test('emits the alert tokens the hero figure needs, and none the target may not read', () => {
  const css = block();
  // roomDesk/timerDesk/floorDesk/ackDesk declare no `targets` => every target.
  assert.match(css, /--type-alert-room-desk-size-3:\s*96px/);
  assert.match(css, /--type-alert-timer-desk-size:\s*22px/);
  // Rule 7: these are css-only, ts-only and kotlin-only respectively.
  assert.doesNotMatch(css, /--type-alert-room-wall/);
  assert.doesNotMatch(css, /--type-alert-room-phone/);
  assert.doesNotMatch(css, /--type-watch-/);
  assert.doesNotMatch(css, /--shadow-pop/);
});

test('emits the management scale and the three landing display styles', () => {
  const css = block();
  assert.match(css, /--type-mgmt-dense-size:\s*13px/);
  assert.match(css, /--type-mgmt-eyebrow-tracking:\s*0\.06em/);
  assert.match(css, /--type-landing-h1-size:\s*clamp\(38px, 5\.2vw, 60px\)/);
  assert.match(css, /--type-landing-lede-size:\s*clamp\(17px, 1\.6vw, 19px\)/);
  assert.match(css, /--gutter-landing:\s*24px/);
  assert.match(css, /--size-landing-max:\s*1120px/);
});

test('emits the call tokens the hero figure depicts', () => {
  const css = block();
  assert.match(css, /--call-fill-2:\s*#A81810/);
  assert.match(css, /--call-ink:\s*#FFFFFF/);
  assert.match(css, /--rail-desk-w:\s*10px/);
});

test('assertNoUndefined never scans the inlined base64 font (a false-positive generator)', () => {
  // Base64's alphabet contains N, a and n. For a ~51KB (real subset) or larger base64
  // string, the literal substring "NaN" appears with non-trivial probability by pure
  // chance — a spurious, misleading build failure on a deterministic, committed input.
  // This B64 is engineered to contain "NaN" so the test fails loudly if the ordering
  // regresses to "build everything, then assertNoUndefined the whole string".
  const B64_WITH_NAN = 'd09GMkFBQQNaNQ==';
  assert.doesNotThrow(() => emitLanding(tokens, { interB64: B64_WITH_NAN }));
});

test('injectLanding replaces both regions and touches nothing else', () => {
  const html = [
    '<style>',
    'body { color: red; }',
    TOKENS_START,
    '  stale token block',
    TOKENS_END,
    '.legacy { color: blue; }',
    COMPONENT_START,
    '  stale component css',
    COMPONENT_END,
    '</style>',
    '<body>keep me</body>',
  ].join('\n');
  const out = injectLanding(html, { tokensBlock: 'NEW-TOKENS', componentCss: 'NEW-COMPONENT' });
  assert.match(out, /body \{ color: red; \}/);
  assert.match(out, /\.legacy \{ color: blue; \}/);
  assert.match(out, /keep me/);
  assert.match(out, new RegExp(`${escapeRe(TOKENS_START)}\\nNEW-TOKENS\\n${escapeRe(TOKENS_END)}`));
  assert.match(out, new RegExp(`${escapeRe(COMPONENT_START)}\\nNEW-COMPONENT\\n${escapeRe(COMPONENT_END)}`));
  assert.doesNotMatch(out, /stale/);
});

test('injectLanding is idempotent', () => {
  const html = `<style>\n${TOKENS_START}\nx\n${TOKENS_END}\n${COMPONENT_START}\ny\n${COMPONENT_END}\n</style>`;
  const once = injectLanding(html, { tokensBlock: 'A', componentCss: 'B' });
  assert.equal(injectLanding(once, { tokensBlock: 'A', componentCss: 'B' }), once);
});

test('a missing marker is an error, not a silent no-op', () => {
  assert.throws(
    () => injectLanding('<style>nothing here</style>', { tokensBlock: 'A', componentCss: 'B' }),
    /@tokens:start/
  );
});

test('the shipped landing.html carries all four markers', () => {
  const html = readFileSync(new URL('../server/static/landing.html', import.meta.url), 'utf8');
  for (const marker of [TOKENS_START, TOKENS_END, COMPONENT_START, COMPONENT_END]) {
    assert.ok(html.includes(marker), `landing.html is missing ${marker}`);
  }
});

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design && node --test tools/emit-landing.test.mjs`
Expected: FAIL with `Cannot find module '.../tools/lib/emit-landing.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Create `tools/lib/emit-landing.mjs`:

```js
// tools/lib/emit-landing.mjs
// The `landing` target (spec §6.7, §7 meta.outputs.landing). server/static/landing.html is
// one self-contained file behind a strict CSP, so the token block AND the webfont are
// injected into it: a data: URI is not a request, which is why an inlined woff2 is legal
// where a <link> to Google Fonts is not.
import { forTarget, assertNoUndefined } from './targets.mjs';
import { staticVars, themeBlock } from './emit-vars.mjs';

export const TOKENS_START = '/* @tokens:start */';
export const TOKENS_END = '/* @tokens:end */';
export const COMPONENT_START = '/* @component-css:start */';
export const COMPONENT_END = '/* @component-css:end */';

function fontFace(font, interB64) {
  return [
    '@font-face {',
    '  font-family: "Inter";',
    '  font-style: normal;',
    // One variable face clamped to the four allowed weights (§3), so the page inlines
    // 51 KB once instead of four static faces.
    '  font-weight: 400 700;',
    '  font-display: swap;',
    `  src: url(data:font/woff2;base64,${interB64}) format("woff2");`,
    `  unicode-range: ${font.subset.unicodeRanges.join(', ')};`,
    '}',
  ].join('\n');
}

export function emitLanding(rawTokens, { interB64 }) {
  if (!interB64) throw new Error(`emitLanding: no Inter subset. Run tools/build-inter-subset.sh`);
  const t = forTarget(rawTokens, 'landing');
  const light = [...themeBlock(t, 'light'), ...staticVars(t), '  color-scheme: light;'];
  const dark = [...themeBlock(t, 'dark'), '  color-scheme: dark;'];
  // Rule 7's check runs BEFORE the base64 font is concatenated. Base64's alphabet
  // contains N, a and n, so a ~51KB inlined woff2 has a non-trivial chance of containing
  // the literal substring "NaN" by pure coincidence — assertNoUndefined must never scan
  // committed, opaque binary data, only the token text the emitter itself composed.
  const tokenBlock = [
    `:root {\n${light.join('\n')}\n}`,
    '',
    // No @media (prefers-color-scheme): night mode on this page is opt-in via the
    // toggle only, which is the existing, deliberate behaviour of its inline <script>.
    `:root[data-theme="dark"] {\n${dark.join('\n')}\n}`,
  ].join('\n');
  assertNoUndefined(tokenBlock, 'landing');
  return [
    `/* GENERATED by tools/generate-tokens.mjs from tokens.json v${t.meta.version}. DO NOT EDIT. */`,
    fontFace(t.font, interB64),
    '',
    tokenBlock,
  ].join('\n');
}

function replaceRegion(html, start, end, body) {
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  if (a === -1) throw new Error(`landing.html is missing the marker ${start}`);
  if (b === -1) throw new Error(`landing.html is missing the marker ${end}`);
  if (b < a) throw new Error(`landing.html has ${end} before ${start}`);
  return html.slice(0, a) + start + '\n' + body + '\n' + html.slice(b);
}

export function injectLanding(html, { tokensBlock, componentCss }) {
  let out = replaceRegion(html, TOKENS_START, TOKENS_END, tokensBlock);
  out = replaceRegion(out, COMPONENT_START, COMPONENT_END, componentCss.trimEnd());
  return out;
}
```

Add the four markers to `server/static/landing.html`. Immediately **after** the closing `}` of the legacy `:root[data-theme="dark"] { … }` block (around line 113) and before `/* ================= BASE ================= */`, insert:

```css
  /* Generated design tokens (tools/generate-tokens.mjs). The block below is written by
     the generator from tokens.json; edit tokens.json, never this. Regenerate with:
       node tools/generate-tokens.mjs
     CSP note for whoever writes the header for this file: the inlined @font-face is a
     data: URI, not a request, so font-src must include `data:` — no other directive
     needs to change, because this page makes no external request at all. */
  /* @tokens:start */
  /* @tokens:end */

  /* Shipped alert-register stylesheet, injected verbatim from
     web-dashboard/src/components/calls/callcard.css so the hero figure and the "Ikki
     rejim" card are the product's own pixels rather than a mockup. Changing that file
     makes `--check` fail here until the page is regenerated. */
  /* @component-css:start */
  /* @component-css:end */
```

Register the emitter in `tools/generate-tokens.mjs`. This plan **owns** the `EMITTERS` object and the `export { … }` line (see Global Constraints): every edit here is additive, so a later plan (Plan 3, registering `ts`/`kotlin`) only ever adds a key and never has to reconcile a wholesale rewrite.

Add the import beside the existing one at the top of the file:

```js
import { emitLanding, injectLanding } from './lib/emit-landing.mjs';
```

Add this helper and constant immediately above the `EMITTERS` declaration:

```js
const COMPONENT_CSS_PATH = 'web-dashboard/src/components/calls/callcard.css';

const readRoot = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
```

Then **add a `landing` key to the existing `EMITTERS` object — do not rewrite the object itself**, so it reads:

```js
const EMITTERS = {
  css: { path: tokens.meta.outputs.css, render: emitCss },
  landing: {
    path: tokens.meta.outputs.landing,
    render: (t) =>
      injectLanding(readRoot(tokens.meta.outputs.landing), {
        tokensBlock: emitLanding(t, {
          interB64: readRoot(tokens.font.subset.woff2Base64File).trim(),
        }),
        componentCss: readRoot(COMPONENT_CSS_PATH),
      }),
  },
};
```

And **append to the existing `export { … }` list — do not replace it**:

```js
export { emitCss, emitLanding };
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd /Users/baxrom/ish_full/soat-design
node --test tools/*.test.mjs
node tools/generate-tokens.mjs            # writes the landing block for the first time
node tools/generate-tokens.mjs --check    # must now be clean
git diff --stat server/static/landing.html
```
Expected: tests pass; the first run prints `wrote server/static/landing.html`; `--check` exits 0; the diff shows insertions inside the two marker regions only.

- [ ] **Step 5: Prove the staleness guard bites**

```bash
printf '\n/* touched */\n' >> web-dashboard/src/components/calls/callcard.css
node tools/generate-tokens.mjs --check; echo "exit=$?"
git checkout -- web-dashboard/src/components/calls/callcard.css
node tools/generate-tokens.mjs --check; echo "exit=$?"
```
Expected: `STALE: server/static/landing.html …` and `exit=1`, then `exit=0` after the revert. This is the mechanism that makes the landing figures un-driftable.

- [ ] **Step 6: Screenshot verification**

Open `server/static/landing.html` directly in a browser (`open server/static/landing.html`). The page must look **exactly as it did before this task** — the legacy palette is still in force and the generated block only adds unused variables. Confirm with DevTools that `document.fonts.check('16px Inter')` returns `true`, proving the inlined subset loaded with no network request (the Network tab must show no font entry).

- [ ] **Step 7: Commit**

```bash
git add tools/lib/emit-landing.mjs tools/emit-landing.test.mjs tools/generate-tokens.mjs server/static/landing.html
git commit -m "Landing: add the landing emitter — generated token block plus an inlined Inter subset and the shipped callcard.css"
```

---

### Task 7: Sidebar — two nav groups, one promoted item (§6.3)

The cause of "the layouts are confusing" is that all six nav items sit at identical size and identical distance. Chaqiruvlar becomes 33% taller, two type steps larger and two weight steps heavier than the four settings items, separated by a 24px void and a `border-strong` rule. The `Sidebar` is shared by the clinic and superadmin shells, so it takes **groups**, not items, and both layouts supply their own grouping.

**Files:**
- Modify: `web-dashboard/src/components/Sidebar.tsx`
- Modify: `web-dashboard/src/components/DashboardLayout.tsx:29-38,105-135`
- Modify: `web-dashboard/src/components/SuperAdminLayout.tsx:14-20,33-56`
- Modify: `web-dashboard/src/styles/style.css` (brand row, nav groups, footer)
- Test: `web-dashboard/src/components/Sidebar.test.tsx`

**Interfaces:**
- Consumes: `NavItem`, `ConnInfo` (existing exports of `Sidebar.tsx`).
- Produces:
  - `export type NavItem = { key: string; label: string; Icon: (props: { className?: string }) => ReactElement; onClick: () => void; active: boolean; count?: number }` — `count` renders the teal pill only when `> 0`.
  - `export type NavGroup = { caption?: string; emphasis: 'primary' | 'dense'; items: NavItem[] }`
  - `Sidebar` props change: `items: NavItem[]` → `groups: NavGroup[]`. Everything else is unchanged.

- [ ] **Step 1: Write the failing test**

Create `web-dashboard/src/components/Sidebar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import type { NavGroup } from './Sidebar';
import { CallsIcon, RoomsIcon } from './Icons';

function groups(activeCount = 3): NavGroup[] {
  return [
    {
      emphasis: 'primary',
      items: [
        { key: 'calls', label: 'Chaqiruvlar', Icon: CallsIcon, onClick: vi.fn(), active: true, count: activeCount },
      ],
    },
    {
      caption: 'SOZLAMALAR',
      emphasis: 'dense',
      items: [
        { key: 'rooms', label: 'Xonalar', Icon: RoomsIcon, onClick: vi.fn(), active: false },
      ],
    },
  ];
}

function renderSidebar(g: NavGroup[]) {
  return render(
    <Sidebar
      groups={g}
      collapsed={false}
      onToggleCollapsed={vi.fn()}
      mobileOpen={false}
      onCloseMobile={vi.fn()}
      userName="Aziza"
      userRole="nurse"
      onOpenPasswordModal={vi.fn()}
      onLogout={vi.fn()}
      conn={{ status: 'live', label: 'jonli ulanish' }}
    />
  );
}

describe('Sidebar', () => {
  it('renders the settings caption as an eyebrow and gives group 1 none', () => {
    const { container } = renderSidebar(groups());
    const captions = container.querySelectorAll('.sidebar-group__caption');
    expect(captions.length).toBe(1);
    expect(captions[0].textContent).toBe('SOZLAMALAR');
  });

  it('marks the daily-work item primary and the settings items dense', () => {
    const { container } = renderSidebar(groups());
    expect(container.querySelector('.sidebar-item--primary')?.textContent).toContain('Chaqiruvlar');
    expect(container.querySelector('.sidebar-item--dense')?.textContent).toContain('Xonalar');
  });

  it('shows the count pill only when there are active calls', () => {
    const { container, unmount } = renderSidebar(groups(3));
    expect(container.querySelector('.sidebar-item__count')?.textContent).toBe('3');
    unmount();
    const zero = renderSidebar(groups(0));
    expect(zero.container.querySelector('.sidebar-item__count')).toBeNull();
  });

  it('never uses a call token for the count pill — the pill is a number, not a call', () => {
    const { container } = renderSidebar(groups());
    expect(container.innerHTML).not.toMatch(/--call-|call-fill/);
  });

  it('drops the avatar and keeps a static connection dot', () => {
    const { container } = renderSidebar(groups());
    expect(container.querySelector('.avatar')).toBeNull();
    expect(container.querySelector('.conn__dot--live')).toBeTruthy();
    expect(screen.getByText('jonli ulanish')).toBeTruthy();
  });

  it('renders every item as a button that calls its onClick', () => {
    const g = groups();
    renderSidebar(g);
    screen.getByText('Xonalar').click();
    expect(g[1].items[0].onClick).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design/web-dashboard && npm test`
Expected: FAIL — the `Sidebar.test.tsx` suite errors on the `groups` prop (TypeScript/runtime: `items` is undefined, `container.querySelector('.sidebar-group__caption')` returns null).

- [ ] **Step 3: Write minimal implementation**

Replace the type block and the `<nav>`/footer sections of `web-dashboard/src/components/Sidebar.tsx`:

```tsx
import type { ReactElement, ReactNode } from 'react';
import { CollapseIcon, HamburgerIcon, KeyIcon, LogoIcon, LogoutIcon } from './Icons';
import { ThemeToggle } from './ThemeToggle';

export type NavItem = {
  key: string;
  label: string;
  Icon: (props: { className?: string }) => ReactElement;
  onClick: () => void;
  active: boolean;
  /** Teal count pill, rendered only when > 0. It is a number, not a call, so it is
   *  never red (§6.1, §6.3). */
  count?: number;
};

/** §6.3: daily work above a 24px void and a rule; monthly settings below it, two type
 *  steps smaller. The Sidebar is shared with /admin, so the grouping is a prop. */
export type NavGroup = {
  /** `eyebrow` caption. Group 1 has none — a single item needs no heading. */
  caption?: string;
  emphasis: 'primary' | 'dense';
  items: NavItem[];
};

interface SidebarProps {
  groups: NavGroup[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  userName: string;
  userRole: string;
  onOpenPasswordModal: () => void;
  onLogout: () => void;
  conn?: ConnInfo;
}

export type ConnInfo = {
  status: 'connecting' | 'live' | 'disconnected';
  label: string;
};

const CONN_DOT: Record<ConnInfo['status'], string> = {
  live: 'conn__dot--live',
  connecting: 'conn__dot--attn',
  disconnected: 'conn__dot--idle',
};

export function Sidebar({
  groups,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
  userName,
  userRole,
  onOpenPasswordModal,
  onLogout,
  conn,
}: SidebarProps) {
  return (
    <>
      {mobileOpen && <div className="drawer-overlay" onClick={onCloseMobile} />}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <a href="/" className="brand">
            <span className="brand-mark">
              <LogoIcon />
            </span>
            <span className="brand-text">NurseCall</span>
          </a>
          <button className="sidebar-collapse-btn" onClick={onToggleCollapsed} type="button" aria-label="Toggle sidebar">
            <CollapseIcon />
          </button>
        </div>

        <nav className="sidebar-nav">
          {groups.map((group, i) => (
            <div className="sidebar-group" key={group.caption ?? `group-${i}`}>
              {group.caption && <p className="sidebar-group__caption">{group.caption}</p>}
              {group.items.map(({ key, label, Icon, onClick, active, count }) => (
                <button
                  key={key}
                  className={`sidebar-item sidebar-item--${group.emphasis} ${active ? 'active' : ''}`}
                  onClick={onClick}
                  type="button"
                  title={label}
                >
                  <Icon />
                  <span className="sidebar-item-label">{label}</span>
                  {count !== undefined && count > 0 && <span className="sidebar-item__count">{count}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {conn && (
            <div className="conn" title={conn.label}>
              {/* Static, never pulsing: a "status: live" widget in a desk sidebar is the
                  templated tell the brief is about (§6.3). */}
              <span className={`conn__dot ${CONN_DOT[conn.status]}`} />
              <span>{conn.label}</span>
            </div>
          )}
          <div className="sidebar-user">
            <span className="sidebar-user-text">
              <span className="sidebar-user-name">{userName}</span>
              <span className="sidebar-user-role">{userRole}</span>
            </span>
          </div>
          <div className="sidebar-actions">
            <ThemeToggle />
            <button
              className="icon-btn"
              onClick={onOpenPasswordModal}
              type="button"
              title="Parolni o'zgartirish"
              aria-label="Parolni o'zgartirish"
            >
              <KeyIcon />
            </button>
            <button className="icon-btn danger" onClick={onLogout} type="button" title="Chiqish" aria-label="Chiqish">
              <LogoutIcon />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export function MobileTopbar({ onOpenMobile, children }: { onOpenMobile: () => void; children?: ReactNode }) {
  return (
    <header className="topbar-mobile">
      <button className="hamburger-btn" onClick={onOpenMobile} type="button" aria-label="Open menu">
        <HamburgerIcon />
      </button>
      <span className="brand-text">NurseCall</span>
      {children}
    </header>
  );
}
```

In `web-dashboard/src/styles/style.css`, replace the brand-mark rule, the `.sidebar-header` height, the `.sidebar-item` rules, `.avatar`, and the `.dot`/`.conn` rules with:

```css
/* ================= BRAND ================= */
/* §4.3: there is EXACTLY ONE square icon tile in the product — tile.brand, 40x40,
   radius.2, a 20px glyph, flat accent fill. No gradient, no glow, never another size. */
.brand-mark {
  width: var(--size-tile-brand); height: var(--size-tile-brand);
  border-radius: var(--radius-2);
  background: var(--color-accent);
  display: flex; align-items: center; justify-content: center;
  flex: 0 0 auto;
}
.brand-mark svg { width: var(--size-icon); height: var(--size-icon); color: var(--color-accent-ink); }
```

```css
.sidebar-header {
  display: flex; align-items: center; justify-content: space-between;
  min-height: var(--control-56);
  padding: 0 var(--space-16);
  flex: 0 0 auto;
}
```

```css
/* ================= NAV GROUPS (§6.3) ================= */
.sidebar-nav { flex: 1 1 auto; padding: var(--space-24) 0; overflow-y: auto; overflow-x: hidden; }

/* The 24px void plus one border-strong rule is what tells a nurse that everything below
   is monthly settings, not her job. */
.sidebar-group + .sidebar-group {
  margin-top: var(--space-24);
  padding-top: var(--space-24);
  border-top: var(--border-hairline) solid var(--color-border-strong);
}
.sidebar-group__caption {
  margin: 0 0 var(--space-8);
  padding: 0 var(--space-24);
  font-size: var(--type-mgmt-eyebrow-size);
  line-height: var(--type-mgmt-eyebrow-lh);
  font-weight: var(--type-mgmt-eyebrow-weight);
  letter-spacing: var(--type-mgmt-eyebrow-tracking);
  text-transform: uppercase;
  color: var(--color-text3);
}
.sidebar.collapsed .sidebar-group__caption { display: none; }

.sidebar-item {
  position: relative;
  display: flex; align-items: center; gap: var(--space-12);
  margin: 2px var(--space-12);
  padding: 0 var(--space-12);
  width: calc(100% - (2 * var(--space-12)));
  border: none;
  background: transparent;
  border-radius: var(--radius-2);
  color: var(--color-text2);
  font-family: var(--font-sans);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--motion-ease), color var(--motion-fast) var(--motion-ease);
}
.sidebar-item:hover { background: var(--color-surface-soft); color: var(--color-text1); }

/* The item opened 100x a day. 48px, body-lg, a 22px icon. */
.sidebar-item--primary {
  min-height: var(--control-48);
  font-size: var(--type-mgmt-body-lg-size);
  line-height: var(--type-mgmt-body-lg-lh);
  font-weight: var(--type-mgmt-body-lg-weight);
  color: var(--color-text1);
}
.sidebar-item--primary svg { width: 22px; height: 22px; flex: 0 0 auto; stroke: currentColor; }

/* The four opened monthly. 36px, dense, an 18px icon. */
.sidebar-item--dense {
  min-height: var(--control-36);
  font-size: var(--type-mgmt-dense-size);
  line-height: var(--type-mgmt-dense-lh);
  font-weight: var(--type-mgmt-dense-weight);
}
.sidebar-item--dense svg { width: 18px; height: 18px; flex: 0 0 auto; stroke: currentColor; }

.sidebar-item.active { background: var(--color-accent-soft); color: var(--color-accent); }
.sidebar-item--primary.active { font-weight: 600; }
/* 3px accent bar on the left edge, drawn inside the radius. */
.sidebar-item.active::before {
  content: '';
  position: absolute; left: 0; top: 0; bottom: 0;
  width: 3px;
  border-radius: var(--radius-1) 0 0 var(--radius-1);
  background: var(--color-accent);
}
.sidebar-item__count {
  margin-left: auto;
  border-radius: var(--radius-full);
  background: var(--color-accent-soft);
  color: var(--color-accent);
  padding: 0 var(--space-8);
  font-size: var(--type-mgmt-dense-size);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.sidebar.collapsed .sidebar-item { justify-content: center; gap: 0; }
.sidebar.collapsed .sidebar-item .sidebar-item-label,
.sidebar.collapsed .sidebar-item__count { display: none; }
```

```css
/* ================= CONNECTION DOT ================= */
/* Fill-vs-hollow is the non-colour channel, so status survives greyscale (§2.3). */
.conn { display: flex; align-items: center; gap: var(--space-8);
  font-size: var(--type-mgmt-meta-size); line-height: var(--type-mgmt-meta-lh);
  font-weight: var(--type-mgmt-meta-weight); color: var(--color-text3); }
.conn__dot { width: 8px; height: 8px; border-radius: var(--radius-full); flex: 0 0 auto;
  background: transparent; border: var(--border-hairline) solid var(--color-text3); }
.conn__dot--live { background: var(--color-ok); border-color: var(--color-ok); }
.conn__dot--attn { background: var(--color-attn); border-color: var(--color-attn); }
```

Delete the `.avatar { … }` rule and the old `.dot { … }` / `.dot.live { … }` rules. Note: `.dot` is still referenced by `DevicesTab`/`AdminDevicesTab` (`.online-badge .dot`) and by `MobileTopbar` in `DashboardLayout`; Task 8 replaces the topbar usage and Task 10 replaces the badges, so keep `.online-badge .dot` and add a temporary bridge next to the new rules:

```css
/* Temporary: .online-badge still ships its own dot until Task 10 migrates it. */
.online-badge .dot { width: 7px; height: 7px; border-radius: var(--radius-full);
  background: currentColor; display: inline-block; flex: 0 0 auto; }
```

In `DashboardLayout.tsx`, replace the `navItems` construction and the `<Sidebar items=…>` prop with two groups, and switch the mobile topbar dot:

```tsx
  const settingsKeys: TabKey[] = isAdmin
    ? ['rooms', 'devices', 'staff', 'billing']
    : ['rooms', 'devices', 'staff'];

  const makeItem = (key: TabKey, label: string, Icon: typeof CallsIcon, count?: number) => ({
    key,
    label,
    Icon,
    count,
    active: tab === key,
    onClick: () => {
      setTab(key);
      setMobileOpen(false);
    },
  });

  const navGroups: NavGroup[] = [
    { emphasis: 'primary', items: [makeItem('calls', 'Chaqiruvlar', CallsIcon, feed.activeCalls.size)] },
    {
      caption: 'SOZLAMALAR',
      emphasis: 'dense',
      items: settingsKeys.map((key) => {
        const def = SETTINGS_NAV[key];
        return makeItem(key, def.label, def.Icon);
      }),
    },
  ];
```

with, above the component:

```tsx
const SETTINGS_NAV: Record<Exclude<TabKey, 'calls'>, { label: string; Icon: typeof CallsIcon }> = {
  rooms: { label: 'Xonalar', Icon: RoomsIcon },
  devices: { label: 'Qurilmalar', Icon: DevicesIcon },
  staff: { label: 'Xodimlar', Icon: StaffIcon },
  billing: { label: 'Obuna', Icon: BillingIcon },
};
```

Delete the old `NAV_ITEMS` array and `NavDef` type, import `NavGroup` from `./Sidebar`, and pass `groups={navGroups}`. Change the topbar dot to:

```tsx
          <div className="conn">
            <span className={`conn__dot ${feed.connStatus === 'live' ? 'conn__dot--live' : 'conn__dot--attn'}`} />
          </div>
```

In `SuperAdminLayout.tsx`, replace the `navItems` construction and the prop (§6.3 is silent on `/admin`; the same mechanism is used with the caption "BOSHQARUV"):

```tsx
  const makeItem = (key: TabKey, label: string, Icon: typeof OverviewIcon) => ({
    key,
    label,
    Icon,
    active: tab === key,
    onClick: () => {
      setTab(key);
      setMobileOpen(false);
    },
  });

  const navGroups: NavGroup[] = [
    { emphasis: 'primary', items: [makeItem('overview', 'Umumiy', OverviewIcon)] },
    {
      caption: 'BOSHQARUV',
      emphasis: 'dense',
      items: [
        makeItem('clinics', 'Klinikalar', ClinicIcon),
        makeItem('plans', 'Tariflar', PlanIcon),
        makeItem('devices', 'Qurilmalar', DevicesIcon),
        makeItem('requests', "So'rovlar", InboxIcon),
      ],
    },
  ];
```

Delete its `NAV_ITEMS` array, import `NavGroup`, and pass `groups={navGroups}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/baxrom/ish_full/soat-design/web-dashboard && npx tsc -b && npm test`
Expected: `Sidebar` suite green, all existing tests green, no TypeScript errors.

- [ ] **Step 5: Screenshot verification — the hierarchy is the whole point**

Run `npm run dev`, log in as a clinic admin, screenshot the sidebar at 1440px. Confirm by eye: Chaqiruvlar is visibly *the* item — taller, larger, heavier — with a teal count pill; a clear 24px gap and a single hairline rule below it; "SOZLAMALAR" as small uppercase `text-3`; the four settings rows visibly smaller and lighter. Then collapse the sidebar and confirm the caption and labels disappear without the rows shifting. Repeat once at `/admin`.

- [ ] **Step 6: Commit**

```bash
git add web-dashboard/src/components/Sidebar.tsx web-dashboard/src/components/Sidebar.test.tsx \
        web-dashboard/src/components/DashboardLayout.tsx web-dashboard/src/components/SuperAdminLayout.tsx \
        web-dashboard/src/styles/style.css
git commit -m "Dashboard IA: two nav groups, Chaqiruvlar promoted with a teal count pill, flat brand tile, static conn dot"
```

---

### Task 8: Fold "Noma'lum signallar" into Qurilmalar (§6.3)

Unassigned signals are a *device state*, not a destination. The nav item is removed and the view becomes a segmented control inside Devices — "Barchasi / Biriktirilmagan (4)" — with the count badge in `attn` when non-zero, never red.

**Files:**
- Create: `web-dashboard/src/components/tabs/DeviceScopeTabs.tsx`
- Modify: `web-dashboard/src/components/tabs/DevicesTab.tsx`
- Modify: `web-dashboard/src/components/DashboardLayout.tsx`
- Modify: `web-dashboard/src/components/tabs/UnassignedTab.tsx` (drop its own page heading)
- Modify: `web-dashboard/src/styles/style.css` (segmented control)
- Test: `web-dashboard/src/components/tabs/DeviceScopeTabs.test.tsx`

**Interfaces:**
- Consumes: `NavGroup`/`makeItem` from Task 7; `UnassignedTab` props `{ signals, refreshSignals, markLocalMutation }` (unchanged).
- Produces:
  - `export type DeviceScope = 'all' | 'unassigned'`
  - `export function DeviceScopeTabs(props: { scope: DeviceScope; onScope: (s: DeviceScope) => void; unassignedCount: number }): ReactElement`
  - `DevicesTab` props change from none to `{ signals: UnassignedSignal[]; refreshSignals: () => Promise<void>; markLocalMutation: () => void }`.

- [ ] **Step 1: Write the failing test**

Create `web-dashboard/src/components/tabs/DeviceScopeTabs.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeviceScopeTabs } from './DeviceScopeTabs';

describe('DeviceScopeTabs', () => {
  it('renders two segments and marks the active one pressed', () => {
    const { container } = render(<DeviceScopeTabs scope="all" onScope={vi.fn()} unassignedCount={0} />);
    const segs = container.querySelectorAll('.seg__btn');
    expect(segs.length).toBe(2);
    expect(segs[0].getAttribute('aria-pressed')).toBe('true');
    expect(segs[1].getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Barchasi')).toBeTruthy();
    expect(screen.getByText('Biriktirilmagan')).toBeTruthy();
  });

  it('badges a non-zero count in attn, never red', () => {
    const { container } = render(<DeviceScopeTabs scope="all" onScope={vi.fn()} unassignedCount={4} />);
    const badge = container.querySelector('.seg__badge');
    expect(badge?.textContent).toBe('4');
    expect(badge?.className).toContain('seg__badge--attn');
    expect(container.innerHTML).not.toMatch(/--call-|call-fill/);
  });

  it('shows no badge at zero — an empty queue is not a warning', () => {
    const { container } = render(<DeviceScopeTabs scope="all" onScope={vi.fn()} unassignedCount={0} />);
    expect(container.querySelector('.seg__badge')).toBeNull();
  });

  it('reports the chosen scope', () => {
    const onScope = vi.fn();
    render(<DeviceScopeTabs scope="all" onScope={onScope} unassignedCount={2} />);
    screen.getByText('Biriktirilmagan').closest('button')!.click();
    expect(onScope).toHaveBeenCalledWith('unassigned');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design/web-dashboard && npm test`
Expected: FAIL with `Failed to resolve import "./DeviceScopeTabs"`.

- [ ] **Step 3: Write minimal implementation**

Create `web-dashboard/src/components/tabs/DeviceScopeTabs.tsx`:

```tsx
export type DeviceScope = 'all' | 'unassigned';

interface Props {
  scope: DeviceScope;
  onScope: (scope: DeviceScope) => void;
  unassignedCount: number;
}

/** §6.3: an unassigned signal is a DEVICE STATE, so it is a filter inside Qurilmalar
 *  rather than a top-level destination. The count badge is `attn` when non-zero and
 *  never red — red means a patient is waiting right now. */
export function DeviceScopeTabs({ scope, onScope, unassignedCount }: Props) {
  return (
    <div className="seg" role="group" aria-label="Qurilma ko'rinishi">
      <button
        type="button"
        className={`seg__btn ${scope === 'all' ? 'active' : ''}`}
        aria-pressed={scope === 'all'}
        onClick={() => onScope('all')}
      >
        Barchasi
      </button>
      <button
        type="button"
        className={`seg__btn ${scope === 'unassigned' ? 'active' : ''}`}
        aria-pressed={scope === 'unassigned'}
        onClick={() => onScope('unassigned')}
      >
        Biriktirilmagan
        {unassignedCount > 0 && <span className="seg__badge seg__badge--attn">{unassignedCount}</span>}
      </button>
    </div>
  );
}
```

Add to `web-dashboard/src/styles/style.css`:

```css
/* ================= SEGMENTED CONTROL (§6.1, §6.3) ================= */
/* The active segment is surface-soft + text-1, not a teal fill: a filter is not the
   point of the page it sits on. */
.seg {
  display: inline-flex;
  border: var(--border-hairline) solid var(--color-border-strong);
  border-radius: var(--radius-2);
  overflow: hidden;
  background: var(--color-surface);
}
.seg__btn {
  display: inline-flex; align-items: center; gap: var(--space-8);
  min-height: var(--control-32);
  padding: 0 var(--space-12);
  border: none;
  background: transparent;
  color: var(--color-text2);
  font-family: var(--font-sans);
  font-size: var(--type-mgmt-dense-size);
  font-weight: var(--type-mgmt-dense-weight);
  cursor: pointer;
}
.seg__btn + .seg__btn { border-left: var(--border-hairline) solid var(--color-border-strong); }
.seg__btn.active { background: var(--color-surface-soft); color: var(--color-text1); font-weight: 600; }
.seg__badge {
  border-radius: var(--radius-full);
  padding: 0 var(--space-8);
  font-size: var(--type-mgmt-meta-size);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.seg__badge--attn { background: var(--color-attn-soft); color: var(--color-attn); }
/* Under (hover: none) a 32px control still needs a 44px hit area (§4.4). */
@media (hover: none) {
  .seg__btn { min-height: var(--control-44); }
}
```

In `DevicesTab.tsx`, add the props, the scope state and the control. Change the signature and the top of the returned JSX:

```tsx
import { DeviceScopeTabs } from './DeviceScopeTabs';
import type { DeviceScope } from './DeviceScopeTabs';
import { UnassignedTab } from './UnassignedTab';
import type { Device, UnassignedSignal } from '../../api/types';

interface DevicesTabProps {
  signals: UnassignedSignal[];
  refreshSignals: () => Promise<void>;
  markLocalMutation: () => void;
}

export function DevicesTab({ signals, refreshSignals, markLocalMutation }: DevicesTabProps) {
  const [scope, setScope] = useState<DeviceScope>('all');
  // …existing state unchanged…
```

and immediately inside the returned `<section className="tab-panel">`, replace the old `<div className="section-head"><h2>Qurilmalar (ESP32)</h2></div>` with:

```tsx
      <div className="section-head">
        <h2>Qurilmalar (ESP32)</h2>
        <DeviceScopeTabs scope={scope} onScope={setScope} unassignedCount={signals.length} />
      </div>

      {scope === 'unassigned' ? (
        <UnassignedTab
          signals={signals}
          refreshSignals={refreshSignals}
          markLocalMutation={markLocalMutation}
        />
      ) : (
        <>
          {/* …the existing "Yangi qurilma qo'shish" panel, key modal and device table… */}
        </>
      )}
```

Wrap the existing body (the add-device panel, the `created &&` modal, and the `loadError ? … : …` table) inside that `<>…</>` branch verbatim.

In `UnassignedTab.tsx`, delete its own page heading so it does not print a second title inside Devices — remove:

```tsx
      <div className="section-head">
        <h2>Noma'lum signallar</h2>
      </div>
```

In `DashboardLayout.tsx`: remove `'unassigned'` from `TabKey`, delete `UnassignedTab` from the imports, delete `'unassigned'` from `BLOCKED_TABS`, delete the whole `{tab === 'unassigned' && ( … )}` branch, and pass the feed through to Devices:

```tsx
              {tab === 'devices' && (
                <DevicesTab
                  signals={feed.unassignedSignals}
                  refreshSignals={feed.refreshUnassigned}
                  markLocalMutation={feed.markLocalMutation}
                />
              )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/baxrom/ish_full/soat-design/web-dashboard && npx tsc -b && npm test`
Expected: `DeviceScopeTabs` suite green; no TypeScript errors (the compiler proves no caller still passes `unassigned`).

- [ ] **Step 5: Manual verification — the pairing flow must still work end to end**

Run the backend and `npm run dev`. Open Qurilmalar, switch to "Biriktirilmagan", press a physical button (or `python3 server/simulate_esp32.py`), and confirm the code appears live in the list, that binding it to a room still succeeds, and that the segment badge count drops by one afterwards. This is the one flow in the dashboard with a hardware dependency; a passing unit test does not cover the WebSocket wiring that Task 8 re-routes.

- [ ] **Step 6: Commit**

```bash
git add web-dashboard/src/components/tabs/DeviceScopeTabs.tsx web-dashboard/src/components/tabs/DeviceScopeTabs.test.tsx \
        web-dashboard/src/components/tabs/DevicesTab.tsx web-dashboard/src/components/tabs/UnassignedTab.tsx \
        web-dashboard/src/components/DashboardLayout.tsx web-dashboard/src/styles/style.css
git commit -m "Dashboard IA: unassigned signals become a device-state filter inside Qurilmalar, off the top-level nav"
```

---

### Task 9: Table primitives — one container, three strips (§6.4)

"The biggest management change." The "table inside a card" wrapper is deleted and replaced by one container with a toolbar strip, a header strip and body rows. This task builds the primitives and the lint; Task 10 migrates the nine files that use them, so the app keeps working throughout.

**Files:**
- Create: `web-dashboard/src/components/ui/table.css`
- Create: `web-dashboard/src/components/ui/TablePanel.tsx`
- Create: `web-dashboard/src/components/ui/StatusDot.tsx`
- Create: `web-dashboard/src/components/ui/MonoId.tsx`
- Create: `web-dashboard/src/components/ui/PageHeader.tsx`
- Test: `web-dashboard/src/components/ui/ui.test.tsx`
- Test: `web-dashboard/src/components/ui/dataLabel.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `export function TablePanel(props: { toolbar?: ReactNode; children: ReactNode }): ReactElement`
  - `export type StatusTone = 'ok' | 'attn' | 'idle'`
  - `export function StatusDot(props: { tone: StatusTone; label: string }): ReactElement`
  - `export function middleTruncate(value: string, max?: number): string`
  - `export function MonoId(props: { value: string }): ReactElement`
  - `export function PageHeader(props: { title: string; description: string; action?: ReactNode }): ReactElement`

- [ ] **Step 1: Write the failing tests**

Create `web-dashboard/src/components/ui/ui.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TablePanel } from './TablePanel';
import { StatusDot } from './StatusDot';
import { MonoId, middleTruncate } from './MonoId';
import { PageHeader } from './PageHeader';

describe('TablePanel', () => {
  it('renders one container with no card wrapper and no toolbar when none is given', () => {
    const { container } = render(
      <TablePanel>
        <table><tbody><tr><td data-label="A">1</td></tr></tbody></table>
      </TablePanel>
    );
    expect(container.querySelector('.table-panel')).toBeTruthy();
    expect(container.querySelector('.glass')).toBeNull();
    expect(container.querySelector('.table-wrap')).toBeNull();
    expect(container.querySelector('.table-panel__toolbar')).toBeNull();
  });

  it('puts the toolbar INSIDE the container when one is given', () => {
    const { container } = render(
      <TablePanel toolbar={<button type="button">Filtr</button>}>
        <table><tbody><tr><td data-label="A">1</td></tr></tbody></table>
      </TablePanel>
    );
    const toolbar = container.querySelector('.table-panel__toolbar');
    expect(toolbar).toBeTruthy();
    expect(toolbar!.closest('.table-panel')).toBeTruthy();
    expect(screen.getByText('Filtr')).toBeTruthy();
  });
});

describe('StatusDot', () => {
  it('is a dot plus a word, never a pill and never red', () => {
    const { container } = render(<StatusDot tone="ok" label="Onlayn" />);
    expect(container.querySelector('.status__dot--ok')).toBeTruthy();
    expect(screen.getByText('Onlayn')).toBeTruthy();
    expect(container.querySelector('.status-pill')).toBeNull();
    expect(container.innerHTML).not.toMatch(/--call-|call-fill/);
  });

  it('distinguishes absence with a hollow ring, so status survives greyscale', () => {
    const { container } = render(<StatusDot tone="idle" label="Oflayn" />);
    expect(container.querySelector('.status__dot--idle')).toBeTruthy();
  });
});

describe('middleTruncate', () => {
  it('leaves a short value alone', () => {
    expect(middleTruncate('floor2-01')).toBe('floor2-01');
  });

  it('middle-truncates a long device id', () => {
    // keep = max - 1 = 17; head = ceil(17/2) = 9, tail = 8 — asserted exactly, not as a
    // looser prefix check, since "floor2-esp" (10 chars) is not what a 9-char head slice
    // produces ("floor2-es").
    const out = middleTruncate('floor2-esp32-01-basement', 18);
    expect(out).toBe('floor2-es…basement');
    expect(out.length).toBe(18);
  });
});

describe('MonoId', () => {
  it('keeps the full value in title so a technician can read it aloud', () => {
    const { container } = render(<MonoId value="floor2-esp32-01-basement" />);
    const el = container.querySelector('.mono-id')!;
    expect(el.getAttribute('title')).toBe('floor2-esp32-01-basement');
    expect(el.textContent).toContain('…');
  });
});

describe('PageHeader', () => {
  it('renders title, one-line description and an optional single action', () => {
    render(
      <PageHeader
        title="Qurilmalar"
        description="Qurilmalar va ularning oxirgi signali"
        action={<button type="button">Qo'shish</button>}
      />
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Qurilmalar');
    expect(screen.getByText('Qurilmalar va ularning oxirgi signali')).toBeTruthy();
    expect(screen.getByText("Qo'shish")).toBeTruthy();
  });

  it('renders no action slot when none is given', () => {
    const { container } = render(<PageHeader title="Xonalar" description="Xonalar ro'yxati" />);
    expect(container.querySelector('.page-header__action')).toBeNull();
  });
});
```

Create `web-dashboard/src/components/ui/dataLabel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../', import.meta.url));

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...tsxFiles(abs));
    else if (name.endsWith('.tsx')) out.push(abs);
  }
  return out;
}

describe('table markup', () => {
  // Under 640px style.css collapses every table into a card per row and prints the
  // column name with content: attr(data-label). A cell without one renders as a bare
  // value with no label — broken, and invisible on a desktop screenshot.
  it('every <td> carries a data-label, except a full-width colSpan empty-state cell', () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const text = readFileSync(file, 'utf8');
      // `[^>]*` spans newlines; no attribute value in this codebase contains a bare '>'.
      for (const m of text.matchAll(/<td\b[^>]*>/g)) {
        // A cell spanning every column (an empty-state row) has no single column to
        // name — AdminDevicesTab's "Hozircha ... qurilma yo'q" row is exactly this.
        if (/\bcolSpan=/.test(m[0])) continue;
        if (!/\bdata-label=/.test(m[0])) {
          offenders.push(`${file.slice(SRC.length)}: ${m[0].replace(/\s+/g, ' ')}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/baxrom/ish_full/soat-design/web-dashboard && npm test`
Expected: FAIL with `Failed to resolve import "./TablePanel"`. The `dataLabel` test **fails on one existing offender**: `web-dashboard/src/components/admin/AdminDevicesTab.tsx`'s empty-state row is `<td colSpan={4}>Hozircha onlayn, biriktirilmagan qurilma yo'q</td>` — a `colSpan` cell has no single column to name, which is why the test above exempts it. With that exemption in place every other existing `<td>` already has a `data-label`; the test is a regression guard for Tasks 10 and 11.

- [ ] **Step 3: Write minimal implementation**

Create `web-dashboard/src/components/ui/table.css`:

```css
/* web-dashboard/src/components/ui/table.css
   §6.4: one container, three strips. No card wrapper, no shadow, no zebra. Tokens only. */

.table-panel {
  background: var(--color-surface);
  border: var(--border-hairline) solid var(--color-border-strong);
  border-radius: var(--radius-3);
  overflow: hidden;
  box-shadow: none;
}

/* Strip 1 — toolbar, inside the container. This is what kills the current "toolbar
   floating above a table inside a card inside a page" nesting. */
.table-panel__toolbar {
  display: flex; align-items: center; gap: var(--space-12); flex-wrap: wrap;
  min-height: var(--control-44);
  padding: 0 var(--space-16);
  background: var(--color-surface-sunken);
  border-bottom: var(--border-hairline) solid var(--color-border);
}

.table-panel__scroll { overflow-x: auto; }

.table-panel table { width: 100%; border-collapse: collapse; }

/* Strip 2 — header row, 36px, sentence case. Weight, colour and a border-strong rule do
   the differentiating; uppercase Uzbek at 11-12px reads cheap and runs ~18% wider (§3). */
.table-panel thead th {
  text-align: left;
  background: var(--color-surface-sunken);
  color: var(--color-text2);
  font-family: var(--font-sans);
  font-size: var(--type-mgmt-dense-size);
  line-height: var(--type-mgmt-dense-lh);
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0;
  white-space: nowrap;
  border-bottom: var(--border-hairline) solid var(--color-border-strong);
  padding: calc((var(--control-36) - var(--type-mgmt-dense-lh)) / 2) var(--space-12);
}

/* Strip 3 — body rows. `min-height: 44px` cannot be honoured on a table-row, so the row
   height is derived from the cell box: 18px dense line + 2 x 13px = 44px exactly. */
.table-panel tbody td {
  color: var(--color-text2);
  font-size: var(--type-mgmt-dense-size);
  line-height: var(--type-mgmt-dense-lh);
  font-weight: var(--type-mgmt-dense-weight);
  border-bottom: var(--border-hairline) solid var(--color-border);
  padding: calc((var(--control-44) - var(--type-mgmt-dense-lh)) / 2) var(--space-12);
  white-space: nowrap;
  vertical-align: middle;
}
.table-panel thead th:first-child,
.table-panel tbody td:first-child { padding-left: var(--space-16); }
.table-panel thead th:last-child,
.table-panel tbody td:last-child { padding-right: var(--space-16); }

/* Column 1 identifies the row, so it is the only one at text-1/600. */
.table-panel tbody td:first-child { color: var(--color-text1); font-weight: 600; }

/* No zebra striping: hairlines already delimit rows and stripes only add noise here. */
.table-panel tbody tr:hover { background: var(--color-surface-soft); }
.table-panel tbody tr:last-child td { border-bottom: none; }
.table-panel tbody tr:focus-within {
  outline: var(--border-focus) solid var(--color-accent);
  outline-offset: calc(-1 * var(--border-focus));
}

/* Numbers and timestamps right-aligned and tabular. */
.table-panel .num { text-align: right; font-variant-numeric: tabular-nums; }

/* Status: 8px dot + word. Filled ok / filled attn / hollow text-3 ring. Never a pill,
   never coloured text, never red. */
.status { display: inline-flex; align-items: center; gap: var(--space-8); color: var(--color-text2); }
.status__dot {
  width: 8px; height: 8px; border-radius: var(--radius-full); flex: 0 0 auto;
  background: transparent; border: var(--border-hairline) solid var(--color-text3);
}
.status__dot--ok { background: var(--color-ok); border-color: var(--color-ok); }
.status__dot--attn { background: var(--color-attn); border-color: var(--color-attn); }

/* Device IDs and EV1527 codes: mono-sm with 0.02em tracking so a technician reading one
   aloud does not confuse 0 from O. */
.mono-id {
  font-family: var(--font-mono);
  font-size: var(--type-mgmt-mono-sm-size);
  line-height: var(--type-mgmt-mono-sm-lh);
  font-weight: var(--type-mgmt-mono-sm-weight);
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--color-text1);
}

/* Row actions: revealed on hover on a desk, always visible where there is no hover. */
.table-panel .row-actions { display: flex; gap: var(--space-4); justify-content: flex-end; }
@media (hover: hover) and (min-width: 1024px) {
  .table-panel tbody tr .row-actions { opacity: 0; transition: opacity var(--motion-fast) var(--motion-ease); }
  .table-panel tbody tr:hover .row-actions,
  .table-panel tbody tr:focus-within .row-actions { opacity: 1; }
}

/* ---- page header, the one shared pattern (§6.3) ---- */
.page-header {
  display: flex; align-items: flex-start; gap: var(--space-16); flex-wrap: wrap;
  padding-bottom: var(--space-16);
  border-bottom: var(--border-hairline) solid var(--color-border);
  margin-bottom: var(--space-24);
}
.page-header__title {
  margin: 0;
  font-size: var(--type-mgmt-page-title-size);
  line-height: var(--type-mgmt-page-title-lh);
  font-weight: var(--type-mgmt-page-title-weight);
  letter-spacing: var(--type-mgmt-page-title-tracking);
  color: var(--color-text1);
}
.page-header__desc {
  margin: var(--space-2) 0 0;
  font-size: var(--type-mgmt-body-size);
  line-height: var(--type-mgmt-body-lh);
  color: var(--color-text2);
}
.page-header__action { margin-left: auto; }
```

Create `web-dashboard/src/components/ui/TablePanel.tsx`:

```tsx
import type { ReactNode } from 'react';
import './table.css';

interface TablePanelProps {
  /** Strip 1: filter controls that already exist on the page. No search box is added —
   *  that would be a new feature, and features are neither added nor removed. */
  toolbar?: ReactNode;
  children: ReactNode;
}

/** §6.4: one container, three strips. Replaces `<div className="table-wrap glass">`. */
export function TablePanel({ toolbar, children }: TablePanelProps) {
  return (
    <div className="table-panel">
      {toolbar && <div className="table-panel__toolbar">{toolbar}</div>}
      <div className="table-panel__scroll">{children}</div>
    </div>
  );
}
```

Create `web-dashboard/src/components/ui/StatusDot.tsx`:

```tsx
export type StatusTone = 'ok' | 'attn' | 'idle';

/** §6.4: 8px dot + word. `idle` is a hollow text-3 ring, because offline is *absence* and
 *  fill-vs-hollow is the non-colour channel that survives greyscale (§2.3). */
export function StatusDot({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span className="status">
      <span className={`status__dot status__dot--${tone}`} aria-hidden="true" />
      {label}
    </span>
  );
}
```

Create `web-dashboard/src/components/ui/MonoId.tsx`:

```tsx
/** Middle-truncates so both ends stay readable: `floor2-esp32-01-basement` is
 *  distinguished by its tail, a head-truncating ellipsis would hide it. */
export function middleTruncate(value: string, max = 18): string {
  if (value.length <= max) return value;
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = keep - head;
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}

export function MonoId({ value }: { value: string }) {
  return (
    <code className="mono-id" title={value}>
      {middleTruncate(value)}
    </code>
  );
}
```

Create `web-dashboard/src/components/ui/PageHeader.tsx`:

```tsx
import type { ReactNode } from 'react';
import './table.css';

/** §6.3: the one page-header pattern. No breadcrumbs, no tabs-that-are-really-navigation,
 *  and no page invents its own. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1 className="page-header__title">{title}</h1>
        <p className="page-header__desc">{description}</p>
      </div>
      {action && <div className="page-header__action">{action}</div>}
    </header>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/baxrom/ish_full/soat-design/web-dashboard && npx tsc -b && npm test`
Expected: the `ui` and `dataLabel` suites pass. Then confirm the new stylesheet satisfies the Task 4 lints: `cd .. && node tools/generate-tokens.mjs --check` exits 0 (`table.css` references no gutter and no fixed height).

- [ ] **Step 5: Commit**

```bash
git add web-dashboard/src/components/ui
git commit -m "Tables: add the §6.4 primitives — TablePanel, StatusDot, MonoId, PageHeader — plus a data-label lint"
```

---

### Task 10: Migrate all nine table pages onto the primitives

Eleven `<div className="table-wrap glass">` wrappers across nine files become `<TablePanel>`; every status pill becomes a `StatusDot`; every device ID and EV1527 code becomes a `MonoId`; every page grows the shared `PageHeader`; the old global table rules are deleted.

**Files:**
- Modify: `web-dashboard/src/components/tabs/{RoomsTab,StaffTab,DevicesTab,UnassignedTab,BillingTab}.tsx`
- Modify: `web-dashboard/src/components/admin/{AdminClinicsTab,AdminPlansTab,AdminDevicesTab,ContactRequestsTab,AdminOverviewTab}.tsx`
- Modify: `web-dashboard/src/styles/style.css` (delete the global table rules, retarget the mobile card mode)
- Test: `web-dashboard/src/components/ui/migration.test.ts`

**Interfaces:**
- Consumes: `TablePanel`, `StatusDot`, `MonoId`, `PageHeader`, `middleTruncate` from Task 9.
- Produces: nothing new. Deliverable is every management table rendering the §6.4 layout.

- [ ] **Step 1: Write the failing test**

Create `web-dashboard/src/components/ui/migration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../', import.meta.url));

function files(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...files(abs, ext));
    else if (name.endsWith(ext)) out.push(abs);
  }
  return out;
}

const sources = files(SRC, '.tsx').map((f) => ({ f: f.slice(SRC.length), text: readFileSync(f, 'utf8') }));

/** CallsTab renders CallsLive's own alert-register head (§6.1) and UnassignedTab renders
 *  INSIDE Qurilmalar (§6.3), so neither owns a page header. */
const NO_PAGE_HEADER = new Set([
  'components/tabs/CallsTab.tsx',
  'components/tabs/UnassignedTab.tsx',
]);

describe('§6.4 migration', () => {
  it('no page still wraps a table in a card', () => {
    const offenders = sources.filter((s) => /table-wrap/.test(s.text)).map((s) => s.f);
    expect(offenders).toEqual([]);
  });

  it('every <table> lives inside a TablePanel — counted, not just present', () => {
    // A FILE-LEVEL presence check passes as soon as one <table> in a file gets a
    // TablePanel, even if the file has three. AdminClinicsTab has one page-level table
    // (migrated) plus two `.pay-history` modal tables (deviation 18 — an intentionally
    // separate, pre-existing compact pattern), so the two counts are not expected to be
    // equal there; every other file's table count must match exactly.
    const PAY_HISTORY_MODAL_TABLES = new Set(['components/admin/AdminClinicsTab.tsx']);
    const offenders = sources
      .filter((s) => {
        const tables = (s.text.match(/<table\b/g) ?? []).length;
        const panels = (s.text.match(/<TablePanel\b/g) ?? []).length;
        if (tables === 0) return false;
        if (PAY_HISTORY_MODAL_TABLES.has(s.f)) return panels === 0; // still needs its one page table wrapped
        return tables !== panels;
      })
      .map((s) => s.f);
    expect(offenders).toEqual([]);
  });

  it('no row status is a coloured pill any more', () => {
    // CallsTab.tsx's own status-pill is removed by Task 11's full rewrite of the
    // history render, not by this task's mechanical table-wrap swap; CallsTab.test.tsx
    // (Task 11) asserts "no red in this table, ever" including status-pill directly.
    const EXEMPT_UNTIL_TASK_11 = new Set(['components/tabs/CallsTab.tsx']);
    const offenders = sources
      .filter((s) => !EXEMPT_UNTIL_TASK_11.has(s.f))
      .filter((s) => /className="(status-pill|online-badge|role-pill)/.test(s.text) || /`(status-pill|online-badge|role-pill)/.test(s.text))
      .map((s) => s.f);
    expect(offenders).toEqual([]);
  });

  it('the settled .sub-pill subscription states are untouched', () => {
    // Owner decision, not relitigated: subscription state is not a row status.
    const style = readFileSync(join(SRC, 'styles/style.css'), 'utf8');
    for (const state of ['trial', 'active', 'grace', 'overdue', 'suspended']) {
      expect(style).toMatch(new RegExp(`\\.sub-pill\\.${state}`));
    }
  });

  it('the old global table rules are gone from style.css', () => {
    const style = readFileSync(join(SRC, 'styles/style.css'), 'utf8');
    expect(style).not.toMatch(/^th, td \{/m);
    expect(style).not.toMatch(/text-transform: uppercase;[\s\S]{0,80}letter-spacing: 0\.05em;[\s\S]{0,80}font-family: var\(--font-mono\)/);
  });

  it('every management page uses the one PageHeader pattern', () => {
    const pages = sources.filter(
      (s) => /^components\/(tabs|admin)\//.test(s.f) && /tab-panel/.test(s.text) && !NO_PAGE_HEADER.has(s.f)
    );
    expect(pages.length).toBeGreaterThan(5);
    const offenders = pages.filter((s) => !/<PageHeader\b/.test(s.text)).map((s) => s.f);
    expect(offenders).toEqual([]);
  });

  it('no page invents its own header any more', () => {
    const offenders = sources
      .filter((s) => /^components\/(tabs|admin)\//.test(s.f) && /className="section-head"/.test(s.text))
      .map((s) => s.f);
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design/web-dashboard && npm test`
Expected: FAIL — `no page still wraps a table in a card` lists nine files; `no row status is a coloured pill any more` lists five; `every management page uses the one PageHeader pattern` lists eleven.

- [ ] **Step 3: Write the implementation**

The wrapper change is identical in all eleven places. In each of `RoomsTab.tsx`, `StaffTab.tsx`, `DevicesTab.tsx`, `UnassignedTab.tsx` (×2), `AdminClinicsTab.tsx`, `AdminPlansTab.tsx`, `AdminDevicesTab.tsx` (×2), `ContactRequestsTab.tsx`, `CallsTab.tsx`, replace

```tsx
        <div className="table-wrap glass">
```

with

```tsx
        <TablePanel>
```

and its matching closing `</div>` with `</TablePanel>`, adding to each file's imports:

```tsx
import { TablePanel } from '../ui/TablePanel';
```

(`../../ui/TablePanel` is wrong — `ui/` is a sibling of `tabs/` and `admin/`, so from `components/tabs/X.tsx` the path is `../ui/TablePanel`.)

`AdminDevicesTab.tsx` is the one page with existing filter controls; move them into the strip. Replace

```tsx
      <div className="filter-row">
```
…`</div>` …
```tsx
        <div className="table-wrap glass">
```

with

```tsx
        <TablePanel toolbar={<>{/* the exact contents of the old .filter-row */}</>}>
```

Status cells, in full. In `DevicesTab.tsx` (both the editing row and the display row) and `AdminDevicesTab.tsx` (both rows), replace

```tsx
                      <span className={`online-badge ${d.online ? 'online' : 'offline'}`}>
                        <span className="dot" />
                        {d.online ? 'Onlayn' : 'Oflayn'}
                      </span>
```

with

```tsx
                      <StatusDot tone={d.online ? 'ok' : 'idle'} label={d.online ? 'Onlayn' : 'Oflayn'} />
```

and add `import { StatusDot } from '../ui/StatusDot';`.

In `StaffTab.tsx`, replace

```tsx
                      <span className="role-pill">{s.role}</span>
```

with

```tsx
                      {s.role === 'admin' ? 'Admin' : 'Hamshira'}
```

In `ContactRequestsTab.tsx`, replace

```tsx
                    <span className={`sub-pill ${r.handled ? 'handled' : 'unhandled'}`}>
```
…and its closing `</span>`… with

```tsx
                    <StatusDot tone={r.handled ? 'ok' : 'attn'} label={r.handled ? 'Koʻrildi' : 'Yangi'} />
```

deleting the old label children, and add `import { StatusDot } from '../ui/StatusDot';`.

In `AdminPlansTab.tsx`, replace

```tsx
                    <span className={`sub-pill ${p.is_active ? 'active' : 'suspended'}`}>
```
…and its closing `</span>`… with

```tsx
                    <StatusDot tone={p.is_active ? 'ok' : 'idle'} label={p.is_active ? 'Faol' : 'Nofaol'} />
```

Leave `BillingTab.tsx:193` and `AdminClinicsTab.tsx:704,715` alone: those are `.sub-pill` **subscription** states, a settled owner decision (deviation 6).

Device IDs and EV1527 codes. In `DevicesTab.tsx` and `AdminDevicesTab.tsx`, replace each `{d.device_id}` inside a `<td data-label="device_id">` with `<MonoId value={d.device_id} />`; in `UnassignedTab.tsx`, replace `{signal.ev1527_code}` and `{binding.ev1527_code}` inside their `<td data-label="Kod">` cells with `<MonoId value={signal.ev1527_code} />` / `<MonoId value={binding.ev1527_code} />`. Add `import { MonoId } from '../ui/MonoId';` to each of the three files.

Page headers. In each page, replace the `<div className="section-head"><h2>…</h2></div>` block with the shared header. The eleven exact replacements:

```tsx
// RoomsTab.tsx
<PageHeader title="Xonalar" description="Xonalar va ularning qavatlari" />
// StaffTab.tsx
<PageHeader title="Xodimlar" description="Hamshiralar, adminlar va ular mas'ul qavatlar" />
// DevicesTab.tsx  (keeps the segmented control from Task 8 as its action)
<PageHeader
  title="Qurilmalar"
  description="Qurilmalar va ularning oxirgi signali"
  action={<DeviceScopeTabs scope={scope} onScope={setScope} unassignedCount={signals.length} />}
/>
// UnassignedTab.tsx — no header: it renders INSIDE Qurilmalar (Task 8)
// BillingTab.tsx — all THREE top-level returns (loading/error/loaded) are full page
// renders, so all three get this identical header, not just the first:
<PageHeader title="Obuna" description="Klinika obunasi, to'lovlar va muddat" />
// AdminOverviewTab.tsx
<PageHeader title="Umumiy" description="Barcha klinikalar bo'yicha qisqa ko'rsatkichlar" />
// AdminClinicsTab.tsx
<PageHeader title="Klinikalar" description="Klinikalar, adminlari va obuna holati" />
// AdminPlansTab.tsx
<PageHeader title="Tariflar" description="Tarif rejalari va ularning narxlari" />
// AdminDevicesTab.tsx
<PageHeader title="Qurilmalar" description="Barcha klinikalar qurilmalari va oxirgi signali" />
// ContactRequestsTab.tsx
<PageHeader title="So'rovlar" description="Saytdan kelgan bepul konsultatsiya so'rovlari" />
// CallsTab.tsx — no PageHeader: /calls already has its own alert-register head (§6.1)
```

adding `import { PageHeader } from '../ui/PageHeader';` to each. For pages whose `section-head` also carried a control (`AdminDevicesTab`, `AdminPlansTab`), move that control into `action={…}`.

**`BillingTab.tsx`'s three `section-head`s are NOT three sections on one page — they are three alternative top-level returns** (loading / error / loaded), each a full render of the page. Each one gets its own `<PageHeader title="Obuna" description="Klinika obunasi, to'lovlar va muddat" />`: a "first one wins" rule would leave the loading and error states with no page title at all. `UnassignedTab` (rendered only inside Devices, per Task 8, and already in `NO_PAGE_HEADER`) has two `section-head`s that ARE two sections on one page — the bound-devices list and the unassigned-signals list — and its extra one becomes `subsection-head`:

```tsx
      <div className="subsection-head">
```

with one rule added to `web-dashboard/src/styles/style.css` (and the old `.section-head` rules deleted, since no file uses that class any more):

```css
/* An in-page section title — Obuna's payment history, Qurilmalar's bound buttons.
   It is deliberately smaller than PageHeader: a page has exactly one page header. */
.subsection-head {
  display: flex; align-items: baseline; gap: var(--space-12);
  margin: var(--space-32) 0 var(--space-16);
}
.subsection-head h2, .subsection-head h3 {
  margin: 0;
  font-size: var(--type-mgmt-card-title-size);
  line-height: var(--type-mgmt-card-title-lh);
  font-weight: var(--type-mgmt-card-title-weight);
  letter-spacing: var(--type-mgmt-card-title-tracking);
  color: var(--color-text1);
}
```

Finally, delete the old global table rules from `web-dashboard/src/styles/style.css` — the whole `/* ==== TABLES ==== */` section from `.table-wrap {` through `.role-pill { … }` inclusive — and retarget the mobile card conversion at the new container. In the `@media (max-width: 640px)` block, replace every `.table-wrap` selector with `.table-panel`, and every `.table-wrap table` with `.table-panel table`, keeping the rules themselves byte-for-byte otherwise. Restyle the card per §6.4's mobile paragraph:

```css
  .table-panel { overflow-x: visible; border: none; border-radius: 0; background: transparent; }
  .table-panel__scroll { overflow-x: visible; }
  .table-panel table, .pay-history { display: block; }
  .table-panel thead, .pay-history thead { display: none; }
  .table-panel tbody, .pay-history tbody { display: block; }
  .table-panel tr, .pay-history tr {
    display: block;
    background: var(--color-surface);
    border: var(--border-hairline) solid var(--color-border);
    border-radius: var(--radius-3);
    box-shadow: none;
    padding: var(--space-16);
    margin-bottom: var(--space-12);
  }
  .table-panel td::before, .pay-history td::before {
    content: attr(data-label);
    flex: 0 0 auto;
    font-family: var(--font-sans);
    font-size: var(--type-mgmt-meta-size);
    font-weight: var(--type-mgmt-meta-weight);
    text-transform: none;
    letter-spacing: 0;
    color: var(--color-text3);
    text-align: left;
  }
```

keeping the remaining `.table-panel td { display: flex; … }` rules from the existing block.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/baxrom/ish_full/soat-design/web-dashboard && npx tsc -b && npm test && cd .. && node tools/generate-tokens.mjs --check`
Expected: the `migration` and `dataLabel` suites pass, no TypeScript errors, `--check` exits 0.

- [ ] **Step 5: Screenshot verification — nine pages, two widths**

A unit test cannot see a broken column or a wrapped Uzbek header. Run `npm run dev` and screenshot, at 1440px **and** at 380px: Xonalar, Qurilmalar (both segments), Xodimlar, Obuna, and all five `/admin` pages. Confirm on every one: no card around the table; the header row is sentence case; no zebra; rows are 44px; "Oxirgi signal vaqti" does not wrap; device IDs are mono, middle-truncated, and show the full value on hover; status is a dot plus a word with **nothing red anywhere**; at 380px each row is a card with a visible label above each value and no horizontal page scroll.

- [ ] **Step 6: Commit**

```bash
git add web-dashboard/src
git commit -m "Tables: migrate all nine management pages onto TablePanel/StatusDot/MonoId/PageHeader; delete the card wrapper and the uppercase mono headers"
```

---

### Task 11: The desk history table (§6.1)

Plan 1 deliberately left the history section alone. It now becomes a §6.4 table with the columns §6.1 names — Xona / Qavat / Kelgan / Javob berildi / Kim / Kutish — and **no red anywhere, including a missed call.** Red means *right now*; diluting it into a log is how it stops working.

**Files:**
- Modify: `web-dashboard/src/lib/ageStep.ts`
- Modify: `web-dashboard/src/lib/ageStep.test.ts`
- Modify: `web-dashboard/src/components/tabs/CallsTab.tsx`
- Modify: `web-dashboard/src/styles/style.css` (`.hist-*` heads)
- Test: `web-dashboard/src/components/tabs/CallsTab.test.tsx`

**Interfaces:**
- Consumes: `TablePanel`, `StatusDot` from Task 9; `elapsedLabel` from `lib/ageStep.ts`.
- Produces: `export function durationLabel(fromIso: string, toIso: string): string` — the same `m:ss` / `h:mm:ss` clock as `elapsedLabel`, between two instants; `'—'` is the caller's business, not this function's.

- [ ] **Step 1: Write the failing tests**

Append to `web-dashboard/src/lib/ageStep.test.ts`:

```ts
import { durationLabel } from './ageStep';

describe('durationLabel', () => {
  const at = (s: number) => new Date(Date.UTC(2026, 0, 1, 12, 0, 0) + s * 1000).toISOString();

  it('formats a short wait as m:ss', () => {
    expect(durationLabel(at(0), at(107))).toBe('1:47');
  });

  it('switches to h:mm:ss at an hour, never to a word form', () => {
    expect(durationLabel(at(0), at(3725))).toBe('1:02:05');
  });

  it('clamps a clock-skewed pair to zero rather than printing a negative', () => {
    expect(durationLabel(at(50), at(0))).toBe('0:00');
  });
});
```

Create `web-dashboard/src/components/tabs/CallsTab.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CallsTab } from './CallsTab';
import type { HistoryCall } from '../../api/types';

const history: HistoryCall[] = [
  {
    call_id: 1,
    room_number: '214',
    floor: 2,
    status: 'acknowledged',
    created_at: '2026-01-01T12:00:00.000Z',
    acknowledged_at: '2026-01-01T12:01:47.000Z',
    acknowledged_by: 'Aziza',
  },
  {
    call_id: 2,
    room_number: '108',
    floor: 1,
    status: 'active',
    created_at: '2026-01-01T11:00:00.000Z',
    acknowledged_at: null,
    acknowledged_by: null,
  },
];

function renderTab() {
  return render(
    <CallsTab
      activeCalls={new Map()}
      history={history}
      ackCall={vi.fn()}
      connStatus="live"
    />
  );
}

describe('CallsTab history (§6.1)', () => {
  it('uses the six columns the spec names', () => {
    const { container } = renderTab();
    const heads = [...container.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(heads).toEqual(['Xona', 'Qavat', 'Kelgan', 'Javob berildi', 'Kim', 'Kutish']);
  });

  it('marks an answered call with a filled ok dot and an expired one with a hollow ring', () => {
    const { container } = renderTab();
    expect(container.querySelectorAll('.status__dot--ok').length).toBe(1);
    expect(container.querySelectorAll('.status__dot--idle').length).toBe(1);
  });

  it('shows the wait as a tabular clock', () => {
    renderTab();
    expect(screen.getByText('1:47')).toBeTruthy();
  });

  it('there is NO red in this table, ever, including a missed call', () => {
    const { container } = renderTab();
    expect(container.innerHTML).not.toMatch(/--call-|call-fill|status-pill/);
  });

  it('every history cell carries a data-label', () => {
    const { container } = renderTab();
    const cells = [...container.querySelectorAll('tbody td')];
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((td) => td.hasAttribute('data-label'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/baxrom/ish_full/soat-design/web-dashboard && npm test`
Expected: FAIL — `durationLabel` is not exported (`ageStep.test.ts`), and `CallsTab` still renders the old five-column table with `status-pill` (`heads` come back as `['Xona','Qavat','Holat','Yaratildi','Javob berildi','Kim']`).

- [ ] **Step 3: Write minimal implementation**

In `web-dashboard/src/lib/ageStep.ts`, extract the clock and add the new export:

```ts
function clock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

/** m:ss up to 59:59, then h:mm:ss. Never a word form: the wall shows several timers
 *  side by side and tabular figures buy nothing if one of them reads "12 daq". */
export function elapsedLabel(createdAtIso: string, now?: Date): string {
  return clock(elapsedSec(createdAtIso, now));
}

/** The same clock between two instants — the history table's "Kutish" column. */
export function durationLabel(fromIso: string, toIso: string): string {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return clock(Number.isFinite(ms) ? ms / 1000 : 0);
}
```

Replace the history half of `web-dashboard/src/components/tabs/CallsTab.tsx`:

```tsx
import { useState } from 'react';
import type { ActiveCall, HistoryCall } from '../../api/types';
import type { ConnStatus } from '../../hooks/useCallsFeed';
import { CallsLive } from '../calls/CallsLive';
import { durationLabel } from '../../lib/ageStep';
import { TablePanel } from '../ui/TablePanel';
import { StatusDot } from '../ui/StatusDot';

interface CallsTabProps {
  activeCalls: Map<number, ActiveCall>;
  history: HistoryCall[];
  ackCall: (callId: number) => Promise<void>;
  connStatus: ConnStatus;
  /** Call HISTORY is a management route and answers 402 for a blocked clinic — the
   *  live board above it is ungated and keeps working. */
  historyBlocked?: boolean;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function CallsTab({ activeCalls, history, ackCall, connStatus, historyBlocked = false }: CallsTabProps) {
  const [ackError, setAckError] = useState('');

  async function handleAck(callId: number) {
    setAckError('');
    try {
      await ackCall(callId);
    } catch (err) {
      setAckError(err instanceof Error ? err.message : 'Xato');
      // rethrow so CallCard knows the ack failed and re-enables its button
      throw err;
    }
  }

  return (
    <section className="tab-panel">
      {ackError && <p className="auth-error">{ackError}</p>}
      <CallsLive calls={[...activeCalls.values()]} onAck={handleAck} connStatus={connStatus} />

      {/* §6.1: history sits space.32 below a full-bleed hairline rule, in the MANAGEMENT
          register. There is no red in this table, ever, including a missed call. */}
      <div className="hist-head">
        <h2 className="hist-title">Bugungi tarix</h2>
        <span className="hist-meta">Oxirgi 50 ta</span>
      </div>
      {historyBlocked ? (
        <p className="empty-msg">
          Obuna to'lanmagani uchun tarix vaqtincha yopilgan. Yuqoridagi faol chaqiruvlar
          paneli ishlashda davom etadi.
        </p>
      ) : (
        <TablePanel>
          <table>
            <thead>
              <tr>
                <th>Xona</th>
                <th>Qavat</th>
                <th>Kelgan</th>
                <th>Javob berildi</th>
                <th>Kim</th>
                <th>Kutish</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.call_id}>
                  <td data-label="Xona">{item.room_number}</td>
                  <td data-label="Qavat">{item.floor}-qavat</td>
                  <td data-label="Kelgan">{fmtTime(item.created_at)}</td>
                  <td data-label="Javob berildi">
                    {item.acknowledged_at ? (
                      <StatusDot tone="ok" label={fmtTime(item.acknowledged_at)} />
                    ) : (
                      <StatusDot tone="idle" label="Javob berilmagan" />
                    )}
                  </td>
                  <td data-label="Kim">{item.acknowledged_by || '—'}</td>
                  <td data-label="Kutish" className="num">
                    {item.acknowledged_at ? durationLabel(item.created_at, item.acknowledged_at) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablePanel>
      )}
    </section>
  );
}
```

In `web-dashboard/src/styles/style.css`, replace the `.section-head h2, .hist-title` rule's `.hist-title` half with the §6.1 head:

```css
/* §6.1: card-title + meta, space.32 below the live region, over a full-bleed rule. */
.hist-head {
  display: flex; align-items: baseline; gap: var(--space-12);
  margin-top: var(--space-32);
  padding-top: var(--space-24);
  border-top: var(--border-hairline) solid var(--color-border);
  margin-bottom: var(--space-16);
}
.hist-title {
  margin: 0;
  font-size: var(--type-mgmt-card-title-size);
  line-height: var(--type-mgmt-card-title-lh);
  font-weight: var(--type-mgmt-card-title-weight);
  letter-spacing: var(--type-mgmt-card-title-tracking);
  color: var(--color-text1);
}
.hist-meta {
  font-size: var(--type-mgmt-meta-size);
  line-height: var(--type-mgmt-meta-lh);
  font-weight: var(--type-mgmt-meta-weight);
  color: var(--color-text3);
}
```

and delete `.hist-title` from the `.section-head h2, .hist-title { … }` selector list plus the standalone `.hist-title { margin: 40px 0 14px; }` rule.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/baxrom/ish_full/soat-design/web-dashboard && npx tsc -b && npm test`
Expected: `CallsTab` and `durationLabel` suites green; `dataLabel` and `migration` suites still green.

- [ ] **Step 5: Screenshot verification — the seam between the two registers is the design idea**

Run `npm run dev` with at least one active call and some history. Screenshot `/app` in **both** themes. Confirm: the red card above is the only saturated object on screen; the history table below is entirely neutral — the unanswered row is a hollow grey ring and the word "Javob berilmagan", not red, not amber; the "Kutish" column is right-aligned and tabular so the waits compare down the column; and the hairline rule between the two zones reads as a deliberate seam rather than a gap.

- [ ] **Step 6: Commit**

```bash
git add web-dashboard/src/lib/ageStep.ts web-dashboard/src/lib/ageStep.test.ts \
        web-dashboard/src/components/tabs/CallsTab.tsx web-dashboard/src/components/tabs/CallsTab.test.tsx \
        web-dashboard/src/styles/style.css
git commit -m "Calls: rebuild the desk history on the §6.1 columns with a wait clock and no red anywhere"
```

---

### Task 12: Forms, modals, stat tiles, gutters and the last shadows (§6.4, §4.2, §4.5)

The tail of the management register: 1.5px field outlines that legally exist under WCAG 1.4.11 (today's measure ~1.7:1), labels above fields, one focus ring, `shadow.none` on every card, `shadow.pop` on modals only, stat tiles that look like data, and one gutter for the whole app shell.

**Files:**
- Modify: `web-dashboard/src/styles/style.css`
- Test: `tools/lint-css.test.mjs` (already covers rules 9/10); `web-dashboard/src/styles/register.test.ts` (new)

**Interfaces:**
- Consumes: the token names emitted by Task 2.
- Produces: nothing importable.

- [ ] **Step 1: Write the failing test**

Create `web-dashboard/src/styles/register.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const style = readFileSync(fileURLToPath(new URL('./style.css', import.meta.url)), 'utf8');

describe('management register (§6.4, §4.5)', () => {
  it('inputs carry the 1.5px border-field outline, not a 1px hairline', () => {
    expect(style).toMatch(/input, select, textarea, \.table-input \{[\s\S]*?border: var\(--border-field\) solid var\(--color-border-field\)/);
  });

  it('focus is a 2px accent ring at 2px offset — never a glow, never a shadow', () => {
    expect(style).toMatch(/:focus-visible \{[\s\S]*?outline: var\(--border-focus\) solid var\(--color-accent\)[\s\S]*?outline-offset: var\(--border-focus-offset\)/);
    expect(style).not.toMatch(/box-shadow: 0 0 0 3px var\(--color-accent-soft\)/);
  });

  it('only modals and dropdowns float: no other rule uses --shadow-pop', () => {
    const users = [...style.matchAll(/([^{}]+)\{[^{}]*--shadow-pop[^{}]*\}/g)].map((m) => m[1].trim());
    for (const sel of users) {
      expect(sel).toMatch(/modal|menu|dropdown|sidebar\.mobile-open/);
    }
  });

  it('the app shell uses exactly one gutter family', () => {
    const families = new Set(
      [...style.matchAll(/var\(\s*(--gutter-[a-z-]+)/g)].map((m) => m[1].replace(/^--gutter-/, '').replace(/-narrow$/, ''))
    );
    expect([...families]).toEqual(['app']);
  });

  it('the last two untokenised glows are gone: no pulsing dot, no coloured stat value', () => {
    // §4.5 "never a glow, never a shadow"; §6.3 "no avatar image, no pulsing dot";
    // §6.4 "no coloured card data — six tiles that all look like data".
    expect(style).not.toMatch(/@keyframes\s+pairing-pulse\b/);
    expect(style).not.toMatch(/animation:\s*pairing-pulse/);
    expect(style).not.toMatch(/\.stat-value\.stat-ok/);
    expect(style).not.toMatch(/\.stat-value\.stat-warn/);
  });

  it('destructive confirm is amber, and no rule in the dashboard is red', () => {
    expect(style).toMatch(/\.btn-danger \{[\s\S]*?--color-attn/);
    // No call token, and no raw hex at all: every colour in this file comes from a token.
    expect(style).not.toMatch(/--call-/);
    const hexLiterals = [...style.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(hexLiterals).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design/web-dashboard && npm test`
Expected: FAIL on the first four assertions — inputs still use `1px solid var(--color-border)`, focus is `2.5px … outline-offset: 3px` plus an `accent-soft` glow, `.glass`/`.panel-card` still carry `--shadow-pop`, and the shell still uses hard-coded `24px 28px` — plus the new glow assertion (`.pairing-dot`'s `pairing-pulse` animation and box-shadow are still present) and the stat-value colour assertion (`.stat-value.stat-ok`/`.stat-value.stat-warn` still set `color`).

- [ ] **Step 3: Write minimal implementation**

In `web-dashboard/src/styles/style.css`:

```css
/* One focus treatment in the whole product: 2px accent ring at 2px offset (§4.5). */
:focus-visible {
  outline: var(--border-focus) solid var(--color-accent);
  outline-offset: var(--border-focus-offset);
  border-radius: var(--radius-1);
}
```

```css
/* §4.2: gutter.app is the only horizontal number in the app shell. */
.wrap, .content-area {
  max-width: var(--size-content-max);
  margin: 0 auto;
  padding: var(--space-32) var(--gutter-app) var(--space-64);
}
```

and in the `@media (max-width: 640px)` block replace `.wrap, .content-area { padding: 18px 14px 40px; }` with:

```css
  .wrap, .content-area { padding: var(--space-24) var(--gutter-app-narrow) var(--space-40); }
```

```css
/* §6.4 forms: label above the field, never a placeholder-as-label — a gloved thumb
   starting to type erases the only hint. 1.5px because 1px vanishes under corridor
   glare, and today's ~1.7:1 outline legally does not exist under WCAG 1.4.11. */
input, select, textarea, .table-input {
  min-height: var(--control-36);
  padding: 0 var(--space-12);
  border-radius: var(--radius-2);
  border: var(--border-field) solid var(--color-border-field);
  background: var(--color-surface);
  color: var(--color-text1);
  font-family: var(--font-sans);
  font-size: var(--type-mgmt-body-size);
  line-height: var(--type-mgmt-body-lh);
  transition: border-color var(--motion-fast) var(--motion-ease);
}
input:focus, select:focus, textarea:focus, .table-input:focus {
  outline: var(--border-focus) solid var(--color-accent);
  outline-offset: var(--border-focus-offset);
  border-color: var(--color-accent);
}
input::placeholder, textarea::placeholder { color: var(--color-text3); }
.field-label {
  display: block;
  margin-bottom: var(--space-4);
  font-size: var(--type-mgmt-dense-size);
  line-height: var(--type-mgmt-dense-lh);
  font-weight: 600;
  color: var(--color-text1);
}
```

```css
/* §4.5: shadow.none is the value for every card, table and panel. */
.glass, .panel-card, .stat-card { box-shadow: none; }
.glass, .panel-card {
  background: var(--color-surface);
  border: var(--border-hairline) solid var(--color-border);
  border-radius: var(--radius-3);
}
```

```css
/* §6.4 modals: radius.3, space.32, shadow.pop, max-width 480. The only floating things. */
.modal {
  border-radius: var(--radius-3);
  padding: var(--space-32);
  max-width: 480px;
  box-shadow: var(--shadow-pop);
}
.modal-close { min-width: var(--control-48); min-height: var(--control-48); }
```

```css
/* §6.4 stat tiles: six tiles that all look like data beat four wearing costumes. */
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: var(--space-16); }
.stat-card {
  background: var(--color-surface);
  border: var(--border-hairline) solid var(--color-border);
  border-radius: var(--radius-3);
  padding: var(--space-20);
}
.stat-card .stat-label {
  font-size: var(--type-mgmt-eyebrow-size);
  line-height: var(--type-mgmt-eyebrow-lh);
  font-weight: var(--type-mgmt-eyebrow-weight);
  letter-spacing: var(--type-mgmt-eyebrow-tracking);
  text-transform: uppercase;
  color: var(--color-text3);
}
.stat-card .stat-value {
  font-size: var(--type-mgmt-stat-size);
  line-height: var(--type-mgmt-stat-lh);
  font-weight: var(--type-mgmt-stat-weight);
  letter-spacing: var(--type-mgmt-stat-tracking);
  font-variant-numeric: tabular-nums;
  color: var(--color-text1);
}
```

```css
/* §2.3: destructive is amber, not red. Ink is `surface`, which is white on the light
   amber and near-black on the dark amber — the spec names no attn-ink token. */
.btn-danger { color: var(--color-attn); border-color: var(--color-attn); background: transparent; }
.btn-danger:hover { background: var(--color-attn); color: var(--color-surface); }
```

Delete the `box-shadow: var(--shadow-pop);` declarations from `.glass` and `.panel-card` (both are fully superseded by the `.glass, .panel-card, .stat-card { box-shadow: none; }` rule above) — keep it on `.sidebar.mobile-open` (a drawer genuinely floats) and on `.modal`. Note: `.table-input:focus` and `.stat-card` never declared `--shadow-pop` in the shipped file (`.table-input:focus` carried a `0 0 0 3px var(--color-accent-soft)` glow, already replaced above by the `outline`-based focus ring; `.stat-card` had no `box-shadow` at all) — nothing further to delete on either.

Also delete the last two untokenised glow/pulse leftovers that §4.5 ("never a glow, never a shadow") and §6.3 ("no avatar image, no pulsing dot") rule out, and the two colour modifiers on stat tiles that §6.4 rules out ("no coloured card data — six tiles that all look like data"):

```css
/* Delete entirely: */
.pairing-dot { /* ... box-shadow: 0 0 0 3px color-mix(...); animation: pairing-pulse 1.6s infinite; ... */ }
@keyframes pairing-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
```

Keep `.pairing-dot`'s layout properties (size, border-radius, background colour) if any other rule still needs the class name; delete only the `box-shadow` and `animation` declarations and the `@keyframes pairing-pulse` block. In the reduced-motion media query, delete the now-dead `.pairing-dot` reference (`.call-card.age-2, .call-card.age-3, .pairing-dot { animation: none; }` — Task 1 already deleted the `.call-card.age-*` half of this selector; delete the rule entirely once `.pairing-dot` no longer animates).

```css
/* Delete: */
.stat-card .stat-value.stat-ok { color: var(--color-ok); }
.stat-card .stat-value.stat-warn { color: var(--color-attn); }
```

`.stat-card .stat-value` (the tokenised rule added above) is the only rule a stat value needs; a coloured stat number is exactly the "four tiles wearing costumes" problem §6.4 names.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/baxrom/ish_full/soat-design/web-dashboard && npm test && cd .. && node tools/generate-tokens.mjs --check && node --test tools/*.test.mjs`
Expected: `register` suite green, every other suite green, `--check` exits 0, rules 9 and 10 still pass.

- [ ] **Step 5: Screenshot verification — contrast is the point of this task**

Run `npm run dev` and screenshot, in **both** themes: the Xodimlar add form, one delete confirmation modal, the `/admin` overview tiles, and any field in its focused state. Confirm: field outlines are clearly visible against the surface (they are 3.17:1 / 3.53:1 by construction — if they look invisible, the token did not apply); the focus ring is a crisp 2px accent outline with a 2px gap and no glow; no card casts a shadow while the modal clearly floats; the destructive confirm is amber with a verb-plus-object label; **nothing anywhere on these screens is red.**

- [ ] **Step 6: Commit**

```bash
git add web-dashboard/src/styles/style.css web-dashboard/src/styles/register.test.ts
git commit -m "Management register: 1.5px field outlines, one focus ring, shadow.none on cards, tokenised gutters and stat tiles"
```

---

### Task 13: Landing page — onto the generated tokens (§6.7)

The page moves off its private purple/cyan palette and off Google Fonts onto the injected block from Task 6. Every external request disappears, so the page becomes genuinely self-contained. The markup keeps its existing sections; only the palette, the typeface, the band rhythm and the section heads change. Task 14 then adds the two real-component figures.

**Files:**
- Modify: `server/static/landing.html`
- Modify: `tools/lib/lint-css.mjs` (add landing.html to the scanned set)
- Test: `tools/landing.test.mjs`

**Interfaces:**
- Consumes: the variables emitted by `emitLanding` (Task 6) — `--color-*`, `--call-*`, `--space-*`, `--gutter-landing`, `--radius-*`, `--control-*`, `--border-*`, `--size-landing-max`, `--size-landing-band-max`, `--type-mgmt-*`, `--type-landing-*`, `--type-alert-*-desk-*`, `--font-sans`, `--font-mono`, `--motion-*`.
- Produces: nothing importable.

- [ ] **Step 1: Write the failing test**

Create `tools/landing.test.mjs`:

```js
// tools/landing.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TOKENS_START, TOKENS_END, COMPONENT_START, COMPONENT_END } from './lib/emit-landing.mjs';
import { fixedHeightViolations } from './lib/lint-css.mjs';

const html = readFileSync(new URL('../server/static/landing.html', import.meta.url), 'utf8');

/** Everything the generator did NOT write — the page's own CSS and markup. Both injected
 *  regions are cut out, so an assertion about "the authored CSS" never accidentally
 *  inspects the shipped callcard.css that lives inside the component region. */
function stripRegion(text, start, end) {
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  return a === -1 || b === -1 ? text : text.slice(0, a) + text.slice(b + end.length);
}
const authored = stripRegion(
  stripRegion(html, TOKENS_START, TOKENS_END),
  COMPONENT_START,
  COMPONENT_END
);

test('the page makes no external request at all', () => {
  assert.doesNotMatch(html, /https?:\/\/fonts\.(googleapis|gstatic)\.com/);
  assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"/);
  assert.doesNotMatch(html, /<link[^>]+rel="preconnect"/);
  assert.doesNotMatch(html, /<(script|img|iframe)[^>]+src="https?:/);
});

test('the deleted palette is gone', () => {
  for (const dead of [/#696cff/i, /#03c3ec/i, /--accent-2\b/, /--bg-0\b/, /--text-1\b/, /Sora/, /--font-display/]) {
    assert.doesNotMatch(authored, dead, `${dead} must be gone from the authored CSS`);
  }
});

test('the decorative ECG line is deleted — a fake heartbeat is theatre', () => {
  assert.doesNotMatch(html, /\becg\b/i);
  assert.doesNotMatch(html, /ecgPulse/);
});

test('the page is typeset in Inter and JetBrains Mono, from the generated stacks', () => {
  assert.match(authored, /font-family: var\(--font-sans\)/);
  assert.match(authored, /font-family: var\(--font-mono\)/);
});

test('the authored CSS uses generated colour tokens and no private ones', () => {
  assert.match(authored, /var\(--color-accent\)/);
  assert.match(authored, /var\(--color-surface-sunken\)/);
  const privateVars = [...authored.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]);
  const allowed = /^--(color|call|space|gutter|radius|control|border|size|type|font|motion|shadow|rail)-/;
  const strays = [...new Set(privateVars.filter((v) => !allowed.test(v)))];
  assert.deepEqual(strays, [], `landing.html still references non-generated variables: ${strays}`);
});

test('bands alternate bg / surface-sunken and are separated by a rule, not a tint', () => {
  assert.match(authored, /\.section-alt \{[^}]*background: var\(--color-surface-sunken\)/);
  assert.match(authored, /\.section \+ \.section[^{]*\{[^}]*border-top: var\(--border-hairline\) solid var\(--color-border\)/);
});

test('every section opens with the same three-part head, plus the hero kicker', () => {
  // The hero's own eyebrow pairs with the <h1>, not a <h2> — it is the +1 between the
  // two counts. Every OTHER eyebrow pairs with exactly one <h2>.
  const kickers = html.match(/class="eyebrow"/g) ?? [];
  const titles = html.match(/<h2>/g) ?? [];
  assert.ok(kickers.length >= 8, `only ${kickers.length} eyebrow kickers`);
  assert.equal(kickers.length, titles.length + 1, 'every h2 gets exactly one eyebrow kicker, plus the hero kicker (which pairs with <h1>)');
});

test('landing typography uses the three landing display styles', () => {
  assert.match(authored, /var\(--type-landing-h1-size\)/);
  assert.match(authored, /var\(--type-landing-h2-size\)/);
  assert.match(authored, /var\(--type-landing-lede-size\)/);
});

test('the hero h1 reflows instead of breaking mid-clause', () => {
  assert.doesNotMatch(html, /<h1>[^<]*<br\s*\/?>/);
  assert.match(authored, /\.hero h1[^{]*\{[^}]*max-width: 22ch/);
});

test('rules 9/10 scan landing.html only inside its <style> block, never its <script>', () => {
  // The inline <script> has its own `{ }` braces (the contact-form handler, the theme
  // toggle). Scanning the whole document with the CSS block regex would parse a JS
  // object literal like `{ height: 40 }` as a fixed-height CSS declaration. This is a
  // regression guard on the real, now-scanned landing.html — not a synthetic fixture —
  // because landing.html only joins SCANNED_CSS in THIS task.
  const violations = fixedHeightViolations(fileURLToPath(new URL('../', import.meta.url)));
  const fromScript = violations.filter((v) => v.file === 'server/static/landing.html');
  assert.deepEqual(fromScript, [], `script-derived false positive(s): ${JSON.stringify(fromScript)}`);
});

test('the contact form still posts exactly what the API expects', () => {
  assert.match(html, /fetch\('\/api\/v1\/contact-requests'/);
  for (const field of ['cf-name', 'cf-phone', 'cf-clinic', 'cf-message', 'cf-submit', 'contactForm', 'formCard']) {
    assert.ok(html.includes(`id="${field}"`) || html.includes(`getElementById('${field}')`), `${field} was lost`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design && node --test tools/landing.test.mjs`
Expected: FAIL on `the page makes no external request at all` (the three Google Fonts `<link>`s), `the deleted palette is gone` (`#696cff`), `the decorative ECG line is deleted`, and the token assertions.

- [ ] **Step 3: Write the implementation**

In `server/static/landing.html`:

1. Delete the three font `<link>` tags in `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

2. Delete both legacy `:root { … }` and `:root[data-theme="dark"] { … }` blocks entirely (the whole `/* ==== THEME TOKENS ==== */` section down to the `/* ==== BASE ==== */` comment), leaving the generated marker regions from Task 6 as the only source of variables.

3. Replace the base, wrap, card, eyebrow and section rules:

```css
  /* ================= BASE ================= */
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0;
    background: var(--color-bg);
    color: var(--color-text1);
    font-family: var(--font-sans);
    font-size: var(--type-mgmt-body-lg-size);
    line-height: var(--type-mgmt-body-lg-lh);
    -webkit-font-smoothing: antialiased;
  }
  h1, h2, h3 { font-family: var(--font-sans); margin: 0; }
  p { margin: 0; }
  a { color: inherit; text-decoration: none; }
  img, svg { display: block; }
  :focus-visible {
    outline: var(--border-focus) solid var(--color-accent);
    outline-offset: var(--border-focus-offset);
  }

  /* §6.7: content max-width 1120, full-bleed bands 1280, gutter.landing 24 — the ONE
     horizontal number on this page. */
  .wrap { width: 100%; max-width: var(--size-landing-max); margin: 0 auto; padding: 0 var(--gutter-landing); }

  /* Same tokens as the dashboard; three levers loosen and nothing else: padding, radius
     and the three landing-only display styles. No gradient, no glass, no mesh. */
  .card {
    background: var(--color-surface);
    border: var(--border-hairline) solid var(--color-border);
    border-radius: var(--radius-4);
    box-shadow: none;
  }

  .eyebrow {
    font-size: var(--type-mgmt-eyebrow-size);
    line-height: var(--type-mgmt-eyebrow-lh);
    font-weight: var(--type-mgmt-eyebrow-weight);
    letter-spacing: var(--type-mgmt-eyebrow-tracking);
    text-transform: uppercase;
    color: var(--color-accent);
    margin-bottom: var(--space-12);
  }

  /* Rhythm: full-bleed bands separated by a 1px rule at the top edge, never by a tinted
     "section-alt" that floats. */
  .section { padding: var(--space-112) 0; }
  .section + .section { border-top: var(--border-hairline) solid var(--color-border); }
  .section-alt { background: var(--color-surface-sunken); }
  .section h2 {
    font-size: var(--type-landing-h2-size);
    line-height: var(--type-landing-h2-lh);
    font-weight: var(--type-landing-h2-weight);
    letter-spacing: var(--type-landing-h2-tracking);
    margin-bottom: var(--space-12);
  }
  .section-lede {
    font-size: var(--type-landing-lede-size);
    line-height: var(--type-landing-lede-lh);
    font-weight: var(--type-landing-lede-weight);
    color: var(--color-text2);
    max-width: var(--size-prose-max);
  }
  .section-head { margin-bottom: var(--space-48); }
```

4. Replace the button, icon-button and field rules with the dashboard's control values loosened only in padding:

```css
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: var(--space-8);
    min-height: var(--control-36); padding: 0 var(--space-20);
    border-radius: var(--radius-2);
    border: var(--border-hairline) solid transparent;
    font-family: var(--font-sans);
    font-size: var(--type-mgmt-body-size); font-weight: 500;
    cursor: pointer; white-space: nowrap;
    transition: background-color var(--motion-fast) var(--motion-ease), color var(--motion-fast) var(--motion-ease), border-color var(--motion-fast) var(--motion-ease);
  }
  .btn-primary { background: var(--color-accent); color: var(--color-accent-ink); }
  .btn-primary:hover { background: var(--color-accent-hover); }
  .btn-ghost { background: var(--color-accent-soft); color: var(--color-accent); }
  .btn-ghost:hover { background: var(--color-accent); color: var(--color-accent-ink); }
  .btn-outline { background: transparent; color: var(--color-text1); border: var(--border-field) solid var(--color-border-field); }
  .btn-outline:hover { border-color: var(--color-accent); color: var(--color-accent); }
  .btn-sm { min-height: var(--control-32); padding: 0 var(--space-12); font-size: var(--type-mgmt-dense-size); }
  .btn-lg { min-height: var(--control-48); padding: 0 var(--space-24); }

  .icon-btn {
    width: var(--control-36); min-height: var(--control-36);
    display: grid; place-items: center;
    border-radius: var(--radius-2);
    border: var(--border-field) solid var(--color-border-field);
    background: transparent; color: var(--color-text2);
    cursor: pointer;
  }
  .icon-btn:hover { background: var(--color-accent-soft); color: var(--color-accent); border-color: transparent; }
  .icon-btn svg { width: 18px; height: 18px; }

  /* §6.4 forms, identical to the dashboard's: label above, 1.5px border-field. */
  .field { margin-bottom: var(--space-16); }
  .field label {
    display: block; margin-bottom: var(--space-4);
    font-size: var(--type-mgmt-dense-size); font-weight: 600; color: var(--color-text1);
  }
  .field input, .field textarea {
    width: 100%; padding: 0 var(--space-12); min-height: var(--control-48);
    border-radius: var(--radius-2);
    border: var(--border-field) solid var(--color-border-field);
    background: var(--color-surface); color: var(--color-text1);
    font-family: var(--font-sans); font-size: var(--type-mgmt-body-lg-size);
  }
  .field textarea { min-height: 96px; padding: var(--space-12); resize: vertical; }
  .field input:focus, .field textarea:focus {
    outline: var(--border-focus) solid var(--color-accent);
    outline-offset: var(--border-focus-offset);
    border-color: var(--color-accent);
  }
  .form-msg { margin-top: var(--space-12); font-size: var(--type-mgmt-body-size); }
  .form-msg.err { color: var(--color-attn); }
```

5. Replace the brand mark (§4.3, the one square icon tile, identical to the dashboard's):

```css
  .brand { display: flex; align-items: center; gap: var(--space-12); font-family: var(--font-sans); font-weight: 700; font-size: var(--type-mgmt-card-title-size); }
  .brand-mark {
    width: var(--size-tile-brand); height: var(--size-tile-brand);
    border-radius: var(--radius-2);
    background: var(--color-accent);
    display: grid; place-items: center; flex: 0 0 auto;
  }
  .brand-mark svg { width: var(--size-icon); height: var(--size-icon); color: var(--color-accent-ink); }
```

6. Hero type, and remove the hard `<br>` from the `<h1>`:

```css
  .hero { padding: var(--space-112) 0 var(--space-80); }
  .hero-grid { display: grid; grid-template-columns: 7fr 5fr; gap: var(--space-48); align-items: center; }
  .hero h1 {
    font-size: var(--type-landing-h1-size);
    line-height: var(--type-landing-h1-lh);
    font-weight: var(--type-landing-h1-weight);
    letter-spacing: var(--type-landing-h1-tracking);
    max-width: 22ch;
  }
  /* ONE word in accent — not italic, not a gradient. */
  .hero h1 em { font-style: normal; color: var(--color-accent); }
  .hero-lede {
    color: var(--color-text2); margin-top: var(--space-20);
    font-size: var(--type-landing-lede-size); line-height: var(--type-landing-lede-lh);
    max-width: var(--size-prose-max);
  }
  .hero-cta { display: flex; flex-wrap: wrap; gap: var(--space-12); margin-top: var(--space-32); }
```

```html
      <h1>Bemor bir marta bosadi. Hamshira <em>soniyalarda</em> biladi.</h1>
```

7. Delete the ECG entirely: the `.ecg` and `@keyframes ecgPulse` rules, the `<svg class="ecg">…</svg>` element in the hero mock, and the `.ecg path` clause in the reduced-motion block (which becomes `.room-cell.alert { animation: none; opacity: 1; }` — and Task 14 deletes `.room-cell` too).

8. Mechanically repoint every remaining rule's `var(--old)` to its generated equivalent: `--bg-0`→`--color-bg`, `--bg-1`/`--surface`/`--surface-strong`→`--color-surface`, `--bg-2`→`--color-surface-sunken`, `--surface-soft`→`--color-surface-soft`, `--border`→`--color-border`, `--border-strong`→`--color-border-strong`, `--text-1/2/3`→`--color-text1/2/3`, `--accent`→`--color-accent`, `--accent-hover`→`--color-accent-hover`, `--accent-ink`→`--color-accent-ink`, `--accent-soft`→`--color-accent-soft`, `--warn`/`--caution`→`--color-attn`, `--warn-soft`/`--caution-soft`→`--color-attn-soft`, `--ok`→`--color-ok`, `--ok-soft`→ a `--color-ok` border instead of a tinted fill, `--radius-sm/md/lg`→`--radius-1/2/4`, `--shadow-sm/md/lg`→ delete the declaration. The last test in Step 1 fails until every one is repointed, and names the strays.

9. In `tools/lib/lint-css.mjs`, add the landing page to the scanned set so rules 9 and 10 cover it:

```js
export const SCANNED_CSS = [
  'web-dashboard/src/styles/style.css',
  'web-dashboard/src/components/calls/callcard.css',
  'web-dashboard/src/components/ui/table.css',
  'web-dashboard/src/routes/wall.css',
  'server/static/landing.html',
  // The landing hero figure DEPICTS a real call card, so spec 8 rule 3 lists it as an
  // allowed consumer -- and its test necessarily names the same tokens to assert the
  // figure renders them. Omitting the test file while allowing the page it tests would
  // fail the build on the one file proving the rule is honoured.
  'web-dashboard/src/components/calls/landingFigure.test.tsx',
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd /Users/baxrom/ish_full/soat-design
node tools/generate-tokens.mjs --check
node --test tools/*.test.mjs
```
Expected: every `landing` test passes; `--check` exits 0 (rule 9 sees only `--gutter-landing` in the authored CSS, rule 10 sees only `min-height`).

- [ ] **Step 5: Screenshot verification — the consistency claim is testable by eye**

`open server/static/landing.html` and, side by side, `npm run dev` on the dashboard. Screenshot both. The claim to verify, in this order:
1. **Every hex and every font-family matches.** Sample the accent, the body text and the page ground with a colour picker on each; they must be identical values.
2. **Every padding, radius and heading size is one to two steps apart** — the landing page is airier, the dashboard denser. If they look the same density, the three levers were not pulled.
3. **Nothing is red anywhere on the page yet** (the hero figure arrives in Task 14).
4. Toggle night mode on the landing page and confirm both themes are complete; toggle the OS to dark and confirm the landing page **stays light** — that behaviour is deliberate.
5. DevTools Network tab: zero requests other than the document itself.

- [ ] **Step 6: Commit**

```bash
git add server/static/landing.html tools/lib/lint-css.mjs tools/landing.test.mjs
git commit -m "Landing: move onto the generated tokens and the inlined Inter; delete the purple palette, Google Fonts and the fake ECG"
```

---

### Task 14: Landing figures — the shipped components, and the resolved tension (§6.7 3, 5, 6)

§6.7 wants the hero figure and "Ikki rejim" to render the **real** shipped components rather than mockups, but the landing page is standalone HTML with no React. The resolution, decided and recorded in deviations 1–4 above:

- **The CSS is the shipped CSS.** The generator injects `callcard.css` and `ui/table.css` verbatim into the `@component-css` region, so the figure's fills, rail geometry, radius, edge width and type sizes are the product's own stylesheet. Changing either file makes `--check` fail here.
- **Only the JSX wrapper is re-expressed as static HTML**, which is safe because the figure is static by definition — no ticking timer, no ack slab (§6.2's `if (onAck)` guarantee applies: the figure passes no ack, so it renders none).
- **A contract test pins the static markup to `CallCard.tsx`**, so a class rename in the component fails the landing page's test.
- **The card is the desk variant** (deviation 1: the wall type tokens are `targets: ["css"]` and rule 7 forbids the landing emitter from reading them).
- **The watch half is a faithful inline SVG**, not the shipped component (deviation 3), bound to `type.watch` by a test rather than by an emitter.

**Files:**
- Modify: `server/static/landing.html`
- Modify: `tools/generate-tokens.mjs` (inject two component stylesheets, not one)
- Modify: `tools/landing.test.mjs`
- Test: `web-dashboard/src/components/calls/landingFigure.test.tsx`

**Interfaces:**
- Consumes: `CallCard` and `callcard.css` as shipped by Plan 1; `table.css` from Task 9; `injectLanding` and the marker constants from Task 6.
- Produces: nothing importable.

- [ ] **Step 1: Write the failing tests**

Append to `tools/landing.test.mjs`:

```js
const tokens = JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url), 'utf8'));
const componentRegion = html.slice(html.indexOf(COMPONENT_START), html.indexOf(COMPONENT_END));

test('both shipped stylesheets are injected, so the figures cannot drift', () => {
  assert.match(componentRegion, /\.call-card \{/, 'callcard.css is missing');
  assert.match(componentRegion, /\.table-panel \{/, 'ui/table.css is missing');
});

test('the hero figure is a real desk call card, not a mockup', () => {
  assert.match(html, /<article class="call-card" data-step="2" data-size="desk">/);
  assert.match(html, /class="call-card__room">214</);
  assert.match(html, /class="call-card__floor">2-qavat</);
  assert.match(html, /class="call-card__timer">\d+:\d\d</);
  // Display-only: the figure passes no ack, so it MARKS UP no slab (§6.2). Scoped to the
  // <article>...</article> markup only — the injected callcard.css in the @component-css
  // region legitimately DEFINES four .call-card__slab RULES, and this assertion must not
  // see that region at all.
  const figStart = html.indexOf('<article class="call-card"');
  const figure = html.slice(figStart, html.indexOf('</article>', figStart));
  assert.doesNotMatch(figure, /call-card__slab/);
  // Rail: three slots always drawn, two filled at step 2.
  const on = componentCount(html, 'data-rail-slot="on"');
  const off = componentCount(html, 'data-rail-slot="off"');
  assert.equal(on, 2);
  assert.equal(off, 1);
});

test('the old fake room-grid mock is deleted', () => {
  assert.doesNotMatch(html, /room-cell/);
  assert.doesNotMatch(html, /pulseAlert/);
});

test('the "Ikki rejim" left half is a real dashboard table fragment', () => {
  assert.match(html, /<div class="table-panel">/);
  assert.match(html, /<td data-label="Xona">/);
  assert.match(html, /class="status__dot status__dot--ok"/);
  assert.match(html, /class="mono-id"/);
});

test('the watch figure matches type.watch and rail.watch exactly', () => {
  // Rule 7 forbids the EMITTER from reading kotlin-only tokens; this test is not an
  // emitter, and it is what keeps the drawing honest (deviation 3).
  const m = /<svg class="watch-figure"([^>]*)>/.exec(html);
  assert.ok(m, 'watch-figure svg not found');
  const attrs = m[1];
  const val = (name) => Number(new RegExp(`${name}="(\\d+)"`).exec(attrs)?.[1]);
  assert.equal(val('data-room-sp'), tokens.type.watch.room.size[1]);
  assert.equal(val('data-floor-sp'), tokens.type.watch.floor.size);
  assert.equal(val('data-timer-sp'), tokens.type.watch.timer.size);
  assert.equal(val('data-rail-w'), tokens.rail.watch.w);
  assert.equal(val('data-rail-h'), tokens.rail.watch.h);
  assert.equal(val('data-rail-gap'), tokens.rail.watch.gap);
  assert.match(attrs, /viewBox="0 0 192 192"/, 'a 192-unit face, so 1 user unit = 1sp');
  // A round display: a rounded container inside a round screen wastes a third of it.
  assert.match(html, /<svg class="watch-figure"[\s\S]*?<circle[^>]*r="96"/);
});

test('the signal path is one inline SVG in border-strong strokes with mono-sm annotations', () => {
  assert.match(html, /<svg class="signal-path"/);
  assert.match(authored, /\.signal-path [^{]*\{[^}]*stroke: var\(--color-border-strong\)/);
  assert.match(html, /433 MHz/);
  assert.match(html, /EV1527/);
  assert.doesNotMatch(html, /flow-node|flow-arrow/);
});

test('red appears on the page exactly where it depicts a real call', () => {
  // The token is only legitimate inside the injected stylesheet and the watch figure's
  // own CSS (authored directly in landing.html, not injected — so it IS in `authored`).
  // The watch figure references TWO distinct call tokens (--call-fill-2 on the face,
  // --call-ink on the rail and the three text elements) across four declarations — count
  // distinct token names, not raw occurrences, so escalating from one declaration to
  // four (e.g. giving each text element its own rule) does not spuriously fail this test.
  const authoredCallTokens = new Set(
    [...authored.matchAll(/var\(\s*(--call-[a-z0-9-]+)/g)].map((m) => m[1])
  );
  assert.deepEqual(
    [...authoredCallTokens].sort(),
    ['--call-fill-2', '--call-ink'],
    `expected exactly the watch figure's two call tokens; got ${[...authoredCallTokens]}`
  );
});

function componentCount(text, needle) {
  return text.split(needle).length - 1;
}
```

Create `web-dashboard/src/components/calls/landingFigure.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CallCard } from './CallCard';

const LANDING = fileURLToPath(new URL('../../../../server/static/landing.html', import.meta.url));

/** Class names and data-attribute names, as a set, so a rename in either place fails. */
function contract(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach((c) => out.add(c));
  for (const m of html.matchAll(/(data-[a-z-]+)=/g)) out.add(m[1]);
  return [...out].filter((s) => s.startsWith('call-card') || s.startsWith('data-')).sort();
}

describe('landing hero figure ↔ CallCard contract', () => {
  it('the static figure uses exactly the class and attribute names CallCard renders', () => {
    // Step 2 with no onAck: the same state the landing figure depicts.
    const at = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
    const created = new Date(at.getTime() - 200_000).toISOString();
    const { container } = render(<CallCard roomNumber="214" floor={2} createdAt={created} now={at} />);
    const componentContract = contract(container.innerHTML);

    const landing = readFileSync(LANDING, 'utf8');
    const start = landing.indexOf('<article class="call-card"');
    expect(start).toBeGreaterThan(-1);
    const figure = landing.slice(start, landing.indexOf('</article>', start));
    const figureContract = contract(figure);

    expect(figureContract).toEqual(componentContract);
  });

  it('the figure never renders an acknowledge slab', () => {
    // Scoped to the <article>...</article> markup only. The injected callcard.css (in
    // the @component-css region, elsewhere in this same file) DEFINES four
    // .call-card__slab rules — checking the whole file would fail on that, not on a
    // real defect.
    const landing = readFileSync(LANDING, 'utf8');
    const start = landing.indexOf('<article class="call-card"');
    const figure = landing.slice(start, landing.indexOf('</article>', start));
    expect(figure).not.toContain('call-card__slab');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/baxrom/ish_full/soat-design && node --test tools/landing.test.mjs && cd web-dashboard && npm test`
Expected: FAIL — `ui/table.css is missing` from the component region, `<article class="call-card"…>` not found, `room-cell` still present, `watch-figure` not found, `flow-node` still present.

- [ ] **Step 3: Write the implementation**

First, inject both stylesheets. In `tools/generate-tokens.mjs`, replace the single path with a list:

```js
const COMPONENT_CSS_PATHS = [
  'web-dashboard/src/components/calls/callcard.css',
  'web-dashboard/src/components/ui/table.css',
];
```

and in the landing emitter entry:

```js
        componentCss: COMPONENT_CSS_PATHS.map(readRoot).join('\n'),
```

**Hero figure.** In `server/static/landing.html`, replace the whole `<div class="mock"> … </div>` block in the hero's right column with:

```html
    <!-- The product's most distinctive object is its own advertisement. This is the
         SHIPPED desk call card: the CSS below it is web-dashboard/.../callcard.css,
         injected verbatim by the generator. Red stays reserved because it is DEPICTED
         here, not asserted. No ack slab: the figure passes no handler, and the component
         renders the slab only `if (onAck)`. -->
    <figure class="hero-figure">
      <article class="call-card" data-step="2" data-size="desk">
        <div class="call-card__rail" aria-hidden="true">
          <span data-rail-slot="on"></span>
          <span data-rail-slot="on"></span>
          <span data-rail-slot="off"></span>
        </div>
        <div class="call-card__body">
          <div class="call-card__room">214</div>
          <div class="call-card__meta">
            <span class="call-card__floor">2-qavat</span>
            <span class="call-card__timer">3:22</span>
          </div>
        </div>
      </article>
      <figcaption class="hero-figure__cap">
        Hamshira ekranidagi haqiqiy chaqiruv kartasi. Qizil rang faqat shu yerda —
        tirik chaqiruvdan boshqa hech narsada ishlatilmaydi.
      </figcaption>
    </figure>
```

and add its CSS (no shadow — deviation 2):

```css
  /* §6.7(3): a surface panel holding the real card. shadow.pop is targets ["css","ts"],
     so this target may not read it (rule 7); the panel carries a hairline instead. */
  .hero-figure {
    margin: 0;
    padding: var(--space-24);
    background: var(--color-surface);
    border: var(--border-hairline) solid var(--color-border);
    border-radius: var(--radius-4);
  }
  .hero-figure__cap {
    margin-top: var(--space-16);
    font-size: var(--type-mgmt-meta-size);
    line-height: var(--type-mgmt-meta-lh);
    color: var(--color-text3);
  }
```

Delete the `.mock`, `.mock-bar`, `.mock-body`, `.room-grid`, `.room-cell`, `.mock-note` rules and the `@keyframes pulseAlert`, plus the `.room-cell.alert` clause in the reduced-motion block (which becomes `@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } * { transition-duration: 0.01ms !important; } }`).

**Signal path (§6.7(5)).** Replace the `<div class="flow-strip"> … </div>` markup with one inline SVG, and delete the `.flow-strip`, `.flow-node`, `.flow-arrow` rules:

```html
      <svg class="signal-path" viewBox="0 0 1120 160" role="img"
           aria-label="Tugma, qavat qabul qilgichi, server, hamshira soati va telefoni">
        <line x1="90" y1="70" x2="1030" y2="70" />
        <g class="signal-path__node">
          <rect x="20" y="40" width="140" height="60" rx="12" />
          <text x="90" y="76" class="signal-path__label">Tugma</text>
          <text x="90" y="128" class="signal-path__ann">433 MHz · EV1527</text>
        </g>
        <g class="signal-path__node">
          <rect x="330" y="40" width="140" height="60" rx="12" />
          <text x="400" y="76" class="signal-path__label">ESP32</text>
          <text x="400" y="128" class="signal-path__ann">bir qavat = bir qurilma</text>
        </g>
        <g class="signal-path__node">
          <rect x="650" y="40" width="140" height="60" rx="12" />
          <text x="720" y="76" class="signal-path__label">Server</text>
          <text x="720" y="128" class="signal-path__ann">har chaqiruv qayd etiladi</text>
        </g>
        <g class="signal-path__node">
          <rect x="960" y="40" width="140" height="60" rx="12" />
          <text x="1030" y="76" class="signal-path__label">Soat · telefon</text>
          <text x="1030" y="128" class="signal-path__ann">mas'ul qavat bo'yicha</text>
        </g>
      </svg>
```

```css
  /* §6.7(5): one wide SVG, drawn entirely in border-strong strokes. */
  .signal-path { width: 100%; height: auto; }
  .signal-path line, .signal-path rect {
    fill: var(--color-surface);
    stroke: var(--color-border-strong);
    stroke-width: var(--border-hairline);
  }
  .signal-path__label {
    fill: var(--color-text2); text-anchor: middle;
    font-family: var(--font-sans);
    font-size: var(--type-mgmt-dense-size);
    font-weight: 600;
  }
  /* Technical annotations in the SAME mono-sm the dashboard uses for device IDs. */
  .signal-path__ann {
    fill: var(--color-text3); text-anchor: middle;
    font-family: var(--font-mono);
    font-size: var(--type-mgmt-mono-sm-size);
    letter-spacing: 0.02em;
  }
```

**"Ikki rejim" (§6.7(6)).** Replace the `<div class="showcase-grid"> … </div>` contents — the `.dash-mock` and `.watch-mock` blocks — with a real table fragment and the watch SVG, and delete the `.dash-mock`, `.dash-mock-body`, `.dash-side`, `.dash-side-item`, `.dash-main`, `.dash-title`, `.call-row`, `.watch-mock`, `.watch-body`, `.watch-room`, `.watch-floor`, `.watch-hint` rules:

```html
    <div class="showcase-grid">
      <!-- Left: a REAL dashboard table fragment at real scale. The stylesheet below is
           web-dashboard/src/components/ui/table.css, injected verbatim. -->
      <div class="table-panel">
        <table>
          <thead>
            <tr><th>Xona</th><th>Qavat</th><th>Qurilma</th><th>Holat</th></tr>
          </thead>
          <tbody>
            <tr>
              <td data-label="Xona">214</td>
              <td data-label="Qavat">2-qavat</td>
              <td data-label="Qurilma"><code class="mono-id" title="floor2-esp32-01">floor2-esp32-01</code></td>
              <td data-label="Holat">
                <span class="status"><span class="status__dot status__dot--ok" aria-hidden="true"></span>Onlayn</span>
              </td>
            </tr>
            <tr>
              <td data-label="Xona">108</td>
              <td data-label="Qavat">1-qavat</td>
              <td data-label="Qurilma"><code class="mono-id" title="floor1-esp32-01">floor1-esp32-01</code></td>
              <td data-label="Holat">
                <span class="status"><span class="status__dot status__dot--idle" aria-hidden="true"></span>Oflayn</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Right: the watch call screen. Wear Compose cannot render in a browser, and the
           watch type tokens are kotlin-only, so this is a faithful drawing rather than the
           shipped pixels: a 192-unit viewBox IS a 192dp face, so 44 user units = 44sp.
           tools/landing.test.mjs asserts every number here against tokens.json. -->
      <figure class="watch-figure-wrap">
        <svg class="watch-figure" viewBox="0 0 192 192" role="img"
             data-room-sp="44" data-floor-sp="14" data-timer-sp="16"
             data-rail-w="5" data-rail-h="12" data-rail-gap="4"
             aria-label="Soat ekrani: 214-xona, 2-qavat, 3 daqiqa 22 soniya">
          <circle cx="96" cy="96" r="96" class="watch-figure__face" />
          <g class="watch-figure__rail">
            <rect x="18" y="74" width="5" height="12" rx="1" class="on" />
            <rect x="18" y="90" width="5" height="12" rx="1" class="on" />
            <rect x="18" y="106" width="5" height="12" rx="1" class="off" />
          </g>
          <text x="104" y="100" class="watch-figure__room" font-size="44">214</text>
          <text x="104" y="122" class="watch-figure__floor" font-size="14">2-qavat</text>
          <text x="104" y="142" class="watch-figure__timer" font-size="16">3:22</text>
        </svg>
        <figcaption class="showcase-cap">
          Panel — nazorat uchun, soat — harakat uchun. Ikkisida ham qizil rang faqat
          tirik chaqiruvni bildiradi.
        </figcaption>
      </figure>
    </div>
```

```css
  .showcase-grid { display: grid; grid-template-columns: 1.35fr 0.65fr; gap: var(--space-40); align-items: center; }
  .watch-figure-wrap { margin: 0; }
  .watch-figure { width: 100%; max-width: 240px; margin: 0 auto; }
  /* The face is the call fill: this is a call screen, and it is the one other place on
     the page where red is DEPICTED rather than asserted. */
  .watch-figure__face { fill: var(--call-fill-2); }
  .watch-figure__rail rect { fill: none; stroke: var(--call-ink); stroke-width: var(--rail-empty-stroke); }
  .watch-figure__rail rect.on { fill: var(--call-ink); }
  .watch-figure__room, .watch-figure__floor, .watch-figure__timer { fill: var(--call-ink); text-anchor: middle; }
  .watch-figure__room { font-family: var(--font-sans); font-weight: 700; font-variant-numeric: tabular-nums; }
  .watch-figure__floor { font-family: var(--font-sans); font-weight: 500; }
  .watch-figure__timer { font-family: var(--font-mono); font-weight: 600; font-variant-numeric: tabular-nums; }
  .showcase-cap {
    margin-top: var(--space-16);
    font-size: var(--type-mgmt-meta-size);
    line-height: var(--type-mgmt-meta-lh);
    color: var(--color-text3);
    text-align: center;
  }
```

**Footer (§6.7(10)).** Replace the footer rules:

```css
  footer {
    border-top: var(--border-hairline) solid var(--color-border);
    background: var(--color-surface-sunken);
    padding: var(--space-64) 0;
  }
  .footer-links {
    margin-left: auto; display: flex; flex-wrap: wrap; gap: var(--space-8) var(--space-20);
    font-size: var(--type-mgmt-dense-size); color: var(--color-text2);
  }
  .footer-links a:hover { color: var(--color-accent); }
  .footer-copy { font-size: var(--type-mgmt-meta-size); color: var(--color-text3); }
```

Note on §6.7(8): the recommended-plan treatment (1.5px `accent` border + a small `accent` eyebrow label) has no subject on this page, because this business publishes one consultation-based price panel rather than three tiers (deviation 9). No dead `.price-card--recommended` rule is added; the single `.price-card` becomes a `.card` with `--space-48` padding.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd /Users/baxrom/ish_full/soat-design
node tools/generate-tokens.mjs            # re-injects both stylesheets
node tools/generate-tokens.mjs --check
node --test tools/*.test.mjs
cd web-dashboard && npm test
```
Expected: all `landing` tests pass, the `landingFigure` contract test passes, `--check` exits 0.

- [ ] **Step 5: Prove the anti-drift mechanism on the figure contract**

```bash
cd /Users/baxrom/ish_full/soat-design/web-dashboard
sed -i '' 's/call-card__room/call-card__number/g' src/components/calls/CallCard.tsx src/components/calls/callcard.css
npm test; echo "exit=$?"
git checkout -- src/components/calls
npm test; echo "exit=$?"
```
Expected: the rename fails `landingFigure` with a contract mismatch (`exit=1`), then passes again after the revert. This is the guarantee that "the landing figure is the shipped component" stays true.

- [ ] **Step 6: Screenshot verification — the whole point of the page**

`open server/static/landing.html`. Screenshot the hero, the signal path and "Ikki rejim" at 1440px, at 1024px and at 380px, in both themes. Confirm:
1. The hero card is **visibly the same object** as the card on `/app` — same fill, same rail, same numeral weight and tracking, same radius. Put the two screenshots side by side; any difference means the injected stylesheet is not winning the cascade.
2. Red appears in exactly two places on the entire page: the hero card and the watch face. Nothing else — no red link, no red pricing accent, no red error state.
3. The "Ikki rejim" table fragment has 13px cells, hairlines, tabular figures and a dot-plus-word status — i.e. it reads as a screenshot of the product, because it is one.
4. The watch face is a full circle with no rounded rectangle inside it, the rail is **vertical** at the left, and "214" is legible at arm's length from the screen.
5. At 380px nothing scrolls horizontally and the signal-path SVG scales down without clipping its labels.
6. The four `<text>` labels in the signal path are Inter/JetBrains Mono, not a system fallback — if they look like Helvetica, the inlined subset is not covering them.

- [ ] **Step 7: Commit**

```bash
git add server/static/landing.html tools/generate-tokens.mjs tools/landing.test.mjs \
        web-dashboard/src/components/calls/landingFigure.test.tsx
git commit -m "Landing: hero figure and Ikki rejim render the shipped call card and table CSS, with a contract test that fails on drift"
```

---

## Done means

- `node --test tools/*.test.mjs` — green, including rules 3, 7, 9 and 10 with a proven failure each.
- `node tools/generate-tokens.mjs --check` — exit 0, and stale/violating input proven to exit 1.
- `cd web-dashboard && npx tsc -b && npm test` — green.
- `cd web-dashboard && npm run build` — green (it runs `--check` first, so all four new rules gate the build).
- Nine management pages and the landing page screenshot-verified at 1440px and 380px, in both themes.
- **If Plan 3 (phone-and-watch) has already landed on this branch when this plan runs** (it should not have — this plan lands first, see Global Constraints — but if the sequencing was reversed), re-run `node --test tools/*.test.mjs` and `cd mobile-app && npx tsc --noEmit && npm test` and `./gradlew :app:testDebugUnitTest` after this plan's Task 3/4 land: this plan's reserved-red allowlist and CSS lints are new gates against phone/watch source they were not written against, and Plan 3's `ts`/`kotlin` emitter registrations must still be present in `EMITTERS` afterward (they are additive edits specifically so this survives either ordering).
- Nothing is red anywhere in the product except a live patient call, the hero figure and the watch figure — and the last two are depictions of a live patient call.
