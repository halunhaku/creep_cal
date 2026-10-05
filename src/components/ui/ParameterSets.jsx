import React, { useState } from 'react';
import {
  deleteParameterSet,
  loadParameterSet,
  resetModelParams,
  saveParameterSet,
  useAppSelector,
} from '../../state/appStore';
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
 */
export default function ParameterSets({ modelId, params }) {
  const sets = useAppSelector((state) => state.parameterSets[modelId]);
  const edited = useAppSelector((state) => Boolean(state.paramsByModel[modelId]));
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');

  const saved = Array.isArray(sets) ? sets : [];
  const chosen = selected || saved[0]?.name || '';

  const save = () => {
    const trimmed = name.trim() || `Set ${saved.length + 1}`;
    saveParameterSet(modelId, trimmed, params);
    setName('');
    setSelected(trimmed);
  };

  return (
    <div className="border-t border-line px-3.5 py-4">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="eyebrow">Parameter sets</span>
        {edited && (
          <button onClick={() => resetModelParams(modelId)} className="font-mono text-3xs uppercase tracking-[.06em] text-faint hover:text-primary">
            Reset
          </button>
        )}
      </div>

      {saved.length > 0 ? (
        <div className="space-y-2">
          <CustomSelect
            name="parameter-set"
            ariaLabel="Saved parameter set"
            value={chosen}
            onChange={(event) => setSelected(event.target.value)}
            options={saved.map((set) => ({ value: set.name, label: set.name }))}
          />
          <div className="flex gap-2">
            <button
              onClick={() => loadParameterSet(modelId, chosen)}
              className="button-secondary !min-h-8 flex-1 !px-2 !text-3xs"
            >
              Load
            </button>
            <button
              onClick={() => { deleteParameterSet(modelId, chosen); setSelected(''); }}
              className="button-secondary !min-h-8 flex-1 !px-2 !text-3xs"
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <p className="text-1xs leading-5 text-muted">No saved sets for this model yet. Name the current parameters to keep a case.</p>
      )}

      <div className="mt-2 flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') save(); }}
          placeholder="Set name"
          aria-label="New parameter set name"
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 font-mono text-1xs text-primary outline-none placeholder:text-faint focus:border-line-strong"
        />
        <button onClick={save} className="button-secondary !min-h-8 !px-2.5 !text-3xs">Save</button>
      </div>
    </div>
  );
}
