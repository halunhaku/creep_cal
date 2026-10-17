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
 *
 * The style fingerprint is taken at four viewports (see VIEWPORTS). One width
 * cannot see a breakpoint regression: the shell's gutter only differs below
 * 1024px, so measuring 1440 alone was measuring the one width where such a change
 * is provably invisible. Changing the fingerprint's fields or its viewport list
 * invalidates an existing --save baseline; regenerate it before trusting --check.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { assertComplete } from './artifacts.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = Number(process.env.PREVIEW_PORT ?? 4180);
const CDP_PORT = Number(process.env.CDP_PORT ?? 9228);
const BASE = `http://127.0.0.1:${PORT}/`;

/*
 * Every scene below waits on English interface text, so the language is pinned
 * rather than inherited from the browser. `detectLocale()` reads
 * `navigator.languages`, so on a Chinese-locale machine the app rendered 中文 and
 * the first scene timed out on `Last compute` — the gate could not run at all.
 * `lang=en` is the app's own supported parameter, so it also climbs the real
 * URL path.
 */
const appUrl = (search = '') => {
  const query = new URLSearchParams(search.replace(/^\?/, ''));
  query.set('lang', 'en');
  return `${BASE}?${query}`;
};

/**
 * Everything a scene needs is in its URL: the workspace (`?mode=`) and, for the
 * reference library, the model. Built from the scene rather than written out per
 * scene so a new scene cannot forget one of them.
 */
const sceneSearch = (scene) => {
  const query = new URLSearchParams((scene.url ?? '').replace(/^\?/, ''));
  if (!query.has('mode')) query.set('mode', scene.workspace);
  return `?${query}`;
};

/**
 * The fingerprints a complete run produces. Asserted against, rather than derived
 * from the output, because "the keys I happened to collect all match" is true for a
 * run that collected nothing.
 */
const expectedFingerprintKeys = () => {
  const keys = [];
  for (const viewport of VIEWPORTS) {
    for (const scene of SCENES) {
      if (viewport.primary) keys.push(scene.key);
      keys.push(`${scene.key}::styles${viewport.suffix}`);
    }
  }
  return keys;
};

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
// sibling elements), the "0.83×" ratio, log timestamps, and the kernel's own
// measured runtime as an attribute (`data-compute-ms`) rather than as text —
// the text form below cannot see an attribute, so a readout nothing else
// depends on made four scenes hash differently on every run.
const NORMALISE = `
  const normalise = (html) => html
    .replace(/data-compute-ms="[^"]*"/g, 'data-compute-ms="<MS>"')
    .replace(/\\d+(?:\\.\\d+)?\\s*(?:<[^>]+>)?\\s*ms/g, '<MS>')
    .replace(/\\d+(?:\\.\\d+)?×/g, '<RATIO>×')
    .replace(/\\d{1,2}:\\d{2}:\\d{2}/g, '<TIME>');
`;

// Each scene names the state it must reach, so the snapshot never races the
// first calculation: waiting on text, not on elapsed time.
// `settled` / `after` are in-page predicates, not loose text: matching the
// page's own prose ("…the JavaScript reference kernel…", "…a reproducible result
// matrix.") would return before the state is reached.
//
// They are also no longer *display copy*. Every predicate below reads a `data-`
// hook or `id` that the component sets for this purpose, so renaming a label or
// translating the interface cannot break a gate — and a gate that silently stops
// matching is exactly the failure this file has already suffered twice.
const hook = (selector) => `!!document.querySelector(${JSON.stringify(selector)})`;
// A run has finished: the header carries `data-run-status="computed"` only once a
// result exists. This replaced waiting for the words "Last compute".
const RAN = hook('[data-run-status="computed"]');
// The reference library renders the "On this page" list before the document arrives,
// so its eyebrow is not a load signal. A rendered heading is: `[data-doc-heading]`
// is set by MarkdownDocument and only exists once the Markdown has been parsed.
// (The previous signal, the leaf text "Parameter contract", named a table that
// stopped existing when the reference library moved to model Markdown.)
const documentReady = `document.querySelectorAll('[data-doc-heading]').length > 0`;

