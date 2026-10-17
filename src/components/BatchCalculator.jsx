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
import { useLocale, useT } from '../i18n';
import { pick, intlLocale } from '../i18n/pick';
import { formatInteger, formatNumber } from '../i18n/format';
import { localizeValidation } from './batchValidation';
import { getState, updateBatch, useAppSelector } from '../state/appStore';
import { MODELS } from './batchModels';
import { isBatchWorkerAvailable, runBatchInWorker } from './batchWorkerClient';
import { applyMapping, suggestMapping } from './columnMapping';
import { CHART, axisTitleStyle, tickGap, tickStyle } from './chartTheme';
import { MAX_XLSX_BYTES, isOversizedXlsx, megabytes } from './uploadLimits';

/**
 * Collapsed columns, reported the same way for both importers.
 *
 * A record is built by `Object.fromEntries`, so a header that appears twice (or
 * a blank header whose synthetic `column_N` name matches a real one) keeps the
 * last column and drops the first. The CSV path has always warned about that;
 * the XLSX path silently lost the column. Which value survives is defensible —
 * saying so is not optional.
 *
 * @param {string[]} fields the header names as the records will be keyed
 * @returns {object[]} one issue per collapsed name, in first-appearance order
 */
function duplicateHeaderIssues(fields) {
  const seen = new Set();
  const duplicates = [...new Set(fields.filter((field) => {
    if (seen.has(field)) return true;
    seen.add(field);
    return false;
  }))];
  return duplicates.map((field) => ({
    row: 'Header', field, value: '—',
    messageKey: 'batch.error.duplicate', vars: { field },
  }));
}

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
function formatBatchValue(value, formatter) {
  const number = coerceNumber(value);
  return Number.isFinite(number) ? formatter.format(number).replace('-', '−') : '—';
}

// Same visual language as the single-analysis tooltip: title row plus x/y rows.
// Scatter passes the point in payload[0].payload, Line passes x as `label`.
function BatchTooltip({ active, payload, label, xKey, yKey }) {
  const t = useT();
  const locale = useLocale();
  const formatter = useMemo(() => new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 5 }), [locale]);
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload ?? {};
  // `value` is the x coordinate on a Scatter and the y coordinate on a Line,
  // so the datum itself is the only source that means the same in both modes.
  const x = point.x ?? label;
  const y = point.y ?? payload[0]?.value;
  return (
    <div className="rounded-none border border-line-strong bg-surface px-3 py-2.5 shadow-popover">
      <div className="mb-2 font-mono text-3xs font-semibold text-faint">
        {Number.isFinite(point.row) ? t('batch.tooltipRow', { row: formatInteger(point.row, locale) }) : t('batch.relation')}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-5 text-1xs">
          <span className="text-muted">{xKey}</span>
          <span className="font-mono text-ink">{formatBatchValue(x, formatter)}</span>
        </div>
        <div className="flex items-center justify-between gap-5 text-1xs">
          <span className="text-muted">{yKey}</span>
          <span className="font-mono text-ink">{formatBatchValue(y, formatter)}</span>
        </div>
      </div>
    </div>
  );
}

