import React, { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
// read-excel-file v9 changed the default export to return `[{ sheet, data }]`.
// `readSheet()` is the API that still returns plain rows for a single sheet.
import { readSheet } from 'read-excel-file/browser';
import {
  ScatterChart, Scatter, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush
} from 'recharts';
import { aci209Single, mc2010Single, b4Single, b4sSingle, gl2000Single } from '../math/creepModels';
import CustomSelect from './ui/CustomSelect';
import Lang from './ui/Lang';
import { getState, updateBatch, useAppSelector } from '../state/appStore';
import { MODELS } from './batchModels';
import { applyMapping, suggestMapping } from './columnMapping';
import { axisTitleStyle, tickGap, tickStyle } from './chartTheme';


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
};

// A row is only "valid" when every output is a finite number. Silently writing
// the literal string "NaN" into the result matrix hides broken input rows.
function formatResult(value, digits, label) {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} could not be evaluated from these inputs · 输入无法产生有效结果`);
  }
  return value.toFixed(digits);
}

/**
 * Is this cell a number? Blank and whitespace-only cells are not (`Number('  ')`
 * is 0, which used to right-align a column of empty-looking text as if it were
 * numeric), and neither are booleans.
 */
function isNumericCell(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return text !== '' && Number.isFinite(Number(text));
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
    <div className="rounded-md border border-line-strong bg-surface px-3 py-2.5 shadow-[var(--shadow-popover)]">
      <div className="mb-2 font-mono text-3xs font-semibold uppercase tracking-[0.08em] text-faint">
        {Number.isFinite(Number(point.row)) ? `Row #${point.row}` : 'Relation check'}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-5 text-1xs">
          <span className="text-muted">{xKey}</span>
          <span className="font-mono text-primary">{formatBatchValue(x)}</span>
        </div>
        <div className="flex items-center justify-between gap-5 text-1xs">
          <span className="text-muted">{yKey}</span>
          <span className="font-mono text-primary">{formatBatchValue(y)}</span>
        </div>
      </div>
    </div>
  );
}

