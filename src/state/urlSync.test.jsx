import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import App from '../App';
import { getState } from './appStore';
import { buildSearch, readUrl } from './urlSync';

const CALC_HEADING = /time-dependent concrete analysis/i;
const BATCH_HEADING = /dataset pipeline/i;
const DOCS_HEADING = /model standards and equations/i;

function goTo(url) {
  window.history.replaceState(null, '', url);
}

/**
 * Read one parameter rather than the whole query string: when the wasm cannot
 * load, the kernel fallback legitimately adds `?kernel=js`, and these tests are
 * about the workspace/model/kernel each being written at all.
 */
function param(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * Regression: the workspace, model and kernel were memory-only. Nothing could be
 * linked to, Back left the app, and a refresh started over.
 */
describe('navigation state lives in the URL', () => {
  test('a deep link opens the workspace, model and kernel it names', async () => {
    goTo('/?mode=docs&model=b4s&kernel=js');
    render(<App />);

    await screen.findByRole('heading', { name: DOCS_HEADING });
    expect(screen.getByRole('button', { name: /RILEM Model B4s/i })).toHaveAttribute('aria-pressed', 'true');
  });

  test('the calculation workspace honours ?model and ?kernel', async () => {
    goTo('/?mode=single&model=b4&kernel=js');
    render(<App />);

    await screen.findByRole('heading', { name: CALC_HEADING });
    await waitFor(() => expect(screen.getByRole('button', { name: /RILEM Model B4\b/i })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('button', { name: /JS Ref\./i })).toHaveAttribute('aria-pressed', 'true');
  });

  test('changing workspace writes the URL, and Back returns to the previous one', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: CALC_HEADING });

    fireEvent.click(screen.getByRole('button', { name: 'Batch' }));
    await screen.findByRole('heading', { name: BATCH_HEADING });
    expect(param('mode')).toBe('batch');

    fireEvent.click(screen.getByRole('button', { name: 'Reference' }));
    await screen.findByRole('heading', { name: DOCS_HEADING });
    expect(param('mode')).toBe('docs');

    await act(async () => { window.history.back(); });

    await screen.findByRole('heading', { name: BATCH_HEADING });
    await waitFor(() => expect(param('mode')).toBe('batch'));
  });

  /*
   * Regression: defaults are omitted from the URL, and apply() read an omitted
   * key as "no information" instead of "the default". Back from ?mode=batch to /
   * therefore left the batch workspace on screen while the address bar said the
   * default — and the next in-workspace selection wrote ?mode=batch back into the
   * URL the user had just backed out of. Measured: url "", store.mode "batch".
   */
  test('Back to the default URL returns to the default workspace', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: CALC_HEADING });

    fireEvent.click(screen.getByRole('button', { name: 'Batch' }));
    await screen.findByRole('heading', { name: BATCH_HEADING });

    await act(async () => { window.history.back(); });

    await screen.findByRole('heading', { name: CALC_HEADING });
    await waitFor(() => expect(param('mode')).toBeNull());
    expect(getState().mode).toBe('single');
  });

  test('a kernel change after Back replaces instead of pushing', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: CALC_HEADING });

    fireEvent.click(screen.getByRole('button', { name: 'Batch' }));
    await screen.findByRole('heading', { name: BATCH_HEADING });
    await act(async () => { window.history.back(); });
    await screen.findByRole('heading', { name: CALC_HEADING });

    // A selection inside a workspace is not a navigation: it must not bury Back.
    const before = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: /JS Ref\./i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /JS Ref\./i })).toHaveAttribute('aria-pressed', 'true'));
    expect(window.history.length).toBe(before);
    expect(param('kernel')).toBe('js');
  });

  test('a deep link that spells out a default still applies the rest, and is left alone', async () => {
    goTo('/?mode=single&model=b4&kernel=js');
    render(<App />);
    await screen.findByRole('heading', { name: CALC_HEADING });
    await waitFor(() => expect(screen.getByRole('button', { name: /RILEM Model B4\b/i })).toHaveAttribute('aria-pressed', 'true'));
    expect(getState().engine).toBe('js');
    // Nothing changed in the store, so the address bar keeps exactly what was opened.
    expect(window.location.search).toBe('?mode=single&model=b4&kernel=js');
  });

  test('a refresh keeps the workspace and the edited parameters', async () => {
    const first = render(<App />);
    await screen.findByRole('heading', { name: CALC_HEADING });

    const humidity = await screen.findByLabelText(/Relative Humidity/i);
    fireEvent.change(humidity, { target: { value: '35' } });
    fireEvent.blur(humidity);
    await waitFor(() => expect(humidity.value).toBe('35'));

    fireEvent.click(screen.getByRole('button', { name: 'Batch' }));
    await screen.findByRole('heading', { name: BATCH_HEADING });

    // A reload: same URL, fresh component tree, fresh store reads.
    first.unmount();
    render(<App />);

    await screen.findByRole('heading', { name: BATCH_HEADING });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate' }));
    await screen.findByRole('heading', { name: CALC_HEADING });
    expect(screen.getByLabelText(/Relative Humidity/i).value).toBe('35');
  });
});

describe('URL parsing', () => {
  test('ignores unknown values instead of breaking the app', () => {
    expect(readUrl('?mode=nope&model=xyz&kernel=rust')).toEqual({ engine: 'rust' });
    expect(readUrl('?mode=batch&model=b4')).toEqual({ mode: 'batch', model: 'b4' });
  });

  test('omits defaults so a plain visit has a clean URL', () => {
    expect(buildSearch({ mode: 'single', model: 'aci209', engine: 'rust' })).toBe('');
    expect(buildSearch({ mode: 'batch', model: 'b4', engine: 'js' })).toBe('?mode=batch&model=b4&kernel=js');
  });
});
