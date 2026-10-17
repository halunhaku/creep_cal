/**
 * End-to-end tests for the bundle guard: real Vite builds, real module graphs.
 *
 * The unit tests next door prove the matcher is right about strings. These prove
 * the guard is attached to a build and that a forbidden module in the graph is
 * actually fatal — the failure the review asked for ("simulate importing a
 * forbidden module; the check must fail").
 *
 * Two things about the setup are load-bearing:
 *
 *   - Fixtures live inside the project, because a bare import in a file under
 *     `/tmp` resolves against `/tmp`'s parent directories and finds no
 *     `node_modules`. The directory is created and removed by this file, and is
 *     git-ignored.
 *   - Every fixture *uses* its import. `read-excel-file` declares
 *     `sideEffects: false`, so `import x from '...'; export default x;` is dropped
 *     wholesale and the build would succeed whatever the guard said. The first
 *     test below exists precisely to catch that trap: it builds the xmldom fixture
 *     with the guard switched off and asserts the parser really is in the graph.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { build, loadConfigFromFile } from 'vite';
import { BROWSER_EXTERNAL_STUB, bundleGuardPlugin } from '../scripts/bundleGuard.mjs';

const ROOT = process.cwd();
const FIXTURE_ROOT = resolve(ROOT, '.bundle-guard-fixture');

/**
 * @param {string} name unique fixture directory
 * @param {string} code module source; must use what it imports
 * @param {{ guard?: boolean }} [options]
 * @returns {Promise<{ ids: string[], error?: Error }>}
 */
async function buildFixture(name, code, { guard = true } = {}) {
  const dir = resolve(FIXTURE_ROOT, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'main.js'), code);
  writeFileSync(resolve(dir, 'index.html'), '<html><body><script type="module" src="./main.js"></script></body></html>');

  const ids = [];
  const collect = {
    name: 'test:collect-modules',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk?.type === 'chunk') ids.push(...Object.keys(chunk.modules ?? {}));
      }
    },
  };

  try {
    await build({
      root: ROOT,
      configFile: false,
      logLevel: 'silent',
      build: {
        write: false,
        outDir: resolve(FIXTURE_ROOT, `out-${name}`),
        emptyOutDir: false,
        rollupOptions: {
          input: resolve(dir, 'index.html'),
          output: { manualChunks: undefined },
        },
      },
      plugins: guard ? [bundleGuardPlugin(), collect] : [collect],
    });
    return { ids };
  } catch (error) {
    return { ids, error };
  }
}

const guardMessage = (error) => {
  const message = String(error?.message ?? '');
  const at = message.indexOf('[bundle-guard]');
  return at === -1 ? message : message.slice(at);
};

beforeAll(() => {
  rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  mkdirSync(FIXTURE_ROOT, { recursive: true });
});

afterAll(() => {
  rmSync(FIXTURE_ROOT, { recursive: true, force: true });
});

describe('the fixtures are not vacuous', () => {
  test('without the guard, an unused-looking import of @xmldom/xmldom really is bundled', async () => {
    const { ids, error } = await buildFixture(
      'vacuous',
      `import { DOMParser } from '@xmldom/xmldom';\nglobalThis.__fixture = DOMParser;`,
      { guard: false },
    );
    expect(error).toBeUndefined();
    // If this fails, the import was tree-shaken and every negative test below
    // would pass for the wrong reason.
    expect(ids.some((id) => id.includes('@xmldom/xmldom'))).toBe(true);
  }, 30000);

  test('before writing to a forbidden module name, the guard is registered by the real config', async () => {
    const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, resolve(ROOT, 'vite.config.js'));
    const plugins = (loaded?.config?.plugins ?? []).flat(Infinity).filter(Boolean);
    expect(plugins.map((plugin) => plugin.name)).toContain('creep-cal:bundle-guard');
  }, 30000);
});

