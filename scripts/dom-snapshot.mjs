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

const mode = process.argv.includes('--save') ? 'save' : process.argv.includes('--check') ? 'check' : 'print';
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
const SCENES = [
  { key: 'single-js', workspace: 'Calculate', settled: 'Computed', click: 'JS Ref.', after: 'JavaScript reference' },
  { key: 'single-rust', workspace: 'Calculate', settled: 'Computed' },
  { key: 'single-compare', workspace: 'Calculate', settled: 'Computed', click: 'Compare kernels', after: 'Rust speed-up' },
  { key: 'batch-empty', workspace: 'Batch', settled: 'Drop CSV or XLSX here' },
  { key: 'batch-loaded', workspace: 'Batch', settled: 'Drop CSV or XLSX here', click: 'Load demo sweep', after: 'Result matrix' },
  { key: 'docs-b4', workspace: 'Reference', settled: 'Parameter contract' },
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
    const evaluate = async (expression) => (await send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    })).result.value;

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

    const waitForText = async (text, label) => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const found = await evaluate(`document.body.innerText.toLowerCase().includes(${JSON.stringify(text.toLowerCase())})`);
        if (found) return;
        await sleep(150);
      }
      throw new Error(`timed out waiting for ${label ?? text}`);
    };

    const snapshot = {};
    for (const scene of SCENES) {
      await send('Page.navigate', { url: BASE });
      await sleep(900);
      if (scene.workspace !== 'Calculate') {
        await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(scene.workspace)})?.click()`);
        await waitForText(scene.workspace === 'Batch' ? 'dataset pipeline' : 'model standards', `the ${scene.workspace} workspace`);
      }
      await waitForText(scene.settled, `the settled ${scene.key} state`);
      if (scene.click) {
        const clicked = await evaluate(`(() => {
          const button = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().toLowerCase().startsWith(${JSON.stringify(scene.click)}.toLowerCase()));
          if (!button || button.disabled) return false;
          button.click();
          return true;
        })()`);
        if (!clicked) throw new Error(`could not click "${scene.click}" in scene ${scene.key}`);
        await waitForText(scene.after, `the post-click state of ${scene.key}`);
      }
      await evaluate('document.fonts.ready.then(() => true)');
      await sleep(300);

      snapshot[scene.key] = await evaluate(`(async () => { ${NORMALISE}
        const bytes = new TextEncoder().encode(normalise(document.body.innerHTML));
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
      })()`);
    }

    if (mode === 'save') {
      writeFileSync(baselinePath, `${JSON.stringify(snapshot, null, 2)}\n`);
      console.log(`baseline written to ${baselinePath}`);
      console.log(JSON.stringify(snapshot, null, 2));
    } else if (mode === 'check') {
      const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
      const changed = Object.keys(snapshot).filter((key) => snapshot[key] !== baseline[key]);
      const removed = Object.keys(baseline).filter((key) => !(key in snapshot));
      if (changed.length || removed.length) {
        for (const key of changed) console.error(`${key}: ${baseline[key]} -> ${snapshot[key]}`);
        for (const key of removed) console.error(`${key}: missing from snapshot`);
        throw new Error(`${changed.length + removed.length} scene(s) changed — this refactor was supposed to be invisible`);
      }
      console.log(`all ${Object.keys(snapshot).length} scenes match ${baselinePath}`);
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
