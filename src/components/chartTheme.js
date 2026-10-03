/**
 * Chart theme.
 *
 * recharts takes its sizes and colours as JS props on SVG elements, so the type
 * scale's tokens never reached the charts: the axis labels were 9px and the ticks
 * 10px, both below the floor the rest of the app now holds, and the reference
 * label was drawn in the accent colour at 4.38:1 on the chart surface.
 *
 * Two colours for the accent, because it does two jobs:
 *   --accent       graphics: the reference line. WCAG asks 3:1 of non-text, and
 *                  #c9532d is 3.94:1 on the page and 4.38:1 on the surface.
 *   --accent-text  text: the reference label. Must clear 4.5:1; #b34420 is 5.53:1
 *                  on the surface and 4.99:1 on the page. The dark theme's accent
 *                  is already 6.95:1, so there it is used for both.
 *
 * Measured with the WCAG 2.1 relative-luminance formula against both the card
 * surface and the page background, in both themes.
 */
export const CHART = {
  /** ticks, axis titles, legend — on the scale, not below it */
  font: 12,
  /** reference-line labels: the floor */
  labelFont: 11,
  tick: 'var(--text-muted)',
  axisTitle: 'var(--text-faint)',
  grid: 'var(--chart-grid)',
  reference: 'var(--accent)',
  referenceText: 'var(--accent-text)',
  target: 'var(--text-muted)',
};

export const tickStyle = { fontSize: CHART.font, fill: CHART.tick };
/**
 * Minimum px between x-axis labels. Raising the tick size to the type floor made
 * every label on a 0-10,000 day axis collide, so recharts is told to drop the
 * ones that would touch instead of drawing them on top of each other.
 */
export const tickGap = 28;
export const axisTitleStyle = { fill: CHART.axisTitle, fontSize: CHART.font };
export const legendStyle = { fontSize: CHART.font, paddingTop: 12 };
