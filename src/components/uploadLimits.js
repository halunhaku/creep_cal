/**
 * Input size gates for the dataset upload.
 *
 * The batch workspace reads a `.xlsx` by inflating a ZIP and parsing the XML
 * inside it. Nothing in that chain bounds the result: `read-excel-file` hands the
 * whole archive to fflate and offers no option for a decompressed-size, per-entry
 * or entry-count ceiling, so a two-kilobyte upload can inflate to gigabytes before
 * the 20,000-row check ever runs. That check is real, but it happens *after* the
 * memory has been spent.
 *
 * Gating the compressed size is therefore not a solution to that — see the
 * residual risk in docs/dependency-security-audit.md, which says so explicitly.
 * What it does do is bound the two things that are boundable from here: the
 * `arrayBuffer()` read and the size of the archive handed to the inflater, so a
 * mistaken or careless upload cannot exhaust memory on its own. It does not stop a
 * crafted one.
 *
 * Only `.xlsx` is gated. CSV is a 1:1 format with no expansion step and Papa
 * parses a `File` incrementally, so a size ceiling there would be a behaviour
 * change with nothing behind it.
 */

/**
 * 32 MiB.
 *
 * Derived from the largest input the workspace accepts rather than picked for
 * looking round. `MAX_BATCH_ROWS` is 20,000 and the widest contract is RILEM B4's
 * 21 columns, so a maximal legal upload was measured at the 20,000-row limit:
 *
 *   - B4, 21 numeric columns, uncompressed ZIP entries: 11.4 MiB
 *   - B4, 21 columns with Chinese text, uncompressed entries: 11.7 MiB
 *   - three sheets of 10,000 rows each, uncompressed entries: 16.8 MiB
 *
 * The same workbooks deflated — what a real spreadsheet program writes — come to
 * 1.1–1.6 MiB, so the multi-sheet figure is the honest ceiling, and it is what
 * rules out a 16 MiB gate. 32 MiB is the smallest round value that accepts every
 * legal input measured, with roughly 2x headroom on the worst of them and 20x on a
 * typical file, which leaves room for the formatting and embedded images real
 * workbooks carry.
 *
 * Note that all three sheets are inflated even though only the first is read:
 * `unzip` has no way to stop after one entry.
 */
export const MAX_XLSX_BYTES = 32 * 1024 * 1024;

/** Bytes as a number of MiB, for a message that reads in human units. */
export function megabytes(bytes) {
  const value = Number(bytes);
  return Number.isFinite(value) ? value / (1024 * 1024) : 0;
}

/**
 * Should this upload be refused before anything reads it?
 *
 * `>` and not `>=`: a file of exactly the limit is accepted. That is the boundary
 * a test pins down, because an off-by-one here is invisible until someone uploads
 * a file that sits exactly on the limit.
 *
 * @param {string} name the file name, which is what decides the format
 * @param {number} size bytes
 */
export function isOversizedXlsx(name, size) {
  return /\.xlsx$/i.test(String(name ?? '')) && Number(size) > MAX_XLSX_BYTES;
}
