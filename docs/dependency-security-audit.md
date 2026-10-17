# Dependency security review

Baseline commit `578f490` · reviewed against the tree at the checkpoint that
follows this document. Everything below is measured: the numbers come from
`npm audit --json` before and after, and every reachability claim names the file
and line that decides it.

## 1. Summary

| | before | after |
|---|---|---|
| total advisories | 16 (12 high, 4 moderate) | 7 (5 high, 2 moderate) |
| **production dependency advisories** | **1 high** | **0** |
| development-only advisories | 15 | 7 |
| advisories with no upstream patch | 1 | 1 |
| packages changed | — | 53 (0 manifest changes) |

The only advisory that could ever reach a user was `@xmldom/xmldom` in the XLSX
import chain. It is fixed. The seven that remain are all in the Tailwind 3 build
toolchain, are not shipped, and are not reachable from attacker-controlled input
— see §4 for the per-advisory reasoning and §6 for the one migration that would
clear them.

`package.json` is unchanged. Every upgrade was applied by `npm audit fix` inside
the ranges the manifest already declared, so nothing was force-upgraded and no
major version moved.

## 2. What was audited

`npm audit` (the project uses npm; `package-lock.json` is committed, no other
lockfile exists). Both views were taken:

- `npm audit` — the full tree, development dependencies included;
- `npm audit --omit=dev` — what a deployment actually installs.

The distinction is the whole finding: the full-tree report was the alarming one,
and it was 15/16 build tooling.

## 3. Findings and disposition

### 3.1 Fixed — production (`@xmldom/xmldom`, high)

`read-excel-file@9.0.9 → @xmldom/xmldom@^0.9.9`, resolved to `0.9.10`. Thirteen
advisories against it, in the range `>=0.9.0-beta.1 <=0.9.11`.

**Reachability, measured rather than assumed.** `@xmldom/xmldom` is *not in the
inspected production bundle*, and that was established from the build's module
graph rather than from a string search of minified output — a string search can
miss bundled or transformed code, and the package is classified as a production
dependency either way.

A recording Vite build (a temporary config whose plugin collects every
`moduleParsed` id and every emitted chunk) put **625 modules** into the graph. 38
of them belong to `read-excel-file`, and the importer is present while the parser
that matters is not:

```
included:  read-excel-file/browser/index.js
included:  read-excel-file/modules/xml/xmlBrowser.js   ← native DOMParser
absent:    read-excel-file/modules/xml/xml.js           ← imports @xmldom/xmldom
absent:    @xmldom/xmldom (any module)
absent:    unzipper, xpath (the package's other Node-only dependencies)
```

The app imports `read-excel-file/browser` (`src/components/BatchCalculator.jsx:5`),
so the entry is `xmlBrowser.js`, whose whole implementation is
`new DOMParser().parseFromString(content, 'text/xml')` against the platform's own
parser. The `spreadsheet` chunk holds exactly those 35 modules and no others. Two
independent measurements agree: no `dist/` chunk contains `xmldom` or
`requireWellFormed`, and no module in the build graph resolves to either.

There is also a structural reason the Node entry cannot be reached by accident:
`read-excel-file`'s `exports` map has no bare `"."` entry, only `./universal`,
`./browser`, `./node`, `./web-worker` and `./package.json`, so importing it without
an explicit subpath does not resolve at all. The app also never imports the
web-worker entry — its own `src/components/batchWorker.js` is a separate Vite
worker that pulls in `batchCompute.js` and nothing else.

So the advisory was **not present in any inspected production bundle**, and the
risk was a dependency-tree finding rather than a shipped parser: the vulnerable
code is installed, is reachable from `read-excel-file/node`, and would matter for
any future Node-side use of that package (a build script, an SSR path, a CI data
check). That is what `npm audit --omit=dev` was reporting, and it is why the bump
was worth taking rather than arguing away. It is *not* a claim that the package
could never become reachable — see §8.1 (now closed).

**Fix.** `npm audit fix` resolved `@xmldom/xmldom` to `0.9.12`. read-excel-file
declares `^0.9.9`, which for a `0.x` version means `>=0.9.9 <0.10.0`, so `0.9.12`
is the same minor line and the upgrade is compatible by construction. No
`overrides` entry was added, deliberately: pinning a range here would defeat a
future read-excel-file that requires `0.10.x`. The committed lockfile is what
makes the fix reproducible.

