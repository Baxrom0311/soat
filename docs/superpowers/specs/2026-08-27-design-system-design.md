---
date: 2026-08-27
status: approved
owner: Baxrom (vendor / product owner)
approved_via: design review artifact, 2026-08-27
---

> **Scope guard.** Features are neither added nor removed. The backend and every API
> contract are untouched. This document governs colour, type, spacing, layout and
> information architecture across four frontends only.
>
> **Provenance.** Three independent design proposals were produced from different angles
> (alert-led, management-led, physical-conditions-led) and judged by three adversarial
> reviewers (one-second legibility, professional craft, buildability). Every proposal was
> found to have at least one fatal defect. This document is the synthesis with those
> defects fixed; section 0 records how each disagreement was settled.

# NurseCall Design System — Final Specification

**Status:** settled. This document supersedes proposals 1–3 and all three judge verdicts. Every number here is final and generated from one `tokens.json`.

---

## 0. How the disagreements were settled

Two judges (one-second-legibility, professional-craft) picked *clinical-instrument*; the third (buildability) picked *field-conditions*. That split is the correct reading of the evidence: **clinical-instrument had the right ambition for the alert surfaces and the wrong engineering; field-conditions had the right engineering and undersized alerts.** The final design is field-conditions' engineering spine carrying clinical-instrument's alert ambition, with saas-craft's token schema and management-register moves grafted in.

| Conflict | Decision | Why in one sentence |
|---|---|---|
| One red ramp for both themes (P1, P2) vs. a per-theme ramp (P3) | **Per-theme ramp** | Contrast against the page must *rise* as a call ages; a single ramp inverts that in one theme or the other, and three extra hex values is a trivial price for a working primary signal. |
| P1's "nothing under 28px on a red fill" rule | **Replaced** with a numeric invariant: every call fill must measure **≥ 4.5:1 against white ink** | The 28px rule is unimplementable on a 1.2" watch and P1 broke it on every surface; a measured ink ratio makes *all* text on red compliant at any size and is checkable by the generator. |
| Alert type size: P1's 104px desk / 208px wall vs. the grid closing | **Explicit per-surface tokens, multi-column grid** — desk 96px max, wall 148px max, 11 wall slots | P1's single 880px column fit two overdue calls above the fold and its `scale-wall 2.0` was arithmetically false; a grid shows 3–4× the calls at sizes still 6× (desk) and 2.6× (wall) the legibility floor. |
| Press-and-hold acknowledge (P1) | **Single tap on a discrete 64px slab; card body inert** | The hold gesture was self-declared unproven with no fallback; making only the slab tappable removes the accidental-ack risk it existed to solve. |
| Motion on alert surfaces (P1's 400ms entrance + 250ms white flash; P2's fill crossfade) | **Zero motion in the alert register**, anywhere, on any target | It buys nothing, it janks on cheap Android, a white flash on a 55" panel in a dark corridor contradicts the night-shift rationale, and "no motion" removes every cross-platform animation-parity bug in one sentence. |
| Ageing glyph: chevrons (P3) vs. bar rail (P1) vs. pips (P2) | **Rail form, pip logic** — 3 slots always, 1/2/3 filled | Chevrons need four hand-kept SVG/VectorDrawable assets; the rail is plain rectangles on all four targets, and drawing all three slots tells you *2 of 3*, not just "two". |
| Liveness animation | **Static dot in management chrome; 1 Hz blinking colon on the `/wall` clock only** | A frozen tab and a quiet ward look identical on a wall monitor; a pulsing dot in a desk sidebar is a stock template tell. |
| Landing page typeface | **Inter, inlined as a base64 woff2 subset** | P3's "CSP forbids a webfont" is a technical error — a `data:` URI is not a request — and shipping the sales page in a different family than the product *is* the owner's original complaint. |
| Weights 450/550/620/650 | **400 / 500 / 600 / 700 only** | Inter ships no static 620 face; React Native on Android resolves a family *name* per weight, so a 620 token renders 400 on the phone while rendering correctly on web — the exact silent drift the token pipeline exists to prevent. |

---

## 1. The two registers

**ALERT register** — anything rendering a live patient call: `/calls` live region, `/wall`, phone Calls list, watch. Solid red fill, one huge number, geometry-only decoration, zero motion, zero shadow, zero icons, zero alpha on text.

**MANAGEMENT register** — Rooms, Devices, Staff, Subscription, History, login, landing, superadmin. Neutral surfaces, 1px hairlines, no card shadows, dense 44px rows, tabular figures, teal on anything clickable.

The seam between them on `/calls` is deliberate and is the design idea. The rule that makes it work: **the interface is quiet everywhere else, so one red card is the only saturated object on screen.**

---

## 2. Colour tokens

All values are opaque 6-digit hex. Four alpha tokens exist and are written as 8-digit `#RRGGBBAA`; the Kotlin emitter reorders them to `0xAARRGGBB`. Every ratio below is a computed WCAG 2.1 relative-luminance contrast, not an estimate.

### 2.1 Neutrals

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#F6F7F7` | `#0E1213` | Page ground. Never tinted. `/wall` forces the dark value. |
| `surface` | `#FFFFFF` | `#171C1D` | Cards, table container, sidebar, inputs, modals. |
| `surface-soft` | `#FAFBFB` | `#131819` | Row hover, disabled fields, sunken wells. |
| `surface-sunken` | `#EEF0F0` | `#0A0E0F` | Landing alternating band, code plates, table toolbar strip. |
| `border` | `#E2E5E5` | `#272E2F` | Every 1px divider and card edge. Decorative by design (1.27:1 / 1.24:1) — never the sole carrier of meaning. |
| `border-strong` | `#C7CCCC` | `#394142` | Table-header underline, sidebar group separator, segmented-control edge. |
| `border-field` | `#8B9293` | `#697374` | **Input, select, checkbox and ghost-button outlines only.** 3.17:1 on white / 3.53:1 on dark surface — clears WCAG 1.4.11's 3:1 non-text floor. Drawn at 1.5px. |
| `text-1` | `#14191A` | `#E9EDED` | Headings, table cell values, input text. |
| `text-2` | `#4A5456` | `#A4AEAE` | Body copy, secondary cells, form labels. |
| `text-3` | `#6C7679` | `#7B8586` | Column headers, timestamps, helpers, placeholders. |
| `text-disabled` | `#A2A9A9` | `#4E5758` | Disabled labels only. Never carries information. |

**Required contrast statements:**

