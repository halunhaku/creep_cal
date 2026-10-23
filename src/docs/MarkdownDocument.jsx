import { createElement, Fragment } from 'react';
import { decodeHTML } from 'entities';
import { useT } from '../i18n';
import { safeLink } from './markdown';
import MathExpression from './MathExpression';

/** Presentation only: the mature lexer owns syntax, nesting and references. */
export default function MarkdownDocument({ document, headingOffset = 0, onNavigate }) {
  const t = useT();
  const render = (tokens = []) => tokens.map((token, index) => <Fragment key={index}>{node(token)}</Fragment>);
  const inline = (token) => token.tokens ? render(token.tokens) : decodeHTML(token.text ?? '');
  const align = (value) => value === 'right' ? 'text-right' : value === 'center' ? 'text-center' : 'text-left';
  const node = (token) => {
    switch (token.type) {
      case 'space':
      case 'def':
      case 'html':
        return null;
      case 'heading':
        return createElement(`h${Math.min(6, token.depth + headingOffset)}`, {
          id: token.id,
          'data-doc-heading': true,
          className: `${token.depth === 1 ? 'text-3xl' : token.depth === 2 ? 'text-xl' : 'text-base'} mb-4 mt-8 font-display font-semibold leading-snug text-ink first:mt-0`,
        }, inline(token));
      case 'paragraph':
        return <p className="my-3 break-words text-body-sm leading-7 text-muted">{inline(token)}</p>;
      case 'text':
        return inline(token);
      case 'escape':
        return token.text;
      case 'strong':
        return <strong className="font-semibold text-ink">{inline(token)}</strong>;
      case 'em':
        return <em>{inline(token)}</em>;
      case 'del':
        return <del>{inline(token)}</del>;
      case 'br':
        return <br />;
      case 'hr':
        return <hr className="my-7 border-line" />;
      case 'codespan':
        return <code className="rounded-sm bg-surface-2 px-1 py-0.5 font-mono text-[0.9em] text-ink">{token.text}</code>;
      case 'code': {
        const language = token.lang?.split(/\s+/)[0] ?? '';
        if (language === 'math') return <MathExpression expr={token.text} displayMode />;
        const className = /^[a-z0-9+-]{1,24}$/i.test(language) ? `language-${language}` : undefined;
        return <pre className="my-4 max-w-full overflow-x-auto rounded-lg border border-line bg-surface-2 p-4 text-xs leading-6 text-ink"><code className={className}>{token.text}</code></pre>;
      }
      case 'blockKatex':
        // The shipped MC2010 notes use single-$ display delimiters on their own
        // lines. The maintained extension recognizes them as block tokens too.
        return <MathExpression expr={token.text} displayMode />;
      case 'inlineKatex':
        return <MathExpression expr={token.text} displayMode={token.displayMode} />;
      case 'blockquote':
        return <blockquote className="my-4 rounded-r-lg border-l-2 border-action-border bg-action-soft px-4 py-1">{render(token.tokens)}</blockquote>;
      case 'list': {
        const Tag = token.ordered ? 'ol' : 'ul';
        return <Tag start={token.ordered && token.start !== 1 ? token.start : undefined} className={`my-3 ml-5 space-y-2 text-body-sm leading-7 text-muted ${token.ordered ? 'list-decimal' : 'list-disc'}`}>
          {token.items.map((item, index) => <li key={index}>
            {item.task && <input type="checkbox" checked={item.checked} disabled readOnly aria-label={t('docs.task')} className="mr-2" />}
            {render(item.tokens)}
          </li>)}
        </Tag>;
      }
      case 'table':
        return <div className="my-5 max-w-full overflow-x-auto rounded-card border border-line">
          <table className="min-w-[36rem] w-full border-collapse text-left text-xs leading-6">
            <thead className="bg-surface-2"><tr>{token.header.map((cell, index) => <th key={index} scope="col" className={`border-b border-line px-4 py-2.5 font-semibold text-ink ${align(cell.align)}`}>{render(cell.tokens)}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{token.rows.map((row, index) => <tr key={index}>{row.map((cell, position) => <td key={position} className={`px-4 py-3 align-top text-muted ${align(cell.align)}`}>{render(cell.tokens)}</td>)}</tr>)}</tbody>
          </table>
        </div>;
      case 'link': {
        const href = safeLink(token.href);
        if (!href) return <span title={t('docs.unsafeLink')}>{inline(token)}</span>;
        const external = /^https?:/i.test(href);
        return <a href={href} title={token.title ? decodeHTML(token.title) : undefined} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} onClick={href.startsWith('#') ? () => onNavigate?.(href.slice(1)) : undefined} className="text-action underline decoration-action-border underline-offset-2 hover:decoration-action">{inline(token)}</a>;
      }
      case 'image':
        // These engineering notes do not require remote images. Keep alt text,
        // but never initiate tracking/network requests from Markdown content.
        return <span>{decodeHTML(token.text ?? '')}</span>;
      default:
        return decodeHTML(token.text ?? '');
    }
  };
  return <div className="min-w-0" data-markdown-document>{render(document.tokens)}</div>;
}
