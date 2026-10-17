import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import App from '../App';
import { setLocale } from '../state/appStore';

/**
 * Regression: header, main and footer each carried their own hand-copied copy of the
 * gutter utilities (`mx-auto max-w-content px-4 … lg:px-8`). Keeping them aligned
 * meant editing three sites, and missing one silently re-created the misalignment
 * the shell was fixed to remove. Nothing expressed "these three are equal" — this
 * does.
 *
 * jsdom does not apply the stylesheet, so these pin the contract rather than the
 * rendered geometry; the geometry itself is covered by scripts/dom-snapshot.mjs,
 * which fingerprints computed styles at four viewports.
 */
async function renderApp() {
  render(<App />);
  await screen.findByRole('heading', { name: /time-dependent concrete analysis/i });
}

const gutterSites = () => ({
  header: document.querySelector('header > div'),
  main: document.getElementById('main-content'),
  footer: document.querySelector('footer > div'),
});

describe('the application shell', () => {
  test('header, main and footer share one gutter class', async () => {
    await renderApp();
    const sites = gutterSites();

    for (const [name, element] of Object.entries(sites)) {
      expect(element, `${name} should exist`).not.toBeNull();
      expect(element, `${name} should carry the shared gutter`).toHaveClass('shell-gutter');
    }
  });

  test('no site re-introduces its own horizontal padding', async () => {
    await renderApp();
    // A `px-*` here would win or lose against .shell-gutter depending on where
    // Tailwind emits it, which is exactly the positional fragility being removed.
    for (const [name, element] of Object.entries(gutterSites())) {
      const own = [...element.classList].filter((c) => /(^|:)px-/.test(c));
      expect(own, `${name} should not set its own horizontal padding`).toEqual([]);
    }
  });

  test('main fills the viewport instead of claiming a hand-computed height', async () => {
    await renderApp();
    const main = document.getElementById('main-content');
    // The removed `min-h-[calc(100dvh-49px)]` hard-coded the header height plus its
    // border, so raising --header-h moved anchor scrolling but not this.
    expect([...main.classList].some((c) => c.includes('100dvh'))).toBe(false);
    expect(main).toHaveClass('flex-1');
  });
});

describe('header controls under pressure', () => {
  test.each([
    ['en', ['Calculate', 'Batch', 'Reference'], ['Calc', 'Batch', 'Docs']],
    ['zh', ['计算', '批量', '参考'], ['计算', '批量', '参考']],
  ])('compact %s controls keep full accessible names and the original navigation behavior', async (locale, names, short) => {
    await renderApp();
    act(() => setLocale(locale));
    const nav = within(document.querySelector('header nav'));
    for (let index = 0; index < names.length; index += 1) {
      const button = nav.getByRole('button', { name: names[index], exact: true });
      expect(button).toHaveAttribute('aria-label', names[index]);
      expect(button.querySelector('.md\\:hidden')).toHaveTextContent(short[index]);
      expect(button.querySelector('.hidden')).toHaveTextContent(names[index]);
    }
    const language = document.querySelector('button[lang]');
    expect(language).toHaveClass('touch-target');
    expect(language.querySelector('.md\\:hidden')).toHaveTextContent(locale === 'en' ? '中' : 'EN');
    expect(language.getAttribute('aria-label')).toBeTruthy();
    fireEvent.click(nav.getByRole('button', { name: names[2], exact: true }));
    await screen.findByRole('heading', { name: locale === 'en' ? 'Model standards and equations' : '模型标准与计算公式' });
  });

  test('the kernel badge is the row’s slack-taker, not shrink-0', async () => {
    await renderApp();
    const badge = screen.getByRole('status');

    // Every control around it is shrink-0, so the badge is what has to give when
    // the row runs out of room — otherwise the badge and the nav overlap.
    expect(badge).toHaveClass('min-w-0');
    expect(badge).not.toHaveClass('shrink-0');
    expect(within(badge).getByText(/.+/)).toHaveClass('truncate');
  });

  test('the search button carries the palette shortcut as a tooltip', async () => {
    await renderApp();
    const button = screen.getByRole('button', { name: /search commands/i });

    // Below lg the label and the kbd are both display:none, so this title is the
    // only remaining pointer to the shortcut across 768-1023px.
    expect(button).toHaveAttribute('title', 'Search commands (⌘K)');
  });
});

describe('the popover shadow token', () => {
  test('is declared as a box-shadow, so the class can emit one', async () => {
    const config = (await import('../../tailwind.config.js')).default;
    // `shadow-[var(--shadow-popover)]` compiled to a shadow *colour* and emitted no
    // box-shadow at all, so the palette and both chart tooltips rendered flat.
    expect(config.theme.extend.boxShadow?.popover).toBe('var(--shadow-popover)');
  });

  test('is what the command palette actually uses', async () => {
    await renderApp();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const dialog = await screen.findByRole('dialog', { name: /command palette/i });

    expect(dialog).toHaveClass('shadow-popover');
    expect([...dialog.classList].some((c) => c.startsWith('shadow-['))).toBe(false);
  });
});
