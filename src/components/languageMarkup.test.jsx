import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import App from '../App';
import { getState, updateBatch } from '../state/appStore';
import Aci209Calculator from './Aci209Calculator';
import DocsPage from './DocsPage';
import Mc2010Calculator from './Mc2010Calculator';
import ModelCalculator from './ModelCalculator';
import { langRuns } from './ui/langRuns';

/**
 * Whatever language the document is in, no Chinese may be rendered without
 * saying so: a screen reader reads 中文 with English phonemes unless an element
 * in scope carries `lang="zh…"`.
 *
 * The calculation workspace is now driven by the message catalogues, so in the
 * English locale it contains no Han characters at all and the invariant holds
 * trivially; in the Chinese locale the document itself is `lang="zh-CN"`, which
 * covers every string the catalogue supplies. Either way the check is the same
 * walk of the rendered DOM, and a hard-coded Chinese string that forgets its
 * markup — as the reference library still carries — fails
 * here.
 */
const HAN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const ATTRIBUTES = ['aria-label', 'title', 'placeholder', 'alt'];

function speaksChinese(element) {
  for (let node = element; node; node = node.parentElement) {
    const lang = node.getAttribute?.('lang');
    if (lang && lang.toLowerCase().startsWith('zh')) return true;
  }
  return false;
}

/** @returns {string[]} every Chinese fragment in `root` that is not marked */
function unmarkedChinese(root) {
  const unmarked = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!HAN.test(node.textContent)) continue;
    if (!speaksChinese(node.parentElement)) unmarked.push(`text: ${node.textContent.trim().slice(0, 40)}`);
  }
  for (const element of root.querySelectorAll(ATTRIBUTES.map((name) => `[${name}]`).join(','))) {
    for (const name of ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (value && HAN.test(value) && !speaksChinese(element)) {
        unmarked.push(`${name}: ${value.slice(0, 40)}`);
      }
    }
  }
  return unmarked;
}

