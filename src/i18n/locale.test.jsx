import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import App from '../App';
import { applyLocale, getState, loadLocale, setLocale } from '../state/appStore';
import { LOCALE_KEY } from '../state/appStore';
import { HTML_LANG } from './locales';

/**
 * The interface's language is a real, switchable piece of state, so these go through
 * the application the way a reader does: press the control, read what changed, and
 * check that the choice outlives the page.
 *
 * Three things have to move together and are easy to get out of step, which is why
 * they are asserted together:
 *
 *   - the visible wording, from the message catalogues;
 *   - `<html lang>`, which decides how a screen reader pronounces the page and which
 *     is *not* the same string as the app's own locale id (`zh` → `zh-CN`);
 *   - `localStorage`, so the next visit opens in the language that was chosen.
 */
const renderApp = () => render(<App />);

const heading = (name) => screen.findByRole('heading', { name });

/**
 * The language control. It cannot be found by its accessible name: it names the
 * language it switches *to*, in that language, so the name changes with the locale.
 * It is the only button that carries a `lang` of its own, which is the stable handle.
 */
const switchButton = () => {
  const buttons = [...document.querySelectorAll('button[lang]')];
  expect(buttons).toHaveLength(1);
  return buttons[0];
};

describe('switching the interface language', () => {
  test('starts in English, with the document marked as English', async () => {
    renderApp();
    await heading(/time-dependent concrete analysis/i);

    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('button', { name: 'Calculate' })).toBeInTheDocument();
  });

  test('switches the wording, the document language and what is remembered', async () => {
    renderApp();
    await heading(/time-dependent concrete analysis/i);

    fireEvent.click(switchButton());
    await heading('混凝土时变分析');

    // Wording from the catalogue, not a hard-coded Chinese string.
    expect(screen.getByRole('button', { name: '计算' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Calculate' })).toBeNull();
    // The document language is the HTML code, not the app's locale id.
    expect(document.documentElement.lang).toBe(HTML_LANG.zh);
    expect(window.localStorage.getItem(LOCALE_KEY)).toBe('zh');
  });

  test('the control names the language it switches to, in that language', async () => {
    renderApp();
    await heading(/time-dependent concrete analysis/i);

    // In English the button offers Chinese, and says so in Chinese — and carries
    // `lang` so a screen reader does not read 中文 with English phonemes.
    const toChinese = switchButton();
    expect(toChinese).toHaveTextContent('中文');
    expect(toChinese).toHaveAttribute('lang', HTML_LANG.zh);

    fireEvent.click(toChinese);
    await heading('混凝土时变分析');

    const toEnglish = switchButton();
    expect(toEnglish).toHaveTextContent('English');
    expect(toEnglish).toHaveAttribute('lang', HTML_LANG.en);
  });

  test('a stored choice is the language the next visit opens in', async () => {
    // The point of persisting at all: the loader reads the stored choice first and
    // only falls back to the browser's languages when there is none.
    window.localStorage.setItem(LOCALE_KEY, 'zh');
    expect(loadLocale()).toBe('zh');

    window.localStorage.setItem(LOCALE_KEY, 'nonsense');
    expect(loadLocale()).toBe('en'); // detected, not trusted
  });

  test('a shared ?lang= link shows that language without overwriting the choice', async () => {
    // The distinction the store draws: `applyLocale` changes the live language for
    // this visit, `setLocale` records a preference. Opening someone's Chinese link
    // must not silently rewrite the reader's own setting.
    window.localStorage.setItem(LOCALE_KEY, 'en');
    applyLocale('zh');

    expect(getState().locale).toBe('zh');
    expect(window.localStorage.getItem(LOCALE_KEY)).toBe('en');
  });

  test('the shell follows the language in every workspace', async () => {
    // Every workspace follows the catalogue; Docs additionally loads a real
    // language-specific Markdown source rather than bilingual JSX.
    renderApp();
    await heading(/time-dependent concrete analysis/i);
    fireEvent.click(switchButton());
    await heading('混凝土时变分析');

    fireEvent.click(screen.getByRole('button', { name: '批量' }));
    await heading('数据集计算流程');
    expect(document.documentElement.lang).toBe(HTML_LANG.zh);
    // The shell's own wording moved with the locale in this workspace too.
    expect(screen.getByRole('button', { name: '计算' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '参考' }));
    await heading('模型标准与计算公式');
    await heading('ACI 209R-92 徐变模型说明');
    expect(document.documentElement.lang).toBe(HTML_LANG.zh);
    expect(screen.getByRole('link', { name: '跳到主要内容' })).toBeInTheDocument();
  });

  test('an unknown language falls back to the default instead of breaking', async () => {
    setLocale('de');
    renderApp();
    await heading(/time-dependent concrete analysis/i);
    expect(document.documentElement.lang).toBe('en');
  });

  test('the title and description follow the language too', async () => {
    // index.html carries this tag in the real document; jsdom's test document does
    // not, and the hook has to cope with either, so it is added here to exercise
    // the path that updates it.
    const description = document.createElement('meta');
    description.setAttribute('name', 'description');
    document.head.append(description);

    renderApp();
    await heading(/time-dependent concrete analysis/i);
    const english = document.title;
    expect(description.getAttribute('content')).not.toMatch(/[\u4e00-\u9fff]/);

    fireEvent.click(switchButton());
    await heading('混凝土时变分析');

    await waitFor(() => expect(document.title).not.toBe(english));
    expect(document.title).toContain('CREEP LAB');
    // Search engines read the same tag, so it moves with the page rather than
    // staying on whichever language the document was built with.
    expect(description.getAttribute('content')).toMatch(/[\u4e00-\u9fff]/);

    description.remove();
  });

  test('a document with no head tags to update still switches', async () => {
    // The hook looks up `<title>` and the description tag; a page that has neither
    // (or a test document) must not take the application down with it.
    expect(document.querySelector('meta[name="description"]')).toBeNull();
    renderApp();
    await heading(/time-dependent concrete analysis/i);

    fireEvent.click(switchButton());
    await heading('混凝土时变分析');
    expect(document.documentElement.lang).toBe(HTML_LANG.zh);
  });
});
