---
version: beta
name: CREEP LAB warm editorial
description: "A warm, paper-like technical workbench modelled on the Claude web interface: an off-white canvas, a beige navigation rail, soft cards with 12px corners and hairline rules, terracotta as the single accent, serif display type for section titles and a monospace face for every number and identifier. The chrome is quiet; the data is the loudest thing on the page."
colors:
  accent: "#b5542f"
  on-accent: "#ffffff"
  canvas: "#faf9f5"
  sidebar: "#f0eee6"
  surface: "#ffffff"
  surface-muted: "#f1efe7"
  ink: "#1f1e1c"
  ink-muted: "#5c5952"
  ink-faint: "#6d6961"
  hairline: "#e6e1d5"
  hairline-strong: "#cfc8ba"
  success: "#3f6b4f"
  warning: "#7a5a12"
  error: "#a3352c"
  dark-canvas: "#262624"
  dark-sidebar: "#1f1e1c"
  dark-surface: "#30302e"
  dark-ink: "#f5f4ef"
  dark-accent: "#e08b6e"
typography:
  display-lg: { fontFamily: "Iowan Old Style / Songti SC / Georgia", fontSize: 34px, fontWeight: 500 }
  display-sm: { fontFamily: "Iowan Old Style / Songti SC / Georgia", fontSize: 28px, fontWeight: 500 }
  heading: { fontFamily: "Iowan Old Style / Songti SC / Georgia", fontSize: 22px, fontWeight: 600 }
  body: { fontFamily: "system sans", fontSize: 16px, lineHeight: 1.6 }
  body-sm: { fontFamily: "system sans", fontSize: 14px, lineHeight: 1.6 }
  label: { fontFamily: "system sans", fontSize: 11px, fontWeight: 600, letterSpacing: 0.09em, textTransform: uppercase }
  data: { fontFamily: "SF Mono / Menlo / Consolas", fontVariantNumeric: tabular-nums }
rounded:
  card: 12px
  panel-lg: 16px
  input: 9px
  button: 9px
  chip: 9999px
spacing: [4, 8, 12, 16, 20, 24, 32, 40, 56]
---

# CREEP LAB design system

This document is the contract for the interface. Tokens live in `src/index.css`
(custom properties) and `tailwind.config.js` (semantic utilities); components
consume the utilities, never raw hex values. If a value here and a value in code
disagree, the code is wrong and this document is the reference.

The visual direction is the Claude web interface: warm paper instead of clinical
white, a persistent navigation rail instead of a top tab bar, serif display type
against a neutral sans body, and terracotta as the only chromatic accent. The
workbench content — parameters, results, matrices, equations — keeps its
professional density; only the chrome and the surfaces change.

## Overview

- **Canvas.** `--bg` `#faf9f5` in light mode, `#262624` in dark mode. Never pure
  white behind the page; white is reserved for raised cards (`--surface`).
- **Rail.** The sidebar uses `--sidebar-bg` (`#f0eee6` light, `#1f1e1c` dark) and
  its own hairline. It is the only large tinted area in the product.
- **Accent.** `--action` `#b5542f` light / `#e08b6e` dark. It marks the selected
  workspace, the primary button, the active chart series and nothing else. Every
  accent pairing clears WCAG AA (4.5:1), asserted by `src/paletteContrast.test.js`.
- **Ink.** `--text` `#1f1e1c`; secondary copy `--text-muted` `#5c5952`; labels
  `--text-faint` `#6d6961`. All three clear 4.5:1 on canvas, card and muted
  surfaces.
- **Depth.** One hairline plus a 1px ambient shadow on cards. Popovers get
  `--shadow-popover`. No layered elevation ramps.

## Colors

### Semantic tokens

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--bg` | `#faf9f5` | `#262624` | page canvas |
| `--surface` | `#ffffff` | `#30302e` | cards, inputs, popovers |
| `--surface-2` | `#f1efe7` | `#3a3936` | inset rows, table heads, segmented tracks |
| `--surface-3` | `#e5e1d6` | `#474640` | pressed / deepest inset |
| `--line` | `#e6e1d5` | `#3f3e3a` | hairline rules and card borders |
| `--line-strong` | `#cfc8ba` | `#5c5a54` | input borders, dashed drop zones |
| `--text` | `#1f1e1c` | `#f5f4ef` | primary copy |
| `--text-muted` | `#5c5952` | `#c2bfb6` | body copy on cards, secondary labels |
| `--text-faint` | `#6d6961` | `#b5b2a8` | eyebrows, captions, metadata |
| `--action` | `#b5542f` | `#e08b6e` | primary actions, selection, series 1 |
| `--action-soft` | `#f6e9e1` | `#4a3229` | selected rows, accent-tinted panels |
| `--sidebar-bg` | `#f0eee6` | `#1f1e1c` | navigation rail |
| `--sidebar-active` | `#ffffff` | `#3a3936` | current destination |
| `--success` | `#3f6b4f` | `#96c9a3` | computed / valid |
| `--warning` | `#7a5a12` | `#e3c07d` | out-of-date inputs, notices |
| `--error` | `#a3352c` | `#f0938a` | invalid rows and failures |
| `--chart-grid` | `#e6e1d5` | `#3f3e3a` | chart grid lines |

