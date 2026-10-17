import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

test('switches between calculation, batch, and reference workspaces', async () => {
  render(<App />);

  await screen.findByRole('heading', { name: /time-dependent concrete analysis/i });
  expect(screen.getByRole('button', { name: /ACI 209R-92/i })).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(screen.getByRole('button', { name: 'Batch' }));
  await screen.findByRole('heading', { name: /dataset pipeline/i });

  fireEvent.click(screen.getByRole('button', { name: 'Reference' }));
  await screen.findByRole('heading', { name: /model standards and equations/i });
});

/*
 * The entry point resolves the first workspace before mounting and hands it to App
 * as `initialWorkspace`, so the first commit already contains the workspace instead
 * of a suspense fallback (React holds a committed fallback for 300 ms, which was a
 * flat 300 ms of spinner on every load — see index.jsx and `first-load-single` in
 * scripts/benchmark.mjs). This pins the contract App has to keep: render the given
 * component directly, and keep using the lazy path for every other workspace.
 */
test('renders the workspace the entry point already resolved, without a spinner', async () => {
  function PretendWorkspace() {
    return <h2>Resolved before mount</h2>;
  }
  render(<App initialWorkspace={{ mode: 'single', Component: PretendWorkspace }} />);

  expect(screen.getByRole('heading', { name: 'Resolved before mount' })).toBeInTheDocument();
  // The lazy dashboard must not have been mounted beside it: this is one workspace.
  expect(screen.queryByRole('heading', { name: /time-dependent concrete analysis/i })).not.toBeInTheDocument();

  // Switching away still goes through the lazy component, which is the path a
  // user-initiated switch takes and where the spinner belongs.
  fireEvent.click(screen.getByRole('button', { name: 'Batch' }));
  await screen.findByRole('heading', { name: /dataset pipeline/i });
});
