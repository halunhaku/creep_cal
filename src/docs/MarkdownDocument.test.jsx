import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import MarkdownDocument from './MarkdownDocument';
import { parseMarkdown, safeLink } from './markdown';

const fixture = readFileSync(resolve(process.cwd(), 'src/docs/__fixtures__/syntax.md'), 'utf8');
const parsed = () => parseMarkdown(fixture, ['overview', 'inputs', 'formulas']);

describe('Markdown syntax regression contract', () => {
  test('headings have explicit stable ids and decoded navigation labels', () => {
    const document = parsed();
    expect(document.headings.map(({ id, depth, label }) => [id, depth, label])).toEqual([
      ['overview', 1, 'Reference & units'], ['inputs', 2, 'Inputs'], ['formulas', 2, 'Equations'],
    ]);
    render(<MarkdownDocument document={document} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Reference & units' })).toHaveAttribute('id', 'overview');
    expect(screen.getByRole('heading', { level: 2, name: 'Inputs' })).toHaveAttribute('id', 'inputs');
  });

  test('tables preserve every cell, alignment, escaped pipes and inline math', () => {
    render(<MarkdownDocument document={parsed()} />);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('|sigma| ≤ 0.6 fcm')).toBeInTheDocument();
    expect(table.querySelector('tbody tr:last-child td:first-child .katex')).not.toBeNull();
    expect(table.querySelector('th:last-child')).toHaveClass('text-right');
  });

  test('ordered/unordered lists nest correctly without flattening items', () => {
    const { container } = render(<MarkdownDocument document={parsed()} />);
    expect(container.querySelector('ul > li > ul > li > ol > li')).toHaveTextContent('Nested ordered item');
    expect(container.querySelector('ol[start="3"]')).toHaveTextContent('Ordered item');
    expect(screen.getByText('unordered', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('emphasis', { selector: 'em' })).toBeInTheDocument();
    expect(screen.getByText('obsolete', { selector: 'del' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  test('reference links resolve and inline/code-block text remains literal', () => {
    const { container } = render(<MarkdownDocument document={parsed()} />);
    const links = screen.getAllByRole('link', { name: 'reference' });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', 'https://example.org/standard?q=a&b=c');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveAttribute('title', 'Official source');
    }
    expect(screen.getByRole('link', { name: 'internal link' })).toHaveAttribute('href', '#inputs');
    const code = container.querySelector('pre code');
    expect(code).toHaveTextContent("<img src=x onerror=alert(1)>");
    expect(code).toHaveTextContent('$not_math$');
    expect(container.querySelector('code .katex')).toBeNull();
    expect(container.textContent).toContain('Escaped currency $5');
  });

  test('inline, multiline $$, one-line $$, math fences and legacy single-$ blocks render with KaTeX', () => {
    const { container } = render(<MarkdownDocument document={parsed()} />);
    expect(container.querySelectorAll('[data-math-display="true"]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-math-display="false"]')).toHaveLength(2);
    expect(container.querySelectorAll('.katex')).toHaveLength(6);
    expect(container.querySelectorAll('math')).toHaveLength(6);
    const formulaSources = [...container.querySelectorAll('annotation[encoding="application/x-tex"]')].map((node) => node.textContent);
    expect(formulaSources).toContain("J(t,t')=q_1+C_0+C_d");
    expect(formulaSources).toContain(String.raw`\phi(t,t_0)=\frac{(t-t_0)^{0.6}}{10+(t-t_0)^{0.6}}\phi_u`);
    expect(container.querySelector('.katex-error')).toBeNull();
  });

  test('invalid and excessively expanding TeX has a readable fallback, not a crashed page', () => {
    const source = '```math\n\\notARealCommand{x}\n```\n\n```math\n\\def\\x{\\x}\\x\n```\n\n## Still readable';
    const { container } = render(<MarkdownDocument document={parseMarkdown(source)} />);
    expect(screen.getByRole('heading', { name: 'Still readable' })).toBeInTheDocument();
    expect(screen.getAllByText('Formula could not be rendered')).toHaveLength(2);
    expect(container.textContent).toContain('\\notARealCommand{x}');
    expect(container.querySelectorAll('[data-math-error]')).toHaveLength(2);
  });
});

describe('Markdown security boundary', () => {
  test('raw HTML, scripts, dangerous attributes, frames, SVG and remote images never enter the DOM', () => {
    const source = '# Safe\n\n<script>window.__xss = true</script>\n\n<img src=x onerror="alert(1)">\n\n<iframe srcdoc="<script>alert(1)</script>"></iframe>\n\n<svg onload="alert(1)"><a xlink:href="javascript:alert(1)">bad</a></svg>\n\n<form id="attributes"><input autofocus onfocus="alert(1)"></form>\n\n![remote](https://tracker.example/pixel)\n\n<strong onclick="alert(1)">readable text</strong>\n\n## Still safe';
    const { container } = render(<MarkdownDocument document={parseMarkdown(source)} />);
    expect(container.querySelector('script, iframe, img, svg, form, input, style, object, embed')).toBeNull();
    for (const element of container.querySelectorAll('*')) {
      expect([...element.attributes].some((attribute) => /^on|^(?:srcdoc|src|style)$/i.test(attribute.name))).toBe(false);
    }
    expect(screen.getByRole('heading', { name: 'Still safe' })).toBeInTheDocument();
    expect(window.__xss).toBeUndefined();
  });

  test.each([
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\nscript:alert(1)', 'jav&#x61;script:alert(1)',
    'javascript&colon;alert(1)', 'vbscript:alert(1)', 'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd', 'blob:https://example.org/id', '//evil.example/path', '\\evil.example',
    'https:\\evil.example', 'java\u0000script:alert(1)',
  ])('rejects unsafe or ambiguous URL %s', (url) => {
    expect(safeLink(url)).toBeNull();
  });

  test.each(['https://example.org/a?b=1&c=2', 'http://example.org', 'mailto:team@example.org', '#inputs', '/docs/file.md', './file.md', '../file.md'])('permits safe URL %s', (url) => {
    expect(safeLink(url)).toBe(url);
  });

  test('unsafe Markdown links become non-clickable readable labels, including entity obfuscation', () => {
    const { container } = render(<MarkdownDocument document={parseMarkdown('[bad](javascript:alert(1)) [encoded](jav&#x61;script:alert(1)) [safe](https://example.org)')} />);
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'encoded' })).toBeNull();
    expect(screen.getByText('bad')).toBeInTheDocument();
    expect(screen.getByText('encoded')).toBeInTheDocument();
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'safe' })).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('TeX cannot create trusted HTML attributes or executable links', () => {
    const source = '```math\n\\href{javascript:alert(1)}{bad} + \\htmlClass{owned}{x} + \\htmlStyle{background:url(javascript:alert(1))}{x}\n```';
    const { container } = render(<MarkdownDocument document={parseMarkdown(source)} />);
    expect(container.querySelector('a[href], .owned, [onclick], script')).toBeNull();
    expect(container.innerHTML).not.toMatch(/href="javascript|style="background/);
  });

  test('the recursive renderer rejects HTML and unsafe links inside lists, quotes and table cells', () => {
    const source = '- item <img src=x onerror="alert(1)"> [list attack](javascript:alert(1))\n  - nested <a onclick="alert(1)">label</a>\n\n> <span style="background:red">quote</span> [quote attack](data:text/html,bad)\n\n| Content | Link |\n| --- | --- |\n| <svg onload="alert(1)">bad</svg> | [table attack](jav&#x61;script:alert(1)) |\n| **safe text** | [safe](https://example.org) |';
    const { container } = render(<MarkdownDocument document={parseMarkdown(source)} />);
    expect(container.querySelector('img, svg, script, [onclick], [onerror], [onload], [style]')).toBeNull();
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'safe' })).toHaveAttribute('href', 'https://example.org');
    for (const label of ['list attack', 'quote attack', 'table attack']) {
      expect(screen.queryByRole('link', { name: label })).toBeNull();
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(container.querySelector('ul ul li')).toHaveTextContent('nested');
    expect(container.querySelector('table')).not.toBeNull();
  });

  test('unknown future token types fail closed into escaped text rather than an HTML renderer', () => {
    const document = { tokens: [{ type: 'future-extension', text: '<img src=x onerror="alert(1)">', href: 'javascript:alert(1)', attributes: { onclick: 'bad()' } }], headings: [] };
    const { container } = render(<MarkdownDocument document={document} />);
    expect(container.textContent).toBe('<img src=x onerror="alert(1)">');
    expect(container.querySelector('img, a, [onclick], script')).toBeNull();
  });

  test('an existing polluted trust property cannot enable trusted TeX commands', () => {
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'trust');
    try {
      Object.defineProperty(Object.prototype, 'trust', { configurable: true, writable: true, enumerable: true, value: true });
      const { container } = render(<MarkdownDocument document={parseMarkdown('```math\n\\href{javascript:alert(1)}{bad} + \\htmlId{owned}{x}\n```')} />);
      expect(container.querySelector('a[href], #owned, [onclick], script')).toBeNull();
      expect(container.querySelector('[data-math-error]')).toBeNull();
      expect(container.querySelector('.katex')).not.toBeNull();
    } finally {
      if (previous) Object.defineProperty(Object.prototype, 'trust', previous);
      else delete Object.prototype.trust;
    }
  });

  test('oversized TeX has an inert source fallback and bounded Markdown input fails explicitly', () => {
    const { container } = render(<MarkdownDocument document={parseMarkdown(`\`\`\`math\n${'x'.repeat(10001)}\n\`\`\``)} />);
    expect(screen.getByText('Formula could not be rendered')).toBeInTheDocument();
    expect(container.querySelector('.katex')).toBeNull();
    expect(() => parseMarkdown('x'.repeat(200001))).toThrow('size');
    expect(() => parseMarkdown('# One\n\n## Two', ['same', 'same'])).toThrow('Duplicate');
    expect(() => parseMarkdown('# One', ['onclick="bad"'])).toThrow('section id');
  });

  test('heading identifiers are generated, not taken from HTML or arbitrary source attributes', () => {
    const { container } = render(<MarkdownDocument document={parseMarkdown('# constructor\n\n## __proto__\n\n<div id="owned">raw</div>')} />);
    expect(container.querySelector('#constructor, #__proto__, #owned')).toBeNull();
    expect(container.querySelectorAll('[data-doc-heading]')).toHaveLength(2);
    fireEvent.click(screen.getByRole('heading', { name: 'constructor' }));
    expect(window.__xss).toBeUndefined();
  });
});
