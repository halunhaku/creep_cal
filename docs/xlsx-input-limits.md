# XLSX input limits

What the dataset importer bounds today, what it does not, and what it would take to
bound the rest. Written because the honest answer to "is the ZIP bomb fixed?" is
**no** — a compressed-size gate was added, and this is where the remaining exposure
and its options are recorded rather than left implicit.

## 1. The path a file takes

| step | where | bounded? |
|---|---|---|
| file chosen (input or drop) | `src/components/BatchCalculator.jsx` `readFile()` | size gate, 32 MiB (§2) |
| `File` → `ArrayBuffer` | `read-excel-file/modules/export/unpackXlsxFileBrowser.js` | by the size gate |
| ZIP unpack | `modules/zip/unzipFromArrayBuffer.js` → fflate `unzip` | **no** (§3) |
| entry filter | `modules/export/filterZipArchiveEntry.js` | entries not named `*.xml`/`*.xml.rels` are skipped, so images and fonts are never inflated |
| XML parse | `modules/xml/xmlBrowser.js` → platform `DOMParser` | no |
| XML → rows | `modules/xlsx/*` | no |
| row count limit | `BatchCalculator.jsx` `processData()`, 20,000 rows | yes — but *after* the two steps above |

The row limit is real and it is the right check for a legitimate oversized file. It
is not a memory bound: by the time it runs, the whole archive has been inflated and
parsed.

## 2. The size gate

`src/components/uploadLimits.js`, applied in `readFile()` before the replacement
prompt and before anything is read. 32 MiB, `.xlsx` only.

**Where the number comes from.** `MAX_BATCH_ROWS` is 20,000 and the widest contract
is RILEM B4's 21 columns, so a maximal legal upload was built and measured:

| maximal legal input | stored (no compression) | deflated (what Excel writes) |
|---|---|---|
| B4, 21 numeric columns, 20,000 rows | 11.4 MiB | 1.10 MiB |
| B4, 21 columns, CJK text, 20,000 rows | 11.7 MiB | 1.17 MiB |
| three sheets of 10,000 rows each | 16.8 MiB | 1.64 MiB |

All three sheets are inflated even though only the first is read — `unzip` cannot be
asked to stop after one entry — so the multi-sheet figure is the honest ceiling.
**It is what rules out a 16 MiB gate**: that would reject a workbook the importer is
otherwise perfectly willing to read. 32 MiB is the smallest round value above it,
with ~2× headroom on the worst measured case and ~20× on a typical file.

`.xlsx` only, deliberately. CSV is a 1:1 format with no expansion step and Papa
parses a `File` incrementally, so a ceiling there would change a path the phase was
asked to leave alone, for no gain.

## 3. What is still unbounded, and why

`read-excel-file`'s browser entry passes exactly one option to fflate:

```js
// modules/zip/unzipFromArrayBuffer.js
return unzip(new Uint8Array(input), {
  filter: function (file) { /* filterZipArchiveEntry: name ends with .xml / .xml.rels */ },
});
```

From fflate's own type definitions (`node_modules/fflate/lib/index.d.ts`):

- `AsyncUnzipOptions extends UnzipOptions`, and `UnzipOptions` has **only**
  `filter`. There is no decompressed-size, per-entry, entry-count or ratio option.
- `UnzipFileInfo` does expose `size` (compressed) and `originalSize` (declared
  uncompressed) to a filter — but `unzipFromArrayBuffer` calls the caller's filter
  with `{ path: file.name }` only, discarding both fields. They are not reachable
  from `readSheet()`.

So through this API the *only* lever is "inflate this entry or not", and it is used
by entry name. The consequences:

1. **A small upload can inflate to something enormous.** The 32 MiB gate does not
   help: the bomb is a few kilobytes. Measured on the test fixture, a 153 KB archive
   holding 975 KB of sheet XML is accepted and then refused by the row limit — the
   point being that the refusal happens *after* the inflation.
2. **Entry count is unbounded.** A ZIP with a very large number of `.xml` members
   is inflated one after another.
3. **Declared sizes are attacker-controlled** in any pre-flight check that reads
   them from the central directory, so such a check is a filter, not a guarantee.

