import { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
// read-excel-file v9 changed the default export to return `[{ sheet, data }]`.
// `readSheet()` is the API that still returns plain rows for a single sheet.
import { readSheet } from 'read-excel-file/browser';
import {
  ScatterChart, Scatter, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush
} from 'recharts';
import { coerceNumber } from '../math/creepModels';
import { computeRow } from './batchCompute';
import CustomSelect from './ui/CustomSelect';
import Lang from './ui/Lang';
import { getState, updateBatch, useAppSelector } from '../state/appStore';
import { MODELS } from './batchModels';
import { isBatchWorkerAvailable, runBatchInWorker } from './batchWorkerClient';
import { applyMapping, suggestMapping } from './columnMapping';
import { CHART, axisTitleStyle, formatLogTick, tickGap, tickStyle } from './chartTheme';

const BATCH_KERNEL_NOTE = 'Every row is evaluated with the reference kernels, for all six models. The Rust kernel exposes batch entry points for ACI 209 and MC 2010 only, so using it here would compute different models with different kernels and make rows incomparable.';

const MAX_BATCH_ROWS = 20000;
const MAX_SCATTER_POINTS = 2000;

const SAMPLE_DATA = {
  aci209: [35, 90, 180, 365, 730, 1460, 3650, 7300, 10000].map(t => ({
    curingType: 'moist', t0: 28, H: 70, VS: 100, slump: 100,
    fineAggregate: 50, airContent: 8, t
  })),
  mc2010: [35, 90, 180, 365, 730, 1460, 3650, 7300, 10000].map(t => ({
    fcm: 38, RH: 70, t0: 28, Ac: 90000, u: 1200, T: 20, Cs: '42.5 R', sigma: 12, t
  })),
  b4: [28, 90, 112, 365, 730, 1460, 3650, 7300, 10000].map(t => ({
    t0: 28, tPrime: 28, Tcur: 20, Tsh: 20, Tc: 20, h: 50, fc: 27.6, vS: 19.05,
    c: 219.3, wC: 0.6, aC: 7, cementType: 'R', aggregateType: 'No Information', specimenShape: '1',
    retarder: 0, flyAsh: 0, superplasticizer: 0, silicaFume: 0, airEntrainingAgent: 0, waterReducer: 0, t
  })),
  b4s: [28, 90, 112, 365, 730, 1460, 3650, 7300, 10000].map(t => ({
    t0: 28, tPrime: 28, Tcur: 20, Tsh: 20, Tc: 20, h: 50, fc: 27.6, vS: 19.05,
    cementType: 'R', aggregateType: 'No Information', specimenShape: '1', t
  })),
  gl2000: [35, 90, 180, 365, 730, 1460, 3650, 7300, 10000].map(t => ({
    fcm28: 32.5, h: 70, vs: 100, tc: 7, t0: 28, cementType: 'I', t
  })),
  aashto: [35, 90, 180, 365, 730, 1460, 3650, 7300, 10000].map(t => ({
    fci: 41, H: 70, vs: 89, ti: 7, tc: 7, t
  })),
};

/**
 * Is this cell a number? Must agree with `coerceNumber`, which is what the
 * kernels actually read: `Number('0x10')` is 16 (hex), so the old check
 * right-aligned a hex column as numeric while the kernel rejected every row
 * in it as NaN. Blank and whitespace-only cells are not numeric, and neither
 * are booleans.
 */
function isNumericCell(value) {
  return Number.isFinite(coerceNumber(value));
}
function formatBatchValue(value) {
  if (!Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 5 }).format(Number(value)).replace('-', '−');
}

// Same visual language as the single-analysis tooltip: title row plus x/y rows.
// Scatter passes the point in payload[0].payload, Line passes x as `label`.
function BatchTooltip({ active, payload, label, xKey, yKey }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload ?? {};
  // `value` is the x coordinate on a Scatter and the y coordinate on a Line,
  // so the datum itself is the only source that means the same in both modes.
  const x = point.x ?? label;
  const y = point.y ?? payload[0]?.value;
  return (
    <div className="rounded-none border border-line-strong bg-surface px-3 py-2.5 shadow-popover">
      <div className="mb-2 font-mono text-3xs font-semibold text-faint">
        {Number.isFinite(Number(point.row)) ? `Row #${point.row}` : 'Relation check'}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-5 text-1xs">
          <span className="text-muted">{xKey}</span>
          <span className="font-mono text-ink">{formatBatchValue(x)}</span>
        </div>
        <div className="flex items-center justify-between gap-5 text-1xs">
          <span className="text-muted">{yKey}</span>
          <span className="font-mono text-ink">{formatBatchValue(y)}</span>
        </div>
      </div>
    </div>
  );
}

