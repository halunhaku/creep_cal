import React, { useState } from 'react';
import {
  deleteParameterSet,
  loadParameterSet,
  resetModelParams,
  saveParameterSet,
  useAppSelector,
} from '../../state/appStore';
import { useT } from '../../i18n';
import CustomSelect from './CustomSelect';

/**
 * Named parameter sets for the selected model.
 *
 * The audit found no way to keep a case: parameters were re-typed to compare two
 * mixtures, and once they persist locally there was also no way back to the
 * shipped defaults. This panel is the whole of both.
 *
 * It works entirely through the store, so it needs nothing from the (lazily
 * loaded) calculators: loading a set writes the model's parameters and the
 * parameter grid re-renders from them.
 *
 * A saved set's *name* is user data, not interface wording, so it is never
 * translated — only the default name offered for an unnamed set is.
 */
export default function ParameterSets({ modelId, params }) {
  const t = useT();
  const sets = useAppSelector((state) => state.parameterSets[modelId]);
  const edited = useAppSelector((state) => Boolean(state.paramsByModel[modelId]));
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');

  const saved = Array.isArray(sets) ? sets : [];
  const chosen = selected || saved[0]?.name || '';

  const save = () => {
    const trimmed = name.trim() || t('parameterSets.defaultName', { index: saved.length + 1 });
    saveParameterSet(modelId, trimmed, params);
    setName('');
    setSelected(trimmed);
  };

  return (
    <div className="border-t border-line px-3.5 py-4">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="eyebrow">{t('parameterSets.heading')}</span>
        {edited && (
          <button onClick={() => resetModelParams(modelId)} className="touch-hit font-mono text-3xs text-faint hover:text-ink">
            {t('parameterSets.reset')}
          </button>
        )}
      </div>

      {saved.length > 0 ? (
        <div className="space-y-2">
          <CustomSelect
            name="parameter-set"
            ariaLabel={t('parameterSets.selectLabel')}
            value={chosen}
            onChange={(event) => setSelected(event.target.value)}
            options={saved.map((set) => ({ value: set.name, label: set.name }))}
          />
          <div className="flex gap-2">
            <button
              onClick={() => loadParameterSet(modelId, chosen)}
              className="button-secondary touch-hit !min-h-8 flex-1 !px-2 !text-3xs"
            >
              {t('parameterSets.load')}
            </button>
            <button
              onClick={() => { deleteParameterSet(modelId, chosen); setSelected(''); }}
              className="button-secondary touch-hit !min-h-8 flex-1 !px-2 !text-3xs"
            >
              {t('parameterSets.delete')}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-1xs leading-5 text-muted">{t('parameterSets.empty')}</p>
      )}

      <div className="mt-2 flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') save(); }}
          placeholder={t('parameterSets.namePlaceholder')}
          aria-label={t('parameterSets.nameLabel')}
          name="parameter-set-name"
          autoComplete="off"
          className="touch-target h-8 min-w-0 flex-1 rounded-input border border-line bg-surface px-2 font-mono text-1xs text-ink outline-none placeholder:text-faint focus:border-action focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
        />
        <button onClick={save} className="button-secondary touch-hit !min-h-8 !px-2.5 !text-3xs">{t('parameterSets.save')}</button>
      </div>
    </div>
  );
}
