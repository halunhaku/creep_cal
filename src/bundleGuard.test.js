/**
 * Unit tests for the bundle guard's matching rules.
 *
 * Every hole a guard like this can have is really a normalization hole, so the
 * cases below are mostly about the shapes the same module can arrive in: Windows
 * separators, a drive letter in either case, Vite's query suffixes, Rollup's
 * virtual prefix, and the three ways a package can be laid out on disk (hoisted,
 * nested, pnpm). A guard that only matches the paths one machine happens to
 * produce is a guard that passes for the wrong reason.
 *
 * The end-to-end proof — that a real build with a real forbidden import fails —
 * lives in `bundleGuard.build.test.js`.
 */
import { describe, expect, test } from 'vitest';
import {
  BROWSER_EXTERNAL_STUB,
  DEFAULT_RULES,
  NODE_BUILTIN_NAME_TRAP,
  findForbiddenModules,
  formatViolation,
  normalizeModuleId,
  packageName,
  packageSpecifier,
} from '../scripts/bundleGuard.mjs';

const forbidden = (ids) => findForbiddenModules(ids).map((entry) => entry.package);

describe('normalizeModuleId', () => {
  test('strips the Rollup virtual prefix and any query suffix', () => {
    expect(normalizeModuleId('\u0000vite/preload-helper.js')).toBe('vite/preload-helper.js');
    // Vite appends `?v=<hash>` to assets and `?used` to preprocessor output.
    expect(normalizeModuleId('/p/node_modules/@xmldom/xmldom/lib/index.js?v=8d1e2f'))
      .toBe('/p/node_modules/@xmldom/xmldom/lib/index.js');
    expect(normalizeModuleId('/p/src/style.css?used')).toBe('/p/src/style.css');
  });

  test('normalizes Windows separators and the drive-letter case', () => {
    expect(normalizeModuleId('C:\\proj\\node_modules\\read-excel-file\\node\\index.js'))
      .toBe('c:/proj/node_modules/read-excel-file/node/index.js');
    // Same path, different case in the drive letter: one machine reports each.
    expect(normalizeModuleId('c:/proj/node_modules/@xmldom/xmldom/lib/dom.js'))
      .toBe(normalizeModuleId('C:/proj/node_modules/@xmldom/xmldom/lib/dom.js'));
  });

  test('collapses doubled separators and trailing slashes', () => {
    expect(normalizeModuleId('/p//node_modules///@xmldom//xmldom/')).toBe('/p/node_modules/@xmldom/xmldom');
  });

  test('non-strings normalize to nothing rather than throwing', () => {
    for (const value of [undefined, null, 42, {}, []]) expect(normalizeModuleId(value)).toBe('');
  });
});

describe('packageSpecifier', () => {
  test('reads the package and subpath out of a hoisted install', () => {
    expect(packageSpecifier('/p/node_modules/read-excel-file/node/index.js')).toBe('read-excel-file/node/index.js');
    expect(packageSpecifier('/p/node_modules/@xmldom/xmldom/lib/dom.js')).toBe('@xmldom/xmldom/lib/dom.js');
    expect(packageSpecifier('/p/node_modules/@xmldom/xmldom')).toBe('@xmldom/xmldom');
  });

  test('takes the innermost package of a nested install', () => {
    // Two copies of the same package on disk are one package to a rule.
    expect(packageSpecifier('/p/node_modules/a/node_modules/@xmldom/xmldom/lib/x.js')).toBe('@xmldom/xmldom/lib/x.js');
  });

  test('reads through the pnpm store layout', () => {
    expect(packageSpecifier('/p/node_modules/.pnpm/@xmldom+xmldom@0.9.12/node_modules/@xmldom/xmldom/lib/dom.js'))
      .toBe('@xmldom/xmldom/lib/dom.js');
    expect(packageSpecifier('/p/node_modules/.pnpm/read-excel-file@9.3.12/node_modules/read-excel-file/node/index.js'))
      .toBe('read-excel-file/node/index.js');
  });

  test('returns non-path ids unchanged so the stub and node: rules can match', () => {
    expect(packageSpecifier(BROWSER_EXTERNAL_STUB)).toBe(BROWSER_EXTERNAL_STUB);
    expect(packageSpecifier('node:fs/promises')).toBe('node:fs/promises');
  });

  test('returns nothing for application source, which belongs to no package', () => {
    expect(packageSpecifier('/p/src/components/BatchCalculator.jsx')).toBe('');
    expect(packageSpecifier('c:/p/src/main.jsx')).toBe('');
  });
});

describe('packageName', () => {
  test('drops the subpath, including for a scoped package', () => {
    expect(packageName('/p/node_modules/@xmldom/xmldom/lib/dom.js')).toBe('@xmldom/xmldom');
    expect(packageName('/p/node_modules/read-excel-file/node/index.js')).toBe('read-excel-file');
  });
});

