/**
 * A minimal `.xlsx` writer for tests.
 *
 * The batch importer's XLSX path was only ever exercised against the four
 * fixtures in `public/模型示例/`, which are all single-sheet, all-numeric and all
 * well formed — so multi-sheet workbooks, Chinese headers, blank/short rows and
 * damaged archives had no coverage at all. Building the archive here rather than
 * committing opaque binaries keeps the cases readable and reviewable, and it
 * keeps the suite free of a fixture-generation dependency: an `.xlsx` is a ZIP
 * of XML, and `node:zlib` has both the CRC and the deflate we need.
 *
 * Entries are STORED, which is valid but unusual — every real producer deflates.
 * `zip()` therefore takes `deflate: true`, and `bomb()` uses it, because the
 * interesting malformed case is a small archive that inflates to something huge.
 */
import { crc32, deflateRawSync } from 'node:zlib';

const encoder = new TextEncoder();

const bytesOf = (value) => (typeof value === 'string' ? encoder.encode(value) : value);

/** `0 -> A`, `26 -> AA`: the column naming a `.xlsx` cell reference uses. */
export function columnName(index) {
  let name = '';
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

const escapeXml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * Builds a ZIP archive.
 *
 * @param {Array<{name: string, data: string|Uint8Array}>} entries
 * @param {{deflate?: boolean}} [options]
 * @returns {Uint8Array}
 */
export function zip(entries, { deflate = false } = {}) {
  const method = deflate ? 8 : 0;
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const raw = bytesOf(entry.data);
    const body = deflate ? deflateRawSync(raw) : Buffer.from(raw);
    const crc = crc32(raw) >>> 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0x0800, 6);       // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);           // mod time
    local.writeUInt16LE(0x2821, 12);      // mod date (2000-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);           // extra length

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);         // version made by
    central.writeUInt16LE(20, 6);         // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x2821, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);         // extra
    central.writeUInt16LE(0, 32);         // comment
    central.writeUInt16LE(0, 34);         // disk
    central.writeUInt16LE(0, 36);         // internal attrs
    central.writeUInt32LE(0, 38);         // external attrs
    central.writeUInt32LE(offset, 42);

    locals.push(local, name, body);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }

  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return new Uint8Array(Buffer.concat([...locals, centralBuffer, end]));
}

/**
 * A cell value: `null`/`undefined` for an empty cell, a number, a string, or
 * `{ raw }` to splices literal XML in — the escape hatch the malformed-input
 * cases need.
 */
function cellXml(reference, value, sharedIndex) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return value.raw ?? '';
  const ref = ` r="${reference}"`;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`cannot write non-finite number ${value}`);
    return `<c${ref}><v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') return `<c${ref} t="b"><v>${value ? 1 : 0}</v></c>`;
  return `<c${ref} t="s"><v>${sharedIndex.get(value)}</v></c>`;
}

/**
 * @param {Array<Array<*>>} rows
 * @param {Map<string, number>} sharedIndex
 */
export function sheetXml(rows, sharedIndex) {
  const body = rows.map((row, rowIndex) => {
    const cells = row
      .map((value, columnIndex) => cellXml(`${columnName(columnIndex)}${rowIndex + 1}`, value, sharedIndex))
      .join('');
    return cells ? `<row r="${rowIndex + 1}">${cells}</row>` : '';
  }).join('');
  const lastRow = rows.length || 1;
  const lastColumn = columnName(Math.max(0, ...rows.map((row) => row.length - 1)));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<dimension ref="A1:${lastColumn}${lastRow}"/><sheetData>${body}</sheetData></worksheet>`;
}

/**
 * Builds a complete, well-formed workbook.
 *
 * @param {{
 *   sheets: Array<{name: string, rows: Array<Array<*>>, path?: string, rawXml?: string}>,
 *   epoch1904?: boolean,
 *   deflate?: boolean,
 * }} options
 * @returns {Uint8Array}
 */
export function buildXlsx({ sheets, epoch1904 = false, deflate = false }) {
  if (!sheets?.length) throw new Error('a workbook needs at least one sheet');

  // Strings are interned the way Excel does it: a shared string table plus
  // `t="s"` cell references. The importer has a separate code path for it.
  const sharedIndex = new Map();
  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      for (const value of row) {
        if (typeof value === 'string' && !sharedIndex.has(value)) sharedIndex.set(value, sharedIndex.size);
      }
    }
  }

  const sheetTags = sheets.map((sheet, index) => (
    `<sheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`
    + ` name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
  )).join('');

  const relationships = sheets.map((sheet, index) => (
    `<Relationship Id="rId${index + 1}"`
    + ` Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"`
    + ` Target="${sheet.path ?? `worksheets/sheet${index + 1}.xml`}"/>`
  )).join('');

  const sharedStrings = [...sharedIndex.keys()]
    .map((value) => `<si><t xml:space="preserve">${escapeXml(value)}</t></si>`)
    .join('');

  return zip([
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
        + '</Types>',
    },
    {
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + `<workbookPr date1904="${epoch1904 ? 1 : 0}"/>`
        + `<sheets>${sheetTags}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + `${relationships}`
        + `<Relationship Id="rId${sheets.length + 1}"`
        + ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings"'
        + ' Target="sharedStrings.xml"/>'
        + '</Relationships>',
    },
    { name: 'xl/sharedStrings.xml', data: sharedStrings
      ? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedIndex.size}" uniqueCount="${sharedIndex.size}">${sharedStrings}</sst>`
      : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"/>' },
    // The entry name follows `path`, not the sheet's position: the multi-sheet
    // cases need a workbook whose part names disagree with its sheet order, so
    // that a reader trusting filenames is caught reading the wrong sheet.
    ...sheets.map((sheet, index) => ({
      name: `xl/${sheet.path ?? `worksheets/sheet${index + 1}.xml`}`,
      data: sheet.rawXml ?? sheetXml(sheet.rows, sharedIndex),
    })),
  ], { deflate });
}

/**
 * A deflated sheet holding `rows` numbered rows.
 *
 * Deflated on purpose: the archive stays a few dozen kilobytes while the XML
 * inflates past the importer's row limit, so this also stands in for the
 * decompression-bomb shape — a small upload whose contents are not small. Row
 * references have to be real, because the importer reconstructs the sheet
 * dimensions from them and would otherwise flatten every row onto row 1.
 *
 * @returns {{bytes: Uint8Array, inflatedBytes: number}} the archive, and the
 *   size of the sheet XML it holds — the two are the point of the comparison.
 */
export function bigSheet(rows, { columns = 1 } = {}) {
  const body = new Array(rows);
  for (let index = 0; index < rows; index += 1) {
    const row = index + 1;
    let cells = '';
    for (let column = 0; column < columns; column += 1) {
      cells += `<c r="${columnName(column)}${row}"><v>${index % 9000}</v></c>`;
    }
    body[index] = `<row r="${row}">${cells}</row>`;
  }
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<dimension ref="A1:${columnName(columns - 1)}${rows}"/><sheetData>${body.join('')}</sheetData></worksheet>`;
  return {
    bytes: buildXlsx({ sheets: [{ name: 'big', rows: [], rawXml: xml }], deflate: true }),
    inflatedBytes: encoder.encode(xml).length,
  };
}

/** Truncates bytes mid-archive, the shape of a download that stopped early. */
export function truncate(bytes, ratio = 0.6) {
  return new Uint8Array(bytes.slice(0, Math.floor(bytes.length * ratio)));
}