Combined with (1), the residual risk is *denial of service on the tab that opened
the file*: unbounded memory growth up to the tab's limit, and a frozen main thread
while it happens. There is no path from this to data disclosure or code execution —
the inflated XML is handed to the platform `DOMParser` (external entities are not
resolved; asserted in `BatchCalculator.excel.test.jsx`) and then to the app's own
row validation. It is a availability risk in a client-side calculator, not a
compromise.

## 4. Options

Both are implementable — fflate exposes the hooks — but both move the unpack step
out of `readSheet()`, which is why neither is in this phase.

### Option A — pre-flight the ZIP directory (small, additive, partial)

Read the end-of-central-directory record and each entry header ourselves (~40
lines, no new dependency), sum the declared uncompressed sizes and count the `.xml`
entries, and refuse before handing anything to `read-excel-file`.

- **Buys:** a cheap rejection of a bomb whose header is honest, which is most of
  them; an entry-count ceiling, which nothing provides today.
- **Does not buy:** a guarantee. A crafted archive can declare a small size and
  inflate past it; fflate catches the mismatch, but only after expanding.
- **Compatibility:** none — the bytes handed to `readSheet()` are unchanged, so
  every existing XLSX test keeps its meaning. Needs a new test per rejection path
  plus a fixture whose header lies.

### Option B — stream the archive with a byte ceiling (reliable, larger)

Use fflate's streaming `Unzip` class (or `unzip`, which returns an
`AsyncTerminable`) and count bytes as they arrive, terminating past a ceiling.

- **Buys:** a real bound on inflation. This is the only option that produces one,
  and it also bounds entry count and can enforce a ratio.
- **Costs:** `read-excel-file` will not do this for you. Either its internal
  `parseSpreadsheetContents`/`parseSheet` modules are imported directly — an
  undocumented surface that this project has already been bitten by once, when v9
  changed the default export and every `.xlsx` upload broke — or the XLSX part
  reader is written here and the dependency is dropped from this path.
- **Compatibility analysis needed before starting:** which of the 38 bundled
  `read-excel-file` modules the app actually depends on (measured: the module graph
  in `docs/dependency-security-audit.md` §3.1 lists them) versus what a hand-written
  reader would have to reimplement — shared strings with rich-text runs, inline
  strings, the 1900/1904 epoch, date-formatted style ids, octal/hex-ish cell
  coercion, sparse rows and columns. The 21 XLSX tests in
  `BatchCalculator.excel.test.jsx` are the specification a replacement would have to
  satisfy, and they were written against the current reader's measured behaviour,
  so they are the right gate for such a change.

### Option C — move the parse off the main thread

Not a bound either, but it removes the frozen UI: the parse already has a Worker in
the batch pipeline for the *compute* step, and the read could join it. It changes
the shape of the failure (a hostile file exhausts a Worker rather than the page)
without bounding anything. Worth pairing with A or B, not instead of them.

### Recommendation

A, then B if the residual availability risk is judged worth the reader work. A is
cheap, additive, and cannot regress the parse; B is the only real fix and is a
project in its own right. C is orthogonal.

## 5. What this phase did not do

- Did not rewrite the unpack step (instruction: propose, do not implement).
- Did not add a declared-size pre-flight (Option A) — it is a real change to when
  and how a file is rejected, and it deserves its own compatibility pass.
- Did not claim the ZIP bomb is solved. The gate bounds the upload; the inflation
  is still unbounded. Anyone reading a summary of this phase should take away that
  the *known* exposure is narrower and *documented*, not closed.

## 6. Measured cost of the unbounded inflation (2026-04, this machine)

§3 said the residual risk is "denial of service on the tab that opened the file".
That sentence is now a measurement rather than an inference. Two archives were
built to the same recipe — a minimal valid workbook whose `xl/worksheets/sheet1.xml`
is one 48-byte row repeated, which is what a bomb actually exploits — and uploaded
through the real UI in headless Chrome against the production build.

| upload | compressed | inflated sheet XML | ratio | wall time | main-thread blocking | JS heap |
|---|---:|---:|---:|---:|---:|---:|
| A | 30 KiB | 10.0 MB | 326:1 | 349 ms | 303 ms (1 long task) | 2.3 → 7.9 MB |
| B | 570 KiB | 200.0 MB | 343:1 | 6,924 ms | 6,389 ms (1 long task) | 4.3 → 130.5 MB |

