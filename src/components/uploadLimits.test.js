/**
 * The XLSX size gate's boundary.
 *
 * The limit itself is exercised end-to-end in `BatchCalculator.excel.test.jsx`;
 * this pins the arithmetic, including the two cases that are easy to get wrong and
 * invisible once wrong: a file of exactly the limit (which must be accepted, not
 * refused) and a `.csv` of any size at all (which must never be gated here, because
 * that would change the CSV path).
 */
import { describe, expect, test } from 'vitest';
import { MAX_XLSX_BYTES, isOversizedXlsx, megabytes } from './uploadLimits';

describe('MAX_XLSX_BYTES', () => {
  test('is 32 MiB, the smallest round limit that accepts a maximal legal upload', () => {
    // Measured worst case: three sheets of 10,000 rows of RILEM B4 inputs with
    // uncompressed ZIP entries is 16.8 MiB. 16 MiB would reject a legal file.
    expect(MAX_XLSX_BYTES).toBe(32 * 1024 * 1024);
    expect(MAX_XLSX_BYTES).toBeGreaterThan(16.8 * 1024 * 1024);
  });
});

describe('isOversizedXlsx', () => {
  test('accepts a file of exactly the limit', () => {
    // `>` not `>=`. An off-by-one here is invisible until someone uploads a file
    // that sits on the boundary.
    expect(isOversizedXlsx('a.xlsx', MAX_XLSX_BYTES)).toBe(false);
    expect(isOversizedXlsx('a.xlsx', MAX_XLSX_BYTES + 1)).toBe(true);
    expect(isOversizedXlsx('a.xlsx', MAX_XLSX_BYTES - 1)).toBe(false);
  });

  test('accepts an empty and a zero-byte file, which fail later for a better reason', () => {
    expect(isOversizedXlsx('a.xlsx', 0)).toBe(false);
  });

  test('never gates CSV', () => {
    expect(isOversizedXlsx('a.csv', MAX_XLSX_BYTES * 100)).toBe(false);
    expect(isOversizedXlsx('a.CSV', MAX_XLSX_BYTES * 100)).toBe(false);
  });

  test('matches the extension in either case, and only at the end of the name', () => {
    expect(isOversizedXlsx('B4示例.XLSX', MAX_XLSX_BYTES + 1)).toBe(true);
    expect(isOversizedXlsx('B4示例.xlsx', MAX_XLSX_BYTES + 1)).toBe(true);
    // A name that merely contains the extension is a different format, and it
    // reaches the unsupported-format message rather than the size message.
    expect(isOversizedXlsx('a.xlsx.csv', MAX_XLSX_BYTES + 1)).toBe(false);
    expect(isOversizedXlsx('a.xlsx.bak', MAX_XLSX_BYTES + 1)).toBe(false);
  });

  test('an absent name or size is not an oversized XLSX', () => {
    expect(isOversizedXlsx(undefined, MAX_XLSX_BYTES + 1)).toBe(false);
    expect(isOversizedXlsx(null, MAX_XLSX_BYTES + 1)).toBe(false);
    expect(isOversizedXlsx('a.xlsx', undefined)).toBe(false);
    expect(isOversizedXlsx('a.xlsx', Number.NaN)).toBe(false);
  });
});

describe('megabytes', () => {
  test('converts with a binary megabyte, so the message matches the limit it names', () => {
    expect(megabytes(1024 * 1024)).toBe(1);
    expect(megabytes(MAX_XLSX_BYTES)).toBe(32);
    expect(megabytes(0)).toBe(0);
  });

  test('a non-number reads as zero rather than NaN in the message', () => {
    expect(megabytes(undefined)).toBe(0);
    expect(megabytes('nonsense')).toBe(0);
  });
});
