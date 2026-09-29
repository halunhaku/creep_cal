import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Papa from 'papaparse';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import Aci209Calculator from './Aci209Calculator';
import Mc2010Calculator from './Mc2010Calculator';
import B4Calculator from './B4Calculator';
import B4sCalculator from './B4sCalculator';

const MODELS = [
  { id: 'aci209', name: 'ACI 209R-92', Calculator: Aci209Calculator, required: 'curingType, t0, H, VS, slump, fineAggregate, airContent, t'.split(', ') },
  { id: 'mc2010', name: 'fib Model Code 2010', Calculator: Mc2010Calculator, required: 'fcm, RH, t0, Ac, u, T, Cs, sigma, t'.split(', ') },
  { id: 'b4', name: 'RILEM Model B4', Calculator: B4Calculator, required: 't0, tPrime, Tcur, Tsh, Tc, h, fc, vS, c, wC, aC, cementType, aggregateType, specimenShape, retarder, flyAsh, superplasticizer, silicaFume, airEntrainingAgent, waterReducer, t'.split(', ') },
  { id: 'b4s', name: 'RILEM Model B4s', Calculator: B4sCalculator, required: 't0, tPrime, Tcur, Tsh, Tc, h, fc, vS, cementType, aggregateType, specimenShape, t'.split(', ') },
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
});
