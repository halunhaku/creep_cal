import { describe, expect, test, vi } from 'vitest';
import { documentUrl } from './documents';
import { loadDocument } from './loadDocument';

const fetchSpy = () => vi.mocked(globalThis.fetch);

describe('documentation resources', () => {
  test('uses real language-specific public files and caches only successful, parsed documents', async () => {
    const english = await loadDocument('aci209', 'en');
    const again = await loadDocument('aci209', 'en');
    expect(again).toBe(english);
    expect(fetchSpy()).toHaveBeenCalledTimes(1);
    expect(fetchSpy()).toHaveBeenCalledWith(documentUrl('aci209', 'en'), { credentials: 'same-origin', signal: undefined });
    const chinese = await loadDocument('aci209', 'zh');
    expect(chinese).not.toBe(english);
    expect(chinese.source).toContain('ACI 209R-92 徐变模型说明');
    expect(english.source).toContain('ACI 209R-92 creep model documentation');
    expect(chinese.parsed.headings.map((heading) => heading.id)).toEqual(english.parsed.headings.map((heading) => heading.id));
    expect(fetchSpy()).toHaveBeenCalledTimes(2);
  });

  test('HTTP failures are not cached and the same document can be retried', async () => {
    fetchSpy().mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    await expect(loadDocument('b4', 'en')).rejects.toThrow('Documentation unavailable');
    const document = await loadDocument('b4', 'en');
    expect(document.parsed.headings[0].id).toBe('overview');
    expect(fetchSpy()).toHaveBeenCalledTimes(2);
  });

  test('a missing asset served as the SPA HTML fallback is rejected, not displayed as a document', async () => {
    fetchSpy().mockResolvedValueOnce(new Response('<html><body><h1>App</h1></body></html>'));
    await expect(loadDocument('b4s', 'en')).rejects.toThrow('headings');
    expect((await loadDocument('b4s', 'en')).parsed.headings).toHaveLength(5);
  });

  test('an abort during the response body cannot populate or poison the cache', async () => {
    const fixture = await loadDocument('gl2000', 'en');
    let finish;
    fetchSpy().mockResolvedValueOnce({ ok: true, text: () => new Promise((resolve) => { finish = resolve; }) });
    const controller = new AbortController();
    const promise = loadDocument('gl2000', 'zh', controller.signal);
    const rejected = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    controller.abort();
    finish(fixture.source);
    await rejected;
    const next = await loadDocument('gl2000', 'zh');
    expect(next.source).toContain('GL2000 徐变与收缩模型说明');
    expect(fetchSpy()).toHaveBeenCalledTimes(3);
  });

  test('an already-aborted cached reader is still cancelled', async () => {
    await loadDocument('aashto', 'en');
    const controller = new AbortController();
    controller.abort();
    await expect(loadDocument('aashto', 'en', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchSpy()).toHaveBeenCalledTimes(1);
  });

  test('oversized or malformed documents are not accepted or cached', async () => {
    fetchSpy().mockResolvedValueOnce(new Response('x'.repeat(200001)));
    await expect(loadDocument('aci209', 'en')).rejects.toThrow('size');
    expect((await loadDocument('aci209', 'en')).parsed.headings.length).toBe(12);
  });

  test.each([['../aci209', 'en'], ['aci209', '../en'], ['unknown', 'zh'], ['aci209', 'de']])('rejects unregistered resource path %s %s', async (id, locale) => {
    await expect(loadDocument(id, locale)).rejects.toThrow('Unknown documentation');
    expect(fetchSpy()).not.toHaveBeenCalled();
  });
});
