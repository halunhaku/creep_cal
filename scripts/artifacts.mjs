/**
 * Post-run verification for the browser gates.
 *
 * Both gates used to be trusted on their exit path alone. `capture-screenshots.mjs`
 * wrote whatever `Page.captureScreenshot` returned and exited 0, so a capture that
 * came back empty wrote a zero-byte PNG and still reported success; and
 * `dom-snapshot.mjs --check` compared only the fingerprints it had *collected*, so
 * a scene that stopped being measured entirely was not a failure — it was simply
 * absent from the comparison. Both are the same bug in different clothes: a
 * verification step that cannot tell "everything passed" from "nothing ran".
 *
 * These helpers are the part that can be tested without a browser, so the failure
 * modes have unit tests rather than a comment claiming they work.
 */
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * An 8-byte PNG signature. A file that does not start with this is not a
 * screenshot whatever else it is.
 */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * A real capture of any page in this app is tens of kilobytes. 4 KB is far below
 * any of them and far above the truncated-or-blank case that matters.
 */
export const MIN_SCREENSHOT_BYTES = 4096;

/**
 * Check that every expected screenshot was really produced, and report every
 * problem at once rather than only the first — a run that took a minute to reach
 * should not need three more to list three missing files.
 *
 * @param {{
 *   names: string[],
 *   dir: string,
 *   read?: (path: string) => Buffer,
 *   stat?: (path: string) => { size: number },
 * }} options
 * @returns {{ file: string, bytes: number }[]} the files that passed
 */
export function verifyScreenshots({ names, dir, read = readFileSync, stat = statSync }) {
  if (!Array.isArray(names) || names.length === 0) {
    throw new Error('[artifacts] nothing was expected, so nothing could fail — the shot list is empty');
  }

  const problems = [];
  const produced = [];

  for (const name of names) {
    const path = resolve(dir, name);
    let size;
    try {
      size = stat(path).size;
    } catch {
      problems.push(`${name}: not written`);
      continue;
    }
    if (size < MIN_SCREENSHOT_BYTES) {
      problems.push(`${name}: ${size} bytes, below the ${MIN_SCREENSHOT_BYTES}-byte floor (a blank or truncated capture)`);
      continue;
    }
    let head;
    try {
      head = read(path).subarray(0, PNG_SIGNATURE.length);
    } catch (error) {
      problems.push(`${name}: unreadable (${error.message})`);
      continue;
    }
    if (!head.equals(PNG_SIGNATURE)) {
      problems.push(`${name}: not a PNG (starts with ${JSON.stringify(head.toString('latin1'))})`);
      continue;
    }
    produced.push({ file: name, bytes: size });
  }

  if (produced.length !== names.length) {
    throw new Error([
      `[artifacts] ${produced.length} of ${names.length} screenshots are usable, in ${dir}:`,
      ...problems.map((problem) => `  · ${problem}`),
    ].join('\n'));
  }

  return produced;
}

/**
 * Check that the set of images in the repository did not silently change shape.
 *
 * "Every name in the shot list was produced" is true of a shot list that just lost
 * an entry, and "the number of files matches" is true of a run that produced the
 * wrong files. Neither notices a documentation image disappearing. Comparing
 * against the set the repository already ships does: it is the one expectation that
 * does not come from the list being checked.
 *
 * Both directions are failures. A committed image the run no longer produces is a
 * documentation regression; a produced image that is not committed is either a new
 * shot whose file was not added or a stale file nobody deleted.
 *
 * @param {{ produced: string[], shipped: string[] }} sets
 */
export function assertSameImageSet({ produced, shipped }) {
  const producedSet = new Set(produced);
  const shippedSet = new Set(shipped);
  const lost = shipped.filter((name) => !producedSet.has(name));
  const stale = produced.filter((name) => !shippedSet.has(name));
  if (!lost.length && !stale.length) return;

  throw new Error([
    '[artifacts] the set of images changed unexpectedly:',
    ...lost.map((name) => `  · ${name} is committed but this run did not produce it`),
    ...stale.map((name) => `  · ${name} was produced but is not committed (delete it, or add it to the shot list)`),
    'Removing or renaming a documented image is a deliberate change: make it in the',
    'same commit as the shot list, and delete the file it supersedes.',
  ].join('\n'));
}

/**
 * Check that a run measured exactly what it claims to have measured.
 *
 * `dom-snapshot.mjs --check` used to iterate the fingerprints it had produced
 * (`Object.keys(snapshot)`), which means a scene or a viewport that silently
 * stopped being measured was invisible to it: absent keys are not mismatched keys.
 * The expectation has to come from the scene and viewport lists, not from the
 * output.
 *
 * @param {string[]} actual keys the run produced
 * @param {string[]} expected keys the run was supposed to produce
 * @param {string} label what the keys describe, for the message
 */
export function assertComplete(actual, expected, label) {
  const have = new Set(actual);
  const want = new Set(expected);
  const missing = expected.filter((key) => !have.has(key));
  const extra = actual.filter((key) => !want.has(key));
  if (!missing.length && !extra.length) return;

  const lines = [`[artifacts] ${label}: ${actual.length} measured, ${expected.length} expected`];
  if (missing.length) {
    lines.push(`  missing (${missing.length}): ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? `, … and ${missing.length - 10} more` : ''}`);
  }
  if (extra.length) {
    lines.push(`  unexpected (${extra.length}): ${extra.slice(0, 10).join(', ')}${extra.length > 10 ? `, … and ${extra.length - 10} more` : ''}`);
  }
  throw new Error(lines.join('\n'));
}
