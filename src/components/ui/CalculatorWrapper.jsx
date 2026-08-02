import React, { useState } from 'react';
import DynamicParameters from './DynamicParameters';
import ResultReadouts from './ResultReadouts';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

function exportToCSV(modelName, params, chartData, chartLines) {
  if (!chartData || chartData.length === 0) return;

  const lineKeys = chartLines ? chartLines.map(l => l.dataKey) : ['phi'];
  const headers = ['t_days', ...lineKeys];
  const rows = chartData.map(row => [row.t, ...lineKeys.map(k => row[k] ?? '')]);
  const paramRows = Object.entries(params).map(([k, v]) => [`# ${k}`, v]);

  const allRows = [
    [`# Model: ${modelName}`],
    [`# Exported: ${new Date().toISOString()}`],
    ...paramRows,
    ['#'],
    headers,
    ...rows
  ];

  const csv = allRows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${modelName.replace(/\s+/g, '_')}_results.csv`;
  link.click();
}

function exportSingleResult(modelName, params, phi) {
  const ts = new Date().toISOString();
  const lines = [
    `# CREEP_LAB — Single Point Calculation`,
    `# Model: ${modelName}`,
    `# Exported: ${ts}`,
    `#`,
    `parameter,value`,
    ...Object.entries(params).map(([k, v]) => `${k},${v}`),
    `#`,
    `result,value`,
    `phi_result,${phi}`,
  ];
  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${modelName.replace(/\s+/g, '_')}_single_result.csv`;
  link.click();
}

// ─── Analytics Chart ───────────────────────────────────────────────────────
function AnalyticsChart({ chartData, chartLines, t0, modelName }) {
  const [logX, setLogX] = useState(false);
  const yLabel = chartLines?.[0]?.name || 'Value';
  const t0ref  = t0 != null ? parseFloat(t0) : null;
  const data   = chartData.filter((_, i) => i % 10 === 0);

  return (
    <div className="card overflow-hidden">
      {/* Trace header bar */}
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-2 w-2 shrink-0 rounded-[2px] bg-green shadow-[0_0_6px_var(--green)]" aria-hidden="true" />
          <span className="truncate font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            Trace / {modelName}
          </span>
        </div>
        <button
          onClick={() => setLogX(v => !v)}
          aria-pressed={logX}
          className={`rounded border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors duration-150 ${
            logX
              ? 'border-green-border bg-green-soft font-bold text-green-dark'
              : 'border-line-strong text-muted hover:border-green-border hover:text-primary'
          }`}
        >
          Log X-Axis
        </button>
      </div>

      <div className="chart-stage h-[420px] p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 20, left: 10, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 5" stroke="var(--line)" />
            <XAxis
              dataKey="t" stroke="var(--text-faint)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              scale={logX ? 'log' : 'linear'}
              domain={logX ? ['auto', 'auto'] : undefined}
              allowDataOverflow={logX}
              tickCount={6}
              minTickGap={28}
              label={{ value: 'Time (days)', position: 'insideBottomRight', offset: -12, fill: 'var(--text-faint)', fontSize: 10 }}
            />
            <YAxis stroke="var(--text-faint)" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} width={52}
              label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: 8, fill: 'var(--text-faint)', fontSize: 10 }}
            />
            <Tooltip
              cursor={{ stroke: 'var(--green)', strokeOpacity: 0.4, strokeWidth: 1 }}
              contentStyle={{
                backgroundColor: 'var(--surface-2)',
                border: '1px solid var(--line-strong)',
                borderRadius: '6px',
                color: 'var(--text)',
                fontSize: 12,
                fontFamily: '"JetBrains Mono", monospace',
                boxShadow: 'var(--shadow)',
              }}
              formatter={(v, name) => [typeof v === 'number' ? v.toFixed(5) : v, name]}
              labelFormatter={l => `t = ${l} days`}
            />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace', paddingTop: 10 }} />
            {t0ref != null && !isNaN(t0ref) && (
              <ReferenceLine x={t0ref} stroke="var(--amber)" strokeDasharray="4 4"
                label={{ value: `t₀=${t0ref}d`, position: 'insideTopLeft', fill: 'var(--amber)', fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }} />
            )}
            {chartLines ? chartLines.map((line, idx) => (
              <Line key={idx} type="monotone" dataKey={line.dataKey} stroke={line.stroke}
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 5, stroke: line.stroke, strokeWidth: 2, fill: 'var(--bg)' }}
                name={line.name}
                isAnimationActive="auto"
                animationBegin={idx * 100}
                animationDuration={600}
                animationEasing="ease-out" />
            )) : (
              <Line
                type="monotone"
                dataKey="phi"
                stroke="var(--green)"
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 5, stroke: 'var(--green)', strokeWidth: 2, fill: 'var(--bg)' }}
                name="Creep Coefficient φ"
                isAnimationActive="auto"
                animationDuration={600}
                animationEasing="ease-out"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Console Log ───────────────────────────────────────────────────────────
function ConsoleLog({ feedLogs }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line bg-surface-2 px-4 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Console</span>
        <span className="font-mono text-[10px] text-faint">[{feedLogs.length} events]</span>
      </div>
      <div className="flex h-36 flex-col justify-end gap-1 overflow-y-auto px-4 py-3">
        {feedLogs.length === 0 && (
          <p className="console-line text-faint">// awaiting calculation</p>
        )}
        {feedLogs.map((log, index) => (
          <div key={index} className="console-line flex gap-3">
            <span className="shrink-0 text-faint">{log.time}</span>
            <span className={log.type === 'error' ? 'text-error' : log.type === 'success' ? 'text-green-dark' : 'text-muted'}>
              {log.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Calculator Wrapper ────────────────────────────────────────────────────
export default function CalculatorWrapper({
  modelName,
  modelDescription,
  paramsConfig,
  params,
  onParamChange,
  onCalculate,
  calculateReady,
  buttonText,
  phiResult,
  feedLogs,
  chartData,
  chartLines,
  extraResults,
  resultLabel
}) {
  const hasResults = chartData && chartData.length > 0;
  const numericResult = parseFloat(phiResult);
  const hasNumericResult = Number.isFinite(numericResult);

  return (
    <div className="animate-fade-in">
      {/* Page header */}
      <header className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 max-w-2xl">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-green-dark">Analysis Unit</span>
            <span className="h-px w-8 bg-green-border" aria-hidden="true" />
          </div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-[0.08em] text-primary md:text-2xl">
            {modelName}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{modelDescription}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {hasNumericResult && (
            <button
              onClick={() => exportSingleResult(modelName, params, phiResult)}
              className="btn-secondary px-3 py-2 text-[11px]"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">download</span>
              Export Result
            </button>
          )}
          {hasResults && (
            <button
              onClick={() => exportToCSV(modelName, params, chartData, chartLines)}
              className="btn-primary px-3 py-2 text-[11px]"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">table_chart</span>
              Export Time Series
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-12 gap-4 lg:gap-5">
        {/* Parameter panel — sticky on desktop */}
        <div className="col-span-12 lg:col-span-4">
          <div className="lg:sticky lg:top-[68px]">
            <DynamicParameters
              paramsConfig={paramsConfig}
              params={params}
              onParamChange={onParamChange}
              onCalculate={onCalculate}
              calculateReady={calculateReady}
              buttonText={buttonText}
            />
          </div>
        </div>

        {/* Trace + readouts + console */}
        <div className="col-span-12 space-y-4 lg:col-span-8">
          <AnalyticsChart
            chartData={chartData}
            chartLines={chartLines}
            t0={params?.t0}
            modelName={modelName}
          />
          <ResultReadouts phi={phiResult} extraResults={extraResults} resultLabel={resultLabel} />
          <ConsoleLog feedLogs={feedLogs} />
        </div>
      </div>
    </div>
  );
}
