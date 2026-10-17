/**
 * Production bundle module-graph guard.
 *
 * The dependency review established that `@xmldom/xmldom` is installed but not
 * shipped, because the app imports `read-excel-file/browser` and that entry uses
 * the platform `DOMParser`. The measurement behind that claim was taken once, by
 * hand, with a throwaway build config — so nothing stopped the next commit from
 * importing `read-excel-file/node`, or `read-excel-file/universal`, and silently
 * bundling the Node parser, the Node unzipper and an XPath implementation into
 * the browser payload. Unit tests would not notice: the vulnerable path is not
 * one they exercise.
 *
 * This guard turns that measurement into a build-time invariant. It fails the
 * production build when a forbidden module is part of the emitted bundle.
 *
 * Four properties it deliberately has, because the obvious cheap versions of
 * this check are all wrong:
 *
 *   - It reads the *build's* module graph (`chunk.modules` of each emitted chunk,
 *     after tree-shaking), not the source text. A grep over source would both
 *     miss a transitive import and fire on a comment; a grep over the minified
 *     output would miss a module whose code was transformed beyond recognition.
 *   - It matches on normalized *package specifiers*, not on raw paths. Windows
 *     separators, a lower/upper-case drive letter, Vite's `?v=`/`?used` query
 *     suffixes, Rollup's `\0` virtual-module prefix, npm's nested `node_modules`
 *     and pnpm's `node_modules/.pnpm/<name>@<version>/node_modules/` layout all
 *     describe the same module, and every one of them would otherwise be a hole.
 *   - It catches Vite's own tell. A Node-only import in a browser build is not
 *     rejected — Vite rewrites it to the virtual module `__vite-browser-external`
 *     and the build succeeds, leaving a bundle that throws when that binding is
 *     touched. Measured: `import { readFileSync } from 'node:fs'` builds clean and
 *     emits that stub. The id is the highest-signal rule here, and it is not
 *     specific to any one builtin.
 *   - It does not match bare Node builtin *names*. See NODE_BUILTIN_NAME_TRAP.
 *
 * What it is not: a substitute for a dependency audit. It says nothing about
 * advisories in modules that are legitimately shipped, and it cannot find a
 * vulnerability in code that belongs in the browser.
 */

/** NUL prefix Rollup uses for virtual modules. */
const VIRTUAL_PREFIX = String.fromCharCode(0);

/**
 * Vite's stand-in for an import it could not resolve for the browser. Seeing it
 * means something in the graph reached for a Node-only module and was silently
 * stubbed rather than rejected.
 *
 * It arrives in two shapes: the bare id (`__vite-browser-external`, the virtual
 * module itself) and one id per stubbed specifier, suffixed after a colon —
 * `__vite-browser-external:node:fs`, `__vite-browser-external:fs`. Measured, not
 * assumed: an earlier revision matched the id exactly and therefore missed every
 * real stub, which is precisely the case it was written for. The rules match the
 * prefix, which covers both shapes.
 */
export const BROWSER_EXTERNAL_STUB = '__vite-browser-external';

/**
 * Why the rule list has no entry for `fs`, `process`, `assert` and friends.
 *
 * An earlier revision matched bare builtin names, on the theory that a build
 * could leave them as real externals. It was wrong twice over. Vite rewrites
 * genuine builtins to `__vite-browser-external`, so the stub rule already covers
 * them; and the names collide with npm packages that are *supposed* to be in a
 * browser bundle. Measured on a fixture importing `jsdom`, whose dependency tree
 * is largely browser polyfills: 636 modules matched the builtin list — `process`,
 * `assert`, `console`, `punycode`, `domain`, `timers`, `constants`,
 * `string_decoder`, `querystring`, `http`, `https`, `os`, `module` — none of them
 * the Node builtins the rule was aiming at. A guard that cries wolf 636 times is
 * worse than no guard, because the next person learns to ignore it.
 *
 * The list is kept as a named constant so the decision is testable rather than
 * merely commented: `bundleGuard.test.js` asserts that a polyfill package named
 * `process` is not reported.
 */
export const NODE_BUILTIN_NAME_TRAP = Object.freeze([
  'assert', 'async_hooks', 'child_process', 'cluster', 'console', 'constants',
  'dgram', 'diagnostics_channel', 'dns', 'domain', 'fs', 'http', 'http2',
  'https', 'inspector', 'module', 'net', 'os', 'perf_hooks', 'process',
  'punycode', 'querystring', 'readline', 'repl', 'string_decoder', 'sys',
  'timers', 'tls', 'trace_events', 'tty', 'v8', 'vm', 'wasi', 'worker_threads',
]);

