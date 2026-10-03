import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { CHART } from './chartTheme';

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

function block(selector) {
  const match = css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`no ${selector} block in index.css`);
  // Comments are stripped first: a declaration that follows a comment on the
  // previous line arrives glued to it, and its name no longer starts with --.
  const body = match[1].replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = {};
  for (const line of body.split(';')) {
    const [name, value] = line.split(':');
    if (name?.trim().startsWith('--')) vars[name.trim()] = value.trim();
  }
  return vars;
}

const luminance = (hex) => {
  const channels = hex.replace('#', '').match(/../g).map((c) => parseInt(c, 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};

const THEMES = { light: block(':root'), dark: block('[data-theme="dark"]') };

/**
 * The audit's P1-3: the accent was 3.94:1 on the page and 4.38:1 on a card, and
 * it was drawing the reference-line label — text, at 9px. These assert the
 * separation by measuring the tokens themselves, so a colour tweak that breaks
 * it fails here rather than in a screenshot nobody re-reads.
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
