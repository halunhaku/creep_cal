import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { MODELS } from './batchModels';
import { localizeValidation } from './batchValidation';

// The renderer must not lag behind new kernel validations. Test the real source
// diagnostics, not just a hand-picked subset of the translation table.
const source = readFileSync(resolve(process.cwd(), 'src/math/creepModels.js'), 'utf8');
const literalMessages = [...source.matchAll(/throw new RangeError\('([^']+)'\)/g)].map((match) => match[1]);
const dynamicMessages = [...source.matchAll(/throw new RangeError\(`([^`]+)`\)/g)]
  .map((match) => match[1].replace(/\$\{[^}]+\}/g, 'test-value'));

describe('kernel diagnostics remain language-neutral data', () => {
  test.each(literalMessages)('localizes %s', (message) => {
    expect(localizeValidation(message, 'en')).toBe(message);
    expect(localizeValidation(message, 'zh')).not.toBe(message);
    expect(localizeValidation(message, 'zh')).toMatch(/[\u4e00-\u9fff]/);
    expect(localizeValidation(message, 'en')).toBe(message);
  });

  test.each(dynamicMessages)('preserves unsupported input details in %s', (message) => {
    expect(localizeValidation(message, 'en')).toBe(message);
    expect(localizeValidation(message, 'zh')).toContain('test-value');
    expect(localizeValidation(message, 'zh')).toMatch(/[\u4e00-\u9fff]/);
  });

  test('all model output labels resolve in both languages and match their CSV fields', () => {
    for (const model of MODELS) {
      expect(model.labels).toHaveLength(model.resultKeys.length);
      for (const label of model.labels) {
        expect(label.en).toBeTruthy();
        expect(label.zh).toBeTruthy();
        const message = `${label.en} could not be evaluated from these inputs · 输入无法产生有效结果`;
        expect(localizeValidation(message, 'en')).toBe(`${label.en} could not be evaluated from these inputs`);
        expect(localizeValidation(message, 'zh')).toContain(label.zh);
      }
    }
  });

  test('unknown library diagnostics are retained verbatim, not hidden or mistranslated', () => {
    expect(localizeValidation('External parser failed: custom reason', 'zh')).toBe('External parser failed: custom reason');
    expect(localizeValidation('External parser failed: custom reason', 'en')).toBe('External parser failed: custom reason');
  });
});
