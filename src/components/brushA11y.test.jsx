import { render, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { useRef } from 'react';
import { Brush, Line, LineChart } from 'recharts';
import { BrushA11ySync, patchBrushTravellers, resolveBrushValues } from './brushA11y';

describe('resolveBrushValues', () => {
  const data = [{ t: 0 }, { t: 5 }, { t: 10 }];

  test('defaults to the full range when no indices are tracked yet', () => {
    expect(resolveBrushValues(data, 't')).toEqual({ min: 0, max: 10, startValue: 0, endValue: 10 });
  });

  test('reads the current handle positions in data units', () => {
    expect(resolveBrushValues(data, 't', 1, 2)).toEqual({ min: 0, max: 10, startValue: 5, endValue: 10 });
  });

  test('clamps stale indices after the data shrinks', () => {
    expect(resolveBrushValues(data, 't', 0, 99)).toEqual({ min: 0, max: 10, startValue: 0, endValue: 10 });
  });

  test('ignores a gap in the middle as long as the endpoints are numeric', () => {
    const sparse = [{ t: 0 }, {}, { t: 10 }];
    expect(resolveBrushValues(sparse, 't', 0, 2)).toEqual({ min: 0, max: 10, startValue: 0, endValue: 10 });
  });

  test('falls back to index units when an endpoint is not numeric', () => {
    const sparse = [{ t: 0 }, { t: 5 }, {}];
    expect(resolveBrushValues(sparse, 't', 0, 2)).toEqual({ min: 0, max: 2, startValue: 0, endValue: 2 });
  });

  test('returns null without data', () => {
    expect(resolveBrushValues([], 't')).toBeNull();
  });
});

describe('patchBrushTravellers', () => {
  test('stamps min/max/now/text on both handles', () => {
    const root = document.createElement('div');
    root.innerHTML = '<g class="recharts-brush-traveller" aria-valuenow="12.5"></g>'
      + '<g class="recharts-brush-traveller" aria-valuenow="87.5"></g>';
    const patched = patchBrushTravellers(root, {
      min: 0, max: 10, startValue: 0, endValue: 10, format: (value) => `t=${value}`,
    });
    expect(patched).toBe(2);
    const [start, end] = root.querySelectorAll('.recharts-brush-traveller');
    for (const handle of [start, end]) {
      expect(handle).toHaveAttribute('aria-valuemin', '0');
      expect(handle).toHaveAttribute('aria-valuemax', '10');
    }
    expect(start).toHaveAttribute('aria-valuenow', '0');
    expect(start).toHaveAttribute('aria-valuetext', 't=0');
    expect(end).toHaveAttribute('aria-valuenow', '10');
    expect(end).toHaveAttribute('aria-valuetext', 't=10');
  });

  test('does nothing when no Brush is rendered', () => {
    expect(patchBrushTravellers(document.createElement('div'), {
      min: 0, max: 10, startValue: 0, endValue: 10,
    })).toBe(0);
  });
});

describe('BrushA11ySync with a real Brush', () => {
  // Fixed-size chart on purpose: ResponsiveContainer reports 0x0 under jsdom,
  // and Brush renders nothing at zero width.
  function Harness({ data }) {
    const ref = useRef(null);
    return (
      <div ref={ref}>
        <BrushA11ySync containerRef={ref} data={data} dataKey="t" format={(value) => `t=${value}`} />
        <LineChart width={400} height={300} data={data}>
          <Line dataKey="v" dot={false} isAnimationActive={false} />
          <Brush data={data} dataKey="t" height={18} travellerWidth={5} ariaLabel="Series range" />
        </LineChart>
      </div>
    );
  }

  test('both handles expose min/max/valuetext in data units', async () => {
    const { container } = render(<Harness data={[{ t: 0, v: 1 }, { t: 5, v: 2 }, { t: 10, v: 3 }]} />);
    await waitFor(() => {
      expect(container.querySelectorAll('.recharts-brush-traveller')).toHaveLength(2);
    });
    const [start, end] = container.querySelectorAll('.recharts-brush-traveller');
    for (const handle of [start, end]) {
      expect(handle).toHaveAttribute('aria-valuemin', '0');
      expect(handle).toHaveAttribute('aria-valuemax', '10');
    }
    // The pixel coordinates Recharts writes are gone; the values are days.
    expect(start).toHaveAttribute('aria-valuenow', '0');
    expect(start).toHaveAttribute('aria-valuetext', 't=0');
    expect(end).toHaveAttribute('aria-valuenow', '10');
    expect(end).toHaveAttribute('aria-valuetext', 't=10');
  });
});