**Alternative considered and rejected.** Upgrading `read-excel-file` `9.0.9 →
9.3.12` would also have pulled a newer xmldom, but it changes the import layer of
a data-format path for no security gain over the transitive bump. Not worth the
regression surface.

### 3.2 Fixed — development tooling (9 packages, 9 advisories)

| advisory | package | path | fix |
|---|---|---|---|
| `@vitest/mocker` path traversal | `@vitest/mocker` | vitest (direct dev) | 4.1.7 → 4.1.11 |
| Vitest redirect mock | `vitest` | direct dev | 4.1.7 → 4.1.11 |
| `server.fs.deny` bypass (Windows) | `vite` | direct dev | 8.0.13 → 8.3.4 |
| launch-editor NTLMv2 (Windows) | (via vite) | direct dev | 〃 |
| PostCSS path traversal / map disclosure | `postcss` | direct dev | 8.5.15 → 8.5.30 |
| PostCSS quadratic selector parse | `postcss-selector-parser` | tailwindcss, postcss-nested | 6.1.2 → 6.1.4 (the `<6.1.3` advisory only) |
| source-map-js event-loop DoS | `source-map-js` | postcss, css-tree | 1.2.1 → 1.2.2 |
| nanoid unbounded loop | `nanoid` | postcss | 3.3.12 → 3.3.20 |
| browserslist OOM / prototype write | `browserslist` | autoprefixer, @babel/core | 4.28.1 → 4.29.3 |
| browserslist-stats crash | `baseline-browser-mapping` | browserslist | 2.10.10 → 2.11.29 |
| undici (21 advisories) | `undici` | jsdom | 7.25.0 → 7.30.1 |

None of these are shipped: `vite`, `vitest`, `postcss` and `tailwindcss` are
`devDependencies`, and `undici` arrives only through `jsdom`, which exists for
the test environment. All were fixed by `npm audit fix` inside the declared
ranges.

### 3.3 Not fixed — Tailwind 3 build toolchain (7 advisories, 5 high)

`braces` → `micromatch` → `fast-glob`; `braces` → `chokidar`; `postcss-selector-parser`
→ `postcss-nested`; all four pulled in by `tailwindcss@3.4.19`.

**Key finding: `braces` has no patched version.** The advisory range is `<=3.0.3`
and `3.0.3` is the latest release (published 2024-05-21). There is no version to
upgrade to, so no amount of `npm audit fix` — with or without `--force` — can
clear `braces`, `micromatch`, `fast-glob`, `chokidar` or `tailwindcss`. `npm`'s
own suggested fix is `tailwindcss@4.3.3`, which does not contain this subtree at
all: it has an empty dependency list.

**Reachability of what is left, per node:**

- `chokidar` is required only by `tailwindcss/lib/cli/build/watching.js`, i.e. the
  Tailwind **CLI's** file watcher. This project uses Tailwind as a **PostCSS
  plugin** (`postcss.config.cjs`), so `chokidar` is never loaded during a build.
- `micromatch` *is* loaded, by `tailwindcss/lib/lib/content.js:31` (`matcher(path)`
  at line 183). The pattern it compiles comes from `content` in
  `tailwind.config.js` — a static, developer-authored literal
  (`'./index.html'`, `'./src/**/*.{js,jsx,ts,tsx}'`). The `braces`
  stack-exhaustion advisory needs a deeply nested *pattern*; there is no path from
  a user upload, a URL, a document or a file name to that pattern.
- `postcss-selector-parser` is loaded to parse selectors from the project's own
  CSS and Tailwind's generated selectors. Same conclusion: not attacker-controlled.
- None of the seven appear in `dist/`. Verified: no build chunk references
  `micromatch`, `braces`, `fast-glob` or `chokidar` as a runtime dependency.

So: a genuine upstream gap, in tooling that runs on a developer machine and CI,
with no attacker-controlled input and no shipped code path. Accepted for this
phase, with the migration in §6 as the follow-up. It is **not** hidden — `npm audit`
reports all seven on every run.

"Development-only" is a statement about the trust boundary, not about reachability,
and the distinction matters here: `micromatch` genuinely executes on every build.
The boundary is that the only input it sees is `content` from a config file that is
reviewed alongside the code, whereas the advisories all require an
attacker-shaped pattern, selector or file name. Feeding an untrusted value into a
Tailwind `content` glob — a generated path from a CMS, say — would move these from
"accepted" to "exploitable" without changing a single version number.

### 3.4 Also considered

