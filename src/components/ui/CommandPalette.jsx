import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getState,
  loadParameterSet,
  setEngine,
  setMode,
  setModel,
  useAppSelector,
} from '../../state/appStore';

const MODELS = [
  { id: 'aci209', name: 'ACI 209R-92' },
  { id: 'mc2010', name: 'fib Model Code 2010' },
  { id: 'b4', name: 'RILEM Model B4' },
  { id: 'b4s', name: 'RILEM Model B4s' },
];

/**
 * The global entry point the audit asked for.
 *
 * Every destination in the app was reachable only by first finding the right
 * workspace, then the right control inside it. The palette makes the whole app
 * addressable from anywhere: workspaces, models, kernels, saved parameter sets,
 * the reference library's sections, and the theme.
 *
 * Deliberately not included: running a calculation. That is a button with a
 * visible result beside it, and a command that silently computes would need to
 * report its outcome somewhere the user is not looking.
 */
export default function CommandPalette({ open, onClose }) {
  const mode = useAppSelector((state) => state.mode);
  const model = useAppSelector((state) => state.model);
  const engine = useAppSelector((state) => state.engine);
  const sets = useAppSelector((state) => state.parameterSets);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  const commands = useMemo(() => {
    const list = [
      { id: 'go-single', group: 'Go to', label: 'Calculate workspace', hint: 'Single case, 10,000-day series', run: () => setMode('single') },
      { id: 'go-batch', group: 'Go to', label: 'Batch workspace', hint: 'Dataset pipeline', run: () => setMode('batch') },
      { id: 'go-docs', group: 'Go to', label: 'Reference library', hint: 'Model standards and equations', run: () => setMode('docs') },
      ...MODELS.map((item) => ({
        id: `model-${item.id}`,
        group: 'Model',
        label: `Use ${item.name}`,
        hint: model === item.id ? 'current' : 'switch the calculation model',
        run: () => { setModel(item.id); setMode('single'); },
      })),
      { id: 'kernel-rust', group: 'Kernel', label: 'Use the Rust WASM kernel', hint: engine === 'rust' ? 'current' : '', run: () => setEngine('rust') },
      { id: 'kernel-js', group: 'Kernel', label: 'Use the JavaScript reference kernel', hint: engine === 'js' ? 'current' : '', run: () => setEngine('js') },
      { id: 'theme', group: 'Appearance', label: 'Toggle light / dark theme', hint: '', run: () => window.toggleTheme?.() },
    ];

    for (const [modelId, modelSets] of Object.entries(sets)) {
      for (const set of modelSets ?? []) {
        list.push({
          id: `set-${modelId}-${set.name}`,
          group: 'Parameter set',
          label: `Load “${set.name}”`,
          hint: `${MODELS.find((item) => item.id === modelId)?.name ?? modelId}`,
          run: () => { loadParameterSet(modelId, set.name); setModel(modelId); setMode('single'); },
        });
      }
    }

    // The reference library's sections, so a specific equation is one command away.
    const sections = [
      ['parameters', 'Parameter contract'],
      ['applicability', 'Applicability and limitations'],
      ['formulas', 'Implemented equations'],
      ['mapping', 'Formula source mapping'],
      ['sources', 'Official sources'],
    ];
    for (const [hash, label] of sections) {
      list.push({
        id: `doc-${hash}`,
        group: 'Reference',
        label: `Read ${label.toLowerCase()}`,
        hint: `${MODELS.find((item) => item.id === model)?.name ?? model}`,
        run: () => {
          setMode('docs');
          // After the workspace renders, jump to the section. The sticky header
          // offset is handled by scroll-margin-top on [id].
          requestAnimationFrame(() => { window.location.hash = `#${hash}`; });
        },
      });
    }
    return list;
  }, [engine, model, sets]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) => `${command.label} ${command.group} ${command.hint}`.toLowerCase().includes(needle));
  }, [commands, query]);

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setActive(0);
    inputRef.current?.focus();
    return undefined;
  }, [open]);

  useEffect(() => { setActive(0); }, [query]);

  if (!open) return null;

  const runCommand = (command) => {
    if (!command) return;
    onClose();
    command.run();
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((index) => Math.min(index + 1, matches.length - 1)); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); return; }
    if (event.key === 'Enter') { event.preventDefault(); runCommand(matches[active]); }
  };

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-[rgba(18,22,15,0.45)] px-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-[560px] overflow-hidden rounded-lg border border-line-strong bg-surface shadow-[var(--shadow-popover)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-current text-faint" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" strokeWidth="1.7" />
            <path d="m16 16 4 4" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={matches[active] ? `command-${matches[active].id}` : undefined}
            aria-label="Search commands"
            placeholder="Go to a workspace, model, kernel, saved set…"
            className="h-12 min-w-0 flex-1 border-0 bg-transparent text-sm text-primary outline-none placeholder:text-faint focus:ring-0"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-4xs text-faint">ESC</kbd>
        </div>

        <ul id="command-list" role="listbox" aria-label="Commands" className="max-h-[52vh] overflow-y-auto py-1">
          {matches.length === 0 && (
            <li className="px-4 py-6 text-center text-xs text-muted">Nothing matches “{query}”.</li>
          )}
          {matches.map((command, index) => {
            const header = command.group !== lastGroup ? command.group : null;
            lastGroup = command.group;
            return (
              <React.Fragment key={command.id}>
                {header && <li className="px-4 pb-1 pt-2.5 font-mono text-4xs uppercase tracking-[.08em] text-faint" aria-hidden="true">{header}</li>}
                <li
                  id={`command-${command.id}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => runCommand(command)}
                  className={`mx-1 flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm ${index === active ? 'bg-green-soft text-primary' : 'text-muted'}`}
                >
                  <span className="truncate">{command.label}</span>
                  {command.hint && <span className="shrink-0 font-mono text-4xs text-faint">{command.hint}</span>}
                </li>
              </React.Fragment>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Everything the palette can act on, for tests that assert coverage. */
export const paletteState = getState;
