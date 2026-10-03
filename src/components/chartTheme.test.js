import { describe, expect, test } from 'vitest';
import { CHART } from './chartTheme';
import { contrast, cssVariables } from '../testUtils/contrast';

const THEMES = { light: cssVariables(':root'), dark: cssVariables('[data-theme="dark"]') };

/**
 * The audit's P1-3: the accent was 3.94:1 on the page and 4.38:1 on a card, and
 * it was drawing the reference-line label — text, at 9px. These assert the
 * separation by measuring the tokens themselves.
 */
describe('chart colours', () => {
  for (const [theme, vars] of Object.entries(THEMES)) {
    test(`${theme}: the reference label clears 4.5:1 on both the card and the page`, () => {
      expect(contrast(vars['--accent-text'], vars['--surface'])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(vars['--accent-text'], vars['--bg'])).toBeGreaterThanOrEqual(4.5);
    });

    test(`${theme}: the reference line clears 3:1 as a graphic`, () => {
      expect(contrast(vars['--accent'], vars['--surface'])).toBeGreaterThanOrEqual(3);
    });

    test(`${theme}: the ticks and axis titles clear 4.5:1`, () => {
      expect(contrast(vars['--text-muted'], vars['--surface'])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(vars['--text-faint'], vars['--surface'])).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('the accent is split into a graphic colour and a text colour', () => {
    // Where they are equal (the dark theme) the accent already clears 4.5:1.
    const { '--accent': accent, '--accent-text': accentText } = THEMES.light;
    expect(accentText).not.toBe(accent);
  });

  test('chart text is not below the type floor', () => {
    expect(CHART.font).toBeGreaterThanOrEqual(11);
    expect(CHART.labelFont).toBeGreaterThanOrEqual(11);
  });
});
