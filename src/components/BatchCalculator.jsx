import React, { useState } from 'react';
import Papa from 'papaparse';
import readXlsxFile from 'read-excel-file/browser';
import {
  ScatterChart, Scatter, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { aci209Single, mc2010Single, b4Single, b4sSingle } from '../math/creepModels';
import CustomSelect from './ui/CustomSelect';

// ─── Model Registry ──────────────────────────────────────────────────────────
const MODELS = [
  { id: 'aci209', name: 'ACI 209R-92',  resultKeys: ['result_phi'],          labels: ['φ (Creep Coeff.)'],  req: 't0, H, VS, sphi, Cc, alpha, t' },
  { id: 'mc2010', name: 'fib MC 2010',  resultKeys: ['result_phi'],          labels: ['φ (Creep Coeff.)'],  req: 'fcm, RH, t0, Ac, u, T, Cs, t' },
  { id: 'b4',     name: 'B4 Model',     resultKeys: ['result_J', 'result_epsilonSH'], labels: ['J (1/GPa)', 'εsh (Shrinkage)'], req: 't0, tPrime, T, h, fc, vS, c, wC, aC, cementType, aggregateType, specimenShape, t' },
  { id: 'b4s',    name: 'B4S Model',    resultKeys: ['result_J', 'result_epsilonSH'], labels: ['J (1/GPa)', 'εsh (Shrinkage)'], req: 't0, tPrime, T, h, fc, vS, cementType, specimenShape, aggregateType, t' },
];

const SAMPLE_DATA = {
  aci209: [35, 90, 180, 365, 730, 1460, 3650, 7300, 10000].map(t => ({
    t0: 28, H: 70, VS: 100, sphi: 0.5, Cc: 350, alpha: 0.08, t
  })),
  mc2010: [35, 90, 180, 365, 730, 1460, 3650, 7300, 10000].map(t => ({
    fcm: 38, RH: 70, t0: 28, Ac: 90000, u: 1200, T: 20, Cs: '42.5R', t
  })),
  b4: [35, 90, 180, 365, 730, 1460, 3650, 7300, 10000].map(t => ({
    t0: 7, tPrime: 28, T: 20, h: 0.7, fc: 40, vS: 100, c: 350, wC: 0.42,
    aC: 5.8, cementType: 'R', aggregateType: 'Quartzite', specimenShape: '2', t
  })),
  b4s: [35, 90, 180, 365, 730, 1460, 3650, 7300, 10000].map(t => ({
    t0: 7, tPrime: 28, T: 20, h: 0.7, fc: 40, vS: 100,
    cementType: 'R', specimenShape: '2', aggregateType: 'Quartzite', t
  })),
};

function computeRow(modelId, row) {
  if (modelId === 'aci209') {
    const v = aci209Single(row);
    return { result_phi: isNaN(v) ? 'NaN' : v.toFixed(4) };
  }
  if (modelId === 'mc2010') {
    const v = mc2010Single(row);
    return { result_phi: isNaN(v) ? 'NaN' : v.toFixed(4) };
  }
  if (modelId === 'b4') {
    const { J, epsilonSH } = b4Single(row);
    return {
      result_J:          isNaN(J) ? 'NaN' : J.toFixed(6),
      result_epsilonSH:  isNaN(epsilonSH) ? 'NaN' : epsilonSH.toFixed(6),
    };
  }
  if (modelId === 'b4s') {
    const { J, epsilonSH } = b4sSingle(row);
    return {
      result_J:         isNaN(J) ? 'NaN' : J.toFixed(6),
      result_epsilonSH: isNaN(epsilonSH) ? 'NaN' : epsilonSH.toFixed(6),
    };
  }
  return {};
}

export default function BatchCalculator() {
  const [activeModel, setActiveModel] = useState('aci209');
  const [batchResults, setBatchResults] = useState([]);
  const [batchHeaders, setBatchHeaders] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [xKey, setXKey]           = useState('');
  const [yKey, setYKey]           = useState('result_phi');
  const [chartType, setChartType] = useState('scatter');

  const model = MODELS.find(m => m.id === activeModel);

  const handleBatchFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsProcessing(true);
    setBatchError('');
    const name = file.name.toLowerCase();
    if (name.endsWith('.csv')) {
      Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: (r) => processData(r.data),
        error: (error) => {
          setBatchError(`Could not parse CSV: ${error.message}`);
          setIsProcessing(false);
        },
      });
    } else if (name.endsWith('.xlsx')) {
      try {
        const rows = await readXlsxFile(file);
        const [headerRow, ...dataRows] = rows;
        const headers = (headerRow || []).map((value) => String(value ?? '').trim());
        if (!headers.some(Boolean)) {
          setBatchError('Excel file needs a header row.');
          setIsProcessing(false);
          return;
        }
        const records = dataRows
          .filter((row) => row.some((value) => value !== null && value !== undefined && value !== ''))
          .map((row) => Object.fromEntries(headers.map((header, index) => [header || `column_${index + 1}`, row[index] ?? ''])));
        processData(records);
      } catch (error) {
        setBatchError(`Could not parse XLSX: ${error.message}`);
        setIsProcessing(false);
      }
    } else if (name.endsWith('.xls')) {
      setBatchError('Legacy .xls files are not supported. Please save the file as .xlsx or CSV.');
      setIsProcessing(false);
    } else {
      setBatchError('Unsupported format. Use CSV or XLSX.');
      setIsProcessing(false);
    }
  };

  const processData = (data, preferredXKey = 't') => {
    if (!data?.length) {
      setBatchError('File is empty. Please upload a CSV or Excel file with column headers.');
      setIsProcessing(false);
      return;
    }
    const inputHeaders = Object.keys(data[0]);
    setBatchHeaders(inputHeaders);

    setTimeout(() => {
      const results = data.map(row => ({ ...row, ...computeRow(activeModel, row) }));
      setBatchResults(results);
      setBatchError('');
      const firstResult = model.resultKeys[0];
      setYKey(firstResult);
      setXKey(inputHeaders.includes(preferredXKey) ? preferredXKey : (inputHeaders[0] || ''));
      setIsProcessing(false);
    }, 100);
  };

  const loadSampleDataset = () => {
    setIsProcessing(true);
    setBatchError('');
    processData(SAMPLE_DATA[activeModel], 't');
  };

  const exportCSV = () => {
    if (!batchResults.length) return;
    const allKeys = [...batchHeaders, ...model.resultKeys];
    const csv = Papa.unparse(batchResults.map(r => Object.fromEntries(allKeys.map(k => [k, r[k] ?? '']))));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${activeModel}_batch_results.csv`;
    link.click();
  };

  const downloadTemplate = () => {
    const cols = model.req.split(', ');
    const csv = Papa.unparse([cols, cols.map(() => '0')]);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${activeModel}_template.csv`;
    link.click();
  };

  const chartData = batchResults
    .map(r => ({ x: parseFloat(r[xKey]), y: parseFloat(r[yKey]) }))
    .filter(d => !isNaN(d.x) && !isNaN(d.y));

  const allResultKeys = model.resultKeys;
  const greenHex = '#2f6f4e';

  return (
    <div className="max-w-content mx-auto space-y-8 animate-fade-in relative z-10">
      <header className="mb-12">
        <h1 className="font-serif text-4xl md:text-5xl font-normal tracking-tight text-primary mb-4">
          Data pipeline <span className="text-green">matrix</span>
        </h1>
        <p className="text-muted text-base md:text-lg max-w-[65ch] leading-relaxed">
          Import CSV or Excel datasets, compute model outputs in batch, then inspect and export the resulting table.
        </p>
      </header>

      {/* Config panel */}
      <div className="card p-5 md:p-8 relative overflow-hidden">
        <h3 className="font-sans text-xl font-semibold tracking-tight text-green mb-6">Pipeline configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="min-w-0">
            <label className="block text-xs font-label uppercase label-strong mb-2">Target algorithm</label>
            <CustomSelect
              name="activeModel"
              value={activeModel}
              onChange={(e) => {
                setActiveModel(e.target.value);
                setBatchResults([]);
                setBatchHeaders([]);
                setBatchError('');
                setXKey('');
                setYKey(MODELS.find(m => m.id === e.target.value)?.resultKeys[0] || '');
              }}
              options={MODELS.map(m => ({ value: m.id, label: m.name }))}
            />
          </div>
          <div>
            <label className="block text-xs font-label uppercase label-strong mb-2">Required columns</label>
            <div className="w-full bg-surface-soft border border-line/60 text-primary rounded-card px-4 py-3 font-mono text-xs break-words leading-relaxed">
              {model.req}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 items-center border-t border-line/20 pt-8 mt-4">
          <label className="btn-secondary px-6 py-3 cursor-pointer flex items-center gap-2 text-sm">
            <span className="material-symbols-outlined text-green" aria-hidden="true">upload_file</span>
            <span className="font-label tracking-[0.10em]">{isProcessing ? 'Processing file' : 'Upload CSV / XLSX'}</span>
            <input type="file" className="hidden" accept=".csv,.xlsx" onChange={handleBatchFile} disabled={isProcessing} />
          </label>
          <button onClick={downloadTemplate} className="btn-secondary px-6 py-3 flex items-center gap-2 text-sm">
            <span className="material-symbols-outlined text-sm" aria-hidden="true">download</span>
            <span className="font-label tracking-[0.10em] uppercase">Download template</span>
          </button>
          <button onClick={loadSampleDataset} disabled={isProcessing} className="btn-primary px-6 py-3 flex items-center gap-2 text-sm disabled:opacity-60">
            <span className="material-symbols-outlined text-sm" aria-hidden="true">auto_graph</span>
            <span className="font-label tracking-[0.10em] uppercase">Load sample dataset</span>
          </button>
        </div>
        {batchError && (
          <div className="mt-5 rounded-card border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
            {batchError}
          </div>
        )}
      </div>

      {/* Empty state */}
      {batchResults.length === 0 && !batchError && (
        <div className="card p-6 md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[10px] font-label uppercase tracking-[0.18em] text-green mb-2">Ready for dataset</div>
              <h3 className="font-sans text-2xl font-semibold tracking-tight text-primary">Upload a table to generate the output matrix</h3>
              <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-muted">
                Use the template for exact column names, or load the sample dataset to preview the computed table and chart immediately.
              </p>
            </div>
            <div className="grid min-w-52 grid-cols-2 gap-3 text-center">
              <div className="metric-tile rounded-card border border-line/20 bg-surface-soft p-3">
                <div className="font-mono text-lg text-green">{model.resultKeys.length}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted font-semibold">outputs</div>
              </div>
              <div className="metric-tile rounded-card border border-line/20 bg-surface-soft p-3">
                <div className="font-mono text-lg text-muted">{model.req.split(', ').length}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted font-semibold">columns</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {batchResults.length > 0 && (
        <>
          {/* Table */}
          <div className="card overflow-hidden animate-fade-in-up">
            <div className="bg-surface-soft p-4 border-b border-line/20 flex justify-between items-center flex-wrap gap-3">
              <h3 className="font-sans text-lg tracking-tight text-primary">
                Output matrix <span className="text-muted text-sm ml-2">({batchResults.length} records)</span>
              </h3>
              <button onClick={exportCSV} className="btn-primary text-[10px] py-2 px-4">
                Export CSV
              </button>
            </div>
            <div className="overflow-x-auto max-h-[400px]">
              <table className="data-table w-full text-left border-collapse min-w-max">
                <thead className="sticky top-0 bg-surface-soft shadow-sm z-10">
                  <tr>
                    {batchHeaders.map(h => (
                      <th key={h} className="px-4 py-3.5 text-xs font-label uppercase tracking-[0.11em] whitespace-nowrap">{h}</th>
                    ))}
                    {allResultKeys.map((k, i) => (
                      <th key={k} className="px-4 py-3.5 text-xs font-label uppercase tracking-[0.11em] whitespace-nowrap bg-green-soft/60 text-green-dark">
                        {model.labels[i] || k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batchResults.slice(0, 100).map((row, idx) => (
                    <tr key={idx} className="transition-colors">
                      {batchHeaders.map(h => (
                        <td key={h} className="px-4 py-3.5 font-mono text-[13px] md:text-sm">{row[h]}</td>
                      ))}
                      {allResultKeys.map(k => (
                        <td key={k} className="result-cell px-4 py-3.5 font-mono text-[13px] md:text-sm">{row[k]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {batchResults.length > 100 && (
              <div className="p-4 text-center text-faint text-xs tracking-wider uppercase bg-surface-soft/30">
                Showing 100 of {batchResults.length} records. Export to view full dataset.
              </div>
            )}
          </div>

          {/* Visualization */}
          <div className="card card-hoverable p-5 md:p-8">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <h3 className="font-sans text-xl tracking-tight text-primary">
                Result <span className="text-green italic">visualizer</span>
              </h3>
              <div className="flex gap-2 flex-wrap items-center">
                {['scatter', 'line'].map(t => (
                  <button key={t} onClick={() => setChartType(t)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-label uppercase tracking-[0.12em] border transition-all ${
                      chartType === t ? 'active-pill' : 'text-muted border-line hover:bg-green-soft/50 hover:text-primary hover:border-green-border/50'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="text-[10px] font-label uppercase label-strong block mb-2">X Axis (Input Parameter)</label>
                <CustomSelect
                  name="xKey"
                  value={xKey}
                  onChange={e => setXKey(e.target.value)}
                  options={batchHeaders.map(h => ({ value: h, label: h }))}
                />
              </div>
              <div>
                <label className="text-[10px] font-label uppercase label-strong block mb-2">Y Axis (Result)</label>
                <CustomSelect
                  name="yKey"
                  value={yKey}
                  onChange={e => setYKey(e.target.value)}
                  options={allResultKeys.map((k, i) => ({ value: k, label: model.labels[i] || k }))}
                />
              </div>
            </div>

            {chartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-faint gap-3">
                <span className="material-symbols-outlined text-5xl" aria-hidden="true">scatter_plot</span>
                <p className="font-label text-xs uppercase tracking-[0.16em]">Select numeric X column to visualize</p>
              </div>
            ) : (
              <div className="chart-stage" style={{ width: '100%', height: 380 }}>
                <ResponsiveContainer width="100%" height={380}>
                  {chartType === 'scatter' ? (
                    <ScatterChart margin={{ top: 10, right: 24, left: 18, bottom: 34 }}>
                      <CartesianGrid strokeDasharray="4 6" stroke="var(--line)" />
                      <XAxis dataKey="x" name={xKey} stroke="var(--text-faint)" tick={{ fill: 'var(--text)', fontSize: 12, fontWeight: 520 }}
                        tickCount={6} minTickGap={28}
                        label={{ value: xKey, position: 'insideBottomRight', offset: -8, fill: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }} type="number" />
                      <YAxis dataKey="y" name={yKey} stroke="var(--text-faint)" tick={{ fill: 'var(--text)', fontSize: 12, fontWeight: 520 }} width={56}
                        label={{ value: yKey, angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }} />
                      <Tooltip
                        cursor={{ stroke: 'var(--green)', strokeDasharray: '4 4', strokeOpacity: 0.32, strokeWidth: 1.5 }}
                        contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--green-border)', borderRadius: '10px', color: 'var(--text)', boxShadow: 'var(--shadow-sm)' }}
                        formatter={(v, n) => [v?.toFixed(5), n]}
                      />
                      <Scatter
                        data={chartData}
                        fill={greenHex}
                        fillOpacity={0.86}
                        stroke={greenHex}
                        strokeWidth={1.4}
                        shape={(props) => (
                          <circle
                            cx={props.cx}
                            cy={props.cy}
                            r={5}
                            fill={greenHex}
                            fillOpacity={0.90}
                            stroke="var(--surface)"
                            strokeWidth={1.6}
                          />
                        )}
                        activeShape={(props) => (
                          <circle
                            cx={props.cx}
                            cy={props.cy}
                            r={7}
                            fill={greenHex}
                            stroke="var(--surface)"
                            strokeWidth={2}
                          />
                        )}
                        isAnimationActive="auto"
                        animationDuration={900}
                        animationEasing="ease-out"
                      />
                    </ScatterChart>
                  ) : (
                    <LineChart data={chartData} margin={{ top: 10, right: 24, left: 18, bottom: 34 }}>
                      <CartesianGrid strokeDasharray="4 6" stroke="var(--line)" />
                      <XAxis dataKey="x" stroke="var(--text-faint)" tick={{ fill: 'var(--text)', fontSize: 12, fontWeight: 520 }}
                        tickCount={6} minTickGap={28}
                        label={{ value: xKey, position: 'insideBottomRight', offset: -8, fill: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }} />
                      <YAxis stroke="var(--text-faint)" tick={{ fill: 'var(--text)', fontSize: 12, fontWeight: 520 }} width={56}
                        label={{ value: yKey, angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 11, fontWeight: 650 }} />
                      <Tooltip
                        cursor={{ stroke: 'var(--green)', strokeOpacity: 0.26, strokeWidth: 1.5 }}
                        contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--green-border)', borderRadius: '10px', color: 'var(--text)', boxShadow: 'var(--shadow-sm)' }}
                        formatter={(v) => [v?.toFixed(5), yKey]}
                      />
                      <Line
                        type="monotone"
                        dataKey="y"
                        stroke={greenHex}
                        strokeWidth={2.6}
                        dot={false}
                        activeDot={{ r: 6, stroke: greenHex, strokeWidth: 2.5, fill: 'var(--surface)' }}
                        isAnimationActive="auto"
                        animationDuration={1200}
                        animationEasing="ease-out"
                      />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
