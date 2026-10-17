/**
 * XLSX regression suite for the batch importer.
 *
 * The existing XLSX coverage is one shipped sample in each direction: it proves
 * the happy path works, and nothing about the shapes a real spreadsheet takes.
 * Every case here was written against the importer's actual behaviour, measured
 * first and asserted after — the multi-sheet case in particular pins down which
 * of two defensible answers the reader gives, because "reads the first sheet"
 * and "reads the sheet whose part file is named sheet1.xml" disagree on any
 * workbook whose parts were renamed by a producer, and the second one is wrong.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Papa from 'papaparse';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import BatchCalculator from './BatchCalculator';
import { aci209Single } from '../math/creepModels';
import { bigSheet, buildXlsx, truncate, zip } from '../testUtils/xlsx';
import { MAX_XLSX_BYTES } from './uploadLimits';
import { setLocale } from '../state/appStore';

const ACI_HEADER = ['curingType', 't0', 'H', 'VS', 'slump', 'fineAggregate', 'airContent', 't'];
const ACI_ROW = ['moist', 28, 70, 100, 100, 50, 8, 365];
const ACI_ZH_HEADER = ['养护方式', '加载龄期', '相对湿度', '体积表面积比', '坍落度', '细骨料', '含气量', '龄期'];
const ACI_ZH_ROW = ['moist', 28, 70, 100, 100, 50, 8, 365];
const ACI = { curingType: 'moist', t0: 28, H: 70, VS: 100, slump: 100, fineAggregate: 50, airContent: 8, t: 365 };

let downloads;
const realCreateObjectURL = URL.createObjectURL;
const realRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
  downloads = [];
  URL.createObjectURL = (blob) => { downloads.push(blob); return 'blob:mock'; };
  URL.revokeObjectURL = () => {};
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  URL.createObjectURL = realCreateObjectURL;
  URL.revokeObjectURL = realRevokeObjectURL;
});

function fileInput(container) {
  return container.querySelector('input[type="file"]');
}

function upload(container, bytes, name) {
  const data = bytes instanceof Uint8Array ? new Uint8Array(bytes) : bytes;
  fireEvent.change(fileInput(container), { target: { files: [new File([data], name)] } });
}

function renderAci() {
  const view = render(<BatchCalculator />);
  fireEvent.change(view.container.querySelector('#batch-model'), { target: { value: 'aci209' } });
  return view;
}

function resultSections() {
  return screen.queryAllByText(/^Result matrix$/);
}

async function exportedRows() {
  fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));
  const text = await downloads[downloads.length - 1].text();
  return Papa.parse(text, { header: true, skipEmptyLines: true }).data;
}

describe('XLSX import: workbook shape', () => {
  // The sheet is picked by position in `xl/workbook.xml`, and its part comes from
  // the relationship for that sheet's `rId`. A producer that renumbered the parts
  // (or a reader that trusted `sheet1.xml` because of its name) would read the
  // other sheet, so the fixture deliberately names its parts in the opposite order.
  test('a workbook whose part names disagree with its sheet order reads the listed first sheet', async () => {
    const bytes = buildXlsx({ sheets: [
      { name: '第一个', path: 'worksheets/sheet2.xml', rows: [ACI_HEADER, ACI_ROW] },
      { name: '第二个', path: 'worksheets/sheet1.xml', rows: [ACI_HEADER, ['steam', 3, 90, 50, 200, 40, 4, 30]] },
    ] });

    const { container } = renderAci();
    upload(container, bytes, '两个工作表.xlsx');

    await waitFor(() => expect(resultSections()).toHaveLength(1));
    expect(screen.getByText(/1 rows · 1 output field/)).toBeInTheDocument();
    const [row] = await exportedRows();
    expect(Number(row.t)).toBe(365);
    // The matrix stores the kernel's output already fixed to its documented
    // precision, so the file reproduces the number on screen exactly.
    expect(row.result_phi).toBe(aci209Single(ACI).toFixed(4));
  });

  // The other half of the same rule: an empty first sheet is an empty *file*, not
  // a reason to quietly fall through to the next sheet and compute someone else's
  // data. Measured before the assertion so the message is the one users get.
  test('an empty first sheet is reported as an empty file, not as the second sheet', async () => {
    const bytes = buildXlsx({ sheets: [
      { name: '空表', rows: [] },
      { name: '数据', rows: [ACI_HEADER, ACI_ROW] },
    ] });

    const { container } = renderAci();
    upload(container, bytes, '空首表.xlsx');

    await waitFor(() => expect(screen.getByText(/File is empty/i)).toBeInTheDocument());
    expect(resultSections()).toHaveLength(0);
  });

  test('a Chinese file name and Chinese sheet names survive the import', async () => {
    const bytes = buildXlsx({ sheets: [{ name: '徐变原始数据-第1批', rows: [ACI_HEADER, ACI_ROW] }] });

    const { container } = renderAci();
    upload(container, bytes, '模型示例_批量_测试.xlsx');

    await waitFor(() => expect(resultSections()).toHaveLength(1));
    expect(screen.getByText('模型示例_批量_测试.xlsx')).toBeInTheDocument();
  });

  // A 20000-row cap that is enforced *after* the archive is inflated is still the
  // right first answer to an oversized file, but it has to hold for XLSX too —
  // the CSV path had the only test. The archive is deflated so the upload looks
  // small: this is also the closest thing to a decompression bomb that can be run
  // in a unit test without risking the runner.
  test('an XLSX past the row limit is refused, and the archive is small on the wire', async () => {
    // One column keeps the XML under a megabyte, so the case stays a behaviour
    // test rather than a benchmark; the ratio is what matters, not the size.
    const { bytes, inflatedBytes } = bigSheet(20002);
    expect(bytes.length).toBeLessThan(inflatedBytes / 4);

    const { container } = renderAci();
    upload(container, bytes, 'oversized.xlsx');

    await waitFor(() => expect(screen.getByText(/Split the file/i)).toBeInTheDocument());
    expect(resultSections()).toHaveLength(0);
  });
});

describe('XLSX import: headers and mapping', () => {
  // Chinese headers are not in the alias table, so the honest answer is the
  // mapping panel, not a guess. The rows must survive the round trip: the file is
  // still the user's work, and the panel is a question about which column is which.
  test('Chinese headers reach the mapping panel and compute once mapped', async () => {
    const bytes = buildXlsx({ sheets: [{ name: 'ACI 209', rows: [ACI_ZH_HEADER, ACI_ZH_ROW] }] });

    const { container } = renderAci();
    upload(container, bytes, '中文表头.xlsx');

    await waitFor(() => expect(screen.getByText('Column mapping')).toBeInTheDocument());
    expect(resultSections()).toHaveLength(0);

    // Nothing is suggested for these names, so the panel starts unanswered and the
    // apply button starts disabled — mapping must be the user's explicit answer.
    const selects = ACI_HEADER.map((field) => screen.getByLabelText(`Source column for ${field}`));
    for (const select of selects) expect(select).toHaveValue('');
    const apply = screen.getByRole('button', { name: /Apply mapping and calculate/i });
    expect(apply).toBeDisabled();

    selects.forEach((select, index) => fireEvent.change(select, { target: { value: ACI_ZH_HEADER[index] } }));
    fireEvent.click(apply);

    await waitFor(() => expect(resultSections()).toHaveLength(1));
    const [row] = await exportedRows();
    expect(row.result_phi).toBe(aci209Single(ACI).toFixed(4));
  });

  // The CSV path warns that a duplicated header silently keeps the last column;
  // the XLSX path built its record with `Object.fromEntries` and dropped the
  // first column without saying so. Same file, same data loss, two different
  // reports — this asserts one report for both.
  test('a duplicated XLSX header is reported the way the CSV path reports it', async () => {
    const header = [...ACI_HEADER, 't'];
    const bytes = buildXlsx({ sheets: [{ name: 'dup', rows: [header, [...ACI_ROW, 999]] }] });

    const { container } = renderAci();
    upload(container, bytes, 'duplicate-header.xlsx');

    await waitFor(() => expect(screen.getByText(/Duplicate column "t"/i)).toBeInTheDocument());
    await waitFor(() => expect(resultSections()).toHaveLength(1));
    const [row] = await exportedRows();
    // The warning says only the last one is kept, so the kept value is the last column's.
    expect(Number(row.t)).toBe(999);
  });

  // A column with no header at all is not a duplicate of anything, but the
  // synthetic `column_N` name it is given can collide with a real header. Both
  // answers are defensible; silently merging two columns is not.
  test('a blank header colliding with a synthetic name is reported', async () => {
    const header = ['curingType', 't0', 'H', 'VS', 'slump', 'fineAggregate', '', 'column_7'];
    const bytes = buildXlsx({ sheets: [{ name: 'blank', rows: [header, [...ACI_ROW.slice(0, 8)]] }] });

    const { container } = renderAci();
    upload(container, bytes, 'blank-header.xlsx');

    await waitFor(() => expect(screen.getByText(/Duplicate column "column_7"/i)).toBeInTheDocument());
  });
});

describe('XLSX import: cell values', () => {
  // Excel round-trips its numbers through a decimal text form. Anything that went
  // through `parseFloat` or a formatter on the way in would move the last bit, and
  // the whole point of the result matrix is that a row can be reproduced.
  test('numbers survive the import bit-for-bit, and match the CSV path', async () => {
    const values = [
      0.1, 1 / 3, 1e-12, 2.220446049250313e-16, 1e15,
      // More significant digits than a double carries, so the decimal that goes in
      // is not the decimal that comes out. Written as a string because a literal
      // with this many digits is a lint error — which is the point of the case.
      Number('123456789.123456789'),
      0.30000000000000004, -1e-7, Number('1.7976931348623157e308'), 0,
    ];
    const rows = values.map((value) => ['moist', 28, 70, 100, 100, 50, 8, value]);
    const bytes = buildXlsx({ sheets: [{ name: 'precision', rows: [ACI_HEADER, ...rows] }] });

    const first = renderAci();
    upload(first.container, bytes, 'precision.xlsx');
    await waitFor(() => expect(resultSections()).toHaveLength(1));
    const fromXlsx = await exportedRows();
    first.unmount();

    const csv = [ACI_HEADER.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const second = renderAci();
    upload(second.container, csv, 'precision.csv');
    await waitFor(() => expect(resultSections()).toHaveLength(1));
    const fromCsv = await exportedRows();

    expect(fromXlsx.map((row) => row.t)).toEqual(values.map(String));
    expect(fromXlsx.map((row) => row.t)).toEqual(fromCsv.map((row) => row.t));
    expect(fromXlsx.map((row) => row.result_phi)).toEqual(fromCsv.map((row) => row.result_phi));
  });

  // Blank cells, short rows and junk in a numeric column are the three shapes a
  // hand-maintained spreadsheet actually produces. None of them may take the
  // other rows down with it, and none may be computed.
  test('blank, short and non-numeric rows are reported without poisoning the valid ones', async () => {
    const bytes = buildXlsx({ sheets: [{ name: 'messy', rows: [
      ACI_HEADER,
      ACI_ROW,
      ['moist', 28, 70],                                     // short row: rest is empty
      ['moist', 28, 70, 100, 100, 50, 8, 'n/a'],             // text in a numeric column
      [null, null, null, null, null, null, null, null],      // entirely empty row
      ['moist', 28, 70, 100, 100, 50, 8, 0],                 // t = 0 is valid
    ] }] });

    const { container } = renderAci();
    upload(container, bytes, 'messy.xlsx');

    await waitFor(() => expect(resultSections()).toHaveLength(1));
    expect(screen.getByText(/4 rows · 1 output field/)).toBeInTheDocument();
    expect(screen.getByText('Rows detected').closest('[role="status"]'))
      .toHaveTextContent(/Rows detected\s*4\s*Valid\s*2\s*Issues\s*2/);

    const rows = await exportedRows();
    expect(rows[0].result_phi).toBe(aci209Single(ACI).toFixed(4));
    expect(Number(rows[3].t)).toBe(0);
  });

  // Out-of-domain values must reach the model's own validation rather than being
  // coerced into range: the ACI kernel is the authority on what it accepts.
  test('out-of-domain values are rejected by the kernel, not coerced', async () => {
    const bytes = buildXlsx({ sheets: [{ name: 'domain', rows: [
      ACI_HEADER,
      ['moist', 28, 500, 100, 100, 50, 8, 365],   // H > 100 %
      ['moist', 0.5, 70, 100, 100, 50, 8, 365],   // t0 < 1 day
      ['unsupported', 28, 70, 100, 100, 50, 8, 365],
    ] }] });

    const { container } = renderAci();
    upload(container, bytes, 'domain.xlsx');

    await waitFor(() => expect(resultSections()).toHaveLength(1));
    expect(screen.getByText('Rows detected').closest('[role="status"]'))
      .toHaveTextContent(/Rows detected\s*3\s*Valid\s*0\s*Issues\s*3/);
  });
});

describe('XLSX import: damaged and hostile archives', () => {
  test('a file that is not a zip is reported, and clears the previous dataset', async () => {
    const { container } = renderAci();
    upload(container, buildXlsx({ sheets: [{ name: 'ok', rows: [ACI_HEADER, ACI_ROW] }] }), 'good.xlsx');
    await waitFor(() => expect(resultSections()).toHaveLength(1));

    upload(container, new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01, 0x02, 0x03]), 'junk.xlsx');
    await waitFor(() => expect(screen.getByText(/Could not parse XLSX/i)).toBeInTheDocument());
    expect(resultSections()).toHaveLength(0);
  });

  test('a truncated archive is reported rather than half-read', async () => {
    const bytes = truncate(buildXlsx({ sheets: [{ name: 'ok', rows: [ACI_HEADER, ACI_ROW] }] }));

    const { container } = renderAci();
    upload(container, bytes, 'truncated.xlsx');

    await waitFor(() => expect(screen.getByText(/Could not parse XLSX/i)).toBeInTheDocument());
    expect(resultSections()).toHaveLength(0);
  });

  // The reader hands the sheet XML to the platform's DOMParser. This asserts the
  // property that matters for an XML parser fed a user's upload: an external
  // entity is not resolved. The sentinel is a file this test wrote, so a leak
  // would be visible as its contents appearing in the document.
  test('an external entity is not resolved', async () => {
    const sentinel = 'XXE-SENTINEL-DO-NOT-LEAK';
    const target = resolve(process.cwd(), 'package.json');
    expect(readFileSync(target, 'utf8')).not.toContain(sentinel);

    const sheet = '<?xml version="1.0"?>'
      + `<!DOCTYPE worksheet [<!ENTITY xxe SYSTEM "file://${target}">]>`
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
      + '<row r="1"><c r="A1" t="inlineStr"><is><t>&xxe;</t></is></c></row>'
      + '</sheetData></worksheet>';
    const bytes = zip([
      { name: 'xl/worksheets/sheet1.xml', data: sheet },
      { name: 'xl/workbook.xml', data: '<workbook><sheets><sheet name="x" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    ]);

    const { container } = renderAci();
    upload(container, bytes, 'xxe.xlsx');

    await waitFor(() => expect(screen.getByText(/Could not parse XLSX/i)).toBeInTheDocument());
    expect(document.body.textContent).not.toContain('creep-calculator');
    expect(document.body.textContent).not.toContain('"name":');
  });

  // Nested internal entities are the other half of the same class: a document
  // small enough to upload that asks the parser to expand into something huge.
  // Whatever the platform does with them, it has to finish quickly and bounded.
  test('nested internal entities do not amplify', async () => {
    const declarations = Array.from({ length: 8 }, (_, index) => (
      index === 0 ? '<!ENTITY e0 "lol">' : `<!ENTITY e${index} "${`&e${index - 1};`.repeat(10)}">`
    )).join('');
    const sheet = '<?xml version="1.0"?>'
      + `<!DOCTYPE worksheet [${declarations}]>`
      + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
      + '<row r="1"><c r="A1" t="inlineStr"><is><t>&e7;</t></is></c></row>'
      + '</sheetData></worksheet>';
    const bytes = zip([
      { name: 'xl/worksheets/sheet1.xml', data: sheet },
      { name: 'xl/workbook.xml', data: '<workbook><sheets><sheet name="x" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    ]);

    const { container } = renderAci();
    const started = Date.now();
    upload(container, bytes, 'laughs.xlsx');

    await waitFor(() => {
      expect(screen.getByText(/File is empty|Could not parse XLSX/i)).toBeInTheDocument();
    }, { timeout: 10000 });
    expect(Date.now() - started).toBeLessThan(5000);
  }, 20000);

  // A sheet whose XML is well formed but is not a worksheet: the reader builds a
  // document, finds no `sheetData`, and fails. Reported, not thrown.
  test('well-formed XML that is not a worksheet is reported', async () => {
    const bytes = buildXlsx({ sheets: [{ name: 'wrong-root', rows: [[]], rawXml: '<html><body>not a sheet</body></html>' }] });

    const { container } = renderAci();
    upload(container, bytes, 'wrong-root.xlsx');

    await waitFor(() => {
      expect(screen.getByText(/Could not parse XLSX|File is empty/i)).toBeInTheDocument();
    });
  });

  // `.xls` is the pre-2007 binary format and is not readable here. Dropping one on
  // the drop zone bypasses the input's `accept` filter, so the rejection has to be
  // real, not just an attribute.
  test('a legacy .xls upload is rejected as unsupported', async () => {
    const { container } = renderAci();
    upload(container, new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'legacy.xls');

    await waitFor(() => expect(screen.getByText(/Unsupported format/i)).toBeInTheDocument());
    expect(resultSections()).toHaveLength(0);
  });
});

describe('XLSX and CSV parity', () => {
  // The shipped-sample parity test compares one printed number. This compares the
  // two imports cell for cell across every row of a table with the awkward values
  // in it, so a divergence in either parser shows up as data, not as a format.
  test('the same table imports identically from xlsx and csv', async () => {
    const header = ACI_HEADER;
    const rows = [
      ['moist', 28, 70, 100, 100, 50, 8, 7],
      ['steam', 3, 90, 50, 200, 40, 4, 0.25],
      ['moist', 1, 100, 12.5, 0, 0, 0, 100000],
      ['steam', 36500, 0, 1e-6, 300, 100, 25, 3.141592653589793],
    ];

    const first = renderAci();
    upload(first.container, buildXlsx({ sheets: [{ name: 'parity', rows: [header, ...rows] }] }), 'parity.xlsx');
    await waitFor(() => expect(resultSections()).toHaveLength(1));
    const fromXlsx = await exportedRows();
    first.unmount();

    const second = renderAci();
    upload(second.container, [header.join(','), ...rows.map((row) => row.join(','))].join('\n'), 'parity.csv');
    await waitFor(() => expect(resultSections()).toHaveLength(1));
    const fromCsv = await exportedRows();

    expect(fromXlsx).toEqual(fromCsv);
  });
});

describe('XLSX import: input size gate', () => {
  // The gate bounds the compressed upload, not the inflation — see
  // docs/dependency-security-audit.md for why that is a real but partial
  // protection. These tests pin where the boundary sits and that the message
  // reaches the user in both languages.
  //
  // A file one byte over the limit is a `Uint8Array` of the limit plus one, not a
  // workbook: the gate runs before anything reads the file, so the contents never
  // matter here. That is the point — it is a check on the upload, not the parse.
  const oversize = new Uint8Array(MAX_XLSX_BYTES + 1);
  const atLimit = new Uint8Array(MAX_XLSX_BYTES);

  test('a file over the limit is refused with its size and the limit, and keeps the dataset', async () => {
    const { container } = renderAci();
    upload(container, buildXlsx({ sheets: [{ name: 'kept', rows: [ACI_HEADER, ACI_ROW] }] }), 'kept.xlsx');
    await waitFor(() => expect(resultSections()).toHaveLength(1));

    upload(container, oversize, 'too-big.xlsx');

    await waitFor(() => expect(screen.getByText(/above the 32 MB limit/i)).toBeInTheDocument());
    expect(screen.getByText(/File is 32\.0 MB/)).toBeInTheDocument();
    // Deliberately different from a parse failure: the file never entered the
    // pipeline, so the file that *is* loaded is still loaded, under its own name.
    expect(resultSections()).toHaveLength(1);
    expect(screen.getByText('kept.xlsx')).toBeInTheDocument();
    expect(screen.queryByText(/Could not parse XLSX/i)).not.toBeInTheDocument();
  }, 30000);

  test('a file of exactly the limit is not refused by the gate', async () => {
    const { container } = renderAci();
    upload(container, atLimit, 'exactly-limit.xlsx');

    // It gets past the gate and fails as an archive, which is a different answer.
    await waitFor(() => expect(screen.getByText(/Could not parse XLSX/i)).toBeInTheDocument());
    expect(screen.queryByText(/above the 32 MB limit/i)).not.toBeInTheDocument();
  }, 30000);

  test('the refusal is localised', async () => {
    const { container } = renderAci();
    act(() => setLocale('zh'));
    upload(container, oversize, '太大.xlsx');

    await waitFor(() => expect(screen.getByText(/超过 XLSX 的 32 MB 上限/)).toBeInTheDocument());
    expect(screen.getByText(/文件为 32\.0 MB/)).toBeInTheDocument();
  }, 30000);

  test('a CSV is never gated by the XLSX limit', async () => {
    const { container } = renderAci();
    const rows = Array.from({ length: 20001 }, (_, index) => `moist,28,70,100,100,50,8,${index}`).join('\n');
    upload(container, `${ACI_HEADER.join(',')}\n${rows}\n`, 'huge.csv');

    await waitFor(() => expect(screen.getByText(/Split the file/i)).toBeInTheDocument());
    expect(screen.queryByText(/above the 32 MB limit/i)).not.toBeInTheDocument();
  }, 60000);
});
