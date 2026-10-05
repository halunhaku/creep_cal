import ParameterSets from './ParameterSets';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import CustomSelect from './CustomSelect';
import Lang from './Lang';

const GROUPS = [
  { id: 'time', label: 'Time', zh: '时间参数' },
  { id: 'temperature', label: 'Temperature', zh: '温度历程' },
  { id: 'environment', label: 'Environment', zh: '环境条件' },
  { id: 'geometry', label: 'Geometry', zh: '构件几何' },
  { id: 'material', label: 'Material', zh: '材料参数' },
  { id: 'admixtures', label: 'Admixtures', zh: '外加剂修正' },
];

const ZH = {
  t0: '开始干燥或加载龄期', tPrime: '施加持续荷载的龄期', targetAge: '读取结果的目标龄期',
  T: '恒定养护温度', Tcur: '养护阶段平均温度', Tsh: '干燥阶段平均温度', Tc: '受荷后平均温度',
  H: '环境相对湿度', RH: '环境相对湿度', h: '环境相对湿度',
  VS: '体积与暴露表面积比', vS: '体积与暴露表面积比', Ac: '构件横截面积', u: '暴露于干燥的周长', specimenShape: '用于收缩半时的形状系数',
  fc: '28 天圆柱体平均抗压强度', fcm: '28 天平均抗压强度', c: '单位体积水泥用量', wC: '水与水泥质量比', aC: '骨料与水泥质量比',
  cementType: '水泥水化活性类别', aggregateType: '骨料种类修正', Cs: '水泥强度与早期强度等级', sigma: '加载时混凝土初始应力', curingType: '混凝土养护方式',
  slump: '新拌混凝土坍落度', fineAggregate: '细骨料占总骨料比例', airContent: '混凝土含气量',
  retarder: '占水泥质量百分比', flyAsh: '占水泥质量百分比', superplasticizer: '占水泥质量百分比', silicaFume: '占水泥质量百分比', airEntrainingAgent: '占水泥质量百分比', waterReducer: '占水泥质量百分比',
};

const SYMBOLS = { t0:'t₀', tPrime:'t′', targetAge:'t', T:'T', Tcur:'Tcur', Tsh:'Tsh', Tc:'Tc', H:'H', RH:'RH', h:'h', VS:'V/S', vS:'V/S', Ac:'Ac', u:'u', fc:'fc', fcm:'fcm', c:'c', wC:'w/c', aC:'a/c', sigma:'σ' };
const ADMIXTURES = new Set(['retarder','flyAsh','superplasticizer','silicaFume','airEntrainingAgent','waterReducer']);

function groupFor(name) {
  if (['t0','tPrime','targetAge'].includes(name)) return 'time';
  if (['T','Tcur','Tsh','Tc'].includes(name)) return 'temperature';
  if (['H','RH','h'].includes(name)) return 'environment';
  if (['VS','vS','Ac','u','specimenShape'].includes(name)) return 'geometry';
  if (ADMIXTURES.has(name)) return 'admixtures';
  return 'material';
}

function NumericInput({ config, value, onChange }) {
  const { name, min, max, unit } = config;
  const step = config.step ?? (max > 10 ? 1 : max <= 1 ? 0.01 : 0.1);
  const [draft, setDraft] = useState(String(value));
  const cancelRef = useRef(false);
  const invalid = !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max;

  // Re-sync the editable draft when the committed value changes from outside this
  // field (blur commit, Escape, engine switch). The input must stay controlled.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- controlled draft sync
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    if (cancelRef.current) { cancelRef.current = false; setDraft(String(value)); return; }
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) onChange({ target: { name, value: parsed } });
    else setDraft(String(value));
  };

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
          className="h-10 min-w-0 flex-1 border-0 bg-transparent px-3 font-mono text-body-sm font-medium text-primary outline-none focus:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        {unit && (
          <span className="flex min-w-[54px] items-center justify-center border-l border-line bg-surface-2 px-2 font-mono text-3xs font-semibold uppercase tracking-[0.05em] text-muted">
            {unit === 'Days' ? 'days' : unit}
          </span>
        )}
      </div>
      <div className={`mt-1.5 font-mono text-3xs ${invalid ? 'text-error' : 'text-faint'}`}>
        <Lang text={invalid ? `Outside calibrated range · 超出推荐范围 ${min}–${max}` : `Recommended ${min}–${max}${unit ? ` ${unit}` : ''}`} />
      </div>
    </>
  );
}