/**
 * @typedef {object} Rule
 * @property {'module'|'package'|'node-builtin'} kind
 * @property {string} [specifier] the id or package; absent for `node-builtin`
 * @property {string} reason why this must not be in a browser bundle
 */

/** @type {Rule[]} */
export const DEFAULT_RULES = [
  {
    kind: 'module',
    specifier: BROWSER_EXTERNAL_STUB,
    reason: 'Vite stubbed a Node-only import for the browser; the binding throws when used',
  },
  {
    kind: 'node-builtin',
    reason: 'a Node builtin imported as `node:*`, which has no browser implementation',
  },
  {
    kind: 'package',
    specifier: '@xmldom/xmldom',
    reason: 'Node XML parser reached only through read-excel-file\'s Node and universal entries; the browser entry uses the platform DOMParser',
  },
  {
    kind: 'package',
    specifier: 'unzipper',
    reason: 'Node ZIP reader behind read-excel-file\'s Node entry; the browser entry uses fflate',
  },
  {
    kind: 'package',
    specifier: 'xpath',
    reason: 'Node XPath package behind read-excel-file\'s Node entry',
  },
  {
    kind: 'package',
    specifier: 'jsdom',
    reason: 'test environment only; it is a devDependency and would add megabytes of Node API shims',
  },
  {
    kind: 'package',
    specifier: 'read-excel-file/node',
    reason: 'the Node entry of a package the app reads through its /browser entry',
  },
  {
    kind: 'package',
    specifier: 'read-excel-file/universal',
    reason: 'the universal entry imports ../xml/xml.js unconditionally, so it bundles the Node parser',
  },
  {
    kind: 'package',
    specifier: 'read-excel-file/web-worker',
    reason: 'the web-worker entry imports ../xml/xml.js too; the batch worker only needs the compute kernels',
  },
];

/**
 * Reduce a module id to the form the rules are written against: no virtual
 * prefix, no query suffix, forward slashes, a lower-case Windows drive letter and
 * no duplicate or trailing separators. Exported because every hole in a guard
 * like this is really a normalization hole.
 *
 * @param {unknown} rawId
 * @returns {string}
 */
