import React, { useState } from 'react';
import Papa from 'papaparse';
// read-excel-file v9 changed the default export to return `[{ sheet, data }]`.
// `readSheet()` is the API that still returns plain rows for a single sheet.
import { readSheet } from 'read-excel-file/browser';
import {
  ScatterChart, Scatter, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { aci209Single, mc2010Single, b4Single, b4sSingle } from '../math/creepModels';
import CustomSelect from './ui/CustomSelect';
import { MODELS } from './batchModels';


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
};

// A row is only "valid" when every output is a finite number. Silently writing
// the literal string "NaN" into the result matrix hides broken input rows.
function formatResult(value, digits, label) {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} could not be evaluated from these inputs · 输入无法产生有效结果`);
  }
  return value.toFixed(digits);
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
  return {};
}

export default function BatchCalculator() {
  const [activeModel, setActiveModel] = useState('b4');
  const [batchResults, setBatchResults] = useState([]);
  const [batchHeaders, setBatchHeaders] = useState([]);
  const [issues, setIssues] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [fileName, setFileName] = useState('');
  const [xKey, setXKey] = useState('');
  const [yKey, setYKey] = useState('result_J_GPa');
  const [chartType, setChartType] = useState('scatter');
  const model = MODELS.find((item) => item.id === activeModel);

  // Every failure path must clear the previous dataset, otherwise stale results
  // stay on screen under the new file name.
  const clearDataset = () => { setBatchResults([]); setBatchHeaders([]); };

  const processData = (data, preferredXKey = 't', parseIssues = []) => {
    if (!data?.length) {
      clearDataset(); setIssues(parseIssues);
      setBatchError('File is empty. 请上传包含表头和数据的 CSV 或 XLSX 文件。');
      setIsProcessing(false); return;
    }
    const inputHeaders = Object.keys(data[0]);
    const required = model.req.split(', ');
    const missing = required.filter((key) => !inputHeaders.includes(key));
    setBatchHeaders(inputHeaders);
    if (missing.length) {
      setBatchResults([]);
      setIssues([...parseIssues, ...missing.map((field) => ({ row:'Header', field, value:'—', message:'Required column is missing · 缺少必填列' }))]);
      setBatchError(`Missing required columns: ${missing.join(', ')}`);
      setIsProcessing(false);
      return;
    }

    const nextIssues = [...parseIssues];
    const nextResults = data.map((row, index) => {
      try { return { ...row, ...computeRow(activeModel, row), __status:'valid' }; }
      catch (error) {
        nextIssues.push({ row:index + 2, field:'Input', value:'—', message:error.message });
        return { ...row, __status:'invalid' };
      }
    });
    setBatchResults(nextResults);
    setIssues(nextIssues);
    setBatchError('');
    setXKey(inputHeaders.includes(preferredXKey) ? preferredXKey : inputHeaders[0] || '');
    setYKey(model.resultKeys[0]);
    setIsProcessing(false);
  };

  const readFile = async (file) => {
    if (!file) return;
    setFileName(file.name); setIsProcessing(true); setBatchError(''); setIssues([]); clearDataset();
    const name = file.name.toLowerCase();
    if (name.endsWith('.csv')) {
      Papa.parse(file, {
        header:true,
        skipEmptyLines:true,
        complete:(result) => processData(result.data, 't', (result.errors ?? []).map((error) => ({
          row: Number.isInteger(error.row) ? error.row + 2 : 'File',
          field: 'CSV',
          value: '—',
          message: `${error.message}${error.code ? ` (${error.code})` : ''}`,
        }))),
        error:(error) => { setBatchError(`Could not parse CSV: ${error.message}`); setIsProcessing(false); },
      });
      return;
    }
    if (name.endsWith('.xlsx')) {
      try {
        const rows = await readSheet(file);
        const [headerRow, ...dataRows] = rows;
        const headers = (headerRow || []).map((value) => String(value ?? '').trim());
        const records = dataRows
          .filter((row) => Array.isArray(row) && row.some((value) => value !== null && value !== undefined && value !== ''))
          .map((row) => Object.fromEntries(headers.map((header, index) => [header || `column_${index + 1}`, row[index] ?? ''])));
        processData(records);
      } catch (error) { setBatchError(`Could not parse XLSX: ${error.message}`); setIsProcessing(false); }
      return;
    }
    setBatchError('Unsupported format. Use CSV or XLSX.'); setIsProcessing(false);
  };

  const resetForModel = (id) => {
    setActiveModel(id); setBatchResults([]); setBatchHeaders([]); setIssues([]); setBatchError(''); setFileName(''); setXKey('');
    setYKey(MODELS.find((item) => item.id === id)?.resultKeys[0] || '');
  };

  const loadSampleDataset = () => { setFileName(`${activeModel}_demo_sweep.csv`); setIsProcessing(true); processData(SAMPLE_DATA[activeModel], 't'); };
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

  const chartData = batchResults.map((row)=>({x:Number(row[xKey]),y:Number(row[yKey])})).filter((point)=>Number.isFinite(point.x)&&Number.isFinite(point.y));
  const validCount=batchResults.filter((row)=>row.__status==='valid').length;
  const stage=batchResults.length ? 3 : issues.length ? 2 : 1;

  return (
    <div className="animate-fade-in">
      <header className="mb-6 border-b border-line pb-5">
        <div className="eyebrow">Batch calculation</div>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em] text-primary md:text-[28px]">Dataset pipeline</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Upload a calibrated input table, validate every row, calculate model outputs, and export a reproducible result matrix.</p>
      </header>

      <div className="mb-5 grid grid-cols-3 overflow-hidden rounded-lg border border-line bg-surface">
        {[['01','Upload','上传数据'],['02','Validate','校验字段'],['03','Results','计算结果']].map(([number,label,zh],index)=><div key={label} className={`border-r border-line px-4 py-3 last:border-r-0 ${stage===index+1?'bg-green-soft':''}`}><div className={`font-mono text-[9px] font-semibold ${stage>=index+1?'text-green':'text-faint'}`}>{number}</div><div className="mt-1 text-xs font-semibold text-primary">{label}</div><div className="text-[10px] text-muted">{zh}</div></div>)}
      </div>

      <section className="workbench-panel overflow-hidden">
        <div className="grid lg:grid-cols-[300px_1fr]">
          <div className="border-b border-line p-5 lg:border-b-0 lg:border-r">
            <label className="eyebrow" htmlFor="batch-model">Prediction model</label>
            <div className="mt-2"><CustomSelect id="batch-model" name="activeModel" value={activeModel} onChange={(event)=>resetForModel(event.target.value)} options={MODELS.map((item)=>({value:item.id,label:item.name}))}/></div>
            <div className="mt-5"><div className="eyebrow">Required schema</div><div className="mt-2 flex flex-wrap gap-1.5">{model.req.split(', ').map((column)=><code key={column} className="rounded border border-line bg-surface-2 px-1.5 py-1 font-mono text-[9px] text-muted">{column}</code>)}</div></div>
            <button onClick={downloadTemplate} className="button-secondary mt-5 w-full">Download template</button>
            {model.sampleFiles && <div className="mt-5">
              <div className="eyebrow">Shipped samples · 官方示例</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {model.sampleFiles.map((file) => <a key={file} href={encodeURI(`/模型示例/${file}`)} download className="button-secondary !min-h-8 !px-2.5 !text-[9px]">{file.endsWith('.csv') ? 'CSV' : 'XLSX'}</a>)}
              </div>
            </div>}
          </div>

          <div className="p-5">
            <label
              onDragOver={(event)=>event.preventDefault()} onDrop={(event)=>{event.preventDefault(); readFile(event.dataTransfer.files[0]);}}
              className="flex min-h-[205px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface-2 px-6 text-center transition-colors hover:border-green-border hover:bg-green-soft"
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-current text-green" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v5h14v-5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span className="mt-3 text-sm font-semibold text-primary">Drop CSV or XLSX here</span>
              <span className="mt-1 text-xs text-muted">拖入文件，或点击选择本地数据表</span>
              <span className="mt-3 rounded-md border border-line-strong bg-surface px-3 py-1.5 font-mono text-[9px] uppercase tracking-[.06em] text-muted">{isProcessing?'Processing…':'Choose file'}</span>
              <input type="file" className="hidden" accept=".csv,.xlsx" disabled={isProcessing} onChange={(event)=>readFile(event.target.files[0])}/>
            </label>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted"><span>{fileName || 'No dataset selected'}</span><button onClick={loadSampleDataset} disabled={isProcessing} className="font-semibold text-green hover:underline">Load demo sweep</button></div>
          </div>
        </div>
      </section>

      {(batchError || issues.length>0 || batchResults.length>0) && <section className="mt-5 workbench-panel overflow-hidden">
        <div className="grid grid-cols-3 border-b border-line bg-surface-2">
          <div className="p-4"><div className="eyebrow">Rows detected</div><div className="mt-1 font-mono text-xl text-primary">{batchResults.length}</div></div>
          <div className="border-x border-line p-4"><div className="eyebrow">Valid</div><div className="mt-1 font-mono text-xl text-[var(--success)]">{validCount}</div></div>
          <div className="p-4"><div className="eyebrow">Issues</div><div className="mt-1 font-mono text-xl text-error">{issues.length}</div></div>
        </div>
        {batchError && <div className="border-b border-line bg-[var(--error-soft)] px-4 py-3 text-xs text-error">{batchError}</div>}
        {issues.length>0 && <div className="max-h-56 overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-surface"><tr>{['Row','Field','Value','Issue'].map((head)=><th key={head} className="border-b border-line px-4 py-2 font-mono text-[9px] uppercase tracking-[.08em] text-faint">{head}</th>)}</tr></thead><tbody className="divide-y divide-line">{issues.slice(0,100).map((issue,index)=><tr key={index}><td className="px-4 py-2 font-mono">{issue.row}</td><td className="px-4 py-2 font-mono">{issue.field}</td><td className="px-4 py-2 font-mono">{issue.value}</td><td className="px-4 py-2 text-error">{issue.message}</td></tr>)}</tbody></table></div>}
      </section>}

      {batchResults.length>0 && <>
        <section className="mt-5 workbench-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3"><div><div className="eyebrow">Result matrix</div><div className="mt-1 text-xs text-muted">{batchResults.length} rows · {model.resultKeys.length} output fields{batchResults.length > 100 ? ` · 表格显示前 100 行，导出包含全部 ${batchResults.length} 行` : ''}</div></div><button onClick={exportCSV} className="button-primary !min-h-9">Export CSV</button></div>
          <div className="max-h-[470px] overflow-auto"><table className="min-w-max w-full border-collapse text-left"><thead className="sticky top-0 z-10 bg-surface-2"><tr><th className="sticky left-0 z-20 border-b border-r border-line bg-surface-2 px-3 py-2.5 font-mono text-[9px] text-faint">#</th>{batchHeaders.map((header)=><th key={header} className="border-b border-line px-3 py-2.5 font-mono text-[9px] uppercase tracking-[.05em] text-faint">{header}</th>)}{model.resultKeys.map((key,index)=><th key={key} className="border-b border-line bg-green-soft px-3 py-2.5 font-mono text-[9px] uppercase tracking-[.05em] text-green">{model.labels[index]}</th>)}</tr></thead><tbody className="divide-y divide-line">{batchResults.slice(0,100).map((row,index)=><tr key={index} className={row.__status==='invalid'?'bg-[var(--error-soft)]':''}><td className="sticky left-0 border-r border-line bg-surface px-3 py-2 font-mono text-[10px] text-faint">{index+1}</td>{batchHeaders.map((header)=><td key={header} className="px-3 py-2 font-mono text-[11px] text-muted">{row[header]}</td>)}{model.resultKeys.map((key)=><td key={key} className="bg-green-soft/30 px-3 py-2 font-mono text-[11px] font-medium text-primary">{row[key]??'—'}</td>)}</tr>)}</tbody></table></div>
        </section>

        <section className="mt-5 workbench-panel overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-end md:justify-between"><div><div className="eyebrow">Result visualizer</div><div className="mt-1 text-xs text-muted">选择输入列与结果列进行快速关系检查</div></div><div className="flex gap-1 rounded-md border border-line bg-surface-2 p-0.5">{['scatter','line'].map((type)=><button key={type} onClick={()=>setChartType(type)} className={`rounded px-3 py-1.5 font-mono text-[9px] uppercase ${chartType===type?'bg-surface text-primary':'text-faint'}`}>{type}</button>)}</div></div>
          <div className="grid gap-4 border-b border-line p-4 sm:grid-cols-2"><div><label className="eyebrow">X axis · input</label><div className="mt-2"><CustomSelect name="xKey" value={xKey} onChange={(event)=>setXKey(event.target.value)} options={batchHeaders.map((key)=>({value:key,label:key}))}/></div></div><div><label className="eyebrow">Y axis · output</label><div className="mt-2"><CustomSelect name="yKey" value={yKey} onChange={(event)=>setYKey(event.target.value)} options={model.resultKeys.map((key,index)=>({value:key,label:model.labels[index]}))}/></div></div></div>
          <div className="h-[380px] p-4"><ResponsiveContainer width="100%" height="100%">{chartType==='scatter'?<ScatterChart margin={{top:10,right:20,left:8,bottom:28}}><CartesianGrid stroke="var(--chart-grid)" vertical={false}/><XAxis dataKey="x" type="number" tick={{fontSize:10}} label={{value:xKey,position:'insideBottomRight',offset:-14,fill:'var(--text-faint)',fontSize:9}}/><YAxis dataKey="y" tick={{fontSize:10}} width={60}/><Tooltip contentStyle={{background:'var(--surface)',border:'1px solid var(--line-strong)',borderRadius:6}}/><Scatter data={chartData} fill="var(--primary)" isAnimationActive={false}/></ScatterChart>:<LineChart data={chartData} margin={{top:10,right:20,left:8,bottom:28}}><CartesianGrid stroke="var(--chart-grid)" vertical={false}/><XAxis dataKey="x" tick={{fontSize:10}} label={{value:xKey,position:'insideBottomRight',offset:-14,fill:'var(--text-faint)',fontSize:9}}/><YAxis tick={{fontSize:10}} width={60}/><Tooltip contentStyle={{background:'var(--surface)',border:'1px solid var(--line-strong)',borderRadius:6}}/><Line dataKey="y" stroke="var(--primary)" strokeWidth={2} dot={false} isAnimationActive={false}/></LineChart>}</ResponsiveContainer></div>
        </section>
      </>}
    </div>
  );
}
