# Performance benchmark, optimisation and release audit

One phase, five parts: a repeatable benchmark, the optimisations it justified, a
release-quality audit, a security re-check with a measured XLSX decompression
cost, and the verification log. Every number below was produced by the harness in
this commit, on one machine, twice — before and after — with the same instrument.

- Baseline: git `5d0c2fb` in a separate worktree (`git worktree add`), plus the
  five `data-*` measurement hooks listed in §1.3. Nothing else was changed on the
  baseline side.
- After: this commit.
- Raw generator output (every metric, min/median/max, before-vs-after deltas):
  `docs/benchmark-report.md`.

## 1. Method

### 1.1 Environment

| | |
|---|---|
| machine | Apple M4, 10 cores, 16 GB, macOS 26 (Darwin 25.x) |
| browser | headless Chrome, `--disable-gpu`, cache disabled per CDP |
| server | `vite preview` over `dist/` on 127.0.0.1 (no compression, no network latency) |
| node | v22.22.3 |
| repeats | 3 runs per scenario (2 for the two largest batch sizes and the chart toggle) |

### 1.2 The harness — `scripts/benchmark.mjs`

```
npm run build
node scripts/benchmark.mjs --runs=3 --label=after \
  --json=/tmp/bench.json --out=docs/benchmark-report.md --compare=/tmp/bench-before.json
```

Two independent halves:

- **Bundle analysis (Node).** Reads `dist/index.html` and classifies every emitted
  asset as *initial* (referenced by a module script, `modulepreload` or stylesheet
  — what a first visit fetches before React renders) or *lazy*. Raw/gzip/brotli
  from the files on disk, so the numbers are what a compressed host would send.
- **Browser measurements (CDP).** A small instrumentation snippet is installed
  before any page script runs: it records `performance.now()` for the first
  `header`, `main[data-workspace]`, the calculate button, `[data-run-status="computed"]`,
  `[data-result-matrix]`, `.recharts-surface`, `[data-doc-heading]` and
  `[data-kernel-comparison][data-ready="true"]`, and it observes `longtask` and
  `largest-contentful-paint`. Scenario timing is done with in-page promises
  installed *before* the trigger, so an interval starts with the interaction, not
  with the next CDP round trip.

Every scenario waits on a `data-` hook or an id the app sets for the purpose —
never on display copy — so translating the interface cannot break it. Scenarios:
`first-load-single`, `batch-load`, `docs-load`, `wasm-init-cold`,
`single-calculate`, `single-model-switch`, `dual-kernel-compare`,
`batch-compute-{100,1000,10000,20000}`, `batch-chart-toggle`, `docs-locale-switch`,
`palette-open`.

### 1.3 Measurement hooks added for the harness

Five attributes, none of which change behaviour or rendering:

| hook | why |
|---|---|
| `data-action="calculate"` | the params button, so the harness never matches the word "Calculate" |
| `data-model="{id}"` | the model buttons, so a switch does not depend on button order |
| `data-compute-ms` | the kernel's own measured runtime, so it can be read without parsing "1.30 ms" |
| `data-action="export-csv"` | the export button, so the CSV scenario can start the click itself |

`data-compute-ms` is volatile by design, and it made four DOM-snapshot scenes hash
differently on every run; `scripts/dom-snapshot.mjs`'s normaliser now blanks it
(§5.4).

## 2. Baseline

### 2.1 Bundle before

Initial payload **180.4 KiB gzip** in 6 files, of which the chart chunk was
**98.6 KiB gzip** — i.e. 55% of everything a first visit downloaded was recharts,
on every route including the reference library, which never draws a chart.

| file | initial | gzip |
|---|---|---:|
| `charts-*.js` | yes | 98.6 KiB |
| `react-*.js` | yes | 52.7 KiB |
| `index-*.js` | yes | 18.4 KiB |
| `index-*.css` | yes | 8.5 KiB |
| `index.html` | yes | 1.8 KiB |
| `rolldown-runtime-*.js` | yes | 0.4 KiB |
| `equations-*.js` (KaTeX) | — | 77.6 KiB |
| `docs`, `spreadsheet`, `BatchCalculator`, `ModelCalculator`, … | — | rest |

