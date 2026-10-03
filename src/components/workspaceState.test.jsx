import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import App from '../App';

const CALC_HEADING = /time-dependent concrete analysis/i;

async function editHumidity(value) {
  const input = await screen.findByLabelText(/Relative Humidity/i);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
  await waitFor(() => expect(input.value).toBe(value));
  return input;
}

/**
 * Regression: App renders exactly one workspace at a time, so both of these used
 * to be destroyed by visiting another tab. Measured before the fix: an edited
 * humidity reverted (70 -> 35 -> 70), and a loaded dataset plus its result matrix
 * disappeared — the documented cost was re-uploading the file to check a formula.
 */
describe('switching workspaces keeps the user\'s work', () => {
  test('an edited parameter is still there on return', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: CALC_HEADING });
    await editHumidity('35');

    fireEvent.click(screen.getByRole('button', { name: 'Batch' }));
    await screen.findByRole('heading', { name: /dataset pipeline/i });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate' }));
    await screen.findByRole('heading', { name: CALC_HEADING });

    expect(screen.getByLabelText(/Relative Humidity/i).value).toBe('35');
  });

  test('a loaded dataset and its results are still there on return', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Batch' }));
    fireEvent.click(await screen.findByRole('button', { name: /load demo sweep/i }));
    await screen.findByText('Rows detected');
    const rowsBefore = screen.getByText('Rows detected').nextElementSibling.textContent;

    fireEvent.click(screen.getByRole('button', { name: 'Reference' }));
    await screen.findByRole('heading', { name: /model standards and equations/i });
    fireEvent.click(screen.getByRole('button', { name: 'Batch' }));

    await screen.findByText('Rows detected');
    expect(screen.getByText('Rows detected').nextElementSibling.textContent).toBe(rowsBefore);
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
  });

  test('the chosen model and kernel survive too', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: CALC_HEADING });

    fireEvent.click(screen.getByRole('button', { name: /RILEM Model B4s/i }));
    await screen.findByRole('heading', { name: /RILEM Model B4s/i });
    fireEvent.click(screen.getByRole('button', { name: /JS Ref\./i }));

    fireEvent.click(screen.getByRole('button', { name: 'Reference' }));
    await screen.findByRole('heading', { name: /model standards and equations/i });
    fireEvent.click(screen.getByRole('button', { name: 'Calculate' }));

    await waitFor(() => expect(screen.getByRole('button', { name: /RILEM Model B4s/i })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('button', { name: /JS Ref\./i })).toHaveAttribute('aria-pressed', 'true');
  });
});
