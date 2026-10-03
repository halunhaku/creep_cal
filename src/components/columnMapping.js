/**
 * Column mapping for the batch pipeline.
 *
 * The pipeline used to require the input table's headers to match the model
 * contract exactly, so a file with "Humidity" instead of "H" was a dead end: the
 * only advice was "Missing required columns". Real spreadsheets name things
 * their own way, so a missing column is now a question to answer, not an error.
 *
 * Suggestions are deliberately conservative: an exact match, a normalised match
 * (case, spaces, underscores and dots removed), or one of a few aliases that are
 * unambiguous for this domain. Anything else is left for the user to pick, and
 * every suggestion can be overridden.
 */
const ALIASES = {
  // Age and time
  t: ['age', 'time', 'days', 'age_days', 't_days', 'duration'],
  t0: ['age0', 't_0', 'loading_age', 'age_at_loading', 't0_days'],
  tPrime: ['tprime', 't_prime', 'tp', 'loading_age'],
  // Environment
  H: ['humidity', 'rh', 'relative_humidity', 'ambient_humidity'],
  RH: ['humidity', 'rh', 'relative_humidity'],
  T: ['temp', 'temperature', 'ambient_temperature'],
  Tcur: ['temp', 'temperature', 'curing_temperature', 'current_temperature'],
  Tsh: ['temp', 'temperature', 'shrinkage_temperature'],
  Tc: ['temp', 'temperature', 'concrete_temperature'],
  // Strength and geometry
  fc: ['fck', 'fcm', 'f_c', 'compressive_strength', 'strength', 'cylinder_strength'],
  fcm: ['fc', 'fck', 'mean_strength', 'compressive_strength'],
  Ac: ['area', 'cross_section', 'cross_sectional_area', 'ac_mm2'],
  u: ['perimeter', 'exposed_perimeter', 'u_mm'],
  vS: ['volume_surface', 'volume_to_surface', 'v_s', 'vs_ratio'],
  VS: ['volume_surface', 'volume_to_surface', 'v_s', 'vs_ratio'],
  h: ['thickness', 'member_thickness', 'notional_size', 'h0', 'effective_thickness'],
  // Mix
  c: ['cement', 'cement_content', 'cement_kg'],
  wC: ['wc', 'w_c', 'water_cement', 'water_cement_ratio'],
  aC: ['ac', 'a_c', 'aggregate_cement', 'aggregate_cement_ratio'],
  slump: ['slump_mm', 'workability'],
  airContent: ['air', 'air_content', 'air_entrained'],
  fineAggregate: ['fine_aggregate', 'fine_agg', 'sand'],
  curingType: ['curing', 'cure_type', 'curing_method'],
  cementType: ['cement_type', 'cement_class', 'cement_strength_class'],
  aggregateType: ['aggregate_type', 'agg_type'],
  specimenShape: ['specimen', 'shape', 'specimen_type'],
  // Admixtures
  retarder: ['retarding', 'set_retarder', 'retarder_pct'],
  flyAsh: ['fly_ash', 'flyash', 'fa', 'pfa'],
  superplasticizer: ['superplasticiser', 'sp', 'superplast', 'high_range_water_reducer'],
  silicaFume: ['silica_fume', 'sf', 'microsilica'],
  airEntrainingAgent: ['air_entraining', 'aea', 'air_entrainer'],
  waterReducer: ['water_reducing', 'wr', 'plasticizer'],
};

const normalise = (value) => String(value).toLowerCase().replace(/[\s_.\-()]/g, '');

/**
 * @param {string} field one of the model's required columns
 * @param {string[]} headers the columns the uploaded file actually has
 * @returns {string} the suggested source column, or '' when nothing is convincing
 */
export function suggestSource(field, headers) {
  const wanted = normalise(field);
  const exact = headers.find((header) => normalise(header) === wanted);
  if (exact) return exact;

  for (const alias of ALIASES[field] ?? []) {
    const match = headers.find((header) => normalise(header) === normalise(alias));
    if (match) return match;
  }
  return '';
}

/**
 * @returns {Array<{field: string, source: string}>} one entry per missing field
 */
export function suggestMapping(missing, headers) {
  return missing.map((field) => ({ field, source: suggestSource(field, headers) }));
}

/**
 * Rename the mapped source columns to the contract names, in place: the result
 * matrix should show the field the model asks for, not the spreadsheet's wording.
 * A source column used by two fields is reported rather than silently applied.
 *
 * @returns {{rows: object[], conflicts: string[]}}
 */
export function applyMapping(rows, mapping) {
  const used = new Map();
  const conflicts = [];
  for (const { field, source } of mapping) {
    if (!source) continue;
    if (used.has(source)) conflicts.push(`${source} → ${used.get(source)} and ${field}`);
    else used.set(source, field);
  }
  if (conflicts.length) return { rows, conflicts };

  const rename = new Map(mapping.filter(({ source }) => source).map(({ field, source }) => [source, field]));
  const remapped = rows.map((row) => {
    const next = { ...row };
    for (const [source, field] of rename) {
      next[field] = row[source];
      if (source !== field) delete next[source];
    }
    return next;
  });
  return { rows: remapped, conflicts };
}
