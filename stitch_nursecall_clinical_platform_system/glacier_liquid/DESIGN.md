---
name: Glacier Liquid
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#3f4850'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#707881'
  outline-variant: '#bfc7d2'
  surface-tint: '#006398'
  primary: '#006194'
  on-primary: '#ffffff'
  primary-container: '#007bb9'
  on-primary-container: '#fdfcff'
  inverse-primary: '#93ccff'
  secondary: '#00668a'
  on-secondary: '#ffffff'
  secondary-container: '#40c2fd'
  on-secondary-container: '#004d6a'
  tertiary: '#b61722'
  on-tertiary: '#ffffff'
  tertiary-container: '#da3437'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cce5ff'
  primary-fixed-dim: '#93ccff'
  on-primary-fixed: '#001d31'
  on-primary-fixed-variant: '#004b73'
  secondary-fixed: '#c4e7ff'
  secondary-fixed-dim: '#7bd0ff'
  on-secondary-fixed: '#001e2c'
  on-secondary-fixed-variant: '#004c69'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ad'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930013'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style
This design system pairs the pristine clarity of glacial ice with the adaptive tactility of liquid glass. Engineered for acute healthcare environments, it replaces sterile, flat medical interfaces with a calming, hyper-legible, and luminous aesthetic. The emotional posture balances clinical urgency with therapeutic serenity—instilling calm in fast-paced nurse stations while ensuring zero-latency legibility under dynamic hospital lighting.

The visual direction merges **Frosted Glassmorphism** with **Fluid Skeuomorphism**. Interfaces are composed of stacked translucent panes featuring realistic refractive properties: top-edge specular highlights, interior caustic glows, soft chromatic aberration at card boundaries, and ambient icy blue luminescence. Crisp contrast sits atop frosted optical blurs, ensuring critical patient data stands out instantly against translucent layers.

## Colors
The palette evokes frozen water, glowing caustics, and crystalline air. The default state is a high-luminance light mode that uses deep optical blurs over subtle arctic gradients.

- **Primary (`#0284C7`)**: Crisp glacier azure used for primary actions, selected indicators, and essential navigational states.
- **Secondary (`#38BDF8`)**: Vibrant ice melt cyan used for ambient glows, liquid fills, active toggles, and highlights.
- **Tertiary / Alert (`#EF4444`)**: Emergency crimson glass. When triggered, it shifts translucent panels into an urgent, pulsing ice-red state with chromatic backlighting for immediate triage visibility.
- **Neutral / Text (`#0F172A` & `#0A192F`)**: Deep sub-zero navy. Replaces pure black to maintain optimal contrast ratios (WCAG AAA) across translucent glass panes without visual harshness.
- **Glass Base Layers**: Surfaces rely on dynamic alpha tokens: `rgba(255, 255, 255, 0.65)` for standard floating panes, fading to `rgba(255, 255, 255, 0.35)` for lower-tier recessed trays, reinforced by `border-color: rgba(255, 255, 255, 0.4)`.

## Typography
Typography is tuned for split-second scannability. Headings use **Plus Jakarta Sans** for its friendly yet structural clarity and rounded terminals that match fluid glass surfaces. Body text and numerical vitals leverage **Inter** for its neutral vertical metrics, robust x-height, and tabular number figures suited for patient telemetry.

When text overlays frosted glass, drop shadows must not be used on the typography itself; legibility is preserved via high neutral-navy density and background blur isolation.

## Layout & Spacing
The layout follows a fluid 12-column grid on desktop/tablets and a 4-column structure on mobile devices, with ample negative space to let the liquid-glass surfaces breathe.

- **Breakpoints**: Mobile (up to `640px`), Tablet (`641px` - `1024px`), Desktop (`1025px+`).
- **Floating Containers**: All primary functional panels (such as triage queues, telemetry streams, and floor plans) sit inside floating glass planes offset from the canvas border by `margin`.
- **Rhythm**: Gaps scale strictly using the 8pt rhythm (`space-sm` for related micro-elements, `space-md` between inputs/card contents, and `space-xl` for section detachment).

