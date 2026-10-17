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
