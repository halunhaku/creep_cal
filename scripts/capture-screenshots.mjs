#!/usr/bin/env node
/**
 * Regenerate the screenshots in docs/images/ from the running app.
 *
 * These images go stale every time the interface changes, so they are produced
 * by a script instead of by hand:
 *
 *     npm run build
 *     node scripts/capture-screenshots.mjs
 *
 * It serves dist/ with `vite preview`, drives headless Chrome over the DevTools
 * Protocol (clicking through the three workspaces), and writes one PNG per entry
 * in SHOTS. Requires Chrome; override its location with CHROME_PATH.
 *
 * Two runs over one unchanged build produce byte-identical images. The
 * calculation workspace renders the kernel's own measured runtime, which differs
 * every run and used to make six of these files churn on nothing; `prepare()`
 * stamps those values out before capturing, the way dom-snapshot.mjs normalises
 * them before hashing. If you change what the app renders, expect a real diff;
 * if you get one without meaning to, a timing has escaped the stamping.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampVolatile } from './stampVolatile.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'docs/images');
const PORT = Number(process.env.PREVIEW_PORT ?? 4173);
const CDP_PORT = Number(process.env.CDP_PORT ?? 9222);
const BASE = `http://127.0.0.1:${PORT}/`;

/*
 * The waits below match English interface text, so the language is pinned rather
 * than inherited from the browser. `detectLocale()` reads `navigator.languages`,
 * so on a Chinese-locale machine this script rendered 中文 and every English
 * wait timed out — and because it failed before capturing anything, the working
 * tree stayed clean, which reads exactly like a pass. `lang=en` is the app's own
 * supported parameter, so it also climbs the real URL path.
 */
const appUrl = (search = '') => {
  const query = new URLSearchParams(search.replace(/^\?/, ''));
  query.set('lang', 'en');
  return `${BASE}?${query}`;
};

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

/** Each shot: which workspace to open, how big, and what to do before capturing. */
const SHOTS = [
  { file: 'readme-hero.png', width: 1440, height: 760, workspace: 'single', prepare: 'compare' },
  { file: 'ui-wide-single-analysis.png', width: 1800, height: 1250, workspace: 'single', prepare: 'compare' },
  { file: 'ui-wide-batch-matrix.png', width: 1800, height: 1250, workspace: 'batch', prepare: 'sample' },
  { file: 'ui-wide-model-docs.png', width: 1800, height: 1250, workspace: 'docs', selectModel: 'RILEM Model B4' },
  { file: 'ui-single-analysis.png', width: 488, height: 1055, workspace: 'single', prepare: 'compare' },
  { file: 'ui-batch-matrix.png', width: 488, height: 1055, workspace: 'batch', prepare: 'sample' },
  { file: 'ui-model-docs.png', width: 488, height: 1055, workspace: 'docs', selectModel: 'RILEM Model B4' },
  { file: 'responsive-single-390.png', width: 390, height: 844, workspace: 'single' },
  { file: 'responsive-single-768.png', width: 768, height: 1024, workspace: 'single' },
  { file: 'responsive-single-1440.png', width: 1440, height: 900, workspace: 'single' },
  { file: 'responsive-single-1920.png', width: 1920, height: 1080, workspace: 'single' },
];

const HEADINGS = {
  single: 'Time-dependent concrete analysis',
  batch: 'Dataset pipeline',
  docs: 'Model standards and equations',
};

// innerText reflects rendered text, and the interface uppercases its labels via
// CSS, so every text probe has to be case-insensitive.
const hasText = (text) => `document.body.innerText.toLowerCase().includes(${JSON.stringify(text.toLowerCase())})`;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      if (existsSync(candidate)) return candidate;
    } catch { /* keep looking */ }
  }
  throw new Error(`Chrome not found. Set CHROME_PATH. Tried:\n  ${CHROME_CANDIDATES.join('\n  ')}`);
}

async function waitForHttp(url, timeoutMs = 20000) {
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

/** Minimal DevTools Protocol client: one page target, flat message ids. */
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
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
  }

  /** Poll an in-page expression until it is truthy. */
  async waitFor(expression, { timeoutMs = 20000, label = expression } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const { result } = await this.send('Runtime.evaluate', { expression, returnByValue: true });
      if (result.value) return;
      await sleep(120);
    }
    const text = await this.evaluate('document.body.innerText.slice(0, 600)');
    throw new Error(`Timed out waiting for ${label}. Page shows:\n${text}`);
  }

  async evaluate(expression) {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.text ?? 'evaluate failed');
    return result.value;
  }
}

/** Click the first enabled button whose trimmed text matches; report if absent. */
const clickButton = (label) => `(() => {
  const wanted = ${JSON.stringify(label)}.toLowerCase();
  const buttons = [...document.querySelectorAll('button')];
  // The reference library's model buttons lead with their index ("03 RILEM
  // Model B4"), so leading digits are stripped before matching.
  const textOf = (item) => item.textContent.trim().replace(/^\\d+\\s*/, '').toLowerCase();
  const button = buttons.find((item) => textOf(item).startsWith(wanted));
  if (!button) return { clicked: false, seen: buttons.map((item) => item.textContent.trim()).filter(Boolean) };
  if (button.disabled) return { clicked: false, disabled: true, seen: [] };
  button.click();
  return { clicked: true };
})()`;

