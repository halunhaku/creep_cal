import { Marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import { decodeHTML } from 'entities';

// Isolated instance: extensions must not alter any other Markdown consumer.
// Only the lexer is used. Neither Marked's nor the extension's HTML renderer is
// called; MarkdownDocument maps the resulting tokens to an allowlist of React nodes.
const markdown = new Marked({ gfm: true }, markedKatex({ nonStandard: true }));

export function plainText(tokens = []) {
  return tokens.map((token) => token.tokens ? plainText(token.tokens) : decodeHTML(token.text ?? '')).join('');
}

/** Stable ids come from the model manifest, never Markdown HTML attributes. */
export function parseMarkdown(source, sectionIds) {
  if (typeof source !== 'string' || source.length > 200000) throw new Error('Invalid documentation size');
  if (sectionIds && new Set(sectionIds).size !== sectionIds.length) throw new Error('Duplicate documentation section id');
  const tokens = markdown.lexer(source);
  const headings = [];
  markdown.walkTokens(tokens, (token) => {
    if (token.type !== 'heading') return;
    const index = headings.length;
    const id = sectionIds?.[index] ?? `md-heading-${index + 1}`;
    if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error('Invalid documentation section id');
    token.id = id;
    headings.push({ id, depth: token.depth, label: plainText(token.tokens) });
  });
  if (sectionIds && sectionIds.length !== headings.length) throw new Error('Documentation headings do not match the model manifest');
  return { tokens, headings };
}

/** Decode entities before checking a protocol; React then escapes the safe value. */
export function safeLink(value) {
  if (typeof value !== 'string') return null;
  const href = decodeHTML(value).trim();
  const hasControlOrSpace = [...href].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127);
  if (!href || hasControlOrSpace || href.includes('\\') || href.startsWith('//')) return null;
  try {
    const base = 'https://documentation.invalid/';
    const url = new URL(href, base);
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) return null;
    } else if (url.origin !== new URL(base).origin) return null;
    return href;
  } catch {
    return null;
  }
}
