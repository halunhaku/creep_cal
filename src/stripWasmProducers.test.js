/**
 * The committed `src/wasm-pkg` bytes have to be the same whichever wasm-bindgen
 * built them, and the only thing that differed between a released binary and a
 * `cargo install`ed one was the `producers` section. These test the removal:
 * it drops that section, leaves every other one intact, keeps the module valid,
 * and is idempotent.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { hasProducers, stripProducers } from '../scripts/stripWasmProducers.mjs';

const HEADER = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const WASM = resolve(process.cwd(), 'src/wasm-pkg/creep_calculator_engine_bg.wasm');

/** @param {number} value */
function varuint(value) {
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
 * @param {string} name
 * @param {Buffer} payload
 */
function customSection(name, payload) {
  const nameBytes = Buffer.from(name, 'utf8');
  const body = Buffer.concat([varuint(nameBytes.length), nameBytes, payload]);
  return Buffer.concat([Buffer.from([0]), varuint(body.length), body]);
}

function producersSection() {
  return customSection('producers', Buffer.from([0x01, 0x0b, 0x70, 0x72, 0x6f, 0x63, 0x65, 0x73, 0x73, 0x65, 0x64]));
}

describe('stripProducers', () => {
  test('drops the producers section and leaves the rest of the module intact', async () => {
    const name = customSection('name', Buffer.from([0x01, 0x02, 0x01, 0x00]));
    const module = Buffer.concat([HEADER, producersSection(), name]);

    const { output, removed } = stripProducers(module);

    expect(removed).toBe(true);
    expect(output).toEqual(Buffer.concat([HEADER, name]));
    await expect(WebAssembly.compile(output)).resolves.toBeInstanceOf(WebAssembly.Module);
  });

  test('a module without producers is returned unchanged', () => {
    const module = Buffer.concat([HEADER, customSection('name', Buffer.from([0x00]))]);

    const { output, removed } = stripProducers(module);

    expect(removed).toBe(false);
    expect(output).toEqual(module);
  });

  test('is idempotent', () => {
    const once = stripProducers(Buffer.concat([HEADER, producersSection()]));
    const twice = stripProducers(once.output);

    expect(twice.removed).toBe(false);
    expect(twice.output).toEqual(once.output);
  });

  test('rejects something that is not a WebAssembly module', () => {
    expect(() => stripProducers(Buffer.from('not wasm'))).toThrow(/WebAssembly/);
  });
});

describe('the committed package', () => {
  test('carries no producers section, so a rebuild from any wasm-bindgen matches', () => {
    const wasm = readFileSync(WASM);

    expect(hasProducers(wasm)).toBe(false);
    expect(stripProducers(wasm).removed).toBe(false);
  });

  test('is still a valid module', async () => {
    await expect(WebAssembly.compile(readFileSync(WASM))).resolves.toBeInstanceOf(WebAssembly.Module);
  });
});