// Every element's computed typography and geometry, in document order. Insensitive
// to class *names*, which is what a tokenisation pass legitimately changes.
//
// `margin`, `maxWidth` and `boxShadow` are here because their absence made this gate
// blind to a whole class of change. `.workspace-header` carries its spacing as
// margin-bottom and the shell's centring is margin-inline + max-width, so a pass that
// moved either returned green; and `shadow-[var(--shadow-popover)]` compiled to a
// shadow *colour* that painted nothing, which is invisible to a fingerprint that
// never reads box-shadow.
const STYLE_FINGERPRINT = `
  const fingerprint = [...document.querySelectorAll('body *')].map((el) => {
    const s = getComputedStyle(el);
    return [el.tagName, s.fontSize, s.fontFamily, s.fontWeight, s.lineHeight,
            s.letterSpacing, s.textTransform, s.color, s.backgroundColor,
            s.borderRadius, s.borderWidth, s.padding, s.gap,
            s.margin, s.maxWidth, s.boxShadow].join('|');
  }).join('\\n')
`;
//
// Every scene opens its workspace through the URL rather than by clicking a nav
// button. `?mode=batch` is the app's own supported parameter, it is what a shared
// link does, and it removes the class of failure where a click matches the wrong
// button because the label changed.
const SCENES = [
  // A run has to have finished before the fingerprint means anything; `RAN` is the
  // header's own `data-run-status`.
  { key: 'single-js', workspace: 'single', settled: RAN, action: 'kernel-js', after: hook('[data-kernel="js"]') },
  { key: 'single-rust', workspace: 'single', settled: RAN },
  { key: 'single-compare', workspace: 'single', settled: RAN, action: 'compare-kernels', after: hook('[data-kernel-comparison][data-ready="true"]') },
  { key: 'batch-empty', workspace: 'batch', settled: hook('#batch-model') },
  { key: 'batch-loaded', workspace: 'batch', settled: hook('#batch-model'), action: 'load-demo-sweep', after: hook('[data-result-matrix]') },
  // Deep-linked: the reference library now follows the app's model, and B4 is the
  // richest page to fingerprint.
  { key: 'docs-b4', workspace: 'docs', settled: documentReady, url: '?mode=docs&model=b4' },
  // The palette is the only surface that carries the popover shadow token, and the
  // chart tooltips that share it need a hover. Without this scene the fingerprint's
  // boxShadow field observes nothing and the token can go dead unnoticed.
  {
    key: 'palette-open',
    workspace: 'single',
    settled: RAN,
    action: 'open-palette',
    after: `!!document.querySelector('[role="dialog"]')`,
  },
];