describe('Chinese fragments are marked with their language', () => {
  test('the calculation workspace, whose messages now come from the catalogue', async () => {
    const { container } = render(<Aci209Calculator engine="js" />);
    await waitFor(() => expect(screen.getByText(/^Computed$/)).toBeInTheDocument());

    // A field outside its range names the range, and moving an input says the
    // results on screen are stale. Both used to print an English half and a
    // Chinese half side by side; they are one language now.
    const humidity = screen.getByLabelText(/Relative Humidity/i);
    fireEvent.change(humidity, { target: { value: '500' } });
    fireEvent.blur(humidity);
    await screen.findByText(/Outside calibrated range 0–100/);
    fireEvent.change(humidity, { target: { value: '35' } });
    fireEvent.blur(humidity);
    await screen.findByText(/results are out of date/);

    // Nothing Chinese survives in the English locale: if it did, the guard below
    // would need an element to mark it, and there is none.
    expect(HAN.test(container.textContent)).toBe(false);
    expect(unmarkedChinese(container)).toEqual([]);
  });

  test('a notice, whose title and body both arrive as data', async () => {
    const refuses = { value: true };
    const config = {
      id: 'stub',
      name: 'Stub model',
      descriptions: { js: 'stub', rust: 'stub' },
      initialParams: { x: 1, targetAge: 5 },
      paramsConfig: [
        { name: 'x', label: 'X', min: 0, max: 10 },
        { name: 'targetAge', label: 'Target Age', min: 1, max: 100 },
      ],
      readyMessage: 'ready',
      calculateJs() {
        if (refuses.value) throw new RangeError('Stub kernel refused this input.');
        return [{ t: 0, v: 0 }, { t: 1, v: 1 }];
      },
      calculateRust() { return this.calculateJs(); },
      getSummary: () => ({ primary: 1 }),
      chartLines: [{ dataKey: 'v', stroke: 'var(--series-1)', name: 'V' }],
    };

    const { container } = render(<ModelCalculator engine="js" config={config} />);
    const alert = await screen.findByRole('alert');
    // The model's own error text arrives untouched; the frame around it is the
    // catalogue's sentence.
    expect(alert).toHaveTextContent('Calculation failed');
    expect(alert).toHaveTextContent('Stub kernel refused this input.');
    expect(unmarkedChinese(container)).toEqual([]);
  });

  test.each(['en', 'zh'])('the batch workspace includes localized issues and mapping (%s)', async (locale) => {
    window.history.replaceState(null, '', `/?mode=batch&lang=${locale}`);
    const { container } = render(<App />);
    await screen.findByRole('heading', { name: locale === 'zh' ? '数据集计算流程' : 'Dataset pipeline' });
    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: [new File(['t0,tPrime,t\n28,28,112\n'], 'wrong-columns.csv')] },
    });
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent(locale === 'zh' ? '缺少必填列' : 'Missing required columns');
    // One localized issue row per missing field, not a removed assertion about
    // the old bilingual text. The document now supplies their language.
    const issueRows = screen.getAllByText(locale === 'zh' ? '缺少必填列' : 'Required column is missing', { exact: true });
    expect(issueRows).toHaveLength(getState().batch.mapping.length);
    expect(issueRows.length).toBeGreaterThan(0);
    expect(document.documentElement.lang).toBe(locale === 'zh' ? 'zh-CN' : 'en');
    if (locale === 'en') expect(HAN.test(container.querySelector('.workspace-header').parentElement.textContent)).toBe(false);
    expect(unmarkedChinese(container)).toEqual([]);
  });

  test.each(['en', 'zh'])('the localized batch error and truncated matrix retain language coverage (%s)', async (locale) => {
    window.history.replaceState(null, '', `/?mode=batch&lang=${locale}`);
    const empty = render(<App />);
    await screen.findByRole('heading', { name: locale === 'zh' ? '数据集计算流程' : 'Dataset pipeline' });
    fireEvent.change(empty.container.querySelector('input[type="file"]'), {
      target: { files: [new File(['t0,tPrime,t\n'], 'empty.csv')] },
    });
    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent(locale === 'zh'
      ? '文件为空。请上传包含表头和数据的 CSV 或 XLSX 文件。'
      : 'File is empty. Upload a CSV or XLSX file with headers and data.');
    expect(unmarkedChinese(empty.container)).toEqual([]);
    empty.unmount();

    const rows = Array.from({ length: 150 }, (_, index) => ({ t0: 28, t: index, result_J_GPa: 0.16, __status: 'valid' }));
    updateBatch({
      modelId: 'b4', rows, headers: ['t0', 't'], issues: [],
      fileName: 'big.csv', xKey: 't', yKey: 'result_J_GPa', pendingRows: [], mapping: [],
    });
    const big = render(<App />);
    await waitFor(() => expect(big.container.textContent).toContain(locale === 'zh'
      ? '表格显示前 100 行，导出包含全部 150 行'
      : 'showing the first 100 rows; export includes all 150 rows'));
    expect(big.container.querySelectorAll('tbody tr')).toHaveLength(100);
    expect(screen.getByText(locale === 'zh'
      ? '选择输入列与结果列进行快速关系检查'
      : 'Choose an input and an output column to check their relationship')).toBeInTheDocument();
    if (locale === 'en') expect(HAN.test(big.container.querySelector('.workspace-header').parentElement.textContent)).toBe(false);
    expect(unmarkedChinese(big.container)).toEqual([]);
  });

  test('the MC2010 cross-field rule, which reports the computed limit', async () => {
    const { container } = render(<Mc2010Calculator engine="js" />);
    await waitFor(() => expect(screen.getByText(/^Computed$/)).toBeInTheDocument());

    const sigma = screen.getByLabelText(/Initial Concrete Stress/i);
    fireEvent.change(sigma, { target: { value: '78' } });
    fireEvent.blur(sigma);
    // The rule spans two fields, so the sentence carries the limit it computed
    // from fcm rather than a number the catalogue could have held.
    const message = await screen.findByText(/outside the MC2010 stress range/);
    expect(container.textContent).toContain('|σ| must be ≤ 0.6·fcm = 24 MPa');
    expect(HAN.test(message.textContent)).toBe(false);

    expect(unmarkedChinese(container)).toEqual([]);
  });

  test('the reference library', () => {
    const { container } = render(<DocsPage />);
    expect(container.textContent).toContain('说明');
    expect(unmarkedChinese(container)).toEqual([]);
  });

  test('every workspace reached from the shell', async () => {
    const { container } = render(<App />);
    await screen.findByRole('heading', { name: /time-dependent concrete analysis/i });
    expect(unmarkedChinese(container)).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Batch' }));
    await screen.findByRole('heading', { name: /dataset pipeline/i });
    expect(unmarkedChinese(container)).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Reference' }));
    await screen.findByRole('heading', { name: /model standards and equations/i });
    expect(unmarkedChinese(container)).toEqual([]);
  });

  test('the command palette', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: /time-dependent concrete analysis/i });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    await screen.findByRole('dialog', { name: /command palette/i });
    expect(unmarkedChinese(document.body)).toEqual([]);
  });
});

describe('the splitter that marks them', () => {
  test('covers the shapes these strings actually take', () => {
    // A whole label, a bilingual message joined by a separator, and one where the
    // Chinese follows an English sentence with a space.
    expect(langRuns('上传数据')).toEqual([{ text: '上传数据', zh: true }]);
    expect(langRuns('Required column is missing · 缺少必填列')).toEqual([
      { text: 'Required column is missing · ', zh: false },
      { text: '缺少必填列', zh: true },
    ]);
    expect(langRuns('File is empty. 请上传包含表头和数据的 CSV 或 XLSX 文件。')).toEqual([
      { text: 'File is empty. ', zh: false },
      { text: '请上传包含表头和数据的', zh: true },
      { text: ' CSV ', zh: false },
      { text: '或', zh: true },
      { text: ' XLSX ', zh: false },
      { text: '文件。', zh: true },
    ]);
  });

  test('never changes the text it is given', () => {
    for (const value of [
      '上传数据',
      'Required column is missing · 缺少必填列',
      'File is empty. 请上传包含表头和数据的 CSV 或 XLSX 文件。',
      'Inputs changed · 当前结果待更新',
      '|σ| must be ≤ 0.6·fcm = 24 MPa · 超出 MC2010 应力适用范围',
      'Recommended 20–30 °C',
      '',
    ]) {
      expect(langRuns(value).map((run) => run.text).join('')).toBe(value);
    }
  });

  test('marks the Chinese in a rendered string, digits and all', () => {
    const { container } = render(<DocsPage />);
    const marked = [...container.querySelectorAll('[lang="zh-CN"]')];
    expect(marked.length).toBeGreaterThan(0);
    for (const element of marked) expect(HAN.test(element.textContent)).toBe(true);
  });
});