export default function BatchCalculator() {
  // The parsed dataset and its results cannot be recreated without the file, so
  // they live in the store and survive leaving the workspace; parsing state and
  // errors are transient and stay here.
  const batch = useAppSelector((state) => state.batch);
  const {
    modelId: activeModel,
    rows: batchResults,
    headers: batchHeaders,
    issues,
    fileName,
    xKey,
    yKey,
    chartType,
    pendingRows,
    mapping,
  } = batch;
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchError, setBatchError] = useState('');
  // Chunked-compute progress for large files ({done,total} or null).
  const [progress, setProgress] = useState(null);
  // Guards async compute chunks: a newer processData/model-switch/upload
  // invalidates in-flight chunks, same role readSeq plays for parsing.
  const computeSeq = useRef(0);
  // View-only toggles stay local: unlike xKey/yKey/chartType they are not part
  // of the shared dataset, same split as the single-analysis chart.
  const [logX, setLogX] = useState(false);
  const [logY, setLogY] = useState(false);
  const model = MODELS.find((item) => item.id === activeModel);
  const requiredColumns = useMemo(() => model.req.split(', '), [model.req]);
  // A read that is still parsing must not be able to overwrite a newer one, and
  // it must resolve its model when it finishes rather than when the file was
  // chosen (see readFile).
  const readSeq = useRef(0);

  // Every failure path must clear the previous dataset, otherwise stale results
  // stay on screen under the new file name.
  const clearDataset = () => updateBatch({ rows: [], headers: [], pendingRows: [], mapping: [] });

  /**
   * Columns that hold numbers are right-aligned so magnitudes line up down the
   * column — comparing 0.6 with 219.3 by eye is the whole point of the matrix.
   * Which columns those are is a property of the file, so it is read from the
   * data: a column is numeric when every value in it parses as a number, and the
   * result columns always are.
   *
   * Computed once per dataset: it used to run inside every header and body cell,
   * so a 400-row file cost 40,500 row reads per render and a 20,000-row file made
   * the matrix take ~0.8 s to redraw — for the 100 rows it actually shows.
   */
  const numericColumns = useMemo(() => new Set(batchHeaders.filter((header) => (
    batchResults.length > 0 && batchResults.slice(0, 200).every((row) => isNumericCell(row[header]))
  ))), [batchHeaders, batchResults]);

  const numericColumn = (header) => numericColumns.has(header);

  const updateMapping = (index, source) => {
    updateBatch({ mapping: mapping.map((entry, position) => (position === index ? { ...entry, source } : entry)) });
  };

  // Fix a cell in place and recompute just that row, instead of editing the
  // file and re-uploading. Result cells are rebuilt from scratch so a row that
  // turns invalid cannot keep outputs from when it was valid (and vice versa).
  const commitCell = (rowIndex, header, valueText) => {
    const rowNumber = rowIndex + 2;
    const base = Object.fromEntries(
      Object.entries({ ...batchResults[rowIndex], [header]: valueText })
        .filter(([key]) => key !== '__status' && !key.startsWith('result_')),
    );
    const keptIssues = issues.filter((issue) => issue.row !== rowNumber);
    const nextRows = batchResults.slice();
    try {
      nextRows[rowIndex] = { ...base, ...computeRow(activeModel, base), __status: 'valid' };
      updateBatch({ rows: nextRows, issues: keptIssues });
    } catch (error) {
      nextRows[rowIndex] = { ...base, __status: 'invalid' };
      updateBatch({
        rows: nextRows,
        issues: [...keptIssues, { row: rowNumber, field: 'Input', value: '—', message: error.message }],
      });
    }
  };

  const applyColumnMapping = () => {
    const { rows: remapped, conflicts } = applyMapping(pendingRows, mapping);
    if (conflicts.length) {
      setBatchError(`Two fields cannot use the same column: ${conflicts.join('; ')}`);
      return;
    }
    updateBatch({ pendingRows: [], mapping: [] });
    setBatchError('');
    processData(remapped, 't');
  };

  // The target model is a parameter, not the one this render closed over: a model
  // switch recomputes immediately, before React has re-rendered with the new id.
  // `fileLabel` re-states the file the rows came from, because a model switch that
  // lands while the file is still parsing would otherwise clear the name.
  const processData = (data, preferredXKey = 't', parseIssues = [], modelId = activeModel, fileLabel = '') => {
    const target = MODELS.find((item) => item.id === modelId) ?? model;
    // Any new computation invalidates in-flight async chunks.
    computeSeq.current += 1;
    const seq = computeSeq.current;
    const name = fileLabel ? { fileName: fileLabel } : {};
    if (!data?.length) {
      clearDataset(); updateBatch({ issues: parseIssues, ...name });
      setBatchError('File is empty. 请上传包含表头和数据的 CSV 或 XLSX 文件。');
      setIsProcessing(false); return;
    }
    if (data.length > MAX_BATCH_ROWS) {
      clearDataset(); updateBatch({ issues: parseIssues, ...name });
      setBatchError(`File has ${data.length.toLocaleString('en-US')} rows, above the ${MAX_BATCH_ROWS.toLocaleString('en-US')}-row limit. Split the file and upload it in parts. · 文件行数超过上限，请分批上传。`);
      setIsProcessing(false); return;
    }
    const inputHeaders = Object.keys(data[0]);
    const required = target.req.split(', ');
    const missing = required.filter((key) => !inputHeaders.includes(key));
    updateBatch({ headers: inputHeaders, ...name });
    if (missing.length) {
      // Not a dead end any more: keep the parsed rows and ask which column holds
      // each missing field. Nothing is computed until the mapping is applied.
      updateBatch({
        rows: [],
        pendingRows: data,
        mapping: suggestMapping(missing, inputHeaders),
        issues: [...parseIssues, ...missing.map((field) => ({ row:'Header', field, value:'—', message:'Required column is missing · 缺少必填列' }))],
      });
      setBatchError(`Missing required columns: ${missing.join(', ')}`);
      setIsProcessing(false);
      return;
    }

    const nextIssues = [...parseIssues];
    // Small files stay synchronous so single-row edits, samples and unit tests
    // keep exact current timing. Large files yield between chunks so the UI
    // stays interactive; progress is reported and stale chunks are dropped.
    const SYNC_ROWS = 1000;
    const CHUNK_ROWS = 1000;
    const finishCompute = (results, foundIssues) => {
      // The mapping panel is answered or irrelevant by the time rows exist: leaving
      // `pendingRows`/`mapping` behind kept a panel on screen claiming this file was
      // missing columns, and its Apply button recomputed the *previous* file's rows.
      updateBatch({
        rows: results,
        issues: foundIssues,
        pendingRows: [],
        mapping: [],
        xKey: inputHeaders.includes(preferredXKey) ? preferredXKey : inputHeaders[0] || '',
        yKey: target.resultKeys[0],
        ...name,
      });
      setBatchError('');
      setProgress(null);
      setIsProcessing(false);
    };
    if (data.length <= SYNC_ROWS) {
      const nextResults = data.map((row, index) => {
        try { return { ...row, ...computeRow(modelId, row), __status:'valid' }; }
        catch (error) {
          nextIssues.push({ row:index + 2, field:'Input', value:'—', message:error.message });
          return { ...row, __status:'invalid' };
        }
      });
      finishCompute(nextResults, nextIssues);
      return;
    }
    setProgress({ done: 0, total: data.length });
    function startChunkLoop() {
    const nextResults = new Array(data.length);
    let cursor = 0;
    const step = () => {
      if (computeSeq.current !== seq) return;
      const end = Math.min(cursor + CHUNK_ROWS, data.length);
      for (let index = cursor; index < end; index += 1) {
        try { nextResults[index] = { ...data[index], ...computeRow(modelId, data[index]), __status:'valid' }; }
        catch (error) {
          nextIssues.push({ row:index + 2, field:'Input', value:'—', message:error.message });
          nextResults[index] = { ...data[index], __status:'invalid' };
        }
      }
      cursor = end;
      if (computeSeq.current !== seq) return;
      if (cursor < data.length) {
        setProgress({ done: cursor, total: data.length });
        setTimeout(step, 0);
        return;
      }
      finishCompute(nextResults, nextIssues);
    };
    setTimeout(step, 0);
    }
    // Worker first (kernel-only bundle), main-thread chunks as fallback.
    // jsdom and worker-less environments reject with WORKER_UNAVAILABLE.
    if (isBatchWorkerAvailable()) {
      runBatchInWorker(modelId, data, {
        onProgress: (done, total) => {
          if (computeSeq.current !== seq) return;
          setProgress({ done, total });
        },
        isCancelled: () => computeSeq.current !== seq,
      }).then(({ results, issues }) => {
        if (computeSeq.current !== seq) return;
        finishCompute(results, issues);
      }).catch((error) => {
        if (computeSeq.current !== seq) return;
        if (error?.message === 'WORKER_CANCELLED') return;
        startChunkLoop();
      });
      return;
    }
    startChunkLoop();
    return;
  };

  const readFile = async (file) => {
    if (!file) return;
    const seq = readSeq.current + 1;
    readSeq.current = seq;
    // Every failure path has to clear the previous dataset *and* any mapping panel
    // still standing from an earlier file.
    clearDataset();
    updateBatch({ fileName: file.name, issues: [] });
    setIsProcessing(true); setBatchError('');
    /*
     * The model is read when the parse finishes, not when the file was chosen: a
     * switch during a long parse used to compute the rows with the model that had
     * already been left, so an ACI heading sat over four B4 result columns and
     * every cell read "—" while the row still counted as Valid.
     */
    const finish = (data, issues) => {
      if (readSeq.current !== seq) return;   // a newer read has taken over
      processData(data, 't', issues, getState().batch.modelId, file.name);
    };
    const name = file.name.toLowerCase();
    if (name.endsWith('.csv')) {
      Papa.parse(file, {
        header:true,
        skipEmptyLines:true,
        transformHeader: (header) => String(header ?? '').trim(),
        complete:(result) => {
          const fields = result.meta?.fields ?? Object.keys(result.data[0] ?? {});
          const seen = new Set();
          const duplicates = [...new Set(fields.filter((field) => {
            if (seen.has(field)) return true;
            seen.add(field);
            return false;
          }))];
          const duplicateIssues = duplicates.map((field) => ({
            row: 'Header', field, value: '—',
            message: `Duplicate column "${field}" — only the last one is kept · 重复列只保留最后一列`,
          }));
          finish(result.data, [...duplicateIssues, ...(result.errors ?? []).map((error) => ({
            row: Number.isInteger(error.row) ? error.row + 2 : 'File',
            field: 'CSV',
            value: '—',
            message: `${error.message}${error.code ? ` (${error.code})` : ''}`,
          }))]);
        },
        error:(error) => {
          if (readSeq.current !== seq) return;
          clearDataset();
          setBatchError(`Could not parse CSV: ${error.message}`);
          setIsProcessing(false);
        },
      });
      return;
    }
    if (name.endsWith('.xlsx')) {
      try {
        const rows = await readSheet(file);
        if (readSeq.current !== seq) return;
        const [headerRow, ...dataRows] = rows;
        const headers = (headerRow || []).map((value) => String(value ?? '').trim());
        const records = dataRows
          .filter((row) => Array.isArray(row) && row.some((value) => value !== null && value !== undefined && value !== ''))
          .map((row) => Object.fromEntries(headers.map((header, index) => [header || `column_${index + 1}`, row[index] ?? ''])));
        finish(records, []);
      } catch (error) {
        if (readSeq.current !== seq) return;
        clearDataset();
        setBatchError(`Could not parse XLSX: ${error.message}`);
        setIsProcessing(false);
      }
      return;
    }
    setBatchError('Unsupported format. Use CSV or XLSX.'); setIsProcessing(false);
  };

  /**
   * Switching model used to clear the dataset unconditionally, so trying another
   * model destroyed the file you had just uploaded (the audit's P2-1). The inputs
   * are the user's work and survive: they are re-validated and recomputed against
   * the new model's contract, and if that contract needs columns the file does not
   * have, the mapping panel asks for them instead of the rows disappearing.
   *
   * The previous model's output columns are dropped first — otherwise switching
   * from B4 to ACI would leave result_J_GPa sitting next to result_phi.
   */
  const inputsOf = (rows) => rows.map((row) => {
    const inputs = {};
    for (const [key, value] of Object.entries(row)) {
      if (!key.startsWith('result_') && key !== '__status') inputs[key] = value;
    }
    return inputs;
  });

  const resetForModel = (id) => {
    const nextModel = MODELS.find((item) => item.id === id);
    const carried = pendingRows.length ? pendingRows : batchResults.length ? inputsOf(batchResults) : null;

    updateBatch({
      modelId: id,
      issues: [],
      xKey: '',
      yKey: nextModel?.resultKeys[0] || '',
      // Only a dataset that is actually carried over keeps its name.
      ...(carried ? {} : { rows: [], headers: [], fileName: '', pendingRows: [], mapping: [] }),
    });
    setBatchError('');

    if (carried) processData(carried, 't', [], id);
  };

  const loadSampleDataset = () => {
    // A parse still in flight must not land on top of the sample the user just
    // asked for: the newest action wins.
    readSeq.current += 1;
    const label = `${activeModel}_demo_sweep.csv`;
    updateBatch({ fileName: label });
    setIsProcessing(true);
    processData(SAMPLE_DATA[activeModel], 't', [], activeModel, label);
  };
  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const downloadTemplate = () => {
    const columns = model.req.split(', ');
    const csv = Papa.unparse([columns, model.template ?? columns.map(() => '0')]);
    downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}), `${activeModel}_template.csv`);
  };
  const exportCSV = () => {
    const keys=[...batchHeaders,...model.resultKeys];
    const csv=Papa.unparse(batchResults.map((row)=>Object.fromEntries(keys.map((key)=>[key,row[key]??'']))));
    downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}), `${activeModel}_batch_results.csv`);
  };

  // Points carry their matrix row so the tooltip can point back at it. Invalid
  // rows have no result cells, so they never reach the chart — the caption
  // below counts them instead of silently dropping them.
  // Memoized: pure derivation over batchResults/keys/scales; avoids re-walking
  // up to 20k rows on every unrelated render.
  const { basePoints, visiblePoints, scatterPoints, linePoints } = useMemo(() => {
    const base = batchResults.map((row, index) => ({ x: Number(row[xKey]), y: Number(row[yKey]), row: index + 1 })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    const filtered = (logX || logY) ? base.filter((point) => (!logX || point.x > 0) && (!logY || point.y > 0)) : base;
    const visible = logX ? filtered.map((point) => ({ ...point, plotX: Math.log10(point.x) })) : filtered;
    // Scatter renders one SVG circle per point: decimate past 2000 so a 20k-row
    // file stays interactive. Line mode keeps every point (it is already sorted
    // and brushed).
    const step = Math.max(1, Math.ceil(visible.length / MAX_SCATTER_POINTS));
    const scatter = visible.filter((_, index) => index % step === 0);
    // Line mode joins points in file order, so an unsorted X column draws a
    // meaningless zigzag — sort a copy, never the matrix order.
    const line = [...visible].sort((a, b) => a.x - b.x);
    return { basePoints: base, filteredPoints: filtered, visiblePoints: visible, scatterPoints: scatter, linePoints: line, scatterStep: step };
  }, [batchResults, xKey, yKey, logX, logY]);
  const yHasNegative = visiblePoints.some((point) => point.y < 0);
  const excludedCount = batchResults.length - basePoints.length;
  const logHiddenCount = basePoints.length - visiblePoints.length;
  const validCount=batchResults.filter((row)=>row.__status==='valid').length;
  const stage=batchResults.length ? 3 : issues.length ? 2 : 1;

  return (
    <div className="animate-fade-in">
      <header className="workspace-header">
        <div className="eyebrow">Batch calculation</div>
        <h1 className="mt-1.5 text-2xl font-light text-ink md:text-display-sm">Dataset pipeline</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Upload a calibrated input table, validate every row, calculate model outputs, and export a reproducible result matrix.</p>
        {/* The audit found the batch silently computing with a different kernel than
            the header badge implied. State it, and state why. */}
        <details className="group mt-3 text-xs text-muted">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 rounded-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
            <span className="rounded-none border border-line bg-surface-2 px-2 py-1 font-mono text-3xs font-semibold text-muted">JavaScript reference kernel</span>
            <span className="font-semibold text-action">Kernel details</span>
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current text-faint transition-transform group-open:rotate-180" aria-hidden="true">
              <path d="m4 6 4 4 4-4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <p className="mt-2 max-w-4xl">{BATCH_KERNEL_NOTE}</p>
        </details>
      </header>

      <div className="mb-5 grid grid-cols-3 overflow-hidden rounded-none border border-line bg-surface">
        {[
          ['01', 'Upload', '上传数据'],
          ['02', 'Validate', '校验字段'],
          ['03', 'Results', '计算结果'],
        ].map(([number, label, zh], index) => (
          <div
            key={label}
            aria-current={stage === index + 1 ? 'step' : undefined}
            className={`border-r border-line px-4 py-3 last:border-r-0 ${stage === index + 1 ? 'bg-action-soft' : ''}`}
          >
            <div className={`font-mono text-3xs font-semibold ${stage >= index + 1 ? 'text-action' : 'text-faint'}`}>{number}</div>
            <div className="mt-1 text-xs font-semibold text-ink">{label}</div>
            <div className="text-2xs text-muted"><Lang text={zh} /></div>
          </div>
        ))}
      </div>

      <section className="workbench-panel overflow-hidden">
        <div className="grid lg:grid-cols-[300px_1fr]">
          <div className="border-b border-line p-5 lg:border-b-0 lg:border-r">
            <label className="eyebrow" htmlFor="batch-model">Prediction model</label>
            <div className="mt-2">
              <CustomSelect
                id="batch-model"
                name="activeModel"
                value={activeModel}
                onChange={(event) => resetForModel(event.target.value)}
                options={MODELS.map((item) => ({ value: item.id, label: item.name }))}
              />
            </div>
            <details className="group mt-5 border-y border-line">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--action)] [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2 text-xs font-semibold text-ink">
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 fill-none stroke-current transition-transform -rotate-90 group-open:rotate-0" aria-hidden="true">
                    <path d="m4 6 4 4 4-4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Schema & templates
                </span>
                <span className="font-mono text-3xs text-faint">{requiredColumns.length} required fields</span>
              </summary>
              <div className="border-t border-line py-3 pl-5">
                <div className="eyebrow">Required schema</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {requiredColumns.map((column) => (
                    <code key={column} className="rounded-none border border-line bg-surface-2 px-1.5 py-1 font-mono text-3xs text-muted">{column}</code>
                  ))}
                </div>
                <button type="button" onClick={downloadTemplate} className="button-secondary mt-4 w-full">Download template</button>
                {model.sampleFiles && <div className="mt-4">
                  <div className="eyebrow">Shipped samples · <span lang="zh-CN">官方示例</span></div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {model.sampleFiles.map((file) => (
                      <a
                        key={file}
                        href={encodeURI(`/模型示例/${file}`)}
                        download
                        className="button-secondary !min-h-8 !px-2.5 !text-3xs"
                      >
                        {file.endsWith('.csv') ? 'CSV' : 'XLSX'}
                      </a>
                    ))}
                  </div>
                </div>}
              </div>
            </details>
          </div>

          <div className="p-4 sm:p-5">
            <label
              onDragOver={(event)=>event.preventDefault()} onDrop={(event)=>{event.preventDefault(); readFile(event.dataTransfer.files[0]);}}
              className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-none border border-dashed border-line-strong bg-surface-2 px-4 text-center transition-colors hover:border-action-border hover:bg-action-soft focus-within:border-action-border focus-within:ring-2 focus-within:ring-[var(--action)] focus-within:ring-offset-2 sm:min-h-[205px] sm:px-6"
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-current text-action" aria-hidden="true">
                <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v5h14v-5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="mt-3 text-sm font-semibold text-ink">Drop CSV or XLSX here</span>
              <span className="mt-1 text-xs text-muted" lang="zh-CN">拖入文件，或点击选择本地数据表</span>
              <span className="mt-3 rounded-none border border-line-strong bg-surface px-3 py-1.5 font-mono text-3xs text-muted">
                {isProcessing ? (progress ? `Processing… ${progress.done.toLocaleString('en-US')}/${progress.total.toLocaleString('en-US')}` : 'Processing…') : 'Choose file'}
              </span>
              <input
                type="file"
                className="sr-only"
                accept=".csv,.xlsx"
                disabled={isProcessing}
                onChange={(event) => readFile(event.target.files[0])}
              />
            </label>
            <div className="mt-3 flex flex-col items-start justify-between gap-1 text-xs text-muted min-[380px]:flex-row min-[380px]:items-center min-[380px]:gap-3">
              <span>{fileName || 'No dataset selected'}</span>
              <button
                type="button"
                onClick={loadSampleDataset}
                disabled={isProcessing}
                className="inline-flex min-h-8 items-center font-semibold text-action hover:underline"
              >
                Load demo sweep
              </button>
            </div>
          </div>
        </div>
      </section>

      {mapping.length > 0 && (
        <section className="mt-5 workbench-panel overflow-hidden">
          <div className="border-b border-line px-4 py-3.5">
            <div className="eyebrow">Column mapping</div>
            <p className="mt-1 text-xs text-muted">
              This file does not name {mapping.length === 1 ? 'one required column' : `${mapping.length} required columns`} the way {model.name} does. Choose which column holds each one, then calculate.
            </p>
          </div>
          <div className="grid gap-3 px-4 py-4 md:grid-cols-2">
            {mapping.map((entry, index) => (
              <label key={entry.field} className="flex items-center gap-3 text-xs">
                <span className="w-32 shrink-0 font-mono text-3xs font-semibold text-action">{entry.field}</span>
                <CustomSelect
                  name={`map-${entry.field}`}
                  ariaLabel={`Source column for ${entry.field}`}
                  value={entry.source}
                  onChange={(event) => updateMapping(index, event.target.value)}
                  options={[{ value: '', label: '— not in this file —' }, ...batchHeaders.map((header) => ({ value: header, label: header }))]}
                />
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
            <span className="text-xs text-muted">Rows are only calculated once every required column is mapped.</span>
            <button
              type="button"
              onClick={applyColumnMapping}
              disabled={mapping.some((entry) => !entry.source)}
              className="button-primary !min-h-9 !px-3 !text-1xs"
            >
              Apply mapping and calculate
            </button>
          </div>
        </section>
      )}

      {(batchError || issues.length>0 || batchResults.length>0) && <section className="mt-5 workbench-panel overflow-hidden">
        <div className="grid grid-cols-3 border-b border-line bg-surface-2" role="status">
          <div className="p-4">
            <div className="eyebrow">Rows detected</div>
            <div className="mt-1 font-mono text-xl text-ink">{batchResults.length}</div>
          </div>
          <div className="border-x border-line p-4">
            <div className="eyebrow">Valid</div>
            <div className="mt-1 font-mono text-xl text-[var(--success)]">{validCount}</div>
          </div>
          <div className="p-4">
            <div className="eyebrow">Issues</div>
            <div className="mt-1 font-mono text-xl text-error">{issues.length}</div>
          </div>
        </div>
        {batchError && (
          <div role="alert" className="border-b border-line bg-[var(--error-soft)] px-4 py-3 text-xs text-error"><Lang text={batchError} /></div>
        )}
        {issues.length > 0 && (
          <div className="max-h-56 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface">
                <tr>
                  {['Row', 'Field', 'Value', 'Issue'].map((head) => (
                    <th key={head} className="border-b border-line px-4 py-2 font-mono text-3xs text-faint">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {issues.slice(0, 100).map((issue, index) => (
                  <tr key={index}>
                    <td className="px-4 py-2 font-mono">{issue.row}</td>
                    <td className="px-4 py-2 font-mono">{issue.field}</td>
                    <td className="px-4 py-2 font-mono">{issue.value}</td>
                    <td className="px-4 py-2 text-error"><Lang text={issue.message} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {issues.length > 100 && (
              <div className="border-t border-line bg-surface-2 px-4 py-2 font-mono text-3xs text-faint">
                Showing 100 of {issues.length} issues · export the file and fix the rest in place after mapping · 显示前 100 条，共 {issues.length} 条
              </div>
            )}
          </div>
        )}
      </section>}

      {batchResults.length>0 && <>
        <section className="mt-5 workbench-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <div className="eyebrow">Result matrix</div>
              <div className="mt-1 text-xs text-muted">
                {batchResults.length} rows · {model.resultKeys.length} output fields
                {batchResults.length > 100 && <Lang text={` · 表格显示前 100 行，导出包含全部 ${batchResults.length} 行`} />}
              </div>
            </div>
            <button type="button" onClick={exportCSV} className="button-primary !min-h-9">Export CSV</button>
          </div>
          <div id="batch-matrix-scroll-hint" className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2 font-mono text-3xs text-faint md:hidden">
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 fill-none stroke-current" aria-hidden="true">
              <path d="M3 10h14M6 7l-3 3 3 3m8-6 3 3-3 3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Use ←/→ or swipe to inspect all columns
          </div>
          <div
            className="max-h-[470px] overflow-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--action)]"
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const distance = Math.max(120, event.currentTarget.clientWidth * 0.75);
              event.currentTarget.scrollLeft += event.key === 'ArrowRight' ? distance : -distance;
            }}
            role="region"
            aria-label="Batch result matrix, horizontally scrollable"
            aria-describedby="batch-matrix-scroll-hint"
            tabIndex={0}
          >
            <table className="min-w-max w-full border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-surface-2">
                <tr>
                  <th className="sticky left-0 z-20 border-b border-r border-line bg-surface-2 px-3 py-2.5 font-mono text-3xs text-faint">#</th>
                  {batchHeaders.map((header) => (
                    <th key={header} className={`border-b border-line px-3 py-2.5 font-mono text-3xs text-faint ${numericColumn(header) ? 'text-right' : ''}`}>{header}</th>
                  ))}
                  {model.resultKeys.map((key, index) => (
                    <th key={key} className="border-b border-line bg-action-soft px-3 py-2.5 text-right font-mono text-3xs text-action">{model.labels[index]}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {batchResults.slice(0, 100).map((row, index) => (
                  <tr key={index} className={row.__status === 'invalid' ? 'bg-[var(--error-soft)]' : ''}>
                    <td className="sticky left-0 border-r border-line bg-surface px-3 py-2 font-mono text-2xs text-faint">{index + 1}</td>
                    {batchHeaders.map((header) => (
                      <td key={header} className={`px-3 py-2 font-mono text-1xs text-muted ${numericColumn(header) ? 'text-right' : ''}`}>
                        {row.__status === 'invalid' ? (
                          <input
                            defaultValue={row[header] ?? ''}
                            aria-label={`Row ${index + 1} ${header}`}
                            name={`batch-${index}-${header}`}
                            autoComplete="off"
                            onBlur={(event) => commitCell(index, header, event.target.value)}
                            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                            className="w-full min-w-16 rounded-none bg-transparent font-mono text-1xs text-ink outline-none focus:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-action"
                          />
                        ) : (row[header])}
                      </td>
                    ))}
                    {model.resultKeys.map((key) => (
                      <td key={key} className="bg-action-soft/30 px-3 py-2 text-right font-mono text-1xs font-medium text-ink">{row[key] ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-5 workbench-panel overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="eyebrow">Result visualizer</div>
              <div className="mt-1 text-xs text-muted" lang="zh-CN">选择输入列与结果列进行快速关系检查</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1 rounded-none border border-line bg-surface-2 p-0.5">
                {['scatter', 'line'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => updateBatch({ chartType: type })}
                    className={`rounded-none px-3 py-1.5 font-mono text-3xs ${chartType === type ? 'bg-surface text-ink' : 'text-faint'}`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setLogX((value) => !value)}
                aria-pressed={logX}
                className={`button-secondary !min-h-8 !px-2.5 !text-3xs ${logX ? '!border-action-border !bg-action-soft !text-action' : ''}`}
              >
                {logX ? 'Log X' : 'Linear X'}
              </button>
              <button
                type="button"
                onClick={() => setLogY((value) => !value)}
                aria-pressed={logY}
                className={`button-secondary !min-h-8 !px-2.5 !text-3xs ${logY ? '!border-action-border !bg-action-soft !text-action' : ''}`}
              >
                {logY ? 'Log Y' : 'Linear Y'}
              </button>
            </div>
          </div>
          <div className="grid gap-4 border-b border-line p-4 sm:grid-cols-2">
            <div>
              <label className="eyebrow" htmlFor="param-select-xKey">X axis · input</label>
              <div className="mt-2">
                <CustomSelect
                  name="xKey"
                  value={xKey}
                  onChange={(event) => updateBatch({ xKey: event.target.value })}
                  options={batchHeaders.map((key) => ({ value: key, label: key }))}
                />
              </div>
            </div>
            <div>
              <label className="eyebrow" htmlFor="param-select-yKey">Y axis · output</label>
              <div className="mt-2">
                <CustomSelect
                  name="yKey"
                  value={yKey}
                  onChange={(event) => updateBatch({ yKey: event.target.value })}
                  options={model.resultKeys.map((key, index) => ({ value: key, label: model.labels[index] }))}
                />
              </div>
            </div>
          </div>
          <div className="border-b border-line bg-surface-2 px-4 py-2 font-mono text-3xs text-faint">
            Plotting {chartType === 'scatter' ? scatterPoints.length : visiblePoints.length} of {batchResults.length} rows{chartType === 'scatter' && visiblePoints.length > scatterPoints.length ? ` · decimated from ${visiblePoints.length}` : ''}{excludedCount > 0 ? ` · ${excludedCount} excluded (invalid or non-numeric — see red rows above)` : ''}{logHiddenCount > 0 ? ` · ${logHiddenCount} hidden by log scale (≤ 0)` : ''}
          </div>
          {visiblePoints.length === 0 ? (
            <div className="flex h-[380px] items-center justify-center p-4 text-center text-xs text-muted">
              No plottable points for {xKey} × {yKey} — rows are invalid, non-numeric, or hidden by the log scale.
            </div>
          ) : (
          <div className="h-[380px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'scatter' ? (
                <ScatterChart margin={{ top: 10, right: 20, left: 8, bottom: 28 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis
                    dataKey={logX ? 'plotX' : 'x'}
                    type="number"
                    scale="linear"
                    domain={logX ? ['dataMin', 'dataMax'] : undefined}
                    tickCount={logX ? 5 : undefined}
                    tickFormatter={logX ? formatLogTick : undefined}
                    allowDataOverflow
                    tick={tickStyle}
                    minTickGap={tickGap}
                    height={48}
                    label={{ value: xKey, position: 'insideBottom', offset: 12, ...axisTitleStyle }}
                  />
                  <YAxis
                    dataKey="y"
                    scale={logY ? 'log' : 'linear'}
                    domain={logY || yHasNegative ? ['auto', 'auto'] : [0, 'auto']}
                    allowDataOverflow
                    tick={tickStyle}
                    width={60}
                  />
                  <Tooltip content={<BatchTooltip xKey={xKey} yKey={yKey} />} cursor={{ stroke: 'var(--line-strong)', strokeDasharray: '3 3' }} />
                  <Scatter data={scatterPoints} fill="var(--action)" isAnimationActive={false} />
                  {/* No Brush here: ScatterChart ignores Brush children (only the
                      categorical charts wire it up), so one would render nothing
                      while pretending to zoom — Line mode carries the zoom UI. */}
                </ScatterChart>
              ) : (
                <LineChart data={linePoints} margin={{ top: 10, right: 20, left: 8, bottom: 28 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis
                    dataKey={logX ? 'plotX' : 'x'}
                    type="number"
                    scale="linear"
                    domain={logX ? ['dataMin', 'dataMax'] : undefined}
                    tickCount={logX ? 5 : undefined}
                    tickFormatter={logX ? formatLogTick : undefined}
                    allowDataOverflow
                    tick={tickStyle}
                    minTickGap={tickGap}
                    height={48}
                    label={{ value: xKey, position: 'insideBottom', offset: 12, ...axisTitleStyle }}
                  />
                  <YAxis
                    scale={logY ? 'log' : 'linear'}
                    domain={logY || yHasNegative ? ['auto', 'auto'] : [0, 'auto']}
                    allowDataOverflow
                    tick={tickStyle}
                    width={60}
                  />
                  <Tooltip content={<BatchTooltip xKey={xKey} yKey={yKey} />} cursor={{ stroke: 'var(--line-strong)', strokeDasharray: '3 3' }} />
                  <Line dataKey="y" stroke="var(--action)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  {linePoints.length > 1 && (
                    <Brush
                      data={linePoints}
                      dataKey="x"
                      height={18}
                      travellerWidth={5}
                      fill={CHART.brushTrack}
                      stroke={CHART.brushSelection}
                      tickFormatter={(value) => String(value)}
                    />
                  )}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
          )}
        </section>
      </>}
    </div>
  );
}
