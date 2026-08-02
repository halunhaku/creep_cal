import React from 'react';
import AnimatedMetric from './AnimatedMetric';

function ReadoutCell({ label, children, accent = false }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-4 py-3 first:pl-1">
      <span className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
        {label}
      </span>
      <div className="truncate font-mono text-xl font-bold md:text-2xl" style={accent ? { color: 'var(--green)', textShadow: '0 0 12px var(--trace-glow)' } : undefined}>
        {children}
      </div>
    </div>
  );
}

export default function ResultReadouts({ phi, extraResults, resultLabel }) {
  const phiValue = parseFloat(phi);
  const hasResult = Number.isFinite(phiValue);
  // Compliance J(t,t') values are tiny (~1e-4); creep coefficients are ~0.5–4
  const isComplianceJ = hasResult && phiValue > 0 && phiValue < 0.01;

  return (
    <div className="card flex flex-col divide-y divide-line sm:flex-row sm:divide-x sm:divide-y-0">
      <ReadoutCell label={resultLabel || 'Creep Coeff. φ(t,t₀)'} accent>
        {hasResult ? (
          <AnimatedMetric value={phiValue} format={isComplianceJ ? 'exponential' : 'fixed'} />
        ) : (
          <span className="text-faint">—</span>
        )}
      </ReadoutCell>

      {extraResults && extraResults.map((item) => (
        <ReadoutCell key={item.label} label={item.label}>
          {Number.isFinite(parseFloat(item.value))
            ? <AnimatedMetric value={parseFloat(item.value)} format="exponential" />
            : <span className="text-faint">—</span>}
        </ReadoutCell>
      ))}

      <ReadoutCell label="Series Range">
        <span className="text-primary">0 → 10000 <span className="text-sm font-normal text-muted">d</span></span>
      </ReadoutCell>

      <ReadoutCell label="Status">
        <span style={hasResult ? { color: 'var(--green)' } : { color: 'var(--text-faint)' }}>
          {hasResult ? '● COMPUTED' : '○ STANDBY'}
        </span>
      </ReadoutCell>
    </div>
  );
}
