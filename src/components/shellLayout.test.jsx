import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import App from '../App';
import { setLocale } from '../state/appStore';

/**
 * The shell's contract.
 *
 * jsdom does not apply the stylesheet, so these pin structure and behaviour rather
 * than rendered geometry; the geometry itself is covered by scripts/dom-snapshot.mjs,
 * which fingerprints computed styles at four viewports.
 */
async function renderApp() {
  render(<App />);
  await screen.findByRole('heading', { name: /time-dependent concrete analysis/i });
}

const shell = () => ({
  header: document.querySelector('header > div'),
  main: document.getElementById('main-content'),
  footer: document.querySelector('footer > div'),
});

beforeEach(() => {
  window.localStorage.clear();
});

describe('the application shell', () => {
  test('header, main and footer share one gutter class', async () => {
    await renderApp();

    for (const [name, element] of Object.entries(shell())) {
      expect(element, `${name} should exist`).not.toBeNull();
      expect(element, `${name} should carry the shared gutter`).toHaveClass('shell-gutter');
    }
  });

  test('no site re-introduces its own horizontal padding', async () => {
    await renderApp();
    // A `px-*` here would win or lose against .shell-gutter depending on where
    // Tailwind emits it, which is exactly the positional fragility being removed.
    for (const [name, element] of Object.entries(shell())) {
      const own = [...element.classList].filter((c) => /(^|:)px-/.test(c));
      expect(own, `${name} should not set its own horizontal padding`).toEqual([]);
    }
  });

  test('main fills the viewport instead of claiming a hand-computed height', async () => {
    await renderApp();
    const main = document.getElementById('main-content');
    expect([...main.classList].some((c) => c.includes('100dvh'))).toBe(false);
    expect(main).toHaveClass('flex-1');
  });
});

describe('sidebar navigation', () => {
  test.each([
    ['en', ['Calculate', 'Batch', 'Reference']],
    ['zh', ['计算', '批量', '参考']],
  ])('%s destinations keep full accessible names and navigate', async (locale, names) => {
    await renderApp();
    act(() => setLocale(locale));
    const nav = within(screen.getByRole('navigation', { name: locale === 'en' ? 'Workspace' : '工作区' }));
    for (const name of names) {
      const button = nav.getByRole('button', { name, exact: true });
      expect(button).toHaveAttribute('aria-label', name);
    }
    expect(nav.getByRole('button', { name: names[0], exact: true })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(nav.getByRole('button', { name: names[2], exact: true }));
    await screen.findByRole('heading', { name: locale === 'en' ? 'Model standards and equations' : '模型标准与计算公式' });
    const docs = within(screen.getByRole('navigation', { name: locale === 'en' ? 'Workspace' : '工作区' })).getByRole('button', { name: names[2], exact: true });
    expect(docs).toHaveAttribute('aria-current', 'page');
  });

  test('the desktop rail collapses and remembers the choice', async () => {
    await renderApp();
    const aside = document.getElementById('app-sidebar');
    expect(aside).toHaveAttribute('data-sidebar', 'expanded');

    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' });
    fireEvent.click(toggle);

    expect(aside).toHaveAttribute('data-sidebar', 'collapsed');
    expect(window.localStorage.getItem('creep-lab:sidebar')).toBe('collapsed');
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(aside).toHaveAttribute('data-sidebar', 'expanded');
    expect(window.localStorage.getItem('creep-lab:sidebar')).toBe('expanded');
  });

  test('a stored collapse preference applies on the next render', async () => {
    window.localStorage.setItem('creep-lab:sidebar', 'collapsed');
    await renderApp();
    expect(document.getElementById('app-sidebar')).toHaveAttribute('data-sidebar', 'collapsed');
  });
});

describe('the narrow-screen drawer', () => {
  const drawer = () => document.getElementById('app-sidebar');
  const menuButton = () => screen.getByRole('button', { name: 'Open navigation' });

  test('opens from the topbar, takes focus, locks scroll and closes on Escape', async () => {
    await renderApp();
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(menuButton());

    expect(menuButton()).toHaveAttribute('aria-expanded', 'true');
    expect(document.body.style.overflow).toBe('hidden');
    expect(drawer().contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(menuButton()).toHaveAttribute('aria-expanded', 'false'));
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(menuButton());
  });

  test('choosing a destination closes it and restores focus', async () => {
    await renderApp();
    fireEvent.click(menuButton());
    const nav = within(screen.getByRole('navigation', { name: 'Workspace' }));
    fireEvent.click(nav.getByRole('button', { name: 'Batch' }));

    await screen.findByRole('heading', { name: /dataset pipeline/i });
    await waitFor(() => expect(menuButton()).toHaveAttribute('aria-expanded', 'false'));
    expect(document.activeElement).toBe(menuButton());
  });

  test('Tab cycles inside the drawer instead of reaching the page behind it', async () => {
    await renderApp();
    fireEvent.click(menuButton());
    const focusable = [...drawer().querySelectorAll('a[href], button:not([disabled])')];
    expect(focusable.length).toBeGreaterThan(2);

    focusable.at(-1).focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(focusable[0]);
  });
});

describe('topbar controls under pressure', () => {
  test('the kernel badge is the row’s slack-taker, not shrink-0', async () => {
    await renderApp();
    const badge = screen.getByRole('status');

    // Every control around it is shrink-0, so the badge is what has to give when
    // the row runs out of room — otherwise the badge and the title overlap.
    expect(badge).toHaveClass('min-w-0');
    expect(badge).not.toHaveClass('shrink-0');
    expect(within(badge).getByText(/.+/)).toHaveClass('truncate');
  });

  test('the search button carries the palette shortcut as a tooltip', async () => {
    await renderApp();
    const button = screen.getByRole('button', { name: /search commands/i });

    // Below lg the sidebar is off-screen, so this title is the only remaining
    // pointer to the shortcut once the drawer is closed.
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

describe('nothing leaks out of the source', () => {
  // Regression, found by the screenshot gate rather than by a test: a `/* … */`
  // block written among a JSX element's children is not a comment. It is text, and
  // React renders it — the single-analysis header printed its own explanation of
  // `data-run-status` at the user in twelve-point type. Only `{/* … */}` is a
  // comment inside JSX, and only a rendered-text assertion can tell the difference.
  const leaks = (text) => {
    const offenders = ['/*', '*/', 'data-run-status', 'data-kernel', 'data-action', 'data-result-matrix', 'data-workspace', 'useEffect', 'className='];
    return offenders.filter((needle) => text.includes(needle));
  };

  test('the application shell renders no source syntax as text', async () => {
    await renderApp();
    expect(leaks(document.body.textContent)).toEqual([]);
  });

  test('the same holds after switching workspaces, and in Chinese', async () => {
    await renderApp();
    act(() => setLocale('zh'));
    await screen.findByRole('heading', { name: /混凝土时变分析/ });
    expect(leaks(document.body.textContent)).toEqual([]);
  });
});
