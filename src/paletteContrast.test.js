import { describe, expect, test } from 'vitest';
import { contrast, cssVariables } from './testUtils/contrast';

const THEMES = { light: cssVariables(':root'), dark: cssVariables('[data-theme="dark"]') };

/**
 * Every text-on-surface pair the interface actually renders, with where it is
 * used. Measuring all 90 combinations would mostly report pairings that never
 * occur — the accent on --surface-3, say — and a test full of those gets ignored.
 *
 * The audit's P0-1 was a pair in this list (white on the dark theme's primary at
 * 2.53:1) and P1-3 was another (the accent drawing a 9px chart label at 4.38:1).
 */
const PAIRS = [
  { fg: '--text', bg: '--bg', where: 'body copy' },
  { fg: '--text', bg: '--surface', where: 'panel copy' },
  { fg: '--text', bg: '--surface-2', where: 'table cells, stat values' },
  { fg: '--text', bg: '--primary-soft', where: 'the selected model button' },
  { fg: '--text-muted', bg: '--bg', where: 'secondary copy' },
  { fg: '--text-muted', bg: '--surface', where: 'panel secondary copy' },
  { fg: '--text-muted', bg: '--surface-2', where: 'matrix input columns' },
  { fg: '--text-muted', bg: '--surface-3', where: 'segmented control labels' },
  { fg: '--text-faint', bg: '--bg', where: 'page-level labels' },
  { fg: '--text-faint', bg: '--surface', where: 'panel labels' },
  { fg: '--text-faint', bg: '--surface-2', where: 'the stat eyebrows' },
  { fg: '--primary', bg: '--surface', where: 'parameter names, links' },
  { fg: '--primary', bg: '--bg', where: 'inline links' },
  { fg: '--on-green', bg: '--primary', where: 'the primary button (P0-1)' },
  { fg: '--accent-text', bg: '--surface', where: 'the chart reference label (P1-3)' },
  { fg: '--accent-text', bg: '--bg', where: 'the chart reference label on the page' },
  { fg: '--success', bg: '--surface', where: 'the recommended-domain heading' },
  { fg: '--success', bg: '--surface-2', where: 'the valid-row count' },
  { fg: '--success', bg: '--success-soft', where: 'the computed badge' },
  { fg: '--warning', bg: '--warning-soft', where: 'notices and the stale-inputs banner' },
  { fg: '--warning', bg: '--surface', where: 'kernel status when it warns' },
  { fg: '--error', bg: '--error-soft', where: 'error notices' },
  { fg: '--error', bg: '--surface', where: 'error text on a panel' },
  { fg: '--error', bg: '--surface-2', where: 'the issues count' },
];

describe('text contrast, measured from the tokens', () => {
  for (const [theme, vars] of Object.entries(THEMES)) {
    for (const { fg, bg, where } of PAIRS) {
      test(`${theme}: ${fg} on ${bg} clears 4.5:1 (${where})`, () => {
        expect(vars[fg], `${fg} is not defined in the ${theme} theme`).toBeDefined();
        expect(vars[bg], `${bg} is not defined in the ${theme} theme`).toBeDefined();
        expect(contrast(vars[fg], vars[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  test('the tokens the pairs rely on all exist in both themes', () => {
    const names = new Set(PAIRS.flatMap((pair) => [pair.fg, pair.bg]));
    for (const [theme, vars] of Object.entries(THEMES)) {
      for (const name of names) expect(vars[name], `${name} missing from ${theme}`).toBeDefined();
    }
  });
});