- **`npm audit fix --force`** — not run. It resolves to `tailwindcss@4.3.3`, a
  breaking major that rewrites the CSS entry point, the PostCSS plugin and the
  theme configuration. That is a migration, not a fix, and the instruction was not
  to take it without an impact analysis. See §6.
- **`overrides` to force `chokidar@4`** (which drops `braces`) — rejected.
  `tailwindcss@3` declares `chokidar: ^3.6.0`; forcing 4.x would substitute a
  major version inside a package that never asked for it, to fix a code path that
  is not loaded. High risk, no benefit.
- **Replacing `read-excel-file` with `xlsx`/`exceljs`** — rejected. It would
  change the parsing semantics of every user's spreadsheet file. The upstream
  advisory was fixed inside the existing dependency, so there was nothing to
  trade.

## 4. Reachability method

The claim "not shipped" was checked, not inferred, and the primary check is the
build's own module graph:

1. A recording Vite build collects every `moduleParsed` id and every emitted
   chunk. `@xmldom/xmldom` is in neither, and neither is
   `read-excel-file/modules/xml/xml.js` — while
   `read-excel-file/modules/xml/xmlBrowser.js` is (§3.1).
2. The string search is kept only as a second, independent signal: after a
   production build, no `dist/assets/` chunk contains `xmldom` and none contains
   `requireWellFormed`.
3. `npm audit --omit=dev` → `0` total, which is what classifies the seven that
   remain as development-only.
4. For each remaining advisory: the requiring file, the requiring line, and the
   source of its input.

Two caveats, both worth stating rather than leaving implicit. `npm audit
--omit=dev` establishes a dependency *classification*, not exploitability — it is
step 3 above, not the argument. And a string search over minified output can miss
bundled or transformed code, which is exactly why step 1 exists and step 2 is not
load-bearing. "Not shipped" here means this build, measured; it is not a
statement about what any future import could pull in, which §8.1 covers.

## 5. Dependency changes actually applied

`package.json` is byte-identical to the baseline. 53 lockfile entries moved, all
within existing ranges. Direct dependencies that moved:

| package | before | after |
|---|---|---|
| `vite` | 8.0.13 | 8.3.4 |
| `vitest` | 4.1.7 | 4.1.11 |
| `postcss` | 8.5.15 | 8.5.30 |

Transitive dependencies that moved (one line each; platform-specific
`@rolldown/binding-*`, `lightningcss-*` binaries at 1.0.1→1.2.14 and
1.32.0→1.33.0 respectively are omitted for length):

`@oxc-project/types` 0.130.0→0.154.0 · `@vitest/{expect,mocker,pretty-format,runner,snapshot,spy,utils}` 4.1.7→4.1.11 ·
**`@xmldom/xmldom` 0.9.10→0.9.12** · `baseline-browser-mapping` 2.10.10→2.11.29 · `browserslist` 4.28.1→4.29.3 ·
`caniuse-lite` 1.0.30001781→1.0.30001816 · `chai` 6.2.2→6.3.0 · `electron-to-chromium` 1.5.325→1.5.459 ·
`lightningcss` 1.32.0→1.33.0 · `nanoid` 3.3.12→3.3.20 · `node-releases` 2.0.36→2.0.59 · `postcss-selector-parser` 6.1.2→6.1.4 ·
`rolldown` 1.0.1→1.2.14 · `source-map-js` 1.2.1→1.2.2 · `tinyglobby` 0.2.16→0.2.17 · `tinyrainbow` 3.1.0→3.2.0 ·
`undici` 7.25.0→7.30.1 · `update-browserslist-db` 1.2.3→1.3.4 · `vite > picomatch` 4.0.4→4.0.7

**Build-output equivalence.** The CSS toolchain moved (`postcss`, `browserslist`,
`caniuse-lite`, `lightningcss`), so the compiled stylesheet was diffed before and
after: `dist/assets/index-*.css` and `dist/assets/equations-*.css` are
**byte-identical**, 38,244 and 29,803 bytes. The only output differences are the
JS content hashes, from the rolldown/vite minor upgrade.

That check also caught something unrelated to the upgrade. Rewording a comment in
the new `src/testUtils/xlsx.js` — the word "collapse" appeared in a JSDoc
sentence — added `.collapse{visibility:collapse}` to the stylesheet, 30 bytes.
`tailwind.config.js` scans `./src/**/*.{js,jsx,ts,tsx}`, which includes prose in
comments, so any comment word that happens to match a utility name is emitted.
The comment now says "flatten" and the stylesheet is byte-identical again. See
§8.7.

