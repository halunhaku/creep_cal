// Client for the batch compute Worker with main-thread fallback.
// jsdom has no Worker: when construction fails, callers run the existing
// setTimeout chunk loop instead. Tests inject a mock via setBatchWorkerFactory.

let factory = null;

export function setBatchWorkerFactory(fn) {
  factory = fn;
}

function createWorker() {
  if (factory) return factory();
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./batchWorker.js', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

export function isBatchWorkerAvailable() {
  if (factory) return true;
  return typeof Worker !== 'undefined';
}

let nextJobId = 1;

/**
 * @param {string} modelId
 * @param {object[]} rows
 * @param {{ onProgress?: (done: number, total: number) => void, isCancelled?: () => boolean }} [options]
 * @returns {Promise<{ results: object[], issues: object[], via: 'worker' }>}
 */
export function runBatchInWorker(modelId, rows, options = {}) {
  const worker = createWorker();
  if (!worker) return Promise.reject(new Error('WORKER_UNAVAILABLE'));
  const jobId = nextJobId += 1;
  const { onProgress, isCancelled } = options;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.onmessage = null;
      worker.onerror = null;
      if (typeof worker.terminate === 'function') worker.terminate();
    };
    worker.onerror = (error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error?.message ?? error)));
    };
    worker.onmessage = (event) => {
      const message = event.data ?? {};
      if (message.jobId !== jobId) return;
      if (message.type === 'progress') {
        if (isCancelled?.()) {
          cleanup();
          reject(new Error('WORKER_CANCELLED'));
          return;
        }
        onProgress?.(message.done, message.total);
        return;
      }
      if (message.type === 'done') {
        cleanup();
        resolve({ results: message.results, issues: message.issues, via: 'worker' });
      }
    };
    try {
      worker.postMessage({ jobId, modelId, rows });
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error?.message ?? error)));
    }
  });
}
