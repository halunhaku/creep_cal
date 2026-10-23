import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import App from '../App';
import DocsPage from './DocsPage';
import { getState, setLocale, setModel, updateBatch } from '../state/appStore';
import { DOCUMENTS, documentUrl } from '../docs/documents';

const body = () => document.querySelector('[data-markdown-document]');
const heading = (id = 'overview') => document.getElementById(id);
const contentReady = () => waitFor(() => expect(body()).not.toBeNull());
const read = (url) => readFileSync(resolve(process.cwd(), `public${decodeURI(url)}`), 'utf8');
let originalScroll;

beforeEach(() => {
  originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, writable: true, value: vi.fn() });
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
});
afterEach(() => {
  if (originalScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll);
  else delete HTMLElement.prototype.scrollIntoView;
});

describe('the reference page renders the shipped Markdown', () => {
  test.each(['en', 'zh'])('all six %s documents have matching visible content, navigation and downloadable source', async (locale) => {
    act(() => setLocale(locale));
    render(<DocsPage />);
    for (const model of DOCUMENTS) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`${model.name}(?!s)`) }));
      await waitFor(() => expect(heading()?.textContent).toBe(read(documentUrl(model.id, locale)).split('\n')[0].slice(2)));
      const nav = screen.getByRole('navigation', { name: locale === 'en' ? 'Document sections' : '文档章节' });
      expect(within(nav).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(model.sections.map((id) => `#${id}`));
      for (const link of within(nav).getAllByRole('link')) expect(document.querySelector(link.getAttribute('href'))).not.toBeNull();
      const download = screen.getByRole('link', { name: /Markdown/ });
      expect(download).toHaveAttribute('href', documentUrl(model.id, locale));
      expect(download).toHaveAttribute('download', `${model.id}.${locale}.md`);
      expect(body().querySelectorAll('table').length).toBeGreaterThan(0);
      expect(body().querySelectorAll('.katex').length).toBeGreaterThan(0);
      expect(body().querySelectorAll('[data-math-error]')).toHaveLength(0);
      expect(getState().model).toBe(model.id);
    }
  });

  test('the real language button keeps model id, section hash and navigation targets while changing download language', async () => {
    window.history.replaceState(null, '', '/?mode=docs&model=b4&lang=en#basic-creep');
    updateBatch({ rows: [{ retained: 'batch input' }], fileName: 'keep.csv' });
    const batch = getState().batch;
    render(<App />);
    await contentReady();
    expect(heading('basic-creep')).toHaveTextContent('Basic creep');
    expect(HTMLElement.prototype.scrollIntoView.mock.contexts.at(-1).id).toBe('basic-creep');
    const ids = [...body().querySelectorAll('[data-doc-heading]')].map((element) => element.id);
    fireEvent.click(document.querySelector('button[lang]'));
    await waitFor(() => expect(heading('basic-creep')).toHaveTextContent('基本徐变'));
    expect(getState().model).toBe('b4');
    expect(getState().batch).toBe(batch);
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(window.location.hash).toBe('#basic-creep');
    expect([...body().querySelectorAll('[data-doc-heading]')].map((element) => element.id)).toEqual(ids);
    expect(HTMLElement.prototype.scrollIntoView.mock.contexts.at(-1).id).toBe('basic-creep');
    expect(screen.getByRole('link', { name: '下载 Markdown' })).toHaveAttribute('href', documentUrl('b4', 'zh'));
    fireEvent.click(document.querySelector('button[lang]'));
    await waitFor(() => expect(heading('basic-creep')).toHaveTextContent('Basic creep'));
    expect(window.location.hash).toBe('#basic-creep');
    expect(screen.getByRole('link', { name: 'Download Markdown' })).toHaveAttribute('href', documentUrl('b4', 'en'));
    expect(globalThis.fetch).toHaveBeenCalledTimes(2); // completed translations are cached
  });

  test('language changes preserve the current logical heading and within-section offset without requiring a hash', async () => {
    act(() => setModel('b4'));
    render(<DocsPage />);
    await contentReady();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const index = DOCUMENTS.find((model) => model.id === 'b4').sections.indexOf(this.id);
      const top = index === 3 ? -40 : index < 3 ? -1000 : 500 + index * 100;
      return { top, bottom: top + 20, left: 0, right: 300, width: 300, height: 20, x: 0, y: top, toJSON: () => ({}) };
    });
    fireEvent.scroll(window);
    act(() => setLocale('zh'));
    await waitFor(() => expect(heading('formulas')).toHaveTextContent('核心数学公式'));
    expect(HTMLElement.prototype.scrollIntoView.mock.contexts.at(-1).id).toBe('formulas');
    expect(window.scrollBy).toHaveBeenCalledWith({ top: 120, behavior: 'instant' });
    expect(window.location.hash).toBe('');
  });

  test('section links perform normal hash navigation; model selections remain URL-linked', async () => {
    window.history.replaceState(null, '', '/?mode=docs');
    render(<App />);
    await contentReady();
    const nav = screen.getByRole('navigation', { name: 'Document sections' });
    fireEvent.click(within(nav).getByRole('link', { name: 'Input parameters' }));
    await waitFor(() => expect(window.location.hash).toBe('#parameters'));
    fireEvent.click(screen.getByRole('button', { name: /fib Model Code 2010/ }));
    await waitFor(() => expect(heading('overview')).toHaveTextContent('fib Model Code 2010 creep model documentation'));
    expect(new URLSearchParams(window.location.search).get('model')).toBe('mc2010');
    expect(heading('parameters')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download Markdown' })).toHaveAttribute('href', documentUrl('mc2010', 'en'));
  });
});

