#!/usr/bin/env node
/**
 * Repeatable performance benchmark for the production build.
 *
 *     npm run build
 *     node scripts/benchmark.mjs --runs=3 --json=/tmp/bench-after.json \
 *       --out=docs/performance-baseline.md
 *
 * Why this exists: every performance claim in the phase reports has to be
 * reproducible, so it is measured the same way twice rather than argued from a
 * code shape. The script does two independent things:
 *
 *   1. Node-side bundle analysis. Reads `dist/` and reports raw, gzip and brotli
 *      bytes for the assets the shipped `index.html` actually pulls in, versus
 *      the assets that only load when a workspace is opened. "Initial" here means
 *      "referenced by index.html as a module script, modulepreload or stylesheet",
 *      which is exactly what a first visit fetches before React renders.
 *
 *   2. Browser measurements. Serves `dist/` with `vite preview` and drives
 *      headless Chrome over the DevTools Protocol, with a small instrumentation
 *      snippet installed before any page script runs. Every number is either a
 *      Performance API entry or a wall-clock interval measured in the page, not a
 *      Node-side round trip, so a measurement cannot hide main-thread blocking.
 *
 * What it deliberately does not measure: anything that depends on a real network,
 * a real GPU, or a browser other than the one found on this machine. The report
 * prints the environment so a comparison is only made between like runs.
 *
 * The scenarios and their metrics are declared in SCENARIOS, so adding one is a
 * local edit. All waits are on `data-` hooks or ids the app sets for this purpose
 * (the same ones the screenshot and DOM gates use), never on display copy.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');

/* ── CLI ────────────────────────────────────────────────────────────────────── */

const args = new Map();
for (const raw of process.argv.slice(2)) {
  const match = /^--([^=]+)(?:=(.*))?$/.exec(raw);
  if (!match) throw new Error(`Unrecognised argument: ${raw}`);
  args.set(match[1], match[2] ?? 'true');
}
const RUNS = Number(args.get('runs') ?? 3);
const PORT = Number(args.get('port') ?? 4190);
const CDP_PORT = Number(args.get('cdp-port') ?? 9230);
const JSON_OUT = args.get('json');
const MD_OUT = args.get('out');
const COMPARE = args.get('compare');
const ROWS = String(args.get('rows') ?? '100,1000,10000,20000').split(',').map(Number);
const LABEL = args.get('label') ?? 'run';
const BASE = `http://127.0.0.1:${PORT}/`;
const FIXTURE_DIR = resolve(args.get('fixtures') ?? '/tmp/creep-bench');

/** Set from the build in `main()`; the wasm scenario imports it directly. */
let ENGINE_MODULE_URL = '';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/* ── Bundle analysis (no browser) ───────────────────────────────────────────── */

