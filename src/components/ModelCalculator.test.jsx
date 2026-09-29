import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import Aci209Calculator from './Aci209Calculator';
import Mc2010Calculator from './Mc2010Calculator';

describe('ModelCalculator workspace state', () => {
  test('an initial calculation runs automatically and reports "Computed"', async () => {
    render(<Aci209Calculator engine="js" />);
    await waitFor(() => expect(screen.getByText(/^Computed$/)).toBeInTheDocument());
    expect(screen.getByText(/1\.17756/)).toBeInTheDocument();
  });

  // Regression: every parameter change set `dirty`, including `targetAge`, which
  // only selects a point of the already-computed 0–10,000 day series. The metric
  // updated immediately while the badge claimed the results were out of date.
  test('changing only Target Age updates the metric without marking results stale', async () => {
    render(<Aci209Calculator engine="js" />);
    await waitFor(() => expect(screen.getByText(/^Computed$/)).toBeInTheDocument());

    const target = screen.getByLabelText(/Target Age/i);
    fireEvent.change(target, { target: { value: '1000' } });
    fireEvent.blur(target);

    await waitFor(() => expect(Number(target.value)).toBe(1000));
    await waitFor(() => expect(screen.getByText(/1\.322746/)).toBeInTheDocument());
    expect(screen.queryByText(/Results out of date/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/当前结果待更新/i)).not.toBeInTheDocument();
  });

  test('changing a real input does mark results stale until recalculated', async () => {
    render(<Aci209Calculator engine="js" />);
    await waitFor(() => expect(screen.getByText(/^Computed$/)).toBeInTheDocument());

    const humidity = screen.getByLabelText(/Relative Humidity/i);
    fireEvent.change(humidity, { target: { value: '40' } });
    fireEvent.blur(humidity);

    await waitFor(() => expect(screen.getByText(/Results out of date/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^Calculate/i }));
    await waitFor(() => expect(screen.getByText(/^Computed$/)).toBeInTheDocument());
  });

  // Regression: wasm errors were surfaced only inside the collapsed
  // "Calculation log" accordion, and a bare-string throw from the Rust kernel made
  // the message read "Calculation failed: undefined".
  test('a rejected calculation shows the engine message in a visible alert', async () => {
    render(<Mc2010Calculator engine="js" />);
    const sigma = await screen.findByLabelText(/Initial Concrete Stress/i);
    fireEvent.change(sigma, { target: { value: '78' } });   // 0.6 x fcm(40) = 24 MPa
    fireEvent.blur(sigma);

    const button = await screen.findByRole('button', { name: /^Calculate/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/0\.6/);
    expect(alert.textContent).not.toMatch(/undefined/);

    fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  test('a successful calculation clears a previous calculation error', async () => {
    render(<Mc2010Calculator engine="js" />);
    const sigma = await screen.findByLabelText(/Initial Concrete Stress/i);
    fireEvent.change(sigma, { target: { value: '78' } });
    fireEvent.blur(sigma);
    fireEvent.click(await screen.findByRole('button', { name: /^Calculate/i }));
    await screen.findByRole('alert');

    fireEvent.change(sigma, { target: { value: '12' } });
    fireEvent.blur(sigma);
    fireEvent.click(screen.getByRole('button', { name: /^Calculate/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  test('clearing a bounded numeric field is reported instead of silently committing 0', async () => {
    render(<Aci209Calculator engine="js" />);
    const VS = await screen.findByLabelText(/Volume-Surface Ratio/i);
    fireEvent.change(VS, { target: { value: '' } });
    fireEvent.blur(VS);
    await waitFor(() => expect(screen.getByText(/inputs require attention/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /inputs require attention/i })).toBeDisabled();
  });

  test('the Data tab states how much of the series it is showing', async () => {
    render(<Aci209Calculator engine="js" />);
    await waitFor(() => expect(screen.getByText(/^Computed$/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^Data$/ }));

    // 10,001 computed points are sampled down to a few dozen rows; the table used
    // to be silently truncated with no indication.
    const notice = screen.getByText(/Showing \d+ of 10001 computed points/);
    const shown = Number(notice.textContent.match(/Showing (\d+) of/)[1]);
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(100);
    expect(notice).toHaveTextContent(/Export CSV contains the full series/);
  });
});
