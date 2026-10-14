/**
 * Carbon chart theme. Recharts consumes sizes and colours as JavaScript props,
 * so SVG text and strokes resolve the same IBM Plex scale and semantic tokens as
 * the rest of the workbench. IBM Blue carries the data series; neutral ink carries
 * references, axes, and grid structure.
 */
export const CHART = {
  /** ticks, axis titles, legend — on the scale, not below it */
  font: 12,
  /** reference-line labels use the 12px Carbon caption size */
  labelFont: 12,
  tick: 'var(--text-muted)',
  axisTitle: 'var(--text-faint)',
  grid: 'var(--chart-grid)',
  reference: 'var(--reference)',
  referenceText: 'var(--reference-text)',
  target: 'var(--text-muted)',
  brushTrack: 'var(--surface-2)',
  brushSelection: 'var(--action)',
};

const logTickNumber = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 });

/** Recharts Brush cannot drag against a numeric log scale. Charts therefore
 * plot log10(x) on a linear internal axis and format ticks back to source units. */
export function formatLogTick(exponent) {
  const value = 10 ** Number(exponent);
  return Number.isFinite(value) ? logTickNumber.format(value) : '';
}

export const tickStyle = { fontSize: CHART.font, fill: CHART.tick };
/**
 * Minimum px between x-axis labels. Raising the tick size to the type floor made
 * every label on a 0-10,000 day axis collide, so recharts is told to drop the
 * ones that would touch instead of drawing them on top of each other.
 */
export const tickGap = 28;
export const axisTitleStyle = { fill: CHART.axisTitle, fontSize: CHART.font };
export const legendStyle = { fontSize: CHART.font, paddingTop: 12 };