/** Every asset referenced by the shipped index.html. */
function initialAssets(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  const urls = new Set();
  for (const tag of html.matchAll(/<(?:script|link)\b[^>]*>/g)) {
    const text = tag[0];
    const isModuleScript = /<script\b/.test(text) && /type=["']module["']/.test(text);
    const isPreload = /rel=["']modulepreload["']/.test(text);
    const isStylesheet = /rel=["']stylesheet["']/.test(text);
    if (!isModuleScript && !isPreload && !isStylesheet) continue;
    const href = /(?:src|href)=["']([^"']+)["']/.exec(text);
    if (href) urls.add(href[1].replace(/^\//, ''));
  }
  return urls;
}

/**
 * Size table for everything in dist/assets, split into what the first paint
 * pulls in and what it does not. Files that cannot be read are reported rather
 * than skipped: a silent zero would read like an improvement.
 */
function analyzeBundle() {
  const indexPath = resolve(DIST, 'index.html');
  if (!existsSync(indexPath)) throw new Error('dist/index.html is missing — run `npm run build` first');
  const initial = initialAssets(indexPath);
  const files = [];
  const assetsDir = resolve(DIST, 'assets');
  const cssAndJs = existsSync(assetsDir)
    ? readdirSync(assetsDir).filter((name) => /\.(?:js|css)$/.test(name)).map((name) => join('assets', name))
    : [];
  // Roots outside assets/ that the html can reference (favicon, manifest, woff2
  // are all covered by the assets scan; the two below are the interesting ones).
  const extra = ['index.html'].filter((name) => existsSync(resolve(DIST, name)));

  for (const relative of [...cssAndJs, ...extra]) {
    const absolute = resolve(DIST, relative);
    const bytes = readFileSync(absolute);
    files.push({
      file: relative,
      initial: initial.has(relative) || relative === 'index.html',
      raw: bytes.length,
      gzip: gzipSync(bytes).length,
      brotli: brotliCompressSync(bytes).length,
      // A chunk whose name comes from manualChunks is a group, not a feature;
      // the hash is dropped so before/after tables line up by name.
      group: relative.replace(/-[A-Za-z0-9_-]{8}\./, '.'),
    });
  }
  files.sort((a, b) => b.gzip - a.gzip);
  const sum = (list, key) => list.reduce((total, entry) => total + entry[key], 0);
  const initialFiles = files.filter((entry) => entry.initial);
  const lazyFiles = files.filter((entry) => !entry.initial);
  return {
    files,
    initial: { count: initialFiles.length, raw: sum(initialFiles, 'raw'), gzip: sum(initialFiles, 'gzip'), brotli: sum(initialFiles, 'brotli') },
    lazy: { count: lazyFiles.length, raw: sum(lazyFiles, 'raw'), gzip: sum(lazyFiles, 'gzip'), brotli: sum(lazyFiles, 'brotli') },
  };
}

/* ── Fixtures ───────────────────────────────────────────────────────────────── */

const B4_COLUMNS = [
  't0', 'tPrime', 'Tcur', 'Tsh', 'Tc', 'h', 'fc', 'vS', 'c', 'wC', 'aC',
  'cementType', 'aggregateType', 'specimenShape', 'retarder', 'flyAsh',
  'superplasticizer', 'silicaFume', 'airEntrainingAgent', 'waterReducer', 't',
];
const ACI_COLUMNS = ['curingType', 't0', 'H', 'VS', 'slump', 'fineAggregate', 'airContent', 't'];

/**
 * A deterministic wide-schema dataset. Values vary by row so a kernel cannot
 * accidentally constant-fold, but the same row count always produces the same
 * file — a benchmark input that changed between runs would make the comparison
 * meaningless.
 */
function csvFixture(model, rows) {
  const quoted = (value) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const lines = [];
  if (model === 'aci209') {
    lines.push(ACI_COLUMNS.join(','));
    for (let i = 0; i < rows; i += 1) {
      const t = 1 + ((i * 7919) % 10000);
      lines.push(['moist', 28 + (i % 60), 40 + (i % 50), 80 + (i % 60), 60 + (i % 80), 30 + (i % 60), 4 + (i % 5), t].join(','));
    }
    return lines.join('\n');
  }
  lines.push(B4_COLUMNS.join(','));
  for (let i = 0; i < rows; i += 1) {
    const t = 1 + ((i * 7919) % 10000);
    lines.push([
      28 + (i % 60), 28 + (i % 60), 20, 20, 20,
      40 + (i % 50), 25 + (i % 30), 19.05 + (i % 20), 219.3, 0.6, 7,
      quoted('R'), quoted('No Information'), quoted('1'),
      0, 0, 0, 0, 0, 0,
      t,
    ].join(','));
  }
  return lines.join('\n');
}

function writeFixtures() {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const fixtures = {};
  for (const rows of ROWS) {
    const path = resolve(FIXTURE_DIR, `b4-${rows}.csv`);
    writeFileSync(path, csvFixture('b4', rows));
    fixtures[rows] = path;
  }
  return fixtures;
}

/* ── DevTools Protocol ──────────────────────────────────────────────────────── */

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      if (existsSync(candidate)) return candidate;
    } catch { /* keep looking */ }
  }
  throw new Error(`Chrome not found. Set CHROME_PATH. Tried:\n  ${CHROME_CANDIDATES.join('\n  ')}`);
}

/**
 * Health check over `node:http`, not `fetch`.
 *
 * This machine exports `ALL_PROXY=socks5://127.0.0.1:7897`, and undici's fetch
 * followed it for a loopback request, which made the check fail intermittently
 * while the proxy restarted — a local server that was listening and answering
 * `curl` was reported as down. `node:http` never consults proxy environment
 * variables, so the check measures the server and nothing else.
 */
function httpGet(url, { timeoutMs = 5000 } = {}) {
  return new Promise((done, fail) => {
    const request = get(url, (response) => {
      response.resume();
      done({ ok: response.statusCode >= 200 && response.statusCode < 400, status: response.statusCode });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('http timeout')));
    request.on('error', fail);
  });
}

async function waitForHttp(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await httpGet(url);
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error; // not up yet
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${url} (${lastError?.message ?? 'no response'})`);
}

/** GET a JSON document over `node:http` (see `httpGet` for why not `fetch`). */
function httpGetJson(url) {
  return new Promise((done, fail) => {
    const request = get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try {
          done(JSON.parse(body));
        } catch (error) {
          fail(new Error(`${url} did not return JSON: ${error.message}`));
        }
      });
    });
    request.on('error', fail);
  });
}

/** Minimal one-page DevTools Protocol client. Copied from capture-screenshots.mjs. */
class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${message.error.message} (${entry.method})`));
      else entry.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((done, fail) => this.pending.set(id, { resolve: done, reject: fail, method }));
  }

  /**
   * Evaluate in the page. `awaitPromise` defaults to true because most calls
   * await a page promise; pass false when the call is meant to *start* a promise
   * the next call reads back.
   */
  async evaluate(expression, { awaitPromise = true } = {}) {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
    });
    if (exceptionDetails) {
      const detail = exceptionDetails.exception?.description ?? exceptionDetails.text ?? 'evaluate failed';
      throw new Error(detail);
    }
    return result.value;
  }
}

