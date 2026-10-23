#!/usr/bin/env node
/**
 * Fingerprint the Rust sources a `src/wasm-pkg` build is made from.
 *
 * CI cannot compare the rebuilt module byte for byte against the committed one:
 * the same source compiled on macOS and on Linux differs in the code section's
 * function numbering (a few hundred bytes of call operands), and the build
 * directory and the cargo registry used to leak into the data section too. What
 * the drift check actually needs to know is "does the committed package come
 * from this source?", so the build records a hash of its inputs next to the
 * package and CI compares that.
 *
 * The inputs are every `.rs` file under `rust-engine/src`, `Cargo.toml`,
 * `Cargo.lock` and `rust-toolchain.toml` — changing any of them changes the
 * module, so any of them changing requires a rebuild.
 *
 * Usage:
 *   node scripts/wasmSourceHash.mjs            print the hash
 *   node scripts/wasmSourceHash.mjs --write    write it to src/wasm-pkg/.source-hash
 *   node scripts/wasmSourceHash.mjs --check    fail if that file is out of date
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Walk up from `cwd` until the repository root — the directory that holds
 * `rust-engine/Cargo.toml`. `import.meta.url` is not a file URL under Vite's
 * transform, and this script is imported by its test as well as run from
 * `rust-engine/` by the build.
 *
 * @param {string} start
 */
function findRoot(start) {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, 'rust-engine', 'Cargo.toml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('repository root not found from ' + start);
    dir = parent;
  }
}

export const ROOT = findRoot(process.cwd());
export const STAMP = 'src/wasm-pkg/.source-hash';

/** @param {string} dir @returns {string[]} */
function rustSources(dir) {
  /** @type {string[]} */
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...rustSources(full));
    else if (entry.name.endsWith('.rs')) found.push(full);
  }
  return found;
}

/** @returns {string} lowercase hex sha256 over the build inputs */
export function sourceHash() {
  const engine = join(ROOT, 'rust-engine');
  const inputs = [
    ...rustSources(join(engine, 'src')),
    join(engine, 'Cargo.toml'),
    join(engine, 'Cargo.lock'),
    join(ROOT, 'rust-toolchain.toml'),
  ]
    .map((file) => relative(ROOT, file).split('\\').join('/'))
    .sort();

  const hash = createHash('sha256');
  for (const file of inputs) {
    hash.update(file);
    hash.update('\0');
    hash.update(readFileSync(join(ROOT, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const [flag, file = STAMP] = process.argv.slice(2);
  const target = resolve(ROOT, file);
  const actual = sourceHash();

  if (flag === '--write') {
    writeFileSync(target, `${actual}\n`);
    console.log(`wasm-source-hash: wrote ${file} (${actual.slice(0, 12)})`);
  } else if (flag === '--check') {
    const recorded = existsSync(target) ? readFileSync(target, 'utf8').trim() : '';
    if (recorded !== actual) {
      console.error(
        `wasm-source-hash: ${file} is out of date — the Rust engine changed without regenerating src/wasm-pkg. ` +
          `Run \`npm run build:wasm\` and commit the result.\n  recorded ${recorded || '(missing)'}\n  expected ${actual}`,
      );
      process.exit(1);
    }
    console.log(`wasm-source-hash: ${file} matches the Rust source (${actual.slice(0, 12)})`);
  } else if (flag !== undefined) {
    console.error(`unknown argument: ${flag}`);
    process.exit(2);
  } else {
    console.log(actual);
  }
}