describe('forbidden modules fail the build', () => {
  test('@xmldom/xmldom, the Node parser behind read-excel-file/node', async () => {
    const { error } = await buildFixture(
      'xmldom',
      `import { DOMParser } from '@xmldom/xmldom';\nglobalThis.__fixture = DOMParser;`,
    );
    const message = guardMessage(error);
    expect(error).toBeDefined();
    expect(message).toContain('forbidden package');
    expect(message).toContain('@xmldom/xmldom');
    expect(message).toContain('read-excel-file/browser');
  }, 30000);

  test('a Node builtin, which Vite would otherwise stub instead of refusing', async () => {
    const { ids, error } = await buildFixture(
      'node-builtin',
      `import { readFileSync } from 'node:fs';\nglobalThis.__fixture = readFileSync;`,
    );
    // The premise of the rule: the build reaches this point at all, because Vite
    // rewrote the import rather than failing. The id carries the original
    // specifier after a colon — `__vite-browser-external:node:fs` — which is why
    // the rule matches a prefix and this asserts one.
    expect(ids.some((id) => id.startsWith(BROWSER_EXTERNAL_STUB))).toBe(true);
    expect(ids).toContain(`${BROWSER_EXTERNAL_STUB}:node:fs`);
    const message = guardMessage(error);
    expect(error).toBeDefined();
    expect(message).toContain(BROWSER_EXTERNAL_STUB);
    expect(message).toContain('main.js');
  }, 30000);

  test('a bare Node builtin name, which takes the same stub path', async () => {
    const { error } = await buildFixture(
      'bare-builtin',
      `import fs from 'fs';\nglobalThis.__fixture = fs;`,
    );
    const message = guardMessage(error);
    expect(error).toBeDefined();
    expect(message).toContain(BROWSER_EXTERNAL_STUB);
  }, 30000);

  test('read-excel-file/universal, which imports the Node parser unconditionally', async () => {
    const { error } = await buildFixture(
      'universal',
      `import { readSheet } from 'read-excel-file/universal';\nglobalThis.__fixture = readSheet;`,
    );
    expect(guardMessage(error)).toContain('@xmldom/xmldom');
  }, 30000);

  test('a test-environment dependency, which has no business in a shipped bundle', async () => {
    const { error } = await buildFixture(
      'jsdom-dep',
      `import { JSDOM } from 'jsdom';\nglobalThis.__fixture = JSDOM;`,
    );
    const message = guardMessage(error);
    expect(message).toContain('jsdom');
    // Bounded, not one line per module: jsdom brings 635 of them, and the whole
    // point of the detail limit is that nobody has to scroll past them.
    const lines = message.split('\n').length;
    expect(lines).toBeLessThan(30);
    expect(message).toContain('… and');
  }, 60000);
});

describe('legitimate browser code still builds', () => {
  test('an ordinary browser dependency', async () => {
    const { ids, error } = await buildFixture(
      'papaparse',
      `import Papa from 'papaparse';\nglobalThis.__fixture = Papa;`,
    );
    expect(error).toBeUndefined();
    expect(ids.some((id) => id.includes('papaparse'))).toBe(true);
  }, 30000);

  test('read-excel-file/browser, the entry the app actually imports', async () => {
    const { ids, error } = await buildFixture(
      'rxbrowser',
      `import { readSheet } from 'read-excel-file/browser';\nglobalThis.__fixture = readSheet;`,
    );
    expect(error).toBeUndefined();
    // The two entries differ by exactly one module, and it is the one that matters.
    expect(ids.some((id) => id.endsWith('read-excel-file/modules/xml/xmlBrowser.js'))).toBe(true);
    expect(ids.some((id) => id.endsWith('read-excel-file/modules/xml/xml.js'))).toBe(false);
    expect(ids.some((id) => id.includes('@xmldom/xmldom'))).toBe(false);
  }, 30000);

  test('the real production build, through vite.config.js', async () => {
    await build({ root: ROOT, logLevel: 'silent', build: { write: false } });
    expect(existsSync(resolve(ROOT, 'dist/index.html'))).toBe(true);
  }, 120000);
});