### Chart series

`--series-1` terracotta, `--series-2` deep green (`#3f6b5f` / `#8fb5a5`),
`--series-3` ochre (`#8a6a3f` / `#d0b36a`). Reference lines use `--reference`
with labels in `--reference-text`. Series colours are chosen to stay
distinguishable in both themes and in greyscale, not to match the accent.

## Typography

### Families

- **Display** — `--font-display`: Iowan Old Style → Palatino → Songti SC →
  Source Han Serif SC → Georgia. Used for `h1`, `h2`, the brand wordmark and the
  workspace name in the topbar. It is the editorial voice of the interface.
- **Body** — `--font-sans`: the system UI stack with PingFang SC / Hiragino Sans
  GB / Microsoft YaHei behind it. Used for everything readable: prose, labels,
  buttons, navigation.
- **Data** — `--font-mono`: SF Mono → Menlo → Consolas. Used for every number,
  unit, parameter symbol, identifier and table cell that must align. Tabular
  figures are on by default for `font-mono`.

No web font is downloaded. The previous IBM Plex dependency was removed; the
stack is deliberately local so the first paint has no font swap.

### Scale

| Token | Size | Role |
| --- | --- | --- |
| `text-display-lg` | 34px | workspace hero title on wide screens |
| `text-display-sm` | 34px | section title |
| `text-2xl` | 24px | model title inside the calculator |
| `text-body` | 16px | prose |
| `text-body-sm` | 14px | dense prose, navigation |
| `text-1xs` | 13px | helper copy, small buttons |
| `text-2xs` | 12px | compact labels |
| `text-3xs` | 11px | floor: units, chips, table headers |

`.eyebrow` is the one label style: 11px, weight 600, uppercase, `0.09em`
tracking, `--text-faint`. Use it for section kickers, never for sentences.

## Layout

### Shell

```
┌──────────────┬─────────────────────────────────────────┐
│ sidebar      │ topbar (sticky, 56px)                   │
│ 264 / 76 px  ├─────────────────────────────────────────┤
│              │ main (shell-gutter, py-7 / lg:py-10)     │
│              │                                         │
│              ├─────────────────────────────────────────┤
│              │ footer note (low contrast)              │
└──────────────┴─────────────────────────────────────────┘
```

- **Desktop (≥1024px).** The sidebar is a sticky 264px column; collapsing it
  yields a 76px icon rail. The choice is stored in
  `localStorage['creep-lab:sidebar']` (`expanded` / `collapsed`). The rail's
  current destination uses `--sidebar-active`, a 9px radius and a 1px shadow.
- **Below 1024px.** The same sidebar becomes a drawer over a 35% ink scrim. It is
  closed by default, opens from the topbar menu button, closes on the scrim,
  Escape or a destination, traps Tab, locks body scroll, and returns focus to the
  menu button.
- **Gutter.** `.shell-gutter` is the single horizontal rhythm: 16px below 640px,
  24px to 1280px, 40px above. Header, main and footer all use it. Never add
  `px-*` beside it.
- **Content width.** `--content-width` 1560px; reading columns cap at `74ch`.
- **Sticky offsets.** `--sticky-offset: calc(var(--header-h) + 24px)`, used by
  `[id]` scroll margins and every sticky panel. Never hard-code a pixel top.

### Spacing

4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 56. Cards use 16–24px internal padding;
page sections are separated by 20–24px. Tables and matrices use 8–12px cell
padding to stay dense.

### Workspace layouts

- **Calculate.** A hero header, then a horizontal model strip (186px minimum per
  model, snap-scrolled) with the kernel segmented control at its trailing edge.
  Below it: a two-column workbench on ≥1024px — a 320–380px parameter column that
  sticks under the topbar, and the results column. Narrow screens stack them.
- **Batch.** Upload/validate/results step strip, then the model + drop-zone card,
  then mapping, diagnostics and the result matrix with a frozen first column and
  the chart panel.
- **Reference.** Model rail (200px) + article; the section index joins as a third
  column at ≥1536px and otherwise sits above the article.

## Elevation & depth