function computeRow(modelId, row) {
  if (modelId === 'aci209') {
    return { result_phi: formatResult(aci209Single(row), 4, 'φ (Creep Coeff.)') };
  }
  if (modelId === 'mc2010') {
    const { phi, phi_bc: phiBc, phi_dc: phiDc, nonlinear_factor: nonlinearFactor } = mc2010Single(row);
    return {
      result_phi: formatResult(phi, 4, 'φ (Total)'),
      result_phi_bc: formatResult(phiBc, 4, 'φbc (Basic)'),
      result_phi_dc: formatResult(phiDc, 4, 'φdc (Drying)'),
      result_nonlinear_factor: formatResult(nonlinearFactor, 4, 'Nonlinear Factor'),
    };
  }
  if (modelId === 'b4') {
    const { J_GPa: JGPa, epsilonSH, epsilonAU, epsilonTotal } = b4Single(row);
    return {
      result_J_GPa: formatResult(JGPa, 6, 'J (1/GPa)'),
      result_epsilonSH: formatResult(epsilonSH, 9, 'εsh (Drying)'),
      result_epsilonAU: formatResult(epsilonAU, 9, 'εau (Autogenous)'),
      result_epsilonTotal: formatResult(epsilonTotal, 9, 'εsh,total'),
    };
  }
  if (modelId === 'b4s') {
    const { J_GPa: JGPa, epsilonSH, epsilonAU, epsilonTotal } = b4sSingle(row);
    return {
      result_J_GPa: formatResult(JGPa, 6, 'J (1/GPa)'),
      result_epsilonSH: formatResult(epsilonSH, 9, 'εsh (Drying)'),
      result_epsilonAU: formatResult(epsilonAU, 9, 'εau (Autogenous)'),
      result_epsilonTotal: formatResult(epsilonTotal, 9, 'εsh,total'),
    };
  }
  if (modelId === 'gl2000') {
    // No autogenous term in GL2000: epsilonAU is an explicit 0, exactly as
    // the kernel returns it, so the matrix keeps the B4 column shape.
    const { J_GPa: JGPa, epsilonSH, epsilonAU, epsilonTotal } = gl2000Single(row);
    return {
      result_J_GPa: formatResult(JGPa, 6, 'J (1/GPa)'),
      result_epsilonSH: formatResult(epsilonSH, 9, 'εsh (Drying)'),
      result_epsilonAU: formatResult(epsilonAU, 9, 'εau (Autogenous)'),
      result_epsilonTotal: formatResult(epsilonTotal, 9, 'εsh,total'),
    };
  }
  return {};
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
  // View-only toggles stay local: unlike xKey/yKey/chartType they are not part
  // of the shared dataset, same split as the single-analysis chart.
  const [logX, setLogX] = useState(false);
  const [logY, setLogY] = useState(false);
  const model = MODELS.find((item) => item.id === activeModel);
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
    batchResults.length > 0 && batchResults.every((row) => isNumericCell(row[header]))
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
    const name = fileLabel ? { fileName: fileLabel } : {};
    if (!data?.length) {
      clearDataset(); updateBatch({ issues: parseIssues, ...name });
      setBatchError('File is empty. 请上传包含表头和数据的 CSV 或 XLSX 文件。');
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
    const nextResults = data.map((row, index) => {
      try { return { ...row, ...computeRow(modelId, row), __status:'valid' }; }
      catch (error) {
        nextIssues.push({ row:index + 2, field:'Input', value:'—', message:error.message });
        return { ...row, __status:'invalid' };
      }
    });
    // The mapping panel is answered or irrelevant by the time rows exist: leaving
    // `pendingRows`/`mapping` behind kept a panel on screen claiming this file was
    // missing columns, and its Apply button recomputed the *previous* file's rows.
    updateBatch({
      rows: nextResults,
      issues: nextIssues,
      pendingRows: [],
      mapping: [],
      xKey: inputHeaders.includes(preferredXKey) ? preferredXKey : inputHeaders[0] || '',
      yKey: target.resultKeys[0],
      ...name,
    });
    setBatchError('');
    setIsProcessing(false);
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
        complete:(result) => finish(result.data, (result.errors ?? []).map((error) => ({
          row: Number.isInteger(error.row) ? error.row + 2 : 'File',
          field: 'CSV',
          value: '—',
          message: `${error.message}${error.code ? ` (${error.code})` : ''}`,
        }))),
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
  const downloadTemplate = () => {
    const columns = model.req.split(', ');
    const csv = Papa.unparse([columns, model.template ?? columns.map(() => '0')]);
    const link=document.createElement('a'); link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); link.download=`${activeModel}_template.csv`; link.click(); URL.revokeObjectURL(link.href);
  };
  const exportCSV = () => {
    const keys=[...batchHeaders,...model.resultKeys];
    const csv=Papa.unparse(batchResults.map((row)=>Object.fromEntries(keys.map((key)=>[key,row[key]??'']))));
    const link=document.createElement('a'); link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); link.download=`${activeModel}_batch_results.csv`; link.click(); URL.revokeObjectURL(link.href);
  };

  // Points carry their matrix row so the tooltip can point back at it. Invalid
  // rows have no result cells, so they never reach the chart — the caption
  // below counts them instead of silently dropping them.
  const basePoints = batchResults.map((row, index) => ({ x: Number(row[xKey]), y: Number(row[yKey]), row: index + 1 })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const visiblePoints = (logX || logY) ? basePoints.filter((point) => (!logX || point.x > 0) && (!logY || point.y > 0)) : basePoints;
  // Line mode joins points in file order, so an unsorted X column draws a
  // meaningless zigzag — sort a copy, never the matrix order.
  const linePoints = [...visiblePoints].sort((a, b) => a.x - b.x);
  const yHasNegative = visiblePoints.some((point) => point.y < 0);
  const excludedCount = batchResults.length - basePoints.length;
  const logHiddenCount = basePoints.length - visiblePoints.length;
  const validCount=batchResults.filter((row)=>row.__status==='valid').length;
  const stage=batchResults.length ? 3 : issues.length ? 2 : 1;

  return (
    <div className="animate-fade-in">
      <header className="mb-6 border-b border-line pb-5">
        <div className="eyebrow">Batch calculation</div>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em] text-primary md:text-display-sm">Dataset pipeline</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Upload a calibrated input table, validate every row, calculate model outputs, and export a reproducible result matrix.</p>
        {/* The audit found the batch silently computing with a different kernel than
            the header badge implied. State it, and state why. */}
        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="rounded border border-line bg-surface-2 px-2 py-1 font-mono text-3xs font-semibold uppercase tracking-[.07em] text-muted">JavaScript reference kernel</span>
          <span>Every row is evaluated with the reference kernels, for all four models. The Rust kernel exposes batch entry points for ACI 209 and MC 2010 only, so using it here would compute different models with different kernels and make rows incomparable.</span>
        </p>
      </header>

      <div className="mb-5 grid grid-cols-3 overflow-hidden rounded-lg border border-line bg-surface">
        {[
          ['01', 'Upload', '上传数据'],
          ['02', 'Validate', '校验字段'],
          ['03', 'Results', '计算结果'],
        ].map(([number, label, zh], index) => (
          <div
            key={label}
            className={`border-r border-line px-4 py-3 last:border-r-0 ${stage === index + 1 ? 'bg-green-soft' : ''}`}
          >
            <div className={`font-mono text-3xs font-semibold ${stage >= index + 1 ? 'text-green' : 'text-faint'}`}>{number}</div>
            <div className="mt-1 text-xs font-semibold text-primary">{label}</div>
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
            <div className="mt-5">
              <div className="eyebrow">Required schema</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {model.req.split(', ').map((column) => (
                  <code key={column} className="rounded border border-line bg-surface-2 px-1.5 py-1 font-mono text-3xs text-muted">{column}</code>
                ))}
              </div>
            </div>
            <button onClick={downloadTemplate} className="button-secondary mt-5 w-full">Download template</button>
            {model.sampleFiles && <div className="mt-5">
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

          <div className="p-5">
            <label
              onDragOver={(event)=>event.preventDefault()} onDrop={(event)=>{event.preventDefault(); readFile(event.dataTransfer.files[0]);}}
              className="flex min-h-[205px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface-2 px-6 text-center transition-colors hover:border-green-border hover:bg-green-soft"
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-current text-green" aria-hidden="true">
                <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v5h14v-5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="mt-3 text-sm font-semibold text-primary">Drop CSV or XLSX here</span>
              <span className="mt-1 text-xs text-muted" lang="zh-CN">拖入文件，或点击选择本地数据表</span>
              <span className="mt-3 rounded-md border border-line-strong bg-surface px-3 py-1.5 font-mono text-3xs uppercase tracking-[.06em] text-muted">
                {isProcessing ? 'Processing…' : 'Choose file'}
              </span>
              <input
                type="file"
                className="hidden"
                accept=".csv,.xlsx"
                disabled={isProcessing}
                onChange={(event) => readFile(event.target.files[0])}
              />
            </label>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
              <span>{fileName || 'No dataset selected'}</span>
              <button
                onClick={loadSampleDataset}
                disabled={isProcessing}
                className="font-semibold text-green hover:underline"
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
                <span className="w-32 shrink-0 font-mono text-3xs font-semibold uppercase tracking-[.06em] text-green">{entry.field}</span>
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
            <div className="mt-1 font-mono text-xl text-primary">{batchResults.length}</div>
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
                    <th key={head} className="border-b border-line px-4 py-2 font-mono text-3xs uppercase tracking-[.08em] text-faint">{head}</th>
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
            <button onClick={exportCSV} className="button-primary !min-h-9">Export CSV</button>
          </div>
          <div className="max-h-[470px] overflow-auto">
            <table className="min-w-max w-full border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-surface-2">
                <tr>
                  <th className="sticky left-0 z-20 border-b border-r border-line bg-surface-2 px-3 py-2.5 font-mono text-3xs text-faint">#</th>
                  {batchHeaders.map((header) => (
                    <th key={header} className={`border-b border-line px-3 py-2.5 font-mono text-3xs uppercase tracking-[.05em] text-faint ${numericColumn(header) ? 'text-right' : ''}`}>{header}</th>
                  ))}
                  {model.resultKeys.map((key, index) => (
                    <th key={key} className="border-b border-line bg-green-soft px-3 py-2.5 text-right font-mono text-3xs uppercase tracking-[.05em] text-green">{model.labels[index]}</th>
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
                            onBlur={(event) => commitCell(index, header, event.target.value)}
                            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                            className="w-full min-w-16 bg-transparent font-mono text-1xs text-primary outline-none focus:bg-surface-2"
                          />
                        ) : (row[header])}
                      </td>
                    ))}
                    {model.resultKeys.map((key) => (
                      <td key={key} className="bg-green-soft/30 px-3 py-2 text-right font-mono text-1xs font-medium text-primary">{row[key] ?? '—'}</td>
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
              <div className="flex gap-1 rounded-md border border-line bg-surface-2 p-0.5">
                {['scatter', 'line'].map((type) => (
                  <button
                    key={type}
                    onClick={() => updateBatch({ chartType: type })}
                    className={`rounded px-3 py-1.5 font-mono text-3xs uppercase ${chartType === type ? 'bg-surface text-primary' : 'text-faint'}`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setLogX((value) => !value)}
                aria-pressed={logX}
                className={`button-secondary !min-h-8 !px-2.5 !text-3xs ${logX ? '!border-green-border !bg-green-soft !text-green' : ''}`}
              >
                {logX ? 'Log X' : 'Linear X'}
              </button>
              <button
                onClick={() => setLogY((value) => !value)}
                aria-pressed={logY}
                className={`button-secondary !min-h-8 !px-2.5 !text-3xs ${logY ? '!border-green-border !bg-green-soft !text-green' : ''}`}
              >
                {logY ? 'Log Y' : 'Linear Y'}
              </button>
            </div>
          </div>
          <div className="grid gap-4 border-b border-line p-4 sm:grid-cols-2">
            <div>
              <label className="eyebrow">X axis · input</label>
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
              <label className="eyebrow">Y axis · output</label>
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
            Plotting {visiblePoints.length} of {batchResults.length} rows{excludedCount > 0 ? ` · ${excludedCount} excluded (invalid or non-numeric — see red rows above)` : ''}{logHiddenCount > 0 ? ` · ${logHiddenCount} hidden by log scale (≤ 0)` : ''}
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
                    dataKey="x"
                    type="number"
                    scale={logX ? 'log' : 'linear'}
                    domain={logX ? ['dataMin', 'dataMax'] : undefined}
                    allowDataOverflow
                    tick={tickStyle}
                    minTickGap={tickGap}
                    label={{ value: xKey, position: 'insideBottomRight', offset: -14, ...axisTitleStyle }}
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
                  <Scatter data={visiblePoints} fill="var(--primary)" isAnimationActive={false} />
                  {/* No Brush here: ScatterChart ignores Brush children (only the
                      categorical charts wire it up), so one would render nothing
                      while pretending to zoom — Line mode carries the zoom UI. */}
                </ScatterChart>
              ) : (
                <LineChart data={linePoints} margin={{ top: 10, right: 20, left: 8, bottom: 28 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis
                    dataKey="x"
                    type="number"
                    scale={logX ? 'log' : 'linear'}
                    domain={logX ? ['dataMin', 'dataMax'] : undefined}
                    allowDataOverflow
                    tick={tickStyle}
                    minTickGap={tickGap}
                    label={{ value: xKey, position: 'insideBottomRight', offset: -14, ...axisTitleStyle }}
                  />
                  <YAxis
                    scale={logY ? 'log' : 'linear'}
                    domain={logY || yHasNegative ? ['auto', 'auto'] : [0, 'auto']}
                    allowDataOverflow
                    tick={tickStyle}
                    width={60}
                  />
                  <Tooltip content={<BatchTooltip xKey={xKey} yKey={yKey} />} cursor={{ stroke: 'var(--line-strong)', strokeDasharray: '3 3' }} />
                  <Line dataKey="y" stroke="var(--primary)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  {linePoints.length > 1 && (
                    <Brush data={linePoints} dataKey="x" height={20} travellerWidth={8} stroke="var(--line-strong)" tickFormatter={(value) => String(value)} />
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
