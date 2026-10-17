import React, { useEffect, useMemo, useState } from 'react';
import DynamicParameters from './DynamicParameters';
import { useLocale, usePick, useT } from '../../i18n';
import { formatInteger } from '../../i18n/format';
import { MAX_SERIES_DAYS } from '../../math/creepModels';
import { CHART, axisTitleStyle, formatLogTick, legendStyle, tickGap, tickStyle } from '../chartTheme';
import { Brush, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

function downloadFile(filename, content, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  // Fixed to en-US on purpose, not by accident, and it stays that way now that the
  // interface has a language of its own: engineering values are read with a decimal
  // point and thousands grouping regardless of the surrounding prose, and a
  // locale-dependent format would render 1.234,56 for some readers of SI values.
  // Both shipped locales happen to format identically, so pinning it costs nothing
  // and removes the failure mode. Counts and ages, which are prose, go through
  // `formatInteger` instead.
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(number).replace('-', '−');
}

function CopyValue({ text, label }) {
  const t = useT();
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
  const name = label ?? t('calculator.copy.value');
  return (
    <button
      type="button"
      onClick={onCopy}
      title={name}
      aria-label={name}
      className="rounded-none border border-line px-1.5 py-0.5 font-mono text-3xs text-faint transition-colors hover:border-action-border hover:text-action"
    >
      {copied ? t('calculator.copy.done') : t('calculator.copy.text')}
    </button>
  );
}

function Metric({ eyebrow, value, unit, accent = false }) {
  const t = useT();
  const copyText = `${formatValue(value)}${unit ? ` ${unit}` : ''}`;
  return (
    <div className="min-w-0">
      <div className="eyebrow">{eyebrow}</div>
      <div className={`mt-2 flex flex-wrap items-baseline gap-2 font-mono text-metric-sm font-semibold md:text-metric ${accent ? 'text-action' : 'text-ink'}`}>
        <span>{formatValue(value)}</span>
        {unit && <span className="text-1xs font-medium tracking-normal text-muted">{unit}</span>}
        <CopyValue text={copyText} label={t('calculator.copy.label', { label: eyebrow })} />
      </div>
    </div>
  );
}

function Decomposition({ items }) {
  const t = useT();
  const pick = usePick();
  if (!items?.length) return null;
  const groups = [
    { id:'compliance', label:t('calculator.decomposition.compliance'), fallback:t('calculator.decomposition.fallback') },
    { id:'shrinkage', label:t('calculator.decomposition.shrinkage') },
  ].map((group) => ({ ...group, items: items.filter((item) => (item.group || 'compliance') === group.id) })).filter((group) => group.items.length);

  return (
    <div className={`grid gap-4 ${groups.length > 1 ? 'md:grid-cols-2' : ''}`}>
      {groups.map((group) => (
        <div key={group.id} className="rounded-none border border-line bg-surface-2 p-4">
          <div className="eyebrow">{group.label}</div>
          <div className="mt-3 divide-y divide-line">
            {group.items.map((item) => {
              const label = pick(item.label) || item.name;
              return (
              <div key={label} className={`grid grid-cols-[1fr_auto] items-baseline gap-3 py-2 text-xs ${item.total ? 'font-semibold text-ink' : 'text-muted'}`}>
                <span>{label}</span>
                <span className="flex items-center gap-2 font-mono tabular-nums text-ink">
                  <span>{formatValue(item.value, 3)} <small className="text-3xs font-normal text-faint">{item.unit}</small></span>
                  <CopyValue text={`${formatValue(item.value, 3)}${item.unit ? ` ${item.unit}` : ''}`} label={t('calculator.copy.label', { label })} />
                </span>
              </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScientificTooltip({ active, payload, label }) {
  const t = useT();
  if (!active || !payload?.length) return null;
  const sourceTime = payload[0]?.payload?.t ?? label;
  const numericLabel = Number(sourceTime);
  const title = Number.isFinite(numericLabel) ? new Intl.NumberFormat('en-US').format(numericLabel) : sourceTime;
  return (
    <div className="rounded-none border border-line-strong bg-surface px-3 py-2.5 shadow-popover">
      <div className="mb-2 font-mono text-3xs font-semibold text-faint">{t('calculator.chart.tooltipTime', { days: title })}</div>
      <div className="space-y-1.5">
        {payload.map((item) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-5 text-1xs">
            <span className="flex items-center gap-2 text-muted">
              <i className="h-0.5 w-3" style={{ background: item.color || item.stroke }} />
              {item.name}
            </span>
            <span className="font-mono text-ink">{formatValue(item.value, 5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// What moved since the numbers on screen were computed: `before` is the run
// the results belong to (`resultParams`), `after` is what the panel holds now.
function ParamChanges({ before, after, config }) {
  const t = useT();
  const pick = usePick();
  if (!before || !after) return null;
  const changed = config.filter((item) => {
    const left = before[item.name];
    const right = after[item.name];
    return typeof left === 'number' && typeof right === 'number' ? !Object.is(left, right) : left !== right;
  });
  if (!changed.length) return null;
  return (
    <div className="mt-4 rounded-none border border-line bg-surface-2 px-4 py-3">
      <div className="eyebrow">{t('calculator.changedSinceRun')}</div>
      <ul className="mt-2 space-y-1 text-xs">
        {changed.map((item) => (
          <li key={item.name} className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-muted">{pick(item.label) || item.name}</span>
            <span className="font-mono tabular-nums text-ink">{String(before[item.name])} → {String(after[item.name])}{item.unit ? ` ${item.unit}` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnalysisChart({ data, lines, params, resultParams, modelName, prevData }) {
  const t = useT();
  const locale = useLocale();
  const hasShrinkage = lines.some((line) => line.kind === 'shrinkage');
  const hasCompliance = lines.some((line) => line.kind !== 'shrinkage');
  // Single-kind models (GL2000 shrinkage today) open on the kind they have
  // instead of an empty Compliance tab.
  const [view, setView] = useState(hasCompliance ? 'compliance' : 'shrinkage');
  const [logX, setLogX] = useState(false);
  const [logY, setLogY] = useState(false);
  // Brush window in data days. The t domain (0–10,000) is constant across runs,
  // so the window survives recalculation; dragging back to full width clears it.
  const [zoom, setZoom] = useState(null);
  const visibleLines = useMemo(
    () => (hasShrinkage ? lines.filter((line) => line.kind === view) : lines),
    [hasShrinkage, lines, view],
  );
  // Shrinkage series are signed (drying shrinkage <= 0, RS autogenous can read as
  // expansion), so a log Y axis has no meaning there — the toggle stays off.
  const logYBlocked = visibleLines.some((line) => line.kind === 'shrinkage');
  const useLogY = logY && !logYBlocked;
  const sampled = useMemo(
    () => data.filter((row, index) => index % 10 === 0 || (logX && row.t > 0 && row.t < 10) || row.t === Math.round(params.targetAge)),
    [data, logX, params.targetAge],
  );
  const baseData = useMemo(
    () => (logX
      ? sampled.filter((row) => row.t > 0).map((row) => ({ ...row, plotT: Math.log10(row.t) }))
      : sampled),
    [logX, sampled],
  );
  // The log-Y filter only hides non-positive points from display — export still
  // gets `data` whole. Memoization keeps Brush data stable while it emits a
  // range change; a fresh array here makes Recharts reset the handles to full.
  const chartData = useMemo(
    () => (useLogY
      ? baseData.filter((row) => visibleLines.every((line) => Number.isFinite(Number(row[line.dataKey])) && Number(row[line.dataKey]) > 0))
      : baseData),
    [baseData, useLogY, visibleLines],
  );
  // Previous run, shaped by the same rules so the dashed overlay stays
  // comparable point-for-point with the current series.
  const prevChartData = useMemo(() => {
    const base = prevData ? prevData.filter((row, index) => index % 10 === 0 || row.t === Math.round(params.targetAge)) : null;
    const noZeroX = base && logX
      ? base.filter((row) => row.t > 0).map((row) => ({ ...row, plotT: Math.log10(row.t) }))
      : base;
    return noZeroX && useLogY ? noZeroX.filter((row) => visibleLines.every((line) => Number.isFinite(Number(row[line.dataKey])) && Number(row[line.dataKey]) > 0)) : noZeroX;
  }, [prevData, logX, params.targetAge, useLogY, visibleLines]);
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
  const denseLines = useMemo(() => {
    if (!zoom) return null;
    const inWindow = data.filter((row) => row.t >= zoom.start && row.t <= zoom.end);
    const step = Math.max(1, Math.ceil(inWindow.length / 800));
    const dense = inWindow.filter((row, index) => index % step === 0 || row.t === Math.round(params.targetAge));
    const noZeroX = logX
      ? dense.filter((row) => row.t > 0).map((row) => ({ ...row, plotT: Math.log10(row.t) }))
      : dense;
    return useLogY ? noZeroX.filter((row) => visibleLines.every((line) => Number.isFinite(Number(row[line.dataKey])) && Number(row[line.dataKey]) > 0)) : noZeroX;
  }, [zoom, data, params.targetAge, logX, useLogY, visibleLines]);
  const dataRows = useMemo(() => data.filter((row, index) => index % 250 === 0 || row.t === Math.round(params.targetAge)), [data, params.targetAge]);

  return (
    <section className="workbench-panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          {[...(hasCompliance ? [['compliance', hasShrinkage ? t('calculator.chart.compliance') : t('calculator.chart.response')]] : []), ...(hasShrinkage ? [['shrinkage', t('calculator.chart.shrinkage')]] : []), ['data', t('calculator.chart.data')]].map(([id,label]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              aria-pressed={view === id}
              className={`rounded-none px-3 py-1.5 text-xs font-semibold ${view === id ? 'bg-action-soft text-action' : 'text-muted hover:bg-surface-2 hover:text-ink'}`}
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
              className={`button-secondary !min-h-8 !px-2.5 !text-3xs ${logX ? '!border-action-border !bg-action-soft !text-action' : ''}`}
            >
              {logX ? t('calculator.chart.logX') : t('calculator.chart.linearX')}
            </button>
          )}
          {view !== 'data' && (
            <button
              onClick={() => setLogY((value) => !value)}
              aria-pressed={useLogY}
              disabled={logYBlocked}
              title={logYBlocked ? t('calculator.chart.logYBlocked') : undefined}
              className={`button-secondary !min-h-8 !px-2.5 !text-3xs ${useLogY ? '!border-action-border !bg-action-soft !text-action' : ''} ${logYBlocked ? '!cursor-not-allowed !opacity-40' : ''}`}
            >
              {useLogY ? t('calculator.chart.logY') : t('calculator.chart.linearY')}
            </button>
          )}
          <button
            onClick={() => exportSeries(modelName, resultParams ?? params, data, lines)}
            className="button-secondary !min-h-8 !px-2.5 !text-3xs"
          >
            {t('calculator.chart.export')}
          </button>
        </div>
      </div>

      {view === 'data' ? (
        <div>
          <div className="border-b border-line bg-surface-2 px-4 py-2 font-mono text-3xs text-faint">
            {t('calculator.chart.showing', { shown: formatInteger(dataRows.length, locale), total: formatInteger(data.length, locale), stride: formatInteger(250, locale) })}
          </div>
          <div className="max-h-[430px] overflow-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-surface-2">
              <tr>
                <th className="px-4 py-2.5 font-mono text-3xs text-faint">{t('calculator.chart.timeColumn')}</th>
                {lines.map((line) => (
                  <th key={line.dataKey} className="px-4 py-2.5 font-mono text-3xs text-faint">{line.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {dataRows.map((row) => (
                <tr key={row.t} className={row.t === Math.round(params.targetAge) ? 'bg-action-soft' : ''}>
                  <td className="px-4 py-2 font-mono text-muted">{row.t}</td>
                  {lines.map((line) => (
                    <td key={line.dataKey} className="px-4 py-2 font-mono text-ink">{formatValue(row[line.dataKey], 5)}</td>
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
                dataKey={logX ? 'plotT' : 't'}
                type="number"
                scale="linear"
                domain={logX ? ['dataMin', 'dataMax'] : [0, 'dataMax']}
                tickCount={logX ? 5 : undefined}
                tickFormatter={logX ? formatLogTick : undefined}
                allowDataOverflow
                tick={tickStyle}
                minTickGap={tickGap}
                tickLine={false}
                axisLine={{ stroke: 'var(--line-strong)' }}
                height={48}
                label={{ value: t('calculator.chart.axisTime'), position: 'insideBottom', offset: 12, ...axisTitleStyle }}
              />
              <YAxis tick={tickStyle} tickLine={false} axisLine={false} width={58} scale={useLogY ? 'log' : 'linear'} domain={useLogY || logYBlocked ? ['auto', 'auto'] : [0, 'auto']} allowDataOverflow />
              <Tooltip content={<ScientificTooltip />} cursor={{ stroke: 'var(--line-strong)', strokeDasharray: '3 3' }} />
              <Legend iconType="plainline" iconSize={18} wrapperStyle={legendStyle} />
              {Number.isFinite(Number(params.t0)) && (
                <ReferenceLine
                  x={logX ? Math.log10(Number(params.t0)) : Number(params.t0)}
                  stroke={CHART.reference}
                  strokeDasharray="4 4"
                  label={{ value: t('calculator.chart.referenceLoad', { days: params.t0 }), fill: CHART.referenceText, fontSize: CHART.labelFont, position: 'insideTopLeft' }}
                />
              )}
              {Number.isFinite(Number(params.tPrime)) && params.tPrime !== params.t0 && (
                <ReferenceLine
                  x={logX ? Math.log10(Number(params.tPrime)) : Number(params.tPrime)}
                  stroke={CHART.target}
                  strokeDasharray="2 3"
                  label={{ value: t('calculator.chart.referenceLoading', { days: params.tPrime }), fill: CHART.target, fontSize: CHART.labelFont, position: 'insideTopRight' }}
                />
              )}
              {Number.isFinite(Number(params.targetAge)) && (
                <ReferenceLine x={logX ? Math.log10(Number(params.targetAge)) : Number(params.targetAge)} stroke={CHART.reference} strokeWidth={1.5} />
              )}
              {prevChartData && prevChartData.length > 0 && visibleLines.map((line) => (
                <Line
                  key={`prev-${line.dataKey}`}
                  type="monotone"
                  data={prevChartData}
                  dataKey={line.dataKey}
                  name={t('calculator.chart.previous', { name: line.name })}
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
                <Brush
                  data={chartData}
                  dataKey="t"
                  height={18}
                  travellerWidth={5}
                  fill={CHART.brushTrack}
                  stroke={CHART.brushSelection}
                  tickFormatter={(value) => String(value)}
                  onChange={handleBrushChange}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function KernelComparison({ comparison, comparing, onCompare, compareReady, compareNote }) {
  const t = useT();
  const locale = useLocale();
  const speedup = comparison && comparison.rust > 0 ? comparison.js / comparison.rust : null;

  return (
    <section className="workbench-panel p-4" data-kernel-comparison data-ready={comparison ? 'true' : 'false'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">{t('calculator.comparison.title')}</div>
          <p className="mt-1 text-1xs text-muted">
            {compareNote ?? t('calculator.comparison.note', { days: formatInteger(MAX_SERIES_DAYS, locale) })}
          </p>
        </div>
        <button type="button" onClick={onCompare} data-action="compare-kernels" disabled={comparing || !compareReady} title={compareNote ?? undefined} className="button-secondary !min-h-8 !px-2.5 !text-3xs">
          {comparing ? t('calculator.comparison.measure') : t('calculator.comparison.run')}
        </button>
      </div>

      {comparison && (
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4" role="status">
          <div>
            <div className="eyebrow">{t('calculator.comparison.js')}</div>
            <div className="mt-1 font-mono text-body text-ink">{formatValue(comparison.js, 2)} <small className="text-3xs font-normal text-faint">ms</small></div>
          </div>
          <div>
            <div className="eyebrow">{t('calculator.comparison.rust')}</div>
            <div className="mt-1 font-mono text-body text-ink">{formatValue(comparison.rust, 2)} <small className="text-3xs font-normal text-faint">ms</small></div>
          </div>
          <div>
            <div className="eyebrow">{t('calculator.comparison.speedup')}</div>
            <div className="mt-1 font-mono text-body text-action">{speedup && Number.isFinite(speedup) ? `${formatValue(speedup, 2)}×` : '—'}</div>
          </div>
        </div>
      )}
    </section>
  );
}

function NoticeBanner({ notices, onDismiss }) {
  const t = useT();
  if (!notices?.length) return null;
  return (
    <div className="mb-5 space-y-3">
      {notices.map((notice) => (
        <div key={notice.id} role="alert" className="flex flex-col gap-3 rounded-none border border-[var(--warning)] bg-[var(--warning-soft)] p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="font-mono text-2xs font-semibold text-[var(--warning)]">{notice.title}</div>
            <p className="mt-1.5 max-w-[80ch] text-body-sm leading-5 text-[var(--warning)]">{notice.message}</p>
          </div>
          {onDismiss && <button onClick={() => onDismiss(notice.id)} className="button-secondary !min-h-8 shrink-0 !px-2.5 !text-3xs">{t('calculator.notice.dismiss')}</button>}
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
  compareNote,
}) {
  const t = useT();
  const pick = usePick();
  const locale = useLocale();
  const hasResults = chartData?.length > 0;
  // `resultLabel` is a `{ en, zh }` pair whose value separates the name from the
  // unit with `·` — the convention the model configs have used for it. A translated
  // label must therefore not contain a `·` of its own, which
  // models.locale.test.jsx pins for every model in both locales.
  const [resultName, explicitUnit] = pick(resultLabel ?? t('calculator.defaultResult')).split('·').map((part) => part.trim());
  const primaryUnit = explicitUnit || t('calculator.units.dimensionless');
  const totalShrinkage = extraResults?.find((item) => item.total);
  // Series names travel with the model, so they arrive as `{ en, zh }` pairs; the
  // chart, its legend and the data table all read them from here.
  const lines = useMemo(
    () => (chartLines ?? []).map((line) => ({ ...line, name: pick(line.name) })),
    [chartLines, pick],
  );
  useEffect(() => {
    const handler = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); if (calculateReady) onCalculate(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [calculateReady, onCalculate]);

  /*
   * `data-run-status` and `data-kernel` are the settle signals for the browser
   * gates in scripts/. They waited on the English words "Last compute" and
   * "JavaScript reference", so the gates could only run on an English interface
   * and only by reading display copy. An attribute is neither: the gates now wait
   * for `[data-run-status="computed"]` and read `data-kernel` directly, and the
   * wording can change without breaking them.
   */
  return (
    <div className="min-w-0">
      <header
        data-run-status={duration != null ? 'computed' : 'idle'}
        data-kernel={engine}
        className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
      >
        <div className="min-w-0 max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="status-dot" />
            <span className="eyebrow">{engine === 'rust' ? t('calculator.engineRust') : t('calculator.engineJs')}</span>
          </div>
          <h2 className="mt-2 text-xl font-semibold text-ink">{modelName}</h2>
          <p className="mt-1.5 max-w-[72ch] text-body-sm leading-relaxed text-muted">{modelDescription}</p>
        </div>
        {duration != null && (
          <div className="rounded-none border border-line bg-surface px-3 py-2 text-right">
            <div className="eyebrow">{t('calculator.lastCompute')}</div>
            <div className="mt-1 font-mono text-1xs text-ink">{duration.toFixed(2)} ms</div>
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
                <div className="eyebrow">{t('calculator.calculatedAt')}</div>
                <div className="mt-1 font-mono text-sm font-semibold text-ink">{t('calculator.days', { value: formatInteger(params.targetAge, locale) })}</div>
              </div>
              <div className="flex items-center gap-2">
              {prevData && prevData.length > 0 && !dirty && (
                <span className="rounded-none border border-dashed border-line-strong px-2.5 py-1 font-mono text-3xs font-semibold text-faint">
                  {t('calculator.vsPrevious')}
                </span>
              )}
              <div
                className={`rounded-none px-2.5 py-1 font-mono text-3xs font-semibold ${dirty ? 'bg-[var(--warning-soft)] text-[var(--warning)]' : 'bg-[var(--success-soft)] text-[var(--success)]'}`}
              >
                {dirty ? t('calculator.stale') : t('calculator.computed')}
              </div>
              </div>
            </div>
            <div className={`grid gap-6 ${totalShrinkage ? 'sm:grid-cols-2' : ''}`}>
              <Metric eyebrow={resultName} value={phiResult} unit={primaryUnit} accent />
              {totalShrinkage && (
                <Metric eyebrow={t('calculator.totalShrinkage')} value={totalShrinkage.value} unit={totalShrinkage.unit} />
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
            compareNote={compareNote}
          />
          {hasResults && (
            <AnalysisChart data={chartData} lines={lines} params={params} resultParams={resultParams} modelName={modelName} prevData={prevData} />
          )}

          <details className="workbench-panel overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
              <span className="eyebrow">{t('calculator.log.title')}</span>
              <span className="font-mono text-3xs text-faint">{t('calculator.log.events', { count: feedLogs.length })}</span>
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
