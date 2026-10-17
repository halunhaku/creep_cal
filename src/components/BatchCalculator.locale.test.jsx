import { cloneElement } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import Papa from 'papaparse';
import { Brush, Scatter, XAxis, YAxis } from 'recharts';
import BatchCalculator from './BatchCalculator';
import App from '../App';
import { computeRow, computeRowsChunk } from './batchCompute';
import { MODELS } from './batchModels';
import { isBatchWorkerAvailable, runBatchInWorker } from './batchWorkerClient';
import { getState, setLocale, updateBatch } from '../state/appStore';
import { initUrlSync } from '../state/urlSync';

// Exercise the tooltip and axis formatter props without depending on jsdom SVG
// layout. Existing pipeline/chart tests still use the real Recharts components.
vi.mock('recharts', () => {
  const Chart = ({ children }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Chart, ScatterChart: Chart, LineChart: Chart,
    Line: () => null, CartesianGrid: () => null,
    XAxis: vi.fn(() => null), YAxis: vi.fn(() => null),
    Brush: vi.fn(() => null), Scatter: vi.fn(() => null),
    Tooltip: ({ content }) => cloneElement(content, {
      active: true,
      payload: [{ payload: { row: 1234, x: 12345.678912, y: -0.1234567 } }],
    }),
  };
});
vi.mock('./batchWorkerClient', () => ({
  isBatchWorkerAvailable: vi.fn(() => false),
  runBatchInWorker: vi.fn(),
}));

const ACI_HEADER = 'curingType,t0,H,VS,slump,fineAggregate,airContent,t';
const validRow = { curingType: 'moist', t0: '28', H: '70', VS: '100', slump: '100', fineAggregate: '50', airContent: '8', t: '12345.6789' };
const csv = (row = validRow) => `${ACI_HEADER}\n${Object.values(row).join(',')}\n`;
const upload = (container, content, name = 'inputs.csv') => fireEvent.change(container.querySelector('input[type="file"]'), {
  target: { files: [new File([content], name)] },
});
const selectModel = (container, model) => fireEvent.change(container.querySelector('#batch-model'), { target: { value: model } });
const changeLocale = (locale) => act(() => setLocale(locale));
const matrix = () => screen.getByRole('region', { name: /result matrix|结果矩阵/ });
const resultsReady = () => waitFor(() => expect(getState().batch.rows.length).toBeGreaterThan(0));
const seed = (row = validRow) => updateBatch({
  modelId: 'aci209', rows: [{ ...row, ...computeRow('aci209', row), __status: 'valid' }],
  headers: Object.keys(row), fileName: 'original.csv', xKey: 't', yKey: 'result_phi',
});