export function normalizeModuleId(rawId) {
  if (typeof rawId !== 'string') return '';
  let id = rawId;
  while (id.charCodeAt(0) === VIRTUAL_PREFIX.charCodeAt(0)) id = id.slice(1);
  const query = id.indexOf('?');
  if (query !== -1) id = id.slice(0, query);
  id = id.replace(/\\/g, '/');
  // `C:/proj` and `c:/proj` are the same path on the machine that produced it.
  if (/^[A-Za-z]:\//.test(id)) id = id[0].toLowerCase() + id.slice(1);
  id = id.replace(/\/{2,}/g, '/');
  return id.replace(/\/+$/, '');
}

/** True for anything that names a location on disk rather than a module specifier. */
function isAbsolutePath(id) {
  return id.startsWith('/') || /^[a-z]:\//.test(id);
}

/**
 * The package specifier a normalized id belongs to, including any subpath:
 * `/p/node_modules/@scope/pkg/lib/x.js` → `@scope/pkg/lib/x.js`.
 *
 * The *last* `node_modules` segment wins, which is what makes nested installs and
 * pnpm's store layout collapse onto the same answer. Non-path ids (a bare
 * specifier, or a virtual id such as Vite's stubs) are returned unchanged, which
 * is how the `node:` and stub rules can match them.
 *
 * @param {string} id a normalized id
 * @returns {string} '' when the id is a filesystem path outside a package
 */
export function packageSpecifier(id) {
  const marker = '/node_modules/';
  const at = id.lastIndexOf(marker);
  let rest;
  if (at !== -1) rest = id.slice(at + marker.length);
  else if (id.startsWith('node_modules/')) rest = id.slice('node_modules/'.length);
  else if (isAbsolutePath(id)) return '';
  else return id;

  const segments = rest.split('/').filter(Boolean);
  if (!segments.length) return '';
  const scoped = segments[0].startsWith('@');
  const name = scoped ? segments.slice(0, 2).join('/') : segments[0];
  if (!name || (scoped && segments.length < 2)) return '';
  const subpath = segments.slice(scoped ? 2 : 1).join('/');
  return subpath ? `${name}/${subpath}` : name;
}

/**
 * Just the package a normalized id belongs to, without any subpath:
 * `/p/node_modules/read-excel-file/node/index.js` → `read-excel-file`.
 *
 * @param {string} id a normalized id
 * @returns {string} '' when the id is not inside a package
 */
export function packageName(id) {
  const marker = '/node_modules/';
  const at = id.lastIndexOf(marker);
  const rest = at !== -1 ? id.slice(at + marker.length) : id;
  if (rest.startsWith('@')) return rest.split('/').slice(0, 2).join('/');
  return rest.split('/')[0] ?? '';
}

/**
 * @param {string} id a normalized id
 * @param {string} specifier its package specifier
 * @param {Rule} rule
 */
function matchesRule(id, specifier, rule) {
  if (rule.kind === 'module') return id === rule.specifier || id.startsWith(`${rule.specifier}:`);
  if (rule.kind === 'node-builtin') return specifier.startsWith('node:');
  // `pkg` matches the package itself and any subpath of it, but not a package
  // whose name merely starts the same way (`read-excel-file/node-utils`).
  return specifier === rule.specifier || specifier.startsWith(`${rule.specifier}/`);
}

/**
 * Which of `ids` are forbidden, and why.
 *
 * One entry per module, de-duplicated across chunks, each tagged with the *rule*
 * that caught it rather than with the module's own subpath. Grouping has to be by
 * rule: `@xmldom/xmldom/lib/dom.js` and `@xmldom/xmldom/lib/sax.js` are one
 * problem with one fix, and reporting them as separate "packages" turned a
 * two-package failure (a fixture importing `jsdom`) into a 636-package wall of
 * text that nobody would read.
 *
 * @param {Iterable<string>} ids
 * @param {Rule[]} [rules]
 * @returns {{ id: string, package: string, reason: string }[]}
 */
export function findForbiddenModules(ids, rules = DEFAULT_RULES) {
  const found = new Map();
  for (const rawId of ids) {
    const id = normalizeModuleId(rawId);
    if (!id) continue;
    const specifier = packageSpecifier(id);
    for (const rule of rules) {
      if (!matchesRule(id, specifier, rule)) continue;
      if (!found.has(id)) {
        found.set(id, {
          id,
          package: rule.kind === 'node-builtin' ? 'node:*' : rule.specifier,
          reason: rule.reason,
        });
      }
      break;
    }
  }
  return [...found.values()];
}

/** How many example paths and importers a failure message prints per package. */
const MESSAGE_DETAIL_LIMIT = 3;

/** Absolute build-machine paths in a build failure are noise; keep the useful tail. */
function shorten(filePath, root) {
  const normalized = normalizeModuleId(filePath);
  if (!root) return normalized;
  const prefix = `${normalizeModuleId(root)}/`;
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
}

/**
 * A failure message someone can act on: which packages, with the number of
 * modules each contributed, a bounded sample of paths, and where the import came
 * from when the bundler will say.
 *
 * @param {{ id: string, package: string, reason: string }[]} violations
 * @param {{ checked?: number, rules?: number, importers?: Map<string, string[]>, root?: string }} [context]
 */
export function formatViolation(violations, { checked, rules, importers: importerMap, root } = {}) {
  const groups = new Map();
  for (const violation of violations) {
    if (!groups.has(violation.package)) groups.set(violation.package, { reason: violation.reason, modules: [] });
    groups.get(violation.package).modules.push(violation.id);
  }

  const lines = [];
  for (const [name, group] of groups) {
    lines.push(`  · ${name}  (${group.modules.length} module${group.modules.length === 1 ? '' : 's'})`);
    lines.push(`      ${group.reason}`);
    for (const module of group.modules.slice(0, MESSAGE_DETAIL_LIMIT)) lines.push(`      ${shorten(module, root)}`);
    if (group.modules.length > MESSAGE_DETAIL_LIMIT) {
      lines.push(`      … and ${group.modules.length - MESSAGE_DETAIL_LIMIT} more`);
    }
    const importers = importerMap?.get(name);
    if (importers?.length) {
      lines.push(`      first reachable from: ${importers.slice(0, MESSAGE_DETAIL_LIMIT).map((p) => shorten(p, root)).join(', ')}`);
      if (importers.length > MESSAGE_DETAIL_LIMIT) lines.push(`      … and ${importers.length - MESSAGE_DETAIL_LIMIT} more`);
    }
  }

  const total = groups.size;
  return [
    `[bundle-guard] ${total} forbidden ${total === 1 ? 'package' : 'packages'} in the production bundle`
      + ` (${violations.length} module${violations.length === 1 ? '' : 's'},`
      + ` ${checked ?? 0} bundled modules checked against ${rules ?? 0} rules):`,
    ...lines,
    '',
    'The production bundle must contain browser code only. Import the browser entry',
    'point of the package (for example `read-excel-file/browser`), or move the call to',
    'a build script or a test.',
  ].join('\n');
}

/**
 * Vite plugin. Registered in `vite.config.js`, so `npm run build` cannot produce
 * a violating bundle — the check runs in `generateBundle`, before anything is
 * written, and throws.
 *
 * @param {{ rules?: Rule[], log?: (message: string) => void }} [options]
 */
export function bundleGuardPlugin({ rules = DEFAULT_RULES, log = console.log } = {}) {
  let root = '';
  return {
    name: 'creep-cal:bundle-guard',
    apply: 'build',
    enforce: 'post',
    configResolved(config) { root = config.root; },
    generateBundle(_options, bundle) {
      // `chunk.modules` is the authoritative set: modules that survived both
      // resolution and tree-shaking and are in the artifact. Reading ids that were
      // merely parsed would fail a build over an import that was optimized away.
      const ids = new Set();
      for (const chunk of Object.values(bundle)) {
        if (!chunk || chunk.type !== 'chunk') continue;
        for (const id of Object.keys(chunk.modules ?? {})) ids.add(id);
        for (const imported of [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])]) {
          // Cross-chunk imports are file names (`assets/react-abc.js`); an external
          // import is a bare specifier. Only the bare ones can be a Node builtin
          // that the resolver left alone (a lib or SSR build — not this one).
          if (/\.js$/.test(imported) || imported.startsWith('.') || imported.startsWith('/')) continue;
          ids.add(imported);
        }
      }

      const violations = findForbiddenModules(ids, rules);
      if (violations.length) {
        throw new Error(formatViolation(violations, {
          checked: ids.size,
          rules: rules.length,
          importers: collectImporters(this, violations, ids),
          root,
        }));
      }
      // Always announced, even when clean. A guard that says nothing when it
      // passes cannot be told apart from a guard that never ran — which is exactly
      // how the screenshot script in this repository failed for months: it exited
      // before writing anything, leaving a clean working tree that read as a pass.
      log(`[bundle-guard] ${ids.size} bundled modules checked against ${rules.length} rules — no forbidden packages`);
    },
  };
}

