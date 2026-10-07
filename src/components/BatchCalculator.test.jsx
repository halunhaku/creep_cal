import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import Papa from 'papaparse';
import BatchCalculator from './BatchCalculator';
import { MODELS } from './batchModels';
import { getState, updateBatch } from '../state/appStore';
import { aashtoSingle, aci209Single, b4Single, b4sSingle, gl2000Single, mc2010Single } from '../math/creepModels';

const B4_REQUIRED = 't0, tPrime, Tcur, Tsh, Tc, h, fc, vS, c, wC, aC, cementType, aggregateType, specimenShape, retarder, flyAsh, superplasticizer, silicaFume, airEntrainingAgent, waterReducer, t'.split(', ');
const ACI_REQUIRED = 'curingType, t0, H, VS, slump, fineAggregate, airContent, t'.split(', ');

function fileInput(container) {
  return container.querySelector('input[type="file"]');
}

function upload(container, content, name) {
  fireEvent.change(fileInput(container), { target: { files: [new File([content], name)] } });
}

function selectModel(container, id) {
  fireEvent.change(container.querySelector('#batch-model'), { target: { value: id } });
}

function resultSections() {
  return screen.queryAllByText(/^Result matrix$/);
}

describe('BatchCalculator dataset pipeline', () => {
  test('CSV upload validates, calculates and reports a valid count', async () => {
    const { container } = render(<BatchCalculator />);
    upload(container, `t0,tPrime,Tcur,Tsh,Tc,h,fc,vS,c,wC,aC,cementType,aggregateType,specimenShape,retarder,flyAsh,superplasticizer,silicaFume,airEntrainingAgent,waterReducer,t\n28,28,20,20,20,50,27.6,19.05,219.3,0.6,7,R,No Information,1,0,0,0,0,0,0,112\n`, 'b4.csv');
    await waitFor(() => expect(resultSections()).toHaveLength(1));
    expect(screen.getByText(/1 rows · 4 output fields/)).toBeInTheDocument();
    expect(screen.queryByText(/Could not parse/)).not.toBeInTheDocument();
  });

  // Regression: the row counts appear only once a file has been parsed, and there
  // was no live region, so a screen reader user got no signal that anything had
  // happened after choosing a file.
  test('the row counts are announced when they appear', async () => {
    const { container } = render(<BatchCalculator />);
    upload(container, `t0,tPrime,Tcur,Tsh,Tc,h,fc,vS,c,wC,aC,cementType,aggregateType,specimenShape,retarder,flyAsh,superplasticizer,silicaFume,airEntrainingAgent,waterReducer,t\n28,28,20,20,20,50,27.6,19.05,219.3,0.6,7,R,No Information,1,0,0,0,0,0,0,112\n`, 'b4.csv');

    await waitFor(() => expect(resultSections()).toHaveLength(1));
    const summary = screen.getByText('Rows detected').closest('[role="status"]');
    expect(summary).not.toBeNull();
    expect(summary).toHaveTextContent(/Rows detected\s*1\s*Valid\s*1\s*Issues\s*0/);
  });

  // Regression: a file whose headers did not match the contract exactly was a
  // dead end — "Missing required columns" and nothing to do about it. The parsed
  // rows are now kept and the user answers which column holds each field.
  test('a file with unfamiliar headers is a question, not a dead end', async () => {
    const { container } = render(<BatchCalculator />);
    // ACI's contract wants H, t0, VS, slump, fineAggregate, airContent, t, curingType.
    // Select it explicitly: the batch defaults to the B4 contract, whose fields are
    // different (h rather than H), and the label match below is case-sensitive.
    selectModel(container, 'aci209');
    upload(container, `curingType,age,Humidity,volume_surface,slump,sand,air,t\n1,28,70,100,100,50,8,365\n`, 'own-names.csv');

    await waitFor(() => expect(screen.getByText('Column mapping')).toBeInTheDocument());
    // The suggestion is pre-filled from the aliases, so the common case is one click.
    expect(screen.getByLabelText('Source column for H')).toHaveValue('Humidity');
    expect(screen.getByLabelText('Source column for t0')).toHaveValue('');
    expect(screen.getByRole('button', { name: /apply mapping and calculate/i })).toBeDisabled();

    // Answer the one the aliases could not, then calculate.
    fireEvent.change(screen.getByLabelText('Source column for t0'), { target: { value: 'age' } });
    expect(screen.getByLabelText('Source column for t0')).toHaveValue('age');
    fireEvent.click(screen.getByRole('button', { name: /apply mapping and calculate/i }));

    await waitFor(() => expect(resultSections()).toHaveLength(1));
    expect(screen.getByText(/1 rows · 1 output field/)).toBeInTheDocument();
    expect(screen.queryByText('Column mapping')).not.toBeInTheDocument();
  });

  // Regression (audit P2-1): switching model cleared the dataset unconditionally,
  // so trying another model destroyed the file you had just uploaded.
  test('switching model keeps the dataset and recomputes it', async () => {
    const { container } = render(<BatchCalculator />);
    // The shipped B4 sweep, then switch to B4s, which shares its input contract.
    fireEvent.click(screen.getByRole('button', { name: /load demo sweep/i }));
    await waitFor(() => expect(resultSections()).toHaveLength(1));
    expect(screen.getByText(/9 rows · 4 output fields/)).toBeInTheDocument();

    selectModel(container, 'b4s');
    await waitFor(() => expect(resultSections()).toHaveLength(1));
    expect(screen.getByText(/9 rows · 4 output fields/)).toBeInTheDocument();
    // The rows are still the user's: same count, still valid.
    expect(screen.getByText('Rows detected').closest('[role="status"]')).toHaveTextContent(/Rows detected\s*9\s*Valid\s*9/);
  });

  /*
   * Regression: the pending mapping was never cleared once rows existed. After a
   * complete file was uploaded, the panel still claimed columns were missing, and
   * its "Apply mapping and calculate" recomputed the *previous* file's rows under
   * the new file's name — measured: a 2-row complete.csv produced the old
   * single-row dataset (row cells ["1","1","100","365","28","70",…]).
   */
  test('a complete upload clears a mapping panel left by an earlier file', async () => {
    const { container } = render(<BatchCalculator />);
    selectModel(container, 'aci209');
    upload(container, 'curingType,age,Humidity,volume_surface,slump,sand,air,t\n1,28,70,100,100,50,8,365\n', 'own-names.csv');
    await waitFor(() => expect(screen.getByText('Column mapping')).toBeInTheDocument());

    upload(container, `${ACI_REQUIRED.join(',')}\nmoist,28,70,100,100,50,8,365\nmoist,28,80,100,100,50,8,730\n`, 'complete.csv');
    await waitFor(() => expect(resultSections()).toHaveLength(1));
    expect(screen.getByText(/2 rows · 1 output field/)).toBeInTheDocument();

    // The panel and the rows behind it belong to the file that was replaced.
    expect(screen.queryByText('Column mapping')).not.toBeInTheDocument();
    expect(getState().batch.pendingRows).toHaveLength(0);
    expect(getState().batch.mapping).toHaveLength(0);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  test('loading the demo sweep clears a mapping panel too', async () => {
    const { container } = render(<BatchCalculator />);
    upload(container, 't0,tPrime,t\n28,28,112\n', 'wrong-columns.csv');
    await waitFor(() => expect(screen.getByText('Column mapping')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /load demo sweep/i }));
    await waitFor(() => expect(resultSections()).toHaveLength(1));
    expect(screen.queryByText('Column mapping')).not.toBeInTheDocument();
    expect(getState().batch.mapping).toHaveLength(0);
  });

  test('an unsupported file does not leave the previous file\'s mapping standing', async () => {
    const { container } = render(<BatchCalculator />);
    upload(container, 't0,tPrime,t\n28,28,112\n', 'wrong-columns.csv');
    await waitFor(() => expect(screen.getByText('Column mapping')).toBeInTheDocument());

    upload(container, 'not a table', 'notes.txt');
    await waitFor(() => expect(screen.getByText(/Unsupported format/i)).toBeInTheDocument());
    expect(screen.queryByText('Column mapping')).not.toBeInTheDocument();
    expect(getState().batch.pendingRows).toHaveLength(0);
  });

  test('switching to a model the file does satisfy clears the panel', async () => {
    const { container } = render(<BatchCalculator />);
    // B4 needs c/wC/aC and the admixtures; this file has none of them.
    upload(container, 't0,tPrime,Tcur,Tsh,Tc,h,fc,vS,cementType,aggregateType,specimenShape,t\n28,28,20,20,20,50,27.6,19.05,R,No Information,1,112\n', 'lean.csv');
    await waitFor(() => expect(screen.getByText('Column mapping')).toBeInTheDocument());

    // B4s shares the columns this file does have.
    selectModel(container, 'b4s');
    await waitFor(() => expect(resultSections()).toHaveLength(1));
    expect(screen.getByText(/1 rows · 4 output fields/)).toBeInTheDocument();
    expect(screen.queryByText('Column mapping')).not.toBeInTheDocument();
    expect(getState().batch.mapping).toHaveLength(0);
  });

  // Regression: the parse callback captured the model selected when the file was
  // chosen, so switching during a parse computed B4 rows under an ACI heading —
  // every result cell read "—" while the rows still counted as Valid.
  test('a parse that lands after a model switch computes with the model on screen', async () => {
    const { container } = render(<BatchCalculator />);
    const wide = [
      'curingType,t0,H,VS,slump,fineAggregate,airContent,tPrime,Tcur,Tsh,Tc,h,fc,vS,c,wC,aC,cementType,aggregateType,specimenShape,retarder,flyAsh,superplasticizer,silicaFume,airEntrainingAgent,waterReducer,t',
      'moist,28,70,100,100,50,8,28,20,20,20,50,27.6,19.05,219.3,0.6,7,R,No Information,1,0,0,0,0,0,0,365',
    ].join('\n');
    upload(container, wide, 'wide.csv');
    // Same tick: the file is still parsing.
    selectModel(container, 'aci209');

    await waitFor(() => expect(resultSections()).toHaveLength(1));
    expect(getState().batch.modelId).toBe('aci209');
    expect(getState().batch.rows[0]).toHaveProperty('result_phi');
    expect(getState().batch.rows[0]).not.toHaveProperty('result_J_GPa');
    expect(getState().batch.yKey).toBe('result_phi');
    expect(screen.getByText(/1 rows · 1 output field/)).toBeInTheDocument();
  });

  // Regression: numericColumn ran inside every header and body cell, re-reading a
  // whole column each time — 40,500 row reads for a 400-row file, and ~0.8 s to
  // redraw a 20,000-row matrix that shows 100 rows.
  test('the matrix does not re-scan the whole dataset for every cell', async () => {
    let reads = 0;
    const rows = Array.from({ length: 400 }, (_, index) => {
      const row = { __status: 'valid' };
      for (const [key, value] of Object.entries({ fc: 27.6, vS: 19.05, t: index, result_J_GPa: 0.16 })) {
        Object.defineProperty(row, key, { enumerable: true, get() { reads += 1; return value; } });
      }
      return row;
    });
    updateBatch({
      modelId: 'b4', rows, headers: ['fc', 'vS', 't'], issues: [],
      fileName: 'big.csv', xKey: 't', yKey: 'result_J_GPa', pendingRows: [], mapping: [],
    });

    render(<BatchCalculator />);
    expect(screen.getByText(/Result matrix/)).toBeInTheDocument();
    expect(screen.getByText(/400 rows · 4 output fields/)).toBeInTheDocument();
    expect(reads).toBeLessThan(5000);
  });

  test('the previous model\'s output columns are dropped, not carried over', async () => {    const { container } = render(<BatchCalculator />);
    fireEvent.click(screen.getByRole('button', { name: /load demo sweep/i }));
    await waitFor(() => expect(resultSections()).toHaveLength(1));
    const before = screen.getByText(/9 rows · 4 output fields/);
    expect(before).toBeInTheDocument();

    // B4's inputs cannot satisfy ACI's contract, so the switch asks for the
    // missing columns rather than showing B4's outputs beside ACI's — and it does
    // not silently drop the file either.
    selectModel(container, 'aci209');
    await waitFor(() => expect(screen.getByText('Column mapping')).toBeInTheDocument());
    expect(resultSections()).toHaveLength(0);
    expect(screen.queryByText(/result_J_GPa/)).not.toBeInTheDocument();
    // The file is still here, waiting to be mapped: nine of ACI's columns are not
    // in a B4 sweep, and the rows were not thrown away.
    const { mapping, pendingRows } = getState().batch;
    // B4's sweep already carries t0 and t; these six are the ones ACI needs and it
    // does not have. The rows themselves are all still here.
    expect(mapping.map((entry) => entry.field).sort()).toEqual(['H', 'VS', 'airContent', 'curingType', 'fineAggregate', 'slump']);
    expect(pendingRows).toHaveLength(9);
    expect(pendingRows[0]).toHaveProperty('t0');
    expect(pendingRows[0]).not.toHaveProperty('result_J_GPa');
  });

  // The point of the matrix is comparing magnitudes by eye, which needs the
  // numbers to line up. Which columns are numeric is read from the data.
  test('numeric columns are right-aligned, categorical ones are not', async () => {
    const { container } = render(<BatchCalculator />);
    upload(container, `t0,tPrime,Tcur,Tsh,Tc,h,fc,vS,c,wC,aC,cementType,aggregateType,specimenShape,retarder,flyAsh,superplasticizer,silicaFume,airEntrainingAgent,waterReducer,note,t\n28,28,20,20,20,50,27.6,19.05,219.3,0.6,7,R,No Information,1,0,0,0,0,0,0, ,112\n`, 'b4.csv');
    await waitFor(() => expect(resultSections()).toHaveLength(1));

    const headerCells = [...container.querySelectorAll('thead th')];
    const cellFor = (label) => headerCells.find((cell) => cell.textContent.trim().toLowerCase() === label);
    expect(cellFor('fc').className).toContain('text-right');
    expect(cellFor('cementtype').className).not.toContain('text-right');
    // A column of whitespace is not a column of numbers: Number(' ') is 0.
    expect(cellFor('note').className).not.toContain('text-right');

    const firstRow = [...container.querySelectorAll('tbody tr')][0];
    const cells = [...firstRow.querySelectorAll('td')];
    // Column order is #, then the file's columns.
    const byHeader = (label) => cells[headerCells.findIndex((cell) => cell.textContent.trim().toLowerCase() === label)];
    expect(byHeader('fc').className).toContain('text-right');
    expect(byHeader('cementtype').className).not.toContain('text-right');
    expect(byHeader('note').className).not.toContain('text-right');
  });

  // Regression: the batch computed with the reference kernels while the header
  // badge said the WASM kernel was active, and nothing in this workspace said
  // which kernel produced the numbers.
  test('the workspace states which kernel computes the rows', () => {
    render(<BatchCalculator />);
    expect(screen.getByText('JavaScript reference kernel')).toBeInTheDocument();
    expect(screen.getByText(/Rust kernel exposes batch entry points for ACI 209 and MC 2010 only/)).toBeInTheDocument();
  });

  // Regression: read-excel-file v9 changed its default export from "rows" to
  // "[{ sheet, data }]", so `(await readXlsxFile(file)).map(...)` threw
  // "TypeError: (headerRow || []).map is not a function" for every .xlsx file,
  // including the four samples shipped in public/模型示例/.
  test('XLSX upload works, including the shipped samples', async () => {
    const { container } = render(<BatchCalculator />);
    const bytes = readFileSync(resolve(process.cwd(), 'public/模型示例/B4示例.xlsx'));
    fireEvent.change(fileInput(container), { target: { files: [new File([bytes], 'B4示例.xlsx')] } });
    await waitFor(() => expect(resultSections()).toHaveLength(1));
    expect(screen.getByText(/5 rows · 4 output fields/)).toBeInTheDocument();
    expect(screen.queryByText(/Could not parse XLSX/)).not.toBeInTheDocument();
  });

  test('the XLSX path and the CSV path agree', async () => {
    const csv = readFileSync(resolve(process.cwd(), 'public/模型示例/B4示例.csv'), 'utf8');
    const xlsxBytes = readFileSync(resolve(process.cwd(), 'public/模型示例/B4示例.xlsx'));

    const first = render(<BatchCalculator />);
    upload(first.container, csv, 'B4示例.csv');
    await waitFor(() => expect(resultSections()).toHaveLength(1));
    const fromCsv = screen.getAllByText(/0\.16954/)[0].textContent;   // result_J_GPa for the RILEM §1.9 case

    first.unmount();
    const second = render(<BatchCalculator />);
    fireEvent.change(fileInput(second.container), { target: { files: [new File([xlsxBytes], 'B4示例.xlsx')] } });
    await waitFor(() => expect(resultSections()).toHaveLength(1));
    const fromXlsx = screen.getAllByText(/0\.16954/)[0].textContent;

    expect(fromXlsx).toBe(fromCsv);
  });

  // Regression: the empty-file branch returned early without clearing the
  // previous dataset, so failed uploads left stale results on screen under the
  // new file name.
  test('a failed upload clears the previous results', async () => {
    const { container } = render(<BatchCalculator />);
    fireEvent.click(screen.getByRole('button', { name: /Load demo sweep/i }));
    await waitFor(() => expect(resultSections()).toHaveLength(1));
    expect(screen.getByText(/9 rows · 4 output fields/)).toBeInTheDocument();

    upload(container, `${B4_REQUIRED.join(',')}\n`, 'empty.csv');
    await waitFor(() => expect(screen.getByText(/File is empty/i)).toBeInTheDocument());
    await waitFor(() => expect(resultSections()).toHaveLength(0));
    expect(container.querySelectorAll('tbody tr')).toHaveLength(0);
  });

  // Regression: B4/B4s coerced cells with `Number`, so a blank humidity cell became
  // 0 % RH and a thousands separator turned 1,200 days into 1 — both computed and
  // both counted as Valid, while ACI/MC2010 reported the identical row.
  test('a cell that is not a number is an issue, not a silent extreme', async () => {
    const { container } = render(<BatchCalculator />);
    upload(container, [
      B4_REQUIRED.join(','),
      '28,28,20,20,20,,27.6,19.05,219.3,0.6,7,R,No Information,1,0,0,0,0,0,0,112',   // h blank -> was 0 % RH
      '28,28,20,20,20,50,27.6,19.05,219.3,0.6,7,R,No Information,1,0,0,0,0,0,0,"1,200"', // t = 1,200 -> was day 1
      '28,28,20,20,20,50,27.6,19.05,219.3,0.6,7,R,No Information,1,0,0,0,0,0,0,112',   // valid
    ].join('\n'), 'bad-cells.csv');

    await waitFor(() => expect(resultSections()).toHaveLength(1));
    const state = getState().batch;
    expect(state.rows.map((row) => row.__status)).toEqual(['invalid', 'invalid', 'valid']);
    expect(state.issues.some((issue) => /relative humidity/.test(issue.message))).toBe(true);
    expect(state.issues.some((issue) => /concrete age/.test(issue.message))).toBe(true);
    // The matrix still shows the cell the user typed, so the issue can be traced.
    // Invalid cells render as editable inputs, so the fix happens here rather
    // than in a re-uploaded file: correcting t turns the row valid in place.
    expect(screen.getByDisplayValue('1,200')).toBeInTheDocument();
    const tCell = screen.getByLabelText('Row 2 t');
    fireEvent.change(tCell, { target: { value: '1200' } });
    fireEvent.blur(tCell);
    await waitFor(() => expect(getState().batch.rows[1].__status).toBe('valid'));
  });

  test('a file with missing columns clears the previous results too', async () => {
    const { container } = render(<BatchCalculator />);
    fireEvent.click(screen.getByRole('button', { name: /Load demo sweep/i }));
    await waitFor(() => expect(resultSections()).toHaveLength(1));

    upload(container, 't0,tPrime,t\n28,28,112\n', 'wrong-columns.csv');
    await waitFor(() => expect(screen.getByText(/Missing required columns/i)).toBeInTheDocument());
    expect(resultSections()).toHaveLength(0);
  });

  // Regression: computeRow() wrote the literal string "NaN" into the result
  // matrix and still marked the row valid, so broken input was exported as data.
  test('rows that cannot be evaluated are reported as issues, not as NaN results', async () => {
    const { container } = render(<BatchCalculator />);
    selectModel(container, 'aci209');
    upload(container, [
      ACI_REQUIRED.join(','),
      'moist,28,500,100,100,50,8,365',   // H = 500 % used to return phi = -3.0578
      'moist,28,abc,100,100,50,8,365',   // non-numeric used to produce the string "NaN"
      'moist,28,70,100,100,50,8,365',    // valid
    ].join('\n'), 'aci.csv');

    await waitFor(() => expect(resultSections()).toHaveLength(1));
    expect(document.body.textContent).not.toContain('NaN');
    expect(document.body.textContent).not.toMatch(/-3\.05/);
    expect(screen.getAllByText(/0 ≤ H ≤ 100%/).length).toBeGreaterThan(0);
    expect(screen.getByText(/3 rows · 1 output fields/)).toBeInTheDocument();
  });

  test('every model loads its in-app sample without invalid rows', async () => {
    for (const id of ['aci209', 'mc2010', 'b4', 'b4s', 'gl2000', 'aashto']) {
      const { container, unmount } = render(<BatchCalculator />);
      selectModel(container, id);
      fireEvent.click(screen.getByRole('button', { name: /Load demo sweep/i }));
      await waitFor(() => expect(resultSections()).toHaveLength(1));
      const invalid = Array.from(container.querySelectorAll('tbody tr')).filter((row) => row.className.includes('error'));
      expect(invalid).toHaveLength(0);
      unmount();
    }
  });

  test('downloaded templates carry exactly the required columns', async () => {
    const created = [];
    const realCreate = URL.createObjectURL;
    URL.createObjectURL = (blob) => { created.push(blob); return 'blob:mock'; };
    URL.revokeObjectURL = () => {};
    try {
      const { container } = render(<BatchCalculator />);
      selectModel(container, 'b4');
      fireEvent.click(screen.getByRole('button', { name: /Download template/i }));
      const text = await created[0].text();
      expect(text.split(/\r?\n/)[0].split(',')).toEqual(B4_REQUIRED);   // Papa.unparse emits CRLF
    } finally {
      URL.createObjectURL = realCreate;
    }
  });
});

describe('shipped sample datasets', () => {
  const SAMPLES = [
    { id: 'aci209', file: 'aci209示例.csv', run: aci209Single },
    { id: 'mc2010', file: 'mc2010示例.csv', run: mc2010Single },
    { id: 'b4', file: 'B4示例.csv', run: b4Single },
    { id: 'b4s', file: 'B4s示例.csv', run: b4sSingle },
    { id: 'gl2000', file: 'GL2000示例.csv', run: gl2000Single },
    { id: 'aashto', file: 'AASHTO示例.csv', run: aashtoSingle },
  ];

  test.each(SAMPLES)('$file header matches the schema and every row is in range', ({ file, run }) => {
    const text = readFileSync(resolve(process.cwd(), 'public/模型示例', file), 'utf8');
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    expect(parsed.errors).toHaveLength(0);
    const headers = Object.keys(parsed.data[0]);
    const model = MODELS.find((item) => item.sampleFiles.includes(file));
    expect(headers).toEqual(model.req.split(', '));
    for (const row of parsed.data) {
      expect(() => run(row)).not.toThrow();
    }
  });
});
