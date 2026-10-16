import { computeRowsChunk } from './batchCompute.js';

// Vite worker entry (`new Worker(new URL('./batchWorker.js', import.meta.url))`).
// Kernel-only imports: batchCompute pulls just creepModels, never React/recharts.
const CHUNK_ROWS = 2000;

self.onmessage = (event) => {
  const { jobId, modelId, rows } = event.data ?? {};
  const total = Array.isArray(rows) ? rows.length : 0;
  const results = new Array(total);
  const issues = [];
  let done = 0;
  const step = () => {
    const end = Math.min(done + CHUNK_ROWS, total);
    const slice = rows.slice(done, end);
    const out = computeRowsChunk(modelId, slice, done + 2);
    for (let i = 0; i < out.results.length; i += 1) results[done + i] = out.results[i];
    for (const issue of out.issues) issues.push(issue);
    done = end;
    if (done < total) {
      self.postMessage({ jobId, type: 'progress', done, total });
      setTimeout(step, 0);
      return;
    }
    self.postMessage({ jobId, type: 'done', results, issues });
  };
  step();
};
