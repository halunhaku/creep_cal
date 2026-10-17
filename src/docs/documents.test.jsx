import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { DOCUMENTS, documentUrl } from './documents';
import { parseMarkdown, safeLink } from './markdown';
import MarkdownDocument from './MarkdownDocument';
import { MODELS } from '../components/batchModels';
import { unitFor } from '../math/parameterUnits';

const originalHashes = {
  aci209: '905cfd6777823e0d498cdf6b498f39912b39c8098244b5c4697d64621506c34d',
  mc2010: 'f37fe6d19d8fa73e1869abc23e519153c2deb2fc5aa76e51fc6e87f28f4b8c50',
  b4: '2cf5b6315b8e7225c88e644d807928adb16e991d7f07c0570b19260ae9ddae8a',
  b4s: 'fdc88f039b5cdae35b5f231d8a64c3a06f187ceb833c00e7159e3d2b756f3e4b',
  gl2000: '84f56683b2f5fad2ad9dc7ad937571114fba5968158fa75b34b936e1d7057eb8',
  aashto: 'f79398e6d9478f893e4616e7fa1951b66b3cf07a8d0810cd094e4e53cba181b4',
};
const source = (id, locale) => readFileSync(resolve(process.cwd(), `public${decodeURI(documentUrl(id, locale))}`), 'utf8');
function allTokens(tokens) {
  return tokens.flatMap((token) => [token, ...allTokens(token.type === 'table'
    ? [...token.header, ...token.rows.flat()].flatMap((cell) => cell.tokens)
    : token.type === 'list' ? token.items.flatMap((item) => item.tokens) : token.tokens ?? [])]);
}
const formula = (value) => value.replaceAll('moist curing and ', '湿养护且 ').replaceAll('steam curing and ', '蒸汽养护且 ').replace(/\s+/g, ' ').trim();
const formulas = (document) => allTokens(document.tokens)
  .filter((token) => ['inlineKatex', 'blockKatex'].includes(token.type) || token.type === 'code' && token.lang === 'math')
  .map((token) => formula(token.text));
const numbers = (value) => value.match(/-?\d+(?:\.\d+)?/g) ?? [];
const normalUnit = (value) => value.replace(/%.*$/, '%').replace(/^(?:d|Days)$/i, 'd').replace(/^(?:-|—)$/, '');

describe('complete bilingual engineering documents', () => {
  test('the stable document model set matches all six existing model contracts', () => {
    expect(DOCUMENTS.map((model) => model.id)).toEqual(MODELS.map((model) => model.id));
    for (const model of DOCUMENTS) {
      expect(new Set(model.sections).size).toBe(model.sections.length);
      expect(model.sections).toContain('overview');
      expect(model.sections).toContain('parameters');
      expect(model.sections).toContain('formulas');
      expect(model.sections).toContain('sources');
    }
  });

  test.each(DOCUMENTS)('$id retains the entire original Chinese document', (model) => {
    // The only source repair escapes a GFM delimiter inside the stress cell.
    // Reversing that markup-only repair must reproduce the checkpoint bytes.
    const chinese = source(model.id, 'zh').replace('`\\|sigma\\| ≤ 0.6 fcm`', '`|sigma| ≤ 0.6 fcm`');
    expect(createHash('sha256').update(chinese).digest('hex')).toBe(originalHashes[model.id]);
  });

  test.each(DOCUMENTS)('$id English has the same sections, formulas, code identifiers, tables, numerical data and references', (model) => {
    const zh = parseMarkdown(source(model.id, 'zh'), model.sections);
    const enSource = source(model.id, 'en');
    const en = parseMarkdown(enSource, model.sections);
    const chineseTokens = allTokens(zh.tokens);
    const englishTokens = allTokens(en.tokens);
    expect(enSource).not.toMatch(/[\u4e00-\u9fff]/);
    expect(en.headings.map(({ id, depth }) => [id, depth])).toEqual(zh.headings.map(({ id, depth }) => [id, depth]));
    expect(formulas(en)).toEqual(formulas(zh));
    expect(formulas(en).length).toBeGreaterThan(0);
    expect(englishTokens.filter((token) => token.type === 'codespan').map((token) => token.text).sort()).toEqual(chineseTokens.filter((token) => token.type === 'codespan').map((token) => token.text).sort());
    expect(englishTokens.filter((token) => token.type === 'link').map((token) => token.href).sort()).toEqual(chineseTokens.filter((token) => token.type === 'link').map((token) => token.href).sort());
    expect(englishTokens.filter((token) => token.type === 'paragraph').length).toBe(chineseTokens.filter((token) => token.type === 'paragraph').length);
    expect(englishTokens.filter((token) => token.type === 'list').map((token) => token.items.length)).toEqual(chineseTokens.filter((token) => token.type === 'list').map((token) => token.items.length));
    const tables = (document) => document.tokens.filter((token) => token.type === 'table').map((token) => ({
      columns: token.header.length,
      rows: token.rows.map((row) => row.map((cell) => numbers(cell.text))),
    }));
    expect(tables(en)).toEqual(tables(zh));
    for (const token of englishTokens.filter((item) => item.type === 'link')) expect(safeLink(token.href)).not.toBeNull();
  });

  test.each(DOCUMENTS.flatMap((model) => ['en', 'zh'].map((locale) => ({ ...model, locale }))))('$id $locale documents every required input with the existing unit contract', (model) => {
    const document = parseMarkdown(source(model.id, model.locale), model.sections);
    const required = MODELS.find((item) => item.id === model.id).req.split(', ');
    const rows = document.tokens.filter((token) => token.type === 'table').flatMap((token) => token.rows);
    const documented = new Map(rows.flatMap((row) => {
      const parameter = row[1]?.tokens.find((token) => token.type === 'codespan')?.text;
      return required.includes(parameter) ? [[parameter, row[2].text]] : [];
    }));
    expect([...documented.keys()].sort()).toEqual([...required].sort());
    for (const [name, unit] of documented) expect(normalUnit(unit), `${model.id} ${name}`).toBe(normalUnit(unitFor(name)));
    if (model.id === 'mc2010') expect(rows.find((row) => row[1]?.text === '`sigma`')[3].tokens[0].text).toBe('|sigma| ≤ 0.6 fcm');
  });

  test.each(DOCUMENTS.flatMap((model) => ['en', 'zh'].map((locale) => ({ ...model, locale }))))('$id $locale actually renders all source formulas and all navigation targets', (model) => {
    const document = parseMarkdown(source(model.id, model.locale), model.sections);
    const { container } = render(<MarkdownDocument document={document} />);
    expect(container.querySelectorAll('[data-math-error], .katex-error')).toHaveLength(0);
    expect(container.querySelectorAll('.katex')).toHaveLength(formulas(document).length);
    expect([...container.querySelectorAll('[data-doc-heading]')].map((heading) => heading.id)).toEqual(model.sections);
    expect(container.querySelector('script, iframe, img, [onerror], [onclick]')).toBeNull();
  });
});
