#!/usr/bin/env node
/**
 * Snapshot the rendered DOM of each workspace as a hash, so a refactor that is
 * meant to be invisible can be proven to be invisible.
 *
 *     npm run build
 *     node scripts/dom-snapshot.mjs --save        # baseline before the change
 *     node scripts/dom-snapshot.mjs --check       # fail if anything moved
 *
 * The screenshots cover the batch and reference pages, but the calculation
 * workspace has no deterministic capture (its images contain live timings), and
 * the interesting states there — both kernels, a finished comparison — are not
 * reachable from a URL. This walks them with the DevTools Protocol instead and
 * hashes the DOM with the volatile text (millisecond values, ratios, clock
 * times) normalised away.
 *
 * Requires Chrome; set CHROME_PATH if it is not in the usual place.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = Number(process.env.PREVIEW_PORT ?? 4180);
const CDP_PORT = Number(process.env.CDP_PORT ?? 9228);
const BASE = `http://127.0.0.1:${PORT}/`;
const DEFAULT_BASELINE = '/tmp/creep-dom-baseline.json';

const mode = process.argv.includes('--save') ? 'save'
  : process.argv.includes('--check-styles') ? 'check-styles'
    : process.argv.includes('--check') ? 'check'
      : 'print';
const STYLE_ONLY = mode === 'check-styles';
const baselinePath = process.env.BASELINE ?? DEFAULT_BASELINE;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

// Volatile by nature: "1.40 ms", the comparison panel (value and unit live in
// sibling elements), the "0.83×" ratio, and log timestamps.
const NORMALISE = `
  const normalise = (html) => html
    .replace(/\\d+(?:\\.\\d+)?\\s*(?:<[^>]+>)?\\s*ms/g, '<MS>')
    .replace(/\\d+(?:\\.\\d+)?×/g, '<RATIO>×')
    .replace(/\\d{1,2}:\\d{2}:\\d{2}/g, '<TIME>');
`;

// Each scene names the state it must reach, so the snapshot never races the
// first calculation: waiting on text, not on elapsed time.
// `settled` / `after` are in-page predicates, not loose text: matching the
// page's own prose ("…the JavaScript reference kernel…", "…a reproducible result
// matrix.") would return before the state is reached.
const labelled = (label) => `[...document.querySelectorAll('.eyebrow')].some((el) => el.textContent.trim() === ${JSON.stringify(label)})`;
// Exact text on a leaf element: "Computed" is a status badge, not an eyebrow.
const leafText = (text) => `[...document.querySelectorAll('*')].some((el) => el.children.length === 0 && el.textContent.trim() === ${JSON.stringify(text)})`;

// Every element's computed typography and geometry, in document order. Insensitive
// to class *names*, which is what a tokenisation pass legitimately changes.
const STYLE_FINGERPRINT = `
  const fingerprint = [...document.querySelectorAll('body *')].map((el) => {
    const s = getComputedStyle(el);
    return [el.tagName, s.fontSize, s.fontFamily, s.fontWeight, s.lineHeight,
            s.letterSpacing, s.textTransform, s.color, s.backgroundColor,
            s.borderRadius, s.borderWidth, s.padding, s.gap].join('|');
  }).join('\\n')
`;

const SCENES = [
  // "Last compute" only appears once a run has finished. The "Computed" badge is
  // rendered from the first paint (dirty starts false), so waiting on it let the
  // engine switch race the initial calculation and changed the log contents.
  { key: 'single-js', workspace: 'Calculate', settled: labelled('Last compute'), click: 'JS Ref.', after: labelled('JavaScript reference') },
  { key: 'single-rust', workspace: 'Calculate', settled: labelled('Last compute') },
  { key: 'single-compare', workspace: 'Calculate', settled: labelled('Last compute'), click: 'Compare kernels', after: labelled('Rust speed-up') },
  { key: 'batch-empty', workspace: 'Batch', settled: labelled('Prediction model') },
  { key: 'batch-loaded', workspace: 'Batch', settled: labelled('Prediction model'), click: 'Load demo sweep', after: labelled('Result matrix') },
  { key: 'docs-b4', workspace: 'Reference', settled: leafText('Parameter contract') },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHttp(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function findChrome() {
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Chrome not found. Set CHROME_PATH. Tried:\n  ${CHROME_CANDIDATES.join('\n  ')}`);
  return found;
}

async function main() {
  const chrome = findChrome();
  const preview = spawn(`npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`, {
    cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let previewLog = '';
  preview.stdout.on('data', (chunk) => { previewLog += chunk; });
  preview.stderr.on('data', (chunk) => { previewLog += chunk; });
  const browser = spawn(chrome, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--user-data-dir=/tmp/creep-dom-snapshot',
    '--no-first-run',
    '--hide-scrollbars',
    'about:blank',
  ], { stdio: 'ignore' });

  let socket;
  try {
    try {
      await waitHttp(BASE);
    } catch (error) {
      throw new Error(`${error.message}\n--- vite preview output ---\n${previewLog || '(no output)'}`, { cause: error });
    }
    const targets = await (await waitHttp(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const page = targets.find((target) => target.type === 'page');
    if (!page) throw new Error('no Chrome page target found');

    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((open, fail) => {
      socket.addEventListener('open', open, { once: true });
      socket.addEventListener('error', fail, { once: true });
    });

    let nextId = 1;
    const pending = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
    });
    const send = (method, params = {}) => {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    };
    const evaluate = async (expression) => {
      const { result, exceptionDetails } = await send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true,
      });
      // Silently returning undefined here hid a broken in-page expression for a
      // whole run; a failed probe must be loud.
      if (exceptionDetails) {
        throw new Error(`in-page evaluation failed: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
      }
      return result.value;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

    // Accept a value only once two consecutive readings agree. Chasing individual
    // races (chart measurement, tick count, an engine switch mid-flight) kept
    // producing coin-flip fingerprints; this settles all of them at once and
    // fails loudly if something genuinely oscillates.
    const stable = async (expression, label) => {
      let previous = await evaluate(expression);
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await sleep(250);
        const current = await evaluate(expression);
        if (current === previous) return current;
        previous = current;
      }
      throw new Error(`${label} never settled`);
    };

    const waitFor = async (expression, label) => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (await evaluate(expression)) return;
        await sleep(150);
      }
      throw new Error(`timed out waiting for ${label}`);
    };

    const snapshot = {};
    for (const scene of SCENES) {
      await send('Page.navigate', { url: BASE });
      await sleep(900);
      if (scene.workspace !== 'Calculate') {
        await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(scene.workspace)})?.click()`);
        await waitFor(labelled('Prediction model') + " || " + leafText('Parameter contract'), `the ${scene.workspace} workspace`);
      }
      await waitFor(scene.settled, `the settled ${scene.key} state`);
      if (scene.click) {
        const clicked = await evaluate(`(() => {
          const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().toLowerCase().startsWith(${JSON.stringify(scene.click)}.toLowerCase()));
          if (!button || button.disabled) return false;
          button.click();
          return true;
        })()`);
        if (!clicked) throw new Error(`could not click "${scene.click}" in scene ${scene.key}`);
        await waitFor(scene.after, `the post-click state of ${scene.key}`);
      }
      await evaluate('document.fonts.ready.then(() => true)');
      // recharts writes its *measured* size inline on .recharts-wrapper and only
      // then renders its axis ticks, so a snapshot taken during that sequence
      // differs without any layout change behind it. Wait until both the measured
      // size and the tick count have stopped moving, and the ticks exist at all.
      let chartState = null;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const current = await evaluate(`(() => {
          const wrapper = document.querySelector('.recharts-wrapper');
          if (!wrapper) return 'no-chart';
          return wrapper.getAttribute('style') + '|ticks=' + document.querySelectorAll('.recharts-cartesian-axis-tick').length;
        })()`);
        const settled = current === chartState && (current === 'no-chart' || !current.endsWith('ticks=0'));
        if (settled) break;
        chartState = current;
        await sleep(200);
      }

      const normalised = await evaluate(`(async () => { ${NORMALISE}
        return normalise(document.body.innerHTML);
      })()`);
      if (process.env.DUMP_DIR) {
        writeFileSync(`${process.env.DUMP_DIR}/${scene.key}.html`, normalised);
      }
      snapshot[scene.key] = await stable(`(async () => { ${NORMALISE}
        const bytes = new TextEncoder().encode(normalise(document.body.innerHTML));
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
      })()`, 'the DOM hash');
      snapshot[`${scene.key}::styles`] = await stable(`(async () => { ${STYLE_FINGERPRINT}
        const bytes = new TextEncoder().encode(fingerprint);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
      })()`, 'the computed-style fingerprint');
    }

    if (mode === 'save') {
      writeFileSync(baselinePath, `${JSON.stringify(snapshot, null, 2)}\n`);
      console.log(`baseline written to ${baselinePath}`);
      console.log(JSON.stringify(snapshot, null, 2));
    } else if (mode === 'check' || STYLE_ONLY) {
      const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
      const keys = Object.keys(snapshot).filter((key) => !STYLE_ONLY || key.endsWith('::styles'));
      const changed = keys.filter((key) => snapshot[key] !== baseline[key]);
      const removed = keys.filter((key) => !(key in baseline));
      const domOnly = Object.keys(snapshot)
        .filter((key) => !key.endsWith('::styles') && snapshot[key] !== baseline[key]);
      if (STYLE_ONLY && domOnly.length) {
        console.log(`(html changed in ${domOnly.length} scene(s), which a class rename is expected to do)`);
      }
      if (changed.length || removed.length) {
        for (const key of changed) console.error(`${key}: ${baseline[key]} -> ${snapshot[key]}`);
        for (const key of removed) console.error(`${key}: missing from snapshot`);
        throw new Error(`${changed.length + removed.length} fingerprint(s) changed — this pass was supposed to be invisible`);
      }
      console.log(`all ${keys.length} ${STYLE_ONLY ? 'computed-style' : ''} fingerprints match ${baselinePath}`);
    } else {
      console.log(JSON.stringify(snapshot, null, 2));
    }
  } finally {
    socket?.close();
    browser.kill();
    preview.kill();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