- Cards: `1px solid var(--line)` + `0 1px 2px rgba(31,30,28,.04)`.
- Popovers (command palette, chart tooltip): `--shadow-popover`.
- The drawer adds `--shadow-popover` only while it overlays content below 1024px.
- Nothing uses a coloured shadow or a blur-based glow.

## Shapes

| Token | Radius | Used for |
| --- | --- | --- |
| `rounded-card` | 12px | `workbench-panel`, result cards, notices |
| `rounded-lg` | 10px | chart tooltip, command rows, model tiles |
| `rounded-input` | 9px | inputs, select wrappers, segmented tracks |
| `rounded-sm` | 6px | keyboard hints, inline code |
| `rounded-chip` | 9999px | status badges, metric badges |
| `rounded-mark` | 10px | the CL brand mark |

Interactive elements are never square. Decorative rules and table cells may be
rectangular; containers may not.

## Components

### Buttons

- **Primary** — accent fill, `--on-action` text, 9px radius, 40px minimum height
  (48px on coarse pointers), weight 600. One per view region.
- **Secondary** — surface fill, `--line-strong` border, ink text; hover raises the
  border to the accent and the fill to `--secondary-hover`. This is the default
  for toolbars and export actions.
- **Icon** — 36px square, 9px radius, transparent until hover (`--sidebar-hover`).
- **Segmented** — `--surface-2` track, the selected segment lifts to `--surface`
  with the card shadow.

### Cards

`workbench-panel` / `card`: surface fill, hairline border, 12px radius, ambient
shadow. Cards never nest more than one level; a card inside a card uses
`--surface-2` with no shadow.

### Inputs

`.field-control` wraps the control: 1px `--line-strong`, 9px radius, surface
fill. Focus raises the border to `--action` and adds a 3px `--focus-ring` halo.
Unit suffixes sit in a `--surface-2` segment separated by the hairline. Invalid
fields switch the border to `--error`; the message below the field names the
range in 11px mono.

### Tables and matrices

Header rows use `--surface-2`, 11px uppercase-friendly mono labels in
`--text-faint`, sticky within their scroll container. A frozen first column uses
`--surface` and a right hairline. Result columns are tinted with `--action-soft`
and their text is `--action`. Cells never use borders on every side — only
horizontal hairlines.

### Navigation

The sidebar carries the only navigation:

1. brand mark + wordmark + tagline
2. search button (opens the command palette; shows `⌘K`)
3. three destinations with 18px line icons
4. language switch, theme switch, collapse toggle

Collapsed mode keeps icons and accessible names, hides text with `lg:hidden`
(never `hidden`, so the drawer stays readable), and exposes the destination name
through `aria-label` + `title`.

### Footer

A single low-contrast line under the content (`--text-faint`, 12px). No dark bar.

## Motion

- 140ms `ease` for colour and background transitions.
- 200ms for the sidebar width and drawer transform.
- One 180ms fade-in when a workspace mounts.
- `prefers-reduced-motion: reduce` collapses every animation and transition to
  0.01ms; the drawer still opens, it just does not slide.

## Accessibility

- Focus is always visible: 2px accent outline, 2px offset. `forced-colors` mode
  keeps an outline on the command search.
- Contrast is tested, not eyeballed: every text/background pair the interface
  renders is asserted at ≥4.5:1 in both themes (`src/paletteContrast.test.js`).
- Touch targets are 48px on coarse pointers (`touch-target`, `touch-hit`); dense
  desktop controls keep their visual size and expand their hit area instead.
- The drawer is modal and traps focus; the command palette does the same. Escape
  closes both and focus returns to the control that opened them.
- Workspace switches are announced by `aria-current="page"` on the sidebar item;
  the topbar title is a visual anchor, not the only source.

## Responsive behaviour

| Width | Shell | Workspaces |
| --- | --- | --- |
| 320–639 | drawer closed, topbar 56px, 16px gutter | single column, horizontally scrolling model strip |
| 640–1023 | drawer closed, 24px gutter | parameter/result stack; batch drop zone two-up |
| 1024–1279 | sidebar 264/76px, 24px gutter | calculator two columns; docs two columns |
| ≥1280 | sidebar 264/76px, 40px gutter | full matrix; docs gains the section index column |

Nothing may overflow the page horizontally. Wide tables scroll inside their own
container, and long identifiers wrap or truncate with a `title`.

## Iteration guide

1. Change a token in `src/index.css` (both themes) and mirror it in
   `tailwind.config.js` only if a new utility is needed.
2. Update this table if the role of a token changes.
3. Run `npm test` — the contrast pairs and the shell contract will fail loudly if
   a token pairing or a layout landmark moved.
4. Regenerate `docs/images/` with `npm run screenshots` after a visible change.