## Elevation & Depth
Elevation is achieved through light refraction, frosted blur tiers, and diffuse cyan ambient luminescence rather than dark drop shadows:

- **Level 1 (Sub-surface / Background Trays)**: `backdrop-filter: blur(12px)`, background `rgba(255, 255, 255, 0.3)`, border `1px solid rgba(255, 255, 255, 0.2)`. No shadow.
- **Level 2 (Standard Floating Cards & Panels)**: `backdrop-filter: blur(24px)`, background `rgba(255, 255, 255, 0.55)`, border `1px solid rgba(255, 255, 255, 0.5)`. Box shadow: `0 8px 32px 0 rgba(56, 189, 248, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.8)`.
- **Level 3 (Modals, Overlays, Active HUDs)**: `backdrop-filter: blur(40px)`, background `rgba(255, 255, 255, 0.75)`, border `1px solid rgba(255, 255, 255, 0.8)`. Box shadow: `0 20px 48px 0 rgba(2, 132, 199, 0.2), inset 0 1.5px 0 0 #ffffff`.
- **Emergency Elevation State**: For code-blue or critical alerts, standard cyan luminescence transitions to crimson glass: `backdrop-filter: blur(28px)`, background `rgba(254, 242, 242, 0.7)`, border `1px solid rgba(239, 68, 68, 0.4)`, shadow: `0 12px 36px 0 rgba(239, 68, 68, 0.25), inset 0 1px 0 0 rgba(255, 255, 255, 0.9)`.

## Shapes
Shapes mimic sculpted ice blocks with fluid, melted corners. A level 3 roundedness (`rounded-2xl` to `rounded-3xl` equivalents) guarantees an organic liquid hand-feel. Full pill contours are reserved for interactive touch targets (action buttons, triage filter chips, floating tab bars), preventing sharp visual friction in intense clinical workflows.

## Components

- **Buttons**:
  - *Primary*: Liquid glacier gradient (`linear-gradient(135deg, #38BDF8 0%, #0284C7 100%)`), text white, pill-shaped (`border-radius: 9999px`). Features a top-edge inner highlight (`inset 0 1px 1px rgba(255, 255, 255, 0.6)`) and a soft cyan outer glow.
  - *Secondary / Glass*: Translucent fill `rgba(255, 255, 255, 0.5)` with `1px solid rgba(255, 255, 255, 0.6)` and `backdrop-filter: blur(16px)`. Text `#0F172A`.
  - *Emergency Action*: Radiant crimson gradient (`linear-gradient(135deg, #F87171 0%, #EF4444 100%)`) with animated ripple glow on active alert.

- **Cards & Patient Tiles**:
  - Encased in Level 2 glass. Features a double edge: `border: 1px solid rgba(255, 255, 255, 0.6)` plus an inner border shadow (`inset 0 0 0 1px rgba(224, 242, 254, 0.3)`).
  - Triage indicators render as liquid orbs that pulse with specular reflections.

- **Floating Tab Bar & Navigation HUD**:
  - Detached, floating 16px above screen bottom. Pill-shaped outer chassis with heavy frosted blur (`backdrop-filter: blur(32px)`), filled with `rgba(255, 255, 255, 0.6)`. Active items glide via a smooth liquid-pill indicator with cyan back-glow.

- **Input Fields & Frosted Search**:
  - Recessed glass appearance: `background: rgba(224, 242, 254, 0.3)`, `border: 1px solid rgba(255, 255, 255, 0.5)`. Text `#0F172A`.
  - Focus state triggers an expanding ring of `0 0 0 3px rgba(56, 189, 248, 0.35)` with an elevated blur level.

- **Chips & Triage Badges**:
  - Compact pill components with `background: rgba(255, 255, 255, 0.5)` and vibrant tinted text (`#0284C7` for standard care, `#D97706` for observation, `#EF4444` for emergency). Includes a micro-specular rim highlight on top.

- **Checkboxes & Radios**:
  - Custom liquid toggles. Unchecked: frosted inset circle/square with a crisp white border. Checked: filled with primary glacier blue, displaying an embossed white glyph and inner liquid highlight.