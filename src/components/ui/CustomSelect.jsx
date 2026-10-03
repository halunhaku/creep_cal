import React from 'react';

export default function CustomSelect({ name, value, onChange, options, id, ariaLabel }) {
  const normalized = options.map((option) => typeof option === 'string' ? { value: option, label: option } : option);
  return (
    <div className="field-control relative overflow-hidden">
      <select
        id={id || `param-select-${name}`}
        name={name}
        value={value}
        onChange={onChange}
        aria-label={ariaLabel}
        className="h-10 w-full appearance-none border-0 bg-transparent px-3 pr-9 font-mono text-2xs font-medium text-primary outline-none focus:ring-0"
      >
        {normalized.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 fill-none stroke-current text-faint" viewBox="0 0 16 16" aria-hidden="true">
        <path d="m3.5 6 4.5 4 4.5-4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