describe('findForbiddenModules', () => {
  test('catches every read-excel-file entry that bundles the Node parser', () => {
    // Measured: /browser imports ../xml/xmlBrowser.js; /node, /universal and
    // /web-worker all import ../xml/xml.js, which imports @xmldom/xmldom.
    for (const entry of ['node', 'universal', 'web-worker']) {
      expect(forbidden([`/p/node_modules/read-excel-file/${entry}/index.js`])).toContain('read-excel-file/' + (entry === 'web-worker' ? 'web-worker' : entry));
    }
  });

  test('leaves the browser entry alone', () => {
    expect(forbidden([
      '/p/node_modules/read-excel-file/browser/index.js',
      '/p/node_modules/read-excel-file/modules/xml/xmlBrowser.js',
    ])).toEqual([]);
  });

  test('does not confuse a package with one whose name starts the same way', () => {
    // `read-excel-file/node-utils` is a different specifier; a `startsWith` without
    // a separator boundary would report it as the forbidden /node entry.
    expect(forbidden(['/p/node_modules/read-excel-file/node-utils/index.js'])).toEqual([]);
    expect(forbidden(['/p/node_modules/read-excel-file/node/index.js'])).toEqual(['read-excel-file/node']);
  });

  test('reports the package once, however many of its files are bundled', () => {
    const found = findForbiddenModules([
      '/p/node_modules/@xmldom/xmldom/lib/dom.js',
      '/p/node_modules/@xmldom/xmldom/lib/sax.js',
      '/p/node_modules/@xmldom/xmldom/lib/index.js',
    ]);
    expect(found).toHaveLength(3);
    expect(new Set(found.map((entry) => entry.package))).toEqual(new Set(['@xmldom/xmldom']));
  });

  test('deduplicates a module that appears in two chunks', () => {
    expect(findForbiddenModules(['/p/node_modules/unzipper/lib/x.js', '/p/node_modules/unzipper/lib/x.js'])).toHaveLength(1);
  });

  test('catches Vite\'s stub for a Node-only import, in both of its shapes', () => {
    // Vite rewrites `node:fs` to this instead of failing, so the build "succeeds"
    // and the bundle throws when the binding is read. It emits the bare id for the
    // virtual module and one `:<specifier>` id per stubbed import; an earlier
    // revision matched the bare id only, and so missed every real stub.
    expect(forbidden([BROWSER_EXTERNAL_STUB])).toEqual([BROWSER_EXTERNAL_STUB]);
    expect(forbidden([`${BROWSER_EXTERNAL_STUB}:node:fs`])).toEqual([BROWSER_EXTERNAL_STUB]);
    expect(forbidden([`${BROWSER_EXTERNAL_STUB}:fs`])).toEqual([BROWSER_EXTERNAL_STUB]);
  });

  test('reports the stubbed import, not a package that merely starts with the stub name', () => {
    expect(forbidden(['__vite-browser-external-helper/index.js'])).toEqual([]);
  });

  test('catches a node:-prefixed external left alone by a lib-style build', () => {
    expect(forbidden(['node:fs'])).toEqual(['node:*']);
    expect(forbidden(['node:worker_threads'])).toEqual(['node:*']);
  });

  test('catches the bare names in the record of what is NOT matched, when they are real builtins', () => {
    // `NODE_BUILTIN_NAME_TRAP` documents the names a previous revision matched by
    // accident. They are not rules any more, so an id that is literally `process`
    // is only caught when it is the `node:` form Vite produces.
    expect(NODE_BUILTIN_NAME_TRAP).toContain('process');
    expect(forbidden(['/p/node_modules/process/browser.js'])).toEqual([]);
    expect(forbidden(['node:process'])).toEqual(['node:*']);
  });

  test('does not report browser polyfill packages named after builtins', () => {
    // The regression this guards: matching bare builtin *names* reported 636
    // modules of a jsdom tree — `process`, `assert`, `console`, `punycode`,
    // `domain`, `timers`, `constants`, `string_decoder`, `querystring` — none of
    // them the Node builtins the rule was aiming at.
    const polyfills = NODE_BUILTIN_NAME_TRAP.map((name) => `/p/node_modules/${name}/index.js`);
    expect(forbidden(polyfills)).toEqual([]);
  });

  test('leaves the app, React and the legitimate spreadsheet stack alone', () => {
    expect(forbidden([
      '/p/src/components/BatchCalculator.jsx',
      '/p/node_modules/react/index.js',
      '/p/node_modules/papaparse/papaparse.min.js',
      '/p/node_modules/fflate/esm/browser.js',
      '/p/node_modules/react-dom/client.js',
      '\u0000vite/preload-helper.js',
    ])).toEqual([]);
  });
});

describe('formatViolation', () => {
  const violations = findForbiddenModules([
    '/p/node_modules/@xmldom/xmldom/lib/dom.js',
    '/p/node_modules/@xmldom/xmldom/lib/sax.js',
  ]);

  test('names the package, the reason and the fix', () => {
    const message = formatViolation(violations, { checked: 10, rules: 9, root: '/p' });
    expect(message).toContain('@xmldom/xmldom');
    expect(message).toContain('2 modules');
    expect(message).toContain('read-excel-file/browser');
    expect(message).toContain('node_modules/@xmldom/xmldom/lib/dom.js');
  });

  test('stays bounded even when a whole dependency tree is reported', () => {
    // Measured on a jsdom fixture: 636 modules. Every one of them on its own line
    // is a failure message nobody reads.
    const many = findForbiddenModules(
      Array.from({ length: 400 }, (_, index) => `/p/node_modules/@xmldom/xmldom/lib/file${index}.js`),
    );
    const message = formatViolation(many, { checked: 1136, rules: 9, root: '/p' });
    expect(message.split('\n').length).toBeLessThan(15);
    expect(message).toContain('… and 397 more');
  });

  test('prints the boundary importer when the bundler supplied one', () => {
    const message = formatViolation(
      [findForbiddenModules(['/p/node_modules/@xmldom/xmldom/lib/dom.js'])[0]],
      { checked: 1, rules: 1, root: '/p', importers: new Map([['@xmldom/xmldom', ['/p/src/x.js']]]) },
    );
    expect(message).toContain('first reachable from: src/x.js');
  });

  test('each shipped rule carries a reason that says why, not just what', () => {
    for (const rule of DEFAULT_RULES) {
      expect(rule.reason.length).toBeGreaterThan(30);
    }
  });
});
