import React, { useEffect, useMemo, useState } from 'react';
import DynamicParameters from './DynamicParameters';
import Lang from './Lang';
import { MAX_SERIES_DAYS } from '../../math/creepModels';
import { CHART, axisTitleStyle, legendStyle, tickGap, tickStyle } from '../chartTheme';
import { Brush, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

function downloadFile(filename, content, type = 'text/csv;charset=utf-8') {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Export the analysed series in the same column layout the batch importer expects
 * — every input parameter, then `t`, then the result columns — so an exported
 * file can be fed straight back into the batch pipeline (for the matching model).
 *
 * Earlier revisions wrote a `# key,value` metadata block as the first line and
 * named the time column `t_days`; the importer read the comment as the header row
 * and rejected the app's own export with "Missing required columns".
 *
 * `params` here must be the parameters the series was computed from, not the ones
 * currently on screen: when the inputs have moved since the run, writing the new
 * inputs beside the old results makes a file whose columns contradict each other
 * (measured: H=35 exported with the φ that belongs to H=90), and that file is
 * meant to be re-imported.
 */
function exportSeries(modelName, params, data, lines) {
  const inputs = Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'targetAge'));
  const inputKeys = Object.keys(inputs);
  const resultKeys = lines.map((line) => line.dataKey);
  const header = [...inputKeys, 't', ...resultKeys];
  const rows = data.map((row) => [
    ...inputKeys.map((key) => inputs[key]),
    row.t,
    ...resultKeys.map((key) => row[key] ?? ''),
  ].map(csvCell).join(','));
  downloadFile(`${modelName.replace(/\s+/g, '_')}_series.csv`, [header.join(','), ...rows].join('\n'));
}