Both are accepted by the 32 MiB gate: they are 30 KiB and 570 KiB. The numbers are
the tab's own state, read over the DevTools Protocol (`Runtime.getHeapUsage` for the
heap, a `longtask` observer for the blocking, wall clock around the upload); the heap
shown is the peak observed before a forced GC, and after a forced GC it returns to
~2.5 MB, so this is spent CPU and transient memory rather than a leak.

Two costs scale with the inflated size, and they agree across the two sizes:

- **CPU ≈ 32 ms per MB of sheet XML** (303 ms / 10 MB, 6,389 ms / 200 MB). This is a
  single uninterrupted task, so the interface is frozen for its whole duration.
- **Peak heap ≈ 0.6 MB per MB of sheet XML** (0.56 and 0.63), i.e. roughly the
  inflated text plus a similar amount for the XML DOM.

Extrapolating to an upload the gate does accept: a 2 MiB archive at ~340:1 inflates
to ~680 MB of XML, which by these rates is **~22 s of frozen tab and ~430 MB of
peak heap**, on one core, before the 20,000-row check can refuse anything. Multiple
`.xml` parts multiply it, since `unzip` inflates every entry it is not told to skip.

The legal ceiling is a different number: §2 measured the largest *legitimate*
workbook at 16.8 MiB inflated. So an inflated-size bound of 32 MiB would leave ~2x
headroom on every legal input measured and would refuse bomb B at 0.7% of its
inflation.

## 7. An implementable bounded design (proposal, not implemented)

Option B from §4 can be built without writing an XLSX reader, which is what made it
look like "a project in its own right". The key is that the bound only has to apply
to the *bytes handed to the reader*, so the unpack can be replaced and the reader
kept:

1. **Inflate under a ceiling, entry by entry.** Use fflate's streaming `Unzip`
   class rather than the one-shot `unzip`, count bytes as they are emitted, and
   throw once the total passes `MAX_INFLATED_BYTES` (32 MiB, §6) or the entry count
   passes a small ceiling (64, since a real workbook has a handful of `.xml` parts).
   Keep `read-excel-file`'s own entry filter (`.xml` / `.xml.rels`) so images and
   fonts are still skipped. Throwing from fflate's per-entry callback is what aborts
   the inflate loop.
2. **Re-pack the accepted parts and hand *that* to `read-excel-file`.** `zipSync`
   the parts back into an archive with `level: 0`. The reader then sees the same
   entry names and byte-identical XML, so its parsing behaviour, and all 21 tests in
   `BatchCalculator.excel.test.jsx`, keep their meaning. Its own inflate becomes a
   memcpy of a size that is already bounded.
3. **Keep the 32 MiB compressed gate and the 20,000-row cap.** The gate still bounds
   `arrayBuffer()`; the row cap is still the right error for a legitimate oversized
   file. Neither is a substitute for the inflated ceiling.

What this buys: a real bound on resident bytes during the read, a real bound on
main-thread time (≈32 MiB × 32 ms/MB ≈ **1.0 s**, against 6.9 s measured for a
570 KiB upload today), and an entry-count ceiling that nothing provides now.

What it costs: one extra pass over the parts (the re-pack) whose size is bounded by
the ceiling, ~60 lines plus tests, and a rejection path that has to be visible in
the interface like the other import errors.

What it does not buy: the bound is on the *total*, so a legal-looking workbook that
inflates to just under the ceiling is still read and still costs ~1 s. And the
declared-size pre-flight (Option A, §4) remains useful on top: it is ~40 lines, needs
no new dependency, and rejects an honest bomb before any inflation, while an inflated
byte ceiling is what catches a dishonest header. Option C (do the read in the
existing batch Worker) is orthogonal and would move even the bounded 1 s off the
main thread.

The compatibility gate for step 2 is already written: the 21 XLSX tests were taken
against the current reader's measured behaviour, and they are the specification a
bounded unpack has to keep satisfying. New tests the change would need: a refusal
past the inflated ceiling, a refusal past the entry count, an archive whose declared
sizes lie, and the largest legal workbook from §2 still accepted.
