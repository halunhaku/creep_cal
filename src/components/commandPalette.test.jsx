import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import App from '../App';
import { getState, saveParameterSet } from '../state/appStore';

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
