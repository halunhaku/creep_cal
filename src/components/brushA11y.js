import { useEffect } from 'react';

/**
 * Recharts 3.1 renders each Brush drag handle as `role="slider"` with only
 * `aria-label` and `aria-valuenow` (a pixel coordinate). A slider without
 * min/max/now-in-meaningful-units/text fails the name-role-value check, and
 * pixel values announce as nonsense ("123.45").
 *
 * Brush offers no props to fix this — the attributes are hardcoded in its
 * TravellerLayer — so this module patches the rendered DOM instead. Values
 * stay in the chart's own data units (days for single analyses, the X column
 * for batch line mode), which is also what the Brush text labels show.
 */

const clampIndex = (value, fallback, last) => (
  Number.isInteger(value) ? Math.min(Math.max(value, 0), last) : fallback
);

/**
 * Resolve slider values from the chart's own Brush data. `data` is ascending
 * in both callers (sampled `t`, sorted `x`), so the endpoints are min/max.
 * Falls back to index units when a datum is missing or non-numeric — the
 * attributes stay consistent with each other either way.
 */
export function resolveBrushValues(data, dataKey, startIndex, endIndex) {
  const length = Array.isArray(data) ? data.length : 0;
  if (length === 0) return null;
  const last = length - 1;
  const start = clampIndex(startIndex, 0, last);
  const end = clampIndex(endIndex, last, last);
  const at = (index) => Number(data[index]?.[dataKey]);
  const first = at(0);
  const latest = at(last);
  if (!Number.isFinite(first) || !Number.isFinite(latest)) {
    return { min: 0, max: last, startValue: start, endValue: end };
  }
  return {
    min: Math.min(first, latest),
    max: Math.max(first, latest),
    startValue: Number.isFinite(at(start)) ? at(start) : start,
    endValue: Number.isFinite(at(end)) ? at(end) : end,
  };
}

const setIfDifferent = (element, name, value) => {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
};

/**
 * Stamp min/max/now/text onto the two rendered handles. Returns how many were
 * patched. Guards each write so the MutationObserver below settles instead of
 * ping-ponging with Recharts' own renders.
 */
export function patchBrushTravellers(root, { min, max, startValue, endValue, format }) {
  const scope = root ?? (typeof document !== 'undefined' ? document : null);
  const travellers = scope?.querySelectorAll?.('.recharts-brush-traveller');
  if (!travellers?.length) return 0;
  const formatValue = typeof format === 'function' ? format : (value) => String(value);
  const handles = [
    { value: startValue, text: formatValue(startValue) },
    { value: endValue, text: formatValue(endValue) },
  ];
  travellers.forEach((element, index) => {
    const handle = handles[Math.min(index, handles.length - 1)];
    setIfDifferent(element, 'aria-valuemin', String(min));
    setIfDifferent(element, 'aria-valuemax', String(max));
    if (Number.isFinite(Number(handle.value))) {
      setIfDifferent(element, 'aria-valuenow', String(handle.value));
    }
    setIfDifferent(element, 'aria-valuetext', String(handle.text));
  });
  return travellers.length;
}

/**
 * Keep the Brush handles patched while the chart lives. Recharts re-renders
 * the travellers on every drag (resetting `aria-valuenow` to pixels), so a
 * one-off effect would only survive until the first interaction.
 */
export function BrushA11ySync({ containerRef, data, dataKey, startIndex, endIndex, format }) {
  useEffect(() => {
    const values = resolveBrushValues(data, dataKey, startIndex, endIndex);
    if (!values) return undefined;
    const target = containerRef?.current ?? (typeof document !== 'undefined' ? document.body : null);
    if (!target) return undefined;
    const apply = () => {
      const root = containerRef?.current ?? document;
      patchBrushTravellers(root, { ...values, format });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-valuenow', 'aria-label'],
    });
    return () => observer.disconnect();
  }, [containerRef, data, dataKey, startIndex, endIndex, format]);
  return null;
}
