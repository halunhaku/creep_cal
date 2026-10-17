import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { vi } from 'vitest';

const originalFetch = globalThis.fetch;

// Mirror the real public-file boundary, not an empty document or a mocked
// renderer. Non-document requests (including WASM) keep their original behavior.
export function installDocumentFetch() {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, options) => {
    const url = typeof input === 'string' ? input : input.url;
    const path = decodeURI(new URL(url, 'http://localhost').pathname);
    if (!/^\/模型说明\/(?:en\/)?(?:aci209|mc2010|b4|b4s|gl2000|aashto)\.md$/.test(path)) {
      return originalFetch(input, options);
    }
    const source = readFileSync(resolve(process.cwd(), `public${path}`), 'utf8');
    return Promise.resolve(new Response(source, { status: 200, headers: { 'Content-Type': 'text/markdown; charset=utf-8' } }));
  });
}
