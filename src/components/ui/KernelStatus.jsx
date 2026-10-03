import React, { useSyncExternalStore } from 'react';
import { getKernelStatus, subscribeKernelStatus } from '../../wasm/creepEngine';

/**
 * The kernel indicator, in one place.
 *
 * It used to live in the header and describe only the calculation workspace's
 * loaded engine, so the batch page showed "WASM ready" directly above a line
 * saying the batch computes with the JavaScript reference kernels. Two statements
 * about the same subject, one of them misleading.
 *
 * What is true depends on the workspace, because the workspaces do not use the
 * same thing:
 *   Calculate  the engine you picked, and whether it is loaded yet
 *   Batch      always the reference kernels — the Rust package exposes batch
 *              entry points for ACI 209 and MC 2010 only, so a wasm batch would
 *              compute different models with different kernels
 *   Reference  nothing is computed here, so the indicator says nothing
 */
const BATCH = {
  label: 'Reference kernels',
  title: 'Batch rows are evaluated with the JavaScript reference kernels, for all four models. The Rust kernel exposes batch entry points for ACI 209 and MC 2010 only, so using it here would compute different models with different kernels and make the rows incomparable.',
};

function describe(kernel, workspace) {
  if (workspace === 'batch') return BATCH;
  if (workspace === 'docs') return null;

  if (kernel.failure) {
    return {
      label: 'WASM unavailable',
      warn: true,
      title: `Rust kernel failed: ${kernel.failure} — the JavaScript reference kernel is in use.`,
    };
  }
  return {
    idle: { label: 'Kernel idle', title: 'No calculation has run in this session yet.' },
    loading: { label: 'Loading WASM…', title: 'Loading the Rust WebAssembly kernel.' },
    ready: kernel.engine === 'rust'
      ? { label: 'WASM ready', title: 'The Rust WebAssembly kernel is loaded and active for the calculation workspace.' }
      : { label: 'JS kernel ready', title: 'The JavaScript reference kernel is active.' },
    failed: { label: 'WASM unavailable', warn: true, title: 'The Rust kernel failed to load.' },
  }[kernel.state] ?? { label: 'Kernel idle', title: '' };
}

export default function KernelStatus({ workspace }) {
  const kernel = useSyncExternalStore(subscribeKernelStatus, getKernelStatus);
  const badge = describe(kernel, workspace);
  if (!badge) return null;

  return (
    <div
      className="hidden items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 sm:flex"
      title={badge.title}
      role="status"
      aria-live="polite"
    >
      <span className="status-dot" aria-hidden="true" style={badge.warn ? { background: 'var(--warning)' } : undefined} />
      <span className={`font-mono text-3xs font-semibold uppercase tracking-[0.1em] ${badge.warn ? 'text-[var(--warning)]' : 'text-muted'}`}>
        {badge.label}
      </span>
    </div>
  );
}
