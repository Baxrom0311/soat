# Phone App + Wear OS Watch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the nurse's two wearable-and-pocket surfaces — the Expo phone app (spec §6.5) and the Wear OS watch app (spec §6.6) — on the generated token pipeline, and ship them as ONE release, because a nurse holding a new phone and an old watch sees a worse product than today.

**Architecture:** Two new emitters are added to the existing `tools/generate-tokens.mjs`: a `ts` emitter writing `mobile-app/src/theme.ts` and a `kotlin` emitter writing `app/src/main/java/uz/soat/reminder/NurseCallTokens.kt`. Both honour each token's `targets` array, and `--check` fails the build when either generated file is stale. The phone consumes the emitted theme through the existing `ThemeContext`; the watch consumes the emitted object through a new `nurseCallWearColors()` mapping into Wear Material 1's `MaterialTheme`. Neither app gains or loses a feature and no API contract changes; the single behavioural change is the value the watch sends in the already-existing `acknowledged_by` field.

**Tech Stack:** Node 25 (`node --test`, zero new deps for the generator), React Native 0.86 / Expo 57 / TypeScript 6 with Jest + `@testing-library/react-native` (new to this package), Kotlin + Jetpack Compose for **Wear Material 1** (`androidx.wear.compose:compose-material:1.3.1`) with JUnit 4 JVM unit tests (new to this module).

**Spec:** `docs/superpowers/specs/2026-08-27-design-system-design.md`

## Global Constraints

Copied from the spec. Every task's requirements implicitly include this section.

- **Font weights: 400, 500, 600, 700 only, ever** (§3). Inter ships no static 450/550/620/650 face.
- **THE HIGHEST-RISK RULE IN THIS PLAN (§0 row 9, §3, §7 emitter notes): React Native on Android resolves a font family by NAME per weight, not by a numeric axis.** The `ts` emitter emits `fontFamily` STRINGS from `font.sans.phoneFamilies` (`Inter_400Regular`, `Inter_500Medium`, `Inter_600SemiBold`, `Inter_700Bold`) and **never** a numeric `fontWeight`. If it emitted numeric weights, `theme.ts` would compile, run, pass `--check` and render 400 everywhere on the phone while rendering correctly on web.
- **Red is reserved** (§2.4 Rule 0). `call.*` tokens may be consumed only by a component rendering a live patient call. Phone allowlist: `mobile-app/src/components/CallCard.tsx`, `mobile-app/src/components/CallCard.test.tsx`, `mobile-app/src/components/Rail.tsx`, `mobile-app/src/theme.ts`. Watch allowlist: `NurseCallTokens.kt`, `NurseCallTheme.kt`, `NurseCallThemeTest.kt`, `CallScreens.kt`, `CallScreensTest.kt`, `ChromeScreens.kt` — the last because `CallListScreen` (Task 14, §6.6 State B) renders the live multi-call list row and legitimately reads `callFill`/`callEdge`/`callInk`.
- **Ownership of `tools/generate-tokens.mjs` and merge order.** `2026-08-27-dashboard-and-landing.md` (the web dashboard + landing plan) owns the `EMITTERS` registry, the reserved-red scanner (`tools/lib/reserved-red.mjs`) and the CSS lints, and lands FIRST on `design-tokens-calls`. This plan's Task 0 branches from that plan's finished tip. Every edit this plan makes to `EMITTERS` and to the `export { … }` line is additive (adds a key/name, never rewrites the object), and this plan's Task 3 imports `RESERVED_RED_ALLOWLIST`/`scanReservedRed` from that plan's module rather than shipping a second reserved-red scanner — see Task 3.
- **Rule 1: no alpha in the alert register.** Every glyph on a red fill is pure `#FFFFFF`.
- **Rule 2:** every `call.fill` measures ≥ 4.5:1 against `call.ink`. Watch white ink is 6.23 / 5.29 / 4.64:1 — AA-normal at every step, so the 14sp floor line is compliant, not excused (§6.6).
- **Zero motion in the alert register**, on any target (§4.5). A call card is a pure function of state: it appears instantly at full contrast, an ageing step is an instant swap. A 1-second state tick that re-reads the clock is not motion; `animate*AsState`, `Animated`, `withTiming` and CSS transitions are.
- **`min-height`, never `height`** on any card, row or button (§3.5, §10 rule 10).
- **`maxFontSizeMultiplier: 1.2` on the room number and the timer ONLY** (§3.5). They are already 3–8× body size. All small alert text (`alert.floor`, `alert.ack`) scales freely. Touch targets are absolute px and never scale down.
- **Phone regression test to hold** (§3.5, §11.3): 130% OS font scale, three simultaneous calls, room `"1204"` — nothing clips.
- **One gutter per surface** (§4.2). `gutter.phone` is **16, full stop** — this deletes the measured 20/16/16 stack. `gutter.watch` is 10dp plus Wear's own chin insets.
- **Thumb-reach rule (§4.4).** Bottom third of the phone screen: the acknowledge action and nothing else. Menu, logout, theme, settings live in the upper right, deliberately outside the one-handed arc.
- **`control.48` is the phone's absolute tap minimum, no exceptions.** `control.64` (`tap.gloved`) is the "Tasdiqlash" button and only it. `control.44` is the Wear chip minimum.
- **Radius is a function of an element's shortest side** (§4.3), never of elevation or importance: <32px → 4, 32–64 → 8, 64–240 → 12, >240 → 16. Watch list item (48dp) → `radius.2`; watch full-bleed call → `radius.0`; phone call card → `radius.3`.
- **`tabular-nums` mandatory on every number** (§3): `fontVariant: ['tabular-nums']` on RN, `fontFeatureSettings = "tnum"` in Compose.
- **Uzbek Latin (§3):** minimum body size 15px (16px on phone inputs); no negative letter-spacing below 22px; no all-caps except the `eyebrow` token; **U+02BB (ʻ) is the canonical apostrophe**. Every `Text` on the watch carries an explicit `maxLines` and `TextOverflow.Ellipsis`; the watch line budget is ~7 chars at 40sp, ~11 at 26sp, ~20 at 15sp.
- **Timer format is fixed:** `m:ss` up to 59:59, then `h:mm:ss`. Never a word form (§3.3).
- **Nothing is red except a live patient call** (§10). The watch's disconnected state is amber or a hollow grey ring, its login failure is amber, its billing strip is amber. The phone's error banner is amber.
- **The watch's alert rendering is never obscured:** the billing notice renders ONLY inside the no-active-calls branch (§6.6 State F). Wear Material 1 only — no Material 3, no Horologist, no new UI library, no font file.
- **Backend and every API contract are untouched.** No feature added or removed. The one behavioural change in scope is the *value* the watch sends in the existing `acknowledged_by` field.

### Where `tokens.json` has already superseded the spec prose

Plan 1 amended three sets of numbers on the owner's instruction. **`tokens.json` is the authority; do not "fix" it back to the prose.**

| Spec prose | `tokens.json` today | Commit |
|---|---|---|
| `call.thresholdsSec: [0, 30, 120]` (§5) | `[0, 120, 600]` | `6525450` — 8 of 13 realistic calls landed on step 3, so the scale saturated before it discriminated |
| Light ramp darkens with age (§2.4) | `light: ["#8A100A", "#A81810", "#C4241A"]` — brightens | `b175208` |
| `rail.watch` slot 4×14, gap 3; `rail.phone` slot 5×18, gap 4 (§4.5) | `watch { w:5, h:12, gap:4 }`, `phone { w:8, h:22, gap:5 }` | `6525450` |

### Two places where the spec is silent, and the decision taken here

Both are recorded rather than decided quietly, per the plan brief.

1. **Which `type.*` scopes each emitter reads.** `type.mgmt` and the desk entries of `type.alert` (`roomDesk`, `timerDesk`, `floorDesk`, `ackDesk`) carry no `targets`, so §7's default makes them readable by all four emitters. Emitting a 72sp `alertRoomDesk` into a 192dp watch face would be actively wrong. **Decision:** each emitter names the type scopes belonging to its platform and honours `targets` *within* them — `ts` reads `['mgmt', 'alert']`, `kotlin` reads `['watch']`. `--check` rule 7 is unaffected: neither emitter ever reads a token whose `targets` exclude it.
2. **The phone has no mono font file.** `type.mgmt.monoSm` and `type.alert.timerPhone` are `mono: true`, but §9's dependency list for `mobile-app/` names only `react-native-safe-area-context`, `expo-font` and *the four Inter static faces*. **Decision:** phone mono styles use the platform monospace family (`monospace` on Android, `Menlo` on iOS) — the tail of `font.mono.stack` already describes it, it is inherently tabular, and it costs zero APK bytes. No JetBrains Mono file is shipped to the phone.

Two smaller silences, decided the same way and repeated at their task:

