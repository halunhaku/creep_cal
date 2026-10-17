import ParameterSets from './ParameterSets';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import CustomSelect from './CustomSelect';
import { usePick, useT } from '../../i18n';

/**
 * The grid's sections. Only the heading moves to the catalogue; which section a
 * parameter belongs to is a fact about the parameter and stays in `groupFor` below.
 */
const GROUPS = [
  { id: 'time', labelKey: 'parameters.group.time' },
  { id: 'temperature', labelKey: 'parameters.group.temperature' },
  { id: 'environment', labelKey: 'parameters.group.environment' },
  { id: 'geometry', labelKey: 'parameters.group.geometry' },
  { id: 'material', labelKey: 'parameters.group.material' },
  { id: 'admixtures', labelKey: 'parameters.group.admixtures' },
];

/**
 * The symbol column.
 *
 * These are notation, not wording: `V/S`, `w/c` and `σ` are the same in a Chinese
 * or an English report, and the Chinese model notes use them unchanged.
 */
const SYMBOLS = { t0:'t₀', tPrime:'t′', targetAge:'t', ti:'ti', tc:'tc', T:'T', Tcur:'Tcur', Tsh:'Tsh', Tc:'Tc', H:'H', RH:'RH', h:'h', VS:'V/S', vS:'V/S', vs:'V/S', Ac:'Ac', u:'u', fc:'fc', fcm:'fcm', fcm28:'fcm28', fci:'fci', c:'c', wC:'w/c', aC:'a/c', sigma:'σ' };
const ADMIXTURES = new Set(['retarder','flyAsh','superplasticizer','silicaFume','airEntrainingAgent','waterReducer']);

function groupFor(name) {
  if (['t0','tPrime','targetAge','ti','tc'].includes(name)) return 'time';
  if (['T','Tcur','Tsh','Tc'].includes(name)) return 'temperature';
  if (['H','RH','h'].includes(name)) return 'environment';
  if (['VS','vS','vs','Ac','u','specimenShape'].includes(name)) return 'geometry';
  if (ADMIXTURES.has(name)) return 'admixtures';
  return 'material';
}

function NumericInput({ config, value, onChange }) {
  const t = useT();
  const { name, min, max } = config;
  // `Days` is a sentinel in the model configs, not a unit symbol: it has a word for
  // it in both languages, unlike mm, MPa, °C and %, which are written the same way.
  const unit = config.unit === 'Days' ? t('calculator.units.days') : config.unit;
  const step = config.step ?? (max > 10 ? 1 : max <= 1 ? 0.01 : 0.1);
  const [draft, setDraft] = useState(String(value));
  const cancelRef = useRef(false);
  const invalid = !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max;

  useEffect(() => {
    // Not while the field is focused: the user is mid-edit, and rewriting the box
    // under them would move the caret.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- controlled draft sync
    if (document.activeElement?.id !== `param-input-${name}`) setDraft(String(value));
  }, [name, value]);

  // Restored to the shipped behaviour: an emptied box commits `Number('')` = 0 and
  // lets the out-of-range panel report it, rather than reverting the edit under the
  // reader. `ModelCalculator.test.jsx` pins that deliberately.
  const commit = () => {
    if (cancelRef.current) {
      cancelRef.current = false;
      setDraft(String(value));
      return;
    }
    const parsed = Number(draft);
    // Event-shaped, like the <select> path above it: DynamicParameters' caller reads
    // `event.target.name` / `.value`, so both controls must speak that one protocol.
    if (Number.isFinite(parsed)) onChange({ target: { name, value: parsed } });
    else setDraft(String(value));
  };

  const range = { min: config.min, max: config.max, unit: unit ? ` ${unit}` : '' };

  return (
    <>
      <div className={`field-control flex overflow-hidden ${invalid ? '!border-error' : ''}`}>
        <input
          id={`param-input-${name}`} type="number" inputMode="decimal" autoComplete="off" value={draft} min={min} max={max} step={step}
          onChange={(event) => setDraft(event.target.value)} onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') { cancelRef.current = true; setDraft(String(value)); event.currentTarget.blur(); }
          }}
          className="h-10 min-w-0 flex-1 border-0 bg-transparent px-3 font-mono text-body-sm font-medium text-ink outline-none focus:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        {config.unit && (
          <span className="flex min-w-[54px] items-center justify-center border-l border-line bg-surface-2 px-2 font-mono text-3xs font-semibold text-muted">
            {unit}
          </span>
        )}
      </div>
      <div className={`mt-1.5 font-mono text-3xs ${invalid ? 'text-error' : 'text-faint'}`}>
        {invalid
          ? t('parameters.outOfRange', { min, max })
          : t('parameters.recommended', { ...range, unit: unit ? range.unit : '' })}
      </div>
    </>
  );
}