function ParameterField({ config, value, onChange }) {
  return (
    <div className="py-3 first:pt-1">
      <div className="mb-2 flex items-start justify-between gap-3">
        <label htmlFor={config.options ? `param-select-${config.name}` : `param-input-${config.name}`} className="min-w-0">
          <span className="block text-body-sm font-semibold leading-tight text-primary">{config.label}</span>
          <span className="mt-1 block text-1xs leading-tight text-muted"><Lang text={ZH[config.name] || '模型输入参数'} /></span>
        </label>
        {SYMBOLS[config.name] && <span className="shrink-0 font-mono text-2xs italic text-faint">{SYMBOLS[config.name]}</span>}
      </div>
      {config.options
        ? <CustomSelect id={`param-select-${config.name}`} name={config.name} value={value} onChange={onChange} options={config.options} />
        : <NumericInput config={config} value={value} onChange={onChange} />}
    </div>
  );
}

export default function DynamicParameters({ modelId, paramsConfig, params, onParamChange, onCalculate, buttonText, dirty, inputIssue }) {
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
            <div className="eyebrow">Input parameters</div>
            <div className="mt-1 text-xs text-muted" lang="zh-CN">参数将在计算前进行范围校验</div>
          </div>
          <span className="font-mono text-2xs text-faint">{paramsConfig.length} inputs</span>
        </div>
        {/* Above the grid, not below it: saving and loading a case is how you get
            back to one, and below twenty fields it would only be found by scrolling. */}
        <ParameterSets modelId={modelId} params={params} />
      </div>
      <div className="px-4">
        {grouped.map((group, index) => {
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
                <span>
                  <span className="eyebrow">{String(index + 1).padStart(2, '0')} · {group.label}</span>
                  <span className="ml-2 text-1xs text-muted"><Lang text={group.zh} /></span>
                </span>
                <span className="font-mono text-3xs text-faint">{activeAdmixtures} active</span>
              </summary>
              {content}
            </details>
          );
          return (
            <section key={group.id} className={index ? 'border-t border-line py-4' : 'py-4'}>
              <div className="mb-3">
                <span className="eyebrow">{String(index + 1).padStart(2, '0')} · {group.label}</span>
                <span className="ml-2 text-1xs text-muted"><Lang text={group.zh} /></span>
              </div>
              {content}
            </section>
          );
        })}
      </div>
      <div className="sticky bottom-0 border-t border-line bg-surface p-3.5">
        {dirty && (
          <div className="mb-2.5 flex items-center gap-2 rounded-md bg-[var(--warning-soft)] px-3 py-2 text-1xs text-[var(--warning)]">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Inputs changed · <span lang="zh-CN">当前结果待更新</span>
          </div>
        )}
        {inputIssue && (
          <div className="mb-2.5 flex items-center gap-2 rounded-md bg-[var(--warning-soft)] px-3 py-2 text-1xs text-[var(--warning)]">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            <Lang text={inputIssue.message} />
          </div>
        )}
        <button onClick={handleCalculate} className="button-primary w-full">
          {invalidCount > 0
            ? `${invalidCount} inputs require attention`
            : inputIssue ? 'Inputs out of range' : buttonText}
          <span className="ml-auto font-mono text-3xs opacity-70">⌘↵</span>
        </button>
      </div>
    </section>
  );
}