3. **Solo phone floor line.** §6.5 says the solo card's floor line goes to "20/600", but no 20/600 token exists. **Decision:** use `type.alert.floorPhone` (17/600) in both card modes. Inventing an untokenised 20px is exactly the "10 arbitrary sizes for 20 text elements" bug this work deletes.
4. **Watch room-number autoshrink.** §6.6 specifies "autoshrinking to 36sp for strings over 4 characters" and `tokens.json` carries no token for it. **Decision:** a named constant `ROOM_AUTOSHRINK` in `CallScreens.kt` with the spec citation beside it. The shrink is a per-step ARRAY (`32/34/36sp`), not a single flat value, so the size channel keeps escalating with age even for a shrunk room number — a flat 36sp for every step would make a fresh call in room "12-A-B" render the SAME size as a ten-minute-old one, silently deleting §5's numeral-size ageing channel for every non-numeric room label. **Boundary, recorded because the spec contradicts its own example:** §6.6 gives `"12-A"` (4 characters) as the example of a string "over 4 characters" — it is not; `"12-A".length == 4`. The threshold used here is `length > 4` (so a realistic 3–4 digit room number like `"1204"` never shrinks), and `"12-A"` is treated as an illustrative, not literal, boundary example. Reversal, if the owner disagrees: change the comparison to `>=`, which then also shrinks every 4-digit room number.
5. **The phone's arrival haptic is the OS notification's own vibration, not a second one fired from the app.** §6.5 asks for "one notification buzz on arrival, one light impact at each step transition." Task 10 wires `expo-notifications`' default channel vibration for the arrival buzz (the OS fires it the moment the push/local notification is delivered, whether or not the app is foregrounded) and `CallCard`'s own `expo-haptics` impact for each step transition (Task 7), which only fires while the app is open and a card is on screen. Firing a SECOND `expo-haptics` buzz from JS at mount time would double-buzz whenever the app is already foregrounded when the call arrives (the common case: the nurse is looking at the Calls screen already). Recorded so this is a decision, not a silent gap.
6. **`UpdateRequiredScreen`'s "Yordam olish" button opens Telegram `@bakhromdev`, not a phone call.** §6.5 requires the shared primary button on this screen but does not say what it does, and this codebase has no support-contact field in `config.ts` or anywhere else. A prior draft of this task invented a placeholder phone number (`+998900000000`) — that is exactly the kind of unowned content this plan brief forbids. The product's actual, real vendor contacts are the phone number `+998 93 558 03 11` and Telegram `@bakhromdev`; this task points the button at the Telegram deep link (`tg://resolve?domain=bakhromdev`) because Telegram is checkable/loggable in a way a bare `tel:` dial is not, and because it degrades safely (opens Telegram's own "app not installed" flow rather than silently failing) — a product decision, not a token, so recorded here for the owner to confirm or override. Reversal: swap the `onPress` to `Linking.openURL('tel:+998935580311')`, or add both as two rows.

### What can and cannot be verified headless

Stated plainly, per the plan brief, so nobody pretends a unit test covered a screen.

| Verification | Runs headless | Needs |
|---|---|---|
| Emitter output, invariants, `--check` staleness | ✅ `node --test tools/*.test.mjs` | — |
| Reserved-red lint, no-numeric-`fontWeight` lint, no-fixed-`height` lint | ✅ `node --test tools/*.test.mjs` | — |
| Phone component props/styles (`maxFontSizeMultiplier`, `minHeight`, slab-only-when-`onAck`, oldest-first) | ✅ `cd mobile-app && npm test` | first run needs network to install Jest |
| Phone TypeScript | ✅ `cd mobile-app && npx tsc --noEmit` | — |
| Watch pure logic (`ageStep`, `elapsedLabel`, JWT name decode) | ✅ `./gradlew :app:testDebugUnitTest` | network for Gradle deps on first run |
| Watch compiles | ✅ `./gradlew :app:assembleDebug` | Android SDK + network |
| **Four Inter weights render as four distinct weights** | ❌ | **Android device or emulator + screenshot** |
| **130% OS font scale, three calls, room "1204", nothing clips** | ❌ | **device/emulator with Settings → Display → Font size at 130%** |
| **Red ramp reads as escalation; 48sp room number legible at a glance** | ❌ | **real watch (or Wear emulator) + screenshot** |
| **Release APKs** | ❌ | Expo/EAS tooling for the phone, `keystore.properties` + Gradle for the watch |

---

## File Structure

| Path | Responsibility | Action |
|---|---|---|
| `tools/lib/emit-ts.mjs` | The RN theme emitter. `fontFamily` strings only, never `fontWeight`. | Create |
| `tools/lib/emit-kotlin.mjs` | The Wear token emitter. ARGB reorder, em→sp tracking, no shadow. | Create |
| `tools/emit-ts.test.mjs` | `node --test` suite for the `ts` emitter, incl. the font-family regression. | Create |
| `tools/emit-kotlin.test.mjs` | `node --test` suite for the `kotlin` emitter. | Create |
| `tools/guards.test.mjs` | Repo lints: no numeric `fontWeight`, reserved red, no fixed `height`. | Create |
| `tools/generate-tokens.mjs` | Register the two new emitters in `EMITTERS` and re-export them. | Modify |
| `mobile-app/src/theme.ts` | **Generated.** Never hand-edited. Replaces the colours-only hand-written file. | Replace (generated) |
| `mobile-app/src/fonts.ts` | The `expo-font` map, cross-checked against the generated `interFamilies`. | Create |
| `mobile-app/src/lib/ageStep.ts` | Phone `ageStep()` / `elapsedLabel()`, thresholds from the generated theme. | Create |
| `mobile-app/src/components/Rail.tsx` | The 3-slot ageing rail. | Create |
| `mobile-app/src/components/CallCard.tsx` | The phone alert card, multi and solo. | Create |
| `mobile-app/src/components/Banner.tsx` | ONE banner: error, offline and billing. Replaces two divergent banners. | Create |
| `mobile-app/src/components/BrandMark.tsx` | `tile.brand` 40×40, the only square icon tile in the product. | Create |
| `mobile-app/src/components/PrimaryButton.tsx` | `control.56` accent button, shared by Login and Update-required. | Create |
| `mobile-app/src/components/SettingsSheet.tsx` | Upper-right sheet: theme, battery help, logout, version. | Create |
| `mobile-app/src/components/BillingBanner.tsx` | Deleted — generalised into `Banner`. | Delete |
| `mobile-app/src/components/ThemeToggle.tsx` | Restyled to `control.48`, moved inside the sheet. | Modify |
| `mobile-app/src/screens/WelcomeScreen.tsx` | Deleted from the repo and the navigator (§6.5). | Delete |
| `mobile-app/src/time.ts` | Deleted — its word-form elapsed string violates §3.3. | Delete |
| `mobile-app/src/ThemeContext.tsx` | Provide generated `color[mode]`; keys become token names. | Modify |
| `mobile-app/src/screens/CallsScreen.tsx` | Rewritten on `CallCard`; offline banner; billing below the list. | Modify |
| `mobile-app/src/screens/LoginScreen.tsx` | Rewritten: SafeAreaView, one gutter, shared components. | Modify |
| `mobile-app/src/screens/UpdateRequiredScreen.tsx` | Rewritten on the three shared components. | Modify |
| `mobile-app/src/notifications.ts` | Channel accent `#6C5CE7` → `notify.accentCall`. | Modify |
| `mobile-app/App.tsx` | Font gate, `SafeAreaProvider`, Welcome removed. | Modify |
| `mobile-app/app.json` | Notification plugin colour; version 1.4.0. | Modify |
| `mobile-app/package.json` | Jest + RTL + `expo-font` + Inter + safe-area + haptics. | Modify |
| `mobile-app/jest.setup.js` | Native-module mocks. | Create |
| `app/src/main/java/uz/soat/reminder/NurseCallTokens.kt` | **Generated.** Never hand-edited. | Create (generated) |
| `app/src/main/java/uz/soat/reminder/NurseCallTheme.kt` | `nurseCallWearColors()` — the Wear Material 1 mapping. | Create |
| `app/src/main/java/uz/soat/reminder/AgeStep.kt` | Watch `ageStep()` / `elapsedLabel()` / `parseIsoMs()`. | Create |
| `app/src/main/java/uz/soat/reminder/SessionInfo.kt` | The real acknowledger name, decoded from the JWT the watch holds. | Create |
| `app/src/main/java/uz/soat/reminder/CallScreens.kt` | States A and B: the alert register on the wrist. | Create |
| `app/src/main/java/uz/soat/reminder/ChromeScreens.kt` | States C–F: idle, login, outdated, billing. | Create |
| `app/src/main/java/uz/soat/reminder/MainActivity.kt` | Reduced to state dispatch + the 1 Hz clock tick. | Modify |
| `app/src/main/java/uz/soat/reminder/CallMonitorService.kt` | Two channels, real icons, non-continuous haptics. | Modify |
| `app/src/main/res/drawable/ic_notify_call.xml` | 24dp brand glyph: rounded square, rail cut out. | Create |
| `app/src/main/res/drawable/ic_notify_system.xml` | 24dp outline info circle. | Create |
| `app/src/main/res/values/strings.xml` | `app_name` → "NurseCall". | Modify |
| `app/build.gradle.kts` | JUnit test dep; versionCode 5 / versionName 1.4.0. | Modify |
| `app/src/test/java/uz/soat/reminder/AgeStepTest.kt` | JVM tests for the shared ageing mechanism. | Create |
| `app/src/test/java/uz/soat/reminder/SessionInfoTest.kt` | JVM tests for the JWT name decode. | Create |

---

## Task 0: Branch

- [ ] **Step 1: Cut the branch from the dashboard-and-landing plan's finished tip**

`2026-08-27-dashboard-and-landing.md` owns `tools/generate-tokens.mjs`'s `EMITTERS` registry and lands first on `design-tokens-calls` (see Global Constraints). This branch is cut from ITS finished tip, not from Plan 1's raw output, so `design-tokens-calls` already carries that plan's `landing` emitter, its reserved-red scanner and its CSS lints by the time this plan starts.

Run:

```bash
cd /Users/baxrom/ish_full/soat-design
git checkout design-tokens-calls
git pull --ff-only 2>/dev/null || true
git checkout -b design-phone-watch
node --test tools/*.test.mjs
```

Expected: **all tests pass, zero failures** (`pass N`, `fail 0` — `N` is at least 15, Plan 1's count; the dashboard-and-landing plan adds roughly a dozen more test files, so do not hard-code a specific `N`). **Always use the glob — the directory form `node --test tools/` is broken in this machine's Node 25 build.** If `fail 0` does not hold, stop: it means `design-tokens-calls` does not yet include the dashboard-and-landing plan's finished work, and this plan's Task 3 (which imports that plan's `reserved-red.mjs`) will not resolve.

---

### Task 1: The `ts` emitter — font families by NAME, never by number

This is the highest-risk task in the plan and it is first on purpose. No design-review proposal caught this bug class; the tests below are what make it unshippable.

**Files:**
- Create: `tools/lib/emit-ts.mjs`
- Create: `tools/emit-ts.test.mjs`
- Modify: `tools/generate-tokens.mjs:9-11` (the `EMITTERS` map and the re-export)
- Generated: `mobile-app/src/theme.ts`

**Interfaces:**
- Consumes: `allowsTarget(node, target)` from `tools/lib/emit-css.mjs` — `true` when the node declares no `targets` or lists the target.
- Produces: `emitTs(tokens) -> string`. The generated module exports `interFamilies`, `InterFamily`, `MONO_FAMILY`, `MonoFamily`, `PhoneTextStyle`, `PhoneStepTextStyle`, `atStep(style, step)`, `color`, `ThemeColors`, `ThemeMode`, `call`, `type`, `space`, `gutter`, `radius`, `control`, `border`, `rail`, `size`, `motion`, `shadow`.

- [ ] **Step 1: Write the failing test**

Create `tools/emit-ts.test.mjs`:

```js
// tools/emit-ts.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emitTs } from './lib/emit-ts.mjs';

const tokens = JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url), 'utf8'));

test('THE REGRESSION: no numeric fontWeight is ever emitted', () => {
  const ts = emitTs(tokens);
  // React Native on Android resolves a family NAME per weight. A numeric fontWeight
  // compiles, runs, passes --check and renders 400 everywhere on the phone.
  assert.doesNotMatch(ts, /fontWeight:\s*['"]?\d/, 'a numeric fontWeight reached theme.ts');
});

test('THE REGRESSION, part 2: the emitted style type forbids fontWeight structurally', () => {
  const ts = emitTs(tokens);
  assert.match(ts, /fontWeight\?:\s*never/);
});

test('every sans style carries a phoneFamilies NAME matching its weight', () => {
  const ts = emitTs(tokens);
  assert.match(ts, /bodyLg: \{[^}]*fontFamily: 'Inter_400Regular'/);
  assert.match(ts, /cardTitle: \{[^}]*fontFamily: 'Inter_600SemiBold'/);
  assert.match(ts, /pageTitle: \{[^}]*fontFamily: 'Inter_700Bold'/);
  assert.match(ts, /dense: \{[^}]*fontFamily: 'Inter_500Medium'/);
});

test('a weight with no phoneFamilies entry is a hard error, not a silent 400', () => {
  const bad = structuredClone(tokens);
  delete bad.font.sans.phoneFamilies['700'];
  assert.throws(() => emitTs(bad), /phoneFamilies has no entry for weight 700/);
});

test('interFamilies names exactly the four faces the app must load', () => {
  const ts = emitTs(tokens);
  assert.match(
    ts,
    /export const interFamilies = \['Inter_400Regular', 'Inter_500Medium', 'Inter_600SemiBold', 'Inter_700Bold'\] as const;/
  );
});

test('mono styles use the platform monospace family, not Inter', () => {
  const ts = emitTs(tokens);
  assert.match(ts, /monoSm: \{[^}]*fontFamily: MONO_FAMILY/);
  assert.match(ts, /timerPhone: \{[^}]*fontFamily: MONO_FAMILY/);
  assert.match(ts, /MONO_FAMILY: MonoFamily = Platform\.OS === 'ios' \? 'Menlo' : 'monospace'/);
});

test('step arrays keep three sizes and gain computed line heights and tracking', () => {
  const ts = emitTs(tokens);
  assert.match(ts, /roomPhone: \{ fontSize: \[64, 72, 80\], lineHeight: \[61, 68, 76\], letterSpacing: \[-1\.28, -1\.44, -1\.6\]/);
  assert.match(ts, /roomPhoneSolo: \{ fontSize: \[88, 96, 104\], lineHeight: \[84, 91, 99\]/);
});

test('maxScale becomes maxFontSizeMultiplier on the room and timer only', () => {
  const ts = emitTs(tokens);
  assert.match(ts, /roomPhone: \{[^}]*maxFontSizeMultiplier: 1\.2/);
  assert.match(ts, /timerPhone: \{[^}]*maxFontSizeMultiplier: 1\.2/);
  assert.doesNotMatch(ts, /floorPhone: \{[^}]*maxFontSizeMultiplier/);
  assert.doesNotMatch(ts, /ackPhone: \{[^}]*maxFontSizeMultiplier/);
});

test('tabular styles carry fontVariant', () => {
  const ts = emitTs(tokens);
  assert.match(ts, /timerPhone: \{[^}]*fontVariant: \['tabular-nums'\]/);
});

test('targets are honoured: css-only and kotlin-only tokens do not appear', () => {
  const ts = emitTs(tokens);
  assert.doesNotMatch(ts, /roomWall/);        // type.alert.roomWall targets: ["css"]
  assert.doesNotMatch(ts, /clockWall/);       // targets: ["css"]
  assert.doesNotMatch(ts, /clamp/);           // type.landing targets: ["css","landing"]
  assert.doesNotMatch(ts, /roomList/);        // type.watch targets: ["kotlin"]
  assert.doesNotMatch(ts, /watchOverrides/);  // targets: ["kotlin"]
  assert.doesNotMatch(ts, /accentCall/);      // notify targets: ["kotlin"]
});

test('both themes and the reserved call set are emitted', () => {
  const ts = emitTs(tokens);
  assert.match(ts, /light: \{[^}]*bg: '#F6F7F7'/s);
  assert.match(ts, /dark: \{[^}]*bg: '#0E1213'/s);
  assert.match(ts, /fill: \['#8A100A', '#A81810', '#C4241A'\]/);
  assert.match(ts, /fill: \['#B9271B', '#CB2F22', '#D93726'\]/);
  assert.match(ts, /thresholdsSec: \[0, 120, 600\]/);
});

test('value-named scales survive so space[16] resolves', () => {
  const ts = emitTs(tokens);
  assert.match(ts, /export const space = \{[^}]*"16": 16/s);
  assert.match(ts, /export const control = \{[^}]*"64": 64/s);
});

test('atStep picks the per-step values out of a step style', () => {
  const ts = emitTs(tokens);
  assert.match(ts, /export function atStep\(/);
});

test('a stray undefined in the output is a loud build failure, not a silent theme.ts bug', () => {
  // Rule 7's cheaper half: this emitter hand-filters with allowsTarget() rather than
  // forTarget()'s structural removal, so assertNoUndefined() is the backstop that turns
  // a missed filter into a thrown error instead of a literal "undefined" in the file.
  const broken = structuredClone(tokens);
  broken.type.mgmt.bodyLg.size = undefined;
  assert.throws(() => emitTs(broken), /Rule 7/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design && node --test tools/emit-ts.test.mjs`

Expected: FAIL with `Cannot find module '.../tools/lib/emit-ts.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Create `tools/lib/emit-ts.mjs`:

```js
// tools/lib/emit-ts.mjs
import { allowsTarget } from './emit-css.mjs';
import { assertNoUndefined } from './targets.mjs';
// NOTE on rule 7 (§8): the css/landing emitters (dashboard-and-landing plan, Task 2) are
// structurally safe — forTarget() removes out-of-scope nodes before the emitter can read
// them at all. This emitter instead hand-filters field-by-field with allowsTarget(), which
// is the existing, tested shape of this file and is not rewritten onto forTarget() here
// (a bigger refactor than this task's budget). assertNoUndefined() below is the cheaper
// half of the same mechanism: it cannot stop a wrong READ, but it turns one into a loud
// build failure instead of a silent "undefined" landing in theme.ts.

/** Spec §7 defaults an undeclared `targets` to all four emitters, but `type.mgmt` and the
 *  desk entries of `type.alert` are undeclared, and a 72sp `alertRoomDesk` is meaningless
 *  on a watch. So each emitter names the scopes belonging to its platform and honours
 *  `targets` WITHIN them. Recorded in the plan, not decided silently. */
const TS_TYPE_SCOPES = ['mgmt', 'alert'];

const round2 = (n) => Math.round(n * 100) / 100;

/** §3: RN on Android resolves a family NAME per weight. There is no numeric fallback,
 *  so a missing entry must stop the build rather than render 400 in production. */
function sansFamily(t, weight) {
  const fam = t.font.sans.phoneFamilies?.[String(weight)];
  if (!fam) {
    throw new Error(
      `emit-ts: font.sans.phoneFamilies has no entry for weight ${weight}. ` +
        'React Native resolves a family NAME per weight — a numeric fontWeight would ' +
        'silently render 400 on the phone while rendering correctly on web.'
    );
  }
  return `'${fam}'`;
}

function styleLiteral(t, s) {
  const isStep = Array.isArray(s.size);
  const sizes = isStep ? s.size : [s.size];
  const parts = [`fontSize: ${isStep ? `[${sizes.join(', ')}]` : sizes[0]}`];

  if (s.lineHeight != null) {
    // lineHeight > 3 is already absolute px; <= 3 is a multiplier (RN wants px).
    const lh = sizes.map((n) => (s.lineHeight > 3 ? s.lineHeight : Math.round(n * s.lineHeight)));
    parts.push(`lineHeight: ${isStep ? `[${lh.join(', ')}]` : lh[0]}`);
  }
  if (s.tracking) {
    const ls = sizes.map((n) => round2(n * s.tracking));
    parts.push(`letterSpacing: ${isStep ? `[${ls.join(', ')}]` : ls[0]}`);
  }
  // NEVER a numeric fontWeight. See the module comment on sansFamily().
  parts.push(`fontFamily: ${s.mono ? 'MONO_FAMILY' : sansFamily(t, s.weight ?? 400)}`);
  if (s.tabular) parts.push(`fontVariant: ['tabular-nums']`);
  if (s.maxScale != null) parts.push(`maxFontSizeMultiplier: ${s.maxScale}`);

  const kind = isStep ? 'PhoneStepTextStyle' : 'PhoneTextStyle';
  return `{ ${parts.join(', ')} } satisfies ${kind}`;
}

function typeBlock(t) {
  const out = ['export const type = {'];
  for (const scope of TS_TYPE_SCOPES) {
    const styles = t.type[scope];
    if (!styles || !allowsTarget(styles, 'ts')) continue;
    out.push(`  ${scope}: {`);
    for (const [name, s] of Object.entries(styles)) {
      if (name === 'targets' || name === 'unit') continue;
      if (!allowsTarget(s, 'ts')) continue;
      out.push(`    ${name}: ${styleLiteral(t, s)},`);
    }
    out.push('  },');
  }
  out.push('};');
  return out.join('\n');
}

/** `targets` and `unit` are schema metadata, never emitted values. */
function strip(obj) {
  const { targets, unit, ...rest } = obj;
  return rest;
}

function colorBlock(t) {
  const theme = (name) => {
    const entries = Object.entries(t.color)
      .filter(([, v]) => allowsTarget(v, 'ts'))
      .map(([k, v]) => `    ${k}: '${v[name]}',`);
    return `  ${name}: {\n${entries.join('\n')}\n  },`;
  };
  return `export const color = {\n${theme('light')}\n${theme('dark')}\n};`;
}

function callBlock(t) {
  const theme = (name) =>
    `  ${name}: { fill: [${t.call.fill[name].map((h) => `'${h}'`).join(', ')}], ` +
    `ink: '${t.call.ink[name]}', edge: '${t.call.edge[name]}', slab: '${t.call.slab[name]}' },`;
  return [
    '/** RESERVED (§2.4 Rule 0): only a component rendering a live patient call may read this. */',
    'export const call = {',
    theme('light'),
    theme('dark'),
    `  edgeWidth: ${JSON.stringify(t.call.edgeWidth)},`,
    `  thresholdsSec: [${t.call.thresholdsSec.join(', ')}],`,
    '};',
  ].join('\n');
}

function scalarBlocks(t) {
  const groups = { space: t.space, gutter: t.gutter, radius: t.radius, control: t.control, border: t.border, rail: t.rail, size: t.size, motion: t.motion };
  const out = [];
  for (const [name, group] of Object.entries(groups)) {
    if (!allowsTarget(group, 'ts')) continue;
    out.push(`export const ${name} = ${JSON.stringify(strip(group), null, 2)};`);
  }
  if (allowsTarget(t.shadow, 'ts')) {
    out.push('/** CSS values, carried for parity (§4.5 targets ["css","ts"]). RN consumes neither. */');
    out.push(`export const shadow = ${JSON.stringify(strip(t.shadow), null, 2)};`);
  }
  return out.join('\n\n');
}

export function emitTs(t) {
  const families = Object.values(t.font.sans.phoneFamilies);
  const out = `// GENERATED by tools/generate-tokens.mjs from tokens.json v${t.meta.version}. DO NOT EDIT.
import { Platform } from 'react-native';

/** §3: React Native on Android resolves a font family by NAME per weight, not by a numeric
 *  axis. These are the four faces expo-font must load; \`fonts.ts\` cross-checks the list. */
export const interFamilies = [${families.map((f) => `'${f}'`).join(', ')}] as const;
export type InterFamily = (typeof interFamilies)[number];

export type MonoFamily = 'monospace' | 'Menlo';
/** No mono font file is shipped to the phone (§9 lists only the four Inter faces), so mono
 *  styles use the platform monospace family — inherently tabular, zero APK cost. */
export const MONO_FAMILY: MonoFamily = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

export interface PhoneTextStyle {
  fontSize: number;
  lineHeight?: number;
  letterSpacing?: number;
  fontFamily: InterFamily | MonoFamily;
  fontVariant?: 'tabular-nums'[];
  maxFontSizeMultiplier?: number;
  /** Structurally forbidden. RN resolves a family NAME per weight; a numeric weight here
   *  renders 400 on Android while looking correct on web. Use the family, always. */
  fontWeight?: never;
}

export interface PhoneStepTextStyle extends Omit<PhoneTextStyle, 'fontSize' | 'lineHeight' | 'letterSpacing'> {
  fontSize: [number, number, number];
  lineHeight?: [number, number, number];
  letterSpacing?: [number, number, number];
}

export type AgeStepIndex = 1 | 2 | 3;

/** Flattens a step style to the one step being rendered. */
export function atStep(s: PhoneStepTextStyle, step: AgeStepIndex): PhoneTextStyle {
  const i = step - 1;
  return {
    ...s,
    fontSize: s.fontSize[i],
    lineHeight: s.lineHeight?.[i],
    letterSpacing: s.letterSpacing?.[i],
  };
}

${colorBlock(t)}
export type ThemeColors = typeof color.light;
export type ThemeMode = 'light' | 'dark';

${callBlock(t)}

${typeBlock(t)}

${scalarBlocks(t)}
`;
  assertNoUndefined(out, 'ts');
  return out;
}
```

Then register it in `tools/generate-tokens.mjs`. This plan does NOT own that file's `EMITTERS` object (the dashboard-and-landing plan does — see Global Constraints); every edit here is additive so it survives either merge order. Add the import beside the existing one at the top of the file:

```js
import { emitTs } from './lib/emit-ts.mjs';
```

**Add a `ts:` key to the existing `EMITTERS` object — do not rewrite the object.** By the time this task runs, `EMITTERS` already has a `css` entry (Plan 1) and, once the dashboard-and-landing plan has landed, a `landing` entry too; either way, add only this line inside the object literal:

```js
  ts: { path: tokens.meta.outputs.ts, render: emitTs },
```

**Append to the existing `export { … }` list — do not replace it:**

```js
export { emitCss, emitTs };
```

(If `emitCss` is already exported alongside `emitLanding`, the result is `export { emitCss, emitLanding, emitTs };` — append `emitTs`, keep everything already there.)

- [ ] **Step 4: Run test to verify it passes, then generate**

Run:

```bash
cd /Users/baxrom/ish_full/soat-design
node --test tools/*.test.mjs
node tools/generate-tokens.mjs
node tools/generate-tokens.mjs --check
```

Expected: all tests pass; `wrote mobile-app/src/theme.ts`; `--check` exits 0.

- [ ] **Step 5: Read the generated file once, by eye**

Run: `cd /Users/baxrom/ish_full/soat-design && grep -n "fontFamily\|fontWeight" mobile-app/src/theme.ts | head -40`

Expected: every hit is `fontFamily: 'Inter_...'` or `fontFamily: MONO_FAMILY`, plus exactly one `fontWeight?: never;` in the interface. **If any line reads `fontWeight: 700`, stop — the emitter is wrong and every screen built on it will be silently wrong.**

> The phone app does **not** typecheck between this task and Task 4: `ThemeContext.tsx` still imports the deleted `darkColors` / `lightColors`. That is expected, and Task 4 Step 2 is the check that closes it.

- [ ] **Step 6: Commit**

```bash
cd /Users/baxrom/ish_full/soat-design
git add tools/lib/emit-ts.mjs tools/emit-ts.test.mjs tools/generate-tokens.mjs mobile-app/src/theme.ts
git commit -m "Add the ts token emitter: fontFamily strings by name, never a numeric weight

RN on Android resolves a family NAME per weight (spec §3, §7). A numeric
fontWeight compiles, runs, passes --check and renders 400 everywhere on the
phone. Two tests make that unshippable: no /fontWeight:\\s*\\d/ in the output,
and the emitted PhoneTextStyle declares fontWeight?: never."
```

---

### Task 2: The `kotlin` emitter — ARGB reorder, em→sp tracking, no shadow

**Files:**
- Create: `tools/lib/emit-kotlin.mjs`
- Create: `tools/emit-kotlin.test.mjs`
- Modify: `tools/generate-tokens.mjs` (the `EMITTERS` map and the re-export)
- Generated: `app/src/main/java/uz/soat/reminder/NurseCallTokens.kt`

**Interfaces:**
- Consumes: `allowsTarget(node, target)` from `tools/lib/emit-css.mjs`.
- Produces: `emitKotlin(tokens) -> string`. The generated file declares top-level `data class WatchTextStyle(size: TextUnit, weight: FontWeight, tabular: Boolean = false, letterSpacing: TextUnit = 0.sp)`, `data class WatchStepTextStyle(size: List<TextUnit>, weight: FontWeight, tabular: Boolean = false, letterSpacing: TextUnit = 0.sp)` and `object NurseCallTokens` containing `Colors`, `Notify`, `Space`, `Gutter`, `Radius`, `Control`, `Border`, `Rail`, `Size`, `Motion`, `CallEdgeWidth`, `TypeWatch`, `callThresholdsSec`, `fontMono`.

- [ ] **Step 1: Write the failing test**

Create `tools/emit-kotlin.test.mjs`:

```js
// tools/emit-kotlin.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emitKotlin } from './lib/emit-kotlin.mjs';

const tokens = JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url), 'utf8'));

test('the watch uses the DARK token set unchanged', () => {
  const kt = emitKotlin(tokens);
  assert.match(kt, /val text1 = Color\(0xFFE9EDED\)/);
  assert.match(kt, /val surface = Color\(0xFF171C1D\)/);
  assert.match(kt, /val accent = Color\(0xFF35C9B6\)/);
});

test('watchOverrides is the only per-target colour exception and it is explicit', () => {
  const kt = emitKotlin(tokens);
  assert.match(kt, /val bg = Color\(0xFF000000\) *\/\/ watchOverrides/);
  assert.match(kt, /val text2 = Color\(0xFFA8B2AF\) *\/\/ watchOverrides/);
  assert.match(kt, /val text3 = Color\(0xFF7C8683\) *\/\/ watchOverrides/);
  assert.doesNotMatch(kt, /0xFF0E1213/); // the dark bg it overrides
});

test('alpha tokens are reordered from #RRGGBBAA to 0xAARRGGBB', () => {
  const kt = emitKotlin(tokens);
  assert.match(kt, /val accentSoft = Color\(0x2E35C9B6\)/);
  assert.match(kt, /val attnSoft = Color\(0x24E0A63A\)/);
});

test('shadow is not emitted to Kotlin at all — the watch has no elevation', () => {
  const kt = emitKotlin(tokens);
  assert.doesNotMatch(kt, /shadow/i);
  assert.doesNotMatch(kt, /12px/);
});

test('type.watch emits in sp with FontWeight objects', () => {
  const kt = emitKotlin(tokens);
  assert.match(kt, /val room = WatchStepTextStyle\(size = listOf\(40\.sp, 44\.sp, 48\.sp\), weight = FontWeight\(700\), tabular = true\)/);
  assert.match(kt, /val timer = WatchTextStyle\(size = 16\.sp, weight = FontWeight\(600\), tabular = true\)/);
  assert.match(kt, /val floor = WatchTextStyle\(size = 14\.sp, weight = FontWeight\(500\)\)/);
});

test('tracking is em at source and converts to sp using the token own size', () => {
  const mutated = structuredClone(tokens);
  mutated.type.watch.title.tracking = -0.02; // 18sp * -0.02em = -0.36sp
  const kt = emitKotlin(mutated);
  assert.match(kt, /val title = WatchTextStyle\(size = 18\.sp, weight = FontWeight\(700\), letterSpacing = \(-0\.36\)\.sp\)/);
});

test('a step array with tracking is a hard error, not a guess', () => {
  const mutated = structuredClone(tokens);
  mutated.type.watch.room.tracking = -0.02;
  assert.throws(() => emitKotlin(mutated), /per-step tracking/);
});

test('targets are honoured: ts-only, css-only and sans tokens do not appear', () => {
  const kt = emitKotlin(tokens);
  assert.doesNotMatch(kt, /Inter/);       // font.sans targets: ["css","ts","landing"]
  assert.doesNotMatch(kt, /roomPhone/);   // targets: ["ts"]
  assert.doesNotMatch(kt, /roomWall/);    // targets: ["css"]
  assert.doesNotMatch(kt, /clamp/);       // type.landing
  assert.doesNotMatch(kt, /bodyLg/);      // type.mgmt is not a watch scope
});

test('spacing is value-named as Space.s16 (Dp), per §4.1', () => {
  const kt = emitKotlin(tokens);
  assert.match(kt, /val s16: Dp = 16\.dp/);
  assert.match(kt, /val s112: Dp = 112\.dp/);
  assert.match(kt, /val c48: Dp = 48\.dp/);
  assert.match(kt, /val r2: Dp = 8\.dp/);
  assert.match(kt, /val rFull: Dp = 999\.dp/);
  assert.match(kt, /val field: Dp = 1\.5\.dp/);
});

test('rail.slots is a count, not a length', () => {
  const kt = emitKotlin(tokens);
  assert.match(kt, /const val slots = 3/);
  assert.match(kt, /val emptyStroke: Dp = 1\.5\.dp/);
  assert.match(kt, /object Watch \{ val w: Dp = 5\.dp; val h: Dp = 12\.dp; val gap: Dp = 4\.dp \}/);
});

test('the reserved call set, its edge widths and the thresholds are emitted', () => {
  const kt = emitKotlin(tokens);
  assert.match(kt, /val callFill = listOf\(Color\(0xFFB9271B\), Color\(0xFFCB2F22\), Color\(0xFFD93726\)\)/);
  assert.match(kt, /val callInk = Color\(0xFFFFFFFF\)/);
  assert.match(kt, /val callEdge = Color\(0xFFFF6B54\)/);
  assert.match(kt, /val callSlab = Color\(0xFFFFFFFF\)/);
  assert.match(kt, /val watch = listOf\(2\.dp, 2\.dp, 4\.dp\)/);
  assert.match(kt, /val callThresholdsSec = listOf\(0, 120, 600\)/);
});

test('notification accents, channels and icon names are emitted for Android', () => {
  const kt = emitKotlin(tokens);
  assert.match(kt, /val accentCall = Color\(0xFFCB2F22\)/);
  assert.match(kt, /val accentCallArgb: Int = 0xFFCB2F22\.toInt\(\)/);
  assert.match(kt, /const val accentCallChannel = "call"/);
  assert.match(kt, /const val accentCallIcon = "ic_notify_call"/);
  assert.match(kt, /val accentSystem = Color\(0xFF0C6A62\)/);
  assert.match(kt, /const val accentSystemChannel = "system"/);
  assert.doesNotMatch(kt, /6C5CE7/i); // the purple that exists in no palette
});

test('a stray undefined in the output is a loud build failure', () => {
  const broken = structuredClone(tokens);
  broken.type.watch.title.size = undefined;
  assert.throws(() => emitKotlin(broken), /Rule 7/);
});

test('the file is a compilable Kotlin unit in the app package', () => {
  const kt = emitKotlin(tokens);
  assert.match(kt, /^\/\/ GENERATED by tools\/generate-tokens\.mjs/);
  assert.match(kt, /package uz\.soat\.reminder/);
  assert.match(kt, /import androidx\.compose\.ui\.graphics\.Color/);
  assert.match(kt, /val fontMono: FontFamily = FontFamily\.Monospace/);
  // Balanced braces is a cheap proxy for "the emitter did not truncate an object".
  assert.equal((kt.match(/\{/g) || []).length, (kt.match(/\}/g) || []).length);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design && node --test tools/emit-kotlin.test.mjs`

Expected: FAIL with `Cannot find module '.../tools/lib/emit-kotlin.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Create `tools/lib/emit-kotlin.mjs`:

```js
// tools/lib/emit-kotlin.mjs
import { allowsTarget } from './emit-css.mjs';
import { assertNoUndefined } from './targets.mjs';
// Same note as emit-ts.mjs: this hand-filters with allowsTarget() rather than
// forTarget()'s structural removal; assertNoUndefined() below is the output-scan half
// of rule 7's guarantee, turning a missed filter into a thrown error.

/** See the note in emit-ts.mjs: each emitter names the type scopes belonging to its
 *  platform. The watch has exactly one — `type.watch`, in sp. */
const KOTLIN_TYPE_SCOPES = ['watch'];

const round2 = (n) => Math.round(n * 100) / 100;
/** Kotlin parses `-0.36.sp` as -(0.36.sp); parenthesised negatives keep it unambiguous. */
const num = (n) => (n < 0 ? `(${n})` : `${n}`);
const dp = (n) => `${num(n)}.dp`;

/** Source is #RRGGBB (opaque) or #RRGGBBAA. Compose wants 0xAARRGGBB. */
export function argb(hex) {
  const h = String(hex).replace('#', '').toUpperCase();
  if (h.length === 6) return `0xFF${h}`;
  if (h.length === 8) return `0x${h.slice(6, 8)}${h.slice(0, 6)}`;
  throw new Error(`emit-kotlin: unsupported colour "${hex}"`);
}
const color = (hex) => `Color(${argb(hex)})`;

function colorsObject(t) {
  const ov = allowsTarget(t.watchOverrides, 'kotlin') ? t.watchOverrides : {};
  const lines = [];
  for (const [k, v] of Object.entries(t.color)) {
    if (!allowsTarget(v, 'kotlin')) continue;
    const overridden = Object.prototype.hasOwnProperty.call(ov, k);
    const hex = overridden ? ov[k] : v.dark;
    lines.push(`        val ${k} = ${color(hex)}${overridden ? ' // watchOverrides' : ''}`);
  }
  // RESERVED (§2.4 Rule 0). The watch is dark-only, so only the dark ramp is emitted.
  lines.push(`        val callFill = listOf(${t.call.fill.dark.map(color).join(', ')})`);
  lines.push(`        val callInk = ${color(t.call.ink.dark)}`);
  lines.push(`        val callEdge = ${color(t.call.edge.dark)}`);
  lines.push(`        val callSlab = ${color(t.call.slab.dark)}`);
  return `    object Colors {\n${lines.join('\n')}\n    }`;
}

function notifyObject(t) {
  if (!allowsTarget(t.notify, 'kotlin')) return null;
  const lines = [];
  for (const [k, v] of Object.entries(t.notify)) {
    if (k === 'targets') continue;
    lines.push(`        val ${k} = ${color(v.value)}`);
    lines.push(`        val ${k}Argb: Int = ${argb(v.value)}.toInt()`);
    lines.push(`        const val ${k}Channel = "${v.channel}"`);
    lines.push(`        const val ${k}Icon = "${v.icon}"`);
  }
  return `    object Notify {\n${lines.join('\n')}\n    }`;
}

/** Dp scales. Non-numeric values (e.g. size.proseMax "62ch") and nested structures
 *  (radius.bands) are skipped — Dp cannot hold them and the watch has no use for them. */
function dpObject(name, group, prefix) {
  if (!allowsTarget(group, 'kotlin')) return null;
  const lines = [];
  for (const [k, v] of Object.entries(group)) {
    if (k === 'targets' || k === 'unit') continue;
    if (typeof v !== 'number') continue;
    const key = prefix ? `${prefix}${k === 'full' ? 'Full' : k}` : k;
    lines.push(`        val ${key}: Dp = ${dp(v)}`);
  }
  return `    object ${name} {\n${lines.join('\n')}\n    }`;
}

function railObject(t) {
  const lines = [];
  for (const [k, v] of Object.entries(t.rail)) {
    if (k === 'targets') continue;
    if (v && typeof v === 'object') {
      const n = k[0].toUpperCase() + k.slice(1);
      lines.push(`        object ${n} { val w: Dp = ${dp(v.w)}; val h: Dp = ${dp(v.h)}; val gap: Dp = ${dp(v.gap)} }`);
    } else if (k === 'slots') {
      lines.push(`        const val slots = ${v}`); // a count of segments, not a length
    } else {
      lines.push(`        val ${k}: Dp = ${dp(v)}`);
    }
  }
  return `    object Rail {\n${lines.join('\n')}\n    }`;
}

function edgeWidthObject(t) {
  const lines = Object.entries(t.call.edgeWidth).map(
    ([k, arr]) => `        val ${k} = listOf(${arr.map(dp).join(', ')})`
  );
  return `    object CallEdgeWidth {\n${lines.join('\n')}\n    }`;
}

function motionObject(t) {
  if (!allowsTarget(t.motion, 'kotlin')) return null;
  // Only the millisecond scalars: `ease` is a CSS cubic-bezier string and
  // `alertRegister: "none"` is a statement, not a value Compose can hold.
  const lines = Object.entries(t.motion)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => `        const val ${k}Ms = ${v}`);
  return `    object Motion {\n${lines.join('\n')}\n    }`;
}

function typeObject(t) {
  const out = [];
  for (const scope of KOTLIN_TYPE_SCOPES) {
    const styles = t.type[scope];
    if (!styles || !allowsTarget(styles, 'kotlin')) continue;
    const unit = styles.unit ?? 'sp';
    const name = 'Type' + scope[0].toUpperCase() + scope.slice(1);
    const lines = [];
    for (const [sName, s] of Object.entries(styles)) {
      if (sName === 'targets' || sName === 'unit') continue;
      if (!allowsTarget(s, 'kotlin')) continue;
      const isStep = Array.isArray(s.size);
      const args = [
        `size = ${isStep ? `listOf(${s.size.map((n) => `${num(n)}.${unit}`).join(', ')})` : `${num(s.size)}.${unit}`}`,
        `weight = FontWeight(${s.weight})`,
      ];
      if (s.tabular) args.push('tabular = true');
      if (s.tracking) {
        if (isStep) {
          throw new Error(
            `emit-kotlin: type.${scope}.${sName} has a step array AND tracking; the spec ` +
              'defines no per-step tracking on the watch, so there is nothing to emit'
          );
        }
        // §7: tracking is em; convert to sp using the token's own size.
        args.push(`letterSpacing = ${num(round2(s.size * s.tracking))}.${unit}`);
      }
      const kind = isStep ? 'WatchStepTextStyle' : 'WatchTextStyle';
      lines.push(`        val ${sName} = ${kind}(${args.join(', ')})`);
    }
    out.push(`    object ${name} {\n${lines.join('\n')}\n    }`);
  }
  return out.join('\n\n');
}

export function emitKotlin(t) {
  const blocks = [
    colorsObject(t),
    notifyObject(t),
    dpObject('Space', t.space, 's'),
    dpObject('Gutter', t.gutter, ''),
    dpObject('Radius', t.radius, 'r'),
    dpObject('Control', t.control, 'c'),
    dpObject('Border', t.border, ''),
    railObject(t),
    dpObject('Size', t.size, ''),
    motionObject(t),
    edgeWidthObject(t),
    typeObject(t),
    `    val callThresholdsSec = listOf(${t.call.thresholdsSec.join(', ')})`,
    allowsTarget(t.font.mono, 'kotlin') ? `    val fontMono: FontFamily = ${t.font.mono.kotlin}` : null,
  ].filter(Boolean);

  const out = `// GENERATED by tools/generate-tokens.mjs from tokens.json v${t.meta.version}. DO NOT EDIT.
package uz.soat.reminder

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

data class WatchTextStyle(
    val size: TextUnit,
    val weight: FontWeight,
    val tabular: Boolean = false,
    val letterSpacing: TextUnit = 0.sp,
)

data class WatchStepTextStyle(
    val size: List<TextUnit>,
    val weight: FontWeight,
    val tabular: Boolean = false,
    val letterSpacing: TextUnit = 0.sp,
)

object NurseCallTokens {
${blocks.join('\n\n')}
}
`;
  assertNoUndefined(out, 'kotlin');
  return out;
}
```

Register it in `tools/generate-tokens.mjs`, additively as in Task 1 — add the import, add ONE `kotlin:` key to the existing `EMITTERS` object, and append `emitKotlin` to the existing `export { … }` list:

```js
import { emitKotlin } from './lib/emit-kotlin.mjs';
```

```js
  kotlin: { path: tokens.meta.outputs.kotlin, render: emitKotlin },
```

```js
export { emitCss, emitTs, emitKotlin };
```

(Again: if `emitLanding` is already in the export list from the dashboard-and-landing plan, append `emitKotlin` to it — `export { emitCss, emitLanding, emitTs, emitKotlin };` — never replace the list.)

- [ ] **Step 4: Run test to verify it passes, then generate**

Run:

```bash
cd /Users/baxrom/ish_full/soat-design
node --test tools/*.test.mjs
node tools/generate-tokens.mjs
node tools/generate-tokens.mjs --check
grep -c "" app/src/main/java/uz/soat/reminder/NurseCallTokens.kt
```

Expected: all tests pass; `wrote app/src/main/java/uz/soat/reminder/NurseCallTokens.kt`; `--check` exits 0.

- [ ] **Step 5: Commit**

```bash
cd /Users/baxrom/ish_full/soat-design
git add tools/lib/emit-kotlin.mjs tools/emit-kotlin.test.mjs tools/generate-tokens.mjs app/src/main/java/uz/soat/reminder/NurseCallTokens.kt
git commit -m "Add the kotlin token emitter for the watch

Dark token set unchanged plus the three explicit watchOverrides (§2.5);
#RRGGBBAA reordered to 0xAARRGGBB; tracking converted em->sp from the token's
own size; shadow deliberately not emitted, because the watch has no elevation."
```

---

### Task 3: Phone font delivery + the three repo lints that keep it honest

The emitter can no longer produce a numeric weight. This task closes the other half: nobody can hand-write one in a screen, and the app refuses to start if a face is missing rather than rendering 400 in silence.

**Files:**
- Create: `tools/guards.test.mjs`
- Create: `mobile-app/src/fonts.ts`
- Create: `mobile-app/jest.setup.js`
- Create: `mobile-app/src/fonts.test.ts`
- Modify: `mobile-app/package.json`

**Interfaces:**
- Consumes: `interFamilies` from the generated `mobile-app/src/theme.ts` (Task 1).
- Produces: `INTER_FONTS: Record<InterFamily, number>` from `mobile-app/src/fonts.ts` — the exact map `useFonts()` is given in Task 4.

- [ ] **Step 1: Write the failing tests**

Create `tools/guards.test.mjs`:

```js
// tools/guards.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir as os_tmpdir } from 'node:os';
// NOT a second implementation of rule 3: imports the scanner and allowlist the
// dashboard-and-landing plan already wired into `--check` (that plan owns
// tools/lib/reserved-red.mjs — see Global Constraints). This file adds only what that
// module's regex genuinely does not cover: the phone's bracket-property spellings.
import { RESERVED_RED_ALLOWLIST, scanReservedRed } from './lib/reserved-red.mjs';

const ROOT = new URL('../', import.meta.url).pathname;

function walk(dir, exts) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) return walk(p, exts);
    return exts.some((e) => p.endsWith(e)) ? [p] : [];
  });
}

const PHONE_SRC = join(ROOT, 'mobile-app/src');
const WATCH_SRC = join(ROOT, 'app/src/main/java/uz/soat/reminder');

test('no numeric fontWeight anywhere in the phone source', () => {
  const offenders = [];
  for (const file of walk(PHONE_SRC, ['.ts', '.tsx'])) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (!/fontWeight\s*[:=]/.test(line)) return;
      if (/fontWeight\?:\s*never/.test(line)) return; // the deliberate ban in theme.ts
      offenders.push(`${file.slice(ROOT.length)}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(
    offenders,
    [],
    'RN on Android resolves a family NAME per weight (§3). Use type.* from theme.ts:\n' +
      offenders.join('\n')
  );
});

// §2.4 Rule 0 / §10 rule 3: red is reserved for a live patient call. The phone reads the
// tokens as `call[mode].fill[step]` / `call.edgeWidth.deskPhone[step]` — a bracket
// property access the imported scanner's regex does not match (it catches `call.fill`/
// `call.edgeWidth` only as a bare dotted identifier) — so this adds exactly that spelling
// on top of the shared scanner, over the shared allowlist.
const PHONE_ONLY_SPELLING = /\bcall\[[a-zA-Z]+\]\.(fill|ink|edge|slab)\b|\bcall\.edgeWidth\b/;

test('call.* tokens are referenced only by components that render a live patient call', () => {
  // The imported scanner already walks mobile-app/src and app/src (SCANNED_ROOTS) with
  // the shared allowlist; this only adds the phone's bracket-property spelling on top.
  const shared = scanReservedRed(ROOT);
  assert.deepEqual(shared, [], 'Red is reserved (§2.4 Rule 0):\n' + shared.map((r) => `${r.file}:${r.line}: ${r.text}`).join('\n'));

  const offenders = [];
  const files = [...walk(PHONE_SRC, ['.ts', '.tsx']), ...walk(WATCH_SRC, ['.kt'])];
  for (const file of files) {
    const rel = file.slice(ROOT.length);
    if (RESERVED_RED_ALLOWLIST.includes(rel)) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (PHONE_ONLY_SPELLING.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [], 'Red is reserved (§2.4 Rule 0) — phone bracket spelling:\n' + offenders.join('\n'));
});

test('a negative fixture PROVES the phone-spelling guard bites, not just that today is clean', () => {
  // Mirrors Plan 1's own reserved-red.test.mjs fixture tests: a clean scan of the real
  // repo does not prove the regex would catch anything. This writes a violation.
  const tmp = mkdtempSync(join(os_tmpdir(), 'phone-red-'));
  try {
    const bad = join(tmp, 'mobile-app/src/components/Toast.tsx');
    mkdirSync(join(bad, '..'), { recursive: true });
    writeFileSync(bad, "const bg = call[mode].fill[2];\n");
    const offenders = [];
    readFileSync(bad, 'utf8').split('\n').forEach((line, i) => {
      if (PHONE_ONLY_SPELLING.test(line)) offenders.push(`${i + 1}: ${line.trim()}`);
    });
    assert.equal(offenders.length, 1, JSON.stringify(offenders));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// §3.5 / §10 rule 10: min-height, never height, on any card, row or button. Also imports
// the shared lint's CSS-side rule (unused by RN, but kept as one entry point) and adds
// the RN-specific StyleSheet.create() property syntax the CSS scanner cannot parse.
const HEIGHT_SCANNED = [
  'mobile-app/src/components/CallCard.tsx',
  'mobile-app/src/components/Banner.tsx',
  'mobile-app/src/components/PrimaryButton.tsx',
];

test('the card, the banner and the button use minHeight, never height', () => {
  const offenders = [];
  for (const rel of HEIGHT_SCANNED) {
    const file = join(ROOT, rel);
    if (!existsSync(file)) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/(^|[^a-zA-Z])height\s*:/.test(line) && !/(min|max|line)Height/.test(line)) {
        offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, [], 'A fixed height clips at 130% OS font scale (§3.5):\n' + offenders.join('\n'));
});

// §4.2 rule 9 (gutter uniqueness), extended to the phone and the watch — §4.2 singles out
// `gutter.phone` ("16, full stop") as the deletion this whole plan exists to enforce, and
// the dashboard-and-landing plan's own lint only scans web stylesheets (finding 11 of the
// plan review). Reuses that plan's `gutterFamily()` naming convention over RN/Kotlin
// source instead of CSS `var()` references.
const GUTTER_TOKEN = /\bgutter\.(phone|watch|app|appNarrow|landing)\b/g;
const gutterFamily = (name) => name.replace(/Narrow$/, '');

test('one gutter per screen module on the phone and the watch too', () => {
  const offenders = [];
  const screens = [
    ...walk(join(PHONE_SRC, 'screens'), ['.tsx']),
    ...walk(WATCH_SRC, ['.kt']).filter((f) => /Screen/.test(f)),
  ];
  for (const file of screens) {
    const rel = file.slice(ROOT.length);
    const text = readFileSync(file, 'utf8');
    const families = new Set([...text.matchAll(GUTTER_TOKEN)].map((m) => gutterFamily(m[1])));
    if (families.size > 1) offenders.push(`${rel}: ${[...families].join(', ')}`);
  }
  assert.deepEqual(offenders, [], 'One gutter per screen module (§4.2):\n' + offenders.join('\n'));
});
```

Create `mobile-app/src/fonts.test.ts`:

```ts
import { INTER_FONTS } from './fonts';
import { interFamilies } from './theme';

test('the expo-font map loads exactly the families theme.ts emits', () => {
  // A face missing here renders as 400 on Android with no error at all.
  expect(Object.keys(INTER_FONTS).sort()).toEqual([...interFamilies].sort());
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
cd /Users/baxrom/ish_full/soat-design && node --test tools/guards.test.mjs
```

Expected: the `fontWeight` guard FAILS, listing the hand-written weights still in `mobile-app/src` (`CallsScreen.tsx`, `LoginScreen.tsx`, `BillingBanner.tsx`, `ThemeToggle.tsx`, `UpdateRequiredScreen.tsx`, `WelcomeScreen.tsx`). The reserved-red tests pass vacuously (the phone/watch files they scan do not exist yet) **provided `tools/lib/reserved-red.mjs` already exists** — it does, because this branch was cut from the dashboard-and-landing plan's finished tip (Task 0). If that import fails to resolve, this plan is being run out of order; go land that plan first. The gutter and height guards pass vacuously for the same "files do not exist yet" reason.

- [ ] **Step 3: Install the phone toolchain and write the font map**

Run (needs network):

```bash
cd /Users/baxrom/ish_full/soat-design/mobile-app
npx expo install expo-font @expo-google-fonts/inter react-native-safe-area-context expo-haptics
npx expo install --dev jest jest-expo @testing-library/react-native @types/jest
```

If `@testing-library/react-native` reports a missing peer, add it explicitly: `npx expo install --dev react-test-renderer@19.2.3`.

Add to `mobile-app/package.json` (`scripts` and a new top-level `jest` key):

```json
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web",
    "test": "jest",
    "typecheck": "tsc --noEmit"
  },
  "jest": {
    "preset": "jest-expo",
    "setupFiles": ["<rootDir>/jest.setup.js"]
  }
```

Create `mobile-app/jest.setup.js`:

```js
// Native modules with no JS implementation under Jest.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const insets = { top: 0, bottom: 0, left: 0, right: 0 };
  return {
    useSafeAreaInsets: () => insets,
    SafeAreaProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    SafeAreaView: ({ children }) => React.createElement(React.Fragment, null, children),
  };
});
```

Create `mobile-app/src/fonts.ts`:

```ts
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { interFamilies, type InterFamily } from './theme';

/** The four static Inter faces. §3: React Native on Android resolves a font family by NAME
 *  per weight, so every weight the theme names must be a separately loaded face. */
export const INTER_FONTS: Record<InterFamily, number> = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
};

/** A face the theme names but the app does not load renders as 400 with no error and no
 *  warning — the exact silent divergence this token pipeline exists to prevent. Fail loud
 *  at import time instead. */
const missing = interFamilies.filter((f) => !(f in INTER_FONTS));
if (missing.length > 0) {
  throw new Error(
    `fonts.ts does not load the families theme.ts emits: ${missing.join(', ')}. ` +
      'On Android the missing weights would render as 400 with no error.'
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
cd /Users/baxrom/ish_full/soat-design/mobile-app && npm test -- src/fonts.test.ts
cd /Users/baxrom/ish_full/soat-design && node --test tools/guards.test.mjs
```

Expected: the Jest test passes. `guards.test.mjs` still FAILS on the legacy screens — that is correct and Tasks 4–10 delete every offender. Note the failing file list; it is the punch list.

- [ ] **Step 5: Commit**

```bash
cd /Users/baxrom/ish_full/soat-design
git add tools/guards.test.mjs mobile-app/package.json mobile-app/package-lock.json mobile-app/jest.setup.js mobile-app/src/fonts.ts mobile-app/src/fonts.test.ts
git commit -m "Phone: load the four Inter faces, and lint the three ways the design can rot

- fonts.ts throws at import if theme.ts names a family the app does not load;
  on Android a missing face renders 400 with no error at all.
- guards.test.mjs: no numeric fontWeight in mobile-app/src, call.* only in the
  allowlisted alert components, and no fixed height on a card/banner/button.
- Jest + @testing-library/react-native: this package had no tests before."
```

---

### Task 4: Wire the phone to the generated theme, and delete the Welcome screen

**Files:**
- Modify: `mobile-app/src/ThemeContext.tsx` (whole file)
- Modify: `mobile-app/App.tsx:1-60, 213-230`
- Delete: `mobile-app/src/screens/WelcomeScreen.tsx`
- (`mobile-app/src/time.ts` is left untouched here on purpose — see the note below Step 3 — and deleted in Task 8, together with the import that reads it.)
- Create: `mobile-app/src/ThemeContext.test.tsx`

**Interfaces:**
- Consumes: `color`, `ThemeColors`, `ThemeMode` from the generated `theme.ts`; `INTER_FONTS` from `fonts.ts`.
- Produces: `useTheme(): { mode: ThemeMode; colors: ThemeColors; toggle: () => void }` — `colors` keys are now token names (`bg`, `surface`, `surfaceSoft`, `surfaceSunken`, `border`, `borderStrong`, `borderField`, `text1`, `text2`, `text3`, `textDisabled`, `accent`, `accentHover`, `accentPress`, `accentInk`, `accentSoft`, `attn`, `attnSoft`, `ok`). **No `call.*` key is exposed here** — Rule 0 keeps the reds inside `CallCard`.

- [ ] **Step 1: Write the failing test**

Create `mobile-app/src/ThemeContext.test.tsx`:

```tsx
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from './ThemeContext';
import { color } from './theme';

function Probe() {
  const { colors, mode } = useTheme();
  return <Text testID="probe">{`${mode}:${colors.accent}:${colors.text1}`}</Text>;
}

test('the provider serves generated token values, not hand-written ones', () => {
  const { getByTestId } = render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>
  );
  const text = getByTestId('probe').props.children as string;
  const [mode, accent, text1] = text.split(':');
  expect(['light', 'dark']).toContain(mode);
  expect(accent).toBe(color[mode as 'light' | 'dark'].accent);
  expect(text1).toBe(color[mode as 'light' | 'dark'].text1);
});

test('the old blue and purple are gone from every theme value', () => {
  const dead = ['#1d5fe0', '#5b9bff', '#696cff', '#6C5CE7', '#2fd6c4'];
  const all = [...Object.values(color.light), ...Object.values(color.dark)].map((v) => v.toLowerCase());
  for (const hex of dead) expect(all).not.toContain(hex.toLowerCase());
});

test('the theme does not leak the reserved call colours to every screen', () => {
  const { colors } = { colors: color.light };
  // Asserted as a prefix filter, never by spelling a reserved token name out: the
  // reserved-red lint (Plan 2 Task 3) scans mobile-app/src for those identifiers, so
  // naming one here would make this very file a Rule 3 violation and break `--check` —
  // the file whose whole job is proving those tokens are absent. The prefix also covers
  // every sibling in that group, which naming a single literal would not.
  expect(Object.keys(colors).filter((k) => k.toLowerCase().startsWith('call'))).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design/mobile-app && npm test -- src/ThemeContext.test.tsx`

Expected: FAIL — `ThemeContext.tsx` imports `darkColors` / `lightColors`, which the generated `theme.ts` no longer exports.

- [ ] **Step 3: Write the implementation**

Replace `mobile-app/src/ThemeContext.tsx` entirely:

```tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { color, type ThemeColors, type ThemeMode } from './theme';

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'nc_theme_mode';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>(systemScheme === 'light' ? 'light' : 'dark');

  useEffect(() => {
    // Foydalanuvchi oldin qo'lda tanlagan mavzu bo'lsa, tizim sozlamasidan ustun turadi.
    SecureStore.getItemAsync(STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark') setMode(saved);
    });
  }, []);

  const toggle = () => {
    setMode((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ mode, colors: color[mode], toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme() faqat ThemeProvider ichida ishlatiladi');
  return ctx;
}
```

Delete the Welcome screen:

```bash
cd /Users/baxrom/ish_full/soat-design
git rm mobile-app/src/screens/WelcomeScreen.tsx
```

**`mobile-app/src/time.ts` is deliberately NOT deleted here.** `CallsScreen.tsx:19` still does `import { elapsedSince } from '../time'`, and `CallsScreen.tsx` is not rewritten until Task 8 (its replacement reads `elapsedLabel` from `lib/ageStep.ts`, which Task 5 has not created yet either). Deleting `time.ts` now would leave the app not typechecking across Tasks 4–7 with no way to close it early — exactly the defect a plan review caught. `time.ts`'s word-form elapsed string ("12 daqiqa") still violates §3.3 and is still recorded as dead code to remove; it is removed by name, together with the import, in Task 8's own `git rm`.

In `mobile-app/App.tsx`: remove the `WelcomeScreen` import (line 6), remove `const [showWelcome, setShowWelcome] = useState(true);` (line 54), and gate the tree on fonts + safe area. Replace the imports at the top:

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as Application from 'expo-application';
import LoginScreen from './src/screens/LoginScreen';
import CallsScreen from './src/screens/CallsScreen';
import UpdateRequiredScreen from './src/screens/UpdateRequiredScreen';
import { INTER_FONTS } from './src/fonts';
```

Replace the `export default function App()` wrapper:

```tsx
export default function App() {
  // §3: RN on Android resolves a family NAME per weight. Rendering before the four faces
  // are loaded shows 400 everywhere, so the app shows a bare ground instead of lying.
  const [fontsLoaded] = useFonts(INTER_FONTS);

  return (
    <SafeAreaProvider>
      <ThemeProvider>{fontsLoaded ? <AppContent /> : <FontGate />}</ThemeProvider>
    </SafeAreaProvider>
  );
}

function FontGate() {
  const { colors } = useTheme();
  return <View style={[styles.root, { backgroundColor: colors.bg }]} />;
}
```

And replace the unauthenticated branch (formerly lines 231–236) with the straight-to-login form:

```tsx
      {email === null ? (
        <LoginScreen onLogin={handleLogin} />
      ) : (
        <CallsScreen
          acknowledgedBy={email}
          onLogout={handleLogout}
          focusCallId={focusCallId}
          onFocusHandled={() => setFocusCallId(null)}
        />
      )}
```

Finally, in `AppContent`, repoint the four `colors.background` / `colors.accent` reads onto the token names — `App.tsx:213, 222, 230` each read `colors.background` as a `backgroundColor` value (repoint all three to `colors.bg`), and `App.tsx:214` reads `colors.accent` for the spinner's `color` prop (the key name is unchanged; `colors.accent` already exists on the generated `ThemeColors`, so this one is a no-op edit — leave it as it is).

- [ ] **Step 4: Run test and typecheck**

Run:

```bash
cd /Users/baxrom/ish_full/soat-design/mobile-app
npm test -- src/ThemeContext.test.tsx
npx tsc --noEmit
```

Expected: the theme tests pass. `tsc` still reports errors inside `CallsScreen.tsx`, `LoginScreen.tsx`, `UpdateRequiredScreen.tsx`, `BillingBanner.tsx` and `ThemeToggle.tsx` — they read the OLD colour key names (`colors.background`, `colors.textPrimary`, `colors.danger`) that no longer exist on the generated `ThemeColors` type. `CallsScreen.tsx`'s `import { elapsedSince } from '../time'` still resolves and still compiles (deliberately — see the note above); it is deleted, together with `time.ts` itself, in Task 8. Those five files are rewritten in Tasks 6–9; the tsc run at the end of Task 9 is the one that must be clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/baxrom/ish_full/soat-design
git add -A mobile-app/src/ThemeContext.tsx mobile-app/src/ThemeContext.test.tsx mobile-app/App.tsx
git commit -m "Phone: serve generated tokens; delete WelcomeScreen

theme.ts is generated now, so ThemeContext hands out token names. The old blue
(#1d5fe0/#5b9bff) is gone. The Welcome screen is deleted from the repo and the
navigator per §6.5 - it replayed on every logout because showWelcome was never
persisted, and the vendor installs and trains in person. src/time.ts is left
in place for now (CallsScreen.tsx still imports it) and deleted in Task 8,
together with the import - its word-form elapsed string ('12 daqiqa') violates
§3.3 but the app must keep compiling between here and there."
```

---

### Task 5: The shared ageing mechanism on the phone

**Files:**
- Create: `mobile-app/src/lib/ageStep.ts`
- Create: `mobile-app/src/lib/ageStep.test.ts`

**Interfaces:**
- Consumes: `call.thresholdsSec` from the generated `theme.ts`.
- Produces: `type AgeStep = 1 | 2 | 3`, `ageStep(createdAtIso: string, now?: Date): AgeStep`, `elapsedLabel(createdAtIso: string, now?: Date): string`.

- [ ] **Step 1: Write the failing test**

Create `mobile-app/src/lib/ageStep.test.ts`:

```ts
import { ageStep, elapsedLabel } from './ageStep';
import { call } from '../theme';

const at = (secondsAgo: number) => new Date(Date.UTC(2026, 7, 27, 12, 0, 0) - secondsAgo * 1000).toISOString();
const NOW = new Date(Date.UTC(2026, 7, 27, 12, 0, 0));

test('thresholds come from tokens.json and nowhere else', () => {
  expect(call.thresholdsSec).toEqual([0, 120, 600]);
});

test('the three steps sit on the token thresholds', () => {
  expect(ageStep(at(0), NOW)).toBe(1);
  expect(ageStep(at(119), NOW)).toBe(1);
  expect(ageStep(at(120), NOW)).toBe(2);
  expect(ageStep(at(599), NOW)).toBe(2);
  expect(ageStep(at(600), NOW)).toBe(3);
  expect(ageStep(at(99999), NOW)).toBe(3);
});

test('a clock-skewed device produces step 1, never a negative or NaN step', () => {
  expect(ageStep(at(-500), NOW)).toBe(1);
  expect(ageStep('not-a-date', NOW)).toBe(1);
});

test('the timer is m:ss then h:mm:ss, never a word form', () => {
  expect(elapsedLabel(at(0), NOW)).toBe('0:00');
  expect(elapsedLabel(at(9), NOW)).toBe('0:09');
  expect(elapsedLabel(at(125), NOW)).toBe('2:05');
  expect(elapsedLabel(at(3599), NOW)).toBe('59:59');
  expect(elapsedLabel(at(3600), NOW)).toBe('1:00:00');
  expect(elapsedLabel(at(3725), NOW)).toBe('1:02:05');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design/mobile-app && npm test -- src/lib/ageStep.test.ts`

Expected: FAIL with `Cannot find module './ageStep'`.

- [ ] **Step 3: Write the implementation**

Create `mobile-app/src/lib/ageStep.ts`:

```ts
import { call } from '../theme';

/** §5: one shared mechanism. The thresholds live in tokens.json and nowhere else — the
 *  phone reads them out of the generated theme, so /calls, /wall, the phone and the watch
 *  cannot disagree about what step a call is on. */
const [, STEP_2_SEC, STEP_3_SEC] = call.thresholdsSec;

export type AgeStep = 1 | 2 | 3;

function elapsedSec(createdAtIso: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(createdAtIso).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
}

export function ageStep(createdAtIso: string, now?: Date): AgeStep {
  const s = elapsedSec(createdAtIso, now);
  if (s < STEP_2_SEC) return 1;
  if (s < STEP_3_SEC) return 2;
  return 3;
}

/** §3.3: m:ss up to 59:59, then h:mm:ss. Never a word form — a system that makes
 *  tabular-nums non-negotiable cannot swap the glyph class of its most-repeated number. */
export function elapsedLabel(createdAtIso: string, now?: Date): string {
  const s = elapsedSec(createdAtIso, now);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/baxrom/ish_full/soat-design/mobile-app && npm test -- src/lib/ageStep.test.ts`

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/baxrom/ish_full/soat-design
git add mobile-app/src/lib/ageStep.ts mobile-app/src/lib/ageStep.test.ts
git commit -m "Phone: ageStep() and elapsedLabel() reading thresholds from the generated theme

Same shape as the web target's copy (§5), thresholds sourced from tokens.json
via theme.ts so the phone cannot drift from /calls or /wall. m:ss then h:mm:ss."
```

---

### Task 6: The four shared phone primitives

Today's app has two brand marks, two primary buttons, two error banners and the same rounded icon tile at four radii and five sizes. Four components delete all of it by construction.

**Files:**
- Create: `mobile-app/src/components/BrandMark.tsx`
- Create: `mobile-app/src/components/PrimaryButton.tsx`
- Create: `mobile-app/src/components/Banner.tsx`
- Create: `mobile-app/src/components/Rail.tsx`
- Create: `mobile-app/src/components/Banner.test.tsx`
- Delete: `mobile-app/src/components/BillingBanner.tsx`
- Modify: `mobile-app/src/components/ThemeToggle.tsx`

**Interfaces:**
- Consumes: `useTheme()` (Task 4); `type`, `space`, `control`, `radius`, `border`, `size`, `rail`, `call`, `atStep` from `theme.ts`.
- Produces:
  - `BrandMark(): JSX.Element` — `tile.brand` 40×40, `radius.2`, 20px glyph, `accent` fill, `accentInk` glyph. The only square icon tile in the product (§4.3).
  - `PrimaryButton({ label, onPress, busy?, disabled?, testID? })` — `control.56`, `accent`, full width.
  - `Banner({ title, detail?, onClose?, action?, testID? })` — one `attn` banner for errors, offline and billing (§6.5).
  - `Rail({ step, testID? })` — 3 slots always drawn, `call.<theme>.ink` fill, `rail.emptyStroke` outline for empty slots (§5.2).

- [ ] **Step 1: Write the failing test**

Create `mobile-app/src/components/Banner.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../ThemeContext';
import Banner from './Banner';
import { control } from '../theme';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

test('the banner grows rather than clipping: minHeight, never height', () => {
  const { getByTestId } = wrap(<Banner title="Aloqa yo'q" testID="banner" />);
  const style = getByTestId('banner').props.style.flat().reduce((a: object, b: object) => ({ ...a, ...b }), {});
  expect(style.minHeight).toBe(48);
  expect(style.height).toBeUndefined();
});

test('the close control is a full 48px box, not the measured 20x20', () => {
  const { getByTestId } = wrap(<Banner title="Obuna tugaydi" onClose={() => {}} testID="banner" />);
  const style = getByTestId('banner-close').props.style.flat().reduce((a: object, b: object) => ({ ...a, ...b }), {});
  expect(style.width).toBe(control[48]);
  expect(style.minHeight).toBe(control[48]);
});

test('there is no close control when the banner cannot be dismissed', () => {
  const { queryByTestId } = wrap(<Banner title="Aloqa yo'q" testID="banner" />);
  expect(queryByTestId('banner-close')).toBeNull();
});

test('the banner is labelled for a screen reader', () => {
  const { getByTestId } = wrap(<Banner title="Aloqa yo'q" detail="14:02" testID="banner" />);
  expect(getByTestId('banner').props.accessibilityLabel).toBe("Aloqa yo'q. 14:02");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design/mobile-app && npm test -- src/components/Banner.test.tsx`

Expected: FAIL with `Cannot find module './Banner'`.

- [ ] **Step 3: Write the four components**

Create `mobile-app/src/components/BrandMark.tsx`:

```tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { radius, size } from '../theme';

/** §4.3: there is exactly ONE square icon tile in the product. 40x40, radius.2, a 20px
 *  glyph, accent fill, accentInk glyph. It is never rendered at another size, and no other
 *  icon in the app gets a container behind it, ever. */
export default function BrandMark() {
  const { colors } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: colors.accent }]} accessibilityLabel="NurseCall">
      <Feather name="activity" size={size.icon} color={colors.accentInk} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: size.tileBrand,
    height: size.tileBrand,
    borderRadius: radius[2],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

Create `mobile-app/src/components/PrimaryButton.tsx`:

```tsx
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../ThemeContext';
import { control, radius, type } from '../theme';

interface Props {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  testID?: string;
}

/** The one primary button: control.56, accent fill, radius.2, full width. While busy the
 *  label becomes a spinner and the button keeps its height, so nothing reflows (§6.5). */
export default function PrimaryButton({ label, onPress, busy = false, disabled = false, testID }: Props) {
  const { colors } = useTheme();
  const inert = busy || disabled;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inert, busy }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? colors.accentPress : colors.accent, borderRadius: radius[2] },
        disabled && { backgroundColor: colors.surfaceSunken },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.accentInk} />
      ) : (
        <Text style={[type.alert.ackPhone, { color: disabled ? colors.textDisabled : colors.accentInk }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: control[56],
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

Create `mobile-app/src/components/Banner.tsx`:

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { border, control, radius, space, type } from '../theme';

interface Props {
  title: string;
  detail?: string;
  /** Absent => the banner cannot be dismissed (offline, update-required). */
  onClose?: () => void;
  /** An optional inline control, e.g. the offline banner's "Qayta urinish". */
  action?: React.ReactNode;
  testID?: string;
}

/** ONE banner for every non-call notice: form error, offline, billing, outdated. Amber, not
 *  red — red is reserved for a live patient call (§2.3). Always paired with the warning
 *  glyph so it is never colour-alone. */
export default function Banner({ title, detail, onClose, action, testID }: Props) {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
      style={[
        styles.banner,
        { backgroundColor: colors.attnSoft, borderColor: colors.attn, borderRadius: radius[2] },
      ]}
    >
      <Feather name="alert-triangle" size={20} color={colors.attn} style={styles.glyph} />
      <View style={styles.text}>
        <Text style={[type.mgmt.dense, styles.title, { color: colors.attn }]}>{title}</Text>
        {detail ? <Text style={[type.mgmt.meta, { color: colors.text2 }]}>{detail}</Text> : null}
        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
      {onClose ? (
        <Pressable
          testID={testID ? `${testID}-close` : undefined}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Eslatmani yopish"
          style={styles.close}
        >
          <Feather name="x" size={24} color={colors.text3} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: control[48],
    borderWidth: border.field,
    paddingVertical: space[12],
    paddingHorizontal: space[12],
  },
  glyph: { marginRight: space[8], marginTop: space[2] },
  text: { flex: 1 },
  // §3: dense is 13/500; the banner title is the 600 variant of the same size, which the
  // family provides as a separate face rather than a numeric weight.
  title: { fontFamily: 'Inter_600SemiBold' },
  action: { marginTop: space[8], alignSelf: 'flex-start' },
  close: {
    width: control[48],
    minHeight: control[48],
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: space[8],
    marginTop: -space[4],
    marginRight: -space[4],
  },
});
```

Create `mobile-app/src/components/Rail.tsx`:

```tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../ThemeContext';
import { call, rail } from '../theme';
import type { AgeStep } from '../lib/ageStep';

interface Props {
  step: AgeStep;
  testID?: string;
}

/** §5.2: three slots are ALWAYS drawn, so a reader sees "2 of 3" and not just "two".
 *  Filled slots are solid call ink; empty slots are a 1.5px stroke with no fill — zero
 *  alpha in the alert register (Rule 1). Plain rectangles, so CSS, RN and Compose cannot
 *  drift. Vertical column at the left of the card. */
export default function Rail({ step, testID }: Props) {
  const { mode } = useTheme();
  const ink = call[mode].ink;
  return (
    <View style={styles.column} testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[1, 2, 3].map((slot) => (
        <View
          key={slot}
          testID={testID ? `${testID}-slot-${slot}-${slot <= step ? 'on' : 'off'}` : undefined}
          style={[
            styles.slot,
            slot <= step
              ? { backgroundColor: ink }
              : { borderWidth: rail.emptyStroke, borderColor: ink },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { justifyContent: 'center', gap: rail.phone.gap },
  slot: { width: rail.phone.w, height: rail.phone.h },
});
```

Restyle `mobile-app/src/components/ThemeToggle.tsx` — a `control.48` box, `radius.2`, no fill, no border (§4.3: icons in the management register have no container):

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { control, radius, size, space, type } from '../theme';

export default function ThemeToggle() {
  const { mode, colors, toggle } = useTheme();
  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel="Kun/tun rejimini almashtirish"
      style={({ pressed }) => [
        styles.row,
        { borderRadius: radius[2], backgroundColor: pressed ? colors.surfaceSoft : 'transparent' },
      ]}
    >
      <View style={styles.glyph}>
        <Feather name={mode === 'dark' ? 'sun' : 'moon'} size={size.icon} color={colors.text2} />
      </View>
      <Text style={[type.mgmt.bodyLg, { color: colors.text1 }]}>
        {mode === 'dark' ? 'Kunduzgi rejim' : 'Tungi rejim'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: control[48], paddingHorizontal: space[4] },
  glyph: { width: control[48], alignItems: 'center', justifyContent: 'center' },
});
```

Delete the superseded banner:

```bash
cd /Users/baxrom/ish_full/soat-design && git rm mobile-app/src/components/BillingBanner.tsx
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd /Users/baxrom/ish_full/soat-design/mobile-app && npm test -- src/components/Banner.test.tsx
cd /Users/baxrom/ish_full/soat-design && node --test tools/guards.test.mjs
```

Expected: the four Banner tests pass. The `height` guard now scans `Banner.tsx` and `PrimaryButton.tsx` and passes on both. The `fontWeight` guard still fails on the three unrewritten screens.

- [ ] **Step 5: Commit**

```bash
cd /Users/baxrom/ish_full/soat-design
git add -A mobile-app/src/components
git commit -m "Phone: four shared primitives replace the duplicated ones

BrandMark (the ONE 40x40 tile.brand in the product), PrimaryButton (control.56),
Banner (one amber notice for errors, offline, billing and outdated - replacing
two divergent banners, with the measured 20x20 close becoming a 24px glyph in a
48px box) and Rail (3 slots always drawn, zero alpha). BillingBanner deleted."
```

---

### Task 7: The phone call card — the single worst thing in the current product, deleted

Today an incoming patient call renders as a neutral grey card with an 18px bell glyph and an 18px room number, and nothing changes as it ages. The largest text in the whole app is the onboarding headline that no longer exists.

**Files:**
- Create: `mobile-app/src/components/CallCard.tsx`
- Create: `mobile-app/src/components/CallCard.test.tsx`

**Interfaces:**
- Consumes: `Rail` (Task 6); `ageStep`, `elapsedLabel`, `AgeStep` (Task 5); `call`, `type`, `atStep`, `space`, `radius`, `control`, `size` from `theme.ts`; `useTheme()`.
- Produces: `CallCard({ roomNumber, floor, createdAt, solo?, onAck?, now?, testID? })`. **The acknowledge slab renders `if (onAck)`** — the same display-only guarantee the web card carries, expressed in the type signature rather than in a variant string.

- [ ] **Step 1: Write the failing test**

Create `mobile-app/src/components/CallCard.test.tsx`:

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../ThemeContext';
import CallCard from './CallCard';
import { useTheme } from '../ThemeContext';
import { call, control, radius, type } from '../theme';

const NOW = new Date(Date.UTC(2026, 7, 27, 12, 0, 0));
const at = (s: number) => new Date(NOW.getTime() - s * 1000).toISOString();

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);
const flat = (node: { props: { style: unknown } }) =>
  [node.props.style].flat(3).reduce((a: object, b: object) => ({ ...a, ...(b ?? {}) }), {}) as Record<string, unknown>;

/** Renders alongside a hidden probe that reads the SAME useTheme() the card uses, so a
 *  fill assertion can compare against the exact mode in force rather than "either theme"
 *  — a card that read light.fill while the provider actually resolved to dark would
 *  otherwise still pass a toContain([light, dark]) check. */
function wrapWithModeProbe(ui: React.ReactElement) {
  let mode: 'light' | 'dark' = 'light';
  function ModeProbe() {
    mode = useTheme().mode;
    return null;
  }
  const result = render(
    <ThemeProvider>
      <ModeProbe />
      {ui}
    </ThemeProvider>
  );
  return { ...result, getMode: () => mode };
}

test('the room number is the largest thing on the card and grows with every step', () => {
  for (const [seconds, expected] of [[0, 64], [200, 72], [900, 80]] as const) {
    const { getByTestId } = wrap(<CallCard roomNumber="1204" floor={3} createdAt={at(seconds)} now={NOW} testID="c" />);
    expect(flat(getByTestId('c-room')).fontSize).toBe(expected);
  }
});

test('the solo card uses the phoneSolo scale', () => {
  const { getByTestId } = wrap(<CallCard roomNumber="214" floor={3} createdAt={at(0)} now={NOW} solo testID="c" />);
  expect(flat(getByTestId('c-room')).fontSize).toBe(88);
});

test('§3.5: the room number and timer cap at 1.2, and nothing else caps at all', () => {
  const { getByTestId } = wrap(<CallCard roomNumber="1204" floor={3} createdAt={at(0)} now={NOW} onAck={() => {}} testID="c" />);
  expect(getByTestId('c-room').props.maxFontSizeMultiplier).toBe(1.2);
  expect(getByTestId('c-timer').props.maxFontSizeMultiplier).toBe(1.2);
  // Small alert text is the text that most needs to scale.
  expect(getByTestId('c-floor').props.maxFontSizeMultiplier).toBeUndefined();
  expect(getByTestId('c-ack-label').props.maxFontSizeMultiplier).toBeUndefined();
});

test('the card has no fixed height, so 130% scale grows it instead of clipping', () => {
  const { getByTestId } = wrap(<CallCard roomNumber="1204" floor={3} createdAt={at(0)} now={NOW} testID="c" />);
  const style = flat(getByTestId('c'));
  expect(style.height).toBeUndefined();
  expect(style.borderRadius).toBe(radius[3]);
});

test('the fill and the edge width escalate with the step', () => {
  const { getByTestId, rerender, getMode } = wrapWithModeProbe(
    <CallCard roomNumber="214" floor={3} createdAt={at(0)} now={NOW} testID="c" />
  );
  const mode = getMode(); // whichever the provider actually resolved to, exactly once
  const step1 = flat(getByTestId('c'));
  rerender(<ThemeProvider><CallCard roomNumber="214" floor={3} createdAt={at(900)} now={NOW} testID="c" /></ThemeProvider>);
  const step3 = flat(getByTestId('c'));
  // Exact match against the mode actually in force — not "either theme", which would
  // still pass if the card read the wrong theme's ramp.
  expect(step1.backgroundColor).toBe(call[mode].fill[0]);
  expect(step3.backgroundColor).toBe(call[mode].fill[2]);
  expect(step1.borderWidth).toBe(call.edgeWidth.deskPhone[0]);
  expect(step3.borderWidth).toBe(call.edgeWidth.deskPhone[2]);
});

test('all three rail slots are always drawn, and the filled count is the step', () => {
  const { getByTestId, queryByTestId } = wrap(<CallCard roomNumber="214" floor={3} createdAt={at(200)} now={NOW} testID="c" />);
  expect(getByTestId('c-rail-slot-1-on')).toBeTruthy();
  expect(getByTestId('c-rail-slot-2-on')).toBeTruthy();
  expect(getByTestId('c-rail-slot-3-off')).toBeTruthy();
  expect(queryByTestId('c-rail-slot-3-on')).toBeNull();
});

test('the slab renders only when onAck is given, and is the only tappable thing', () => {
  const withAck = wrap(<CallCard roomNumber="214" floor={3} createdAt={at(0)} now={NOW} onAck={() => {}} testID="c" />);
  expect(flat(withAck.getByTestId('c-ack')).minHeight).toBe(control[64]);
  // The card body is inert: exactly one button-role element exists (the slab). A plain
  // <View> never has onStartShouldSetResponder regardless of whether it is tappable, so
  // that check cannot fail on a real defect — assert structurally instead.
  expect(withAck.queryAllByRole('button')).toHaveLength(1);

  const displayOnly = wrap(<CallCard roomNumber="214" floor={3} createdAt={at(0)} now={NOW} testID="c" />);
  expect(displayOnly.queryByTestId('c-ack')).toBeNull();
  expect(displayOnly.queryAllByRole('button')).toHaveLength(0);
});

test('the timer is tabular and reads m:ss', () => {
  const { getByTestId } = wrap(<CallCard roomNumber="214" floor={3} createdAt={at(125)} now={NOW} testID="c" />);
  expect(getByTestId('c-timer').props.children).toBe('2:05');
  expect(flat(getByTestId('c-timer')).fontVariant).toEqual(['tabular-nums']);
});

test('the card announces the call rather than reading out four disconnected numbers', () => {
  const { getByTestId } = wrap(<CallCard roomNumber="214" floor={3} createdAt={at(125)} now={NOW} testID="c" />);
  expect(getByTestId('c').props.accessibilityLabel).toBe('214-xona, 3-qavat, 2:05 kutmoqda');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design/mobile-app && npm test -- src/components/CallCard.test.tsx`

Expected: FAIL with `Cannot find module './CallCard'`.

- [ ] **Step 3: Write the implementation**

Create `mobile-app/src/components/CallCard.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../ThemeContext';
import { ageStep, elapsedLabel, type AgeStep } from '../lib/ageStep';
import { atStep, call, control, radius, space, type } from '../theme';
import Rail from './Rail';

interface Props {
  roomNumber: string;
  floor: number;
  createdAt: string;
  /** Exactly one call: the pocket case, and the most common real state (§6.5). */
  solo?: boolean;
  /** Absent => display-only. The slab renders `if (onAck)`, so display-only is a property
   *  of the type signature rather than of a variant string a typo could defeat. */
  onAck?: () => void | Promise<void>;
  /** Tests only: freezes the clock. */
  now?: Date;
  testID?: string;
}

export default function CallCard({ roomNumber, floor, createdAt, solo = false, onAck, now, testID }: Props) {
  const { mode } = useTheme();
  const insets = useSafeAreaInsets();
  const [, tick] = useState(0);
  const [busy, setBusy] = useState(false);

  // Re-read the clock every second so the timer counts and the step escalates between
  // polls. This is a state update, not motion: nothing animates, pulses or crossfades.
  useEffect(() => {
    if (now) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [now]);

  const step: AgeStep = ageStep(createdAt, now);
  const reds = call[mode];
  const fill = reds.fill[step - 1];
  const ink = reds.ink;

  // §6.5: one light impact at each step transition. Three vibrations over ten minutes,
  // never a repeating pattern — a phone that buzzes continuously ends up in a drawer.
  const [lastStep, setLastStep] = useState<AgeStep>(step);
  useEffect(() => {
    if (step === lastStep) return;
    setLastStep(step);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [step, lastStep]);

  const roomStyle = atStep(solo ? type.alert.roomPhoneSolo : type.alert.roomPhone, step);
  const timer = elapsedLabel(createdAt, now);

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
    <View
      testID={testID}
      accessibilityRole="summary"
      accessibilityLabel={`${roomNumber}-xona, ${floor}-qavat, ${timer} kutmoqda`}
      style={[
        styles.card,
        solo && styles.solo,
        {
          backgroundColor: fill,
          borderColor: reds.edge,
          borderWidth: call.edgeWidth.deskPhone[step - 1],
          borderRadius: radius[3],
        },
      ]}
    >
      <View style={styles.row}>
        <Rail step={step} testID={testID ? `${testID}-rail` : undefined} />
        <View style={styles.body}>
          <View style={styles.headline}>
            <Text
              testID={testID ? `${testID}-room` : undefined}
              maxFontSizeMultiplier={roomStyle.maxFontSizeMultiplier}
              numberOfLines={1}
              style={[roomStyle, { color: ink }]}
            >
              {roomNumber}
            </Text>
            <Text
              testID={testID ? `${testID}-timer` : undefined}
              maxFontSizeMultiplier={type.alert.timerPhone.maxFontSizeMultiplier}
              style={[type.alert.timerPhone, { color: ink }]}
            >
              {timer}
            </Text>
          </View>
          <Text
            testID={testID ? `${testID}-floor` : undefined}
            style={[type.alert.floorPhone, { color: ink }]}
          >
            {floor}-qavat
          </Text>
        </View>
      </View>

      {solo ? <View style={styles.spacer} /> : null}

      {onAck ? (
        <Pressable
          testID={testID ? `${testID}-ack` : undefined}
          onPress={handleAck}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Tasdiqlash"
          accessibilityState={{ busy }}
          style={[
            styles.slab,
            { backgroundColor: reds.slab, borderRadius: radius[2] },
            solo && { marginBottom: insets.bottom + space[24] },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={fill} />
          ) : (
            <Text
              testID={testID ? `${testID}-ack-label` : undefined}
              style={[type.alert.ackPhone, { color: fill }]}
            >
              Tasdiqlash
            </Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // No fixed height anywhere: at 130% OS scale the card grows and the list scrolls (§3.5).
  card: {
    paddingHorizontal: space[20],
    paddingVertical: space[16],
  },
  solo: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1, marginLeft: space[16] },
  headline: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  // §6.5 solo: the ack slab pins to the card bottom, inside the one-handed thumb arc.
  spacer: { flex: 1 },
  slab: {
    minHeight: control[64], // tap.gloved — the one action that must never be missed
    marginTop: space[16],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

> **§6.5 says the solo card's floor line goes to "20/600" and no such token exists.** This card uses `type.alert.floorPhone` (17/600) in both modes, per the Global Constraints note. Inventing an untokenised 20px is the bug this work exists to delete.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd /Users/baxrom/ish_full/soat-design/mobile-app && npm test -- src/components/CallCard.test.tsx
cd /Users/baxrom/ish_full/soat-design && node --test tools/guards.test.mjs
```

Expected: 9 CallCard tests pass; the reserved-red and fixed-height guards pass on `CallCard.tsx`.

- [ ] **Step 5: Screenshot verification — this is a visual property no unit test covers**

The tests above prove the *numbers*. They cannot prove that the ramp reads as escalation or that a 4-digit room number fits. **On an Android device or emulator:**

```bash
cd /Users/baxrom/ish_full/soat-design/mobile-app && npx expo run:android
```

Confirm by eye and capture a screenshot of each:
1. **Three cards at steps 1 / 2 / 3, oldest first.** The rail reads 1-of-3 / 2-of-3 / 3-of-3, the numeral visibly grows, the edge visibly doubles on the third. Do this in **both light and dark mode** — the light ramp brightens with age and the dark ramp barely moves, which is expected (`tokens.json` `_adjacentStepMinComment`).
2. **Room `"1204"` on a solo card at step 3** (104px): four digits fit inside the card with margin.
3. **The same three cards at 130% OS font scale** (Settings → Display → Font size, second-largest notch): the room number renders at ≤ 96px, the cards grow, the list scrolls, **nothing clips**. This is spec §11.3 and it cannot be automated in Jest, which has no layout engine.

Attach the screenshots to the task before ticking it.

- [ ] **Step 6: Commit**

```bash
cd /Users/baxrom/ish_full/soat-design
git add mobile-app/src/components/CallCard.tsx mobile-app/src/components/CallCard.test.tsx
git commit -m "Phone: the real call card - solid red, 64-104px room number, 3-slot rail

Replaces the 18px grey card with an 18px bell glyph and an 18px room number that
never changed as a call aged. Four non-colour ageing channels (position, rail,
numeral size, edge width), maxFontSizeMultiplier 1.2 on the room and timer only,
minHeight everywhere, card body inert with only the 64px tap.gloved slab tappable."
```

---

### Task 8: The phone Calls screen

This task also creates `SettingsSheet` — moved here from where it used to live (a later "Login/Update-required" task) precisely so this task does not consume a component that does not exist yet. Every task in this plan must end with `npx tsc --noEmit && npm test` green; a forward reference the implementer has to "reorder locally" is the same defect as the `time.ts` ordering finding, just one task over.

**Files:**
- Modify: `mobile-app/src/screens/CallsScreen.tsx` (render + styles rewritten; the polling, ack, watch-sync and billing effects are kept as they are; `time.ts` and the `elapsedSince` import are deleted here)
- Create: `mobile-app/src/screens/CallsScreen.test.tsx`
- Create: `mobile-app/src/components/SettingsSheet.tsx`
- Delete: `mobile-app/src/time.ts`

**Interfaces:**
- Consumes: `CallCard` (Task 7), `Banner` (Task 6), `elapsedLabel` (Task 5), `useTheme()`; `requestIgnoreBatteryOptimizations` from `src/battery.ts`; `type`, `gutter`, `control`, `space`, `radius`, `border`, `size` from `theme.ts`.
- Produces: no new exported symbol from `CallsScreen.tsx`. The screen's contract with `App.tsx` is unchanged: `{ acknowledgedBy, onLogout, focusCallId, onFocusHandled }`. `SettingsSheet({ open, onClose, onLogout, watchConnected, watchSyncing, onResyncWatch })` (consumed by Task 9's Login/Update-required task too, which only imports it here).
- Also produces (exported for the test): `sortOldestFirst(calls: Call[]): Call[]`.

- [ ] **Step 1: Write the failing test**

Create `mobile-app/src/screens/CallsScreen.test.tsx`:

```tsx
import { sortOldestFirst } from './CallsScreen';
import type { Call } from '../api';

const mk = (call_id: number, created_at: string): Call =>
  ({ call_id, room_number: String(100 + call_id), floor: 1, created_at, status: 'active' }) as Call;

test('§5: the list is sorted oldest-first, always, unconditionally', () => {
  const calls = [
    mk(1, '2026-08-27T12:00:30Z'),
    mk(2, '2026-08-27T11:58:00Z'),
    mk(3, '2026-08-27T12:00:00Z'),
  ];
  expect(sortOldestFirst(calls).map((c) => c.call_id)).toEqual([2, 3, 1]);
});

test('sorting does not mutate the polled array', () => {
  const calls = [mk(1, '2026-08-27T12:00:30Z'), mk(2, '2026-08-27T11:58:00Z')];
  sortOldestFirst(calls);
  expect(calls.map((c) => c.call_id)).toEqual([1, 2]);
});

test('an unparseable created_at sorts last instead of poisoning the order', () => {
  const calls = [mk(1, 'nonsense'), mk(2, '2026-08-27T11:58:00Z')];
  expect(sortOldestFirst(calls).map((c) => c.call_id)).toEqual([2, 1]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design/mobile-app && npm test -- src/screens/CallsScreen.test.tsx`

Expected: FAIL — `sortOldestFirst` is not exported from `CallsScreen`.

- [ ] **Step 3: Rewrite the screen**

In `mobile-app/src/screens/CallsScreen.tsx`, **keep** lines 22–29 (the interval constants), the `Props` interface, and every effect from `fetchCalls` through `handleAck` unchanged, with these four edits inside them:

1. Delete the `RefreshControl` import and the `refreshing` state, `setRefreshing` calls and the `refreshControl` prop. §6.5: **no pull-to-refresh** — a gesture competing with a live socket on an alert surface, triggerable one-handed while walking.
2. Delete the `elapsedSince` import from `../time` (the file is gone).
3. Add a `lastOkAt` ref/state so the offline banner has a last-successful-poll time, and record it in `fetchCalls`'s success branch:

```tsx
  const [lastOkAt, setLastOkAt] = useState<Date | null>(null);
  const [offline, setOffline] = useState(false);
```

Inside `fetchCalls`, in the `if (seq === fetchSeqRef.current)` success branch add `setLastOkAt(new Date()); setOffline(false);`, and in the `catch` branch leave `setError` as it is.

4. Add the 10-second offline detector as a new effect:

```tsx
  // §6.5: the state the app has no visual for today, and its most dangerous omission —
  // an empty list and a dead socket look identical. 10 seconds, not one failed poll, so a
  // single dropped request does not flash a banner at a nurse mid-corridor.
  useEffect(() => {
    const id = setInterval(() => {
      setOffline(lastOkAt !== null && Date.now() - lastOkAt.getTime() > 10000);
    }, 1000);
    return () => clearInterval(id);
  }, [lastOkAt]);
```

Before touching `CallsScreen.tsx`, create `mobile-app/src/components/SettingsSheet.tsx` — this screen's header button opens it, so it must exist first:

```tsx
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Application from 'expo-application';
import { useTheme } from '../ThemeContext';
import { requestIgnoreBatteryOptimizations } from '../battery';
import { API_BASE_URL } from '../config';
import ThemeToggle from './ThemeToggle';
import { control, gutter, radius, size, space, type } from '../theme';

interface Props {
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
  watchConnected: boolean | null;
  watchSyncing: boolean;
  onResyncWatch: () => void;
}

/** §4.4 thumb-reach rule: everything destructive lives here, behind the upper-right
 *  button, deliberately outside the one-handed arc. Logging out mid-shift by accident is
 *  the failure mode being designed against. */
export default function SettingsSheet({ open, onClose, onLogout, watchConnected, watchSyncing, onResyncWatch }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const row = (label: string, icon: React.ComponentProps<typeof Feather>['name'], onPress: () => void, testID: string) => (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, { borderRadius: radius[2], backgroundColor: pressed ? colors.surfaceSoft : 'transparent' }]}
    >
      <View style={styles.glyph}>
        <Feather name={icon} size={size.icon} color={colors.text2} />
      </View>
      <Text style={[type.mgmt.bodyLg, { color: colors.text1 }]}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Yopish" />
      <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: insets.bottom + space[24] }]}>
        <ThemeToggle />
        {row(
          watchSyncing ? 'Soat sinxronlanmoqda…' : watchConnected ? 'Soat: ulandi' : 'Soat: ulanmagan — qayta yuborish',
          'watch',
          onResyncWatch,
          'sheet-watch'
        )}
        {row('Batareya sozlamalari', 'battery-charging', () => { requestIgnoreBatteryOptimizations(); }, 'sheet-battery')}
        {row('Chiqish', 'log-out', onLogout, 'sheet-logout')}
        <Text style={[type.mgmt.monoSm, styles.version, { color: colors.text3 }]}>
          {`v${Application.nativeApplicationVersion ?? '—'} · ${API_BASE_URL.replace(/^https?:\/\//, '')}`}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: '#00000066' },
  sheet: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius[4],
    borderTopRightRadius: radius[4],
    paddingHorizontal: gutter.phone,
    paddingTop: space[12],
    gap: space[4],
  },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: control[48] },
  glyph: { width: control[48], alignItems: 'center', justifyContent: 'center' },
  version: { marginTop: space[12], textAlign: 'center' },
});
```

Now rewrite `CallsScreen.tsx`. Everything from `const renderItem =` to the end of the file becomes ONE contiguous block, in this exact order — the component's render tail, then the component's closing brace, then the two module-level functions, then the stylesheet:

```tsx
  const ordered = sortOldestFirst(calls);
  const solo = ordered.length === 1;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={[type.mgmt.cardTitle, { color: colors.text1 }]}>Chaqiruvlar</Text>
        {ordered.length > 0 ? (
          <View style={[styles.pill, { backgroundColor: colors.accentSoft }]}>
            <Text style={[type.mgmt.dense, { color: colors.accent }]}>{ordered.length} faol</Text>
          </View>
        ) : null}
        <View style={styles.headerSpacer} />
        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Sozlamalar"
          style={styles.headerButton}
        >
          <Feather name="more-vertical" size={size.icon} color={colors.text2} />
        </Pressable>
      </View>

      {offline ? (
        <View style={styles.notice}>
          <Banner
            title="Aloqa yo'q — qayta ulanmoqda"
            detail={lastOkAt ? `Oxirgi yangilanish ${lastOkAt.getHours()}:${String(lastOkAt.getMinutes()).padStart(2, '0')}` : undefined}
            action={
              <Pressable
                onPress={() => fetchCalls(false)}
                accessibilityRole="button"
                accessibilityLabel="Qayta urinish"
                style={[styles.retry, { borderColor: colors.attn }]}
              >
                <Text style={[type.mgmt.dense, { color: colors.attn }]}>Qayta urinish</Text>
              </Pressable>
            }
            testID="offline-banner"
          />
        </View>
      ) : null}

      {error && !offline ? (
        <View style={styles.notice}>
          <Banner title={error} onClose={() => setError(null)} testID="error-banner" />
        </View>
      ) : null}

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : ordered.length === 0 ? (
        <View style={styles.centerFill}>
          <View style={[styles.okDot, { backgroundColor: colors.ok }]} />
          <Text style={[type.alert.floorPhone, styles.centered, { color: colors.text2 }]}>Chaqiruv yo'q</Text>
          <Text style={[type.mgmt.meta, styles.centered, { color: colors.text3 }]}>
            Yangi chaqiruvlar avtomatik ko'rinadi
          </Text>
        </View>
      ) : (
        <FlatList
          data={ordered}
          keyExtractor={(item) => String(item.call_id)}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space[24] }, solo && styles.listSolo]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <CallCard
              roomNumber={item.room_number}
              floor={item.floor}
              createdAt={item.created_at}
              solo={solo}
              onAck={() => handleAck(item.call_id)}
              testID={`call-${item.call_id}`}
            />
          )}
        />
      )}

      {/* §6.5: billing notices render BELOW the active-call list, never above it. */}
      {billing?.warn && !billingDismissed ? (
        <View style={styles.notice}>
          <Banner
            title={billingTitle(billing)}
            detail="Chaqiruvlar ishlashda davom etadi. To'lov uchun rahbariyatga xabar bering."
            onClose={() => setBillingDismissed(true)}
            testID="billing-banner"
          />
        </View>
      ) : null}

      <SettingsSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onLogout={onLogout}
        watchConnected={watchConnected}
        watchSyncing={watchSyncing}
        onResyncWatch={handleResyncWatch}
      />
    </SafeAreaView>
  );
}

/** §5 channel 1: position. The call to run to is physically first, unconditionally. */
export function sortOldestFirst(calls: Call[]): Call[] {
  const key = (c: Call) => {
    const t = new Date(c.created_at).getTime();
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
  };
  return [...calls].sort((a, b) => key(a) - key(b));
}

function billingTitle(notice: BillingNotice): string {
  if (notice.blocked) return "Obuna tugadi — boshqaruv to'xtatildi";
  const days = notice.days_left;
  if (days === null) return 'Obuna muddati tugayapti';
  if (days < 0) return `Obuna to'lovi ${Math.abs(days)} kun kechikdi`;
  if (days === 0) return 'Obuna bugun tugaydi';
  if (days === 1) return 'Obuna ertaga tugaydi';
  return `Obuna ${days} kundan keyin tugaydi`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // §4.2: gutter.phone is 16, full stop. This is the ONLY horizontal number on the screen.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
    minHeight: control[56],
    paddingHorizontal: gutter.phone,
  },
  headerSpacer: { flex: 1 },
  // Thumb-reach rule (§4.4): the menu sits upper-right, deliberately outside the arc.
  headerButton: { width: control[48], minHeight: control[48], alignItems: 'center', justifyContent: 'center' },
  pill: { paddingHorizontal: space[8], paddingVertical: space[2], borderRadius: radius.full },
  notice: { paddingHorizontal: gutter.phone, paddingBottom: space[12] },
  retry: { minHeight: control[48], justifyContent: 'center', paddingHorizontal: space[12], borderWidth: border.field, borderRadius: radius[2] },
  list: { paddingHorizontal: gutter.phone, paddingTop: space[8] },
  listSolo: { flexGrow: 1 },
  separator: { height: space[12] },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: gutter.phone, gap: space[4] },
  centered: { textAlign: 'center' },
  okDot: { width: 12, height: 12, borderRadius: radius.full, marginBottom: space[8] },
});
```

Add the imports this render needs, and the `sheetOpen` state:

```tsx
import { ActivityIndicator, AppState, AppStateStatus, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Banner from '../components/Banner';
import CallCard from '../components/CallCard';
import SettingsSheet from '../components/SettingsSheet';
import { border, control, gutter, radius, size, space, type } from '../theme';
```

```tsx
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);
```

Delete the whole `watchPill` block from the render (the watch-connection state moves into the sheet) but keep the `watchConnected` / `watchSyncing` state and the `handleResyncWatch` function — the sheet consumes them.

Finally, delete the now-dead import and the file it names — this is the closing half of the note in Task 4:

```bash
cd /Users/baxrom/ish_full/soat-design
git rm mobile-app/src/time.ts
```

and delete the line `import { elapsedSince } from '../time';` from `CallsScreen.tsx`'s imports (it was step 2 of the "four edits inside them" above — repeated here because this is the task that actually removes the file it depends on).

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
cd /Users/baxrom/ish_full/soat-design/mobile-app
npm test -- src/screens/CallsScreen.test.tsx
npx tsc --noEmit
npm test
```

Expected: the three sort tests pass; `tsc` is clean for `CallsScreen.tsx` and `SettingsSheet.tsx` specifically (other files still error until Task 9 rewrites them — that is expected and unchanged from before). `SettingsSheet.tsx` was created earlier in THIS task's Step 3, so there is no forward reference to reorder.

- [ ] **Step 5: Commit**

```bash
cd /Users/baxrom/ish_full/soat-design
git add mobile-app/src/screens/CallsScreen.tsx mobile-app/src/screens/CallsScreen.test.tsx mobile-app/src/components/SettingsSheet.tsx
# time.ts's removal is already staged by the `git rm` a few steps above.
git commit -m "Phone: rebuild the Calls screen in the alert register

Oldest-first unconditionally; one 16px gutter (was 20/16/16); SafeAreaView
replaces paddingTop: 60; pull-to-refresh removed (a gesture competing with a
live socket on an alert surface); the offline banner added after 10s
disconnected with the call list kept at full contrast; billing moved BELOW the
call list; the watch-connection pill moved into the upper-right sheet."
```

---

### Task 9: The phone's management surfaces — Login and Update-required

`SettingsSheet` now lives in Task 8 (it is `CallsScreen`'s header button, and Task 8 needed it to exist before its own render); this task consumes it nowhere and only rewrites the two screens below.

**Files:**
- Modify: `mobile-app/src/screens/LoginScreen.tsx` (whole file)
- Modify: `mobile-app/src/screens/UpdateRequiredScreen.tsx` (whole file)
- Create: `mobile-app/src/screens/LoginScreen.test.tsx`

**Interfaces:**
- Consumes: `BrandMark`, `PrimaryButton`, `Banner`, `ThemeToggle` (Task 6); `useTheme()`; `type`, `gutter`, `control`, `space`, `radius`, `border`, `size` from `theme.ts`; `API_BASE_URL` from `src/config.ts`.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Create `mobile-app/src/screens/LoginScreen.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../ThemeContext';
import LoginScreen from './LoginScreen';
import { control } from '../theme';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);
const flat = (node: { props: { style: unknown } }) =>
  [node.props.style].flat(3).reduce((a: object, b: object) => ({ ...a, ...(b ?? {}) }), {}) as Record<string, unknown>;

test('the fields are control.56 with 16px text, so iOS does not zoom', () => {
  const { getByTestId } = wrap(<LoginScreen onLogin={async () => {}} />);
  for (const id of ['login-email', 'login-password']) {
    const style = flat(getByTestId(id));
    expect(style.minHeight).toBe(control[56]);
    expect(style.fontSize).toBe(16);
  }
});

test('the OS password manager can fill it one-handed', () => {
  const { getByTestId } = wrap(<LoginScreen onLogin={async () => {}} />);
  const email = getByTestId('login-email');
  expect(email.props.autoCapitalize).toBe('none');
  expect(email.props.keyboardType).toBe('email-address');
  expect(email.props.textContentType).toBe('username');
  expect(getByTestId('login-password').props.textContentType).toBe('password');
});

test('a failed login surfaces in the shared amber banner and keeps the typed email', () => {
  const { getByTestId, queryByTestId } = wrap(
    <LoginScreen onLogin={async () => { throw new Error('Email yoki parol xato'); }} />
  );
  fireEvent.changeText(getByTestId('login-email'), 'hamshira@klinika.uz');
  fireEvent.changeText(getByTestId('login-password'), 'x');
  fireEvent.press(getByTestId('login-submit'));
  return waitFor(() => {
    expect(getByTestId('login-banner')).toBeTruthy();
    expect(getByTestId('login-email').props.value).toBe('hamshira@klinika.uz');
    expect(queryByTestId('login-banner-close')).toBeTruthy();
  });
});

test('the footer is deliberately technical: the vendor reads it during installation', () => {
  const { getByTestId } = wrap(<LoginScreen onLogin={async () => {}} />);
  expect(getByTestId('login-footer').props.children).toMatch(/^v.+ · .+$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design/mobile-app && npm test -- src/screens/LoginScreen.test.tsx`

Expected: FAIL — no `login-email` testID exists; the current screen has 24/20/24 padding, a card wrapper, a 44px brand mark and its own inline error `Text`.

- [ ] **Step 3: Write the three files**

Replace `mobile-app/src/screens/LoginScreen.tsx` entirely:

```tsx
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Application from 'expo-application';
import { useTheme } from '../ThemeContext';
import { API_BASE_URL } from '../config';
import Banner from '../components/Banner';
import BrandMark from '../components/BrandMark';
import PrimaryButton from '../components/PrimaryButton';
import { border, control, gutter, radius, space, type } from '../theme';

interface Props {
  onLogin: (email: string, password: string) => Promise<void>;
}

export default function LoginScreen({ onLogin }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setError('Email va parolni kiriting');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onLogin(email.trim(), password);
    } catch (e) {
      // The field keeps its typed value (§6.4 Forms).
      setError(e instanceof Error ? e.message : 'Kirishda xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  const field = [
    styles.field,
    { minHeight: control[56], borderColor: colors.borderField, backgroundColor: colors.surface, color: colors.text1, borderRadius: radius[2] },
    type.mgmt.bodyLg,
  ];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + space[8] }]} keyboardShouldPersistTaps="handled">
          <View style={styles.brandBlock}>
            <BrandMark />
            <Text style={[type.mgmt.pageTitle, styles.brandTitle, { color: colors.text1 }]}>NurseCall</Text>
            <Text style={[type.mgmt.bodyLg, { color: colors.text2 }]}>Hisobingizga kiring</Text>
          </View>

          <Text style={[type.mgmt.dense, styles.label, { color: colors.text2, fontFamily: 'Inter_600SemiBold' }]}>Email</Text>
          <TextInput
            testID="login-email"
            style={field}
            value={email}
            onChangeText={setEmail}
            placeholder="hamshira@klinika.uz"
            placeholderTextColor={colors.text3}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            editable={!loading}
          />

          <Text style={[type.mgmt.dense, styles.label, { color: colors.text2, fontFamily: 'Inter_600SemiBold' }]}>Parol</Text>
          <TextInput
            testID="login-password"
            style={field}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.text3}
            secureTextEntry
            textContentType="password"
            editable={!loading}
          />

          {error ? (
            <View style={styles.banner}>
              <Banner title={error} onClose={() => setError(null)} testID="login-banner" />
            </View>
          ) : null}

          <View style={styles.submit}>
            <PrimaryButton label="Kirish" onPress={handleSubmit} busy={loading} testID="login-submit" />
          </View>
        </ScrollView>

        <Text
          testID="login-footer"
          style={[type.mgmt.monoSm, styles.footer, { color: colors.text3, paddingBottom: insets.bottom + space[24] }]}
        >
          {`v${Application.nativeApplicationVersion ?? '—'} · ${API_BASE_URL.replace(/^https?:\/\//, '')}`}
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // §4.2: gutter.phone 16 is the only horizontal number on this screen. The 20/16/16 stack
  // and the `paddingTop: 60` are both gone.
  scroll: { flexGrow: 1, paddingHorizontal: gutter.phone },
  brandBlock: { alignItems: 'flex-start', marginTop: '18%', marginBottom: space[40] },
  brandTitle: { marginTop: space[12] },
  label: { marginTop: space[16], marginBottom: space[4] },
  field: { borderWidth: border.field, paddingHorizontal: space[12] },
  banner: { marginTop: space[16] },
  submit: { marginTop: space[24] },
  footer: { textAlign: 'center', paddingHorizontal: gutter.phone },
});
```

Replace `mobile-app/src/screens/UpdateRequiredScreen.tsx` entirely — three existing components, zero new ones (§6.5):

```tsx
import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext';
import Banner from '../components/Banner';
import BrandMark from '../components/BrandMark';
import PrimaryButton from '../components/PrimaryButton';
import { gutter, space, type } from '../theme';

export default function UpdateRequiredScreen() {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <View style={styles.block}>
        <BrandMark />
        <Text style={[type.mgmt.pageTitle, styles.title, { color: colors.text1 }]}>Ilova eskirgan</Text>
        <Banner
          title="Yangilanish talab qilinadi"
          detail="Bu ilovaning eski versiyasi endi qo'llab-quvvatlanmaydi. Yangi versiyani IT xodimingizdan so'rang."
          testID="update-banner"
        />
        <View style={styles.action}>
          <PrimaryButton label="Yordam olish" onPress={() => Linking.openURL('tg://resolve?domain=bakhromdev')} testID="update-help" />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  block: { flex: 1, justifyContent: 'center', paddingHorizontal: gutter.phone, gap: space[16] },
  title: { marginTop: space[12] },
  action: { marginTop: space[8] },
});
```

`SettingsSheet.tsx` is NOT created here — it was created in Task 8 (`CallsScreen`'s header button needed it to exist first). This task only imports nothing new from it; it is not consumed by either screen this task rewrites.

- [ ] **Step 4: Run the whole suite, the lints and the typechecker**

Run:

```bash
cd /Users/baxrom/ish_full/soat-design/mobile-app && npm test && npx tsc --noEmit
cd /Users/baxrom/ish_full/soat-design && node --test tools/*.test.mjs
```

Expected: every Jest test passes; **`tsc --noEmit` is now clean** (this is the run that had to close, from Task 1's note); `guards.test.mjs` **passes all three lints** — no hand-written `fontWeight` survives in `mobile-app/src`, `call.*` appears only in `theme.ts`, `CallCard.tsx` and `Rail.tsx`, and no card/banner/button carries a fixed `height`.

- [ ] **Step 5: Commit**

```bash
cd /Users/baxrom/ish_full/soat-design
git add mobile-app/src/screens/LoginScreen.tsx mobile-app/src/screens/LoginScreen.test.tsx mobile-app/src/screens/UpdateRequiredScreen.tsx
git commit -m "Phone: rebuild Login and Update-required on shared parts

One gutter, SafeAreaView, control.56 fields at 16px with textContentType so the
OS password manager works one-handed, the shared amber Banner instead of a
second inline error style, and a technical mono footer the vendor reads during
installation."
```

---

### Task 10: Phone notification identity — delete the purple that exists in no palette

**Files:**
- Modify: `mobile-app/src/notifications.ts:26-33`
- Modify: `mobile-app/app.json` (the `expo-notifications` plugin block and `version`)
- Create: `mobile-app/src/notifications.test.ts`

**Interfaces:**
- Consumes: `notify` accents. **`notify.*` carries `targets: ["kotlin"]`, so the TS emitter must not read it** (Task 1 asserts this). The phone therefore names the hex directly, in one place, with the citation.
- Produces: `CALL_CHANNEL_COLOR` from `mobile-app/src/notifications.ts`.

- [ ] **Step 1: Write the failing test**

Create `mobile-app/src/notifications.test.ts`:

```ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { CALL_CHANNEL_COLOR } from './notifications';

test('the notification accent is the call red, not the purple from no palette', () => {
  expect(CALL_CHANNEL_COLOR).toBe('#CB2F22');
});

test('#6C5CE7 is gone from app.json as well as from the code', () => {
  const appJson = readFileSync(join(__dirname, '..', 'app.json'), 'utf8');
  expect(appJson).not.toMatch(/6C5CE7/i);
  expect(appJson).toMatch(/#CB2F22/);
});

test('the phone and the watch are one product with one launcher name', () => {
  const appJson = JSON.parse(readFileSync(join(__dirname, '..', 'app.json'), 'utf8'));
  const strings = readFileSync(join(__dirname, '../../app/src/main/res/values/strings.xml'), 'utf8');
  expect(appJson.expo.name).toBe('NurseCall');
  expect(strings).toMatch(/<string name="app_name">NurseCall<\/string>/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design/mobile-app && npm test -- src/notifications.test.ts`

Expected: FAIL on all three — `CALL_CHANNEL_COLOR` does not exist, `app.json` still holds `#6C5CE7`, and `strings.xml` still says `Chaqiruv monitor`. The third test stays red until Task 15; that is deliberate — it is the tripwire that keeps the two halves of the release named the same thing.

- [ ] **Step 3: Write the implementation**

In `mobile-app/src/notifications.ts`, add above `registerForPushNotificationsAsync`:

```ts
/** notify.accentCall (§2.4). The token carries targets: ["kotlin"], so it is not emitted
 *  into theme.ts; the Expo notification channel needs the literal here and in app.json.
 *  It replaces #6C5CE7, a purple that exists in no palette in the product. A call
 *  notification IS a call, so it takes the call accent. */
export const CALL_CHANNEL_COLOR = '#CB2F22';
```

…and change the channel's `lightColor: '#6C5CE7'` to `lightColor: CALL_CHANNEL_COLOR`.

In `mobile-app/app.json`, change the plugin colour and the version:

```json
    "version": "1.4.0",
```

```json
    "plugins": [
      "expo-secure-store",
      "expo-font",
      [
        "expo-notifications",
        {
          "color": "#CB2F22"
        }
      ]
    ],
```

Also drop `"userInterfaceStyle": "light"` from the `expo` block — the app supports light **and** dark (§2) and pinning the OS style to light makes `useColorScheme()` always report light:

```json
    "userInterfaceStyle": "automatic",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/baxrom/ish_full/soat-design/mobile-app && npm test -- src/notifications.test.ts`

Expected: the first two tests pass. The third still fails on `strings.xml` — Task 15 closes it.

- [ ] **Step 5: Commit**

```bash
cd /Users/baxrom/ish_full/soat-design
git add mobile-app/src/notifications.ts mobile-app/src/notifications.test.ts mobile-app/app.json
git commit -m "Phone: notification accent #6C5CE7 -> #CB2F22; theme follows the OS again

#6C5CE7 existed in no palette in the product (§2.6). A call notification is a
call, so the channel takes notify.accentCall. userInterfaceStyle goes from
'light' to 'automatic' - it was pinning useColorScheme() to light, which made
the dark theme unreachable from the OS setting."
```

---

### Task 11: The Wear theme — seven stock Material 2014 literals become one generated object

`MainActivity.kt` today holds `#F44336`, `#4CAF50`, `#FFC107`, `#1D5FE0`, `#FFB300`, `#D32F2F` and `#6C5CE7`, no theme object, and one file for all UI. After this task the watch shares a single hex with the rest of the product for the first time.

**Files:**
- Create: `app/src/main/java/uz/soat/reminder/NurseCallTheme.kt`
- Modify: `app/build.gradle.kts` (test dependencies; versionCode/versionName come in Task 16)
- Create: `app/src/test/java/uz/soat/reminder/NurseCallThemeTest.kt`

**Interfaces:**
- Consumes: `NurseCallTokens` (Task 2).
- Produces: `nurseCallWearColors(): androidx.wear.compose.material.Colors` and `@Composable fun NurseCallTheme(content: @Composable () -> Unit)`.

- [ ] **Step 1: Write the failing test**

Add the JVM test source set. In `app/build.gradle.kts`, inside `dependencies { … }`:

```kotlin
    testImplementation("junit:junit:4.13.2")
```

Create `app/src/test/java/uz/soat/reminder/NurseCallThemeTest.kt`:

```kotlin
package uz.soat.reminder

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class NurseCallThemeTest {

    @Test
    fun `the wear palette maps every slot to a generated token`() {
        val c = nurseCallWearColors()
        assertEquals(NurseCallTokens.Colors.bg, c.background)
        assertEquals(NurseCallTokens.Colors.surface, c.surface)
        assertEquals(NurseCallTokens.Colors.accent, c.primary)
        assertEquals(NurseCallTokens.Colors.accentInk, c.onPrimary)
        assertEquals(NurseCallTokens.Colors.attn, c.secondary)
        assertEquals(NurseCallTokens.Colors.text1, c.onBackground)
        assertEquals(NurseCallTokens.Colors.text1, c.onSurface)
        assertEquals(NurseCallTokens.Colors.text2, c.onSurfaceVariant)
        assertEquals(NurseCallTokens.Colors.callFill[0], c.error)
        assertEquals(NurseCallTokens.Colors.callInk, c.onError)
    }

    @Test
    fun `the OLED background is true black, not the dark page ground`() {
        // watchOverrides (§2.5): OLED pixels off means battery saved and no corridor dazzle.
        assertEquals(0xFF000000.toInt(), NurseCallTokens.Colors.bg.value.toLong().let { (it shr 32).toInt() })
        assertNotEquals(NurseCallTokens.Colors.bg, NurseCallTokens.Colors.surface)
    }

    @Test
    fun `every stock Material 2014 literal is gone from the watch source`() {
        val dead = listOf("F44336", "4CAF50", "FFC107", "1D5FE0", "FFB300", "D32F2F", "6C5CE7")
        val dir = java.io.File("src/main/java/uz/soat/reminder")
        val offenders = dir.walkTopDown()
            .filter { it.extension == "kt" }
            .flatMap { f -> dead.filter { f.readText().contains(it, ignoreCase = true) }.map { "${f.name}: $it" } }
            .toList()
        assertEquals(emptyList<String>(), offenders)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design && ./gradlew :app:testDebugUnitTest`

Expected: compilation FAILS with `Unresolved reference: nurseCallWearColors`.

- [ ] **Step 3: Write the implementation**

Create `app/src/main/java/uz/soat/reminder/NurseCallTheme.kt`:

```kotlin
package uz.soat.reminder

import androidx.compose.runtime.Composable
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.MaterialTheme

/**
 * Wear Material 1 only (§6.6): no Material 3, no Horologist, no new library, no font file.
 * The watch uses the DARK token set unchanged, plus the three explicit watchOverrides —
 * the first time it shares a single hex with the rest of the product.
 *
 * `error` is the step-1 call fill and `onError` the call ink because Wear's own components
 * carry an error slot; nothing else in this app may be red (§2.4 Rule 0). A login failure,
 * a dead socket and a billing notice are all amber.
 */
fun nurseCallWearColors(): Colors = Colors(
    primary = NurseCallTokens.Colors.accent,
    primaryVariant = NurseCallTokens.Colors.accentPress,
    secondary = NurseCallTokens.Colors.attn,
    secondaryVariant = NurseCallTokens.Colors.attn,
    background = NurseCallTokens.Colors.bg,
    surface = NurseCallTokens.Colors.surface,
    error = NurseCallTokens.Colors.callFill[0],
    onPrimary = NurseCallTokens.Colors.accentInk,
    onSecondary = NurseCallTokens.Colors.accentInk,
    onBackground = NurseCallTokens.Colors.text1,
    onSurface = NurseCallTokens.Colors.text1,
    onSurfaceVariant = NurseCallTokens.Colors.text2,
    onError = NurseCallTokens.Colors.callInk,
)

@Composable
fun NurseCallTheme(content: @Composable () -> Unit) {
    MaterialTheme(colors = nurseCallWearColors(), content = content)
}
```

The third test fails until Tasks 13–15 delete the literals; that is the punch list, same as the phone's.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/baxrom/ish_full/soat-design && ./gradlew :app:testDebugUnitTest --tests '*NurseCallThemeTest'`

Expected: the first two tests pass; the third fails listing `MainActivity.kt: F44336`, `4CAF50`, `FFC107`, `1D5FE0`, `FFB300`, `D32F2F`.

- [ ] **Step 5: Commit**

```bash
cd /Users/baxrom/ish_full/soat-design
git add app/build.gradle.kts app/src/main/java/uz/soat/reminder/NurseCallTheme.kt app/src/test/java/uz/soat/reminder/NurseCallThemeTest.kt
git commit -m "Watch: nurseCallWearColors() maps Wear Material 1 onto the generated tokens

The dark token set unchanged plus the three watchOverrides (§2.5, §6.6). Adds a
JVM unit-test source set to this module, which had none, including the test that
fails while any of the seven stock Material 2014 literals survives."
```

---

### Task 12: The watch's shared ageing mechanism, and who actually acknowledged

Two pure-Kotlin units, both fully testable on the JVM. The second is the one behavioural fix in scope: the watch currently hardcodes `"Palata soati"` as the acknowledger, so call history cannot say who answered. Since the watch can now log in independently it knows the real name — the value in the existing `acknowledged_by` field changes; **no API contract does.**

**Files:**
- Create: `app/src/main/java/uz/soat/reminder/AgeStep.kt`
- Create: `app/src/main/java/uz/soat/reminder/SessionInfo.kt`
- Create: `app/src/test/java/uz/soat/reminder/AgeStepTest.kt`
- Create: `app/src/test/java/uz/soat/reminder/SessionInfoTest.kt`

**Interfaces:**
- Consumes: `NurseCallTokens.callThresholdsSec` (Task 2); `AppPrefs.getToken(context)`.
- Produces:
  - `fun parseIsoMs(iso: String): Long?`
  - `fun ageStep(createdAtIso: String, nowMs: Long = System.currentTimeMillis()): Int` returning 1, 2 or 3
  - `fun elapsedLabel(createdAtIso: String, nowMs: Long = System.currentTimeMillis()): String`
  - `fun sortOldestFirst(calls: List<Call>): List<Call>`
  - `SessionInfo.nameFromJwt(jwt: String): String?` and `SessionInfo.acknowledgedBy(context: Context): String`

- [ ] **Step 1: Write the failing tests**

Create `app/src/test/java/uz/soat/reminder/AgeStepTest.kt`:

```kotlin
package uz.soat.reminder

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AgeStepTest {

    private val now = 1_787_313_600_000L // 2026-08-27T12:00:00Z
    private fun at(secondsAgo: Long) = java.time.Instant.ofEpochMilli(now - secondsAgo * 1000).toString()

    @Test
    fun `thresholds come from the generated tokens and nowhere else`() {
        assertEquals(listOf(0, 120, 600), NurseCallTokens.callThresholdsSec)
    }

    @Test
    fun `the three steps sit on the token thresholds`() {
        assertEquals(1, ageStep(at(0), now))
        assertEquals(1, ageStep(at(119), now))
        assertEquals(2, ageStep(at(120), now))
        assertEquals(2, ageStep(at(599), now))
        assertEquals(3, ageStep(at(600), now))
    }

    @Test
    fun `a naive server timestamp is read as UTC, not as local time`() {
        // The API may return either form; a 5-hour Tashkent offset would put every fresh
        // call straight on step 3 and make the whole ageing scale meaningless.
        assertEquals(1, ageStep("2026-08-27T12:00:00", now))
        assertEquals(1, ageStep("2026-08-27T12:00:00.123456", now))
        assertEquals(1, ageStep("2026-08-27T12:00:00Z", now))
    }

    @Test
    fun `an unparseable timestamp yields step 1 and no crash`() {
        assertNull(parseIsoMs("nonsense"))
        assertEquals(1, ageStep("nonsense", now))
    }

    @Test
    fun `the timer is m colon ss then h colon mm colon ss, never a word form`() {
        assertEquals("0:00", elapsedLabel(at(0), now))
        assertEquals("0:09", elapsedLabel(at(9), now))
        assertEquals("2:05", elapsedLabel(at(125), now))
        assertEquals("59:59", elapsedLabel(at(3599), now))
        assertEquals("1:00:00", elapsedLabel(at(3600), now))
    }

    @Test
    fun `calls are ordered oldest-first, unparseable ones last`() {
        val calls = listOf(
            Call(1, "301", 3, at(10), "active"),
            Call(2, "205", 2, at(400), "active"),
            Call(3, "104", 1, "nonsense", "active"),
        )
        assertEquals(listOf(2, 1, 3), sortOldestFirst(calls).map { it.callId })
    }
}
```

Create `app/src/test/java/uz/soat/reminder/SessionInfoTest.kt`:

```kotlin
package uz.soat.reminder

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SessionInfoTest {

    /** header.payload.signature, base64url, unpadded — exactly what the backend issues. */
    private fun jwt(payloadJson: String): String {
        val enc = java.util.Base64.getUrlEncoder().withoutPadding()
        return listOf("{\"alg\":\"HS256\"}", payloadJson)
            .joinToString(".") { enc.encodeToString(it.toByteArray()) } + ".sig"
    }

    @Test
    fun `the real nurse name is read out of the token the watch already holds`() {
        val token = jwt("""{"sub":"7","name":"Dilnoza Karimova","email":"dilnoza@klinika.uz"}""")
        assertEquals("Dilnoza Karimova", SessionInfo.nameFromJwt(token))
    }

    @Test
    fun `email is the fallback when the name claim is blank`() {
        assertEquals("d@k.uz", SessionInfo.nameFromJwt(jwt("""{"name":"","email":"d@k.uz"}""")))
        assertEquals("d@k.uz", SessionInfo.nameFromJwt(jwt("""{"email":"d@k.uz"}""")))
    }

    @Test
    fun `a malformed or truncated token never throws`() {
        assertNull(SessionInfo.nameFromJwt("garbage"))
        assertNull(SessionInfo.nameFromJwt("a.b"))
        assertNull(SessionInfo.nameFromJwt(jwt("not json")))
        assertNull(SessionInfo.nameFromJwt(""))
    }

    @Test
    fun `unicode in a name survives the decode`() {
        assertEquals("Gulnoraʻ Sobirova", SessionInfo.nameFromJwt(jwt("""{"name":"Gulnoraʻ Sobirova"}""")))
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/baxrom/ish_full/soat-design && ./gradlew :app:testDebugUnitTest`

Expected: compilation FAILS with `Unresolved reference: ageStep` and `Unresolved reference: SessionInfo`.

- [ ] **Step 3: Write the implementation**

Create `app/src/main/java/uz/soat/reminder/AgeStep.kt`:

```kotlin
package uz.soat.reminder

import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeParseException

/**
 * §5: one shared ageing mechanism. The thresholds live in tokens.json and nowhere else —
 * this file reads them out of the generated NurseCallTokens, so the watch cannot disagree
 * with /calls, /wall or the phone about what step a call is on.
 */
fun parseIsoMs(iso: String): Long? =
    try {
        Instant.parse(iso).toEpochMilli()
    } catch (_: DateTimeParseException) {
        // FastAPI may serialise a naive datetime with no offset. The server stores UTC,
        // so read it as UTC rather than as the watch's local zone.
        try {
            LocalDateTime.parse(iso).toInstant(ZoneOffset.UTC).toEpochMilli()
        } catch (_: DateTimeParseException) {
            null
        }
    }

private fun elapsedSec(createdAtIso: String, nowMs: Long): Long {
    val created = parseIsoMs(createdAtIso) ?: return 0
    return ((nowMs - created) / 1000).coerceAtLeast(0)
}

/** 1 | 2 | 3, indexed into every step array in NurseCallTokens as `[step - 1]`. */
fun ageStep(createdAtIso: String, nowMs: Long = System.currentTimeMillis()): Int {
    val s = elapsedSec(createdAtIso, nowMs)
    val t = NurseCallTokens.callThresholdsSec
    return when {
        s < t[1] -> 1
        s < t[2] -> 2
        else -> 3
    }
}

/** §3.3: m:ss up to 59:59, then h:mm:ss. Never a word form. */
fun elapsedLabel(createdAtIso: String, nowMs: Long = System.currentTimeMillis()): String {
    val s = elapsedSec(createdAtIso, nowMs)
    val h = s / 3600
    val m = (s % 3600) / 60
    val sec = s % 60
    return if (h > 0) String.format("%d:%02d:%02d", h, m, sec) else String.format("%d:%02d", m, sec)
}

/** §5 channel 1: position. Oldest first, always, unconditionally. */
fun sortOldestFirst(calls: List<Call>): List<Call> =
    calls.sortedBy { parseIsoMs(it.createdAt) ?: Long.MAX_VALUE }
```

Create `app/src/main/java/uz/soat/reminder/SessionInfo.kt`:

```kotlin
package uz.soat.reminder

import android.content.Context
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.util.Base64

/**
 * Who acknowledged a call. The watch used to send the hardcoded string "Palata soati", so
 * call history could not say who answered. It can now log in on its own, so it holds a JWT
 * carrying the staff name — this reads that claim and sends it.
 *
 * The payload is decoded, NOT verified: the signature is the server's business and the
 * value is used only for attribution in a field the API already accepts. No endpoint, no
 * request shape and no response shape changes.
 */
object SessionInfo {

    /** Kept as the fallback so a provisioning-era token with no name claim still attributes
     *  to something a human recognises, rather than to an empty string. */
    const val FALLBACK = "Palata soati"

    fun nameFromJwt(jwt: String): String? {
        val parts = jwt.split(".")
        if (parts.size < 2) return null
        return try {
            val json = String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8)
            val payload = JSONObject(json)
            val name = payload.optString("name").trim()
            if (name.isNotEmpty()) return name
            val email = payload.optString("email").trim()
            if (email.isNotEmpty()) email else null
        } catch (_: Exception) {
            null
        }
    }

    fun acknowledgedBy(context: Context): String =
        AppPrefs.getToken(context)?.let { nameFromJwt(it) } ?: FALLBACK
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/baxrom/ish_full/soat-design && ./gradlew :app:testDebugUnitTest --tests '*AgeStepTest' --tests '*SessionInfoTest'`

Expected: 10 tests pass. `org.json` is stubbed to throw in the stock Android JVM test runtime — if `SessionInfoTest` fails with `RuntimeException: Stub!`, add `testImplementation("org.json:json:20240303")` to `app/build.gradle.kts` and re-run; that supplies a real implementation to the JVM tests only and ships nothing.

- [ ] **Step 5: Commit**

```bash
cd /Users/baxrom/ish_full/soat-design
git add app/src/main/java/uz/soat/reminder/AgeStep.kt app/src/main/java/uz/soat/reminder/SessionInfo.kt app/src/test/java/uz/soat/reminder/AgeStepTest.kt app/src/test/java/uz/soat/reminder/SessionInfoTest.kt app/build.gradle.kts
git commit -m "Watch: shared ageStep/elapsedLabel, and the real acknowledger name

Thresholds read from the generated NurseCallTokens so the watch cannot drift
from /calls, /wall or the phone (§5). SessionInfo decodes the name claim out of
the JWT the watch already holds, replacing the hardcoded 'Palata soati' that
made call history unable to say who answered. This changes the VALUE sent in the
existing acknowledged_by field and no API contract."
```

---

### Task 13: Watch State A — one active call, full-bleed

Today one call renders as a `Chip` with `"Xona 214"` in `typography.button` and `"3-qavat, tasdiqlash uchun bosing"` beneath it. Wear's `Chip` is a fixed-height (52dp) Row with icon/label/secondaryLabel slots that applies its own content padding and forces `typography.button` on the label; forcing a centred four-element column at 48sp through it fights the component for no benefit (§6.6).

**Files:**
- Create: `app/src/main/java/uz/soat/reminder/CallScreens.kt`
- Create: `app/src/test/java/uz/soat/reminder/CallScreensTest.kt`

**Interfaces:**
- Consumes: `NurseCallTokens`, `WatchTextStyle`, `WatchStepTextStyle` (Task 2); `ageStep`, `elapsedLabel`, `sortOldestFirst` (Task 12).
- Produces:
  - `enum class AckState { IDLE, SENDING, DONE }`
  - `fun roomSizeFor(style: WatchStepTextStyle, step: Int, room: String): TextUnit`
  - `@Composable fun CallRail(step: Int, slotW: Dp, modifier: Modifier)`
  - `@Composable fun SingleCallScreen(call: Call, nowMs: Long, ackState: AckState, onAck: () -> Unit)`

- [ ] **Step 1: Write the failing test**

Create `app/src/test/java/uz/soat/reminder/CallScreensTest.kt`:

```kotlin
package uz.soat.reminder

import androidx.compose.ui.unit.sp
import org.junit.Assert.assertEquals
import org.junit.Test

class CallScreensTest {

    private val room = NurseCallTokens.TypeWatch.room

    @Test
    fun `the room number grows with every step`() {
        assertEquals(40.sp, roomSizeFor(room, 1, "214"))
        assertEquals(44.sp, roomSizeFor(room, 2, "214"))
        assertEquals(48.sp, roomSizeFor(room, 3, "214"))
    }

    @Test
    fun `a room string over four characters autoshrinks so it never ellipsises`() {
        // §6.6: ~7 chars fit at 40sp on a 192dp face; "12-A-B" must shrink, not truncate.
        assertEquals(36.sp, roomSizeFor(room, 3, "12-A-B"))
        assertEquals(48.sp, roomSizeFor(room, 3, "1204")) // exactly four still gets full size
    }

    @Test
    fun `the watch edge width doubles at step three, like every other surface`() {
        assertEquals(NurseCallTokens.CallEdgeWidth.watch[0], NurseCallTokens.CallEdgeWidth.watch[1])
        assertEquals(2f, NurseCallTokens.CallEdgeWidth.watch[0].value)
        assertEquals(4f, NurseCallTokens.CallEdgeWidth.watch[2].value)
    }

    @Test
    fun `three fills exist so three simultaneous calls can show three different reds`() {
        assertEquals(3, NurseCallTokens.Colors.callFill.size)
        assertEquals(3, NurseCallTokens.Colors.callFill.distinct().size)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design && ./gradlew :app:testDebugUnitTest --tests '*CallScreensTest'`

Expected: compilation FAILS with `Unresolved reference: roomSizeFor`.

- [ ] **Step 3: Write the implementation**

Create `app/src/main/java/uz/soat/reminder/CallScreens.kt`:

```kotlin
package uz.soat.reminder

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.Text

enum class AckState { IDLE, SENDING, DONE }

/** §6.6: the room number autoshrinks to 36sp for strings over 4 characters ("12-A").
 *  tokens.json carries no token for this floor; the spec states it verbatim and it lives
 *  here, named, rather than as a bare literal in a layout. */
private val ROOM_AUTOSHRINK: TextUnit = 36.sp
private const val ROOM_FULL_SIZE_CHARS = 4

fun roomSizeFor(style: WatchStepTextStyle, step: Int, room: String): TextUnit =
    if (room.length > ROOM_FULL_SIZE_CHARS) ROOM_AUTOSHRINK else style.size[step - 1]

/** §5.2: three slots ALWAYS drawn — filled slots solid, empty slots a 1.5px stroke with no
 *  fill, so a reader sees "2 of 3" and there is zero alpha in the alert register.
 *  VERTICAL, not horizontal: a horizontal row clips at the edges of a round face. */
@Composable
fun CallRail(step: Int, slotW: Dp = NurseCallTokens.Rail.Watch.w, modifier: Modifier = Modifier) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(NurseCallTokens.Rail.Watch.gap)) {
        for (slot in 1..NurseCallTokens.Rail.slots) {
            val base = Modifier.size(width = slotW, height = NurseCallTokens.Rail.Watch.h)
            Box(
                modifier = if (slot <= step) {
                    base.background(NurseCallTokens.Colors.callInk)
                } else {
                    base.border(NurseCallTokens.Rail.emptyStroke, NurseCallTokens.Colors.callInk)
                }
            )
        }
    }
}

@Composable
private fun alertText(size: TextUnit, style: WatchTextStyle) = TextStyle(
    fontSize = size,
    fontWeight = style.weight,
    letterSpacing = style.letterSpacing,
    // §3: tabular-nums is mandatory on every number in the product.
    fontFeatureSettings = if (style.tabular) "tnum" else null,
)

/**
 * State A — one active call. A full-bleed Box, not a Chip, at RoundedCornerShape(0.dp):
 * the display is already round, and a rounded container inside a round screen throws away
 * a third of the pixels for a border nobody reads (§6.6, §4.3 radius.0 for full-bleed).
 *
 * Nothing here animates. The step swap and the ticking timer are state, not motion (§4.5).
 */
@Composable
fun SingleCallScreen(call: Call, nowMs: Long, ackState: AckState, onAck: () -> Unit) {
    val step = ageStep(call.createdAt, nowMs)
    val fill = NurseCallTokens.Colors.callFill[step - 1]
    val ink = NurseCallTokens.Colors.callInk
    val t = NurseCallTokens.TypeWatch

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(fill, RoundedCornerShape(NurseCallTokens.Radius.r0))
            .border(NurseCallTokens.CallEdgeWidth.watch[step - 1], NurseCallTokens.Colors.callEdge)
    ) {
        CallRail(
            step = step,
            modifier = Modifier
                .align(Alignment.CenterStart)
                .padding(start = NurseCallTokens.Gutter.watch),
        )

        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .padding(horizontal = NurseCallTokens.Space.s32),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(NurseCallTokens.Space.s4),
        ) {
            // Just the number: at 48sp the word "Xona" costs a whole line and adds nothing
            // on a screen whose only content is a room call (§3.4).
            Text(
                text = call.roomNumber,
                color = ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = alertText(roomSizeFor(t.room, step, call.roomNumber), WatchTextStyle(t.room.size[0], t.room.weight, t.room.tabular)),
            )
            Text(
                text = "${call.floor}-qavat",
                color = ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = alertText(t.floor.size, t.floor),
            )
            Text(
                text = elapsedLabel(call.createdAt, nowMs),
                color = ink,
                maxLines = 1,
                textAlign = TextAlign.Center,
                // Fixed width so the digits do not jitter and pull the eye every second.
                modifier = Modifier.width(NurseCallTokens.Space.s64),
                style = alertText(t.timer.size, t.timer),
            )
        }

        // §6.6: a centred ~130dp chip pinned above the chin — NOT a full-width band (the
        // bottom 40dp of a circle is a thin lens, not a bar) and NOT the whole screen (a
        // wrist is brushed constantly). The screen body is inert; only this is tappable.
        Chip(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .width(130.dp)
                .padding(bottom = NurseCallTokens.Gutter.watch),
            onClick = onAck,
            enabled = ackState == AckState.IDLE,
            colors = ChipDefaults.chipColors(
                backgroundColor = NurseCallTokens.Colors.callSlab,
                contentColor = fill,
            ),
            label = {
                when (ackState) {
                    AckState.SENDING -> CircularProgressIndicator(
                        modifier = Modifier.size(NurseCallTokens.Space.s24),
                        indicatorColor = fill,
                    )
                    AckState.DONE -> Text(
                        text = "✓",
                        color = NurseCallTokens.Colors.ok,
                        maxLines = 1,
                        style = alertText(NurseCallTokens.TypeWatch.title.size, NurseCallTokens.TypeWatch.title),
                    )
                    AckState.IDLE -> Text(
                        text = "Tasdiqlash",
                        color = fill,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = alertText(t.ack.size, t.ack),
                    )
                }
            },
        )
    }
}
```

- [ ] **Step 4: Run test and compile**

Run:

```bash
cd /Users/baxrom/ish_full/soat-design
./gradlew :app:testDebugUnitTest --tests '*CallScreensTest'
./gradlew :app:assembleDebug
```

Expected: 4 tests pass and the module compiles. `MainActivity.kt` still renders the old UI; Task 14 switches over.

- [ ] **Step 5: Commit**

```bash
cd /Users/baxrom/ish_full/soat-design
git add app/src/main/java/uz/soat/reminder/CallScreens.kt app/src/test/java/uz/soat/reminder/CallScreensTest.kt
git commit -m "Watch State A: a full-bleed call, 40/44/48sp, with the 3-slot vertical rail

Wear's Chip is a fixed-height Row that forces typography.button on its label, so
a centred 48sp column fights it for no benefit - a Box at RoundedCornerShape(0)
instead, because a rounded container inside a round screen throws away a third
of the pixels. The ack is a centred 130dp white chip above the chin: not a
full-width band, and not the whole screen, because a wrist is brushed constantly."
```

---

### Task 14: Watch States B–F, and MainActivity reduced to state dispatch

**Files:**
- Create: `app/src/main/java/uz/soat/reminder/ChromeScreens.kt`
- Modify: `app/src/main/java/uz/soat/reminder/MainActivity.kt` (whole file)
- Create: `app/src/test/java/uz/soat/reminder/ChromeScreensTest.kt`

**Interfaces:**
- Consumes: `NurseCallTheme` (Task 11), `SingleCallScreen`, `CallRail`, `AckState` (Task 13), `sortOldestFirst`, `SessionInfo` (Task 12), `CallState`, `ApiClient`.
- Produces:
  - `fun statusTone(status: ConnectionStatus): StatusTone` where `enum class StatusTone { OK, PENDING, DEAD }`
  - `fun billingText(notice: BillingNotice): String?` (moved out of `MainActivity.kt` unchanged)
  - `@Composable fun CallListScreen(...)`, `IdleScreen(...)`, `LoginScreen(...)`, `OutdatedScreen()`

- [ ] **Step 1: Write the failing test**

Create `app/src/test/java/uz/soat/reminder/ChromeScreensTest.kt`:

```kotlin
package uz.soat.reminder

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class ChromeScreensTest {

    @Test
    fun `a dead socket is amber or grey, never red - red means a patient is waiting`() {
        assertEquals(StatusTone.OK, statusTone(ConnectionStatus.CONNECTED))
        assertEquals(StatusTone.PENDING, statusTone(ConnectionStatus.CONNECTING))
        assertEquals(StatusTone.DEAD, statusTone(ConnectionStatus.DISCONNECTED))
        assertEquals(StatusTone.DEAD, statusTone(ConnectionStatus.UNAUTHORIZED))
        assertEquals(StatusTone.DEAD, statusTone(ConnectionStatus.OUTDATED))
    }

    @Test
    fun `every status colour comes from the generated tokens`() {
        assertEquals(NurseCallTokens.Colors.accent, toneColor(StatusTone.OK))
        assertEquals(NurseCallTokens.Colors.attn, toneColor(StatusTone.PENDING))
        assertEquals(NurseCallTokens.Colors.text3, toneColor(StatusTone.DEAD))
    }

    @Test
    fun `billing copy still says the thing that matters - calls keep working`() {
        assertEquals(
            "Obuna muddati tugadi — boshqaruv to'xtatilgan. Chaqiruvlar ishlayapti.",
            billingText(BillingNotice(warn = true, daysLeft = -3, blocked = true))
        )
        assertEquals("Obuna 5 kundan keyin tugaydi", billingText(BillingNotice(warn = true, daysLeft = 5, blocked = false)))
        assertNull(billingText(BillingNotice(warn = false, daysLeft = 40, blocked = false)))
    }

    @Test
    fun `every watch string fits the measured Uzbek line budget`() {
        // §6.6: ~7 chars at 40sp, ~11 at 26sp, ~20 at 15sp on a 192dp face minus insets.
        // Read from the SOURCE FILE, not re-typed as literals here — a literal comparison
        // proves nothing about ChromeScreens.kt: renaming a string in the source to
        // something 30 characters long would leave a hand-typed copy here green.
        val source = File("src/main/java/uz/soat/reminder/ChromeScreens.kt").readText()
        val literals = Regex("\"([^\"]*)\"").findAll(source).map { it.groupValues[1] }
            .filter { it.any { c -> c.isLetter() } } // skip "", format specifiers, etc.
            .toList()
        assertTrue("no string literals found in ChromeScreens.kt — did the file move?", literals.isNotEmpty())
        // ~15sp meta/status strings are the ones actually laid out at the ~20-char budget
        // in this file (title/label strings at other sizes are shorter by construction).
        val over20 = literals.filter { it.length > 20 }
        assertEquals("string(s) exceed the 15sp/~20-char watch line budget: $over20", emptyList<String>(), over20)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design && ./gradlew :app:testDebugUnitTest --tests '*ChromeScreensTest'`

Expected: compilation FAILS with `Unresolved reference: statusTone`.

- [ ] **Step 3: Write the implementation**

Create `app/src/main/java/uz/soat/reminder/ChromeScreens.kt`:

```kotlin
package uz.soat.reminder

import android.app.RemoteInput
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.Text
import androidx.wear.input.RemoteInputIntentHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

private const val REMOTE_INPUT_KEY = "nc_login_input"

enum class StatusTone { OK, PENDING, DEAD }

/** §2.3 / §6.6 State C: the disconnected state is amber or a hollow grey ring, never the
 *  old #F44336 red. A watch that looks peacefully idle while it is actually offline is the
 *  worst failure mode this product has — and red must keep meaning "a patient is waiting". */
fun statusTone(status: ConnectionStatus): StatusTone = when (status) {
    ConnectionStatus.CONNECTED -> StatusTone.OK
    ConnectionStatus.CONNECTING -> StatusTone.PENDING
    else -> StatusTone.DEAD
}

fun toneColor(tone: StatusTone): Color = when (tone) {
    StatusTone.OK -> NurseCallTokens.Colors.accent
    StatusTone.PENDING -> NurseCallTokens.Colors.attn
    StatusTone.DEAD -> NurseCallTokens.Colors.text3
}

fun statusText(status: ConnectionStatus): String = when (status) {
    ConnectionStatus.CONNECTING -> "Ulanmoqda…"
    ConnectionStatus.CONNECTED -> "Ulandi"
    ConnectionStatus.DISCONNECTED -> "Ulanish yo'q"
    ConnectionStatus.UNAUTHORIZED -> "Token sozlanmagan"
    ConnectionStatus.OUTDATED -> "Yangilanish kerak"
}

/** null qaytsa — ko'rsatishga arzigulik hech narsa yo'q. */
fun billingText(notice: BillingNotice): String? = when {
    notice.blocked -> "Obuna muddati tugadi — boshqaruv to'xtatilgan. Chaqiruvlar ishlayapti."
    !notice.warn -> null
    notice.daysLeft == null -> "Obuna muddati tugayapti"
    notice.daysLeft <= 0 -> "Obuna muddati tugadi"
    else -> "Obuna ${notice.daysLeft} kundan keyin tugaydi"
}

@Composable
private fun watchText(style: WatchTextStyle) = TextStyle(
    fontSize = style.size,
    fontWeight = style.weight,
    letterSpacing = style.letterSpacing,
    fontFeatureSettings = if (style.tabular) "tnum" else null,
)

/** State B — two or more calls. Each item is filled with THAT call's own step colour, so
 *  three calls can show three different reds and the ranking is visible without reading a
 *  digit. Wear's own scaling renders the top (oldest) item largest, reinforcing the triage
 *  order for free. No swipe gestures: a wrist is not a good place for a gesture with
 *  consequences (§6.6). */
@Composable
fun CallListScreen(calls: List<Call>, nowMs: Long, onOpen: (Call) -> Unit) {
    val ordered = sortOldestFirst(calls)
    Column(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 20.dp)
                .background(NurseCallTokens.Colors.surface),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = "${ordered.size} chaqiruv",
                color = NurseCallTokens.Colors.text2,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = watchText(NurseCallTokens.TypeWatch.meta),
            )
        }
        ScalingLazyColumn(
            modifier = Modifier.fillMaxSize(),
            state = rememberScalingLazyListState(initialCenterItemIndex = 0),
        ) {
            items(ordered, key = { it.callId }) { call ->
                val step = ageStep(call.createdAt, nowMs)
                // The whole 48dp row IS the tap target — "tapping an item opens its State A
                // view" (§6.6) — via .clickable, not a Chip. Wear's Chip forces its own
                // content padding and a fixed 52dp height, which is exactly why State A
                // (Task 13) already stopped using it for the single-call view; a zero-size
                // Chip nested inside this Row would not compile into a usable target at all.
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = NurseCallTokens.Control.c48)
                        .clickable { onOpen(call) }
                        .background(NurseCallTokens.Colors.callFill[step - 1], RoundedCornerShape(NurseCallTokens.Radius.r2))
                        .border(
                            NurseCallTokens.CallEdgeWidth.watch[step - 1],
                            NurseCallTokens.Colors.callEdge,
                            RoundedCornerShape(NurseCallTokens.Radius.r2),
                        )
                        .padding(horizontal = NurseCallTokens.Space.s8),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(NurseCallTokens.Space.s8),
                ) {
                    CallRail(step = step, slotW = 3.dp)
                    Text(
                        text = call.roomNumber,
                        color = NurseCallTokens.Colors.callInk,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                        style = watchText(
                            WatchTextStyle(
                                NurseCallTokens.TypeWatch.roomList.size,
                                NurseCallTokens.TypeWatch.roomList.weight,
                                NurseCallTokens.TypeWatch.roomList.tabular,
                            )
                        ),
                    )
                    Text(
                        text = elapsedLabel(call.createdAt, nowMs),
                        color = NurseCallTokens.Colors.callInk,
                        maxLines = 1,
                        style = watchText(NurseCallTokens.TypeWatch.body.copy(tabular = true)),
                    )
                }
            }
        }
    }
}

/** State C — idle. Pure black, almost no lit pixels. §6.6 State F: the billing notice is
 *  docked HERE and only here; it is never composited over a call card in either the single
 *  or the list state. A patient call never shares a wrist with an invoice. */
@Composable
fun IdleScreen(status: ConnectionStatus, billing: BillingNotice?) {
    val tone = statusTone(status)
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = NurseCallTokens.Gutter.watch),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .size(NurseCallTokens.Space.s8)
                .background(NurseCallTokens.Colors.ok, CircleShape)
        )
        Text(
            text = "Chaqiruv yo'q",
            color = NurseCallTokens.Colors.text2,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = NurseCallTokens.Space.s8),
            style = watchText(NurseCallTokens.TypeWatch.body),
        )
        // Fill vs. hollow is the non-colour channel, so status survives colour blindness.
        Box(
            modifier = Modifier
                .padding(top = NurseCallTokens.Space.s8)
                .size(6.dp)
                .then(
                    if (tone == StatusTone.DEAD) Modifier.border(1.dp, toneColor(tone), CircleShape)
                    else Modifier.background(toneColor(tone), CircleShape)
                )
        )
        if (tone != StatusTone.OK) {
            Text(
                text = statusText(status),
                color = toneColor(tone),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
                style = watchText(NurseCallTokens.TypeWatch.meta),
            )
        }
        billing?.let { billingText(it) }?.let { msg ->
            CompactChip(
                modifier = Modifier.padding(top = NurseCallTokens.Space.s12),
                onClick = {},
                colors = ChipDefaults.chipColors(
                    backgroundColor = NurseCallTokens.Colors.attnSoft,
                    contentColor = NurseCallTokens.Colors.attn,
                ),
                label = {
                    Text(text = msg, maxLines = 1, overflow = TextOverflow.Ellipsis, style = watchText(NurseCallTokens.TypeWatch.meta))
                },
            )
        }
    }
}

/** State E — outdated. No action chip: the watch cannot fix this. */
@Composable
fun OutdatedScreen() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = NurseCallTokens.Gutter.watch),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = "⚠", color = NurseCallTokens.Colors.attn, maxLines = 1, style = watchText(NurseCallTokens.TypeWatch.title))
        Text(
            text = "Ilova eskirgan",
            color = NurseCallTokens.Colors.attn,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = watchText(NurseCallTokens.TypeWatch.title),
        )
        Text(
            text = "Telefondan yangilang",
            color = NurseCallTokens.Colors.text2,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
            style = watchText(NurseCallTokens.TypeWatch.body),
        )
    }
}

/**
 * State D — standalone login. Wear has no on-screen keyboard; text arrives through the
 * system RemoteInput screen, which is the platform's standard approach. A login failure is
 * AMBER, so the watch never shows red for anything except a patient call (§6.6).
 */
@Composable
fun LoginScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var pendingField by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val remoteInputLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val text = result.data?.let { RemoteInput.getResultsFromIntent(it) }
            ?.getCharSequence(REMOTE_INPUT_KEY)?.toString()
        if (text != null) {
            when (pendingField) {
                "email" -> email = text.trim()
                "password" -> password = text
            }
        }
        pendingField = null
    }

    fun launchInput(field: String, label: String) {
        error = null
        pendingField = field
        val intent = RemoteInputIntentHelper.createActionRemoteInputIntent()
        RemoteInputIntentHelper.putRemoteInputsExtra(
            intent, listOf(RemoteInput.Builder(REMOTE_INPUT_KEY).setLabel(label).build())
        )
        remoteInputLauncher.launch(intent)
    }

    fun submit() {
        if (email.isBlank() || password.isBlank()) {
            error = "Email va parolni kiriting"
            return
        }
        error = null
        busy = true
        scope.launch(Dispatchers.IO) {
            try {
                AppPrefs.setToken(context, ApiClient.login(context, email.trim(), password))
            } catch (e: Exception) {
                launch(Dispatchers.Main) { error = e.message ?: "Kirishda xato yuz berdi" }
            } finally {
                launch(Dispatchers.Main) { busy = false }
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = NurseCallTokens.Gutter.watch),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(NurseCallTokens.Space.s4, Alignment.CenterVertically),
    ) {
        Text(
            text = "Hisobingizga kiring",
            color = NurseCallTokens.Colors.text1,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
            style = watchText(NurseCallTokens.TypeWatch.body),
        )
        Chip(
            modifier = Modifier.fillMaxWidth().heightIn(min = NurseCallTokens.Control.c48),
            onClick = { launchInput("email", "Email") },
            colors = ChipDefaults.chipColors(backgroundColor = NurseCallTokens.Colors.surface, contentColor = NurseCallTokens.Colors.text1),
            label = { Text(text = email.ifEmpty { "Email kiriting" }, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        )
        Chip(
            modifier = Modifier.fillMaxWidth().heightIn(min = NurseCallTokens.Control.c48),
            onClick = { launchInput("password", "Parol") },
            colors = ChipDefaults.chipColors(backgroundColor = NurseCallTokens.Colors.surface, contentColor = NurseCallTokens.Colors.text1),
            label = {
                Text(
                    text = if (password.isEmpty()) "Parol kiriting" else "•".repeat(password.length.coerceAtMost(12)),
                    maxLines = 1,
                )
            },
        )
        Chip(
            modifier = Modifier.fillMaxWidth().heightIn(min = NurseCallTokens.Control.c48),
            onClick = { submit() },
            colors = ChipDefaults.chipColors(
                backgroundColor = NurseCallTokens.Colors.accent,
                contentColor = NurseCallTokens.Colors.accentInk,
            ),
            label = { Text(text = if (busy) "Kirilmoqda…" else "Kirish", maxLines = 1) },
        )
        error?.let {
            Text(
                text = "⚠ $it",
                color = NurseCallTokens.Colors.attn,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
                style = watchText(NurseCallTokens.TypeWatch.meta),
            )
        }
    }
}
```

Now replace `app/src/main/java/uz/soat/reminder/MainActivity.kt` entirely — it becomes state dispatch and a clock tick, nothing else:

```kotlin
package uz.soat.reminder

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.TimeText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val requestNotificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestNotificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        ContextCompat.startForegroundService(this, Intent(this, CallMonitorService::class.java))

        setContent { NurseCallTheme { CallMonitorScreen() } }
    }
}

@Composable
fun CallMonitorScreen() {
    val calls by CallState.activeCalls.collectAsState()
    val status by CallState.status.collectAsState()
    val billing by CallState.billingNotice.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // The timer counts and the step escalates once a second. This is a state read, not
    // motion: §4.5 forbids animation in the alert register on every target.
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1000)
            nowMs = System.currentTimeMillis()
        }
    }

    var focusedCallId by remember { mutableStateOf<Int?>(null) }
    var ackState by remember { mutableStateOf(AckState.IDLE) }

    val ordered = sortOldestFirst(calls)
    val focused = ordered.firstOrNull { it.callId == focusedCallId }
    val single = if (ordered.size == 1) ordered.first() else focused

    fun ack(call: Call) {
        ackState = AckState.SENDING
        scope.launch(Dispatchers.IO) {
            // The error must not be swallowed: a nurse who thinks she pressed it and walks
            // away leaves the call open.
            val result = runCatching { ApiClient.ackCall(context, call.callId, SessionInfo.acknowledgedBy(context)) }
            launch(Dispatchers.Main) {
                if (result.isSuccess) {
                    ackState = AckState.DONE
                    delay(700)
                    focusedCallId = null
                    ackState = AckState.IDLE
                } else {
                    ackState = AckState.IDLE
                    android.widget.Toast.makeText(
                        context,
                        "Tasdiqlab bo'lmadi — qayta urinib ko'ring",
                        android.widget.Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }
    }

    Scaffold(timeText = { TimeText() }) {
        when {
            status == ConnectionStatus.OUTDATED -> OutdatedScreen()
            status == ConnectionStatus.UNAUTHORIZED -> LoginScreen()
            ordered.isEmpty() -> IdleScreen(status = status, billing = billing)
            single != null -> SingleCallScreen(call = single, nowMs = nowMs, ackState = ackState, onAck = { ack(single) })
            else -> CallListScreen(calls = ordered, nowMs = nowMs, onOpen = { focusedCallId = it.callId })
        }
    }
}
```

- [ ] **Step 4: Run tests, the literal sweep and the build**

Run:

```bash
cd /Users/baxrom/ish_full/soat-design
./gradlew :app:testDebugUnitTest
./gradlew :app:assembleDebug
node --test tools/guards.test.mjs
```

Expected: every JVM test passes, **including `NurseCallThemeTest.every stock Material 2014 literal is gone`** — the seven `Color(0x…)` literals are now unreferenced and `MainActivity.kt` no longer contains any. The reserved-red lint passes: `call*` now appears in `NurseCallTokens.kt`, `NurseCallTheme.kt`, `CallScreens.kt` **and** `ChromeScreens.kt` — the last is on the allowlist as of this task's own `CallListScreen` (§6.6 State B renders the live multi-call list, so it legitimately reads `callFill`/`callEdge`/`callInk`); no other file may.

- [ ] **Step 5: Screenshot verification on a watch or Wear emulator**

None of the above proves a screen is legible on a 192dp round face. On a real watch or a Wear OS round emulator (`./gradlew :app:installDebug`), capture:

1. **State A at steps 1, 2 and 3.** The room number reads at a 1–2 second glance; the rail sits inside the inscribed square and is not clipped by the round bezel; the 130dp ack chip clears the chin; the timer does not jitter.
2. **State A with room `"12-A-B"`** — the autoshrink holds it on one line.
3. **State B with three calls at three different steps** — three visibly different reds, oldest at the top rendered largest by Wear's own scaling.
4. **States C, D, E, F.** Confirm C is almost entirely unlit pixels, D's login failure is amber, and **F's billing chip appears only on the idle screen** — force a call while the billing notice is active and confirm it is not composited over the call.

- [ ] **Step 6: Commit**

```bash
cd /Users/baxrom/ish_full/soat-design
git add app/src/main/java/uz/soat/reminder/ChromeScreens.kt app/src/main/java/uz/soat/reminder/MainActivity.kt app/src/test/java/uz/soat/reminder/ChromeScreensTest.kt
git commit -m "Watch States B-F; MainActivity becomes state dispatch and a 1 Hz tick

Per-call step colours in the 48dp list; idle almost entirely unlit; connected
#4CAF50 -> accent, connecting #FFC107 -> attn, disconnected #F44336 -> a hollow
text-3 ring, login chip #1D5FE0 -> accent, login error and billing -> attn. The
billing chip renders ONLY inside the no-active-calls branch: a patient call never
shares a wrist with an invoice. The ack now sends the real nurse name."
```

---

### Task 15: Watch identity — one launcher name, real notification icons, non-continuous haptics

Three defects ship together here because they are all the same defect: the watch does not look or behave like half of one product. Its launcher says "Chaqiruv monitor" while the phone says "NurseCall"; its notifications use `android.R.drawable` stock system icons; and it vibrates on **every** poll while any call is open, which is how a device ends up on a shelf.

**Files:**
- Create: `app/src/main/res/drawable/ic_notify_call.xml`
- Create: `app/src/main/res/drawable/ic_notify_system.xml`
- Modify: `app/src/main/res/values/strings.xml`
- Modify: `app/src/main/java/uz/soat/reminder/CallMonitorService.kt`
- Create: `app/src/test/java/uz/soat/reminder/NotificationIdentityTest.kt`

**Interfaces:**
- Consumes: `NurseCallTokens.Notify` (Task 2), `ageStep` (Task 12).
- Produces: `CallMonitorService.shouldBuzz(previousStep: Int?, currentStep: Int): Boolean` — `@JvmStatic` on the companion so the JVM test can call it without an Android runtime.

- [ ] **Step 1: Write the failing test**

Create `app/src/test/java/uz/soat/reminder/NotificationIdentityTest.kt`:

```kotlin
package uz.soat.reminder

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class NotificationIdentityTest {

    @Test
    fun `the two halves of one product share one launcher name`() {
        val strings = File("src/main/res/values/strings.xml").readText()
        assertTrue(strings.contains("<string name=\"app_name\">NurseCall</string>"))
        assertFalse(strings.contains("Chaqiruv monitor"))
    }

    @Test
    fun `the notification icons are shipped vectors, not stock system drawables`() {
        assertTrue(File("src/main/res/drawable/ic_notify_call.xml").exists())
        assertTrue(File("src/main/res/drawable/ic_notify_system.xml").exists())
        val service = File("src/main/java/uz/soat/reminder/CallMonitorService.kt").readText()
        assertFalse(service.contains("android.R.drawable"))
        assertTrue(service.contains("R.drawable.ic_notify_call"))
        assertTrue(service.contains("R.drawable.ic_notify_system"))
    }

    @Test
    fun `the channels and their accents come from the tokens`() {
        assertEquals("call", NurseCallTokens.Notify.accentCallChannel)
        assertEquals("system", NurseCallTokens.Notify.accentSystemChannel)
        assertEquals(0xFFCB2F22.toInt(), NurseCallTokens.Notify.accentCallArgb)
        assertEquals(0xFF0C6A62.toInt(), NurseCallTokens.Notify.accentSystemArgb)
    }

    @Test
    fun `the watch buzzes on arrival and on each step transition, never continuously`() {
        // §6.6: one haptic on arrival, one short re-buzz per step transition.
        assertTrue(CallMonitorService.shouldBuzz(null, 1))   // arrival
        assertFalse(CallMonitorService.shouldBuzz(1, 1))     // the next 24 polls in step 1
        assertTrue(CallMonitorService.shouldBuzz(1, 2))      // escalation
        assertFalse(CallMonitorService.shouldBuzz(2, 2))
        assertTrue(CallMonitorService.shouldBuzz(2, 3))
        assertFalse(CallMonitorService.shouldBuzz(3, 3))     // and then silence, forever
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design && ./gradlew :app:testDebugUnitTest --tests '*NotificationIdentityTest'`

Expected: compilation FAILS with `Unresolved reference: shouldBuzz`.

- [ ] **Step 3: Write the implementation**

Change `app/src/main/res/values/strings.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">NurseCall</string>
</resources>
```

Create `app/src/main/res/drawable/ic_notify_call.xml` — the product's owned glyph: a rounded square with the three-bar rail cut out of it. `evenOdd` makes the bars holes, so the icon carries the same 3-slot idea as the card, which pips cannot do (§5.2).

```xml
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFFFF"
        android:fillType="evenOdd"
        android:pathData="M7,3 L17,3 A4,4 0 0 1 21,7 L21,17 A4,4 0 0 1 17,21 L7,21 A4,4 0 0 1 3,17 L3,7 A4,4 0 0 1 7,3 Z M7,7 h10 v2.5 h-10 z M7,10.75 h10 v2.5 h-10 z M7,14.5 h10 v2.5 h-10 z" />
</vector>
```

Create `app/src/main/res/drawable/ic_notify_system.xml` — an outline info circle:

```xml
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFFFF"
        android:fillType="evenOdd"
        android:pathData="M12,2 A10,10 0 1 1 11.99,2 Z M12,4 A8,8 0 1 0 12.01,4 Z M11,10 h2 v7 h-2 z M11,6.5 h2 v2 h-2 z" />
</vector>
```

In `app/src/main/java/uz/soat/reminder/CallMonitorService.kt`:

Replace the two channel constants in the companion and add the buzz rule:

```kotlin
    companion object {
        // §6.6: two channels, `system` (billing, sync, outdated) and `call`. The ids are
        // new, so Android creates fresh channels at the right importance instead of
        // inheriting whatever the old ones were left at; the old ones are deleted below.
        private const val SYSTEM_CHANNEL = "system"
        private const val CALL_CHANNEL = "call"
        private const val LEGACY_STATUS_CHANNEL = "monitor_status"
        private const val LEGACY_ALERT_CHANNEL = "call_alert"
        private const val STATUS_NOTIFICATION_ID = 1
        private const val ALERT_NOTIFICATION_OFFSET = 1000
        private const val POLL_INTERVAL_MS = 5000L
        private const val BILLING_POLL_EVERY_N = 720

        /**
         * §6.6: one haptic on arrival, one short re-buzz per step transition. Never
         * continuous — a wrist that buzzes every five seconds is a wrist that stops being
         * looked at. `null` means the call is new to this service instance.
         */
        @JvmStatic
        fun shouldBuzz(previousStep: Int?, currentStep: Int): Boolean = previousStep != currentStep
    }
```

Add the per-call step memory beside `alreadyAlerted`:

```kotlin
    private val alreadyAlerted = mutableSetOf<Int>()
    private val lastStep = mutableMapOf<Int, Int>()
```

Replace the vibration decision inside `pollLoop`'s success branch. The current code is:

```kotlin
                    if (calls.isNotEmpty()) vibrate()
```

Replace it, and the `alreadyAlerted.retainAll(activeIds)` line that follows the `else` block, with:

```kotlin
                    // One buzz per call per step, not one buzz per poll.
                    val now = System.currentTimeMillis()
                    var buzz = false
                    calls.forEach { call ->
                        val step = ageStep(call.createdAt, now)
                        if (shouldBuzz(lastStep[call.callId], step)) buzz = true
                        lastStep[call.callId] = step
                    }
                    if (buzz) vibrate()
                } else {
                    alreadyAlerted.addAll(activeIds)
                    calls.forEach { lastStep[it.callId] = ageStep(it.createdAt, System.currentTimeMillis()) }
                    firstPollDone = true
                }
                alreadyAlerted.retainAll(activeIds)
                lastStep.keys.retainAll(activeIds)
```

Replace `buildStatusNotification()`:

```kotlin
    private fun buildStatusNotification(): android.app.Notification {
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // The pre-1.4.0 channels carried stock icons and whatever importance a user had
            // left them at; deleting them stops a stale duplicate appearing in settings.
            manager.deleteNotificationChannel(LEGACY_STATUS_CHANNEL)
            manager.deleteNotificationChannel(LEGACY_ALERT_CHANNEL)
            manager.createNotificationChannel(
                NotificationChannel(SYSTEM_CHANNEL, "Tizim", NotificationManager.IMPORTANCE_LOW)
            )
        }
        return NotificationCompat.Builder(this, SYSTEM_CHANNEL)
            .setSmallIcon(R.drawable.ic_notify_system)
            .setColor(NurseCallTokens.Notify.accentSystemArgb)
            .setContentTitle("NurseCall")
            .setContentText("Faol, kuzatilmoqda…")
            .setOngoing(true)
            .build()
    }
```

Replace the icon and accent inside `notifyNewCall(call)`:

```kotlin
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CALL_CHANNEL, "Bemor chaqiruvlari", NotificationManager.IMPORTANCE_HIGH)
            )
        }
```

```kotlin
        val notification = NotificationCompat.Builder(this, CALL_CHANNEL)
            .setSmallIcon(R.drawable.ic_notify_call)
            // A call notification IS a call, so it takes the call accent (§2.4).
            .setColor(NurseCallTokens.Notify.accentCallArgb)
            .setContentTitle("${call.roomNumber}-xona chaqirdi")
            .setContentText("${call.floor}-qavat")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .build()
```

Finally, shorten `vibrate()`'s pattern from three long pulses to one short one — the same "never continuous" rule:

```kotlin
    private fun vibrate() {
        // One short buzz. The old longArrayOf(0,500,200,500,200,500) fired on every poll.
        val pattern = longArrayOf(0, 400)
```

> `NurseCallTokens.Notify.accentCallIcon` / `accentSystemIcon` carry the drawable *names* for parity with `tokens.json`; the service references `R.drawable.ic_notify_call` directly so a renamed asset is a compile error rather than a runtime blank icon.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd /Users/baxrom/ish_full/soat-design
./gradlew :app:testDebugUnitTest
./gradlew :app:assembleDebug
cd mobile-app && npm test -- src/notifications.test.ts
```

Expected: every JVM test passes, the module builds, and **the phone's third notification test now passes too** — the tripwire asserting that `app.json`'s `expo.name` and the watch's `app_name` are the same string.

- [ ] **Step 5: Device verification of the icon**

A notification icon is a silhouette: Android masks it to white and drops everything but the alpha channel, so an icon that looks right in a vector preview can render as a solid white blob. On a device or emulator, trigger a call and confirm in the shade that **the three rail bars are visible as cut-outs** and the icon is not a filled square. If it is filled, the `evenOdd` fill type did not take.

- [ ] **Step 6: Commit**

```bash
cd /Users/baxrom/ish_full/soat-design
git add app/src/main/res app/src/main/java/uz/soat/reminder/CallMonitorService.kt app/src/test/java/uz/soat/reminder/NotificationIdentityTest.kt
git commit -m "Watch: one launcher name, owned notification icons, non-continuous haptics

android:label 'Chaqiruv monitor' -> 'NurseCall': the two halves of one product
had different names on the launcher. The android.R.drawable stock icons become
two shipped 24dp vectors on two channels, call (#CB2F22) and system (#0C6A62),
with the legacy channel ids deleted so no stale duplicate lingers. The service
vibrated on EVERY poll while any call was open; it now buzzes once on arrival
and once per step transition, and the pulse is one short buzz, not three long."
```

---

### Task 16: Joint release verification — they ship together or not at all

The owner's decision: a nurse holding a new phone and an old watch sees a worse product than today. This task is the gate.

**Files:**
- Modify: `app/build.gradle.kts:20-21` (`versionCode`, `versionName`)
- Create: `tools/parity.test.mjs`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing new. This task adds the cross-target parity test and performs the release.

- [ ] **Step 1: Write the failing parity test**

§5's falsifiability test says: if `/wall` ever shows a different step than `/calls` for the same call, the shared function is wrong on both. The same holds across four targets. Create `tools/parity.test.mjs`:

```js
// tools/parity.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const tokens = JSON.parse(read('tokens.json'));

test('the web target copy of the thresholds still matches tokens.json', () => {
  const src = read('web-dashboard/src/lib/ageStep.ts');
  const literal = src.match(/const THRESHOLDS_SEC = \[([^\]]+)\]/)?.[1];
  assert.ok(literal, 'THRESHOLDS_SEC not found in the web ageStep');
  assert.deepEqual(
    literal.split(',').map((n) => Number(n.trim())),
    tokens.call.thresholdsSec
  );
});

test('the phone and the watch read the thresholds rather than copying them', () => {
  assert.match(read('mobile-app/src/lib/ageStep.ts'), /call\.thresholdsSec/);
  assert.match(read('app/src/main/java/uz/soat/reminder/AgeStep.kt'), /NurseCallTokens\.callThresholdsSec/);
});

test('all four targets carry the same timer format rule', () => {
  for (const p of ['web-dashboard/src/lib/ageStep.ts', 'mobile-app/src/lib/ageStep.ts']) {
    assert.match(read(p), /h > 0 \?/);
  }
  assert.match(read('app/src/main/java/uz/soat/reminder/AgeStep.kt'), /if \(h > 0\)/);
});

test('every generated file names its generator and forbids hand edits', () => {
  for (const p of Object.values(tokens.meta.outputs)) {
    if (p.endsWith('landing.html')) continue; // Plan 2's target, not written yet
    assert.match(read(p).slice(0, 200), /GENERATED by tools\/generate-tokens\.mjs/, p);
  }
});

test('the phone and the watch ship the same version', () => {
  const phone = JSON.parse(read('mobile-app/app.json')).expo.version;
  const watch = read('app/build.gradle.kts').match(/versionName = "([^"]+)"/)?.[1];
  assert.equal(phone, watch, 'a nurse with a new phone and an old watch sees a worse product');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/baxrom/ish_full/soat-design && node --test tools/parity.test.mjs`

Expected: the last test FAILS — the phone reads `1.4.0` and the watch still reads `1.3.0`.

- [ ] **Step 3: Bump the watch to the joint version**

In `app/build.gradle.kts`:

```kotlin
        versionCode = 5
        versionName = "1.4.0"
```

- [ ] **Step 4: Run every headless check in the repo, in one go**

Run:

```bash
cd /Users/baxrom/ish_full/soat-design
node tools/generate-tokens.mjs --check          # all three generated files current
node --test tools/*.test.mjs                    # emitters, invariants, lints, parity
(cd mobile-app && npm test && npx tsc --noEmit)  # phone
(cd web-dashboard && npm test && npm run build)   # Plan 1's surfaces still green
./gradlew :app:testDebugUnitTest                 # watch logic
./gradlew :app:assembleDebug                     # watch compiles
```

Expected: every command exits 0. `web-dashboard` is included because the `ts` and `kotlin` emitters changed `generate-tokens.mjs`, which its `build` script invokes with `--check`.

- [ ] **Step 5: The device checklist — the part no test covers**

Install BOTH apps on real hardware, paired, and walk the list. Tick every line before releasing; a failure here is a release blocker, not a follow-up.

**Phone (Android device, or emulator for 1–4):**

- [ ] The four Inter weights render as four *visibly different* weights. Put the login screen's `page-title` (700), `body-lg` (400) and a `dense` 600 label side by side and photograph them. **If all three look identical, the fonts did not load and the app is rendering 400 everywhere — the exact bug Task 1 and Task 3 exist to prevent.** Cross-check by toggling airplane mode off and reopening: a font-load failure shows the bare ground from `FontGate`, never unstyled text.
- [ ] **130% OS font scale, three simultaneous calls, room `"1204"`** (§3.5, §11.3). The room renders at 80×1.2 = 96px, the cards grow, the list scrolls, nothing clips and no timer wraps.
- [ ] Three cards at steps 1/2/3, **light mode and dark mode**. The rail count, the numeral size and the edge width all escalate. §11.1: does a nurse rank them correctly in under a second? If the colour cue fights the geometry, record it — the fix is a three-hex change, not a redesign.
- [ ] One call only: the solo card fills the viewport and the ack slab sits inside the one-handed thumb arc.
- [ ] Pull down on the call list: **nothing happens.** Pull-to-refresh is gone by design.
- [ ] Kill the network for 15 seconds: the amber offline banner docks under the header, **the call list stays at full contrast and is never dimmed**, and "Qayta urinish" is a 48px target.
- [ ] With a billing warning active and a call open: the billing banner is **below** the list.
- [ ] Logout, then reopen: the app goes **straight to Login**, with no Welcome screen — ever, not once.

**Watch (real device preferred; the round emulator is acceptable for 1–4):**

- [ ] The launcher entry reads **NurseCall**.
- [ ] States A, B, C, D, E, F as captured in Task 14 Step 5.
- [ ] Acknowledge a call from the watch, then open the dashboard's history: the "Kim" column shows **the nurse's real name**, not "Palata soati".
- [ ] Leave one call unanswered for 12 minutes: the watch buzzes at arrival, at 2 minutes and at 10 minutes — **three times, then silence.** It must not buzz every five seconds.
- [ ] A call notification in the shade shows the rail glyph, not a stock system icon, tinted `#CB2F22`.

**The pair:**

- [ ] Log in on the phone; the watch picks up the token and leaves State D.
- [ ] Log out on the phone; the watch returns to State D.
- [ ] Acknowledge on the phone; the call clears on the watch within one poll (5 s), and vice versa.

- [ ] **Step 6: Commit and tag the joint release**

```bash
cd /Users/baxrom/ish_full/soat-design
git add app/build.gradle.kts tools/parity.test.mjs
git commit -m "Release 1.4.0: the phone and the watch ship together

Watch versionCode 4->5, versionName 1.3.0->1.4.0, matching the phone. A parity
test now fails the build if the two versions diverge, if a generated file loses
its DO-NOT-EDIT header, or if any target stops reading call.thresholdsSec from
tokens.json - §5's falsifiability test, enforced across four targets."
git tag -a v1.4.0 -m "NurseCall 1.4.0 - phone and watch design system"
```

- [ ] **Step 7: Build the release artefacts**

Neither of these runs headless in this session; both need real tooling and, for the watch, the signing keystore.

```bash
# Watch: needs keystore.properties present at the repo root (it is gitignored).
cd /Users/baxrom/ish_full/soat-design && ./gradlew :app:assembleRelease
# Phone: needs the Expo/EAS toolchain and an account with access to the project id.
cd /Users/baxrom/ish_full/soat-design/mobile-app && npx eas build --platform android --profile production
```

**Do not raise `min_mobile_version` or `min_watch_version` on the server.** Those are backend configuration and the backend is out of scope for this plan; raising them would lock every nurse out of a working build the moment 1.4.0 is published but before the vendor has visited the clinic. The vendor installs both APKs in person, which is the same distribution path this product already uses.

---

## What this plan deliberately does not do

- **No feature is added or removed, and no API contract changes.** The one behavioural change is the *value* the watch sends in the existing `acknowledged_by` field (Task 12).
- **The phone's own ack attribution is left alone.** It sends the logged-in email today and continues to. The assignment scopes the attribution fix to the watch, where the hardcoded `"Palata soati"` made history unanswerable; changing the phone too is a separate, easy change and not this release's business.
- **No JetBrains Mono file is shipped to the phone** — see Global Constraints decision 2.
- **No animation anywhere in the alert register** on either target. The 1-second clock tick on both is a state read.
- **No `useFonts` splash-screen orchestration.** `FontGate` renders the page ground and nothing else; a splash library is a dependency in exchange for 200ms of polish on a work tool.
- **The web dashboard and the landing page are untouched** — they are Plan 2. The only reason `web-dashboard` appears in Task 16's verification is that it invokes `generate-tokens --check`, which this plan changed.

