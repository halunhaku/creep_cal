import { DOCUMENTS, documentUrl } from './documents';
import { parseMarkdown } from './markdown';

const cache = new Map();

/** Cache completed documents only: aborting one reader cannot poison another. */
export async function loadDocument(modelId, locale, signal) {
  const url = documentUrl(modelId, locale);
  if (signal?.aborted) throw new DOMException('Document request aborted', 'AbortError');
  if (cache.has(url)) return cache.get(url);
  const response = await fetch(url, { signal, credentials: 'same-origin' });
  if (!response.ok) throw new Error('Documentation unavailable');
  const source = await response.text();
  if (signal?.aborted) throw new DOMException('Document request aborted', 'AbortError');
  const model = DOCUMENTS.find((item) => item.id === modelId);
  const parsed = parseMarkdown(source, model.sections);
  const document = { modelId, locale, source, parsed };
  cache.set(url, document);
  return document;
}

/** Test seam: requests and failures must not leak between isolated cases. */
export function resetDocumentCache() {
  cache.clear();
}
