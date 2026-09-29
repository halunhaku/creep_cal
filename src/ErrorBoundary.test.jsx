import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

// Simulate a workspace that crashes while rendering.
vi.mock('./components/BatchCalculator', () => ({
  default: () => { throw new Error('simulated batch workspace crash'); },
}));

describe('ErrorBoundary containment', () => {
  test('a crash in one workspace does not trap the other workspaces', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { default: App } = await import('./App');
    render(<App />);

    await screen.findByRole('heading', { name: /time-dependent concrete analysis/i });

    fireEvent.click(screen.getByRole('button', { name: 'Batch' }));
    await screen.findByText(/Something went wrong/i);

    // App.jsx renders <ErrorBoundary key={activeMode}>: switching workspace
    // remounts the boundary, so the healthy page must come back. Without the key
    // the fallback used to stay on screen for every workspace.
    fireEvent.click(screen.getByRole('button', { name: 'Calculate' }));
    await screen.findByRole('heading', { name: /time-dependent concrete analysis/i });
    expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reference' }));
    await screen.findByRole('heading', { name: /model standards and equations/i });
    expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
  });

  test('the fallback still offers refresh and retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { default: App } = await import('./App');
    render(<App />);
    await screen.findByRole('heading', { name: /time-dependent concrete analysis/i });

    fireEvent.click(screen.getByRole('button', { name: 'Batch' }));
    await screen.findByText(/Something went wrong/i);
    expect(screen.getByRole('button', { name: /Refresh page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();

    // Retry re-renders the crashing workspace, so the boundary catches again
    // rather than losing the error state.
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
    await waitFor(() => expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument());
  });
});
