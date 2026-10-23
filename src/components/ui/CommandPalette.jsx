import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  loadParameterSet,
  setEngine,
  setLocale,
  setMode,
  setModel,
  useAppSelector,
} from '../../state/appStore';
import { useLocale, useT } from '../../i18n';
import { revealSection } from './revealSection';

/**
 * Standards names, not interface wording: the same string in both languages, which
 * is why they are not in the catalogue and why the palette's model commands need no
 * translation of their own.
 */
const MODELS = [
  { id: 'aci209', name: 'ACI 209R-92' },
  { id: 'mc2010', name: 'fib Model Code 2010' },
  { id: 'b4', name: 'RILEM Model B4' },
  { id: 'b4s', name: 'RILEM Model B4s' },
  { id: 'gl2000', name: 'GL2000' },
  { id: 'aashto', name: 'AASHTO LRFD' },
];

const SECTIONS = ['parameters', 'applicability', 'formulas', 'mapping', 'sources'];

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The global entry point the audit asked for.
 *
 * Every destination in the app was reachable only by first finding the right
 * workspace, then the right control inside it. The palette makes the whole app
 * addressable from anywhere: workspaces, models, kernels, saved parameter sets,
 * the reference library's sections, the theme, and the language.
 *
 * Deliberately not included: running a calculation. That is a button with a
 * visible result beside it, and a command that silently computes would need to
 * report its outcome somewhere the user is not looking.
 */
