import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

// jsdom cannot fetch the .wasm binary, so only the kernel module is stubbed: the
// comparison wiring, the timing passes and the rendering under test are real.
vi.mock('../wasm-pkg/creep_calculator_engine.js', () => ({
  default: async () => {},
  calculate_aci209_series: (_params, maxDays) => Array.from({ length: maxDays + 1 }, (_, t) => ({ t, phi: 0.5 })),
}));

import Aci209Calculator from './Aci209Calculator';

const compareButton = () => screen.findByRole('button', { name: /compare kernels/i });

async function runComparison() {
  const button = await compareButton();
  await act(async () => { fireEvent.click(button); });
  await waitFor(() => expect(screen.getByText('Rust speed-up')).toBeInTheDocument());
}

describe('kernel comparison', () => {
  test('times both kernels over the full series and reports the speed-up', async () => {
    render(<Aci209Calculator engine="rust" />);
    await runComparison();

    expect(screen.getByText('JS reference')).toBeInTheDocument();
    expect(screen.getByText('Rust WASM')).toBeInTheDocument();
    // The panel states the series length it timed, from the shared constant. Its
    // heading is bilingual and the Chinese half carries its own lang, so the
    // query is on the English half and the whole heading is read as text content.
    const panel = screen.getByText(/^Kernel comparison ·$/).closest('section');
    expect(panel).toHaveTextContent('Kernel comparison · 内核对比');
    expect(panel).toHaveTextContent(/10,000 天序列/);
    expect(screen.getByText('内核对比').getAttribute('lang')).toBe('zh-CN');
    // Both engines were measured, so the ratio is a real number rather than the
    // placeholder the panel falls back to.
    expect(screen.getByText('Rust speed-up').parentElement).toHaveTextContent(/×/);
    // The timings arrive asynchronously and must be announced.
    expect(screen.getByText('Rust speed-up').closest('[role="status"]')).not.toBeNull();
  });

  test('a timing is discarded when a real input changes', async () => {
    render(<Aci209Calculator engine="rust" />);
    await runComparison();

    const humidity = screen.getByLabelText(/Relative Humidity/i);
    fireEvent.change(humidity, { target: { value: '40' } });
    fireEvent.blur(humidity);

    await waitFor(() => expect(screen.queryByText('Rust speed-up')).not.toBeInTheDocument());
  });

  // Target age only selects a point of the already-computed series, so unlike a
  // real input it does not invalidate a timing taken over the whole series.
  test('a timing survives a target-age change', async () => {
    render(<Aci209Calculator engine="rust" />);
    await runComparison();

    const target = screen.getByLabelText(/Target Age/i);
    fireEvent.change(target, { target: { value: '1000' } });
    fireEvent.blur(target);

    await waitFor(() => expect(Number(target.value)).toBe(1000));
    expect(screen.getByText('Rust speed-up')).toBeInTheDocument();
  });
});
