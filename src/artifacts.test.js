/**
 * The failure modes of the browser gates' own verification.
 *
 * A verification step that cannot fail is the specific thing this phase exists to
 * remove, so these cases matter more than the happy path: a missing file, an empty
 * file, a file that is not a screenshot, an unreadable file, and a run that
 * measured fewer things than it was supposed to. Each has to throw, and each has to
 * name the file it is complaining about.
 */
import { Buffer } from 'node:buffer';
import { describe, expect, test } from 'vitest';
import { MIN_SCREENSHOT_BYTES, assertComplete, assertSameImageSet, verifyScreenshots } from '../scripts/artifacts.mjs';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(MIN_SCREENSHOT_BYTES, 0),
]);

/** @param {Record<string, Buffer|'missing'>} files */
function fakeFs(files) {
  return {
    stat: (path) => {
      const entry = files[path.split('/').pop()];
      if (entry === undefined || entry === 'missing') throw new Error('ENOENT');
      return { size: entry.length };
    },
    read: (path) => {
      const entry = files[path.split('/').pop()];
      if (entry === undefined || entry === 'missing') throw new Error('ENOENT');
      return entry;
    },
  };
}

describe('verifyScreenshots', () => {
  test('accepts a complete set and reports what it produced', () => {
    const { stat, read } = fakeFs({ 'a.png': PNG, 'b.png': PNG });
    const produced = verifyScreenshots({ names: ['a.png', 'b.png'], dir: '/out', read, stat });
    expect(produced).toEqual([
      { file: 'a.png', bytes: PNG.length },
      { file: 'b.png', bytes: PNG.length },
    ]);
  });

  test('an empty expectation is a failure, not a pass', () => {
    // The vacuous case: nothing expected, nothing checked, exit code 0.
    expect(() => verifyScreenshots({ names: [], dir: '/out', ...fakeFs({}) })).toThrow(/nothing was expected/i);
  });

  test('a screenshot that was never written fails', () => {
    const { stat, read } = fakeFs({ 'a.png': PNG, 'b.png': 'missing' });
    expect(() => verifyScreenshots({ names: ['a.png', 'b.png'], dir: '/out', read, stat }))
      .toThrow(/b\.png: not written/);
  });

  test('a zero-byte screenshot fails even though the file exists', () => {
    // The measured failure this guards: a capture that returns nothing writes an
    // empty file and the run used to report success.
    const { stat, read } = fakeFs({ 'a.png': PNG, 'empty.png': Buffer.alloc(0) });
    expect(() => verifyScreenshots({ names: ['a.png', 'empty.png'], dir: '/out', read, stat }))
      .toThrow(/empty\.png: 0 bytes/);
  });

  test('a file below the floor fails as truncated', () => {
    const { stat, read } = fakeFs({ 'a.png': Buffer.alloc(64, 1) });
    expect(() => verifyScreenshots({ names: ['a.png'], dir: '/out', read, stat })).toThrow(/below the 4096-byte floor/);
  });

  test('a large file that is not a PNG fails', () => {
    const { stat, read } = fakeFs({ 'a.png': Buffer.alloc(MIN_SCREENSHOT_BYTES * 4, 0x41) });
    expect(() => verifyScreenshots({ names: ['a.png'], dir: '/out', read, stat })).toThrow(/not a PNG/);
  });

  test('an unreadable file fails rather than being skipped', () => {
    const stat = () => ({ size: 9999 });
    const read = () => { throw new Error('EACCES'); };
    expect(() => verifyScreenshots({ names: ['a.png'], dir: '/out', read, stat })).toThrow(/unreadable \(EACCES\)/);
  });

  test('every problem is reported in one run, not just the first', () => {
    const { stat, read } = fakeFs({ 'a.png': Buffer.alloc(0), 'b.png': 'missing', 'c.png': PNG });
    let message = '';
    try {
      verifyScreenshots({ names: ['a.png', 'b.png', 'c.png'], dir: '/out', read, stat });
    } catch (error) {
      message = error.message;
    }
    expect(message).toContain('1 of 3 screenshots are usable');
    expect(message).toContain('a.png: 0 bytes');
    expect(message).toContain('b.png: not written');
  });
});

describe('assertComplete', () => {
  test('passes when the run measured exactly what was expected', () => {
    expect(() => assertComplete(['a', 'b'], ['a', 'b'], 'fingerprints')).not.toThrow();
  });

  test('a measurement that went missing fails — the case the old check could not see', () => {
    // `dom-snapshot --check` iterated the keys it *had*, so a scene that stopped
    // being measured was absent from the comparison rather than a mismatch.
    expect(() => assertComplete(['a'], ['a', 'b'], 'fingerprints'))
      .toThrow(/missing \(1\): b/);
  });

  test('an unexpected extra measurement fails', () => {
    expect(() => assertComplete(['a', 'b', 'c'], ['a', 'b'], 'fingerprints'))
      .toThrow(/unexpected \(1\): c/);
  });

  test('a completely empty run fails', () => {
    expect(() => assertComplete([], ['a', 'b'], 'fingerprints'))
      .toThrow(/0 measured, 2 expected/);
  });

  test('the message is bounded when a whole viewport goes missing', () => {
    const expected = Array.from({ length: 40 }, (_, index) => `scene-${index}::styles@390`);
    let message = '';
    try {
      assertComplete([], expected, 'fingerprints');
    } catch (error) {
      message = error.message;
    }
    expect(message).toContain('… and 30 more');
    expect(message.split('\n')).toHaveLength(2);
  });
});

describe('assertSameImageSet', () => {
  test('passes when the run reproduces exactly what the repository ships', () => {
    expect(() => assertSameImageSet({ produced: ['a.png', 'b.png'], shipped: ['b.png', 'a.png'] })).not.toThrow();
  });

  test('a committed image the run stopped producing fails', () => {
    // The failure a shot list cannot see: every name in the list was produced,
    // because the name was removed from the list.
    expect(() => assertSameImageSet({ produced: ['a.png'], shipped: ['a.png', 'b.png'] }))
      .toThrow(/b\.png is committed but this run did not produce it/);
  });

  test('a produced image that is not committed fails, rather than being ignored', () => {
    expect(() => assertSameImageSet({ produced: ['a.png', 'new.png'], shipped: ['a.png'] }))
      .toThrow(/new\.png was produced but is not committed/);
  });

  test('both directions are reported in one run', () => {
    let message = '';
    try {
      assertSameImageSet({ produced: ['new.png'], shipped: ['gone.png'] });
    } catch (error) {
      message = error.message;
    }
    expect(message).toContain('gone.png is committed');
    expect(message).toContain('new.png was produced');
  });

  test('an empty run against a non-empty repository fails', () => {
    expect(() => assertSameImageSet({ produced: [], shipped: ['a.png'] })).toThrow(/a\.png is committed/);
  });
});
