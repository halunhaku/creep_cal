import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import App from '../App';
import { getState, resetModelParams, saveParameterSet } from '../state/appStore';

const CALC_HEADING = /time-dependent concrete analysis/i;

async function openCalculate() {
  render(<App />);
  await screen.findByRole('heading', { name: CALC_HEADING });
  return screen.findByLabelText(/Relative Humidity/i);
}

/**
 * Regression: the audit found no way to keep a case — comparing two mixtures
 * meant re-typing every parameter — and, once parameters persist locally, no way
 * back to the shipped values.
 *
 * The store is reset before each case by setupTests.
 */
describe('parameter sets', () => {
  test('a saved set brings a whole case back after the fields were changed', async () => {
    const humidity = await openCalculate();
    fireEvent.change(humidity, { target: { value: '35' } });
    fireEvent.blur(humidity);
    await waitFor(() => expect(humidity.value).toBe('35'));

    fireEvent.change(screen.getByLabelText(/New parameter set name/i), { target: { value: 'dry site' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByLabelText(/Saved parameter set/i)).toHaveValue('dry site'));

    // Change the case, then load the saved one back.
    fireEvent.change(humidity, { target: { value: '90' } });
    fireEvent.blur(humidity);
    await waitFor(() => expect(humidity.value).toBe('90'));

    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    await waitFor(() => expect(screen.getByLabelText(/Relative Humidity/i).value).toBe('35'));
  });

  test('a set is per model and survives a reload', async () => {
    saveParameterSet('b4', 'long span', { t0: 28, h: 120 });
    const first = render(<App />);
    await screen.findByRole('heading', { name: CALC_HEADING });
    first.unmount();

    render(<App />);
    await screen.findByRole('heading', { name: CALC_HEADING });
    // The ACI model is selected, so B4's set must not be offered here.
    expect(screen.getByText(/No saved sets for this model yet/i)).toBeInTheDocument();
    expect(getState().parameterSets.b4).toEqual([{ name: 'long span', params: { t0: 28, h: 120 } }]);
  });

  test('reset returns the model to its shipped defaults', async () => {
    const humidity = await openCalculate();
    fireEvent.change(humidity, { target: { value: '35' } });
    fireEvent.blur(humidity);
    await waitFor(() => expect(humidity.value).toBe('35'));

    fireEvent.click(screen.getByRole('button', { name: /^Reset$/i }));
    await waitFor(() => expect(screen.getByLabelText(/Relative Humidity/i).value).toBe('70'));
  });

  test('saving an existing name replaces it rather than duplicating', () => {
    saveParameterSet('aci209', 'case', { H: 50 });
    saveParameterSet('aci209', 'case', { H: 80 });
    expect(getState().parameterSets.aci209).toEqual([{ name: 'case', params: { H: 80 } }]);
  });

  test('a blank name is refused instead of creating an unnamed set', () => {
    saveParameterSet('aci209', '   ', { H: 50 });
    expect(getState().parameterSets.aci209).toBeUndefined();
  });

  test('resetModelParams forgets the edits', () => {
    saveParameterSet('aci209', 'x', { H: 1 });
    resetModelParams('aci209');
    expect(getState().paramsByModel.aci209).toBeUndefined();
  });
});
