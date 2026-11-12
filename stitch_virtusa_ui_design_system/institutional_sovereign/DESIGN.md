---
name: Institutional Sovereign
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
  on-surface-variant: '#45464d'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#76767e'
  outline-variant: '#c6c6ce'
  surface-tint: '#545d7c'
  primary: '#06102b'
  on-primary: '#ffffff'
  primary-container: '#1c2541'
  on-primary-container: '#838cae'
  inverse-primary: '#bdc5e9'
  secondary: '#0051d5'
  on-secondary: '#ffffff'
  secondary-container: '#316bf3'
  on-secondary-container: '#fefcff'
  tertiary: '#00160c'
  on-tertiary: '#ffffff'
  tertiary-container: '#002d1d'
  on-tertiary-container: '#1fa072'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#bdc5e9'
  on-primary-fixed: '#111a36'
  on-primary-fixed-variant: '#3d4664'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#003ea8'
  tertiary-fixed: '#85f8c4'
  tertiary-fixed-dim: '#68dba9'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005137'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 2rem
    fontWeight: '600'
    lineHeight: 2.5rem
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 1.375rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: -0.01em
  title-md:
    fontFamily: Inter
    fontSize: 0.9375rem
    fontWeight: '600'
    lineHeight: 1.375rem
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 0.9375rem
    fontWeight: '400'
    lineHeight: 1.5rem
  body-md:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.25rem
  body-sm:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1.125rem
  label-md:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '600'
    lineHeight: 1rem
    letterSpacing: 0.03em
  label-sm:
    fontFamily: Inter
    fontSize: 0.6875rem
    fontWeight: '600'
    lineHeight: 0.875rem
    letterSpacing: 0.04em
  tabular-numeric:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: '500'
    lineHeight: 1.25rem
    letterSpacing: 0.01em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system establishes an institutional, regulatory-grade environment engineered specifically for enterprise onboarding, continuous risk assessment, and case-tracking workflows. The tone is authoritative, composed, and unyielding in operational clarity. It avoids consumer fintech flashiness and decorative trends in favor of disciplined ergonomics, predictability, and immediate situational awareness.

Key tenets:
- **Architectural Calm:** Dark institutional infrastructure frames light, pristine analytical surfaces. Visual weight is concentrated in data cells and decision triggers, not ornamental chrome.
- **Cognitive Hygiene:** High-density layouts rely on rigorous alignment, disciplined micro-typography, and consistent status encoding rather than visual volume.
- **Audit-Ready Precision:** Every layout, state change, and metric must read as immutable, definitive, and accessible under WCAG 2.1 AA benchmarks.

## Colors

The palette divides sharply between institutional containment and high-fidelity operational canvas:

- **Institutional Structure:** The global frame and persistent shell employ deep navy `#0B132B` (primary frame) and `#1C2541` (secondary frame/sidebar navigation), creating an anchor of trust and authority.
- **Analytical Canvas:** The operational core relies on ultra-clean neutral slate surfaces. Background canvas sits at `#F8FAFC`, raised operational cards and tables at `#FFFFFF`, subtle structural dividers at `#E2E8F0`, and primary data copy at `#0F172A` with secondary metadata at `#475569`.
- **System Actions:** Primary focus states, interactive rows, and core action triggers utilize Cobalt `#2563EB`, depressing into Deep Navy `#1E40AF` on interaction.
- **Triage & Status Signals:** Strict pairings ensure unambiguous readability without ambient tint contamination:
  - *Due Soon / Pending Attention:* Amber text `#D97706` over soft tint `#FEF3C7`.
  - *Overdue / Escalated Risk:* Crimson text `#DC2626` over soft tint `#FEE2E2`.
  - *Received / Compliant / On Track:* Emerald text `#059669` over soft tint `#D1FAE5`.
  - *Under Review / Processing:* Slate text `#334155` over neutral tint `#F1F5F9`.

## Typography

Typography prioritizes rapid horizontal scanning, tabular stability, and zero ambiguity between numerals and alphabetic characters. The type system relies on `Inter`, leveraging its OpenType feature set:
- Enable `tnum` (tabular numbers) globally on all data tables, timestamps, balances, and entity IDs to guarantee vertical digit alignment across nested rows.
- Use `cv05` (lower-case l with tail) and `cv08` (upper-case I with serifs) in high-risk operational inputs to prevent transcript errors in regulatory identifiers (LEI, SWIFT, CIK).
- Headers prioritize negative tracking (`-0.01em` to `-0.02em`) to maintain tightness in dense multi-column viewports, while data badges and meta-labels utilize uppercase micro-tracking (`+0.03em` to `+0.04em`) to remain sharp at small sizes.

## Layout & Spacing

The workspace uses a dense, hybrid fixed-fluid layout tailored to wide-aspect analytical monitors:

- **Shell Architecture:** A fixed 240px navy master navigation rail on desktop expands/collapses down to an icon-only 64px rail. The operational workspace fluidly expands across a 12-column grid with a minimum viewport constraint of 1280px for standard dual-pane triage.
- **Triage Split:** A standard 60/40 or 70/30 split view partitions case rosters from the active KYC verification dossier. Gutters sit at a disciplined `1.5rem` on desktop displays, dropping to `1rem` on compact tablet breakpoints.
- **Rhythm & Density:** Vertical data density is controlled strictly by `0.75rem` (`space-md`) block padding on table rows and form fields to maximize above-the-fold case exposure without truncating audit logs.
- **Breakpoints:**
  - `Desktop Wide (>= 1440px)`: Full-width ledger + docked persistent right drawer.
  - `Desktop (1024px - 1439px)`: Overlay right drawer; condensed table metadata.
  - `Mobile / Compact (< 1024px)`: Single-column stacked mode with sticky top sub-navigation for approval actions.