/*
 * Installed with Page.addScriptToEvaluateOnNewDocument, so it runs before the
 * app's own scripts on every navigation.
 *
 * `milestones` are absolute `performance.now()` values, which is the same clock
 * the Performance API uses. `longTasks` come from the longtask observer: a task
 * over 50 ms is what "main thread blocked" means in a lab measurement, and the
 * sum over a window is the blocking time.
 *
 * The observer is created once per document and never disconnected; scenarios
 * that need a window call `resetLongTasks()` immediately before their trigger.
 */
const INSTRUMENT = `(() => {
  const b = (window.__bench = { milestones: {}, longTasks: [], lcp: null });
  const milestones = [
    ['shell', 'header'],
    ['workspace', 'main[data-workspace]'],
    ['computed', '[data-run-status="computed"]'],
    ['parameters', '[data-action="calculate"]'],
    ['batch', '#batch-model'],
    ['matrix', '[data-result-matrix]'],
    ['chart', '.recharts-surface'],
    ['comparison', '[data-kernel-comparison][data-ready="true"]'],
    ['docs', '[data-doc-heading]'],
  ];
  const check = () => {
    for (const [name, selector] of milestones) {
      if (b.milestones[name] === undefined && document.querySelector(selector)) {
        b.milestones[name] = performance.now();
      }
    }
  };
  try {
    // Observing the Document node, not documentElement: this script runs at
    // document creation, when there is no documentElement yet, and observing it
    // threw — which silently collected no milestones at all.
    new MutationObserver(check).observe(document, { childList: true, subtree: true });
  } catch { /* instrumentation only */ }
  document.addEventListener('DOMContentLoaded', check);
  window.addEventListener('load', check);
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) b.longTasks.push([entry.startTime, entry.duration]);
    }).observe({ entryTypes: ['longtask'] });
  } catch { /* older Chrome without longtask */ }
  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      b.lcp = entries[entries.length - 1].startTime;
    }).observe({ entryTypes: ['largest-contentful-paint'] });
  } catch { /* optional metric */ }
  window.confirm = () => true;
  b.resetLongTasks = () => { b.longTasks = []; };
  b.blockingMs = () => b.longTasks.reduce((total, [, duration]) => total + duration, 0);
  b.maxBlockMs = () => b.longTasks.reduce((max, [, duration]) => Math.max(max, duration), 0);
  b.longTaskCount = () => b.longTasks.length;
  b.mark = () => { b.t0 = performance.now(); };
  b.waitFrom = (selector, timeoutMs) => {
    const started = performance.now();
    const deadline = started + (timeoutMs || 300000);
    return new Promise((resolve, reject) => {
      const tick = () => {
        if (document.querySelector(selector)) { resolve(performance.now() - started); return; }
        if (performance.now() > deadline) { reject(new Error('timed out waiting for ' + selector)); return; }
        requestAnimationFrame(tick);
      };
      tick();
    });
  };
  b.until = (predicateSource, timeoutMs) => {
    const started = performance.now();
    const deadline = started + (timeoutMs || 60000);
    const predicate = new Function('return (' + predicateSource + ')()');
    return new Promise((resolve, reject) => {
      const tick = () => {
        let ok = false;
        try { ok = !!predicate(); } catch { ok = false; }
        if (ok) { resolve(performance.now() - started); return; }
        if (performance.now() > deadline) { reject(new Error('timed out: ' + predicateSource)); return; }
        requestAnimationFrame(tick);
      };
      tick();
    });
  };
  check();
})();`;

/* ── Scenario helpers ───────────────────────────────────────────────────────── */

/** Read a numeric metric from the page, or null when it is not there. */
const resourceSummary = `(() => {
  const entries = performance.getEntriesByType('resource');
  const byType = {};
  let transfer = 0;
  for (const entry of entries) {
    const kind = entry.initiatorType || 'other';
    byType[kind] = (byType[kind] || 0) + 1;
    transfer += entry.transferSize || 0;
  }
  const slowest = [...entries]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 5)
    .map((entry) => entry.name.split('/').pop().split('?')[0] + '@' + entry.duration.toFixed(0) + 'ms');
  const nav = performance.getEntriesByType('navigation')[0];
  return {
    resourceCount: entries.length,
    transferBytes: transfer,
    resourceMs: entries.reduce((total, entry) => total + entry.duration, 0),
    slowest,
    byType,
    domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
    load: nav ? nav.loadEventEnd : null,
    fcp: (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime ?? null,
  };
})()`;

class Runner {
  constructor(cdp, fixtures) {
    this.cdp = cdp;
    this.fixtures = fixtures;
    this.results = new Map();
  }

  record(scenario, metrics) {
    if (!this.results.has(scenario)) this.results.set(scenario, []);
    this.results.get(scenario).push(metrics);
  }

  async navigate(url) {
    await this.cdp.send('Page.navigate', { url });
  }

  /** Start a page-side promise that resolves when `selector` appears. */
  async startWait(selector) {
    await this.cdp.evaluate(`window.__bench.p = window.__bench.waitFrom(${JSON.stringify(selector)}); true`, { awaitPromise: false });
  }

  async readWait() {
    return this.cdp.evaluate('window.__bench.p');
  }

  async setFile(path) {
    const { root } = await this.cdp.send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await this.cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
    if (!nodeId) throw new Error('no file input on the page');
    await this.cdp.send('DOM.setFileInputFiles', { files: [path], nodeId });
  }

