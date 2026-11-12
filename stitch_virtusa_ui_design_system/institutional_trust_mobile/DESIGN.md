---
name: Institutional Trust Mobile
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#434655'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#747686'
  outline-variant: '#c4c5d7'
  surface-tint: '#2151da'
  primary: '#0037b0'
  on-primary: '#ffffff'
  primary-container: '#1d4ed8'
  on-primary-container: '#cad3ff'
  inverse-primary: '#b7c4ff'
  secondary: '#565d79'
  on-secondary: '#ffffff'
  secondary-container: '#d8deff'
  on-secondary-container: '#5a627e'
  tertiary: '#004f35'
  on-tertiary: '#ffffff'
  tertiary-container: '#006a48'
  on-tertiary-container: '#60eeb1'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b7c4ff'
  on-primary-fixed: '#001551'
  on-primary-fixed-variant: '#0039b5'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#bec5e5'
  on-secondary-fixed: '#131a33'
  on-secondary-fixed-variant: '#3e4660'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  title-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.01em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1rem
  margin-tablet: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system delivers an executive, institutional mobile banking experience tailored for private wealth directors and corporate relationship managers operating in field environments. It rejects frivolous micro-trends in favor of precision, high legibility, and quiet authority.

The aesthetic fuses **Corporate / Modern** rigor with tactile clarity:
- **Atmosphere:** Deep sovereign navy framing crisp, glare-resistant surfaces suited for dynamic outdoor or boardroom lighting.
- **Form Follows Function:** Dense financial telemetry is prioritized through strict hierarchical data grouping, uncompromising legibility, and high-visibility status indicators.
- **Touch-First Precision:** Mobile interactions utilize a minimum 44×44px hit-target baseline, ensuring error-free execution during time-sensitive credit decisions, transaction approvals, and client portfolio reviews.

## Colors

The palette balances authoritative institutional darks with functional alert states engineered strictly against WCAG 2.1 AA contrast requirements.

- **Primary Canvas & Surfaces:** Background canvas uses crisp slate `#F8FAFC`, paired with pure `#FFFFFF` elevated container cards. Structural headers and institutional accents utilize Deep Midnight `#0B132B` and Corporate Navy `#1C2541`.
- **Primary Actions:** Interactive controls, active states, and bottom navigation accents utilize Cobalt `#1D4ED8`.
- **Status Accents:**
  - *On Track / Settled / Approved:* Emerald `#10B981` (paired with `#ECFDF5` container fills and `#047857` text).
  - *Due Today / Pending Review:* Amber `#D97706` (paired with `#FFFBEB` container fills and `#B45309` text).
  - *Overdue / High Risk:* Rose `#E11D48` (paired with `#FFF1F2` container fills and `#BE123C` text).
- **Borders & Dividers:** Subtle, calibrated neutral slate `#E2E8F0` defines cards and inputs, preventing edge bleed while maintaining a light, surgical interface.

## Typography

The type hierarchy relies on `Inter` across all structural UI roles to ensure maximum legibility under rapid glance conditions, supplemented with `JetBrains Mono` for account numbers, routing codes, SWIFT IDs, and financial delta balances.

- **Numerical Figures:** All quantitative metrics must enable tabular figures (`font-feature-settings: "tnum" 1`) to ensure financial statements and column totals align vertically.
- **Micro-Labels & Status:** All uppercase metadata labels (`label-sm`) utilize slight letter spacing (+0.04em) and semi-bold weights for immediate recognition on mobile screens without eye strain.

## Layout & Spacing

The layout is built for single-hand mobile ergonomics and tablet split-screen responsiveness.

- **Mobile Grid & Margins:** Screen edge margins are fixed at `1rem` (16px) on mobile viewports (<600px) and expand to `1.5rem` (24px) on tablet breakpoints. Gutters maintain a consistent `1rem`.
- **Rhythm:** Form controls, interactive rows, and list cards observe an 8px vertical grid. Compact metadata within cards adheres to a 4px sub-grid (`space-xs`).
- **Safe Area Insets:** All top-level views reserve programmatic space for native status bars (top) and home indicators (bottom). Sticky action sheets and bottom navigation sit flush above the native gesture indicator with dedicated padding.

## Elevation & Depth

Visual hierarchy avoids excessive blur effects, relying instead on structural containment and crisp hairline borders:

- **Base Cards & Modules (Level 0):** Pure `#FFFFFF` resting on the `#F8FAFC` slate canvas, outlined by a 1px solid border in `#E2E8F0`. No drop shadow.
- **Interactive Sticky Bars / Headers (Level 1):** Subtle drop shadow (`0 2px 4px -1px rgba(11, 19, 43, 0.04), 0 4px 6px -1px rgba(11, 19, 43, 0.06)`) bounded by a 1px divider in `#E2E8F0`.
- **Floating Modals & Action Sheets (Level 2):** Layered above a darkened scrim (`#0B132B` at 40% opacity). Elevation is supported by a diffused perimeter shadow (`0 10px 25px -5px rgba(11, 19, 43, 0.12), 0 8px 10px -6px rgba(11, 19, 43, 0.08)`) with a top border highlight.

## Shapes

The interface implements a restrained `Soft` corner profile (`roundedness: 1`). 

- **Inputs, Buttons, and Cards:** Default to `0.25rem` (4px) to `0.375rem` (6px) corner radiuses. Larger card surfaces and bottom modal sheets scale to `0.5rem` (8px) at `rounded-lg`.
- **Pills / Status Chips:** Restricted exclusively to micro status tags and counters to create distinct geometric contrast against rectangular data cards.

## Components

### Buttons
- **Primary Action:** Solid cobalt (`#1D4ED8`) background, white text (`#FFFFFF`), 48px height, 16px horizontal padding. Focus state ring: 2px `#1D4ED8` offset by 2px.
- **Secondary Action:** Ghost white fill with a 1px solid `#CBD5E1` border, `#0B132B` text. Active touch down shifts fill to `#F1F5F9`.
- **Destructive Action:** `#E11D48` text on light `#FFF1F2` surface, scaling to solid `#E11D48` with `#FFFFFF` text on critical confirmation prompts.

### Cards & Telemetry Blocks
- Enclosed white tiles (`#FFFFFF`) with 1px `#E2E8F0` borders.
- Client account summary cards feature a left 3px accent stroke matching account status (emerald for healthy, rose for overdue covenant, amber for maturing facility).

### Form Fields & Inputs
- Height minimum 44px (recommended 48px). Background `#FFFFFF`, 1px border in `#CBD5E1`, inset horizontal padding 12px.
- Floating or persistent top micro-labels in `label-sm` (`#64748B`). Active field shows a 1.5px border in `#1D4ED8`.

### Status Badges & Chips
- Compact pills (24px height), 8px horizontal padding, `label-sm` font.
- Color pairs:
  - *Active / Received:* `#ECFDF5` background, `#047857` foreground.
  - *Due Today:* `#FFFBEB` background, `#B45309` foreground.
  - *Critical / Overdue:* `#FFF1F2` background, `#BE123C` foreground.

### Bottom Navigation & Action Sheets
- **Bottom Navigation:** Fixed 64px height bar above device safe-area. Pure `#FFFFFF` background with top 1px border `#E2E8F0`. Four to five target destinations with 24px icons and `label-sm` text. Active tab: `#1D4ED8`; inactive tab: `#64748B`.
- **Modal Action Sheets:** Slide up from bottom with top-rounded corners (`0.75rem`), dark scrim behind. Contains high-velocity transaction triggers (e.g., "Approve Wire", "Extend Facility", "Place Call") with primary actions anchored within immediate thumb reach.