import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import Aci209Calculator from './Aci209Calculator';
import B4Calculator from './B4Calculator';
import Mc2010Calculator from './Mc2010Calculator';
import ModelCalculator from './ModelCalculator';

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

  /*
   * Regression: wasm errors were surfaced only inside the collapsed "Calculation
   * log" accordion, and a bare-string throw from the Rust kernel made the message
   * read "Calculation failed: undefined".
   *
   * Driven by a stub config rather than by MC2010: the workspace now checks that
   * model's |σ| ≤ 0.6·fcm rule before running (see the next case), and what these
   * two tests are about is the notice plumbing itself — a kernel that refuses an
   * input has to say so in a visible, dismissible alert.
   */
  const stubConfig = (refuses) => ({
    id: 'stub',
    name: 'Stub model',
    descriptions: { js: 'stub', rust: 'stub' },
    initialParams: { x: 1, targetAge: 5 },
    paramsConfig: [
      { name: 'x', label: 'X', min: 0, max: 10 },
      { name: 'targetAge', label: 'Target Age', min: 1, max: 100 },
    ],
    loadingMessage: 'loading',
    readyMessage: 'ready',
    calculateJs() {
      if (refuses.value) throw new RangeError('Stub kernel refused this input.');
      return [{ t: 0, v: 0 }, { t: 1, v: 1 }];
    },
    calculateRust() { return this.calculateJs(); },
    getSummary: () => ({ primary: 1 }),
    chartLines: [{ dataKey: 'v', stroke: 'var(--primary)', name: 'V' }],
  });

  test('a rejected calculation shows the engine message in a visible alert', async () => {
    const refuses = { value: true };
    render(<ModelCalculator engine="js" config={stubConfig(refuses)} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Stub kernel refused this input/);
    expect(alert.textContent).not.toMatch(/undefined/);

    fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  test('a successful calculation clears a previous calculation error', async () => {
    const refuses = { value: true };
    render(<ModelCalculator engine="js" config={stubConfig(refuses)} />);
    await screen.findByRole('alert');

    refuses.value = false;
    fireEvent.click(screen.getByRole('button', { name: /^Calculate/i }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByText(/^Computed$/)).toBeInTheDocument();
  });

  // Regression: |σ| ≤ 0.6·fcm spans two fields, so the per-field ranges could not
  // express it — sigma's own range allows 78 MPa, which is only legal at fcm = 130.
  // The button said "Calculate", the run failed, and the reason arrived as an alert
  // after the fact instead of in the panel that owns the fields.
  test('a cross-field rule is reported before the run, and points at the field', async () => {
    render(<Mc2010Calculator engine="js" />);
    await waitFor(() => expect(screen.getByText(/^Computed$/)).toBeInTheDocument());

    const sigma = screen.getByLabelText(/Initial Concrete Stress/i);
    fireEvent.change(sigma, { target: { value: '78' } });   // 0.6 x fcm(40) = 24 MPa
    fireEvent.blur(sigma);

    const button = await screen.findByRole('button', { name: /inputs out of range/i });
    expect(button).toBeEnabled();
    expect(screen.getByText(/0\.6·fcm = 24 MPa/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(sigma).toHaveFocus();

    // Bringing sigma back inside the rule makes the panel ready again.
    fireEvent.change(sigma, { target: { value: '12' } });
    fireEvent.blur(sigma);
    await waitFor(() => expect(screen.getByRole('button', { name: /^Calculate/i })).toBeEnabled());
  });

  test('clearing a bounded numeric field is reported instead of silently committing 0', async () => {
    render(<Aci209Calculator engine="js" />);
    const VS = await screen.findByLabelText(/Volume-Surface Ratio/i);
    fireEvent.change(VS, { target: { value: '' } });
    fireEvent.blur(VS);
    await waitFor(() => expect(screen.getByText(/inputs require attention/i)).toBeInTheDocument());

    // This used to assert the button was disabled, which was the audit's P2-3: a
    // disabled button cannot be focused, so a keyboard user could not reach it to
    // find out why nothing happened, and nothing moved them to the field at fault.
    // It now stays reachable, says what is wrong, and puts the cursor there.
    const button = screen.getByRole('button', { name: /inputs require attention/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(VS).toHaveFocus();
  });

  // Regression: the "Instantaneous q₁" readout was computed as J − C₀ − C_d, but
  // the kernel returns J = q₁ + β(Tc)·C₀ + C_d, so it drifted with the post-loading
  // temperature: 28.15 at Tc = 20 °C (the default, which hid it), 64.59 at 30 °C and
  // negative at −25 °C. q₁ is the instantaneous compliance and cannot depend on Tc.
  test('Instantaneous q1 does not drift with the post-loading temperature', async () => {
    render(<B4Calculator engine="js" />);
    await waitFor(() => expect(screen.getByText(/^Computed$/)).toBeInTheDocument());

    const q1Value = () => {
      const row = screen.getByText(/Instantaneous q₁/).parentElement;
      return Number(row.textContent.replace(/[^\d.+-]/g, ''));
    };
    const at20 = q1Value();
    expect(at20).toBeCloseTo(28.146, 2);

    const temperature = screen.getByLabelText(/Post-Loading Temperature/i);
    fireEvent.change(temperature, { target: { value: '30' } });
    fireEvent.blur(temperature);
    fireEvent.click(screen.getByRole('button', { name: /^Calculate/i }));
    await waitFor(() => expect(screen.getByText(/^Computed$/)).toBeInTheDocument());

    expect(q1Value()).toBeCloseTo(at20, 2);
  });

  test('the Data tab states how much of the series it is showing', async () => {    render(<Aci209Calculator engine="js" />);
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

  // Editing an input lists old → new under the metrics so the stale badge
  // names what moved. (Recalculating then overlays the superseded run as a
  // dashed series — that half lives inside the SVG chart, which jsdom renders
  // at zero size, so it is verified in a live browser instead.)
  test('changing an input lists old and new values under the metrics', async () => {
    const { container } = render(<Aci209Calculator engine="js" />);
    await waitFor(() => expect(screen.getByText(/^Computed$/)).toBeInTheDocument());
    fireEvent.change(container.querySelector('#param-select-curingType'), { target: { value: 'steam' } });
    await waitFor(() => expect(screen.getByText(/Changed since last run/)).toBeInTheDocument());
    expect(screen.getByText(/moist → steam/)).toBeInTheDocument();
  });
});