// The style fingerprint is taken at each of these, because a single width cannot
// see a breakpoint regression — the shell's own gutter only differs below 1024px,
// so the one viewport this used to measure was the one width where the change was
// provably invisible. The DOM hash is content, not layout, so it stays on the
// primary viewport alone rather than costing a third of the runtime for nothing.
const VIEWPORTS = [
  { suffix: '', width: 1440, height: 1000, primary: true },
  { suffix: '@1023', width: 1023, height: 1000 },
  { suffix: '@900', width: 900, height: 1000 },
  { suffix: '@390', width: 390, height: 844 },
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

    // A scene with a URL is opened directly, which is what a shared link does.
    // Note that this means nothing from the calculate workspace has run: the
    // header reports an idle kernel and recharts has not created its global
    // measurement span. That state is part of the fingerprint.
    //
    // Pulled out of the loop so the same scene can be re-measured at each viewport.
    const settleScene = async (scene) => {
      // The workspace comes from the URL, so there is no nav click to mis-target
      // and the scene is reached the way a shared link reaches it.
      await send('Page.navigate', { url: appUrl(sceneSearch(scene)) });
      await waitFor(hook(`[data-workspace="${scene.workspace}"]`), `the ${scene.workspace} workspace`);
      await waitFor(scene.settled, `the settled ${scene.key} state`);
      if (scene.action) {
        const outcome = await evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify(`[data-action="${scene.action}"]`)});
          if (!el) return { clicked: false, seen: [...document.querySelectorAll('[data-action]')].map((node) => node.dataset.action) };
          if (el.disabled) return { clicked: false, disabled: true };
          el.click();
          return { clicked: true };
        })()`);
        if (!outcome.clicked) {
          const why = outcome.disabled
            ? 'the control is disabled'
            : `no control carries it. Controls on the page: ${JSON.stringify(outcome.seen)}`;
          throw new Error(`could not trigger "${scene.action}" in scene ${scene.key}: ${why}`);
        }
        await waitFor(scene.after, `the post-action state of ${scene.key}`);
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
    };

    const styleHash = () => stable(`(async () => { ${STYLE_FINGERPRINT}
      const bytes = new TextEncoder().encode(fingerprint);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    })()`, 'the computed-style fingerprint');

    for (const viewport of VIEWPORTS) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false,
      });
      for (const scene of SCENES) {
        await settleScene(scene);

        if (viewport.primary) {
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
        }

        // A hash says "something changed"; for an intentional visual change the
        // fingerprint text is what you review, so it is dumped alongside the HTML.
        if (process.env.DUMP_DIR) {
          const lines = await evaluate(`(async () => { ${STYLE_FINGERPRINT}
            return fingerprint;
          })()`);
          writeFileSync(`${process.env.DUMP_DIR}/${scene.key}${viewport.suffix}.styles.txt`, lines);
        }
        snapshot[`${scene.key}::styles${viewport.suffix}`] = await styleHash();
      }
    }

    assertComplete(Object.keys(snapshot), expectedFingerprintKeys(), 'fingerprints');

    if (mode === 'save') {
      writeFileSync(baselinePath, `${JSON.stringify(snapshot, null, 2)}\n`);
      console.log(`baseline written to ${baselinePath}`);
      console.log(JSON.stringify(snapshot, null, 2));
    } else if (mode === 'check' || STYLE_ONLY) {
      const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
      const keys = Object.keys(snapshot).filter((key) => !STYLE_ONLY || key.includes('::styles'));
      const changed = keys.filter((key) => snapshot[key] !== baseline[key]);
      /*
       * The direction that used to be missing, and the reason it mattered.
       *
       * `changed` walks the keys this run produced, so a fingerprint the baseline
       * records and this run never measured was not mismatched — it was simply not
       * looked at. A pass that measured five scenes out of seven therefore reported
       * "all 5 fingerprints match". The expectation has to come from the baseline as
       * well as from the output, or "measured less" and "measured nothing" are
       * indistinguishable from "everything passed".
       */
      const unmeasured = Object.keys(baseline)
        .filter((key) => (!STYLE_ONLY || key.includes('::styles')) && !(key in snapshot));
      const added = keys.filter((key) => !(key in baseline));
      const domOnly = Object.keys(snapshot)
        .filter((key) => !key.includes('::styles') && snapshot[key] !== baseline[key]);
      if (STYLE_ONLY && domOnly.length) {
        console.log(`(html changed in ${domOnly.length} scene(s), which a class rename is expected to do)`);
      }
      if (changed.length || added.length || unmeasured.length) {
        for (const key of changed) console.error(`${key}: ${baseline[key]} -> ${snapshot[key]}`);
        for (const key of added) console.error(`${key}: not in the baseline, so nothing to compare against`);
        for (const key of unmeasured) console.error(`${key}: in the baseline but not measured by this run`);
        throw new Error(`${changed.length + added.length + unmeasured.length} fingerprint(s) changed or went unmeasured — this pass was supposed to be invisible`);
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
  console.error(error.stack ?? error.message);
  // `exitCode` rather than `exit()`: the failure message above goes to a pipe in
  // CI, and an immediate exit can cut it off before it is flushed — which is the
  // one line someone needs to read.
  process.exitCode = 1;
});