### 2.2 Scenarios before (median of 3)

| scenario | metric | before |
|---|---|---:|
| first-load-single | shell painted | 47.6 ms |
| | workspace content (`parameters`) | 348.5 ms |
| | first result (`computed`) | 371.0 ms |
| | FCP | 64 ms |
| batch-load | workspace controls | 330.6 ms |
| docs-load | document rendered | 364.8 ms |
| | transfer | 448,633 B |
| wasm-init-cold | import + instantiate | 4.8 ms |
| single-calculate | kernel compute | 1.3 ms |
| | click → settled | 30.5 ms |
| single-model-switch | switch → computed | 15.4 ms |
| dual-kernel-compare | comparison ready | 30.4 ms |
| batch-compute-100 | file → matrix | 48.8 ms |
| batch-compute-1000 | | 44.0 ms |
| batch-compute-10000 | | 110.8 ms |
| batch-compute-20000 | | 185.9 ms |
| batch-compute-20000 | CSV build (sync) | 57.1 ms |
| batch-chart-toggle | scatter ↔ line, 20k rows | 1,275.8 ms |
| docs-locale-switch | click → re-rendered document | 15.8 ms |
| palette-open | click → painted | 25.5 ms |

## 3. What was changed, and the evidence for each

### 3.1 The chart chunk was a static import of the entry (−53% initial payload)

