import { describe, expect, test } from 'vitest';
import { CHART } from './chartTheme';
import { contrast, cssVariables } from '../testUtils/contrast';

const THEMES = { light: cssVariables(':root'), dark: cssVariables('[data-theme="dark"]') };

/** The theme uses neutral ink for reference geometry and labels. These tests
 * protect the consumer-visible contrast and chart type floor, not token identity. */
describe('chart colours', () => {
  for (const [theme, vars] of Object.entries(THEMES)) {
    test(`${theme}: the reference label clears 4.5:1 on both the card and the page`, () => {
      expect(contrast(vars['--reference-text'], vars['--surface'])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(vars['--reference-text'], vars['--bg'])).toBeGreaterThanOrEqual(4.5);
    });

    test(`${theme}: the reference line clears 3:1 as a graphic`, () => {
      expect(contrast(vars['--reference'], vars['--surface'])).toBeGreaterThanOrEqual(3);
    });

    test(`${theme}: the ticks and axis titles clear 4.5:1`, () => {
      expect(contrast(vars['--text-muted'], vars['--surface'])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(vars['--text-faint'], vars['--surface'])).toBeGreaterThanOrEqual(4.5);
    });
  }

  test('chart text is not below the type floor', () => {
    expect(CHART.font).toBeGreaterThanOrEqual(11);
    expect(CHART.labelFont).toBeGreaterThanOrEqual(11);
  });
});
