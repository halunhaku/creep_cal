import { describe, expect, test } from 'vitest';
import { stampVolatile } from '../scripts/stampVolatile.mjs';

/**
 * `npm run screenshots` drives the real app, so the PNGs carry the kernel's own
 * measured runtime. Three captures of one unchanged build gave three different
 * images, which made the committed screenshots unreviewable: a diff showed
 * movement wherever a timing happened to land, and the shell refactor's commit
 * ended up carrying six images that had not actually changed.
 *
 * These pin the property that fixes it — captures that differ only in a live
 * value stamp to the same text — rather than the exact substitution, so the
 * rules can move without the guarantee moving.
 *
 * The markup below is copied from the real render sites: `{value} <small>ms</small>`
 * in the comparison panel, `{value}×` for the speed-up, and a whole sentence in
 * the log.
 */

const render = (html) => {
  const root = document.createElement('div');
  root.innerHTML = html;
  stampVolatile(root);
  return root.textContent.replace(/\s+/g, ' ').trim();
};

describe('stamping live measurements out of a capture', () => {
  test('two runs that differ only in a timing stamp identically', () => {
    // The whole point: different measurements, one image.
    const first = render('<div class="mt-1 font-mono">1.90 ms</div>');
    const second = render('<div class="mt-1 font-mono">3.10 ms</div>');
    expect(first).toBe(second);
  });

  test('the comparison panel normalises even though the unit is a sibling', () => {
    // `{value} <small>ms</small>` and `{value}×` put the number and its unit in
    // different nodes, so a rule that reads one node at a time misses them.
    for (const [ms, expected] of [['0.7', '— ms'], ['1.1', '— ms']]) {
      expect(render(`<div class="font-mono">${ms} <small>ms</small></div>`)).toBe(expected);
      expect(render(`<div class="font-mono"><span>${ms}</span> <small>ms</small></div>`)).toBe(expected);
    }
    expect(render('<div class="font-mono">0.64×</div>')).toBe('—×');
    expect(render('<div class="font-mono"><span>1.90</span>×</div>')).toBe('—×');
  });

  test('the log keeps its message and loses its timing and clock', () => {
    expect(render('<li>10:30:08 Calculation completed in 1.90 ms.</li>'))
      .toBe('— Calculation completed in — ms.');
    expect(render('<li>10:31:41 Calculation completed in 2.40 ms.</li>'))
      .toBe('— Calculation completed in — ms.');
  });

  test('every clock shape the browser may choose is covered', () => {
    // `toLocaleTimeString()` is locale-dependent and the locale is not ours.
    for (const clock of ['10:30:08', '10:30:08 AM', '上午10:30:08']) {
      expect(render(`<li>${clock} done</li>`)).toBe('— done');
    }
  });

  test('values that are not measurements are left alone', () => {
    // A fix that blanks more than the timings would quietly corrupt the images.
    expect(render('<div>365 days</div>')).toBe('365 days');
    expect(render('<div>1.17756 <span>dimensionless</span></div>')).toBe('1.17756 dimensionless');
    expect(render('<div>10,000 天序列</div>')).toBe('10,000 天序列');
    expect(render('<div>Float64 · Rust WASM · JS reference</div>'))
      .toBe('Float64 · Rust WASM · JS reference');
  });

  test('stamping is idempotent, so a re-run cannot drift further', () => {
    const html = '<div><span>0.7</span> <small>ms</small></div><li>10:30:08 in 1.90 ms</li>';
    const once = render(html);
    const root = document.createElement('div');
    root.innerHTML = html;
    stampVolatile(root);
    const twice = root.textContent;
    stampVolatile(root);
    expect(root.textContent).toBe(twice);
    expect(once).toContain('—');
  });
});