/**
 * Who first dragged each forbidden package in, when the bundler will say.
 *
 * Direct importers of a package's own files are its own internals — for
 * `@xmldom/xmldom` that is more xmldom — so they are filtered out. What remains
 * is the boundary: the module outside the package that imported into it, which is
 * the line someone has to change. The comparison is on the package *name*, not on
 * the specifier: an importer inside the package has a subpath, and comparing
 * specifiers left the package's own files in the report.
 *
 * Best-effort on purpose: the bundler API differs between Rollup and Rolldown, and
 * a guard that needed importers to be useful would be worse than one that reports
 * without them.
 *
 * @param {unknown} context the Rollup/Vite plugin context
 * @param {{ id: string, package: string }[]} violations
 * @param {Set<string>} known every module id in the bundle, for the filter
 * @returns {Map<string, string[]>} keyed by the rule's package label
 */
function collectImporters(context, violations, known) {
  const importers = new Map();
  const getInfo = context?.getModuleInfo;
  if (typeof getInfo !== 'function') return importers;

  const byPackage = new Map();
  for (const violation of violations) {
    if (!byPackage.has(violation.package)) byPackage.set(violation.package, []);
    byPackage.get(violation.package).push(violation.id);
  }

  for (const [label, moduleIds] of byPackage) {
    const boundary = new Set();
    for (const id of moduleIds) {
      try {
        const info = getInfo.call(context, id);
        for (const importer of info?.importers ?? []) {
          const normalized = normalizeModuleId(importer);
          // Outside this package, and part of this bundle rather than an optional
          // peer that was never resolved.
          if (!known.has(importer)) continue;
          if (packageName(normalized) !== packageName(label)) boundary.add(normalized);
        }
      } catch {
        // No module info for this id; the package name is enough to act on.
      }
    }
    if (boundary.size) importers.set(label, [...boundary].sort());
  }
  return importers;
}