describe('documentation loading and rapid navigation', () => {
  test('HTTP errors are localized, retryable, and never display error-provided HTML', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response('<script>bad</script>', { status: 503 }));
    render(<DocsPage />);
    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('Could not load this document.');
    expect(error).not.toHaveTextContent('bad');
    expect(body()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await contentReady();
    expect(heading('overview')).toHaveTextContent('ACI 209R-92 creep model documentation');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  test('a Chinese load failure and its retry remain Chinese', async () => {
    act(() => setLocale('zh'));
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('network unavailable'));
    render(<DocsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('无法加载此文档。');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => expect(heading('overview')).toHaveTextContent('ACI 209R-92 徐变模型说明'));
    expect(screen.getByRole('link', { name: '下载 Markdown' })).toHaveAttribute('download', 'aci209.zh.md');
  });

  test('late responses and failures cannot replace a newly selected model or language', async () => {
    window.history.replaceState(null, '', '/?mode=docs#parameters');
    const requests = [];
    vi.mocked(globalThis.fetch).mockImplementation((url, options) => new Promise((resolve, reject) => {
      requests.push({ url, options, resolve, reject });
    }));
    render(<DocsPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading documentation…');
    act(() => setModel('b4'));
    act(() => setLocale('zh'));
    expect(requests).toHaveLength(3);
    expect(requests[0].options.signal.aborted).toBe(true);
    expect(requests[1].options.signal.aborted).toBe(true);
    await act(async () => requests[2].resolve(new Response(read(requests[2].url))));
    expect(heading('overview')).toHaveTextContent('RILEM Model B4 混凝土多年代徐变与收缩模型说明');
    const rendered = body();
    const restored = HTMLElement.prototype.scrollIntoView.mock.contexts.at(-1);
    const restores = HTMLElement.prototype.scrollIntoView.mock.calls.length;
    expect(restored.id).toBe('parameters');
    await act(async () => {
      requests[0].resolve(new Response(read(requests[0].url)));
      requests[1].reject(new Error('stale failure'));
    });
    expect(body()).toBe(rendered);
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(restores);
    expect(HTMLElement.prototype.scrollIntoView.mock.contexts.at(-1)).toBe(restored);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('link', { name: '下载 Markdown' })).toHaveAttribute('href', documentUrl('b4', 'zh'));
    expect(getState().model).toBe('b4');
  });

  test('unmount cancels the pending resource without producing a late error', async () => {
    let fail;
    let signal;
    vi.mocked(globalThis.fetch).mockImplementation((_url, options) => {
      signal = options.signal;
      return new Promise((_resolve, reject) => { fail = reject; });
    });
    const view = render(<DocsPage />);
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => fail(new Error('late failure')));
    expect(view.container).toBeEmptyDOMElement();
  });
});
