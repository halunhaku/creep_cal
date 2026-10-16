/**
 * Blank out the values that make a screenshot of the calculation workspace
 * different every time, so two captures of one build are the same file.
 *
 * `capture-screenshots.mjs` drives the real app, which renders the kernel's own
 * measured runtime: "Last compute 1.90 ms", the comparison panel's three
 * readouts, and a clock time on every log line. Three captures of an unchanged
 * build therefore produced three different PNGs — and because only those digits
 * moved, a reviewer diffing the images had no way to tell a stale timing from a
 * real visual change, which is how the shell refactor's commit ended up carrying
 * six images that had not actually changed.
 *
 * `dom-snapshot.mjs` normalises the same values before hashing, and for the same
 * reason. A hash can collapse them to `<MS>`; a screenshot has to put something
 * on the pixels, so they become an em dash. Deliberately not a fixed number: a
 * generated image should not assert a measurement nobody took. Units, layout and
 * every non-timing value are left exactly as the app renders them.
 *
 * Written as a real function rather than as a string of page script so that the
 * code the browser runs is the code the tests exercise — the caller injects it
 * with `toString()`, which is also why the body is self-contained and closes over
 * nothing.
 */
export function stampVolatile(root) {
  // Durations, ratios and clock times, matching dom-snapshot.mjs's NORMALISE.
  const DURATION = /\d+(?:\.\d+)?\s*ms\b/g;
  const RATIO = /\d+(?:\.\d+)?\s*×/g;
  // `toLocaleTimeString()` renders as "10:30:08 AM" here, but the browser's
  // locale is not ours to choose, so the CJK markers are covered too.
  const CLOCK = /(?:[上下]午\s*)?\d{1,2}:\d{2}:\d{2}(?:\s*[AP]M)?/gi;
  // A node that is nothing but a number, inside an element that is nothing but
  // that number and its unit.
  const BARE_NUMBER = /^\s*\d+(?:\.\d+)?\s*$/;
  const WHOLE_READOUT = /^\s*[\d.,]+\s*(?:ms|×)\s*$/;

  const doc = root.ownerDocument || root;
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */, null);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  let stamped = 0;
  for (const node of nodes) {
    const before = node.data;
    let after = before
      .replace(DURATION, '— ms')
      .replace(RATIO, '—×')
      .replace(CLOCK, '—');
    // The comparison panel renders `{value} <small>ms</small>` and `{value}×`, so
    // the number and its unit are separate nodes and no single-node rule can see
    // them together — the same split dom-snapshot's `<[^>]+>` allowance handles.
    // The walk climbs because the number may sit in a wrapper of its own; the
    // WHOLE_READOUT test is what keeps it precise, since an ancestor holding
    // anything else cannot match.
    if (after === before && BARE_NUMBER.test(before)) {
      let ancestor = node.parentElement;
      for (let depth = 0; ancestor && depth < 3; depth += 1) {
        if (WHOLE_READOUT.test(ancestor.textContent || '')) {
          after = before.replace(/\d+(?:\.\d+)?/, '—');
          break;
        }
        ancestor = ancestor.parentElement;
      }
    }
    if (after !== before) {
      node.data = after;
      stamped += 1;
    }
  }
  return stamped;
}
