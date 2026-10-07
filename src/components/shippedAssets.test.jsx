import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import BatchCalculator from './BatchCalculator';
import DocsPage from './DocsPage';

/**
 * The shipped `public/模型说明/*.md` and `public/模型示例/*` files used to be dead
 * payload: nothing referenced them, so they shipped to production and were
 * impossible to obtain from the UI while silently drifting from the in-app
 * content. They are now offered as downloads, which only stays true if the file
 * names keep matching the links.
 */
function expectAssetExists(href, label) {
  expect(href, `${label} should be a root-relative path`).toMatch(/^\//);
  const onDisk = join(process.cwd(), 'public', decodeURI(href.replace(/^\//, '')));
  expect(existsSync(onDisk), `${label} -> ${onDisk} is missing`).toBe(true);
}

describe('shipped documentation and sample assets are reachable', () => {
  test('every model links to sample files that exist on disk', async () => {
    const { container } = render(<BatchCalculator />);
    const seen = new Set();
    for (const id of ['aci209', 'mc2010', 'b4', 'b4s', 'gl2000', 'aashto']) {
      const select = container.querySelector('#batch-model');
      select.value = id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(() => expect(container.querySelectorAll('a[download]').length).toBeGreaterThan(0));
      for (const anchor of container.querySelectorAll('a[download]')) {
        expectAssetExists(anchor.getAttribute('href'), `${id} sample ${anchor.textContent}`);
        seen.add(anchor.getAttribute('href'));
      }
    }
    expect(seen.size).toBe(12);   // 6 models x (csv + xlsx)
  });

  test('every model links to a Markdown description that exists on disk', () => {
    render(<DocsPage />);
    const names = { aci209: 'ACI 209R-92', mc2010: 'fib Model Code 2010', b4: 'RILEM Model B4', b4s: 'RILEM Model B4s', gl2000: 'GL2000', aashto: 'AASHTO LRFD' };
    const expected = new Set();
    for (const [id, name] of Object.entries(names)) {
      // `(?!s)` keeps "RILEM Model B4" from also matching the B4s button.
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`${name}(?!s)`) }));
      const href = screen.getByRole('link', { name: /Markdown/i }).getAttribute('href');
      expectAssetExists(href, `${id} documentation`);
      expect(decodeURI(href)).toBe(`/模型说明/${id}.md`);
      expected.add(href);
    }
    expect(expected.size).toBe(6);
  });
});
