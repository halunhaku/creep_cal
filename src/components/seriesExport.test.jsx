import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Papa from 'papaparse';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import Aci209Calculator from './Aci209Calculator';
import Mc2010Calculator from './Mc2010Calculator';
import B4Calculator from './B4Calculator';
import B4sCalculator from './B4sCalculator';
import Gl2000Calculator from './Gl2000Calculator';
import AashtoCalculator from './AashtoCalculator';

const MODELS = [
  { id: 'aci209', name: 'ACI 209R-92', Calculator: Aci209Calculator, required: 'curingType, t0, H, VS, slump, fineAggregate, airContent, t'.split(', ') },
  { id: 'mc2010', name: 'fib Model Code 2010', Calculator: Mc2010Calculator, required: 'fcm, RH, t0, Ac, u, T, Cs, sigma, t'.split(', ') },
  { id: 'b4', name: 'RILEM Model B4', Calculator: B4Calculator, required: 't0, tPrime, Tcur, Tsh, Tc, h, fc, vS, c, wC, aC, cementType, aggregateType, specimenShape, retarder, flyAsh, superplasticizer, silicaFume, airEntrainingAgent, waterReducer, t'.split(', ') },
  { id: 'b4s', name: 'RILEM Model B4s', Calculator: B4sCalculator, required: 't0, tPrime, Tcur, Tsh, Tc, h, fc, vS, cementType, aggregateType, specimenShape, t'.split(', ') },
  { id: 'gl2000', name: 'GL2000', Calculator: Gl2000Calculator, required: 'fcm28, h, vs, tc, t0, cementType, t'.split(', ') },
  { id: 'aashto', name: 'AASHTO LRFD', Calculator: AashtoCalculator, required: 'fci, H, vs, ti, tc, t'.split(', ') },
];

let downloads;
const realCreateObjectURL = URL.createObjectURL;
const realRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
  downloads = [];
  URL.createObjectURL = (blob) => { downloads.push(blob); return 'blob:mock'; };
  URL.revokeObjectURL = () => {};
});

afterEach(() => {
  URL.createObjectURL = realCreateObjectURL;
  URL.revokeObjectURL = realRevokeObjectURL;
});

describe('single-analysis CSV export', () => {
  // Regression: exportSeries() wrote a "# key,value" metadata block as the first
  // line and named the time column "t_days", so the batch importer read the
  // comment as the header row and rejected the app's own export with
  // "Missing required columns: <all 21 of them>".
  test.each(MODELS)('$name export satisfies the batch schema and round-trips', async ({ Calculator, required }) => {
    render(<Calculator engine="js" />);
    await waitFor(() => expect(screen.getByText(/^Computed$/)).toBeInTheDocument(), { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));
    expect(downloads).toHaveLength(1);

    const text = await downloads[0].text();
    const { data, errors } = Papa.parse(text, { header: true, skipEmptyLines: true });
    const headers = Object.keys(data[0] ?? {});

    expect(errors).toHaveLength(0);
    expect(headers).toEqual(expect.arrayContaining(required));
    expect(headers).not.toContain('t_days');
    expect(data).toHaveLength(10001);
    expect(Number(data[0].t)).toBe(0);
    expect(Number(data[10000].t)).toBe(10000);
  });

  test('exported input columns match what was configured', async () => {
    render(<B4Calculator engine="js" />);
    await waitFor(() => expect(screen.getByText(/^Computed$/)).toBeInTheDocument(), { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));
    const { data } = Papa.parse(await downloads[0].text(), { header: true, skipEmptyLines: true });
    expect(data[0].cementType).toBe('R');
    expect(data[0].aggregateType).toBe('No Information');
    expect(Number(data[0].h)).toBe(50);
    expect(Number(data[0].targetAge)).toBeNaN();   // targetAge is UI-only, not a batch column
    expect(data[0].targetAge).toBeUndefined();
  });

  // Regression: the export wrote the parameters currently on screen beside the
  // results of the *previous* run. Measured before the fix: after loading a saved
  // set back (H 35, whose phi(365) is 1.470112) the file said H=35 while carrying
  // phi=0.980565, the value computed at H=90 — a 33 % error in a file that is
  // meant to be re-imported into the batch pipeline.
  test('the exported inputs are the ones that produced the exported results', async () => {
    render(<Aci209Calculator engine="js" />);
    await waitFor(() => expect(screen.getByText(/^Computed$/)).toBeInTheDocument(), { timeout: 5000 });

    const humidity = screen.getByLabelText(/Relative Humidity/i);
    const setHumidity = async (value) => {
      fireEvent.change(humidity, { target: { value } });
      fireEvent.blur(humidity);
      await waitFor(() => expect(humidity.value).toBe(value));
    };
    const run = async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Calculate/i }));
      await waitFor(() => expect(screen.getByText(/^Computed$/)).toBeInTheDocument());
    };

    await setHumidity('35');
    await run();
    fireEvent.change(screen.getByLabelText(/New parameter set name/i), { target: { value: 'dry' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByLabelText(/Saved parameter set/i)).toHaveValue('dry'));

    await setHumidity('90');
    await run();
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    await waitFor(() => expect(screen.getByLabelText(/Relative Humidity/i).value).toBe('35'));

    fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));
    const { data } = Papa.parse(await downloads[0].text(), { header: true, skipEmptyLines: true });
    const at365 = data.find((row) => Number(row.t) === 365);

    // The file must describe one case, not two: the H it names has to be the H
    // whose result it carries.
    expect(Number(at365.H)).toBe(90);
    expect(Number(at365.phi)).toBeCloseTo(0.980565, 5);
  });
});
