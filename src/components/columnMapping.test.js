import { describe, expect, test } from 'vitest';
import { applyMapping, suggestMapping, suggestSource } from './columnMapping';

describe('column mapping suggestions', () => {
  test('matches a column that differs only in case, spaces or punctuation', () => {
    expect(suggestSource('t0', ['T 0'])).toBe('T 0');
    expect(suggestSource('tPrime', ['t_prime'])).toBe('t_prime');
    expect(suggestSource('flyAsh', ['Fly Ash'])).toBe('Fly Ash');
  });

  test('recognises the names people actually use in spreadsheets', () => {
    expect(suggestSource('H', ['Humidity'])).toBe('Humidity');
    expect(suggestSource('RH', ['Relative Humidity'])).toBe('Relative Humidity');
    expect(suggestSource('fc', ['fck'])).toBe('fck');
    expect(suggestSource('t', ['Age (days)'])).toBe('Age (days)');
  });

  test('recognises the symbols the workspace itself prints', () => {
    // The UI and the reference library write the ratios with a slash; only the
    // hyphen spelling used to match.
    expect(suggestSource('wC', ['w/c'])).toBe('w/c');
    expect(suggestSource('aC', ['a/c'])).toBe('a/c');
    expect(suggestSource('VS', ['V/S'])).toBe('V/S');
    expect(suggestSource('vS', ['Volume/Surface'])).toBe('Volume/Surface');
  });

  // Regression: `h` is relative humidity in every model that has it (B4 declares
  // it as "Relative Humidity", 0–98.4 %), but it was aliased to thickness names.
  // A file with a 50 mm thickness column was pre-filled as h = 50 — in range, so
  // the kernel computed 50 % RH and the row was reported valid.
  test('a size column is not read as relative humidity', () => {
    expect(suggestSource('h', ['Thickness'])).toBe('');
    expect(suggestSource('h', ['notional_size'])).toBe('');
    expect(suggestSource('h', ['Humidity'])).toBe('Humidity');
    expect(suggestSource('h', ['Relative Humidity'])).toBe('Relative Humidity');
    // ... and the size names now land on the size field, where they belong.
    expect(suggestSource('vS', ['Thickness'])).toBe('Thickness');
    expect(suggestSource('vS', ['notional_size'])).toBe('notional_size');
  });

  test('suggests nothing rather than something wrong', () => {
    // A column that is not the field and is not an alias must not be guessed at:
    // silently mapping the wrong column would produce plausible, wrong numbers.
    expect(suggestSource('H', ['fc', 'vS', 'slump'])).toBe('');
    expect(suggestSource('wC', ['aggregateType'])).toBe('');
  });

  test('an exact contract name always wins over an alias', () => {
    expect(suggestSource('t', ['time', 't'])).toBe('t');
  });

  test('every missing field gets an entry, mapped or not', () => {
    expect(suggestMapping(['H', 'fc'], ['Humidity', 'vS'])).toEqual([
      { field: 'H', source: 'Humidity' },
      { field: 'fc', source: '' },
    ]);
  });
});

describe('applying a mapping', () => {
  test('renames the source column to the contract name', () => {
    const { rows, conflicts } = applyMapping([{ Humidity: 70, t: 365 }], [{ field: 'H', source: 'Humidity' }]);
    expect(conflicts).toEqual([]);
    expect(rows[0]).toEqual({ H: 70, t: 365 });
    expect('Humidity' in rows[0]).toBe(false);
  });

  test('refuses to point two fields at one column instead of guessing', () => {
    const { rows, conflicts } = applyMapping([{ x: 1 }], [
      { field: 'H', source: 'x' },
      { field: 'RH', source: 'x' },
    ]);
    expect(conflicts).toEqual(['x → H and RH']);
    expect(rows).toEqual([{ x: 1 }]); // untouched
  });

  test('leaves unmapped fields alone', () => {
    const { rows, conflicts } = applyMapping([{ a: 1, b: 2 }], [{ field: 'H', source: '' }, { field: 'fc', source: 'b' }]);
    expect(conflicts).toEqual([]);
    expect(rows[0]).toEqual({ a: 1, fc: 2 });
  });

  // Regression: one entry's field name can be another entry's source name, and the
  // renames were applied while deleting as they went — so the result depended on
  // the order of the entries and a value disappeared without a conflict being
  // reported. `[C -> B, B -> A]` returned { A: 1 } where `[B -> A, C -> B]`
  // returned { A: 1, B: 2 }.
  test('is independent of the order the fields were mapped in', () => {
    const forward = applyMapping([{ B: 1, C: 2 }], [{ field: 'A', source: 'B' }, { field: 'B', source: 'C' }]);
    const reverse = applyMapping([{ B: 1, C: 2 }], [{ field: 'B', source: 'C' }, { field: 'A', source: 'B' }]);
    expect(forward.conflicts).toEqual([]);
    expect(forward.rows[0]).toEqual({ A: 1, B: 2 });
    expect(reverse.rows).toEqual(forward.rows);
  });
});