## 6. Proposed follow-up: Tailwind 3 → 4

Recommended as its own task, not done here. What it would take, from the actual
config in this repo:

- `postcss.config.cjs` — `tailwindcss: {}` becomes `@tailwindcss/postcss: {}`
  (a new dependency).
- `src/index.css` — `@tailwind base/components/utilities` becomes
  `@import "tailwindcss"`, and the design tokens in `tailwind.config.js`
  (`colors`, `fontSize`, `borderRadius`, `boxShadow`, `maxWidth`) move into CSS
  `@theme` blocks.
- `darkMode: ['selector', '[data-theme="dark"]']` needs the v4 custom-variant
  form.
- `@tailwindcss/forms` must move to its v4-compatible major; the
  `@tailwindcss/container-queries` plugin is redundant in v4 (`@container` is
  built in).
- Two tests assert generated output and would need review:
  `src/paletteContrast.test.js` (reads tokens out of `src/index.css`) and
  `src/components/shippedAssets.test.jsx`.
- The CSS diff must be reviewed by eye: v4 changes the default border, ring and
  placeholder colours, which this UI uses heavily.

Payoff: the seven remaining advisories disappear with the subtree. Until then
they are a documented, non-reachable, development-only residual.

## 7. Verification

| check | result |
|---|---|
| `npx vitest run` | **602 passed** (45 files) — was 585 before; +17 new, none weakened |
| `npx eslint .` | no issues |
| `npm run build` | succeeds |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm audit` | 7, all Tailwind-toolchain and non-reachable (§3.3) |
| production module graph | 625 modules; `read-excel-file`'s browser parser included, its `@xmldom/xmldom` parser and `unzipper`/`xpath` absent (§3.1) |
| `npm ls --all` | exit 0 — the installed tree matches the lockfile |
| `npm run screenshots` | 11 screenshots captured; the committed set was found to be **stale** (§7.2) and is regenerated |
| `node scripts/dom-snapshot.mjs --save` then `--check` | **all 35 fingerprints match** (6 scenes × 4 viewports) |
| browser regression | see below |

The 17 new tests are `src/components/BatchCalculator.excel.test.jsx`, backed by
`src/testUtils/xlsx.js` — a dependency-free `.xlsx` writer built on `node:zlib`,
so the XLSX cases are readable in the test file instead of being opaque committed
binaries. They cover: workbook order vs. part-file names, an empty first sheet in
a multi-sheet workbook, Chinese file and sheet names, the row limit for XLSX,
Chinese headers through the mapping panel, duplicated and colliding headers,
bit-for-bit numeric round-trip including a CSV parity comparison, blank/short/
non-numeric/out-of-domain rows, a non-zip, a truncated zip, an external entity
(asserted not to resolve), nested internal entities, well-formed non-worksheet
XML, a legacy `.xls`, and full CSV/XLSX parity over awkward values.

### 7.1 Independent review

The conclusions in §3.1 and §3.3 were put to an independent reviewer before being
written up. It accepted the disposition of the seven Tailwind advisories and
rejected one thing: that a string search of `dist/` supported the phrase "never
exploitable". Both criticisms were acted on — the claim is now scoped to the
inspected build, and the module-graph measurement above is the artifact that
replaced the string search. It also flagged, correctly, that "development only"
must not be read as "unreachable": `micromatch` *is* on the build path, and the
boundary that matters is that its input is repository configuration, not user
data.

### 7.2 Browser regression

Driven over the DevTools Protocol against the production build (`vite preview`):

- **Calculation** — Rust WASM kernel ready; φ = `1.17756` for the default ACI
  209R-92 case; response chart and data table render; kernel comparison runs both
  kernels over the 10,000-day series (JS 1.5 ms, Rust 1.7 ms, 0.88×).
- **Batch** — nav writes `?mode=batch`; the demo sweep loads 9 rows × 1 output
  field; the matrix renders numeric cells right-aligned.
- **Excel** — the shipped `模型示例/B4示例.xlsx` uploaded through a real file
  input: 5 rows × 4 output fields, no parse error, first row
  `J = 0.169541`, `εsh = -0.000434742`, `εau = -0.000036971`, `εtotal = -0.000471713`.
- **Export** — the CSV export produces a blob whose header row and result columns
  match those XLSX-imported values exactly.
- **Language** — the switcher's `aria-label` is written in the target language;
  after switching, `<html lang>` flips to `en`, the document title changes, and
  the URL stays clean (defaults are omitted by design).
- **Docs** — `?mode=docs` renders the ACI model documentation with heading ids and
  KaTeX; the advertised Markdown download resolves (HTTP 200, 6,774 bytes); anchor
  links update the URL hash; every external link carries
  `target="_blank" rel="noopener noreferrer"`.

### 7.3 Two defects in the browser gates, found because they could not run

Both were found the same way: by trying to run the gates and reading the exit
code instead of the working tree.

**The gates only worked for a non-Chinese developer.** `scripts/capture-screenshots.mjs`
and `scripts/dom-snapshot.mjs` both wait on English interface text, while
`detectLocale()` (`src/i18n/locales.js`) reads `navigator.languages` — so on this
machine (OS language `zh-Hans-CN`) the app renders 中文 and every wait times out:
`Timed out waiting for the app shell`.

This is worse than an ordinary broken tool, for two reasons worth recording. The
screenshot script fails *before* capturing, so `docs/images/` is left untouched
and `git status` is clean — which reads exactly like a pass. And an earlier draft
of this section claimed all 11 images regenerated byte-identically on that basis.
The log has no `.png` line and the images' mtimes are unchanged: nothing was ever
captured. Fixed by pinning the language through the app's own supported
parameter (`?lang=en`) rather than by trusting the browser's locale.

**`dom-snapshot.mjs` could not open a non-Calculate workspace.** It clicked the
nav button with `b.textContent.trim() === 'Batch'`, but the nav renders both
labels — `<span class="hidden md:inline">Batch</span>` and
`<span class="md:hidden">Batch</span>` — so its `textContent` is `"BatchBatch"`
and the exact match never succeeded. It failed on the first batch scene with
`could not click "Load demo sweep"`. Fixed by matching the accessible name
(`aria-label`, which is the label alone).

Its docs scene then failed on `leafText('Parameter contract')`. No such text
exists anywhere in the tree — the reference library moved to model Markdown in
`578f490`, and the section it named is gone. Replaced by a real load signal: a
rendered `[data-doc-heading]`, which only exists once the Markdown has parsed.

### 7.4 The gates were then hardened

The two defects in §7.3 and the near-miss they caused share one root: a gate that
cannot tell "everything passed" from "nothing ran". A follow-up pass changed how
they decide, and how they report:

- **They no longer read display copy.** Waiting for the English words
  "Time-dependent concrete analysis", "Result matrix" and "Rust speed-up", and
  clicking buttons by their visible text, meant a rename could break a gate and a
  translation could break it silently. Every probe now reads a `data-` hook or an
  `id` the component sets for the purpose (`data-workspace` on `<main>`,
  `data-run-status`, `data-kernel`, `data-action`, `data-result-matrix`,
  `[data-doc-heading]`), or the URL — workspaces are opened with the app's own
  `?mode=` parameter, which is what a shared link does.
- **They verify what they produced.** `capture-screenshots.mjs` used to exit 0
  after writing whatever the capture returned, so an empty capture wrote a zero-byte
  PNG and reported success. It now checks every expected file exists, is a PNG and
  clears a size floor, and that the set of images in `docs/images` did not silently
  lose a member (`scripts/artifacts.mjs`, `src/artifacts.test.js`).
- **`dom-snapshot.mjs --check` can see a run that measured less.** It iterated the
  fingerprints it *had*, so a key recorded in the baseline and absent from the run
  was not mismatched — it was not looked at. Both directions are checked now, and
  the check is demonstrated, not asserted: a baseline with a phantom key fails the
  run.
- **Failure propagation is proven, not assumed.** Against a deliberately broken
  `dist/`, both scripts exit non-zero with the failing wait and the page contents;
  a `vitest` invocation matching no tests exits 1; and the artifact checks are
  covered by 18 unit tests for the missing, empty, truncated, non-PNG and
  unexpected-set cases.

### 7.5 `docs/images/` was stale, and the broken gate is why nobody noticed

With the gates runnable, the regenerated screenshots differ from the committed
ones — and the differences are the *committed* ones being out of date, not the
new ones being wrong. Committed `docs/images/ui-model-docs.png` shows the nav as
`Calculate | Batch | Reference` at a viewport 488 px wide; at HEAD the nav renders
`<span class="md:hidden">{item.short}</span>`, so 488 px can only show
`Calc | Batch | Docs`. The same image is missing the "On this page" contents list,
and `ui-batch-matrix.png` still shows the pre-localisation bilingual
`Upload 上传数据 · Validate 校验字段 · Results 计算结果` row from before `f3b0b62`.

The images were last committed in `be47871`, which predates both `f3b0b62` and
`578f490` — the two commits that changed what these captures show. The images are
regenerated in this phase. One pre-existing cosmetic issue is deliberately left
unchanged so the diff stays attributable: the hero image is captured after
waiting for the *label* `Rust speed-up`, not its values, so the comparison panel
reads `— ms / — ms / —×`. The committed image has the same placeholders.

## 8. Residual risk

Ordered by what would be worth doing next.

1. **Closed.** ~~No guard against a Node-only dependency re-entering the bundle.~~
   §3.1's conclusion used to rest on one measurement taken by hand, with a
   temporary build config that was not in the repository, so nothing failed if a
   later change imported `read-excel-file/node` and dragged `@xmldom/xmldom` into
   the browser bundle. There is now a checked-in guard
   (`scripts/bundleGuard.mjs`) that reads the emitted bundle's module graph during
   `npm run build` and fails the build on a deny-list, with both directions
   covered by `src/bundleGuard.build.test.js`. What remains is that the guard
   speaks only about *inclusion*: it cannot see an advisory inside a module that
   legitimately belongs in the browser, and that is what `npm audit --omit=dev` is
   for.
2. **Tailwind toolchain, 7 advisories, 5 high** — no upstream patch exists for
   `braces`; clearing it requires Tailwind 4 (§6). Not shipped, not
   attacker-reachable. Development and CI only.
3. **XLSX inflation is still unbounded. The upload is not.** The 20,000-row cap is
   checked after `readSheet()` has inflated and parsed the whole part, so a hostile
   `.xlsx` whose XML inflates to gigabytes is still decompressed in the tab before
   it is refused — demonstrated in `BatchCalculator.excel.test.jsx`, where a 153 KB
   archive holding 975 KB of sheet XML is accepted and then refused by the row
   limit. What changed: a 32 MiB compressed-size gate now runs before the file is
   read at all, derived from measurements of the largest legal upload (worst case
   16.8 MiB) rather than guessed, and `read-excel-file` is confirmed to offer no
   decompressed-size, per-entry, entry-count or ratio option. The gate bounds the
   upload and the archive handed to the inflater; it does not bound the inflation,
   and a few-kilobyte bomb is unaffected by it. Do not read the gate as a fix. The
   path audit, the measurements and the two implementable options are in
   **docs/xlsx-input-limits.md**; implementing either was explicitly out of scope
   for the phase that added the gate. That document's §6 now prices the exposure
   instead of describing it: a 570 KiB upload the gate accepts froze the tab for
   6.9 s in one task and grew its heap by 126 MB, and the CPU cost is ~32 ms per MB
   of inflated sheet XML. §7 works out a bounded unpack that keeps
   `read-excel-file` as the reader — inflate under a ceiling with fflate's
   streaming `Unzip`, then re-pack the accepted parts and hand those over — which
   is implementable without touching the parser.
4. **`exportCSV` builds every row on the main thread.** Up to 20,000 rows ×
   (inputs + results) are mapped and serialised synchronously on click. Chunking
   it would change the export into an async operation, so it was left alone; it is
   a responsiveness concern for the maximum-size dataset, not a correctness one.
5. **`setTimeout` without an unmount guard** in `CopyValue`
   (`src/components/ui/CalculatorWrapper.jsx:83`) and `downloadBlob`
   (`src/components/BatchCalculator.jsx:492`) — a state update and an
   `URL.revokeObjectURL` scheduled after a possible unmount. Both are benign under
   React 19 and the object URL is revoked either way.
6. **`chai` 6.2.2 → 6.3.0 and `tinyrainbow` 3.1.0 → 3.2.0** arrived as part of the
   vitest patch bump. Covered by the passing suite.
7. **Tailwind's content globs scan comments.** `content: ['./index.html',
   './src/**/*.{js,jsx,ts,tsx}']` matches prose in JSDoc blocks and in test files,
   so an English word that collides with a utility name is emitted into the
   shipped stylesheet — measured, not theoretical: one comment word added 30 bytes
   of unused CSS (`.collapse{visibility:collapse}`) during this phase. Harmless
   today because nothing applies the class, but it makes the stylesheet depend on
   comment wording. A future task could narrow the globs (exclude `*.test.*` and
   `src/testUtils/**`) and re-diff the output; it was not done here because it
   changes the stylesheet in ways that need a visual review, not a mechanical one.