function ParameterField({ config, value, onChange }) {
  const pick = usePick();
  const label = pick(config.label);
  return (
    <div className="py-3 first:pt-1">
      <div className="mb-2 flex items-start justify-between gap-3">
        <label htmlFor={config.options ? `param-select-${config.name}` : `param-input-${config.name}`} className="min-w-0">
          <span className="block text-body-sm font-semibold leading-tight text-ink">{label}</span>
        </label>
        {SYMBOLS[config.name] && <span className="shrink-0 font-mono text-2xs italic text-faint">{SYMBOLS[config.name]}</span>}
      </div>
      {config.options
        ? <CustomSelect id={`param-select-${config.name}`} name={config.name} value={value} onChange={onChange} options={config.options.map((option) => ({ ...option, label: pick(option.label) }))} />
        : <NumericInput config={config} value={value} onChange={onChange} />}
    </div>
  );
}

export default function DynamicParameters({ modelId, paramsConfig, params, onParamChange, onCalculate, buttonText, dirty, inputIssue }) {
  const t = useT();
  const pick = usePick();
  const grouped = useMemo(
    () => GROUPS
      .map((group) => ({ ...group, items: paramsConfig.filter((item) => groupFor(item.name) === group.id) }))
      .filter((group) => group.items.length),
    [paramsConfig],
  );
  const activeAdmixtures = paramsConfig.filter((item) => ADMIXTURES.has(item.name) && Number(params[item.name]) !== 0).length;
  const isInvalid = (item) => !item.options && (
    !Number.isFinite(Number(params[item.name]))
    || Number(params[item.name]) < item.min
    || Number(params[item.name]) > item.max
  );
  const invalid = paramsConfig.filter(isInvalid);
  const invalidCount = invalid.length;

  /**
   * The button used to be disabled while anything was invalid, and a disabled
   * button cannot be focused: a keyboard user could not reach it to find out why
   * nothing happened, and nothing moved them to the field at fault. It now stays
   * enabled, says what is wrong, and puts the cursor in the first bad field.
   *
   * `inputIssue` is the model's cross-field rule (e.g. MC2010's |σ| ≤ 0.6·fcm):
   * the field's own range is satisfied, so the field grid cannot report it.
   */
  const handleCalculate = () => {
    const firstBad = invalid[0]?.name ?? inputIssue?.field;
    if (firstBad) {
      document.getElementById(`param-input-${firstBad}`)?.focus();
      return;
    }
    onCalculate();
  };

  return (
    <section className="workbench-panel overflow-hidden">
      <div className="border-b border-line px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="eyebrow">{t('parameters.eyebrow')}</div>
            <div className="mt-1 text-xs text-muted">{t('parameters.checked')}</div>
          </div>
          <span className="font-mono text-2xs text-faint">{t('parameters.count', { count: paramsConfig.length })}</span>
        </div>
        {/* Above the grid, not below it: saving and loading a case is how you get
            back to one, and below twenty fields it would only be found by scrolling. */}
        <ParameterSets modelId={modelId} params={params} />
      </div>
      <div className="px-4">
        {grouped.map((group, index) => {
          const heading = (
            <span className="eyebrow">{String(index + 1).padStart(2, '0')} · {t(group.labelKey)}</span>
          );
          const content = (
            <div className="divide-y divide-line">
              {group.items.map((item) => (
                <ParameterField
                  key={item.name}
                  config={item}
                  value={params[item.name] ?? item.min}
                  onChange={onParamChange}
                />
              ))}
            </div>
          );
          if (group.id === 'admixtures') return (
            <details key={group.id} className="border-t border-line py-1" open={activeAdmixtures > 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between py-3.5">
                <span>{heading}</span>
                <span className="font-mono text-3xs text-faint">{t('parameters.active', { count: activeAdmixtures })}</span>
              </summary>
              {content}
            </details>
          );
          return (
            <section key={group.id} className={index ? 'border-t border-line py-4' : 'py-4'}>
              <div className="mb-3">{heading}</div>
              {content}
            </section>
          );
        })}
      </div>
      <div className="sticky bottom-0 border-t border-line bg-surface p-3.5">
        {dirty && (
          <div className="mb-2.5 flex items-center gap-2 rounded-none bg-[var(--warning-soft)] px-3 py-2 text-1xs text-[var(--warning)]">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {t('parameters.changed')} · {t('parameters.stale')}
          </div>
        )}
        {inputIssue && (
          <div className="mb-2.5 flex items-center gap-2 rounded-none bg-[var(--warning-soft)] px-3 py-2 text-1xs text-[var(--warning)]">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {pick(inputIssue.message)}
          </div>
        )}
        <button onClick={handleCalculate} className="button-primary w-full">
          {invalidCount > 0
            ? t('parameters.requireAttention', { count: invalidCount })
            : inputIssue ? t('parameters.outOfRangeButton') : buttonText}
          <span className="ml-auto font-mono text-3xs opacity-70">⌘↵</span>
        </button>
      </div>
    </section>
  );
}
