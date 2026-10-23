import React, { useSyncExternalStore } from 'react';
import { useT } from '../../i18n';
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
 *
 * @param {{ t: (key: string, vars?: object) => string, kernel: object, workspace: string }} args
 */
function describe({ t, kernel, workspace }) {
  if (workspace === 'batch') {
    return { label: t('kernel.batchLabel'), title: t('kernel.batchTitle') };
  }
  if (workspace === 'docs') return null;

  if (kernel.failure) {
    return {
      label: t('kernel.unavailable'),
      warn: true,
      title: t('kernel.failedTitle', { reason: kernel.failure }),
    };
  }
  return {
    idle: { label: t('kernel.idle'), title: t('kernel.idleTitle') },
    loading: { label: t('kernel.loading'), title: t('kernel.loadingTitle') },
    ready: kernel.engine === 'rust'
      ? { label: t('kernel.wasmReady'), title: t('kernel.wasmReadyTitle') }
      : { label: t('kernel.jsReady'), title: t('kernel.jsReadyTitle') },
    failed: { label: t('kernel.unavailable'), warn: true, title: t('kernel.unavailableTitle') },
  }[kernel.state] ?? { label: t('kernel.idle'), title: '' };
}

export default function KernelStatus({ workspace }) {
  const t = useT();
  const kernel = useSyncExternalStore(subscribeKernelStatus, getKernelStatus);
  const badge = describe({ t, kernel, workspace });
  if (!badge) return null;

  return (
    // The badge is the header row's designated slack-taker. Every control around it
    // is `shrink-0`, so once the row ran out of room the badge and the nav overlapped
    // instead of degrading. It has a title, so a long label can ellipsize safely.
    // The English and Chinese labels are both short (≤ "Reference kernels" / "JavaScript 参考内核"),
    // so the slack-taking still has room at the widths the header gates allow.
    <div
      className="kernel-status hidden min-w-0 shrink items-center gap-2 rounded-chip border border-line bg-surface px-2.5 py-1.5 min-[480px]:flex"
      title={badge.title}
      role="status"
      aria-live="polite"
    >
      <span className="status-dot" aria-hidden="true" style={badge.warn ? { background: 'var(--warning)' } : undefined} />
      <span className={`truncate font-mono text-3xs font-semibold ${badge.warn ? 'text-[var(--warning)]' : 'text-muted'}`}>
        {badge.label}
      </span>
    </div>
  );
}
