/**
 * The CI drift check compares a recorded hash of the Rust build inputs instead
 * of the module bytes, because the same source compiles to a different function
 * numbering on macOS and Linux. These cover the stamp the committed package
 * carries and the check that reads it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { sourceHash, STAMP } from '../scripts/wasmSourceHash.mjs';

const SCRIPT = resolve(process.cwd(), 'scripts/wasmSourceHash.mjs');

function check(file) {
  return execFileSync(process.execPath, [SCRIPT, '--check', file], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

describe('wasm source hash', () => {
  test('the committed package records the hash of the current Rust source', () => {
    expect(check(STAMP)).toContain('matches the Rust source');
  });

  test('is stable across calls', () => {
    expect(sourceHash()).toBe(sourceHash());
    expect(sourceHash()).toMatch(/^[0-9a-f]{64}$/);
  });

  test('fails when the recorded hash no longer describes the source', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wasm-source-hash-'));
    const stale = join(dir, 'stale');
    writeFileSync(stale, `${'0'.repeat(64)}\n`);

    let error;
    try {
      check(stale);
    } catch (thrown) {
      error = thrown;
    }

    expect(error?.status).toBe(1);
    expect(String(error.stderr)).toContain('out of date');
  });
});
