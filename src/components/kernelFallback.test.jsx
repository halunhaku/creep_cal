import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

// The Rust kernel is the default engine. When it cannot load, the workspace used
// to stay on a permanently disabled "Loading kernel…" button with the error
// buried in a collapsed accordion (and RustEngineLoader, which was written for
// exactly this case, was never imported anywhere).
vi.mock('../wasm/creepEngine', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadCreepEngine: () => Promise.reject('WASM load timed out after 15000ms'),
  };
});

describe('kernel load failure', () => {
  test('shows a visible notice, falls back to JavaScript and stays usable', async () => {
    const { default: SingleCalculationDashboard } = await import('./SingleCalculationDashboard');
    render(<SingleCalculationDashboard />);

    const rustButton = await screen.findByRole('button', { name: /Rust WASM/i });
    expect(rustButton).toHaveAttribute('aria-pressed', 'true');   // Rust is the default

    const alert = await screen.findByRole('alert');
    // A bare-string throw across the wasm boundary must still render verbatim.
    expect(alert).toHaveTextContent('WASM load timed out after 15000ms');
    expect(alert.textContent).not.toMatch(/undefined/);

    // …and it must hand control to the JS reference kernel.
    await waitFor(() => expect(screen.getByRole('button', { name: /JS Ref\./i })).toHaveAttribute('aria-pressed', 'true'));
    const calculate = await screen.findByRole('button', { name: /^Calculate/i });
    expect(calculate).toBeEnabled();
    await waitFor(() => expect(screen.getByText(/^Computed$/)).toBeInTheDocument());
  });

  test('the workspace header badge reports the failure instead of claiming "WASM ready"', async () => {
    const { default: App } = await import('../App');
    render(<App />);

    // The badge is decorative chrome that used to be hardcoded green "WASM ready".
    const badge = await screen.findByRole('status');
    await waitFor(() => expect(badge).toHaveTextContent(/WASM unavailable/i));
    expect(badge).not.toHaveTextContent(/WASM ready/i);
    expect(badge.getAttribute('title')).toMatch(/timed out/);
  });

  test('the notice is dismissible and the user can retry the Rust kernel', async () => {
    const { default: SingleCalculationDashboard } = await import('./SingleCalculationDashboard');
    render(<SingleCalculationDashboard />);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Rust WASM/i }));
    // A second failure raises the notice again rather than silently doing nothing.
    await screen.findByRole('alert');
  });
});