let stopUrlSync;
beforeEach(() => {
  vi.clearAllMocks();
  isBatchWorkerAvailable.mockReturnValue(false);
});
afterEach(() => {
  stopUrlSync?.();
  stopUrlSync = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('batch locale is a display concern', () => {
  test('the real header control switches both ways without remounting the batch or changing its data/view', async () => {
    seed();
    window.history.replaceState(null, '', '/?mode=batch&lang=en');
    render(<App />);
    await screen.findByRole('heading', { name: 'Dataset pipeline' });
    fireEvent.click(screen.getByRole('button', { name: 'Line', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Linear X', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Linear Y', exact: true }));
    const before = getState().batch;
    const region = matrix();

    fireEvent.click(document.querySelector('button[lang]'));
    expect(await screen.findByRole('heading', { name: '数据集计算流程' })).toBeInTheDocument();
    expect(getState().batch).toBe(before);
    expect(matrix()).toBe(region);
    expect(screen.getByRole('button', { name: 'X 轴对数' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Y 轴对数' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '导出 CSV' })).toBeInTheDocument();
    expect(screen.getByText('φ（徐变系数）', { selector: 'th' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('zh-CN');

    fireEvent.click(document.querySelector('button[lang]'));
    await screen.findByRole('heading', { name: 'Dataset pipeline' });
    expect(getState().batch).toBe(before);
    expect(matrix()).toBe(region);
    expect(screen.getByRole('button', { name: 'Log X' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Log Y' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('uncommitted invalid-cell drafts survive language changes and are parsed unchanged on blur', async () => {
    const { container } = render(<BatchCalculator />);
    upload(container, csv({ ...validRow, H: 'bad' }));
    await resultsReady();
    const input = screen.getByLabelText('Row 1 H');
    fireEvent.change(input, { target: { value: '65.25' } });
    const before = getState().batch;
    changeLocale('zh');
    expect(screen.getByLabelText('第 1 行 H')).toBe(input);
    expect(input).toHaveValue('65.25');
    expect(getState().batch).toBe(before);
    expect(screen.getByText('ACI 209R-92 要求 0 ≤ H ≤ 100%。')).toBeInTheDocument();
    fireEvent.blur(input);
    expect(getState().batch.rows[0]).toMatchObject({ H: '65.25', __status: 'valid', ...computeRow('aci209', { ...validRow, H: '65.25' }) });
    expect(getState().batch.issues).toEqual([]);
    changeLocale('en');
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
  });

  test('a mapping choice, pending source data and missing-column diagnostics translate in place', async () => {
    const { container } = render(<BatchCalculator />);
    upload(container, 'curingType,age,Humidity,VS,slump,fineAggregate,airContent,t\nmoist,28,70,100,100,50,8,365\n');
    await screen.findByText('Column mapping');
    fireEvent.change(screen.getByLabelText('Source column for t0'), { target: { value: 'age' } });
    const before = getState().batch;
    const input = screen.getByLabelText('Source column for t0');
    changeLocale('zh');
    expect(screen.getByText('列映射')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('缺少必填列：t0, H');
    expect(screen.getByLabelText('t0 的来源列')).toBe(input);
    expect(input).toHaveValue('age');
    expect(getState().batch).toBe(before);
    changeLocale('en');
    expect(screen.getByRole('alert')).toHaveTextContent('Missing required columns: t0, H');
    fireEvent.click(screen.getByRole('button', { name: 'Apply mapping and calculate' }));
    await resultsReady();
    expect(getState().batch.rows[0]).toMatchObject({ t0: '28', H: '70', __status: 'valid' });
  });

  test('an existing parse error is translated rather than captured in its original language', async () => {
    const { container } = render(<BatchCalculator />);
    upload(container, 'not a spreadsheet', 'notes.txt');
    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported format. Use CSV or XLSX.');
    const before = getState().batch;
    changeLocale('zh');
    expect(screen.getByRole('alert')).toHaveTextContent('不支持此格式，请使用 CSV 或 XLSX。');
    expect(getState().batch).toBe(before);
    changeLocale('en');
    expect(screen.getByRole('alert')).toHaveTextContent('Unsupported format. Use CSV or XLSX.');
  });

  test('localized matrix, tooltip, axes and brush keep exact raw values and byte-identical CSV', () => {
    seed();
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:batch');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const NativeNumberFormat = Intl.NumberFormat;
    // A native constructor spy must return a real Intl instance (not a mock
    // receiver). Keep this constructible: the component calls it with `new`.
    const intl = vi.spyOn(Intl, 'NumberFormat').mockImplementation(function NumberFormat(locale, options) {
      return new NativeNumberFormat(locale, options);
    });
    render(<BatchCalculator />);
    const before = getState().batch;
    const enFormatter = intl.mock.results.find((item) => item.value?.resolvedOptions().maximumSignificantDigits === 21)?.value;
    expect(enFormatter.resolvedOptions().locale).toBe('en-US');
    expect(within(matrix()).getByText('12,345.6789')).toBeInTheDocument();
    expect(screen.getByText('Row #1,234')).toBeInTheDocument();
    expect(screen.getByText('12,345.67891')).toBeInTheDocument();
    expect(screen.getByText('−0.12346')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    const englishBlob = createUrl.mock.calls[0][0];

    changeLocale('zh');
    const zhFormatter = intl.mock.results.find((item) => item.value?.resolvedOptions().locale === 'zh-CN' && item.value?.resolvedOptions().maximumSignificantDigits === 21)?.value;
    expect(zhFormatter).toBeDefined();
    expect(within(matrix()).getByText(zhFormatter.format(12345.6789))).toBeInTheDocument();
    expect(screen.getByText('第 1,234 行')).toBeInTheDocument();
    expect(getState().batch).toBe(before);
    expect(Scatter.mock.calls.at(-1)[0].data[0]).toMatchObject({ x: 12345.6789, y: Number(before.rows[0].result_phi) });
    expect(XAxis.mock.calls.at(-1)[0].tickFormatter(12345.67)).toBe(new Intl.NumberFormat('zh-CN', { maximumSignificantDigits: 3 }).format(12345.67));
    expect(YAxis.mock.calls.at(-1)[0].tickFormatter(0.123456)).toBe('0.123');
    fireEvent.click(screen.getByRole('button', { name: 'X 轴线性' }));
    expect(XAxis.mock.calls.at(-1)[0].tickFormatter(4)).toBe('10,000');
    fireEvent.click(screen.getByRole('button', { name: '折线图' }));
    fireEvent.click(screen.getByRole('button', { name: '导出 CSV' }));
    const chineseBlob = createUrl.mock.calls[1][0];
    // Read Blob bytes with FileReader: jsdom's Blob does not expose .text().
    const read = (blob) => new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(blob); });
    expect(click).toHaveBeenCalledTimes(2);
    return Promise.all([read(englishBlob), read(chineseBlob)]).then(([en, zh]) => {
      expect(zh).toBe(en);
      expect(en).toBe(Papa.unparse([{ ...validRow, result_phi: before.rows[0].result_phi }]));
      expect(en).toContain('12345.6789');
      expect(en).not.toContain('12,345');
    });
  });

  test.each(MODELS)('$id output precision and trailing zeroes survive both display locales', (model) => {
    const source = Object.fromEntries(model.req.split(', ').map((key, index) => [key, model.template[index]]));
    const outputs = computeRow(model.id, source);
    updateBatch({ modelId: model.id, headers: Object.keys(source), fileName: `${model.id}.csv`, rows: [{ ...source, ...outputs, __status: 'valid' }], xKey: 't', yKey: model.resultKeys[0] });
    render(<BatchCalculator />);
    const before = getState().batch;
    const displayed = () => [...matrix().querySelectorAll('tbody tr:first-child td')].slice(-model.resultKeys.length).map((cell) => cell.textContent);
    // These calibrated sample outputs are below 1,000, so grouping cannot hide
    // any dropped trailing zeroes or lost 4/6/9-place scientific precision.
    expect(displayed()).toEqual(model.resultKeys.map((key) => outputs[key]));
    changeLocale('zh');
    expect(displayed()).toEqual(model.resultKeys.map((key) => outputs[key]));
    expect(getState().batch).toBe(before);
  });

  test('line brush formats with the current locale, without changing raw point ordering', () => {
    seed();
    const row = { ...validRow, t: '365' };
    updateBatch({ rows: [...getState().batch.rows, { ...row, ...computeRow('aci209', row), __status: 'valid' }], chartType: 'line' });
    changeLocale('zh');
    render(<BatchCalculator />);
    const props = Brush.mock.calls.at(-1)[0];
    expect(props.tickFormatter(12345)).toBe('12,300');
    expect(props.data.map((point) => point.x)).toEqual([365, 12345.6789]);
    expect(getState().batch.rows.map((item) => item.t)).toEqual(['12345.6789', '365']);
  });

  test.each(['en', 'zh'])('formatting never makes invalid numeric input acceptable (%s)', async (locale) => {
    changeLocale(locale);
    const { container } = render(<BatchCalculator />);
    const rows = ['1,234', '0x10', ' ', 'true'].map((H) => Papa.unparse([{ ...validRow, H }], { header: false })).join('\n');
    upload(container, `${ACI_HEADER}\n${rows}`);
    await resultsReady();
    expect(getState().batch.rows.map((row) => row.H)).toEqual(['1,234', '0x10', ' ', 'true']);
    expect(getState().batch.rows.every((row) => row.__status === 'invalid')).toBe(true);
    expect(getState().batch.issues).toHaveLength(4);
  });
});

describe('destructive replacement is explicit', () => {
  test.each(['en', 'zh'])('cancelling upload, drop and demo preserves all state (%s)', (locale) => {
    seed();
    changeLocale(locale);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const parse = vi.spyOn(Papa, 'parse');
    const { container } = render(<BatchCalculator />);
    const before = getState().batch;
    upload(container, csv(), 'replacement.csv');
    const input = container.querySelector('input[type="file"]');
    fireEvent.drop(input.closest('label'), { dataTransfer: { files: [new File([csv()], 'dropped.csv')] } });
    fireEvent.click(screen.getByRole('button', { name: locale === 'en' ? 'Load demo sweep' : '加载演示数据' }));
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(confirm.mock.calls[0][0]).toContain(locale === 'en' ? 'will be lost' : '将丢失');
    expect(confirm.mock.calls[0][0]).toContain('replacement.csv');
    expect(parse).not.toHaveBeenCalled();
    expect(getState().batch).toBe(before);
    expect(input.value).toBe('');
  });

  test('cancelling replacement preserves pending mapping edits as well as source rows', () => {
    updateBatch({ pendingRows: [{ age: '28' }], headers: ['age'], mapping: [{ field: 't0', source: 'age' }], fileName: 'pending.csv' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<BatchCalculator />);
    const before = getState().batch;
    fireEvent.click(screen.getByRole('button', { name: 'Load demo sweep' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(getState().batch).toBe(before);
    expect(screen.getByLabelText('Source column for t0')).toHaveValue('age');
  });

  test('confirmed file and demo replacements still work; an empty workspace needs no confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { container } = render(<BatchCalculator />);
    upload(container, csv());
    await resultsReady();
    expect(confirm).not.toHaveBeenCalled();
    upload(container, csv({ ...validRow, t: '365' }), 'second.csv');
    await waitFor(() => expect(getState().batch.fileName).toBe('second.csv'));
    await resultsReady();
    expect(confirm).toHaveBeenCalledOnce();
    expect(getState().batch.rows[0].t).toBe('365');
    fireEvent.click(screen.getByRole('button', { name: 'Load demo sweep' }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(getState().batch.rows).toHaveLength(9);
  });

  test('model switches preserve extra input columns, including user-owned result_* names', () => {
    const b4 = MODELS.find((model) => model.id === 'b4');
    const source = { ...Object.fromEntries(b4.req.split(', ').map((key, index) => [key, b4.template[index]])), result_notes: 'user notes' };
    updateBatch({ modelId: 'b4', headers: Object.keys(source), fileName: 'b4.csv', rows: [{ ...source, ...computeRow('b4', source), __status: 'valid' }] });
    const confirm = vi.spyOn(window, 'confirm');
    const { container } = render(<BatchCalculator />);
    selectModel(container, 'b4s');
    expect(getState().batch.rows[0]).toMatchObject({ ...source, ...computeRow('b4s', source) });
    selectModel(container, 'aci209');
    expect(getState().batch.pendingRows[0]).toEqual(source);
    expect(getState().batch.pendingRows[0]).not.toHaveProperty('result_J_GPa');
    expect(getState().batch.fileName).toBe('b4.csv');
    selectModel(container, 'b4');
    expect(getState().batch.rows[0]).toMatchObject({ ...source, ...computeRow('b4', source) });
    expect(confirm).not.toHaveBeenCalled(); // Inputs are retained, not discarded.
  });
});

// Synchronous parser fixture lets these tests control the *computation* clock
// separately from FileReader; real CSV/XLSX paths remain covered above/elsewhere.
function parseRows(rows) {
  vi.spyOn(Papa, 'parse').mockImplementation((_file, options) => {
    options.complete({ data: rows, errors: [], meta: { fields: Object.keys(rows[0]) } });
  });
}

describe('in-flight reads and calculations', () => {
  test('language changes during CSV parsing keep the selected file and finish in the current language', () => {
    let finish;
    vi.spyOn(Papa, 'parse').mockImplementation((_file, options) => { finish = options.complete; });
    const { container } = render(<BatchCalculator />);
    upload(container, '');
    const before = getState().batch;
    changeLocale('zh');
    expect(getState().batch).toBe(before);
    expect(screen.getByText('正在处理…')).toBeInTheDocument();
    act(() => finish({ data: [validRow], errors: [], meta: { fields: Object.keys(validRow) } }));
    expect(getState().batch.rows[0]).toMatchObject(computeRow('aci209', validRow));
    expect(screen.getByRole('button', { name: '导出 CSV' })).toBeInTheDocument();
  });

  test('language changes preserve worker progress and never start a second computation', async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({ ...validRow, t: String(365 + index) }));
    parseRows(rows);
    isBatchWorkerAvailable.mockReturnValue(true);
    let resolve;
    runBatchInWorker.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { container } = render(<BatchCalculator />);
    upload(container, '');
    const options = runBatchInWorker.mock.calls[0][2];
    act(() => options.onProgress(500, rows.length));
    const before = getState().batch;
    selectModel(container, 'aci209'); // Re-selecting the active model is a no-op.
    expect(getState().batch).toBe(before);
    changeLocale('zh');
    expect(screen.getByText('正在处理… 500/1,001')).toBeInTheDocument();
    expect(getState().batch).toBe(before);
    expect(options.isCancelled()).toBe(false);
    expect(runBatchInWorker).toHaveBeenCalledOnce();
    await act(async () => resolve(computeRowsChunk('aci209', rows)));
    expect(getState().batch.rows).toHaveLength(1001);
    expect(getState().batch.rows[0]).toMatchObject(computeRow('aci209', rows[0]));
    expect(screen.getByText(/^1,001 行 · 1 个输出字段/)).toBeInTheDocument();
  });

  test('chunk fallback survives language and compatible model switches without losing source inputs', async () => {
    vi.useFakeTimers();
    const b4 = MODELS.find((item) => item.id === 'b4');
    const source = Object.fromEntries(b4.req.split(', ').map((key, index) => [key, b4.template[index]]));
    const rows = Array.from({ length: 1001 }, (_, index) => ({ ...source, t: 365 + index }));
    parseRows(rows);
    const { container } = render(<BatchCalculator />);
    selectModel(container, 'b4');
    upload(container, '', 'large-b4.csv');
    expect(getState().batch.pendingRows).toBe(rows);
    changeLocale('zh');
    selectModel(container, 'b4s');
    await act(async () => vi.runAllTimersAsync());
    expect(getState().batch.modelId).toBe('b4s');
    expect(getState().batch.rows).toHaveLength(1001);
    expect(getState().batch.rows[0]).toMatchObject({ ...rows[0], ...computeRow('b4s', rows[0]) });
    expect(getState().batch.fileName).toBe('large-b4.csv');
    expect(getState().batch.pendingRows).toEqual([]);
    expect(screen.getByText(/^1,001 行 · 4 个输出字段/)).toBeInTheDocument();
  });

  test('incompatible switch keeps all worker source rows and rejects late old results', async () => {
    const rows = Array.from({ length: 1001 }, () => ({ ...validRow }));
    parseRows(rows);
    isBatchWorkerAvailable.mockReturnValue(true);
    let resolve;
    runBatchInWorker.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { container } = render(<BatchCalculator />);
    upload(container, '');
    const options = runBatchInWorker.mock.calls[0][2];
    selectModel(container, 'b4');
    const mapped = getState().batch;
    expect(mapped.pendingRows).toBe(rows);
    expect(mapped.mapping.length).toBeGreaterThan(0);
    expect(options.isCancelled()).toBe(true);
    await act(async () => resolve(computeRowsChunk('aci209', rows)));
    expect(getState().batch).toBe(mapped);
    expect(screen.getByText('Column mapping')).toBeInTheDocument();
  });
});

describe('URL model changes cannot silently discard a dataset', () => {
  const navigate = (url) => act(() => {
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  test.each(['en', 'zh'])('cancelling popstate keeps the dataset and restores the actual model in the URL (%s)', (locale) => {
    seed();
    changeLocale(locale);
    window.history.replaceState(null, '', `/?mode=batch&lang=${locale}`);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    stopUrlSync = initUrlSync();
    const before = getState().batch;
    navigate(`/?mode=batch&model=b4&lang=${locale}`);
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm.mock.calls[0][0]).toContain(locale === 'en' ? 'will be lost' : '将丢失');
    expect(getState().batch).toBe(before);
    expect(new URLSearchParams(window.location.search).get('model')).toBeNull();
  });

  test('a language-only URL change never clears data or asks for confirmation', () => {
    seed();
    window.history.replaceState(null, '', '/?mode=batch');
    const confirm = vi.spyOn(window, 'confirm');
    stopUrlSync = initUrlSync();
    const before = getState().batch;
    navigate('/?mode=batch&lang=zh');
    expect(getState().locale).toBe('zh');
    expect(getState().batch).toBe(before);
    expect(confirm).not.toHaveBeenCalled();
  });

  test('a confirmed URL reset invalidates old parser callbacks, including after returning to the same model', () => {
    let finish;
    let fail;
    vi.spyOn(Papa, 'parse').mockImplementation((_file, options) => { finish = options.complete; fail = options.error; });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.history.replaceState(null, '', '/?mode=batch');
    stopUrlSync = initUrlSync();
    const { container } = render(<BatchCalculator />);
    upload(container, '');
    navigate('/?mode=batch&model=b4');
    navigate('/?mode=batch');
    const before = getState().batch;
    expect(screen.queryByText('Processing…')).not.toBeInTheDocument();
    act(() => finish({ data: [validRow], errors: [], meta: { fields: Object.keys(validRow) } }));
    act(() => fail({ message: 'stale parse failure' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(getState().batch).toBe(before);
    expect(getState().batch.rows).toEqual([]);
    expect(getState().batch.fileName).toBe('');
  });

  test('a confirmed URL reset rejects queued main-thread chunks after switching back', async () => {
    vi.useFakeTimers();
    parseRows(Array.from({ length: 1001 }, () => ({ ...validRow })));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.history.replaceState(null, '', '/?mode=batch');
    stopUrlSync = initUrlSync();
    const { container } = render(<BatchCalculator />);
    upload(container, '');
    navigate('/?mode=batch&model=b4');
    navigate('/?mode=batch');
    const before = getState().batch;
    await act(async () => vi.runAllTimersAsync());
    expect(getState().batch).toBe(before);
    expect(before.rows).toEqual([]);
    expect(before.pendingRows).toEqual([]);
    expect(screen.queryByText(/Processing/)).not.toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('a cancelled drop keeps in-flight work; confirmed replacement rejects its late results', async () => {
    parseRows(Array.from({ length: 1001 }, () => ({ ...validRow })));
    isBatchWorkerAvailable.mockReturnValue(true);
    let resolve;
    runBatchInWorker.mockReturnValue(new Promise((done) => { resolve = done; }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { container } = render(<BatchCalculator />);
    upload(container, '');
    const [model, rows, options] = runBatchInWorker.mock.calls[0];
    const before = getState().batch;
    const drop = () => fireEvent.drop(container.querySelector('input[type="file"]').closest('label'), {
      dataTransfer: { files: [new File(['bad file'], 'replacement.txt')] },
    });
    drop();
    expect(confirm).toHaveBeenCalledOnce();
    expect(getState().batch).toBe(before);
    expect(options.isCancelled()).toBe(false);
    confirm.mockReturnValue(true);
    drop();
    expect(options.isCancelled()).toBe(true);
    const replaced = getState().batch;
    expect(replaced.fileName).toBe('replacement.txt');
    expect(screen.getByRole('alert')).toHaveTextContent('Unsupported format');
    await act(async () => resolve(computeRowsChunk(model, rows)));
    expect(getState().batch).toBe(replaced);
    expect(replaced.rows).toEqual([]);
    expect(replaced.pendingRows).toEqual([]);
    expect(screen.getByRole('alert')).toHaveTextContent('Unsupported format');
    expect(container.querySelector('input[type="file"]')).toBeEnabled();
  });

  test('a rejected old Worker cannot start fallback computation after a confirmed URL reset', async () => {
    parseRows(Array.from({ length: 1001 }, () => ({ ...validRow })));
    isBatchWorkerAvailable.mockReturnValue(true);
    let reject;
    runBatchInWorker.mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.history.replaceState(null, '', '/?mode=batch');
    stopUrlSync = initUrlSync();
    const { container } = render(<BatchCalculator />);
    upload(container, '');
    navigate('/?mode=batch&model=b4');
    navigate('/?mode=batch');
    const before = getState().batch;
    await act(async () => reject(new Error('old Worker failed')));
    expect(getState().batch).toBe(before);
    expect(before.rows).toEqual([]);
    expect(before.pendingRows).toEqual([]);
    expect(runBatchInWorker).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Processing/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('a confirmed URL reset rejects late worker progress and results even after switching back', async () => {
    parseRows(Array.from({ length: 1001 }, () => ({ ...validRow })));
    isBatchWorkerAvailable.mockReturnValue(true);
    let resolve;
    runBatchInWorker.mockReturnValue(new Promise((done) => { resolve = done; }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.history.replaceState(null, '', '/?mode=batch');
    stopUrlSync = initUrlSync();
    const { container } = render(<BatchCalculator />);
    upload(container, '');
    const [model, rows, options] = runBatchInWorker.mock.calls[0];
    navigate('/?mode=batch&model=b4');
    navigate('/?mode=batch');
    const before = getState().batch;
    expect(options.isCancelled()).toBe(true);
    act(() => options.onProgress(1001, 1001));
    await act(async () => resolve(computeRowsChunk(model, rows)));
    expect(getState().batch).toBe(before);
    expect(screen.queryByRole('region', { name: /result matrix/ })).not.toBeInTheDocument();
  });
});