**Evidence.** `dist/index.html` listed `charts-*.js` as a `modulepreload`, and the
entry chunk contained `import{m as t}from"./charts-*.js"`. Instrumenting the build
with a plugin that logs the module→chunk assignment showed why: `manualChunks`
matched `react/index.js` and `react-dom/index.js` into the `react` group, but those
two modules are only reachable through recharts (the app imports React's *named*
APIs, which resolve to React's default-export interop object), so rolldown folded
them into the chart group — and the entry's own React use then made the whole
353 kB chart chunk a static dependency of the entry. The `charts` group name was
the cause; three alternative groupings that kept it all reproduced it.

**Change.** `vite.config.js` lost the `recharts`/`d3` group. Chunking of recharts
is left to the bundler, which puts it in one lazy chunk shared by the two
workspaces that draw charts.

| | before | after |
|---|---:|---:|
| initial gzip | 180.4 KiB | **85.2 KiB** (−53%) |
| initial files | 6 | 5 |
| `first-load-single` domContentLoaded | 46.1 ms | 18.4 ms (−60%) |
| `docs-load` transfer | 448,633 B | 348,169 B (−98.5 kB, −22%) |
| `batch-load` transfer | 312,219 B | 308,662 B |

The `single` and `batch` routes still fetch the chart chunk — they draw charts —
but they now fetch it *in parallel with the workspace chunk* instead of the entry
waiting for it before React can render.

### 3.2 Every route paid a flat 300 ms React suspense throttle (fixed)

**Evidence.** The shell painted at ~31 ms and the workspace content appeared at
~348 ms, on all three routes. The 317 ms gap was constant when the chunks came
from the HTTP cache instead of the network (13 ms vs 67 ms shell time, same ~300 ms
gap), so it was not the fetch. Marking the render phase showed the tree rendering
at ~30 ms and committing at ~330 ms: React rendered and then waited. React DOM
holds a committed suspense fallback for `FALLBACK_THROTTLE_MS = 300`
(`react-dom-client.development.js:24228`) so a spinner cannot flash, and a
`React.lazy` component suspends on its first attempt even when its module is
already loaded. This app suspends on the first render of every route by
construction — `App` wraps the workspace in `Suspense`, and the calculation
workspace has a second lazy step for the model view.

**Change.** The entry point resolves the first workspace *and* the calculation
workspace's first model view before mounting (`src/workspaces.js`), renders the
resolved component directly instead of through `React.lazy`
(`src/App.jsx`, `src/components/SingleCalculationDashboard.jsx`), and the store
starts in the workspace the URL names instead of mounting the default and
switching after an effect (`src/state/appStore.js`). Other workspaces stay lazy:
switching to one is a user action, where a spinner is the right feedback.

| scenario | metric | before | after |
|---|---|---:|---:|
| first-load-single | shell | 47.6 ms | 36.5 ms |
| | workspace content | 348.5 ms | **36.5 ms** (−90%) |
| | first result | 371.0 ms | **56.8 ms** (−85%) |
| batch-load | workspace controls | 330.6 ms | **30.4 ms** (−91%) |
| docs-load | document rendered | 364.8 ms | **44.3 ms** (−88%) |

Trade-off, deliberately taken and recorded in `src/index.jsx`: on a connection
slower than the 300 ms throttle window the shell now appears when the first
workspace's chunks arrive rather than immediately. The bytes are the same; what
changed is that they are no longer fetched twice-over while a spinner holds the
screen.

### 3.3 Batch line chart: 1.26 s of frozen main thread at 20,000 rows (−96%)

**Evidence.** Toggling the batch chart from scatter to line with the widest legal
dataset (B4, 20,000 rows) blocked the main thread for **1,365 ms in a single long
task** and settled at 1,275.8 ms. Scaling was linear, so it was per-point work,
not a fixed cost: 500 rows → 25.8 ms, 2,000 → 51.7 ms, 20,000 → 1,255.9 ms. The
scatter mode next to it was already decimated to 2,000 points; line mode kept
every point and Recharts built a path for all of them, twice (the line and the
Brush).

**Change.** `src/components/BatchCalculator.jsx` decimates line mode to the same
`MAX_SCATTER_POINTS = 2000`, keeping the last point so the line still reaches the
end of the range, and the caption reports the plotted count for both modes.

| scenario | before | after |
|---|---:|---:|
| `batch-chart-toggle` settle | 1,275.8 ms | **51.2 ms** (−96%) |
| blocking total during toggle | 1,365 ms | ≤ 1 frame |

### 3.4 Deliberately not changed

| candidate | measured | why not |
|---|---|---|
| WASM module caching / reuse | 4.8 ms cold for import + instantiate | nothing to win; 27% of 4 ms is noise |
| batch compute → more Worker work | 25–186 ms, already in the batch Worker | the 10k/20k figures vary 2x run-to-run (see §4); no regression is demonstrable, and no gain is either |
| CSV export (57 ms sync at 20k) | `Object.fromEntries(keys.map(...))` per row, then `Papa.unparse` | it is the maximum-size case, under one long task; chunking makes the export async, which is a behaviour change the format-compatibility rule warns against |
| single calculation | 1.2–1.4 ms kernel time | already sub-frame; `single-calculate`'s 32 ms is the two-frame settle wait |
| command palette | 21.8 ms | one frame; nothing to optimise |
| batch matrix | renders 100 of up to 20,000 rows | already bounded |

## 4. Measurement error, stated

- Medians of 3 runs (2 for `batch-compute-10000/20000` and `batch-chart-toggle`).
  Min/max for every metric is in `docs/benchmark-report.md`.
- **`batch-compute-10000` reads +14% after** (110.8 → 126.8 ms) and that is noise:
  the two after-runs were 168.5 ms and 85.0 ms — a 2x spread inside one scenario,
  because the compute runs in a Worker and the measurement includes worker start,
  a structured clone of 10,000 rows, and scheduling. Re-measuring just that
  scenario twice more gave before 106.5/130.2 ms and after 86.5/105.3 ms.
  `batch-compute-20000`, the same code path, is −12% with a spread of 3.5 ms.
- The click-to-settled metrics (`single-calculate`, `palette-open`,
  `docs-locale-switch`) have a ~2-frame floor (≈33 ms) because they wait for the
  paint that follows the commit. Their kernel numbers (`computeMs`) are the app's
  own measurement and are not subject to that floor.
- Localhost, no network latency, no compression; the transfer figures are raw
  bytes over the loopback and the gzip/brotli figures are computed from disk.
- One machine, one browser, one time of day. Absolute numbers from another
  machine are not comparable; the deltas within one harness run are.

## 5. Release-quality audit

### 5.1 Responsive layout and mobile

Four viewports (320×640, 390×844, 768×1024, 1280×800) × three workspaces, with a
detector that reports any element whose box leaves the viewport unless an ancestor
scrolls it or clips it. Result: **0 overflowing elements, and
`documentElement.scrollWidth === innerWidth` at every combination** — including
the batch matrix (a scroll container) and the reference library's KaTeX display
equations (inside `overflow-x-auto`; the accessible MathML copy is clipped to 1px
by KaTeX, which the first version of the detector misreported as 47 offenders —
the refined one excuses clipped subtrees).

Two target-size findings were fixed (WCAG 2.5.8, 24×24 CSS px):

- the reference library's table of contents rendered its links **16 px tall** with
  a 4 px gap, so the 24 px spacing exception did not apply — the links now carry
  `py-1` and are 24 px (`src/components/DocsPage.jsx`);
- the value copy button was **40×23 px** — one pixel short; it is now `min-h-6`
  (`src/components/ui/CalculatorWrapper.jsx`).

Remaining sub-24 px targets are inherent to their pattern and exempt: inline links
inside prose sentences (WCAG's inline exception), the `sr-only` skip link and file
input (their visible targets are larger), and the chart's two 5×18 px Brush drag
handles, which are a slider affordance with arrow-key support rather than a button.

### 5.2 Keyboard navigation and screen readers

- 30 consecutive `Tab` presses on the calculation workspace: every stop is a real
  control and **every one has a visible focus indicator** (outline or ring).
- No positive `tabindex` anywhere.
- The accessibility tree has **no interactive node without an accessible name**
  across all viewports and workspaces.
- Fixed: Recharts' Brush travellers announced themselves as `"Min value:
  undefined, Max value: undefined"` — the library labels them from a `name` field
  the chart data does not carry. Both charts now pass an explicit `ariaLabel`
  (`calculator.chart.brushRange`, new key in both locales), so they announce
  "Series range" / "曲线范围" and keep their `aria-valuenow`.

### 5.3 Asynchronous errors and exception states

- Reference document fetch forced to fail (CDP `Fetch.failRequest`): the page
  shows a retry affordance ("Try again") instead of a blank pane, and no exception
  or console error is raised.
- Kernel failure, Worker failure and dataset parse failure already have fallback
  paths covered by `kernelFallback.test.jsx`, `kernelStatus.test.jsx`,
  `batchWorkerClient.test.js`; the browser runs above produced **zero**
  uncaught exceptions and zero console errors/warnings across every viewport,
  workspace and locale tested.

### 5.4 Upload and download error paths (verified in the browser)

| input | result |
|---|---|
| text file renamed `.xlsx` | "Could not parse XLSX: invalid zip data", no crash |
| 34 MB `.xlsx` | "File is 34.0 MB, above the 32 MB limit for XLSX…", refused before the read |
| header-only `.csv` | "File is empty. Upload a CSV or XLSX file with headers and data." |
| `.txt` | "Unsupported format. Use CSV or XLSX." |

Each left the previous dataset state consistent (no matrix, error banner visible,
`role="alert"`). Downloads are exercised by the export scenarios (57 ms sync at
the 20,000-row cap, §3.4). The two known benign `setTimeout`-after-unmount cases
in `CopyValue` and `downloadBlob` remain recorded in
`docs/dependency-security-audit.md` §8.4.

### 5.5 Production build vs dev server

Running the whole responsive/a11y/console audit against `vite dev` and against
`vite preview` produced **identical numbers** (overflow 0, same target counts, same
36 focusables, no console output). The intentional differences are the two
`import.meta.env.DEV` gates: the error boundary's detail block and the missing
translation-key warning. No `process.env` use in `src/`. Tailwind's production
purge is not hiding a class built by string concatenation: the DOM snapshot compare
(§6.4) shows every class attribute in the production build matches the dev-verified
markup apart from the three intended edits.

### 5.6 Browser compatibility

`build.target` is Vite's default (`baseline-widely-available`); the declared
browserslist resolves to `safari ≥ 18.5`, `ios_saf ≥ 16.6`, current Chrome/Edge/
Firefox/Opera/Samsung — so the ES2022/2023 runtime APIs the code uses
(`Object.hasOwn` in the new `workspaces.js`, `Array.prototype.findLast` in
`DocsPage.jsx`) are inside the declared range. No CSS feature used is outside it
(`dvh`, `:has()` and container queries all predate the floor). No change needed.

### 5.7 Internationalisation

- Key parity is enforced by `messages.parity.test.js` and passes.
- The reference library was rendered in both languages for all six models, with a
  heuristic scan for untranslated lines: the only English left in the Chinese
  interface is standard designations (`ACI 209R-92`, `fib Model Code 2010`, …),
  brand, units and subscripts — plus the language switch's own label, which shows
  "English" by design and carries `lang="en"`.
- No Chinese characters appear in the English interface other than the two in the
  language switch's "中文", which is likewise deliberate.

### 5.8 Reference documents: safety and formulas

Twelve renders (6 models × 2 languages): **0 KaTeX errors, 0 formula fallbacks,
0 injected `<script>`/`<iframe>`/`<object>`/event-handler attributes** inside the
document body. KaTeX runs with `trust: () => false`, `strict: 'ignore'`,
`maxExpand: 1000`, `maxSize: 20` and a macro table with no prototype; raw Markdown
HTML tokens are dropped rather than rendered.

One cosmetic finding, recorded rather than fixed: `b4.md` (both languages) writes
`$c=219.3\text{ kg/m³}$`, and KaTeX logs an unconditional
`console.warn("No character metrics for '³' …")` for it — KaTeX's own source calls
this "TODO(emily): Figure out a good way to only print this in development". The
rendered output is correct (KaTeX substitutes metrics). The obvious fix is to write
`\text{ kg/m}^3` in the document, but the Chinese originals are byte-pinned to their
original hashes by `src/docs/documents.test.jsx` ("retains the entire original
Chinese document") and the English files are verified token-for-token against them;
editing the source to silence a warning would break a provenance guarantee, so the
warning stays and is documented here.

## 6. Security re-check

### 6.1 Bundle guard cannot be bypassed by the normal build

`bundleGuardPlugin()` is registered in `vite.config.js` with `apply: 'build'`,
`enforce: 'post'`, and it throws from `generateBundle` — before any file is
written. There is no environment variable, flag or option that disables it, and it
logs a one-line summary even when clean, so a silent log means it did not run.
`src/bundleGuard.build.test.js` builds poisoned fixtures and asserts the failures:
`@xmldom/xmldom` (including an unused-looking import that *is* bundled without the
guard), a stubbed Node builtin, `read-excel-file/universal`, and `jsdom` — 35 tests
pass. End-to-end, adding `import 'read-excel-file/node'` to a real source file
fails `npm run build` (exit 1).

### 6.2 Dependency audit

`npm audit --omit=dev` → **0 vulnerabilities**. `npm audit` (including dev) → 7
(5 high, 2 moderate), all in the Tailwind 3 build toolchain, unreachable at
runtime, documented with the reasoning and the Tailwind 4 migration proposal in
`docs/dependency-security-audit.md` §3.3/§6.

### 6.3 XLSX 32 MiB gate

Enforced in `readFile()` before the replacement prompt and before anything is
read; unit-tested at the exact boundary, and verified again in the browser: a
34 MB `.xlsx` is refused with the size message and never reaches the parser. The
gate's derivation is unchanged (worst legal workbook measured at 16.8 MiB inflated).

### 6.4 XLSX decompression: measured, with an implementable bound proposed

The gate bounds the upload, not the inflation. That exposure now has numbers
(headless Chrome, production build, the real importer path):

| upload | inflated sheet XML | ratio | wall | main-thread blocking | JS heap |
|---|---:|---:|---:|---:|---:|
| 30 KiB | 10.0 MB | 326:1 | 349 ms | 303 ms in one task | 2.3 → 7.9 MB |
| 570 KiB | 200.0 MB | 343:1 | 6,924 ms | **6,389 ms in one task** | 4.3 → 130.5 MB |

Both are accepted by the 32 MiB gate. Cost scales linearly: **≈32 ms of frozen
main thread and ≈0.6 MB of peak heap per MB of inflated sheet XML**, so a 2 MiB
upload at the same ratio is ~22 s and ~430 MB. The full measurements, the
derivation of a 32 MiB *inflated* ceiling (2× the worst legal input), and a
concrete implementable design that keeps `read-excel-file` as the reader —
inflate with fflate's streaming `Unzip` under a byte and entry ceiling, re-pack
the accepted parts, hand those over — are in `docs/xlsx-input-limits.md` §6–7 and
summarised in `docs/dependency-security-audit.md` §8.3. **Not implemented**, per
the instruction not to rewrite the Excel parser in this phase.

### 6.5 DOM regression evidence for the changes

The repo's own `scripts/dom-snapshot.mjs` was run against a baseline build
(`5d0c2fb` + the measurement hooks) and this one, with `DUMP_DIR` set, and the
dumped markup diffed. Across all seven scenes the *only* differences are the three
intended edits:

- copy button class gains `min-h-6 items-center justify-center inline-flex`;
- Brush traveller `aria-label` "Min value: undefined, Max value: undefined" →
  "Series range" (2 nodes);
- the 11 table-of-contents links gain `py-1`.

`batch-empty` and `batch-loaded` are byte-identical apart from one attribute
*order* in the header's nav button: in the baseline the batch tab acquired
`aria-current` during the post-mount workspace switch, so React appended it after
`aria-label`; now that the store starts in the URL's workspace it is set during
creation, in source order. That is the fix from §3.2 visible in the markup. The
performance changes themselves are DOM-invisible.

## 7. Verification log

| gate | result |
|---|---|
| `npm test` | **673 passed** (50 files); 669 before this phase + 4 new (`workspaces.test.js`, the `initialWorkspace` case in `App.test.jsx`) |
| `npm run lint` | clean |
| `npm run build` | passes, `[bundle-guard] 463 bundled modules checked against 9 rules — no forbidden packages` |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm run screenshots` | 11/11 written, verified as PNG and non-blank; two consecutive runs byte-identical |
| `scripts/dom-snapshot.mjs --save` then `--check` | all 35 fingerprints match on a repeat run |
| `scripts/benchmark.mjs` | before and after runs both complete; raw report in `docs/benchmark-report.md` |
| UI audit (4 viewports × 3 workspaces × 2 servers) | 0 overflow, 0 unnamed controls, 0 console errors |
| document audit (6 models × 2 locales) | 0 KaTeX errors, 0 injected handlers/scripts |

## 8. Residual risk and what was not done

1. **XLSX inflation is still unbounded**; §6.4 and `docs/xlsx-input-limits.md` §7.
2. **The 20,000-row cap is still checked after the parse**, for the reason in §6.4.
3. **CSV export is still synchronous** (57 ms at the cap) — measured, left alone.
4. **Tailwind 4 migration** — out of scope by instruction; dev-only advisories
   remain until it happens.
5. **`b4.md`'s `³`-in-`\text{}` KaTeX warning** — real, cosmetic, and not fixable
   without editing a hash-pinned source document (§5.8).
6. **The initial-workspace pre-resolve** trades an earlier shell for an earlier
   workspace on slow connections (§3.2). If that trade is ever revisited, the
   scenario to re-measure is `first-load-single` with `--network=slow` emulation,
   which this harness does not currently do.
