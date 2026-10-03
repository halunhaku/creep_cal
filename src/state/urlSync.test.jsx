import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import App from '../App';
import { buildSearch, readUrl } from '../state/urlSync';

const CALC_HEADING = /time-dependent concrete analysis/i;
const BATCH_HEADING = /dataset pipeline/i;
const DOCS_HEADING = /model standards and equations/i;

function goTo(url) {
  window.history.replaceState(null, '', url);
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
    expect(window.location.search).toBe('?mode=batch');

    fireEvent.click(screen.getByRole('button', { name: 'Reference' }));
    await screen.findByRole('heading', { name: DOCS_HEADING });
    expect(window.location.search).toBe('?mode=docs');

    await act(async () => { window.history.back(); });

    await screen.findByRole('heading', { name: BATCH_HEADING });
    await waitFor(() => expect(window.location.search).toBe('?mode=batch'));
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
