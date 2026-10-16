import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import App from '../App';
import { getState, saveParameterSet } from '../state/appStore';
import { revealSection } from './ui/revealSection';

const CALC_HEADING = /time-dependent concrete analysis/i;

async function renderApp() {
  render(<App />);
  await screen.findByRole('heading', { name: CALC_HEADING });
}

async function openPalette() {
  fireEvent.keyDown(window, { key: 'k', metaKey: true });
  const dialog = await screen.findByRole('dialog', { name: /command palette/i });
  // Scoped to the dialog: the workspace has its own selects, which are also
  // comboboxes with options, and querying the whole screen picks them up.
  return { dialog, input: within(dialog).getByRole('combobox') };
}

/**
 * Regression: every destination was reachable only by first finding the right
 * workspace and then the right control inside it, and the reference library's
 * sections had no entry at all beyond scrolling.
 */
describe('command palette', () => {
  test('the shortcut opens it from any workspace, and Escape closes it', async () => {
    await renderApp();
    const { input } = await openPalette();
    expect(input).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('typing filters, and Enter runs the highlighted command', async () => {
    await renderApp();
    const { dialog, input } = await openPalette();

    fireEvent.change(input, { target: { value: 'batch' } });
    expect(within(dialog).getByRole('option', { name: /Batch workspace/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole('option', { name: /Calculate workspace/i })).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByRole('heading', { name: /dataset pipeline/i });
    expect(getState().mode).toBe('batch');
  });

  test('arrow keys move the selection instead of running the first match', async () => {
    await renderApp();
    const { input } = await openPalette();
    fireEvent.change(input, { target: { value: 'workspace' } });

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByRole('heading', { name: /dataset pipeline/i });
    expect(getState().mode).toBe('batch');
  });

  test('it can switch the model, not just workspaces', async () => {
    await renderApp();
    const { input } = await openPalette();

    fireEvent.change(input, { target: { value: 'B4s' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(getState().model).toBe('b4s'));
    expect(getState().mode).toBe('single');
  });

  test('it can switch the kernel', async () => {
    await renderApp();
    const { input } = await openPalette();

    fireEvent.change(input, { target: { value: 'JavaScript reference' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(getState().engine).toBe('js'));
  });

  test('saved parameter sets are reachable from it', async () => {
    saveParameterSet('b4', 'long span', { t0: 28, h: 120 });
    await renderApp();
    const { input } = await openPalette();
    fireEvent.change(input, { target: { value: 'long span' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(getState().paramsByModel.b4).toEqual({ t0: 28, h: 120 }));
    expect(getState().model).toBe('b4');
  });

  test('a query with no matches says so rather than running something', async () => {
    await renderApp();
    const { dialog, input } = await openPalette();
    fireEvent.change(input, { target: { value: 'zzzz' } });

    expect(within(dialog).getByText(/Nothing matches/i)).toBeInTheDocument();
    expect(within(dialog).queryAllByRole('option')).toHaveLength(0);
    expect(getState().mode).toBe('single');
  });
});

/**
 * Regression: the palette used to be keyboard-trapped only by the input's own
 * handler. Its focusable node count was one, so a single Tab walked focus out of a
 * dialog that `aria-modal` keeps on screen — and Escape, bound to that same input,
 * stopped being delivered. Closing also dropped focus on <body>, restarting the tab
 * order from the top of the document.
 */
describe('command palette keyboard containment', () => {
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

  test('focus returns to whatever opened the palette', async () => {
    await renderApp();
    const opener = screen.getByRole('button', { name: /search/i });
    opener.focus();
    expect(document.activeElement).toBe(opener);

    await openPalette();
    fireEvent.keyDown(within(screen.getByRole('dialog')).getByRole('combobox'), { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(opener);
  });

  test('Tab is consumed by the dialog instead of leaving it', async () => {
    await renderApp();
    const { dialog, input } = await openPalette();

    // fireEvent returns false when a handler called preventDefault.
    expect(fireEvent.keyDown(input, { key: 'Tab' })).toBe(false);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  test('Escape is handled at the dialog, so it survives focus moving off the input', async () => {
    await renderApp();
    const { dialog } = await openPalette();
    const list = within(dialog).getByRole('listbox');

    // Not the input: the old binding lived on the input alone.
    fireEvent.keyDown(list, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('arrowing the selection scrolls it back into the list', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      await renderApp();
      const { input } = await openPalette();
      scrollIntoView.mockClear();

      fireEvent.keyDown(input, { key: 'ArrowDown' });

      expect(scrollIntoView).toHaveBeenCalled();
      expect(scrollIntoView.mock.calls.at(-1)[0]).toMatchObject({ block: 'nearest' });
    } finally {
      delete Element.prototype.scrollIntoView;
    }
  });

  /**
   * Regression: the reference library is a lazy chunk, so the section's id does not
   * exist at click time. The old code assigned the hash one frame after switching
   * workspaces anyway — the browser never retries, so the address bar claimed a
   * section the view had not scrolled to.
   */
  test('a section jump waits for the section to exist', async () => {
    window.location.hash = '';
    revealSection('formulas-lazy');
    expect(window.location.hash).toBe('');

    const section = document.createElement('div');
    section.id = 'formulas-lazy';
    document.body.append(section);
    try {
      await nextFrame();
      await nextFrame();
      expect(window.location.hash).toBe('#formulas-lazy');
    } finally {
      section.remove();
      window.location.hash = '';
    }
  });

  test('a section that never arrives is never claimed in the URL', async () => {
    window.location.hash = '';
    revealSection('formulas-never', Date.now() - 1);
    await nextFrame();
    await nextFrame();
    expect(window.location.hash).toBe('');
  });
});

afterEach(() => {
  window.location.hash = '';
});
