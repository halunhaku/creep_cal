/**
 * Parameter units.
 *
 * The reference library described units inside prose ("Age at loading (days)"),
 * which is where they were least usable: you cannot scan a column that is a
 * sentence, and the same parameter was spelled differently in different models.
 *
 * These are the units the calculators already declare in their own parameter
 * configs — the app's actual contract — collected here so the documentation can
 * show them as a column. `''` means the parameter is dimensionless or
 * categorical; the table renders that as a dash.
 *
 * A test reads the four calculator sources and fails if any unit here disagrees
 * with what the workspace actually renders.
 */
export const PARAMETER_UNITS = {
  // Time
  t: 'days',
  t0: 'days',
  tPrime: 'days',
  targetAge: 'days',
  // Environment
  H: '%',
  h: '%',
  RH: '%',
  T: '°C',
  Tcur: '°C',
  Tsh: '°C',
  Tc: '°C',
  // Strength and geometry
  fc: 'MPa',
  fcm: 'MPa',
  sigma: 'MPa',
  Ac: 'mm²',
  u: 'mm',
  VS: 'mm',
  vS: 'mm',
  slump: 'mm',
  // Mix
  c: 'kg/m³',
  wC: '',
  aC: '',
  fineAggregate: '%',
  airContent: '%',
  // Admixtures, dosed by cement weight
  retarder: '% c',
  flyAsh: '% c',
  superplasticizer: '% c',
  silicaFume: '% c',
  airEntrainingAgent: '% c',
  waterReducer: '% c',
  // Categorical
  curingType: '',
  cementType: '',
  aggregateType: '',
  specimenShape: '',
  Cs: '',
};

/** The dash the reference library shows for a dimensionless or categorical field. */
export const NO_UNIT = '—';

/**
 * Long forms for the reference library, where there is room to spell it out.
 * The symbols above stay canonical — they are what the workspace renders in a
 * chip and what the drift test compares against the calculators.
 */
const UNIT_LABELS = {
  '% c': '% of cement weight',
  'kg/m³': 'kg/m³',
  'mm²': 'mm²',
};

export function unitFor(name) {
  const unit = PARAMETER_UNITS[name];
  return unit ? unit : NO_UNIT;
}

/** What the parameter contract table prints: the symbol, spelled out where it helps. */
export function unitLabelFor(name) {
  const unit = PARAMETER_UNITS[name];
  if (!unit) return NO_UNIT;
  return UNIT_LABELS[unit] ?? unit;
}
