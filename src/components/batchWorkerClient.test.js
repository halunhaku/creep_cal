import { afterEach, describe, expect, test, vi } from 'vitest';
import { isBatchWorkerAvailable, runBatchInWorker, setBatchWorkerFactory } from './batchWorkerClient';

function fakeWorker(behavior) {
  const worker = {
    terminated: false,
    onmessage: null,
    onerror: null,
    terminate() { this.terminated = true; },
    postMessage(message) {
      behavior(this, message);
    },
  };
  return worker;
}

afterEach(() => {
  setBatchWorkerFactory(null);
});

describe('batchWorkerClient', () => {
  test('resolves worker results with progress', async () => {
    const onProgress = vi.fn();
    setBatchWorkerFactory(() => fakeWorker((worker, message) => {
      worker.onmessage({ data: { jobId: message.jobId, type: 'progress', done: 1, total: 2 } });
      worker.onmessage({
        data: {
          jobId: message.jobId,
          type: 'done',
          results: [{ __status: 'valid' }, { __status: 'invalid' }],
          issues: [{ row: 3, field: 'Input', value: '—', message: 'bad' }],
        },
      });
    }));
    const out = await runBatchInWorker('aci209', [{}, {}], { onProgress });
    expect(out.via).toBe('worker');
    expect(out.results).toHaveLength(2);
    expect(out.issues).toHaveLength(1);
    expect(onProgress).toHaveBeenCalledWith(1, 2);
  });

  test('cancellation rejects and terminates', async () => {
    setBatchWorkerFactory(() => fakeWorker((worker, message) => {
      worker.onmessage({ data: { jobId: message.jobId, type: 'progress', done: 1, total: 2 } });
    }));
    await expect(runBatchInWorker('aci209', [{}, {}], { isCancelled: () => true }))
      .rejects.toThrow('WORKER_CANCELLED');
  });

  test('unavailable worker rejects for fallback', async () => {
    expect(isBatchWorkerAvailable()).toBe(false);
    await expect(runBatchInWorker('aci209', [])).rejects.toThrow('WORKER_UNAVAILABLE');
  });
});
