import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * WCAG 2.1 contrast, measured from the tokens themselves rather than from a
 * screenshot nobody re-reads. Used by the palette and chart colour tests.
 */
export function cssVariables(selector) {
  const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
  const match = css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`no ${selector} block in index.css`);
  // Comments are stripped first: a declaration that follows a comment on the
  // previous line arrives glued to it and its name no longer starts with --.
  const body = match[1].replace(/\/\*[\s\S]*?\*\//g, '');
  const vars = {};
  for (const line of body.split(';')) {
    const [name, value] = line.split(':');
    if (name?.trim().startsWith('--')) vars[name.trim()] = value.trim();
  }
  return vars;
}

const luminance = (hex) => {
  const raw = hex.replace('#', '');
  // #fff is three channels, not one: without expanding the shorthand the other
  // two read as NaN and the ratio is quietly meaningless.
  const expanded = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const channels = expanded.match(/../g).map((c) => parseInt(c, 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}