function formatValue(value, digits = 6) {
  if (!Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  if (number !== 0 && Math.abs(number) < 0.0001) return number.toExponential(4).replace('-', '−');
  // Fixed to en-US on purpose, not by accident: engineering values are read with a
  // decimal point and thousands grouping regardless of the UI language, and a
  // locale-dependent format would render 1.234,56 for some readers of SI values.
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(number).replace('-', '−');
}

function CopyValue({ text, label }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement('textarea');
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard unavailable (permissions, insecure context) — leave the
      // button idle rather than failing the workspace around it.
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      title={label ?? 'Copy value'}
      aria-label={label ?? 'Copy value'}
      className="rounded border border-line px-1.5 py-0.5 font-mono text-3xs uppercase tracking-[.06em] text-faint transition-colors hover:border-green-border hover:text-green"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function Metric({ eyebrow, value, unit, accent = false }) {
  const copyText = `${formatValue(value)}${unit ? ` ${unit}` : ''}`;
  return (
    <div className="min-w-0">
      <div className="eyebrow">{eyebrow}</div>
      <div className={`mt-2 flex flex-wrap items-baseline gap-2 font-mono text-metric-sm font-semibold tracking-[-0.04em] md:text-metric ${accent ? 'text-green' : 'text-primary'}`}>
        <span>{formatValue(value)}</span>
        {unit && <span className="text-1xs font-medium tracking-normal text-muted">{unit}</span>}
        <CopyValue text={copyText} label={`Copy ${eyebrow}`} />
      </div>
    </div>
  );
}

function Decomposition({ items }) {
  if (!items?.length) return null;
  const groups = [
    { id:'compliance', label:'Compliance decomposition', fallback:'Result components' },
    { id:'shrinkage', label:'Shrinkage decomposition' },
  ].map((group) => ({ ...group, items: items.filter((item) => (item.group || 'compliance') === group.id) })).filter((group) => group.items.length);

  return (
    <div className={`grid gap-4 ${groups.length > 1 ? 'md:grid-cols-2' : ''}`}>
      {groups.map((group) => (
        <div key={group.id} className="rounded-lg border border-line bg-surface-2 p-4">
          <div className="eyebrow">{group.label}</div>
          <div className="mt-3 divide-y divide-line">
            {group.items.map((item) => (
              <div key={item.label} className={`grid grid-cols-[1fr_auto] items-baseline gap-3 py-2 text-xs ${item.total ? 'font-semibold text-primary' : 'text-muted'}`}>
                <span>{item.label}</span>
                <span className="flex items-center gap-2 font-mono tabular-nums text-primary">
                  <span>{formatValue(item.value, 3)} <small className="text-3xs font-normal text-faint">{item.unit}</small></span>
                  <CopyValue text={`${formatValue(item.value, 3)}${item.unit ? ` ${item.unit}` : ''}`} label={`Copy ${item.label}`} />
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScientificTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const numericLabel = Number(label);
  const title = Number.isFinite(numericLabel) ? new Intl.NumberFormat('en-US').format(numericLabel) : label;
  return (
    <div className="rounded-md border border-line-strong bg-surface px-3 py-2.5 shadow-[var(--shadow-popover)]">
      <div className="mb-2 font-mono text-3xs font-semibold uppercase tracking-[0.08em] text-faint">t = {title} days</div>
      <div className="space-y-1.5">
        {payload.map((item) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-5 text-1xs">
            <span className="flex items-center gap-2 text-muted">
              <i className="h-0.5 w-3" style={{ background: item.color || item.stroke }} />
              {item.name}
            </span>
            <span className="font-mono text-primary">{formatValue(item.value, 5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// What moved since the numbers on screen were computed: `before` is the run
// the results belong to (`resultParams`), `after` is what the panel holds now.
function ParamChanges({ before, after, config }) {
  if (!before || !after) return null;
  const changed = config.filter((item) => {
    const left = before[item.name];
    const right = after[item.name];
    return typeof left === 'number' && typeof right === 'number' ? !Object.is(left, right) : left !== right;
  });
  if (!changed.length) return null;
  return (
    <div className="mt-4 rounded-lg border border-line bg-surface-2 px-4 py-3">
      <div className="eyebrow">Changed since last run</div>
      <ul className="mt-2 space-y-1 text-xs">
        {changed.map((item) => (
          <li key={item.name} className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-muted">{item.label ?? item.name}</span>
            <span className="font-mono tabular-nums text-primary">{String(before[item.name])} → {String(after[item.name])}{item.unit ? ` ${item.unit}` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnalysisChart({ data, lines, params, resultParams, modelName, prevData }) {
  const hasShrinkage = lines.some((line) => line.kind === 'shrinkage');
  const [view, setView] = useState('compliance');
  const [logX, setLogX] = useState(false);
  const [logY, setLogY] = useState(false);
  // Brush window in data days. The t domain (0–10,000) is constant across runs,
  // so the window survives recalculation; dragging back to full width clears it.
  const [zoom, setZoom] = useState(null);
  const visibleLines = hasShrinkage ? lines.filter((line) => line.kind === view) : lines;
  // Shrinkage series are signed (drying shrinkage <= 0, RS autogenous can read as
  // expansion), so a log Y axis has no meaning there — the toggle stays off.
  const logYBlocked = visibleLines.some((line) => line.kind === 'shrinkage');
  const useLogY = logY && !logYBlocked;
  const sampled = useMemo(() => data.filter((row, index) => index % 10 === 0 || row.t === Math.round(params.targetAge)), [data, params.targetAge]);
  const baseData = logX ? sampled.filter((row) => row.t > 0) : sampled;
  // Sampling above is unchanged (every 10th point + target age); the log-Y filter
  // only hides non-positive points from display — export still gets `data` whole.
  const chartData = useLogY ? baseData.filter((row) => visibleLines.every((line) => Number.isFinite(Number(row[line.dataKey])) && Number(row[line.dataKey]) > 0)) : baseData;
  // Previous run, shaped by the same rules so the dashed overlay stays
  // comparable point-for-point with the current series.
  const prevBase = prevData ? prevData.filter((row, index) => index % 10 === 0 || row.t === Math.round(params.targetAge)) : null;
  const prevNoZeroX = prevBase && logX ? prevBase.filter((row) => row.t > 0) : prevBase;
  const prevChartData = prevNoZeroX && useLogY ? prevNoZeroX.filter((row) => visibleLines.every((line) => Number.isFinite(Number(row[line.dataKey])) && Number(row[line.dataKey]) > 0)) : prevNoZeroX;
  // Brush reports indices into the chart's own data (`chartData` above), so the
  // window reads t straight off it. Zoomed lines re-sample the full series to
  // ~800 points — the overview stays cheap, the close-up stays sharp.
  const handleBrushChange = ({ startIndex, endIndex }) => {
    if (startIndex == null || endIndex == null || chartData.length < 2) return;
    if (startIndex === 0 && endIndex >= chartData.length - 1) {
      setZoom(null);
    } else {
      setZoom({ start: chartData[startIndex].t, end: chartData[endIndex].t });
    }
  };
  const denseLines = !zoom ? null : (() => {
    const inWindow = data.filter((row) => row.t >= zoom.start && row.t <= zoom.end);
    const step = Math.max(1, Math.ceil(inWindow.length / 800));
    const dense = inWindow.filter((row, index) => index % step === 0 || row.t === Math.round(params.targetAge));
    const noZeroX = logX ? dense.filter((row) => row.t > 0) : dense;
    return useLogY ? noZeroX.filter((row) => visibleLines.every((line) => Number.isFinite(Number(row[line.dataKey])) && Number(row[line.dataKey]) > 0)) : noZeroX;
  })();
  const dataRows = useMemo(() => data.filter((row, index) => index % 250 === 0 || row.t === Math.round(params.targetAge)), [data, params.targetAge]);

  return (
    <section className="workbench-panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          {[['compliance', hasShrinkage ? 'Compliance' : 'Response'], ...(hasShrinkage ? [['shrinkage','Shrinkage']] : []), ['data','Data']].map(([id,label]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              aria-pressed={view === id}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === id ? 'bg-green-soft text-green' : 'text-muted hover:bg-surface-2 hover:text-primary'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {view !== 'data' && (
            <button
              onClick={() => setLogX((value) => !value)}
              aria-pressed={logX}
              className={`button-secondary !min-h-8 !px-2.5 !text-3xs ${logX ? '!border-green-border !bg-green-soft !text-green' : ''}`}
            >
              {logX ? 'Log X' : 'Linear X'}
            </button>
          )}
          {view !== 'data' && (
            <button
              onClick={() => setLogY((value) => !value)}
              aria-pressed={useLogY}
              disabled={logYBlocked}
              title={logYBlocked ? 'Log Y unavailable for signed shrinkage values' : undefined}
              className={`button-secondary !min-h-8 !px-2.5 !text-3xs ${useLogY ? '!border-green-border !bg-green-soft !text-green' : ''} ${logYBlocked ? '!cursor-not-allowed !opacity-40' : ''}`}
            >
              {useLogY ? 'Log Y' : 'Linear Y'}
            </button>
          )}
          <button
            onClick={() => exportSeries(modelName, resultParams ?? params, data, lines)}
            className="button-secondary !min-h-8 !px-2.5 !text-3xs"
          >
            Export CSV
          </button>
        </div>
      </div>

      {view === 'data' ? (
        <div>
          <div className="border-b border-line bg-surface-2 px-4 py-2 font-mono text-3xs text-faint">
            Showing {dataRows.length} of {data.length} computed points · every 250 days, plus the target age. Export CSV contains the full series.
          </div>
          <div className="max-h-[430px] overflow-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-surface-2">
              <tr>
                <th className="px-4 py-2.5 font-mono text-3xs uppercase tracking-[.08em] text-faint">Time · days</th>
                {lines.map((line) => (
                  <th key={line.dataKey} className="px-4 py-2.5 font-mono text-3xs uppercase tracking-[.08em] text-faint">{line.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {dataRows.map((row) => (
                <tr key={row.t} className={row.t === Math.round(params.targetAge) ? 'bg-green-soft' : ''}>
                  <td className="px-4 py-2 font-mono text-muted">{row.t}</td>
                  {lines.map((line) => (
                    <td key={line.dataKey} className="px-4 py-2 font-mono text-primary">{formatValue(row[line.dataKey], 5)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ) : (
        <div className="h-[430px] p-2 sm:p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top:12, right:18, left:0, bottom:24 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                scale={logX ? 'log' : 'linear'}
                domain={logX ? ['dataMin', 'dataMax'] : [0, 'dataMax']}
                allowDataOverflow
                tick={tickStyle}
                minTickGap={tickGap}
                tickLine={false}
                axisLine={{ stroke: 'var(--line-strong)' }}
                label={{ value: 'Concrete age · days', position: 'insideBottomRight', offset: -16, ...axisTitleStyle }}
              />
              <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={58} scale={useLogY ? 'log' : 'linear'} domain={useLogY || logYBlocked ? ['auto', 'auto'] : [0, 'auto']} allowDataOverflow />
              <Tooltip content={<ScientificTooltip />} cursor={{ stroke: 'var(--line-strong)', strokeDasharray: '3 3' }} />
              <Legend iconType="plainline" iconSize={18} wrapperStyle={legendStyle} />
              {Number.isFinite(Number(params.t0)) && (
                <ReferenceLine
                  x={Number(params.t0)}
                  stroke={CHART.reference}
                  strokeDasharray="4 4"
                  label={{ value: `t₀ ${params.t0}d`, fill: CHART.referenceText, fontSize: CHART.labelFont, position: 'insideTopLeft' }}
                />
              )}
              {Number.isFinite(Number(params.tPrime)) && params.tPrime !== params.t0 && (
                <ReferenceLine
                  x={Number(params.tPrime)}
                  stroke={CHART.target}
                  strokeDasharray="2 3"
                  label={{ value: `t′ ${params.tPrime}d`, fill: CHART.target, fontSize: CHART.labelFont, position: 'insideTopRight' }}
                />
              )}
              {Number.isFinite(Number(params.targetAge)) && (
                <ReferenceLine x={Number(params.targetAge)} stroke={CHART.reference} strokeWidth={1.5} />
              )}
              {prevChartData && prevChartData.length > 0 && visibleLines.map((line) => (
                <Line
                  key={`prev-${line.dataKey}`}
                  type="monotone"
                  data={prevChartData}
                  dataKey={line.dataKey}
                  name={`${line.name} · prev`}
                  stroke="var(--text-faint)"
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              ))}
              {visibleLines.map((line) => (
                <Line
                  key={line.dataKey}
                  type="monotone"
                  data={denseLines ?? undefined}
                  dataKey={line.dataKey}
                  name={line.name}
                  stroke={line.stroke}
                  strokeWidth={line.dataKey.includes('total') ? 2.6 : 2}
                  strokeDasharray={line.dataKey.includes('au') ? '5 4' : undefined}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, fill: 'var(--surface)' }}
                  isAnimationActive={false}
                />
              ))}
              {chartData.length > 1 && (
                <Brush data={chartData} dataKey="t" height={24} travellerWidth={8} stroke="var(--line-strong)" tickFormatter={(value) => String(value)} onChange={handleBrushChange} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function KernelComparison({ comparison, comparing, onCompare, compareReady }) {
  const speedup = comparison && comparison.rust > 0 ? comparison.js / comparison.rust : null;

  return (
    <section className="workbench-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Kernel comparison · <span lang="zh-CN">内核对比</span></div>
          <p className="mt-1 text-1xs text-muted">
            <span lang="zh-CN">同一组参数下，两条内核各计算一次</span> {MAX_SERIES_DAYS.toLocaleString('en-US')} <span lang="zh-CN">天序列并计时（含预热）。</span>
          </p>
        </div>
        <button onClick={onCompare} disabled={comparing || !compareReady} className="button-secondary !min-h-8 !px-2.5 !text-3xs">
          {comparing ? 'Measuring…' : 'Compare kernels'}
        </button>
      </div>

      {comparison && (
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4" role="status">
          <div>
            <div className="eyebrow">JS reference</div>
            <div className="mt-1 font-mono text-body text-primary">{formatValue(comparison.js, 2)} <small className="text-3xs font-normal text-faint">ms</small></div>
          </div>
          <div>
            <div className="eyebrow">Rust WASM</div>
            <div className="mt-1 font-mono text-body text-primary">{formatValue(comparison.rust, 2)} <small className="text-3xs font-normal text-faint">ms</small></div>
          </div>
          <div>
            <div className="eyebrow">Rust speed-up</div>
            <div className="mt-1 font-mono text-body text-green">{speedup && Number.isFinite(speedup) ? `${formatValue(speedup, 2)}×` : '—'}</div>
          </div>
        </div>
      )}
    </section>
  );
}

function NoticeBanner({ notices, onDismiss }) {
  if (!notices?.length) return null;
  return (
    <div className="mb-5 space-y-3">
      {notices.map((notice) => (
        <div key={notice.id} role="alert" className="flex flex-col gap-3 rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="font-mono text-2xs font-semibold uppercase tracking-[.08em] text-[var(--warning)]"><Lang text={notice.title} /></div>
            <p className="mt-1.5 max-w-[80ch] text-body-sm leading-5 text-[var(--warning)]"><Lang text={notice.message} /></p>
          </div>
          {onDismiss && <button onClick={() => onDismiss(notice.id)} className="button-secondary !min-h-8 shrink-0 !px-2.5 !text-3xs">Dismiss</button>}
        </div>
      ))}
    </div>
  );
}

export default function CalculatorWrapper({
  modelId, modelName,
  modelDescription,
  engine,
  paramsConfig,
  params,
  resultParams,
  onParamChange,
  onCalculate,
  calculateReady,
  inputIssue,
  buttonText,
  phiResult,
  feedLogs,
  chartData,
  chartLines,
  prevData,
  extraResults,
  resultLabel,
  dirty,
  duration,
  notices,
  onDismissNotice,
  comparison,
  comparing,
  onCompare,
  compareReady,
}) {
  const hasResults = chartData?.length > 0;
  const [resultName, explicitUnit] = (resultLabel || 'Creep coefficient φ').split('·').map((part) => part.trim());
  const primaryUnit = explicitUnit || 'dimensionless';
  const totalShrinkage = extraResults?.find((item) => item.total);

  useEffect(() => {
    const handler = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); if (calculateReady) onCalculate(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [calculateReady, onCalculate]);

  return (
    <div className="min-w-0">
      <header className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="status-dot" />
            <span className="eyebrow">{engine === 'rust' ? 'Rust WebAssembly' : 'JavaScript reference'}</span>
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-primary">{modelName}</h2>
          <p className="mt-1.5 max-w-[72ch] text-body-sm leading-relaxed text-muted">{modelDescription}</p>
        </div>
        {duration != null && (
          <div className="rounded-md border border-line bg-surface px-3 py-2 text-right">
            <div className="eyebrow">Last compute</div>
            <div className="mt-1 font-mono text-1xs text-primary">{duration.toFixed(2)} ms</div>
          </div>
        )}
      </header>

      <NoticeBanner notices={notices} onDismiss={onDismissNotice} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-[88px] lg:max-h-[calc(100dvh-112px)] lg:overflow-y-auto lg:pr-1">
          <DynamicParameters
            modelId={modelId}
            paramsConfig={paramsConfig}
            params={params}
            onParamChange={onParamChange}
            onCalculate={onCalculate}
            buttonText={buttonText}
            dirty={dirty}
            inputIssue={inputIssue}
          />
        </div>

        <div className="min-w-0 space-y-4">
          <section className="workbench-panel p-5 md:p-6">
            <div className="mb-5 flex items-center justify-between gap-4 border-b border-line pb-4">
              <div>
                <div className="eyebrow">Calculated at</div>
                <div className="mt-1 font-mono text-sm font-semibold text-primary">{formatValue(params.targetAge, 0)} days</div>
              </div>
              <div className="flex items-center gap-2">
              {prevData && prevData.length > 0 && !dirty && (
                <span className="rounded-md border border-dashed border-line-strong px-2.5 py-1 font-mono text-3xs font-semibold uppercase tracking-[.07em] text-faint">
                  vs previous run
                </span>
              )}
              <div
                className={`rounded-md px-2.5 py-1 font-mono text-3xs font-semibold uppercase tracking-[.07em] ${dirty ? 'bg-[var(--warning-soft)] text-[var(--warning)]' : 'bg-[var(--success-soft)] text-[var(--success)]'}`}
              >
                {dirty ? 'Results out of date' : 'Computed'}
              </div>
              </div>
            </div>
            <div className={`grid gap-6 ${totalShrinkage ? 'sm:grid-cols-2' : ''}`}>
              <Metric eyebrow={resultName} value={phiResult} unit={primaryUnit} accent />
              {totalShrinkage && (
                <Metric eyebrow="Total shrinkage" value={totalShrinkage.value} unit={totalShrinkage.unit} />
              )}
            </div>
            {dirty && <ParamChanges before={resultParams} after={params} config={paramsConfig} />}
          </section>

          <Decomposition items={extraResults} />
          <KernelComparison
            comparison={comparison}
            comparing={comparing}
            onCompare={onCompare}
            compareReady={compareReady}
          />
          {hasResults && (
            <AnalysisChart data={chartData} lines={chartLines} params={params} resultParams={resultParams} modelName={modelName} prevData={prevData} />
          )}

          <details className="workbench-panel overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
              <span className="eyebrow">Calculation log · <span lang="zh-CN">计算日志</span></span>
              <span className="font-mono text-3xs text-faint">{feedLogs.length} events</span>
            </summary>
            <div className="border-t border-line px-4 py-3">
              {feedLogs.map((log, index) => (
                <div key={index} className="grid grid-cols-[72px_1fr] gap-3 py-1 font-mono text-2xs">
                  <span className="text-faint">{log.time}</span>
                  <span className={log.type === 'error' ? 'text-error' : log.type === 'success' ? 'text-[var(--success)]' : 'text-muted'}>{log.message}</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
