import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export default function CustomSelect({ name, value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const opts = options.map(o =>
    typeof o === 'string' ? { value: o, label: o } : o
  );

  const selected = opts.find(o => o.value === value) || opts[0];

  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  const updateCoords = useCallback(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  }, []);

  useEffect(() => {
    const handler = (e) => {
      const isOutsideTrigger = ref.current && !ref.current.contains(e.target);
      const portalElements = document.querySelectorAll('.custom-select-portal');
      const isOutsidePortal = Array.from(portalElements).every(el => !el.contains(e.target));

      if (isOutsideTrigger && isOutsidePortal) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      updateCoords();
      window.addEventListener('scroll', updateCoords, true);
      window.addEventListener('resize', updateCoords);
    }
    return () => {
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords);
    };
  }, [open, updateCoords]);

  const handleSelect = (opt) => {
    onChange({ target: { name, value: opt.value } });
    setOpen(false);
  };

  return (
    <div className={`relative w-full ${open ? 'z-40' : 'z-0'}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`
          w-full flex items-center justify-between
          h-9 rounded border px-3 text-sm font-mono
          bg-surface-2 text-primary
          transition-all duration-150
          ${open
            ? 'border-green-border shadow-[0_0_0_1px_var(--green-border)]'
            : 'border-line-strong hover:border-green-border'
          }
        `}
      >
        <span className="truncate">{selected?.label}</span>
        <span
          aria-hidden="true"
          className={`material-symbols-outlined text-[16px] text-green ml-2 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          expand_more
        </span>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="custom-select-portal absolute z-50 overflow-hidden rounded-md border border-line-strong bg-surface shadow-card-raised"
          style={{ top: coords.top, left: coords.left, width: coords.width }}
          role="listbox"
        >
          {opts.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt)}
                role="option"
                aria-selected={isSelected}
                className={`
                  w-full flex items-center justify-between gap-3 px-3.5 py-2.5 font-mono text-[13px] text-left
                  transition-colors duration-100
                  ${isSelected
                    ? 'bg-green-soft text-green-dark font-bold'
                    : 'text-primary hover:bg-surface-3'
                  }
                `}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <span className="material-symbols-outlined shrink-0 text-[14px] text-green" aria-hidden="true">check</span>
                )}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