async function click(cdp, label) {
  const outcome = await cdp.evaluate(clickButton(label));
  if (!outcome.clicked) {
    const detail = outcome.disabled
      ? 'the button is disabled'
      : `no button starts with that text. Buttons on the page: ${JSON.stringify(outcome.seen)}`;
    throw new Error(`Could not click "${label}": ${detail}`);
  }
}

async function openWorkspace(cdp, shot) {
  const { workspace } = shot;
  await cdp.send('Page.navigate', { url: appUrl(shot.url) });
  await cdp.waitFor(hasText(HEADINGS.single), { label: 'the app shell' });
  if (workspace !== 'single') {
    await click(cdp, workspace === 'batch' ? 'Batch' : 'Reference');
  }
  await cdp.waitFor(hasText(HEADINGS[workspace]), { label: `the ${workspace} workspace` });
  // Selecting the model by clicking keeps this a client-side change, so the
  // session stays warm; loading the URL in a new document would show an idle
  // kernel in this one README image and a ready one in the rest.
  if (shot.selectModel) await click(cdp, shot.selectModel);
}

async function prepare(cdp, shot) {
  if (shot.prepare === 'sample') {
    await click(cdp, 'Load demo sweep');
    await cdp.waitFor(hasText('Result matrix'), { label: 'the sample result matrix' });
  }
  if (shot.prepare === 'compare') {
    await click(cdp, 'Compare kernels');
    await cdp.waitFor(hasText('Rust speed-up'), { label: 'the kernel comparison' });
  }
  // Wait for webfonts before capturing. Without this the same page can render
  // with fallback metrics on a slow run, which makes the PNGs differ between
  // runs and turns any before/after byte comparison into noise.
  await cdp.evaluate('document.fonts.ready.then(() => true)');
  // Let the fade-in and any chart layout settle too.
  await sleep(700);
  // Then remove the last thing that still moves: the kernel's own measured
  // runtime, which is rendered into the page and differs on every run. See
  // stampVolatile.mjs for why it is stamped rather than left alone.
  const stamped = await cdp.evaluate(`(${stampVolatile.toString()})(document.body)`);
  // A capture of the calculation workspace always shows a "Last compute"
  // readout, so stamping nothing there means the markup moved out from under
  // this script and the images have quietly gone nondeterministic again.
  if (shot.workspace === 'single' && stamped === 0) {
    throw new Error(`stamped no timings in ${shot.file} — the readouts this removes have moved`);
  }
}

async function main() {
  const chrome = findChrome();
  mkdirSync(OUT_DIR, { recursive: true });

  // Bind IPv4 explicitly: vite's default `localhost` can end up on ::1 only,
  // which the 127.0.0.1 health check and Chrome's CDP client would both miss.
  const preview = spawn(`npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`, {
    cwd: ROOT,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let previewLog = '';
  preview.stdout.on('data', (chunk) => { previewLog += chunk; });
  preview.stderr.on('data', (chunk) => { previewLog += chunk; });
  const browser = spawn(chrome, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--user-data-dir=/tmp/creep-cal-screenshots',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    // Stamping the timings out (see stampVolatile.mjs) left one thing still
    // moving: a 17px stroked icon in the header antialiased two different ways
    // between runs, 14 sub-perceptual pixels at a time. It is a raster race —
    // the capture lands before the compositor has finished — so take the frame
    // only once every stage has run. The timeout one is the 5s content-rendering
    // deadline, which otherwise abandons that wait and returns the early frame.
    //
    // `--disable-gpu` removes the last of it. Software raster is not what moves
    // the pixels: with these three flags the output is byte-identical to the
    // same capture without it on most runs, and it is only the occasional run
    // that diverges. Measured against the previously committed images, the whole
    // flag set changes text antialiasing by at most 57/255 (mean ~1), and every
    // change above that threshold is a stamped timing.
    '--run-all-compositor-stages-before-draw',
    '--disable-new-content-rendering-timeout',
    '--disable-gpu',
    'about:blank',
  ], { stdio: 'ignore' });

  let socket;
  try {
    try {
      await waitForHttp(BASE);
    } catch (error) {
      throw new Error(
        `${error.message}\n--- vite preview output ---\n${previewLog || '(no output)'}`,
        { cause: error },
      );
    }
    const listResponse = await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const targets = await listResponse.json();
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

    for (const shot of SHOTS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: shot.width,
        height: shot.height,
        deviceScaleFactor: 1,
        mobile: shot.width < 700,
      });
      await openWorkspace(cdp, shot);
      await prepare(cdp, shot);

      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(resolve(OUT_DIR, shot.file), Buffer.from(data, 'base64'));
      console.log(`${shot.file.padEnd(34)} ${shot.width}x${shot.height}  ${shot.workspace}${shot.prepare ? ` + ${shot.prepare}` : ''}`);
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