  /** Wait for a selector from Node (coarse, for state that is already reached). */
  async waitSelector(selector, timeoutMs = 60000) {
    return this.cdp.evaluate(`window.__bench.waitFrom(${JSON.stringify(selector)}, ${timeoutMs})`);
  }

  async settle(selector) {
    await this.waitSelector(selector);
    // One more frame so the commit is painted, not just mounted.
    await this.cdp.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))');
  }
}

/* ── Scenarios ──────────────────────────────────────────────────────────────── */

function buildScenarios(fixtures) {
  const scenarios = [];

  scenarios.push({
    name: 'first-load-single',
    runs: RUNS,
    async run(runner) {
      const cdp = runner.cdp;
      await cdp.evaluate('window.__bench && (window.__bench.milestones = {})', { awaitPromise: false }).catch(() => {});
      await runner.navigate(`${BASE}?mode=single&lang=en`);
      await runner.waitSelector('[data-run-status="computed"]', 60000);
      await runner.settle('[data-run-status="computed"]');
      const page = await cdp.evaluate(resourceSummary);
      const milestones = await cdp.evaluate('window.__bench.milestones');
      const lcp = await cdp.evaluate('window.__bench.lcp');
      const blocking = await cdp.evaluate('({ sum: window.__bench.blockingMs(), max: window.__bench.maxBlockMs(), count: window.__bench.longTaskCount() })');
      return { ...page, lcp, ...milestones, blocking };
    },
  });

  scenarios.push({
    name: 'wasm-init-cold',
    runs: RUNS,
    async run(runner) {
      const cdp = runner.cdp;
      // robots.txt is a same-origin document with no scripts, so the engine
      // module is the only thing on the page and its load cannot be confused
      // with the app's own boot.
      await runner.navigate(`${BASE}robots.txt`);
      await runner.waitSelector('body', 20000);
      const measured = await cdp.evaluate(`(async () => {
        const t0 = performance.now();
        const module = await import(${JSON.stringify(ENGINE_MODULE_URL)});
        const imported = performance.now();
        await module.default();
        const ready = performance.now();
        const wasm = performance.getEntriesByType('resource').find((entry) => entry.name.endsWith('.wasm'));
        return {
          importMs: imported - t0,
          initMs: ready - imported,
          totalMs: ready - t0,
          wasmDuration: wasm ? wasm.duration : null,
          wasmTransfer: wasm ? wasm.transferSize : null,
        };
      })()`);
      return measured;
    },
  });

  scenarios.push({
    name: 'single-calculate',
    runs: RUNS,
    async run(runner) {
      const cdp = runner.cdp;
      await runner.navigate(`${BASE}?mode=single&lang=en`);
      await runner.settle('[data-run-status="computed"]');
      // A parameter edit marks the run stale and reveals the calculate button;
      // the click is what the user does. Measured from the click to the settled
      // result, because that interval is the whole interaction.
      await cdp.evaluate(`(() => {
        const input = document.querySelector('input[type="number"]');
        if (!input) throw new Error('no numeric parameter input');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, String(Number(input.value) + 1));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      await runner.startWait('[data-action="calculate"]');
      await cdp.evaluate('window.__bench.resetLongTasks(); true', { awaitPromise: false });
      const elapsed = await cdp.evaluate(`(() => {
        const button = document.querySelector('[data-action="calculate"]');
        if (!button) throw new Error('no calculate button');
        const started = performance.now();
        button.click();
        return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(performance.now() - started))));
      })()`);
      const kernel = await cdp.evaluate(`(() => {
        const node = document.querySelector('[data-run-status="computed"]');
        return node ? { engine: node.getAttribute('data-kernel'), computeMs: Number(node.getAttribute('data-compute-ms')) } : null;
      })()`);
      const blocking = await cdp.evaluate('({ sum: window.__bench.blockingMs(), max: window.__bench.maxBlockMs(), count: window.__bench.longTaskCount() })');
      return { wallMs: elapsed, computeMs: kernel?.computeMs ?? null, blocking };
    },
  });

  scenarios.push({
    name: 'single-model-switch',
    runs: RUNS,
    async run(runner) {
      const cdp = runner.cdp;
      await runner.navigate(`${BASE}?mode=single&lang=en&model=aci209`);
      await runner.settle('[data-run-status="computed"]');
      await cdp.evaluate('window.__bench.resetLongTasks(); true', { awaitPromise: false });
      // Both the workspace remount and the new model's first calculation are in
      // the interval: that is what a model switch costs the user.
      const predicate = `() => document.querySelector('[data-model="b4"]')?.getAttribute('aria-pressed') === 'true' && !!document.querySelector('[data-run-status="computed"]')`;
      await cdp.evaluate(`window.__bench.p = window.__bench.until(${JSON.stringify(predicate)}); true`, { awaitPromise: false });
      await cdp.evaluate(`(() => {
        const target = document.querySelector('[data-model="b4"]');
        if (!target) throw new Error('model button missing');
        target.click();
        return true;
      })()`, { awaitPromise: false });
      const elapsed = await runner.readWait();
      const computeMs = await cdp.evaluate(`(() => {
        const header = document.querySelector('[data-run-status="computed"]');
        return header ? Number(header.getAttribute('data-compute-ms')) : null;
      })()`);
      const blocking = await cdp.evaluate('({ sum: window.__bench.blockingMs(), max: window.__bench.maxBlockMs(), count: window.__bench.longTaskCount() })');
      return { wallMs: elapsed, computeMs, blocking };
    },
  });

  scenarios.push({
    name: 'dual-kernel-compare',
    runs: RUNS,
    async run(runner) {
      const cdp = runner.cdp;
      await runner.navigate(`${BASE}?mode=single&lang=en&model=aci209`);
      await runner.settle('[data-run-status="computed"]');
      await cdp.evaluate('window.__bench.resetLongTasks(); true', { awaitPromise: false });
      await runner.startWait('[data-kernel-comparison][data-ready="true"]');
      const elapsed = await cdp.evaluate(`(() => {
        const button = document.querySelector('[data-action="compare-kernels"]');
        if (!button) throw new Error('no comparison button');
        const started = performance.now();
        button.click();
        return Promise.resolve().then(() => window.__bench.p).then((ms) => ({ settleMs: ms, clickBlockMs: 0 }));
      })()`);
      const blocking = await cdp.evaluate('({ sum: window.__bench.blockingMs(), max: window.__bench.maxBlockMs(), count: window.__bench.longTaskCount() })');
      // The comparison panel renders each kernel's own measured time; read those
      // so the report can state the kernel cost separately from the UI cost.
      const kernels = await cdp.evaluate(`(() => {
        const panel = document.querySelector('[data-kernel-comparison]');
        if (!panel) return null;
        const readouts = [...panel.querySelectorAll('.font-mono')].map((node) => node.textContent.trim()).filter((text) => /[0-9]/.test(text));
        return readouts.slice(0, 2);
      })()`);
      return { settleMs: elapsed.settleMs, kernels, blocking };
    },
  });

  for (const rows of ROWS) {
    scenarios.push({
      name: `batch-compute-${rows}`,
      runs: rows >= 10000 ? Math.max(1, Math.min(2, RUNS)) : RUNS,
      async run(runner) {
        const cdp = runner.cdp;
        await runner.navigate(`${BASE}?mode=batch&lang=en&model=b4`);
        await runner.waitSelector('#batch-model', 60000);
        await cdp.evaluate('window.__bench.resetLongTasks(); true', { awaitPromise: false });
        await runner.startWait('[data-result-matrix]');
        await runner.setFile(fixtures[rows]);
        const waitMs = await runner.readWait();
        const blocking = await cdp.evaluate('({ sum: window.__bench.blockingMs(), max: window.__bench.maxBlockMs(), count: window.__bench.longTaskCount() })');
        // Chart is mounted in the same commit as the matrix; waiting a frame
        // proves it painted rather than that the element exists.
        const chartMs = await cdp.evaluate('window.__bench.waitFrom(".recharts-surface", 30000)');
        // The CSV build is synchronous inside the click handler, so the elapsed
        // time around `click()` is the main-thread cost of the export itself.
        const exportMs = await cdp.evaluate(`(() => {
          const button = document.querySelector('[data-action="export-csv"]');
          if (!button) throw new Error('no export button');
          const started = performance.now();
          button.click();
          return performance.now() - started;
        })()`);
        const exportBlocking = await cdp.evaluate('({ sum: window.__bench.blockingMs(), max: window.__bench.maxBlockMs(), count: window.__bench.longTaskCount() })');
        return {
          computeMs: waitMs,
          chartMs,
          exportMs,
          blocking,
          exportBlocking,
        };
      },
    });
  }

  scenarios.push({
    name: 'batch-chart-toggle',
    runs: Math.max(1, Math.min(2, RUNS)),
    async run(runner) {
      const cdp = runner.cdp;
      await runner.navigate(`${BASE}?mode=batch&lang=en&model=b4`);
      await runner.waitSelector('#batch-model', 60000);
      await runner.startWait('[data-result-matrix]');
      await runner.setFile(fixtures[ROWS[ROWS.length - 1]]);
      await runner.readWait();
      await cdp.evaluate('window.__bench.resetLongTasks(); true', { awaitPromise: false });
      const toggle = await cdp.evaluate(`(() => {
        const buttons = [...document.querySelectorAll('button')].filter((node) => ['scatter', 'line'].includes(node.textContent.trim().toLowerCase()));
        const target = buttons[1] ?? buttons[0];
        if (!target) throw new Error('no chart type toggle');
        const started = performance.now();
        const wasLine = document.querySelector('.recharts-line-curve') !== null;
        window.__bench.p = window.__bench.until("() => (document.querySelector('.recharts-line-curve') !== null) !== " + wasLine);
        target.click();
        return { started, wasLine, found: buttons.length };
      })()`);
      const settleMs = await runner.readWait();
      const blocking = await cdp.evaluate('({ sum: window.__bench.blockingMs(), max: window.__bench.maxBlockMs(), count: window.__bench.longTaskCount() })');
      return { settleMs, toggle, blocking };
    },
  });

  scenarios.push({
    name: 'batch-load',
    runs: RUNS,
    async run(runner) {
      const cdp = runner.cdp;
      await runner.navigate(`${BASE}?mode=batch&lang=en`);
      await runner.settle('#batch-model');
      const page = await cdp.evaluate(resourceSummary);
      const milestones = await cdp.evaluate('window.__bench.milestones');
      const blocking = await cdp.evaluate('({ sum: window.__bench.blockingMs(), max: window.__bench.maxBlockMs(), count: window.__bench.longTaskCount() })');
      return { ...page, ...milestones, blocking };
    },
  });

  scenarios.push({
    name: 'docs-load',
    runs: RUNS,
    async run(runner) {
      const cdp = runner.cdp;
      await runner.navigate(`${BASE}?mode=docs&model=b4&lang=en`);
      await runner.waitSelector('[data-doc-heading]', 60000);
      await cdp.evaluate('new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))');
      const page = await cdp.evaluate(resourceSummary);
      const milestones = await cdp.evaluate('window.__bench.milestones');
      const docs = await cdp.evaluate(`({
        headings: document.querySelectorAll('[data-doc-heading]').length,
        equations: document.querySelectorAll('.katex').length,
        tables: document.querySelectorAll('article table').length,
        blocking: { sum: window.__bench.blockingMs(), max: window.__bench.maxBlockMs(), count: window.__bench.longTaskCount() },
      })`);
      return { ...page, ...milestones, ...docs };
    },
  });

  scenarios.push({
    name: 'docs-locale-switch',
    runs: RUNS,
    async run(runner) {
      const cdp = runner.cdp;
      await runner.navigate(`${BASE}?mode=docs&model=b4&lang=en`);
      await runner.settle('[data-doc-heading]');
      await cdp.evaluate('window.__bench.resetLongTasks(); true', { awaitPromise: false });
      const before = await cdp.evaluate(`({ lang: document.documentElement.lang, heading: document.querySelector('[data-doc-heading]')?.textContent ?? '' })`);
      // The listener is installed before the click so the interval starts with
      // the interaction, not with the next CDP round trip.
      const predicate = `() => document.documentElement.lang === 'zh-CN' && (document.querySelector('[data-doc-heading]')?.textContent ?? '') !== ${JSON.stringify(before.heading)}`;
      await cdp.evaluate(`window.__bench.p = window.__bench.until(${JSON.stringify(predicate)}, 20000).catch(() => null); true`, { awaitPromise: false });
      await cdp.evaluate(`(() => {
        const button = document.querySelector('header button[lang]');
        if (!button) throw new Error('no language switch');
        button.click();
        return true;
      })()`, { awaitPromise: false });
      const wallMs = await runner.readWait();
      const afterLang = await cdp.evaluate('document.documentElement.lang');
      const afterHeading = await cdp.evaluate(`document.querySelector('[data-doc-heading]')?.textContent ?? ''`);
      const blocking = await cdp.evaluate('({ sum: window.__bench.blockingMs(), max: window.__bench.maxBlockMs(), count: window.__bench.longTaskCount() })');
      return { wallMs, afterLang, changed: afterHeading !== before.heading, blocking };
    },
  });

  scenarios.push({
    name: 'palette-open',
    runs: RUNS,
    async run(runner) {
      const cdp = runner.cdp;
      await runner.navigate(`${BASE}?mode=single&lang=en`);
      await runner.settle('[data-run-status="computed"]');
      await cdp.evaluate('window.__bench.resetLongTasks(); true', { awaitPromise: false });
      const ms = await cdp.evaluate(`(() => {
        const button = document.querySelector('[data-action="open-palette"]');
        if (!button) throw new Error('no palette button');
        const started = performance.now();
        button.click();
        return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(performance.now() - started))));
      })()`);
      const blocking = await cdp.evaluate('({ sum: window.__bench.blockingMs(), max: window.__bench.maxBlockMs(), count: window.__bench.longTaskCount() })');
      return { wallMs: ms, blocking };
    },
  });

  return scenarios;
}

/* ── Statistics ─────────────────────────────────────────────────────────────── */

const NUMERIC = (value) => typeof value === 'number' && Number.isFinite(value);

function stats(values) {
  const list = values.filter(NUMERIC).sort((a, b) => a - b);
  if (!list.length) return null;
  const median = list.length % 2 ? list[(list.length - 1) / 2] : (list[list.length / 2 - 1] + list[list.length / 2]) / 2;
  return {
    n: list.length,
    median: Number(median.toFixed(2)),
    min: Number(list[0].toFixed(2)),
    max: Number(list[list.length - 1].toFixed(2)),
  };
}

/** Flatten each run's metrics into `scenario.metric` -> stats. */
function summarise(results) {
  const out = {};
  for (const [scenario, runs] of results) {
    const keys = new Set();
    for (const metrics of runs) {
      for (const [key, value] of Object.entries(metrics)) if (NUMERIC(value)) keys.add(key);
    }
    const metrics = {};
    for (const key of keys) metrics[key] = stats(runs.map((entry) => entry[key]));
    out[scenario] = { runs: runs.length, metrics, raw: runs };
  }
  return out;
}

/* ── Environment ────────────────────────────────────────────────────────────── */

function environment(chromeVersion) {
  const safe = (command) => {
    try {
      return execFileSync('bash', ['-lc', command], { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  };
  return {
    label: LABEL,
    date: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    os: safe('sw_vers -productVersion 2>/dev/null || uname -sr'),
    cpu: safe('sysctl -n machdep.cpu.brand_string 2>/dev/null || sysctl -n hw.model'),
    cores: safe('sysctl -n hw.ncpu 2>/dev/null'),
    memoryBytes: Number(safe('sysctl -n hw.memsize 2>/dev/null')) || null,
    chrome: chromeVersion,
    runs: RUNS,
    rows: ROWS,
    cache: 'disabled (Network.setCacheDisabled)',
    url: BASE,
  };
}

/* ── Report ─────────────────────────────────────────────────────────────────── */

const ROW_DESCRIPTIONS = {
  'first-load-single': 'Cold load of the calculation workspace until the first result is on screen (cache disabled).',
  'wasm-init-cold': 'Import + instantiate of the Rust engine chunk on an otherwise empty same-origin page.',
  'single-calculate': 'Edit one numeric parameter, then press Calculate, measured until the result is settled.',
  'single-model-switch': 'Switch model in the calculation workspace; measured until the new model has computed.',
  'dual-kernel-compare': 'Run the JS/Rust comparison over the full 10,000-day series.',
  'batch-chart-toggle': `Toggle the batch chart between scatter and line with the widest dataset (${ROWS[ROWS.length - 1]} rows).`,
  'batch-load': 'Cold load of the batch workspace until its controls are on screen (no file yet).',
  'docs-load': 'Cold load of the RILEM B4 reference document (Markdown + KaTeX).',
  'docs-locale-switch': 'Switch the interface language on the reference page, measured until <html lang> flips.',
  'palette-open': 'Open the command palette from the calculation workspace.',
};

function markdown(report, comparison) {
  const lines = [];
  lines.push(`# Performance benchmark — ${report.environment.label}`);
  lines.push('');
  lines.push(`Generated ${report.environment.date} by \`node scripts/benchmark.mjs\`.`);
  lines.push('');
  lines.push('## Environment');
  lines.push('');
  lines.push('| | |');
  lines.push('|---|---|');
  for (const [key, value] of Object.entries(report.environment)) {
    if (key === 'label') continue;
    lines.push(`| ${key} | ${Array.isArray(value) ? value.join(', ') : value} |`);
  }
  lines.push('');
  lines.push('Cache is disabled for every measurement, so each number is a cold load. `vite preview`');
  lines.push('serves the build without compression; the byte figures below are computed from the files');
  lines.push('on disk, so they are what a compressed host would send.');
  lines.push('');
  lines.push('## Bundle');
  lines.push('');
  lines.push(`- initial (referenced by \`index.html\`): ${report.bundle.initial.count} files, ` +
    `${(report.bundle.initial.raw / 1024).toFixed(1)} KiB raw, ${(report.bundle.initial.gzip / 1024).toFixed(1)} KiB gzip, ` +
    `${(report.bundle.initial.brotli / 1024).toFixed(1)} KiB brotli`);
  lines.push(`- lazy (only fetched when a workspace needs it): ${report.bundle.lazy.count} files, ` +
    `${(report.bundle.lazy.raw / 1024).toFixed(1)} KiB raw, ${(report.bundle.lazy.gzip / 1024).toFixed(1)} KiB gzip`);
  lines.push('');
  lines.push('| file | initial | raw KiB | gzip KiB | brotli KiB |');
  lines.push('|---|---|---:|---:|---:|');
  for (const entry of report.bundle.files) {
    lines.push(`| \`${entry.file}\` | ${entry.initial ? 'yes' : ''} | ${(entry.raw / 1024).toFixed(1)} | ${(entry.gzip / 1024).toFixed(1)} | ${(entry.brotli / 1024).toFixed(1)} |`);
  }
  lines.push('');
  lines.push('## Scenarios');
  lines.push('');
  lines.push('Values are milliseconds unless the metric name says otherwise. `median` is the headline;');
  lines.push('`min`/`max` are printed so the spread is visible rather than hidden behind one number.');
  lines.push('');
  if (comparison) {
    lines.push(`Deltas are against \`${comparison.environment.label}\` (${comparison.environment.date}); negative is faster.`);
    lines.push('');
  }
  for (const [scenario, entry] of Object.entries(report.scenarios)) {
    lines.push(`### ${scenario}`);
    lines.push('');
    if (ROW_DESCRIPTIONS[scenario]) lines.push(ROW_DESCRIPTIONS[scenario]);
    lines.push('');
    lines.push('| metric | n | median | min | max |' + (comparison ? ' before median | delta |' : ''));
    lines.push('|---|---:|---:|---:|---:|' + (comparison ? '---:|---:|' : ''));
    const before = comparison?.scenarios?.[scenario]?.metrics ?? {};
    for (const [metric, value] of Object.entries(entry.metrics)) {
      let row = `| ${metric} | ${value.n} | ${value.median} | ${value.min} | ${value.max} |`;
      if (comparison) {
        const previous = before[metric]?.median;
        if (typeof previous === 'number' && previous !== 0) {
          const delta = value.median - previous;
          const pct = (delta / previous) * 100;
          row += ` ${previous} | ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%) |`;
        } else {
          row += ' — | — |';
        }
      }
      lines.push(row);
    }
    lines.push('');
  }
  lines.push('## What these numbers do and do not mean');
  lines.push('');
  lines.push('- Wall-clock numbers include React render + commit + paint, not just computation.');
  lines.push('- `blocking.sum` and `blocking.max` come from Chrome\'s longtask observer: tasks over 50 ms.');
  lines.push('  A scenario with `blocking.sum` near zero never held the main thread long enough to be felt.');
  lines.push('- One machine, one browser, one build. Compare only against a run made the same way on the');
  lines.push('  same machine; that is what the environment block above is for.');
  lines.push('');
  return lines.join('\n');
}

