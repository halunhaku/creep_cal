import React, { useEffect, useRef, useState } from 'react';
import CustomSelect from './CustomSelect';

function formatLimit(value, unit) {
  const suffix = unit === 'Days' ? 'd' : unit === '°C' ? '°' : unit || '';
  return `${value}${suffix}`;
}

function NumericParameterInput({ value, min, max, unit, name, onChange, step, inputId }) {
  const [draft, setDraft] = useState(String(value));
  const cancelCommitRef = useRef(false);

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commitEdit = () => {
    if (cancelCommitRef.current) {
      cancelCommitRef.current = false;
      setDraft(String(value));
      return;
    }

    const parsed = parseFloat(draft);
    if (!isNaN(parsed)) {
      const clamped = Math.min(max, Math.max(min, parsed));
      onChange({ target: { name, value: clamped } });
      setDraft(String(clamped));
    } else {
      setDraft(String(value));
    }
  };

  return (
    <div className="flex items-stretch overflow-hidden rounded border border-line-strong bg-surface-2 transition-colors focus-within:border-green-border">
      <input
        id={inputId}
        type="number"
        inputMode="decimal"
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={e => setDraft(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            cancelCommitRef.current = true;
            setDraft(String(value));
            e.currentTarget.blur();
          }
        }}
        className="h-9 w-full min-w-0 bg-transparent px-2.5 text-right font-mono text-sm text-primary outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {unit && (
        <span className="flex min-w-10 items-center justify-center border-l border-line px-2 font-mono text-[10px] uppercase tracking-[0.06em] text-faint">
          {unit === 'Days' ? 'd' : unit}
        </span>
      )}
    </div>
  );
}

function ParameterRow({ label, value, min, max, unit, name, options, onChange }) {
  const step = max > 10 ? 1 : (max <= 1 ? 0.01 : 0.1);
  const inputId = `param-input-${name}`;

  if (options) {
    return (
      <div className="px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <label htmlFor={`param-select-${name}`} className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
            {label}
          </label>
        </div>
        <CustomSelect name={name} value={value} onChange={onChange} options={options} />
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={inputId} className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          {label}
        </label>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
          {formatLimit(min, unit)} — {formatLimit(max, unit)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input
          id={`param-${name}`}
          aria-label={`${label} slider`}
          className="w-full accent-green"
          name={name}
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={onChange}
          step={step}
        />
        <NumericParameterInput
          value={value}
          min={min}
          max={max}
          unit={unit}
          step={step}
          name={name}
          onChange={onChange}
          inputId={inputId}
        />
      </div>
    </div>
  );
}

export default function DynamicParameters({ paramsConfig, params, onParamChange, onCalculate, calculateReady, buttonText }) {
  return (
    <section className="card overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px] text-green" aria-hidden="true">tune</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Parameter Set</span>
        </div>
        <span className="font-mono text-[10px] text-faint">{paramsConfig.length} inputs</span>
      </div>

      {/* Parameter rows */}
      <div className="divide-y divide-line">
        {paramsConfig.map((config) => (
          <ParameterRow
            key={config.name}
            label={config.label}
            name={config.name}
            value={params[config.name] ?? config.min}
            min={config.min}
            max={config.max}
            unit={config.unit}
            options={config.options}
            onChange={onParamChange}
          />
        ))}
      </div>

      {/* Run button */}
      <div className="border-t border-line p-3">
        <button
          onClick={onCalculate}
          disabled={!calculateReady}
          aria-busy={!calculateReady}
          className="btn-primary w-full py-3 text-xs tracking-[0.14em]"
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
          {buttonText || 'RUN CALCULATION'}
        </button>
      </div>
    </section>
  );
}