export default function BatchCalculator() {
  const t = useT();
  const locale = useLocale();
  // Display formatting never feeds back into editable values, kernels or CSV.
  const inputFormatter = useMemo(() => new Intl.NumberFormat(intlLocale(locale), { maximumSignificantDigits: 21 }), [locale]);
  const tickFormatter = useMemo(() => new Intl.NumberFormat(intlLocale(locale), { maximumSignificantDigits: 3 }), [locale]);
  const formatTick = (value) => formatBatchValue(value, tickFormatter);
  const formatLogTick = (exponent) => formatTick(10 ** Number(exponent));
  const count = (value) => formatInteger(value, locale);
  const message = ({ key, vars }) => t(key, Object.fromEntries(Object.entries(vars ?? {}).map(([name, value]) => (
    [name, typeof value === 'number' ? count(value) : value]
  ))));
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
  const [processingGeneration, setProcessingGeneration] = useState(null);
  const isProcessing = processingGeneration === batch.generation;
  const setIsProcessing = (processing) => setProcessingGeneration(processing ? getState().batch.generation : null);
  const [errorState, setErrorState] = useState(null);
  const batchError = errorState?.generation === batch.generation ? errorState.message : null;
  const setBatchError = (error) => setErrorState(error ? { generation: getState().batch.generation, message: error } : null);
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
  const clearDataset = () => {
    computeSeq.current += 1;
    setProgress(null);
    updateBatch({ rows: [], headers: [], pendingRows: [], mapping: [] });
  };

  const confirmReplacement = (source) => (
    !(batchResults.length || pendingRows.length || isProcessing) || window.confirm(t('batch.confirmReplace', { source }))
  );

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
        .filter(([key]) => key !== '__status' && !model.resultKeys.includes(key)),
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
      setBatchError({ key: 'batch.error.mappingConflict', vars: { fields: conflicts.join('; ') } });
      return;
    }
    updateBatch({ pendingRows: [], mapping: [] });
    setBatchError('');
    processData(remapped, 't', issues.filter((issue) => issue.field === 'CSV' || issue.messageKey === 'batch.error.duplicate'));
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
    const generation = getState().batch.generation;
    const isCurrent = () => computeSeq.current === seq && getState().batch.generation === generation;
    setBatchError('');
    setProgress(null);
    const name = fileLabel ? { fileName: fileLabel } : {};
    if (!data?.length) {
      clearDataset(); updateBatch({ issues: parseIssues, ...name });
      setBatchError({ key: 'batch.error.empty' });
      setIsProcessing(false); return;
    }
    if (data.length > MAX_BATCH_ROWS) {
      clearDataset(); updateBatch({ issues: parseIssues, ...name });
      setBatchError({ key: 'batch.error.rowLimit', vars: { rows: data.length, limit: MAX_BATCH_ROWS } });
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
        issues: [...parseIssues, ...missing.map((field) => ({ row:'Header', field, value:'—', messageKey:'batch.error.missingColumn' }))],
      });
      setBatchError({ key: 'batch.error.missing', vars: { fields: missing.join(', ') } });
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
    // Keep source inputs while a worker/chunk is in flight so model switches
    // can restart computation instead of clearing an apparently empty matrix.
    updateBatch({ rows: [], pendingRows: data, mapping: [] });
    setIsProcessing(true);
    setProgress({ done: 0, total: data.length });
    function startChunkLoop() {
    const nextResults = new Array(data.length);
    let cursor = 0;
    const step = () => {
      if (!isCurrent()) return;
      const end = Math.min(cursor + CHUNK_ROWS, data.length);
      for (let index = cursor; index < end; index += 1) {
        try { nextResults[index] = { ...data[index], ...computeRow(modelId, data[index]), __status:'valid' }; }
        catch (error) {
          nextIssues.push({ row:index + 2, field:'Input', value:'—', message:error.message });
          nextResults[index] = { ...data[index], __status:'invalid' };
        }
      }
      cursor = end;
      if (!isCurrent()) return;
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
          if (!isCurrent()) return;
          setProgress({ done, total });
        },
        isCancelled: () => !isCurrent(),
      }).then(({ results, issues }) => {
        if (!isCurrent()) return;
        finishCompute(results, [...parseIssues, ...issues]);
      }).catch((error) => {
        if (!isCurrent()) return;
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
    /*
     * Refused before the replacement prompt and before anything is cleared.
     *
     * The other failure paths in this function deliberately throw the previous
     * dataset away, because a parse that failed halfway left results on screen
     * under the new file's name. This one has not touched the dataset: the file
     * never entered the pipeline, so the work that is already there is still the
     * user's and asking them to confirm discarding it would be a lie.
     */
    if (isOversizedXlsx(file.name, file.size)) {
      setBatchError({
        key: 'batch.error.fileTooLarge',
        vars: {
          size: formatNumber(megabytes(file.size), locale, 1),
          limit: formatNumber(megabytes(MAX_XLSX_BYTES), locale, 0),
        },
      });
      return;
    }
    if (!confirmReplacement(file.name)) return;
    const seq = readSeq.current + 1;
    readSeq.current = seq;
    const generation = getState().batch.generation;
    const isCurrent = () => readSeq.current === seq && getState().batch.generation === generation;
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
      if (!isCurrent()) return;   // a newer read has taken over
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
          finish(result.data, [...duplicateHeaderIssues(fields), ...(result.errors ?? []).map((error) => ({
            row: Number.isInteger(error.row) ? error.row + 2 : 'File',
            field: 'CSV',
            value: '—',
            message: `${error.message}${error.code ? ` (${error.code})` : ''}`,
          }))]);
        },
        error:(error) => {
          if (!isCurrent()) return;
          clearDataset();
          setBatchError({ key: 'batch.error.parseCsv', vars: { detail: error.message } });
          setIsProcessing(false);
        },
      });
      return;
    }
    if (name.endsWith('.xlsx')) {
      try {
        const rows = await readSheet(file);
        if (!isCurrent()) return;
        const [headerRow, ...dataRows] = rows;
        // A blank header is named after its position so the column is still
        // addressable; that synthetic name can collide with a real header, which
        // is the same collision as a duplicated name and gets the same warning.
        const headers = (headerRow || []).map((value, index) => String(value ?? '').trim() || `column_${index + 1}`);
        const records = dataRows
          .filter((row) => Array.isArray(row) && row.some((value) => value !== null && value !== undefined && value !== ''))
          .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
        finish(records, duplicateHeaderIssues(headers));
      } catch (error) {
        if (!isCurrent()) return;
        clearDataset();
        setBatchError({ key: 'batch.error.parseXlsx', vars: { detail: error.message } });
        setIsProcessing(false);
      }
      return;
    }
    setBatchError({ key: 'batch.error.unsupported' }); setIsProcessing(false);
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
      if (!model.resultKeys.includes(key) && key !== '__status') inputs[key] = value;
    }
    return inputs;
  });

  const resetForModel = (id) => {
    const nextModel = MODELS.find((item) => item.id === id);
    if (!nextModel || id === activeModel) return;
    const carried = pendingRows.length ? pendingRows : batchResults.length ? inputsOf(batchResults) : null;
    // Rebuild validation issues, but keep diagnostics from the source file.
    const parseIssues = issues.filter((issue) => issue.field === 'CSV' || issue.messageKey === 'batch.error.duplicate');

    updateBatch({
      modelId: id,
      issues: [],
      xKey: '',
      yKey: nextModel?.resultKeys[0] || '',
      // Only a dataset that is actually carried over keeps its name.
      ...(carried || isProcessing ? {} : { rows: [], headers: [], fileName: '', pendingRows: [], mapping: [] }),
    });
    setBatchError('');

    if (carried) processData(carried, xKey || 't', parseIssues, id);
  };

  const loadSampleDataset = () => {
    if (!confirmReplacement(t('batch.demoSource'))) return;
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
    // file stays interactive. Line mode used to keep every point, and Recharts
    // spent 1.26 s drawing the 20,000-point path and its Brush on this machine
    // (500 rows: 26 ms, 2,000 rows: 52 ms, 20,000 rows: 1,256 ms —
    // `batch-chart-toggle` in scripts/benchmark.mjs). It now uses the same cap,
    // with the last point kept so the line still reaches the end of the range.
    // 2,000 samples already exceed one point per pixel at any window width the
    // layout allows, so the drawn shape does not change at display resolution.
    const step = Math.max(1, Math.ceil(visible.length / MAX_SCATTER_POINTS));
    const scatter = visible.filter((_, index) => index % step === 0);
    // Line mode joins points in file order, so an unsorted X column draws a
    // meaningless zigzag — sort a copy, never the matrix order.
    const sorted = [...visible].sort((a, b) => a.x - b.x);
    const line = step === 1 ? sorted : (() => {
      const sampled = sorted.filter((_, index) => index % step === 0);
      if (sampled[sampled.length - 1] !== sorted[sorted.length - 1]) sampled.push(sorted[sorted.length - 1]);
      return sampled;
    })();
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
        <div className="eyebrow">{t('batch.workspace')}</div>
        <h1 className="mt-1.5 text-2xl font-light text-ink md:text-display-sm">{t('batch.title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t('batch.description')}</p>
        {/* The audit found the batch silently computing with a different kernel than
            the header badge implied. State it, and state why. */}
        <details className="group mt-3 text-xs text-muted">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 rounded-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--action)] focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
            <span className="rounded-none border border-line bg-surface-2 px-2 py-1 font-mono text-3xs font-semibold text-muted">{t('batch.kernel')}</span>
            <span className="font-semibold text-action">{t('batch.kernelDetails')}</span>
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current text-faint transition-transform group-open:rotate-180" aria-hidden="true">
              <path d="m4 6 4 4 4-4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <p className="mt-2 max-w-4xl">{t('batch.kernelNote')}</p>
        </details>
      </header>

      <div className="mb-5 grid grid-cols-3 overflow-hidden rounded-none border border-line bg-surface">
        {['upload', 'validate', 'results'].map((step, index) => (
          <div
            key={step}
            aria-current={stage === index + 1 ? 'step' : undefined}
            className={`border-r border-line px-4 py-3 last:border-r-0 ${stage === index + 1 ? 'bg-action-soft' : ''}`}
          >
            <div className={`font-mono text-3xs font-semibold ${stage >= index + 1 ? 'text-action' : 'text-faint'}`}>{String(index + 1).padStart(2, '0')}</div>
            <div className="mt-1 text-xs font-semibold text-ink">{t(`batch.steps.${step}`)}</div>
          </div>
        ))}
      </div>

      <section className="workbench-panel overflow-hidden">
        <div className="grid lg:grid-cols-[300px_1fr]">
          <div className="border-b border-line p-5 lg:border-b-0 lg:border-r">
            <label className="eyebrow" htmlFor="batch-model">{t('batch.model')}</label>
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
                  {t('batch.schemaTemplates')}
                </span>
                <span className="font-mono text-3xs text-faint">{t('batch.requiredFields', { count: requiredColumns.length, total: count(requiredColumns.length) })}</span>
              </summary>
              <div className="border-t border-line py-3 pl-5">
                <div className="eyebrow">{t('batch.requiredSchema')}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {requiredColumns.map((column) => (
                    <code key={column} className="rounded-none border border-line bg-surface-2 px-1.5 py-1 font-mono text-3xs text-muted">{column}</code>
                  ))}
                </div>
                <button type="button" onClick={downloadTemplate} className="button-secondary mt-4 w-full">{t('batch.downloadTemplate')}</button>
                {model.sampleFiles && <div className="mt-4">
                  <div className="eyebrow">{t('batch.shippedSamples')}</div>
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
              <span className="mt-3 text-sm font-semibold text-ink">{t('batch.dropFile')}</span>
              <span className="mt-1 text-xs text-muted">{t('batch.dropHint')}</span>
              <span className="mt-3 rounded-none border border-line-strong bg-surface px-3 py-1.5 font-mono text-3xs text-muted">
                {isProcessing ? (progress ? t('batch.progress', { done: count(progress.done), total: count(progress.total) }) : t('batch.processing')) : t('batch.chooseFile')}
              </span>
              <input
                type="file"
                className="sr-only"
                accept=".csv,.xlsx"
                disabled={isProcessing}
                onChange={(event) => {
                  readFile(event.target.files[0]);
                  // A cancelled replacement must allow choosing the same file again.
                  event.target.value = '';
                }}
              />
            </label>
            <div className="mt-3 flex flex-col items-start justify-between gap-1 text-xs text-muted min-[380px]:flex-row min-[380px]:items-center min-[380px]:gap-3">
              <span>{fileName || t('batch.noDataset')}</span>
              <button
                type="button"
                onClick={loadSampleDataset}
                disabled={isProcessing}
                data-action="load-demo-sweep"
                className="inline-flex min-h-8 items-center font-semibold text-action hover:underline"
              >
                {t('batch.loadDemo')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {mapping.length > 0 && (
        <section className="mt-5 workbench-panel overflow-hidden">
          <div className="border-b border-line px-4 py-3.5">
            <div className="eyebrow">{t('batch.mapping')}</div>
            <p className="mt-1 text-xs text-muted">
              {t('batch.mappingHint', { count: mapping.length, total: count(mapping.length), model: model.name })}
            </p>
          </div>
          <div className="grid gap-3 px-4 py-4 md:grid-cols-2">
            {mapping.map((entry, index) => (
              <label key={entry.field} htmlFor={`param-select-map-${entry.field}`} className="flex items-center gap-3 text-xs">
                <span className="w-32 shrink-0 font-mono text-3xs font-semibold text-action">{entry.field}</span>
                <CustomSelect
                  name={`map-${entry.field}`}
                  ariaLabel={t('batch.mappingSource', { field: entry.field })}
                  value={entry.source}
                  onChange={(event) => updateMapping(index, event.target.value)}
                  options={[{ value: '', label: t('batch.chooseColumn') }, ...batchHeaders.map((header) => ({ value: header, label: header }))]}
                />
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
            <span className="text-xs text-muted">{t('batch.mappingRequired')}</span>
            <button
              type="button"
              onClick={applyColumnMapping}
              disabled={mapping.some((entry) => !entry.source)}
              className="button-primary !min-h-9 !px-3 !text-1xs"
            >
              {t('batch.applyMapping')}
            </button>
          </div>
        </section>
      )}

      {(batchError || issues.length>0 || batchResults.length>0) && <section className="mt-5 workbench-panel overflow-hidden">
        <div className="grid grid-cols-3 border-b border-line bg-surface-2" role="status">
          <div className="p-4">
            <div className="eyebrow">{t('batch.rowsDetected')}</div>
            <div className="mt-1 font-mono text-xl text-ink">{count(batchResults.length)}</div>
          </div>
          <div className="border-x border-line p-4">
            <div className="eyebrow">{t('batch.valid')}</div>
            <div className="mt-1 font-mono text-xl text-[var(--success)]">{count(validCount)}</div>
          </div>
          <div className="p-4">
            <div className="eyebrow">{t('batch.issues')}</div>
            <div className="mt-1 font-mono text-xl text-error">{count(issues.length)}</div>
          </div>
        </div>
        {batchError && (
          <div role="alert" className="border-b border-line bg-[var(--error-soft)] px-4 py-3 text-xs text-error">{message(batchError)}</div>
        )}
        {issues.length > 0 && (
          <div className="max-h-56 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface">
                <tr>
                  {['row', 'field', 'value', 'message'].map((head) => (
                    <th key={head} className="border-b border-line px-4 py-2 font-mono text-3xs text-faint">{t(`batch.issue.${head}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {issues.slice(0, 100).map((issue, index) => (
                  <tr key={index}>
                    <td className="px-4 py-2 font-mono">{typeof issue.row === 'number' ? count(issue.row) : t(`batch.issue.${issue.row === 'Header' ? 'header' : 'file'}`)}</td>
                    <td className="px-4 py-2 font-mono">{issue.field === 'Input' ? t('batch.issue.input') : issue.field}</td>
                    <td className="px-4 py-2 font-mono">{issue.value}</td>
                    <td className="px-4 py-2 text-error">{issue.messageKey ? message({ key: issue.messageKey, vars: issue.vars }) : localizeValidation(issue.message, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {issues.length > 100 && (
              <div className="border-t border-line bg-surface-2 px-4 py-2 font-mono text-3xs text-faint">
                {t('batch.issueLimit', { shown: count(100), total: count(issues.length) })}
              </div>
            )}
          </div>
        )}
      </section>}

      {batchResults.length>0 && <>
        <section className="mt-5 workbench-panel overflow-hidden" data-result-matrix>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <div className="eyebrow">{t('batch.matrix')}</div>
              <div className="mt-1 text-xs text-muted">
                {t('batch.matrixSize', { rows: count(batchResults.length), fields: count(model.resultKeys.length) })}
                {batchResults.length > 100 && t('batch.matrixLimit', { shown: count(100), total: count(batchResults.length) })}
              </div>
            </div>
            <button type="button" onClick={exportCSV} data-action="export-csv" className="button-primary !min-h-9">{t('batch.exportCsv')}</button>
          </div>
          <div id="batch-matrix-scroll-hint" className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-2 font-mono text-3xs text-faint md:hidden">
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 fill-none stroke-current" aria-hidden="true">
              <path d="M3 10h14M6 7l-3 3 3 3m8-6 3 3-3 3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t('batch.scrollHint')}
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
            aria-label={t('batch.matrixRegion')}
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
                    <th key={key} className="border-b border-line bg-action-soft px-3 py-2.5 text-right font-mono text-3xs text-action">{pick(model.labels[index], locale)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {batchResults.slice(0, 100).map((row, index) => (
                  <tr key={index} className={row.__status === 'invalid' ? 'bg-[var(--error-soft)]' : ''}>
                    <td className="sticky left-0 border-r border-line bg-surface px-3 py-2 font-mono text-2xs text-faint">{count(index + 1)}</td>
                    {batchHeaders.map((header) => (
                      <td key={header} className={`px-3 py-2 font-mono text-1xs text-muted ${numericColumn(header) ? 'text-right' : ''}`}>
                        {row.__status === 'invalid' ? (
                          <input
                            defaultValue={row[header] ?? ''}
                            aria-label={t('batch.cellLabel', { row: count(index + 1), field: header })}
                            name={`batch-${index}-${header}`}
                            autoComplete="off"
                            onBlur={(event) => commitCell(index, header, event.target.value)}
                            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                            className="w-full min-w-16 rounded-none bg-transparent font-mono text-1xs text-ink outline-none focus:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-action"
                          />
                        ) : (isNumericCell(row[header]) ? formatBatchValue(row[header], inputFormatter) : row[header])}
                      </td>
                    ))}
                    {model.resultKeys.map((key) => (
                      <td key={key} className="bg-action-soft/30 px-3 py-2 text-right font-mono text-1xs font-medium text-ink">{row[key] == null ? '—' : formatNumber(row[key], locale, String(row[key]).split('.')[1]?.length ?? 0)}</td>
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
              <div className="eyebrow">{t('batch.visualizer')}</div>
              <div className="mt-1 text-xs text-muted">{t('batch.visualizerHint')}</div>
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
                    {t(`batch.${type}`)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setLogX((value) => !value)}
                aria-pressed={logX}
                className={`button-secondary !min-h-8 !px-2.5 !text-3xs ${logX ? '!border-action-border !bg-action-soft !text-action' : ''}`}
              >
                {t(logX ? 'batch.logX' : 'batch.linearX')}
              </button>
              <button
                type="button"
                onClick={() => setLogY((value) => !value)}
                aria-pressed={logY}
                className={`button-secondary !min-h-8 !px-2.5 !text-3xs ${logY ? '!border-action-border !bg-action-soft !text-action' : ''}`}
              >
                {t(logY ? 'batch.logY' : 'batch.linearY')}
              </button>
            </div>
          </div>
          <div className="grid gap-4 border-b border-line p-4 sm:grid-cols-2">
            <div>
              <label className="eyebrow" htmlFor="param-select-xKey">{t('batch.xAxis')}</label>
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
              <label className="eyebrow" htmlFor="param-select-yKey">{t('batch.yAxis')}</label>
              <div className="mt-2">
                <CustomSelect
                  name="yKey"
                  value={yKey}
                  onChange={(event) => updateBatch({ yKey: event.target.value })}
                  options={model.resultKeys.map((key, index) => ({ value: key, label: pick(model.labels[index], locale) }))}
                />
              </div>
            </div>
          </div>
          <div className="border-b border-line bg-surface-2 px-4 py-2 font-mono text-3xs text-faint">
            {t('batch.plotting', { shown: count(chartType === 'scatter' ? scatterPoints.length : linePoints.length), total: count(batchResults.length) })}
            {(chartType === 'scatter' ? scatterPoints.length : linePoints.length) < visiblePoints.length && t('batch.decimated', { total: count(visiblePoints.length) })}
            {excludedCount > 0 && t('batch.excluded', { total: count(excludedCount) })}
            {logHiddenCount > 0 && t('batch.logHidden', { total: count(logHiddenCount) })}
          </div>
          {visiblePoints.length === 0 ? (
            <div className="flex h-[380px] items-center justify-center p-4 text-center text-xs text-muted">
              {t('batch.noPoints', { x: xKey, y: yKey })}
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
                    tickFormatter={logX ? formatLogTick : formatTick}
                    allowDataOverflow
                    tick={tickStyle}
                    minTickGap={tickGap}
                    height={48}
                    label={{ value: xKey, position: 'insideBottom', offset: 12, ...axisTitleStyle }}
                  />
                  <YAxis
                    tickFormatter={formatTick}
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
                    tickFormatter={logX ? formatLogTick : formatTick}
                    allowDataOverflow
                    tick={tickStyle}
                    minTickGap={tickGap}
                    height={48}
                    label={{ value: xKey, position: 'insideBottom', offset: 12, ...axisTitleStyle }}
                  />
                  <YAxis
                    tickFormatter={formatTick}
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
                      ariaLabel={t('calculator.chart.brushRange')}
                      fill={CHART.brushTrack}
                      stroke={CHART.brushSelection}
                      tickFormatter={formatTick}
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