/* ── Main ───────────────────────────────────────────────────────────────────── */

async function main() {
  if (!existsSync(resolve(DIST, 'index.html'))) throw new Error('dist/ is missing; run `npm run build` first');
  const bundle = analyzeBundle();
  console.log(`[bundle] initial ${(bundle.initial.gzip / 1024).toFixed(1)} KiB gzip in ${bundle.initial.count} files; lazy ${(bundle.lazy.gzip / 1024).toFixed(1)} KiB gzip`);

  const assetsDir = resolve(DIST, 'assets');
  const engineAsset = readdirSync(assetsDir).find((name) => /^creep_calculator_engine-[A-Za-z0-9_-]+\.js$/.test(name));
  if (!engineAsset) throw new Error('the WASM engine chunk is missing from dist/assets');
  ENGINE_MODULE_URL = `/assets/${engineAsset}`;

  const fixtures = writeFixtures();
  const scenarios = buildScenarios(fixtures);
  const only = args.get('only');
  const selected = only ? scenarios.filter((scenario) => only.split(',').includes(scenario.name)) : scenarios;
  if (!selected.length) throw new Error(`--only matched no scenario (${only})`);

  mkdirSync(FIXTURE_DIR, { recursive: true });
  const preview = spawn(`npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`, {
    cwd: ROOT,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let previewLog = '';
  preview.stdout.on('data', (chunk) => { previewLog += chunk; });
  preview.stderr.on('data', (chunk) => { previewLog += chunk; });

  const chrome = findChrome();
  const browser = spawn(chrome, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${resolve(FIXTURE_DIR, 'chrome-profile')}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    'about:blank',
  ], { stdio: 'ignore' });

  let socket;
  try {
    try {
      await waitForHttp(BASE);
    } catch (error) {
      throw new Error(`${error.message}\n--- vite preview output ---\n${previewLog || '(no output)'}`, { cause: error });
    }
    const targets = await httpGetJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const page = targets.find((target) => target.type === 'page');
    if (!page) throw new Error('no Chrome page target found');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((open, fail) => {
      socket.addEventListener('open', open, { once: true });
      socket.addEventListener('error', fail, { once: true });
    });
    const cdp = new Cdp(socket);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT });
    await cdp.send('Page.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
    const version = await cdp.send('Browser.getVersion').catch(() => null);

    // One throwaway navigation: the very first page load in a fresh profile
    // pays for Chrome's own warmup, which would otherwise land in run 1.
    await cdp.send('Page.navigate', { url: `${BASE}?mode=single&lang=en` });
    await sleep(2500);

    const runner = new Runner(cdp, fixtures);
    for (const scenario of selected) {
      const metrics = [];
      for (let run = 0; run < scenario.runs; run += 1) {
        try {
          const result = await scenario.run(runner);
          metrics.push(result);
        } catch (error) {
          metrics.push({ error: error.message });
          console.error(`  ${scenario.name} run ${run + 1} failed: ${error.message}`);
        }
      }
      for (const entry of metrics) runner.record(scenario.name, entry);
      const summary = summarise(new Map([[scenario.name, metrics]]))[scenario.name];
      const headline = Object.entries(summary.metrics).slice(0, 3).map(([key, value]) => `${key}=${value.median}`).join(' ');
      console.log(`${scenario.name.padEnd(24)} ${scenario.runs} run(s)  ${headline}`);
    }

    const report = {
      environment: environment(version?.product ?? 'unknown'),
      bundle,
      scenarios: summarise(runner.results),
      engineModuleUrl: ENGINE_MODULE_URL,
    };
    let comparison = null;
    if (COMPARE) comparison = JSON.parse(readFileSync(COMPARE, 'utf8'));
    if (JSON_OUT) writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`);
    if (MD_OUT) writeFileSync(MD_OUT, markdown(report, comparison));
    console.log(`[done] ${JSON_OUT ? `json -> ${JSON_OUT}; ` : ''}${MD_OUT ? `report -> ${MD_OUT}` : ''}`);
  } finally {
    socket?.close();
    browser.kill();
    preview.kill();
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