## Elevation & Depth

This system avoids floating drop shadows, diffuse glows, and pseudo-3D skeuomorphism. Hierarchical layering is rendered primarily through low-contrast border boundaries, background luminance shifts, and hard-edged technical containment:

- **Layer 0 (Canvas Base):** Ground level sits at `#F8FAFC`.
- **Layer 1 (Data Surfaces & Tables):** Elevated slightly through pure flat `#FFFFFF` containers bounded by 1px solid `#E2E8F0` outlines.
- **Layer 2 (Contextual Menus & Flyouts):** Used for filter menus and quick-action popovers. Rendered with `#FFFFFF`, a 1px border of `#CBD5E1`, and a clinical, ultra-subtle shadow: `0 4px 6px -1px rgba(15, 23, 42, 0.06), 0 2px 4px -2px rgba(15, 23, 42, 0.04)`.
- **Layer 3 (Modals & Escalation Overlays):** Centered `#FFFFFF` dialogs anchored over a `#0B132B` backdrop overlay at `65%` opacity, bounded by `#CBD5E1`.
- **Active Row Elevation:** Selected cases or audit trails switch their background to `#F1F5F9` accompanied by a 2px left border accent in Cobalt `#2563EB`, avoiding vertical jump or elevation shifts.

## Shapes

The interface expresses institutional rigor through compact, understated geometry. Corner radii are kept tight:
- **Base Components (Input fields, buttons, table cell containers):** Default to `rounded` (`0.25rem` / 4px). This retains sharp grid cohesion and matches the dense structure of multi-column data views.
- **Contextual Containers (Modals, cards, audit side-panels):** Use `rounded-lg` (`0.5rem` / 8px) with 1px `#E2E8F0` framing.
- **Status Badges & Chips:** The single exception to the sharp geometry is the status badge, which utilizes a fully rounded pill format (`9999px`) to create an immediate shape-level contrast against rectangular data cells.

## Components

### Buttons
- **Primary Action:** Solid Cobalt background (`#2563EB`), text `#FFFFFF`, 4px radius, font weight 600, height 36px. Hover state shifts to `#1E40AF`. Focus visible uses a 2px offset ring in `#2563EB`.
- **Secondary / Operational:** White background (`#FFFFFF`), 1px border `#CBD5E1`, text `#0F172A`. Hover shifts background to `#F8FAFC` and border to `#94A3B8`.
- **Destructive / Reject Case:** Borderless or faint red surface (`#FEE2E2`), text `#DC2626`. Hover solidifies to red `#DC2626` with text `#FFFFFF`.
- **Icon Utility Actions:** 32x32px square buttons, borderless, `#475569` icon color, hover background `#F1F5F9`.

### Status Badges & Chips
- Crisp, condensed pill tags with horizontal padding of `8px` and height of `22px`. Text is uppercase `label-sm` with letter spacing `0.04em`.
- **Due Soon:** `#FEF3C7` background, `#D97706` text, subtle 1px border in `#FDE68A`.
- **Overdue / Blocked:** `#FEE2E2` background, `#DC2626` text, subtle 1px border in `#FECACA`.
- **Received / Cleared:** `#D1FAE5` background, `#059669` text, subtle 1px border in `#A7F3D0`.
- **In Review:** `#F1F5F9` background, `#475569` text, subtle 1px border in `#E2E8F0`.

### Data Tables & Roster Lists
- **Header:** Sticky table header with `#F8FAFC` background, 32px height, uppercase `label-sm` text in `#64748B`, 1px bottom border in `#E2E8F0`.
- **Rows:** Alternating rows avoid heavy zebra striping; instead, use pure `#FFFFFF` with a 1px border-bottom in `#F1F5F9`. Hover activates `#F8FAFC`. Selected state activates `#F1F5F9` and adds a left inset indicator (`2px solid #2563EB`). Row height is fixed at 44px for compact throughput.
- **Data Rendering:** Monospace/tabular numerical figures right-aligned; legal entity names left-aligned in bold weight (`title-md`); status pills center- or right-aligned.

### Input Fields & Controls
- **Inputs:** 36px total height, `#FFFFFF` fill, 1px border `#CBD5E1`, text `body-md` in `#0F172A`. Inner horizontal padding `10px`. Focus shifts border to `#2563EB` with an instant, non-animated box shadow ring of `0 0 0 1px #2563EB`.
- **Checkboxes & Radios:** 16x16px footprint, 3px corner radius for checkboxes, circle for radios. Border 1.5px `#94A3B8`. Checked fill `#2563EB` with pure white check/bullet.

### Dossier Cards & Panels
- **Structure:** Bounded `#FFFFFF` surface with 1px border `#E2E8F0`, padding `1rem`. Header sections feature a crisp sub-divider separating metadata summaries from the document viewer or checklist items.
- **Checklist Item Row:** Indented document status checklist: document name, validation timestamp in tabular numerals, and status pill right-docked.