| Text | Light (on `surface` #FFFFFF) | Dark (on `surface` #171C1D) |
|---|---|---|
| **Body text** (`text-1`) | **17.74:1** | **14.59:1** |
| **Secondary text** (`text-2`) | **7.80:1** | **7.58:1** |
| Tertiary text (`text-3`) | 4.66:1 | 4.54:1 |

There is no sub-AA grey anywhere in the system. `text-3` is the floor and it is AA at 12px.

### 2.2 Accent — teal, the only interactive colour

| Token | Light | Dark | Ratio |
|---|---|---|---|
| `accent` | `#0C6A62` | `#35C9B6` | 6.45:1 as text on `surface` light / 8.34:1 dark |
| `accent-hover` | `#0A5A54` | `#4FD6C4` | — |
| `accent-press` | `#095049` | `#63DFCE` | — |
| `accent-ink` | `#FFFFFF` | `#04120F` | 6.45:1 / 9.27:1 on an `accent` fill |
| `accent-soft` | `#0C6A621F` | `#35C9B62E` | Active-nav wash, selected row, count pill. Alpha token. |
| `focus-ring` | = `accent` | = `accent` | 2px solid ring at 2px offset. Never a glow, never a shadow. |

### 2.3 Non-red semantics

| Token | Light | Dark | Ratio | Use |
|---|---|---|---|---|
| `attn` | `#8A5A00` | `#E0A63A` | 5.93:1 / 7.94:1 (9.69:1 on watch black) | **The only warning/error/danger colour.** Validation, expiring subscription, offline device, destructive-confirm button, outdated app. Always paired with a ⚠ outline glyph so it is never colour-alone. |
| `attn-soft` | `#8A5A0016` | `#E0A63A24` | — | Banner fill. Alpha token. |
| `ok` | `#146B3A` | `#3FC97E` | 6.57:1 / 8.09:1 | Device online, call acknowledged, payment received. Filled 8px dot. |
| `offline` | = `text-3` | = `text-3` | — | Offline/inactive is *absence*: a hollow 8px ring in `text-3` plus the word. Fill-vs-hollow is the non-colour channel, so status survives greyscale and colour blindness. |

**Destructive actions are amber, not red.** This is the real cost of reserving red and we pay it deliberately: the confirm button in a delete modal is `attn`-filled with a verb-plus-object label ("Xonani o'chirish"), and the object name appears in the modal title and body. When a nurse's screen shows an amber form error and a red card at the same time, there is zero ambiguity about which one is a human being waiting.

### 2.4 Call red — RESERVED

**Rule 0:** `call.*` tokens may be consumed only by a component that renders a live patient call. Enforced by lint (§10), not by comment.

**Rule 1:** every glyph on a red fill is pure `#FFFFFF`. No alpha text in the alert register, ever. Hierarchy on red comes from size and weight only.

**Rule 2 (the invariant that replaces P1's 28px rule):** every call fill must measure **≥ 4.5:1 against `call-ink`**. `--check` computes this and fails the build if a red is edited below it. Because it holds, *all* text on a red card is AA-normal at any size, so there is no minimum-size caveat and no compliance crutch.

Escalation principle: **each step increases contrast against the surrounding page.** The page ground differs by theme, so the ramp direction flips by theme. This is the single most important correction to the winning proposal, which shipped an inverted ramp in light mode by its own admission.

| Step | Age | Light fill | vs. light page | white ink | Dark fill | vs. dark page | white ink | vs. watch black |
|---|---|---|---|---|---|---|---|---|
| **1 — new** | 0–29 s | `#C4241A` | **5.41:1** | **5.81:1** | `#B9271B` | **3.02:1** | **6.23:1** | 3.37:1 |
| **2 — waiting** | 30–119 s | `#A81810` | **6.98:1** | **7.49:1** | `#CB2F22` | **3.56:1** | **5.29:1** | 3.97:1 |
| **3 — overdue** | ≥ 120 s | `#8A100A` | **9.07:1** | **9.73:1** | `#D93726` | **4.06:1** | **4.64:1** | 4.53:1 |

Monotonic in both themes. Every step clears 3:1 non-text against its own page and 4.5:1 for its ink.

| Token | Light | Dark | Use |
|---|---|---|---|
| `call-ink` | `#FFFFFF` | `#FFFFFF` | Every glyph on every call card, every step, every target. One value, no lookup. |
| `call-edge` | `#6E0A06` | `#FF6B54` | Perimeter outline on every call card. 11.45:1 vs. light page, 6.72:1 vs. dark page — so the card's boundary is the highest-contrast thing at its perimeter in both themes. Belt-and-braces, not a patch: the fills already pass. |
| `call-slab` | `#FFFFFF` | `#FFFFFF` | The acknowledge slab. Its label ink is the card's own `call.fill[step]`, so contrast is automatically 4.64–9.73:1 with no per-step token. |
| `notify-accent-call` | `#CB2F22` | — | Android notification accent, channel `call`. A call notification *is* a call. |
| `notify-accent-system` | `#0C6A62` | — | Android notification accent, channel `system` (billing, sync, outdated). |

**Declared residual risk.** In light mode the ramp darkens, so the *newest* call is the brightest and most saturated card on screen while the *oldest* is a near-black maroon. Brightness-as-alarm is a learned cue and this runs against it. Mitigations: (a) step 1 is already `#C4241A`, a grave red, not a vermilion; (b) all four non-colour channels run the same direction in both themes; (c) position is always oldest-first. This is the one thing in the spec that needs a real shift of observation before wide rollout, and the fix if it fails is a light ramp that *brightens* while the geometry carries page-contrast — a three-hex change, not a redesign.

### 2.5 Watch overrides (dark set only)

| Token | Value | Ratio on black |
|---|---|---|
| `watch-bg` | `#000000` | — (OLED pixels off: battery, no corridor dazzle) |
| `watch-text-2` | `#A8B2AF` | 9.65:1 |
| `watch-text-3` | `#7C8683` | 5.60:1 |

Everything else on the watch uses the **dark** token set unchanged. This is the first time the watch shares a single hex with the rest of the product.

### 2.6 Deleted

`#696cff` and all purple; `--accent-2` `#03c3ec` cyan; `--blob-a/b/c`; the purple gradient brand mark; `#6C5CE7` (Android notification accent, exists in no palette); `#1d5fe0` / `#5b9bff` (phone blue); all seven `Color(0x…)` literals in `MainActivity.kt` (`#F44336`, `#4CAF50`, `#FFC107`, `#1D5FE0`, `#FFB300`, `#D32F2F`, `#6C5CE7`); `--shadow-sm/md/lg` (three shadows become one).

---

## 3. Typography

**Family:** Inter on web, landing and phone. JetBrains Mono for exactly four things: device IDs, EV1527 codes, elapsed-time counters, clock readouts. The watch keeps the Wear system font — at a 1–2 second glance, size and contrast matter and the family does not, and a font file costs APK size and risk.

**Weights: 400, 500, 600, 700. No others, ever.** Inter ships no static 450/550/620/650 face; RN on Android resolves a family *name* per weight, not a numeric axis. `tokens.json` carries the weight enum and the generator refuses any other value.

**Phone font delivery (the highest-probability silent-drift bug, and no proposal caught it):** the phone target emits a **`fontFamily` string**, not a numeric weight — `Inter_400Regular`, `Inter_500Medium`, `Inter_600SemiBold`, `Inter_700Bold` — loaded via `expo-font`. Without this, `theme.ts` compiles, runs, reports green under `--check`, and renders 400 everywhere.

**Uzbek Latin allowances:**
- Minimum body size 15px (16px on phone inputs, iOS zoom floor). At 13px, `o'` / `g'` / `ʻ` degrade into noise.
- Negative letter-spacing forbidden below 22px — tight tracking collapses the gap between a letter and a following apostrophe.
- **No all-caps anywhere except one token** (`eyebrow`), used in exactly two places: the sidebar group label and the landing section kicker. Table headers are sentence case, differentiated by weight, colour and a `border-strong` underline. Uppercase Uzbek at 11–12px reads cheap and runs ~18% wider.
- **U+02BB (ʻ) is canonical.** U+2019 and U+0027 are normalised to it in all copy. Three apostrophe codepoints in one product is a real search/sort/diff hazard.
- Every column, button and fixed-width slot is sized from the longest real Uzbek string plus 15%.
- `tabular-nums` is mandatory on every number in the product: `font-variant-numeric: tabular-nums` (CSS), `fontVariant: ['tabular-nums']` (RN), `fontFeatureSettings = "tnum"` (Compose). Non-negotiable — proportional digits in a room-number column is half of why the current tables look amateur.

### 3.1 Management scale — 10 styles, 8 sizes

Format: size / line-height / weight / tracking.

| Token | Spec | Use |
|---|---|---|
| `eyebrow` | 11 / 16 / 600 / +0.06em UPPERCASE | Sidebar group label ("SOZLAMALAR") and landing section kicker. Nothing else. |
| `meta` | 12 / 16 / 500 / 0 | Timestamps, helper text, version strings, footer. `text-3`. |
| `mono-sm` | 12 / 16 / 500, mono, tabular | Device IDs and EV1527 codes in table cells. Middle-truncated (`floor2-…-01`) with the full value in `title`. |
| `dense` | 13 / 18 / 500 / 0 | Table cell values, secondary nav labels, badges. The workhorse. |
| `mono` | 13 / 18 / 500, mono, tabular | Inline technical values in prose; the `/wall` clock at scale. |
| `body` | 15 / 22 / 400 / 0 | Paragraphs, modal copy, desk input text. |
| `body-lg` | 16 / 24 / 400 / 0 | **Phone** body and input text, primary nav label, landing paragraph. A separate token, not a per-target override of `body` — that override is exactly how today's `theme.ts` came to claim "same tokens as the web dashboard" while holding different values. |
| `card-title` | 18 / 24 / 600 / −0.005em | Card, panel, modal and section titles. |
| `page-title` | 22 / 28 / 700 / −0.01em | Dashboard page H1, phone screen title. |
| `stat` | 28 / 32 / 700 / −0.015em, tabular | Stat-tile values, `/wall` empty-state line. |

No two styles sit within 1px at the same weight, so nobody can apply them interchangeably. **Count: 10. The phone consumes 6 of them** (`meta`, `dense`, `body-lg`, `card-title`, `page-title`, `mono-sm`) plus the alert scale — down from a measured 10 arbitrary sizes today, and this count is true.

### 3.2 Landing extension — 3 styles, `targets: ["css"]`

| Token | Spec |
|---|---|
| `landing-h1` | `clamp(38px, 5.2vw, 60px)` / 1.06 / 700 / −0.02em, `max-width: 22ch` |
| `landing-h2` | `clamp(28px, 3.4vw, 40px)` / 1.14 / 700 / −0.02em |
| `landing-lede` | `clamp(17px, 1.6vw, 19px)` / 1.55 / 400, `text-2`, `max-width: 62ch` |

62ch, not 70: Uzbek runs ~18% longer than English and 70ch of it is a wall. `clamp()` is web-only and the token carries `targets: ["css"]`; `--check` fails if any other emitter reads it.

### 3.3 Alert scale — explicit tokens, no multipliers

Every ageing step is a **named array indexed by `ageStep()`**. There is no `scale-wall` multiplier; P1's "one number, one route" was arithmetically false (its own 72/88/104 × 2 is 144/176/208, not the specified 176/200/208) and it hid four magic numbers on the product's most visible surface.

| Token | Step 1 | Step 2 | Step 3 | Weight / lh |
|---|---|---|---|---|
| `alert.room.desk` | 72 | 84 | 96 | 700 / 0.95, −0.02em, tabular |
| `alert.room.phone` | 64 | 72 | 80 | 700 / 0.95 |
| `alert.room.phoneSolo` | 88 | 96 | 104 | 700 / 0.95 |
| `alert.room.wall` | 112 | 128 | 148 | 700 / 0.95 |
| `alert.room.wallSolo` | 200 | 224 | 256 | 700 / 0.95 |
| `alert.room.watch` (sp) | 40 | 44 | 48 | 700 / 1.0 |
| `alert.roomList.watch` (sp) | 26 | 26 | 26 | 700 |

Size ratios are constant (+16.7% / +14.3% on desk; +14.3% / +15.6% on wall), so the size channel works at every step on every surface. P1's wall ramp of 176→200→208 was +13.6% then **+4%** — invisible at 4 m.

| Token | Desk | Phone | Wall | Watch |
|---|---|---|---|---|
| `alert.timer` (mono, tabular, constant across steps) | 22 / 26 / 700 | 20 / 24 / 700 | 48 / 52 / 700 | 16sp / 600 |
| `alert.floor` | 15 / 20 / 600 | 17 / 22 / 600 | 32 / 36 / 600 | 14sp / 500 |
| `alert.ack` | 15 / 20 / 700 | 18 / 24 / 700 | — (no ack on wall) | 15sp / 700 |
| `alert.overflowCount` / `alert.overflowMeta` | — | — | 56 / 700 · 24 / 500 | — |

Watch chrome: `watch.title` 18sp/700, `watch.body` 15sp/500, `watch.meta` 12sp/500.

**Timer format is fixed and tabular:** `m:ss` up to 59:59, then `h:mm:ss`. It never switches to a word form. A system that makes `tabular-nums` non-negotiable cannot then swap the glyph class of its most-repeated number — on a wall showing four cards, two reading "3:22" and two reading "12 daq" is a ragged mess and tabular figures buy nothing.

**Why there is no urgency word on the alert card.** The timer *is* the age, stated more precisely, already on the card, in tabular figures a nurse can compare at a glance. Adding "YANGI / KUTMOQDA / KECHIKDI" would put an 11px uppercase Uzbek label on the one surface where legibility is a safety property.

### 3.4 Legibility arithmetic, stated honestly

- **Wall, step 3, 148px/700.** Cap height ≈ 0.727 × 148 = 108px. On a 43" 1080p panel (0.494 mm/px) that is a **53 mm** cap. The signage rule for a comfortable glance is cap ≥ distance/200, i.e. 20 mm at 4 m. **2.65× headroom.** The over-provision is deliberate: the real reading condition is a nurse turning her head from a doorway in bad light, not someone standing squarely in front of the screen.
- **Wall, step 1, 112px** → 40 mm cap → 2× the floor. Still comfortably read at 4 m.
- **Desk, step 3, 96px.** Cap ≈ 70px; on a 24" 1080p monitor (0.276 mm/px) that is 19 mm at a 600 mm viewing distance, where the floor is 3 mm. **6× headroom.** It is not sized for legibility; it is sized so the card is unmissable in peripheral vision while the nurse is looking at a different window.
- **Watch, 48sp** on a 192dp face: 4 digits fit with margin. `"Xona"` is dropped — at 48sp the word costs a whole line and adds nothing on a screen whose only content is a room call.
- **Nothing under 20px appears on `/wall` at all.**

### 3.5 OS font scaling (no proposal but one addressed this; it is what will actually break in a hospital)

- **`min-height`, never `height`.** No card, row or button in the product has a fixed height. A 130% table row grows from 44px to ~54px and the page scrolls.
- `maxFontSizeMultiplier: 1.2` on **room number and timer only** (`clamp()` ceiling on web). They are already 3–8× body size; uncapped scaling pushes a 4-digit room number off a phone card.
- All small alert text (`alert.floor`, `alert.ack`) scales **freely**. It is the text that most needs to.
- Touch targets are absolute px and never scale down.
- **Regression test to hold:** phone, 130% OS scale, three simultaneous calls, room `"1204"`. Room renders at 80×1.2 = 96px → 4 digits ≈ 230px inside a 328px content width; card grows to ~230px; the list scrolls; nothing clips.

---

## 4. Space, radius, controls, motion

### 4.1 Spacing — 4px base, value-named

`space.0 / 2 / 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 80 / 112`

CSS `--space-16`, TS `space[16]`, Kotlin `Space.s16` (Dp), RN number. Value-named so no target needs mental arithmetic.

Vertical rhythm: siblings `12`, groups `24`, sections `40`, page top `32`. The alert register uses only `4 / 12 / 16 / 20 / 32`.

### 4.2 One gutter per surface — a hard prohibition, not a guideline

| Token | Value |
|---|---|
| `gutter.app` | 24 (≥768px) / 16 (<768px) |
| `gutter.phone` | **16, full stop** — this deletes the measured 20/16/16 stack |
| `gutter.wall` | 32 |
| `gutter.landing` | 24, content `max-width` 1120, full-bleed bands 1280 |
| `gutter.watch` | 10dp plus Wear's own chin/vignette insets |

**Nothing on any screen may introduce a second horizontal gutter.** Lintable.

### 4.3 Radius — a generative rule, escape hatch deleted

**Radius is a function of an element's shortest side. Never of elevation, never of importance.**

| Band (shortest side) | Token | Value |
|---|---|---|
| full-bleed | `radius.0` | 0 |
| < 32px | `radius.1` | 4 |
| 32–64px | `radius.2` | 8 |
| 64–240px | `radius.3` | 12 |
| > 240px | `radius.4` | 16 |
| pill | `radius.full` | 999 |

Landing: `radius.3` and `radius.4`. Watch list item (48dp) → `radius.2`; watch full-bleed call → `radius.0`. Desk and phone call cards (~200px tall) → `radius.3`. Wall card (301px tall) → `radius.4`.

This one rule kills the measured "same icon tile at 4 radii and 5 sizes" bug **by construction**. P3 wrote the rule and then added "…or 'this is the alert' → r-4", which reintroduces importance-based radius in the same breath. That clause is struck.

**There is exactly one square icon tile in the product:** `tile.brand` = 40×40, `radius.2`, 20px glyph, `accent` fill, `accent-ink` glyph. It is the brand mark and it is the same component in the dashboard sidebar, the phone login and the landing header. It is never rendered at another size. Icons elsewhere exist only in the management register at 20px, stroke 1.75, with **no container behind them, ever**.

### 4.4 Control heights & touch targets

| Token | Value | Use |
|---|---|---|
| `control.32` | 32 | Desk toolbar controls, icon buttons, segmented control (44px invisible hit area under `(hover: none)`). |
| `control.36` | 36 | Desk buttons and inputs. A desk is not a corridor; 48 here would waste the density the management register exists for. |
| `control.44` | 44 | Wear chip minimum; desk touch hit-area floor. |
| `control.48` | 48 | **Phone absolute tap minimum, no exceptions.** Icon buttons, list rows, the banner close button (measured today at 20×20 — it becomes a 24px glyph in a 48px box). |
| `control.56` | 56 | Phone inputs and primary buttons. |
| `control.64` | 64 | **`tap.gloved` — the "Tasdiqlash" button, and only it.** A nitrile-gloved fingertip loses roughly a third of its effective precision and gains contact area; the one action that must never be missed gets the largest target in the system, at full card width. |

Minimum gap between adjacent targets: 8px phone, 4px desk.

**Thumb-reach rule (phone, one hand busy).** Bottom third of the screen: the acknowledge action and nothing else. Upper right: menu, logout, theme, settings — deliberately outside the one-handed arc. The two things a nurse does one-handed while walking are *read* and *acknowledge*; logging out mid-shift by accident is the failure mode to design against.

**Safe areas.** `inset-top` / `inset-bottom` come from `useSafeAreaInsets()`. Every `paddingTop: 60` is deleted. Top padding = `inset-top + 8`; a bottom-pinned action = `inset-bottom + 24`, because a 64px button flush against the gesture bar gets swallowed by the system swipe.

### 4.5 Borders, rails, elevation, motion

| Token | Value |
|---|---|
| `border.hairline` | 1 — every divider and card edge |
| `border.field` | 1.5 — inputs, selects, ghost buttons (1px vanishes under corridor glare) |
| `border.focus` | 2, at 2px offset |
| `call.edgeWidth.deskPhone` | `[2, 2, 4]` — doubles at step 3 |
| `call.edgeWidth.wall` | `[3, 3, 6]` |
| `call.edgeWidth.watch` | `[2, 2, 4]` |
| `rail.desk` | slot 6×20, gap 4 |
| `rail.phone` | slot 5×18, gap 4 |
| `rail.wall` | slot 12×40, gap 8 |
| `rail.watch` | slot 4×14dp, gap 3dp |
| `shadow.none` | The value for every card, table, sidebar and call card. |
| `shadow.pop` | light `0 8px 24px -8px #0000002E` / dark `0 12px 32px -8px #00000099` — **modals and dropdown menus only.** `targets: ["css","ts"]`; the Kotlin emitter skips it, because the watch has no elevation. |
| `motion.fast` | 120ms — hover, focus |
| `motion.base` | 180ms — modal, drawer |
| `motion.ease` | `cubic-bezier(0.2, 0, 0.2, 1)` |

**There is no motion token in the alert register.** A call card is a pure function of state on all four platforms: it appears instantly at full contrast, an ageing step is an instant swap, nothing ever animates, pulses, blinks or crossfades. The only periodic animation in the entire product is the 1 Hz colon blink on the `/wall` clock.

---

## 5. Ageing — the shared mechanism

```
ageStep(createdAt: number, now: number): 1 | 2 | 3
  elapsed < 30s   → 1
  elapsed < 120s  → 2
  else            → 3
```

One exported pure function. Thresholds live in `tokens.json` as `call.thresholdsSec: [0, 30, 120]` and nowhere else. Desk, wall, phone and watch all import it. **Falsifiability test:** if `/wall` ever shows a different step than `/calls` for the same call, the shared function is wrong on both — which is the point.

### Non-colour signals (for colour-blind viewers, greyscale printing, a badly calibrated wall panel, and a sunlit corridor)

1. **Position.** The list is sorted **oldest-first, always, unconditionally.** The call to run to is physically first. Position survives colour blindness, glare and peripheral vision, and it is the only channel that works when the screen is glanced at edge-on.
2. **The rail: 1, 2 or 3 of 3 slots filled.** Three slots are *always* drawn — filled slots are solid `call-ink` rectangles, empty slots are 1.5px `call-ink` stroked outlines with no fill. So a reader sees "2 of 3", not just "two", and there is **zero alpha in the alert register**. Plain rectangles: identical on CSS, RN, Compose and inline SVG, with no image asset anywhere and drift structurally impossible. This is also the cutout in the notification icon, which pips cannot do.
3. **Room-number size**, at a constant ratio per surface (§3.3). A step-3 card is physically taller than a step-1 card, so the difference registers in peripheral vision before the eye lands on it.
4. **Edge width doubles at step 3** (2→4px, or 3→6px on the wall).

Plus the fill colour as a fifth, redundant channel — monotonic against the page in both themes.

A deuteranope reading only position, rail count and numeral size gets the complete ordering.

---

## 6. Surface specifications

### 6.1 `/calls` — desk (the default route after login; opened 100× a day)

**Page header, 64px, management register.** `page-title` "Chaqiruvlar" left; immediately right of it a count pill — `radius.full`, `accent-soft` fill, `accent` text, `dense` — reading "3 faol". **The pill is teal, not red**: it is a number, not a call, and constraint 2 says nothing else in any interface may be red. Right-aligned: a `control.32` ghost button "Devor rejimi ↗" opening `/wall`, and the floor filter as a segmented control (`control.32`, `radius.2`, `border-strong`, active segment = `surface-soft` + `text-1`, no teal fill — the filter is not the point of the page). `border.hairline` rule below, `space.24` gap.

**Live region, alert register.** No card wrapper, no panel title, no border around the group — cards sit directly on `bg`.

```
grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
gap: 16px;
```

On a 1440px window (1152px content) that is 3 columns of ~373px; on a 1920px wall-mounted panel, 4. This replaces P1's single 880px column, which fit two overdue calls above the fold and left 400px of dead space in the middle of every card.

**One call card:** `radius.3`, fill `call.fill[step]`, `shadow.none`, `call.edge` outline at `call.edgeWidth.deskPhone[step]`, padding `space.20`, **no fixed height**.

- Rail column, left, 3 slots (6×20, gap 4), vertically centred, `space.16` to the content column.
- Room number alone: `alert.room.desk[step]` (72/84/96, 700, tabular), `call-ink`. No `"Xona"` prefix — on a page called Chaqiruvlar, a 96px red numeral needs no label, and dropping it buys 90px of horizontal room.
- Meta row, baseline-aligned, `space.12` below: `"3-qavat"` in `alert.floor.desk` left; the elapsed timer in `alert.timer.desk` (mono, tabular) right, counting up client-side from `created_at` so it never sits stale between polls.
- Acknowledge slab, `space.16` below, full card width: `control.36`, `radius.2`, `call-slab` `#FFFFFF` fill, label "Tasdiqlash" in `alert.ack.desk` **coloured `call.fill[step]`** — so its contrast is automatically 4.64–9.73:1 with no per-step token. In flight the label swaps to "Yuborilmoqda…", the button is disabled, and **the button never changes width**, so nothing reflows during the request.

**Empty state.** No illustration, no reassuring copy. An 8px `ok` dot + `body` `text-2` "Faol chaqiruv yo'q", beneath it `meta` `text-3` "Ulanish faol · 14:02". Proving liveness matters more than reassurance, and deliberately small: a large illustrated empty state occupies the exact screen region the eye has learned to scan for red.

**History, `space.32` below with a full-bleed hairline rule**, management register: `card-title` "Bugungi tarix", `meta` "Oxirgi 50 ta", then a dense table (§6.4). Columns Xona / Qavat / Kelgan / Javob berildi / Kim / Kutish. **There is no red in this table, ever, including a missed call.** Red means *right now*; diluting it into a log is how it stops working. Acknowledged rows carry a filled `ok` dot; expired rows a hollow `text-3` ring.

### 6.2 `/wall` — wall monitor

Bookmarkable, no auth UI, no nav, no scrollbar, `overflow: hidden`, cursor hidden. Reads floor scope from the URL (`/wall?floor=2`, read-only) so each station bookmarks its own panel — fewer irrelevant cards is the cheapest legibility win in the product.

**Forced dark** via `data-theme="dark"` set by the route; the theme toggle is not rendered. A wall monitor runs 24/7 including night shifts, and the correct brightness for a desk is wrong for a corridor.

**Code sharing (constraint 6), structurally enforced.** `/wall` renders the same `<CallCard>` and the same `ageStep()` as `/calls`, with `size="wall"` selecting the wall token arrays. **The ack slab renders `if (onAck)`, and `/wall` does not pass `onAck`.** Display-only is guaranteed by the component's type signature — not by a `variant !== 'wall'` string comparison that a typo defeats and a future third variant silently escapes.

**Top bar, 64px, `gutter.wall` 32:** clinic name left in `card-title` `text-2` (small — it is not information anyone needs). Right: the clock in `mono` at 40/700 tabular `text-1` **whose colon blinks at 1 Hz**, then an 8px status dot + `dense` label — `ok` "Ulangan" / `attn` "Qayta ulanmoqda" / hollow `text-3` "Ulanish yo'q". A frozen browser tab and a quiet ward look identical on a wall monitor; a ticking colon is the cheapest possible proof of life and it sits on the clock, not on a patient call.

**Grid:** `gutter.wall` 32 padding, `repeat(auto-fill, minmax(420px, 1fr))`, gap `space.24`. On 1920×1080: 1856px usable / 4 columns of 446px; 952px of vertical space / 3 rows of 301px. **12 slots.**

Three states, three single conditionals:

| Calls | Render |
|---|---|
| **1** | The card fills the body. Room number `alert.room.wallSolo[step]` (200/224/256). One call means the entire wall is one number — the single most valuable state, and the one the current product wastes. |
| **2–11** | The grid. Room `alert.room.wall[step]` (112/128/148). |
| **≥ 12** | The 11 oldest render as cards; slot 12 becomes an **overflow tile** — `surface`, `border-strong`, `radius.4`, `alert.overflowCount` 56/700 `text-1` "+7", `alert.overflowMeta` 24/500 `text-2` "eng qadimgisi 11:04". **Neutral, never red**, so it never competes with a real call. Naming the age of the worst hidden call is the only version of an overflow tile that supports a triage decision. |

The wall never scrolls, never paginates, never rotates a carousel. A screen nobody touches must not hide anything below a fold, and the number of rooms it is hiding must be stated in words.

**Wall card content:** rail (12×40 slots), room number, and **one meta row** carrying floor and timer together — `"3-qavat"` in `alert.floor.wall` 32/600 left, timer in `alert.timer.wall` 48/700 mono right. There is no separate floor line and no density ladder: one layout at all counts, which is what "one code path" has to mean.

**Omitted and why:** the acknowledge button (anyone walking past could clear a call, the patient would be abandoned, and the audit answer "who acknowledged? — the wall" is worthless); every control (a wall screen has no user); the sidebar, history, device state, subscription state, avatars, icons, hover states, and any text under 20px.

**Empty state:** black page, centred, the mono clock at 96/700 `text-2` with its blinking colon, `card-title` `text-3` "Faol chaqiruv yo'q" beneath, and the connection dot. It looks like a working instrument at rest rather than a broken screen, which is precisely what staff need to believe about it at 3 a.m. No green tick, no "all calm" badge — a wall that congratulates itself when idle trains everyone in the corridor to stop looking at it.

### 6.3 Dashboard navigation & information architecture

**Sidebar 240px** (collapsible to 72px), `surface`, `border.hairline` right. Top: 56px brand row — `tile.brand` 40×40 + "NurseCall" in `card-title`. One flat teal square. No gradient, no glow.

`space.24`, then **Group 1, no caption, one item:**

- **Chaqiruvlar** — 48px row, `body-lg` (16/400, 600 when active), 22px icon, right-aligned teal count pill (`accent-soft` / `accent`, `radius.full`, appears only when active calls > 0). Active state: `accent-soft` fill, `accent` text, `radius.2`, 3px `accent` bar on the left edge.

`space.24`, a `border-strong` rule, `space.24`, then **Group 2**, caption "SOZLAMALAR" in `eyebrow` `text-3`:

- **Xonalar · Qurilmalar · Xodimlar · Obuna** — 36px rows, `dense` (13/500), 18px icon, `text-2` at rest.

The item opened 100× a day is **33% taller, two type steps larger and two weight steps heavier** than the ones opened monthly, and sits above a 24px void and a rule. Today all six sit at identical size and identical distance, which is the actual cause of "the layouts are confusing".

**`UnassignedTab` is removed from the nav.** Unassigned signals are a *device state*, so they become a segmented control inside Qurilmalar — "Barchasi / Biriktirilmagan (4)" — with the count badge in `attn` when non-zero, never red.

**Sidebar footer:** a **static** connection dot (`ok` / `attn` / hollow `text-3`) + `meta` label, user name in `dense` and role in `meta`, then three `control.32` icon buttons (theme, help, logout). No avatar image, no pulsing dot — a "status: live" widget in a desk sidebar is exactly the templated tell the brief is about.

**Page header pattern, identical on all five pages:** `page-title` title · `body` `text-2` one-line description ("Qurilmalar va ularning oxirgi signali") · one right-aligned `control.36` `accent` primary button · `border.hairline` rule · `space.24` gap. No breadcrumbs, no tabs-that-are-really-navigation, and no page invents its own header.

### 6.4 Tables — the biggest management change

The "table inside a card" wrapper is deleted. **One container, three strips:**

- **Container:** `surface`, 1px `border-strong`, `radius.3`, `overflow: hidden`, `shadow.none`.
- **Strip 1 — toolbar, 44px, inside the container**, `surface-sunken` fill, `border.hairline` bottom, holding a `control.32` search input and any filter controls. This kills the current "toolbar floating above a table inside a card inside a page" nesting.
- **Strip 2 — header row, 36px**, `surface-sunken`, `dense` `text-2`, **sentence case**, `border-strong` bottom rule. Sortable columns get a 12px `text-3` chevron that turns `accent` when active.
- **Strip 3 — body rows**, `min-height: 44px`, `dense`. Column 1 (the identifying column) `text-1` at 600; all others `text-2` at 500. `border.hairline` bottom, `surface-soft` on hover, 2px inset `accent` ring on keyboard focus. **No zebra striping** — hairlines already delimit rows and stripes only add noise at this density.
- Cell padding `space.12` horizontal, `space.16` on first and last. Numbers and timestamps right-aligned, tabular. Device IDs and EV1527 codes in `mono-sm` with `letter-spacing: 0.02em` so a technician reading one aloud does not confuse 0 from O; middle-truncated with the full value in `title`.
- **Status:** 8px dot + word. Filled `ok` = Onlayn/Faol; hollow `text-3` ring = Oflayn/Nofaol; filled `attn` = Muddati tugaydi. Never a coloured pill, never coloured text, never red.
- **Row actions:** right-aligned `control.32` icon buttons, `text-3` → `text-1` on row hover, revealed on hover at ≥1024px and **always visible** under `(hover: none)`.
- Uzbek column widths are set from the longest real Uzbek header, not `auto`. "Oxirgi signal vaqti" is 19 characters and must not wrap.

**Mobile (<768px):** the existing card-per-row conversion is kept, restyled — `surface`, `border.hairline`, `radius.3`, `shadow.none`, `space.16` padding, `meta` `text-3` label above `dense` `text-1` value, 12px between cards, `gutter.app` 16. Row actions become a full-width 48px footer strip inside the card.

**Forms:** label in `dense` 600 **above** the field, never a placeholder-as-label (a gloved thumb starting to type erases the only hint). Input `control.36` desk / `control.56` phone, `body` 15 desk / `body-lg` 16 phone, `border.field` 1.5px, `radius.2`, `surface` fill. Focus = 2px `accent` ring at 2px offset + `accent` border. Errors: `attn` 1.5px border, a 16px ⚠ outline glyph, message in `meta` 600 `attn`, and the field keeps its typed value.

**Modals:** `radius.3`, `space.32` padding, `shadow.pop`, `max-width` 480, 48×48 close hit box, actions bottom-right, primary `accent`.

**Stat tiles:** `surface`, `border.hairline`, `radius.3`, `shadow.none`, `space.20` padding, `eyebrow`-cased label in `text-3`, value in `stat` 28/700 tabular, delta in `meta`. No icon tile, no coloured card background, no gradient. Six tiles that all look like data beat four tiles wearing costumes.

### 6.5 Phone

`WelcomeScreen.tsx` is deleted from the navigator and from the repo. The app opens on Login and, once a token exists, on Calls.

**Login.** `SafeAreaView` from `react-native-safe-area-context` with `edges={['top','bottom']}`; `KeyboardAvoidingView` (`padding` iOS / `height` Android). `gutter.phone` 16 is the only horizontal number on the screen.

Vertical: `inset-top + 8`, then a block at ~18% of viewport height — `tile.brand` 40×40, `space.12`, "NurseCall" in `page-title`, `space.4`, `body-lg` `text-2` "Hisobingizga kiring". Then `space.40`, two fields (`control.56`, `body-lg` 16, `border.field`, `radius.2`), `space.16` apart, with `autoCapitalize="none"`, `keyboardType="email-address"` and `textContentType` set so the OS password manager works one-handed. Then `space.24` and the primary: full width, `control.56`, `accent` fill, `radius.2`, `alert.ack.phone`-weight label in `accent-ink` "Kirish"; while busy the label becomes a spinner and the button keeps its height. Footer at `inset-bottom + 24`: `mono-sm` `text-3` "v1.4.0 · api.soat.uz" — deliberately technical, because the vendor reads it during installation.

**One `<Banner variant="attn">` component** replaces today's two divergent error banners: `min-height` 48, `attn-soft` fill, 1.5px `attn` border, `radius.2`, 20px ⚠ glyph, `dense` 600 `attn` message, and a 24px close glyph in a `control.48` box (measured today at 20×20). It is the same component as the billing banner and the offline banner.

**Calls screen.** Header 56px inside `gutter.phone`: `card-title` "Chaqiruvlar" + the same teal count pill; right, one `control.48` icon button opening a sheet with theme, battery-optimisation help, logout and version. **Nothing destructive within thumb reach** — per the thumb-reach rule.

List: `FlatList`, `contentContainerStyle` padding 16 horizontal / 8 top / `inset-bottom + 24` bottom, `ItemSeparatorComponent` = 12. **Oldest first.** No pull-to-refresh — a gesture competing with a live socket on an alert surface, triggerable one-handed while walking; a `control.48` "Qayta urinish" lives in the offline banner instead.

**Call card (multi-call):** full width, `radius.3`, `call.fill[step]`, `shadow.none`, `call.edge` at `call.edgeWidth.deskPhone[step]`, padding `space.20` horizontal / `space.16` vertical, **no fixed height**. Rail (5×18 slots) left; room number `alert.room.phone[step]` (64/72/80, tabular) with the timer `alert.timer.phone` right-aligned on the same baseline; `"3-qavat"` in `alert.floor.phone` 17/600 beneath; then `space.16` and the action.

The 18px grey card with an 18px bell glyph and an 18px room number is deleted outright. It is the single worst thing in the current product.

**Acknowledge:** full card width, `control.64` (`tap.gloved`), `#FFFFFF` fill, `radius.2`, label "Tasdiqlash" in `alert.ack.phone` 18/700 coloured `call.fill[step]` — white-on-red inverted to red-on-white, so the button is unmistakably *a thing you press* and not more card. **The card body is inert; only the slab is tappable.** That is what makes a single tap safe, and it is why the unproven 350ms press-and-hold is not in this spec. On press the label swaps to a spinner in the step colour; the button never moves.

**Call card (exactly one call — the pocket case, and the most common real state):** the card grows to fill the list viewport, room number goes to `alert.room.phoneSolo[step]` (88/96/104), the floor line to 20/600, and the ack slab pins to the card bottom at `inset-bottom + 24`, squarely in the one-handed thumb arc. The nurse pulls the phone out, sees one number, presses without looking twice.

**Haptics:** one notification buzz on arrival, one light impact at each step transition. Three vibrations over three minutes, never a repeating pattern. A phone that buzzes continuously ends up face-down in a drawer.

**Offline** — the state the app has no visual for today, and the most dangerous omission in it. An empty list and a dead socket look identical. After 10 seconds disconnected, the shared `<Banner variant="attn">` docks under the header: "Aloqa yo'q — qayta ulanmoqda", with the last-successful-poll time in `meta`, plus a `control.48` retry. **The call list stays at full contrast and is never dimmed** — a stale list of possibly-real patient calls is the exact moment you must not reduce legibility; the doubt belongs in the banner, not in the cards.

**Billing notices render BELOW the active-call list, never above it.** A billing message must not be the first thing between a nurse and a patient.

**Update-required screen:** the shared brand block, the shared Banner in `attn`, the shared primary button. Three existing components, zero new ones.

**Empty state:** centred, 12px `ok` dot, `space.12`, `alert.floor.phone`-sized 17/500 `text-2` "Chaqiruv yo'q", `space.4`, `meta` `text-3` "Yangi chaqiruvlar avtomatik ko'rinadi". No illustration.

### 6.6 Watch

Wear Material 1 only (`androidx.wear.compose.material`): `Scaffold`, `TimeText`, `Vignette`, `PositionIndicator`, `ScalingLazyColumn`, `Chip`, `CompactChip`, `CircularProgressIndicator`, `MaterialTheme(colors = nurseCallWearColors())`. No Material 3, no new library, no font file. All seven `Color(0x…)` literals in `MainActivity.kt` are replaced by a generated `object NurseCallTokens`.

`MaterialTheme` mapping: `background #000000`, `surface #171C1D`, `primary #35C9B6`, `onPrimary #04120F`, `secondary #E0A63A`, `onSecondary #04120F`, `error #B9271B`, `onError #FFFFFF`, `onBackground/onSurface #E9EDED`, `onSurfaceVariant #A8B2AF`.

`gutter.watch` 10dp plus Wear's chin insets. Every `Text` carries an explicit `maxLines` and `TextOverflow.Ellipsis`. **Uzbek line budget**, measured against a 192dp face minus insets ≈ 164dp usable: ~7 chars at 40sp, ~11 at 26sp, ~20 at 15sp. Every string below is written to that budget.

**State A — one active call.** A full-bleed `Box(Modifier.fillMaxSize().background(callFill))` — **not a `Chip`**. Wear's `Chip` is a fixed-height (52dp) Row with icon/label/secondaryLabel slots that applies its own content padding and forces `typography.button` on the label; forcing a centred four-element column at 48sp through it fights the component for no benefit. `RoundedCornerShape(0.dp)` — the display is already round; a rounded container inside a round screen throws away a third of the pixels for a border nobody reads.

- Rail: 3 vertical slots (4×14dp, gap 3dp) at the left inside the inscribed square. **Vertical, not horizontal** — a horizontal row clips at the edges of a round face.
- Room number: `alert.room.watch[step]` (40/44/48sp, 700, tabular), `#FFFFFF`, `maxLines 1`, autoshrinking to 36sp for strings over 4 characters ("12-A"). Just the number.
- Floor: `alert.floor.watch` 14sp/500, `"3-qavat"` (7 chars).
- Timer: `alert.timer.watch` 16sp/600 in a fixed-width `Modifier` so digits do not jitter and pull the eye every second.
- **Acknowledge:** a `Chip` at `control.48`, width ≈ 130dp, horizontally centred, pinned above the chin — **not** a full-width band (the bottom 40dp of a circle is a thin lens, not a bar) and **not** the whole screen (a wrist is brushed constantly). `#FFFFFF` fill, label "Tasdiqlash" in `alert.ack.watch` 15sp/700 coloured `call.fill[step]`, `maxLines 1`. On tap: content swaps instantly to a 28dp `CircularProgressIndicator`, then a 24dp ✓ in `ok` for 700ms.
- Contrast on the watch: white ink 6.23 / 5.29 / 4.64:1 — AA-normal at every step, so the 14sp floor line is compliant, not excused. Card vs. true black: 3.37 / 3.97 / 4.53:1.
- One haptic on arrival, one short re-buzz per step transition. Never continuous.

**State B — two or more calls.** A 20dp top strip on `surface` with "3 chaqiruv" in `watch.meta` 12sp `watch-text-2`, then a `ScalingLazyColumn` auto-scrolled to the oldest. Each item: 48dp, `radius.2`, filled with **that call's own step colour** — so three calls can show three different reds and the ranking is visible without reading a digit. Content: rail (3 slots at 3dp wide) left, room at `alert.roomList.watch` 26sp/700, timer 15sp/600 right. Wear's own scaling renders the top (oldest) item largest, reinforcing the triage order for free. Tapping an item opens its State A view; the ack chip confirms there. **No swipe gestures** — a wrist is not a good place for a gesture with consequences.

**State C — idle.** Pure `#000000`, almost no lit pixels. Centred: an 8dp `ok` dot, `watch.body` 15sp `watch-text-2` "Chaqiruv yo'q" (13 chars), and beneath it a 6dp connection dot — `accent` connected, `attn` connecting, hollow `text-3` ring disconnected, with the label "Ulanish yo'q" in `attn` when dead. **The disconnected state is amber, not the current `#F44336` red.** A watch that looks peacefully idle while it is actually offline is the worst failure mode this product has.

**State D — standalone login.** `watch.body` 15sp `text-1` "Hisobingizga kiring" (19 chars, `maxLines 2`), two `Chip`s at `control.48` in `surface` opening the platform input, then a `control.48` `accent` `#35C9B6` chip with `accent-ink` `#04120F` label "Kirish" / "Kirilmoqda…" — replacing `Color(0xFF1D5FE0)`, the last survivor of the abandoned blue theme. Errors: 14sp `attn` with a 12dp ⚠, `maxLines 3`. **A login failure on the watch is amber, so the watch never shows red for anything except a patient call.**

**State E — outdated.** Black, a 20dp ⚠ in `attn`, `watch.title` 18sp `attn` "Ilova eskirgan", `watch.body` 15sp `watch-text-2` "Telefondan yangilang". No action chip — the watch cannot fix this.

**State F — billing notice.** A `CompactChip` in `attn-soft` with `attn` 12sp text, `maxLines 1`, docked at the bottom of the **idle screen only**. It is never composited over a call card in either the single or the list state. A patient call never shares a wrist with an invoice.

**Identity fixes (constraint 12):** `android:label` becomes **"NurseCall"** on the watch manifest (was "Chaqiruv monitor"). The `android.R.drawable` stock notification icons are replaced by two shipped 24dp monochrome vectors — `ic_notify_call` (a rounded square with the three-bar rail cut out of it, the product's owned glyph) and `ic_notify_system` (an outline info circle) — on two channels, `call` (`#CB2F22`) and `system` (`#0C6A62`). `#6C5CE7` is deleted from the manifest and the codebase.

### 6.7 Landing page

One self-contained HTML file with inline `<style>`. The generator writes the token block between `/* @tokens:start */` and `/* @tokens:end */`, and **inlines Inter as a base64 woff2 `@font-face` data URI in the same block**. This makes no external request, so the strict CSP holds; the only requirement is that `font-src` in the CSP this team writes for `server/static/landing.html` includes `data:`. Subset: Latin + Latin-Ext-A + `U+02BB U+02BC U+2018 U+2019` — ~38 KB woff2, ~51 KB base64.

**Same colour tokens, same type family, same radii. Three levers loosen and nothing else:** padding (`space.112`/`80`/`64` sections instead of the dashboard's `24`/`32`), radius (`radius.4` instead of `radius.3`), and the three landing-only display styles. **No new hue, no gradient, no glassmorphism, no mesh blobs, no shadow beyond `shadow.pop` on the one floating figure.**

Rhythm: full-bleed bands alternating `bg` / `surface-sunken`, separated by a 1px `border` rule at the top edge, never by a tinted "section-alt". Content max-width 1120, bands 1280, `gutter.landing` 24. Every section opens with the same three-part head — `eyebrow` `accent` kicker, `landing-h2` title, `landing-lede` `text-2` at 62ch — then `space.48` before the content. That single repeated head is what makes the page feel composed rather than assembled.

1. **Nav, 64px sticky:** `tile.brand` + wordmark; four links in `body-lg` `text-2`; right, a `control.36` theme toggle, a ghost "Kirish" and an `accent` "Bog'lanish".
2. **Hero,** 7/5 two columns at ≥1024px. `landing-h1` at `max-width: 22ch` — the hard `<br>` is removed so Uzbek reflows instead of breaking mid-clause — with **one word swapped to `accent`** (not italic, not a gradient). Lede at 62ch. Two `control.48` CTAs.
3. **Hero figure,** right column — the only place red appears on the marketing page, and it appears because it *depicts* a real call: a `surface` panel with `radius.4`, `border.hairline` and `shadow.pop` containing an actual wall-variant `<CallCard>` rendered in real CSS from real tokens (`call.fill[2]`, room "214", rail ●●○, mono timer). The product's most distinctive object is its own advertisement, red stays reserved because it is depicted rather than asserted, and the figure costs nothing to build because it is the shipped component. **The existing decorative ECG line is deleted — a fake heartbeat on a nurse-call page is theatre.**
4. **Qanday ishlaydi** — four steps (tugma → ESP32 → server → soat/telefon), joined by a single 1px `border` rule running behind them. Each: a bare numeral in `accent`, a `card-title`, a `body-lg` `text-2` paragraph. No cards, no arrows, no animation.
5. **Signal path** — one wide inline SVG drawn entirely in `border-strong` strokes with `text-2` labels, its technical annotations (433 MHz, EV1527) in the **same `mono-sm`** the dashboard uses for device IDs.
6. **Ikki rejim** — the thesis, exhibited: left, a real dashboard table fragment at real scale (hairlines, dots, tabular figures, 13px cells); right, the real watch call screen on a black circle. One caption explains the reserved red. This is the most credible proof available to a vendor who sells in person, and both halves are shipped components.
7. **Features** — 2×3 hairline blocks, `radius.4`, `space.32` padding, `shadow.none`.
8. **Narxlar** — three equal columns. The recommended plan differs by a **1.5px `accent` border and a small `accent` `eyebrow` label** only: not scaled up, not shadowed, not tinted, no coloured background. Prices in `stat`, tabular.
9. **Aloqa** — form left with fields identical to the dashboard's (`control.48`, `border.field`, label above), contact details right. Success and error states use the shared `attn` / `accent-soft` notice pattern, never red.
10. **Footer** — `surface-sunken`, `space.64`, three link columns in `dense`, `meta` `text-3` legal line, `border.hairline` top.

The consistency claim is testable: open the landing page and the dashboard side by side and **every hex and every font-family matches**, while every padding, radius and heading size is one to two steps apart. Consistency belongs in colour and type; density belongs to the job.

---

## 7. `tokens.json` — the exact shape the generator reads

Every token carries `targets`. `--check` fails if a target emits a token it was not declared for, or reads a token it was.

```jsonc
{
  "$schema": "./tokens.schema.json",
  "meta": {
    "version": 1,
    "targets": ["css", "ts", "kotlin", "landing"],
    "outputs": {
      "css":     "web-dashboard/src/styles/tokens.css",
      "ts":      "mobile-app/src/theme.ts",
      "kotlin":  "app/src/main/java/uz/soat/reminder/NurseCallTokens.kt",
      "landing": "server/static/landing.html"     // between /* @tokens:start|end */
    }
  },

  "font": {
    "weights": [400, 500, 600, 700],              // enum; any other value fails the build
    "sans": {
      "stack": ["Inter", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      "phoneFamilies": {                          // RN/Android resolves a NAME, not a number
        "400": "Inter_400Regular", "500": "Inter_500Medium",
        "600": "Inter_600SemiBold", "700": "Inter_700Bold"
      },
      "targets": ["css", "ts", "landing"]
    },
    "mono": {
      "stack": ["JetBrains Mono", "ui-monospace", "SF Mono", "Menlo", "monospace"],
      "kotlin": "FontFamily.Monospace",
      "targets": ["css", "ts", "kotlin", "landing"]
    },
    "watchSans": { "platform": true, "targets": ["kotlin"] },
    "subset": {
      "unicodeRanges": ["U+0000-00FF", "U+0100-017F", "U+02BB", "U+02BC", "U+2018", "U+2019"],
      "canonicalApostrophe": "U+02BB",
      "woff2Base64File": "tools/inter-subset.woff2.b64",
      "targets": ["landing"]
    }
  },

  "color": {
    "bg":            { "light": "#F6F7F7", "dark": "#0E1213" },
    "surface":       { "light": "#FFFFFF", "dark": "#171C1D" },
    "surfaceSoft":   { "light": "#FAFBFB", "dark": "#131819" },
    "surfaceSunken": { "light": "#EEF0F0", "dark": "#0A0E0F" },
    "border":        { "light": "#E2E5E5", "dark": "#272E2F" },
    "borderStrong":  { "light": "#C7CCCC", "dark": "#394142" },
    "borderField":   { "light": "#8B9293", "dark": "#697374", "minContrastOn": "surface", "min": 3.0 },
    "text1":         { "light": "#14191A", "dark": "#E9EDED", "minContrastOn": "surface", "min": 7.0 },
    "text2":         { "light": "#4A5456", "dark": "#A4AEAE", "minContrastOn": "surface", "min": 4.5 },
    "text3":         { "light": "#6C7679", "dark": "#7B8586", "minContrastOn": "surface", "min": 4.5 },
    "textDisabled":  { "light": "#A2A9A9", "dark": "#4E5758" },
    "accent":        { "light": "#0C6A62", "dark": "#35C9B6" },
    "accentHover":   { "light": "#0A5A54", "dark": "#4FD6C4" },
    "accentPress":   { "light": "#095049", "dark": "#63DFCE" },
    "accentInk":     { "light": "#FFFFFF", "dark": "#04120F" },
    "accentSoft":    { "light": "#0C6A621F", "dark": "#35C9B62E", "alpha": true },
    "attn":          { "light": "#8A5A00", "dark": "#E0A63A" },
    "attnSoft":      { "light": "#8A5A0016", "dark": "#E0A63A24", "alpha": true },
    "ok":            { "light": "#146B3A", "dark": "#3FC97E" }
    // targets default to all four
  },

  "watchOverrides": {                              // the ONLY per-target colour exception, and it is explicit
    "bg":    "#000000",
    "text2": "#A8B2AF",
    "text3": "#7C8683",
    "targets": ["kotlin"]
  },

  "call": {
    "reserved": true,                              // enables the Rule 0 lint
    "thresholdsSec": [0, 30, 120],
    "fill": {
      "light": ["#C4241A", "#A81810", "#8A100A"],
      "dark":  ["#B9271B", "#CB2F22", "#D93726"]
    },
    "ink":  { "light": "#FFFFFF", "dark": "#FFFFFF" },
    "edge": { "light": "#6E0A06", "dark": "#FF6B54" },
    "slab": { "light": "#FFFFFF", "dark": "#FFFFFF" },
    "edgeWidth": { "deskPhone": [2, 2, 4], "wall": [3, 3, 6], "watch": [2, 2, 4] },
    "invariants": {
      "inkContrastMin": 4.5,                       // every fill vs. call.ink
      "pageContrastMin": 3.0,                      // every fill vs. color.bg, same theme
      "pageContrastMonotonic": true                // step1 < step2 < step3, both themes
    }
  },

  "notify": {
    "accentCall":   { "value": "#CB2F22", "channel": "call",   "icon": "ic_notify_call" },
    "accentSystem": { "value": "#0C6A62", "channel": "system", "icon": "ic_notify_system" },
    "targets": ["kotlin"]
  },

  "type": {
    "mgmt": {
      // every style is {size, lineHeight, weight, tracking, case, tabular, mono}
      "eyebrow":   { "size": 11, "lineHeight": 16, "weight": 600, "tracking":  0.06, "case": "upper" },
      "meta":      { "size": 12, "lineHeight": 16, "weight": 500, "tracking": 0 },
      "monoSm":    { "size": 12, "lineHeight": 16, "weight": 500, "tracking": 0, "mono": true, "tabular": true },
      "dense":     { "size": 13, "lineHeight": 18, "weight": 500, "tracking": 0 },
      "mono":      { "size": 13, "lineHeight": 18, "weight": 500, "tracking": 0, "mono": true, "tabular": true },
      "body":      { "size": 15, "lineHeight": 22, "weight": 400, "tracking": 0 },
      "bodyLg":    { "size": 16, "lineHeight": 24, "weight": 400, "tracking": 0 },
      "cardTitle": { "size": 18, "lineHeight": 24, "weight": 600, "tracking": -0.005 },
      "pageTitle": { "size": 22, "lineHeight": 28, "weight": 700, "tracking": -0.01 },
      "stat":      { "size": 28, "lineHeight": 32, "weight": 700, "tracking": -0.015, "tabular": true }
    },
    "landing": {                                   // clamp() is web-only
      "h1":   { "clamp": [38, "5.2vw", 60], "lineHeight": 1.06, "weight": 700, "tracking": -0.02, "maxWidth": "22ch" },
      "h2":   { "clamp": [28, "3.4vw", 40], "lineHeight": 1.14, "weight": 700, "tracking": -0.02 },
      "lede": { "clamp": [17, "1.6vw", 19], "lineHeight": 1.55, "weight": 400, "maxWidth": "62ch" },
      "targets": ["css", "landing"]
    },
    "alert": {
      // step arrays are indexed by ageStep() - 1
      "roomDesk":      { "size": [72, 84, 96],    "lineHeight": 0.95, "weight": 700, "tracking": -0.02, "tabular": true, "maxScale": 1.2 },
      "roomPhone":     { "size": [64, 72, 80],    "lineHeight": 0.95, "weight": 700, "tracking": -0.02, "tabular": true, "maxScale": 1.2, "targets": ["ts"] },
      "roomPhoneSolo": { "size": [88, 96, 104],   "lineHeight": 0.95, "weight": 700, "tracking": -0.02, "tabular": true, "maxScale": 1.2, "targets": ["ts"] },
      "roomWall":      { "size": [112, 128, 148], "lineHeight": 0.95, "weight": 700, "tracking": -0.02, "tabular": true, "targets": ["css"] },
      "roomWallSolo":  { "size": [200, 224, 256], "lineHeight": 0.95, "weight": 700, "tracking": -0.02, "tabular": true, "targets": ["css"] },
      "timerDesk":     { "size": 22, "lineHeight": 26, "weight": 700, "mono": true, "tabular": true, "maxScale": 1.2 },
      "timerPhone":    { "size": 20, "lineHeight": 24, "weight": 700, "mono": true, "tabular": true, "maxScale": 1.2, "targets": ["ts"] },
      "timerWall":     { "size": 48, "lineHeight": 52, "weight": 700, "mono": true, "tabular": true, "targets": ["css"] },
      "floorDesk":     { "size": 15, "lineHeight": 20, "weight": 600 },
      "floorPhone":    { "size": 17, "lineHeight": 22, "weight": 600, "targets": ["ts"] },
      "floorWall":     { "size": 32, "lineHeight": 36, "weight": 600, "targets": ["css"] },
      "ackDesk":       { "size": 15, "lineHeight": 20, "weight": 700 },
      "ackPhone":      { "size": 18, "lineHeight": 24, "weight": 700, "targets": ["ts"] },
      "overflowCount": { "size": 56, "lineHeight": 60, "weight": 700, "tabular": true, "targets": ["css"] },
      "overflowMeta":  { "size": 24, "lineHeight": 28, "weight": 500, "targets": ["css"] }
    },
    "watch": {                                     // unit: sp
      "room":     { "size": [40, 44, 48], "weight": 700, "tabular": true },
      "roomList": { "size": 26, "weight": 700, "tabular": true },
      "timer":    { "size": 16, "weight": 600, "tabular": true },
      "floor":    { "size": 14, "weight": 500 },
      "ack":      { "size": 15, "weight": 700 },
      "title":    { "size": 18, "weight": 700 },
      "body":     { "size": 15, "weight": 500 },
      "meta":     { "size": 12, "weight": 500 },
      "unit": "sp", "targets": ["kotlin"]
    }
  },

  "space":   { "0":0, "2":2, "4":4, "8":8, "12":12, "16":16, "20":20, "24":24,
               "32":32, "40":40, "48":48, "64":64, "80":80, "112":112 },
  "gutter":  { "app": 24, "appNarrow": 16, "phone": 16, "wall": 32, "landing": 24, "watch": 10 },
  "radius":  { "0":0, "1":4, "2":8, "3":12, "4":16, "full":999,
               "bands": [[0,32,1],[32,64,2],[64,240,3],[240,99999,4]] },
  "control": { "32":32, "36":36, "44":44, "48":48, "56":56, "64":64 },
  "border":  { "hairline": 1, "field": 1.5, "focus": 2, "focusOffset": 2 },
  "rail":    { "desk":  { "w":6,  "h":20, "gap":4 },
               "phone": { "w":5,  "h":18, "gap":4 },
               "wall":  { "w":12, "h":40, "gap":8 },
               "watch": { "w":4,  "h":14, "gap":3 },
               "slots": 3, "emptyStroke": 1.5 },
  "size":    { "sidebar": 240, "sidebarCollapsed": 72, "contentMax": 1160,
               "landingMax": 1120, "landingBandMax": 1280, "proseMax": "62ch",
               "wallCardMin": 420, "deskCardMin": 320, "tileBrand": 40, "icon": 20 },
  "motion":  { "fast": 120, "base": 180, "ease": "cubic-bezier(0.2, 0, 0.2, 1)",
               "alertRegister": "none" },
  "shadow":  { "none": "none",
               "pop": { "light": "0 8px 24px -8px #0000002E",
                        "dark":  "0 12px 32px -8px #00000099" },
               "targets": ["css", "ts"] }
}
```

**Emitter notes.**
- `tracking` is em. The Kotlin emitter converts to `.sp` using the token's own size; the RN emitter converts to px (`letterSpacing`).
- Alpha tokens are `#RRGGBBAA` at source. CSS and TS consume verbatim; the Kotlin emitter reorders to `0xAARRGGBB`.
- `shadow` is not emitted to Kotlin at all — the watch has no elevation, and the honest answer is "nothing", stated in the schema rather than discovered at build time.
- The TS emitter writes `fontFamily` strings from `font.sans.phoneFamilies`, never a numeric `fontWeight`.

---

## 8. `--check` rules (what makes the build fail)

1. **Staleness** — any generated file differs from what the current `tokens.json` would produce.
2. **Weight enum** — any `weight` not in `[400, 500, 600, 700]`.
3. **Reserved red (Rule 0)** — any file outside the allowlist references a `call.*` token. Allowlist: `CallCard`, `WallView`, `ageStep`, the watch call composables, and the landing hero figure. Someone *will* ship a red toast within six months; this is the guard, not a comment.
4. **Alert ink invariant (Rule 2)** — any `call.fill` measures < 4.5:1 against `call.ink`.
5. **Alert page invariant** — any `call.fill` measures < 3:1 against `color.bg` in its own theme, or the three steps are not strictly increasing in page contrast.
6. **No alpha in the alert register (Rule 1)** — any token consumed by an alert-register component carries `alpha: true`.
7. **Target mismatch** — an emitter reads a token whose `targets` excludes it (e.g. Kotlin reading `type.landing`).
8. **Non-text contrast** — `borderField` < 3:1 against `surface` in either theme.
9. **Gutter uniqueness** — more than one `gutter.*` token referenced within one screen module.
10. **Fixed heights** — a `height:` (rather than `minHeight:`) on any card, row or button in a scanned component directory.

---

## 9. What changes from today, per surface

### `web-dashboard/`
- `src/styles/style.css`: `--accent: #696cff`, `--accent-hover`, `--accent-soft`, `--accent-2` cyan and `--accent-2-soft` are replaced by the teal set. `--blob-a/b/c` deleted along with the `.mesh` background. The purple gradient brand mark (`linear-gradient(155deg, …)` + its `box-shadow`) is replaced by `tile.brand`, a flat teal square. `--shadow-sm/md/lg` collapse to `shadow.none` + `shadow.pop`. New: `tokens.css`, generated, imported first.
- `src/components/Sidebar.tsx`: flat six-item list → two groups; Chaqiruvlar promoted to 48px/`body-lg` with a teal count pill; the other four demoted to 36px/`dense` under a "SOZLAMALAR" eyebrow; `UnassignedTab` removed from the nav; footer connection dot made static.
- `src/components/tabs/UnassignedTab.tsx` becomes a segmented view *inside* `DevicesTab.tsx` ("Barchasi / Biriktirilmagan (n)"), with an `attn` count badge.
- `src/components/tabs/CallsTab.tsx`: rewritten as two zones — a `<CallCard>` grid in the alert register above, a dense history table below. New shared `CallCard.tsx` + `ageStep.ts`.
- New route `/wall` rendering `<CallCard size="wall">` **without** an `onAck` prop, forcing `data-theme="dark"`, reading `?floor=`.
- Every table (`RoomsTab`, `DevicesTab`, `StaffTab`, `BillingTab`, all of `admin/`): card wrapper deleted, toolbar moved *inside* the container, header row switched from uppercase to sentence case, zebra removed, status pills replaced by dot+word, row heights to `min-height: 44px`, IDs to `mono-sm` middle-truncated.
- All inputs: `border.field` 1.5px replaces the 1px hairline (today's outlines measure ~1.7:1 and legally do not exist under WCAG 1.4.11).
- Every page header rebuilt on the one shared pattern.

### `server/static/landing.html`
- Token block injected between `/* @tokens:start|end */`; Inter woff2 subset inlined as base64 (new — the page currently has no webfont); CSP `font-src` must include `data:`.
- Purple/cyan palette → teal; blob mesh deleted; **decorative ECG line deleted**.
- Section rhythm rebuilt on `space.112/80/64`; new hero with `landing-h1` at 22ch and one accent word; new hero figure containing a real wall-variant call card; new "Ikki rejim" section; pricing "recommended" treatment reduced to a 1.5px accent border + eyebrow label.

### `mobile-app/`
- **`src/theme.ts` is deleted and regenerated.** It stops being colours-only and stops lying: it exports `{ color, type, space, radius, control, border, rail, motion }` from the same `tokens.json` as the CSS, and `--check` proves it.
- Colours move from the old blue (`#1d5fe0` / `#5b9bff`) to the teal set + the call reds. Both themes wired through the existing `ThemeContext.tsx`.
- **`src/screens/WelcomeScreen.tsx` deleted** and removed from the navigator; unauthenticated routes straight to Login.
- `LoginScreen.tsx`: `paddingTop: 60` deleted, wrapped in `SafeAreaView` from `react-native-safe-area-context`; three gutters (20/16/16) collapse to one (16); the local brand mark and primary button replaced by the shared components.
- `CallsScreen.tsx`: the neutral grey card with an 18px bell and an 18px room number is replaced by `<CallCard>` — solid red, 64–104px room number, 3-slot rail, 64px white ack slab. Header rebuilt; pull-to-refresh removed; the offline banner added (new state, currently invisible).
- `components/BillingBanner.tsx` generalises into one `<Banner variant="attn">`; the second, divergent error banner is deleted; its 20×20 close becomes a 24px glyph in a 48px box. Billing moves *below* the call list.
- New shared components: `BrandMark`, `PrimaryButton`, `Banner`, `CallCard`, `Rail`; the five rounded icon tiles at four radii disappear by construction.
- New dependencies (dependencies, not features — constraint 11 holds): `react-native-safe-area-context`, `expo-font`, and the four Inter static faces.

### `app/` (watch)
- `MainActivity.kt`: all seven `Color(0x…)` literals deleted, replaced by a generated `NurseCallTokens.kt` + `nurseCallWearColors()`.
- Single-call view: `Chip` → full-bleed `Box`; room number to 40/44/48sp; the 3-slot vertical rail added; a centred 48dp white ack chip replaces the current tap surface.
- Multi-call list restyled to per-call step colours at 48dp rows.
- Connection states re-coloured: connected `#4CAF50` → `accent` `#35C9B6`; connecting `#FFC107` → `attn` `#E0A63A`; **disconnected `#F44336` → hollow `text-3` ring** (red stops meaning "network").
- Login chip `#1D5FE0` → `accent`; login errors `#F44336` → `attn`; billing strip `#FFB300` → `attn`.
- `android:label` "Chaqiruv monitor" → **"NurseCall"**.
- `android.R.drawable` notification icons → two shipped 24dp vectors on two channels; notification accent `#6C5CE7` → `#CB2F22` (call) / `#0C6A62` (system).

### Repo root
- New `tokens/tokens.json`, `tokens/tokens.schema.json`, `tools/generate-tokens.*` with `--check`, wired into CI.

---

## 10. Deliberately left out, and why

- **No new features, no removed features. No backend or API change.** This is why there is no "undo acknowledge" — it would need an endpoint. The accidental-ack problem is solved geometrically instead (only the 64px slab is tappable; the card body is inert), which needs no server.
- **No press-and-hold acknowledge.** Unproven, self-declared as such by its author, with no specified fallback, and worst-case for a nurse already walking.
- **No animation on any alert surface** — no entrance, no crossfade, no pulse, no white flash. It conveys nothing, it becomes furniture within an hour, it janks on cheap Android with a live socket, and a 250 ms white flash on a 55" panel in a dark corridor directly contradicts the night-shift rationale we accepted for dark mode.
- **No urgency word on the call card.** The tabular timer is the age, stated better, and it is already there.
- **No `"Xona"` label on any call card.** On a screen whose entire purpose is room calls, the label is noise; the number alone is unambiguous.
- **No red anywhere except a live patient call** — not on the nav badge (teal pill), not on delete buttons (amber), not on form errors (amber), not on a dead socket (amber or a hollow grey ring), not in the history table, not on the watch login failure. This is a real usability cost — thirty years of software has taught everyone that red means delete — and we pay it because it is the entire safety mechanism.
- **No shadow on any card, table or call card.** Depth is reserved for things genuinely floating (modals, dropdowns). At 4 m a shadow is invisible; on a table it is noise.
- **No zebra striping, no coloured status pills, no icon tiles, no gradients, no glass, no mesh blobs, no empty-state illustrations.**
- **No custom font on the watch.** At a 1–2 second glance the family matters far less than size and contrast, and a font file costs APK size and risk.
- **No charts or sparklines added.** Existing numeric summaries render as neutral stat tiles.
- **No wake-lock, no kiosk-mode logic, no sound design on `/wall`.** Those are features, and features are out of scope.
- **No `scale-wall` multiplier.** Every ageing size on every surface is a named token array. A multiplier that does not actually multiply is four magic numbers wearing an architecture.

---

## 11. The three things to test before this reaches a full ward

1. **The light-mode ramp direction** (§2.4). Three simultaneous calls at steps 1/2/3 on a light desk screen: does a nurse rank them correctly in under a second? If the brightness cue beats the page-contrast cue, invert the light ramp and let geometry carry it — a three-hex change.
2. **The wall at volume.** Eight to eleven simultaneous cards at 4 m, in motion, in a lit corridor. Does the rail slot count read? Does the size step read? If the wall becomes an undifferentiated red field, the fix is to make step 1 the lowest-area red rather than the same area.
3. **Phone at 130% OS font scale, three calls, room "1204"** (§3.5). This should be an automated regression test, not an observation.