export default function CommandPalette({ onClose }) {
  const t = useT();
  const mode = useAppSelector((state) => state.mode);
  const model = useAppSelector((state) => state.model);
  const engine = useAppSelector((state) => state.engine);
  const sets = useAppSelector((state) => state.parameterSets);
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const dialogRef = useRef(null);
  const listRef = useRef(null);
  // Read during the first render, before the input's autoFocus lands in the commit
  // phase, so this is still whatever opened the palette.
  const openerRef = useRef(document.activeElement);

  // Closing unmounts the dialog while its input holds focus, which would drop the
  // user back on <body> and restart the tab order from the top of the document.
  useEffect(() => () => {
    const opener = openerRef.current;
    if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
  }, []);

  // The list is height-capped, so without this the selection walks out of view and
  // Enter runs a command the user cannot see.
  useEffect(() => {
    const option = listRef.current?.querySelector('[role="option"][aria-selected="true"]');
    // jsdom does not implement scrollIntoView; there is nothing to scroll there anyway.
    option?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
  }, [active, query]);

  // Rebuilt when the language changes: the commands are prose, so every label and
  // hint is a different string in the other locale. The `t` identity is bound to the
  // locale, so it is the dependency that carries that.
  const commands = useMemo(() => {
    const list = [
      { id: 'go-single', group: t('palette.group.goTo'), label: t('palette.command.goSingle'), hint: mode === 'single' ? t('palette.hint.current') : t('palette.hint.singleCase'), run: () => setMode('single') },
      { id: 'go-batch', group: t('palette.group.goTo'), label: t('palette.command.goBatch'), hint: mode === 'batch' ? t('palette.hint.current') : t('palette.hint.datasetPipeline'), run: () => setMode('batch') },
      { id: 'go-docs', group: t('palette.group.goTo'), label: t('palette.command.goDocs'), hint: mode === 'docs' ? t('palette.hint.current') : t('palette.hint.standards'), run: () => setMode('docs') },
      ...MODELS.map((item) => ({
        id: `model-${item.id}`,
        group: t('palette.group.model'),
        label: t('palette.command.useModel', { model: item.name }),
        hint: model === item.id ? t('palette.hint.current') : t('palette.hint.switchModel'),
        run: () => { setModel(item.id); setMode('single'); },
      })),
      { id: 'kernel-rust', group: t('palette.group.kernel'), label: t('palette.command.kernelRust'), hint: engine === 'rust' ? t('palette.hint.current') : '', run: () => setEngine('rust') },
      { id: 'kernel-js', group: t('palette.group.kernel'), label: t('palette.command.kernelJs'), hint: engine === 'js' ? t('palette.hint.current') : '', run: () => setEngine('js') },
      { id: 'theme', group: t('palette.group.appearance'), label: t('palette.command.theme'), hint: '', run: () => window.toggleTheme?.() },
      { id: 'language', group: t('palette.group.appearance'), label: t('palette.command.language'), hint: '', run: () => setLocale(locale === 'en' ? 'zh' : 'en') },
    ];

    for (const [modelId, modelSets] of Object.entries(sets)) {
      for (const set of modelSets ?? []) {
        list.push({
          id: `set-${modelId}-${set.name}`,
          group: t('palette.group.parameterSet'),
          label: t('palette.command.loadSet', { name: set.name }),
          hint: `${MODELS.find((item) => item.id === modelId)?.name ?? modelId}`,
          run: () => { loadParameterSet(modelId, set.name); setModel(modelId); setMode('single'); },
        });
      }
    }

    // The reference library's sections, so a specific equation is one command away.
    for (const hash of SECTIONS) {
      list.push({
        id: `doc-${hash}`,
        group: t('palette.group.reference'),
        label: t('palette.command.readSection', { section: t(`palette.section.${hash}`) }),
        hint: `${MODELS.find((item) => item.id === model)?.name ?? model}`,
        run: () => {
          setMode('docs');
          // The sticky header offset is handled by scroll-margin-top on [id].
          revealSection(hash);
        },
      });
    }
    return list;
  }, [engine, locale, mode, model, sets, t]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) => `${command.label} ${command.group} ${command.hint}`.toLowerCase().includes(needle));
  }, [commands, query]);

  const runCommand = (command) => {
    if (!command) return;
    onClose();
    command.run();
  };

  // Bound to the dialog rather than the input. The input is the only focusable node,
  // so a single Tab used to leave a dialog that `aria-modal` keeps on screen — and
  // Escape went with it, leaving the palette undismissable by keyboard.
  const onDialogKeyDown = (event) => {
    if (event.key === 'Tab') {
      const focusable = dialogRef.current?.querySelectorAll(FOCUSABLE);
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      const escaped = !dialogRef.current.contains(current);
      if (event.shiftKey && (current === first || escaped)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (current === last || escaped)) { event.preventDefault(); first.focus(); }
      return;
    }
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((index) => Math.min(index + 1, matches.length - 1)); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); return; }
    if (event.key === 'Enter') { event.preventDefault(); runCommand(matches[active]); }
  };

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-[#1f1e1c]/45 px-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.dialogLabel')}
        className="w-full max-w-[560px] overflow-hidden rounded-xl border border-line bg-surface shadow-popover"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onDialogKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-line px-4 focus-within:ring-2 focus-within:ring-inset focus-within:ring-action">
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-current text-faint" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" strokeWidth="1.7" />
            <path d="m16 16 4 4" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={matches[active] ? `command-${matches[active].id}` : undefined}
            aria-label={t('palette.inputLabel')}
            name="command-search"
            autoComplete="off"
            placeholder={t('palette.placeholder')}
            className="command-search h-12 min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
          />
          <kbd className="rounded-sm border border-line px-1.5 py-0.5 font-mono text-3xs text-faint">ESC</kbd>
        </div>

        <ul ref={listRef} id="command-list" role="listbox" aria-label={t('palette.listLabel')} className="max-h-[52vh] overflow-y-auto py-1">
          {matches.length === 0 && (
            <li className="px-4 py-6 text-center text-xs text-muted">{t('palette.noMatch', { query })}</li>
          )}
          {matches.map((command, index) => {
            const header = command.group !== lastGroup ? command.group : null;
            lastGroup = command.group;
            return (
              <React.Fragment key={command.id}>
                {header && <li className="px-4 pb-1 pt-2.5 font-mono text-3xs text-faint" aria-hidden="true">{header}</li>}
                <li
                  id={`command-${command.id}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => runCommand(command)}
                  className={`command-option mx-1 flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${index === active ? 'bg-action-soft text-ink' : 'text-muted'}`}
                >
                  <span className="truncate">{command.label}</span>
                  {command.hint && <span className="shrink-0 font-mono text-3xs text-faint">{command.hint}</span>}
                </li>
              </React.Fragment>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
