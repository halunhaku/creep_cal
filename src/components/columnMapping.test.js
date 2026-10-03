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
    expect(suggestSource('h', ['Thickness'])).toBe('Thickness');
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
});
