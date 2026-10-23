#!/usr/bin/env node
/**
 * Remove the `producers` custom section from a WebAssembly module.
 *
 * `wasm-bindgen` writes the tool's own build identity into that section —
 * `0.2.129 (165586f85)` from the published release binaries, a bare `0.2.129`
 * from a `cargo install`-built CLI. The rest of the module is identical, but the
 * difference is inside the binary, so the committed `src/wasm-pkg` package
 * disagreed with a rebuild on whichever machine had the other flavour and the
 * CI drift check (`.github/workflows/ci.yml`) failed on a commit that changed no
 * Rust at all. The section is metadata nothing reads at run time, so the build
 * drops it and every generator of the same version produces the same bytes.
 *
 * Usage: node scripts/stripWasmProducers.mjs <file.wasm> [more.wasm…]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PRODUCERS = 'producers';

/** @param {Buffer} data */
function readVaruint32(data, offset) {
  let value = 0;
  let shift = 0;
  let cursor = offset;
  for (;;) {
    if (cursor >= data.length) throw new Error('truncated varuint32');
    const byte = data[cursor];
    cursor += 1;
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, cursor };
    shift += 7;
    if (shift > 35) throw new Error('varuint32 too long');
  }
}

/** @param {number} value */
function writeVaruint32(value) {
  /** @type {number[]} */
  const bytes = [];
  let rest = value;
  do {
    const byte = rest & 0x7f;
    rest >>>= 7;
    bytes.push(rest === 0 ? byte : byte | 0x80);
  } while (rest !== 0);
  return Buffer.from(bytes);
}

/**
 * @param {Buffer} data
 * @returns {{ output: Buffer, removed: boolean }}
 */
export function stripProducers(data) {
  if (data.length < 8) throw new Error('not a WebAssembly module');
  if (data.readUInt32LE(0) !== 0x6d736100) throw new Error('not a WebAssembly module');

  /** @type {Buffer[]} */
  const kept = [data.subarray(0, 8)];
  let cursor = 8;
  let removed = false;

  while (cursor < data.length) {
    const id = data[cursor];
    cursor += 1;
    const { value: size, cursor: payloadStart } = readVaruint32(data, cursor);
    const payloadEnd = payloadStart + size;
    if (payloadEnd > data.length) throw new Error('truncated section');
    const payload = data.subarray(payloadStart, payloadEnd);

    let name = null;
    if (id === 0) {
      const { value: nameLength, cursor: nameStart } = readVaruint32(payload, 0);
      name = payload.subarray(nameStart, nameStart + nameLength).toString('utf8');
    }

    if (name === PRODUCERS) {
      removed = true;
    } else {
      kept.push(Buffer.from([id]), writeVaruint32(size), payload);
    }
    cursor = payloadEnd;
  }

  return { output: Buffer.concat(kept), removed };
}

/**
 * @param {Buffer} data
 * @returns {boolean} whether the module still has a producers section
 */
export function hasProducers(data) {
  let cursor = 8;
  while (cursor < data.length) {
    const id = data[cursor];
    cursor += 1;
    const { value: size, cursor: payloadStart } = readVaruint32(data, cursor);
    if (id === 0) {
      const { value: nameLength, cursor: nameStart } = readVaruint32(data, payloadStart);
      const name = data.subarray(nameStart, nameStart + nameLength).toString('utf8');
      if (name === PRODUCERS) return true;
    }
    cursor = payloadStart + size;
  }
  return false;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error('usage: node scripts/stripWasmProducers.mjs <file.wasm> [more.wasm…]');
    process.exit(2);
  }

  for (const file of files) {
    const original = readFileSync(file);
    const { output, removed } = stripProducers(original);
    if (removed) writeFileSync(file, output);
    console.log(`strip-wasm-producers: ${file} ${removed ? `removed (${original.length} -> ${output.length} bytes)` : 'already clean'}`);
  }
}
