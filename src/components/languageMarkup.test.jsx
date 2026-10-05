import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import App from '../App';
import { updateBatch } from '../state/appStore';
import Aci209Calculator from './Aci209Calculator';
import BatchCalculator from './BatchCalculator';
import DocsPage from './DocsPage';
import Mc2010Calculator from './Mc2010Calculator';
import ModelCalculator from './ModelCalculator';
import { langRuns } from './ui/langRuns';

/**
 * The interface is bilingual and the document is `lang="en"`, so every Chinese
 * run has to say so itself or a screen reader reads 中文 with English phonemes.
 *
 * These tests measure the rendered DOM rather than trusting the call sites: a
 * text node with Han characters must sit inside an element carrying `lang`
 * (itself or an ancestor), and so must an accessible name or tooltip written in
 * Chinese. A new Chinese string that forgets its markup fails here.
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
  test('the calculation workspace, including a notice and an out-of-range field', async () => {
    const { container } = render(<Aci209Calculator engine="js" />);
    await waitFor(() => expect(screen.getByText(/^Computed$/)).toBeInTheDocument());

    // A field outside its range prints a bilingual message, and moving an input
    // prints the bilingual "results are stale" warning.
    const humidity = screen.getByLabelText(/Relative Humidity/i);
    fireEvent.change(humidity, { target: { value: '500' } });
    fireEvent.blur(humidity);
    await screen.findByText(/超出推荐范围/);
    fireEvent.change(humidity, { target: { value: '35' } });
    fireEvent.blur(humidity);
    await screen.findByText(/当前结果待更新/);

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
      loadingMessage: 'loading',
      readyMessage: 'ready',
      calculateJs() {
        if (refuses.value) throw new RangeError('Stub kernel refused this input.');
        return [{ t: 0, v: 0 }, { t: 1, v: 1 }];
      },
      calculateRust() { return this.calculateJs(); },
      getSummary: () => ({ primary: 1 }),
      chartLines: [{ dataKey: 'v', stroke: 'var(--primary)', name: 'V' }],
    };

    const { container } = render(<ModelCalculator engine="js" config={config} />);
    const alert = await screen.findByRole('alert');
    // The split must not disturb the sentence, spaces included.
    expect(alert).toHaveTextContent('Calculation failed · 计算失败');
    expect(alert).toHaveTextContent('Stub kernel refused this input.');
    expect(unmarkedChinese(container)).toEqual([]);
  });

  test('the batch workspace, including issues and the column mapping panel', async () => {
    const { container } = render(<BatchCalculator />);
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, {
      target: { files: [new File(['t0,tPrime,t\n28,28,112\n'], 'wrong-columns.csv')] },
    });
    await screen.findByText(/Missing required columns/i);
    // One issue row per missing column, each with its Chinese half marked.
    const marked = await screen.findAllByText(/缺少必填列/);
    expect(marked.length).toBeGreaterThan(0);
    for (const element of marked) expect(element.getAttribute('lang')).toBe('zh-CN');

    expect(unmarkedChinese(container)).toEqual([]);
  });

  test('the batch error line and a matrix long enough to be truncated', async () => {
    const empty = render(<BatchCalculator />);
    fireEvent.change(empty.container.querySelector('input[type="file"]'), {
      target: { files: [new File(['t0,tPrime,t\n'], 'empty.csv')] },
    });
    const error = await screen.findByText(/File is empty/i);
    expect(error).toHaveTextContent('File is empty. 请上传包含表头和数据的 CSV 或 XLSX 文件。');
    expect(unmarkedChinese(empty.container)).toEqual([]);
    empty.unmount();

    // 150 rows: the matrix says so, in a sentence that mixes digits with Chinese,
    // and the visualizer's own Chinese note is rendered beside it.
    const rows = Array.from({ length: 150 }, (_, index) => ({ t0: 28, t: index, result_J_GPa: 0.16, __status: 'valid' }));
    updateBatch({
      modelId: 'b4', rows, headers: ['t0', 't'], issues: [],
      fileName: 'big.csv', xKey: 't', yKey: 'result_J_GPa', pendingRows: [], mapping: [],
    });
    const big = render(<BatchCalculator />);
    // Digits interrupt the Chinese here, so the sentence is read as text content
    // rather than from one element; the whole line must still be intact.
    await waitFor(() => expect(big.container.textContent).toContain('表格显示前 100 行，导出包含全部 150 行'));
    expect(screen.getByText(/选择输入列与结果列进行快速关系检查/)).toBeInTheDocument();
    expect(unmarkedChinese(big.container)).toEqual([]);
  });

  test('the MC2010 cross-field rule, which is the only Chinese in a parameter message', async () => {
    const { container } = render(<Mc2010Calculator engine="js" />);
    await waitFor(() => expect(screen.getByText(/^Computed$/)).toBeInTheDocument());

    const sigma = screen.getByLabelText(/Initial Concrete Stress/i);
    fireEvent.change(sigma, { target: { value: '78' } });
    fireEvent.blur(sigma);
    // "MC2010" splits the Chinese into two runs, so the query takes one of them
    // and the sentence as a whole is checked as text content.
    const message = await screen.findByText('应力适用范围');
    expect(message.getAttribute('lang')).toBe('zh-CN');
    expect(container.textContent).toContain('|σ| must be ≤ 0.6·fcm = 24 MPa · 超出 MC2010 应力适用范围');

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
