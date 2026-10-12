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
  vS: ['volume_surface', 'volume_to_surface', 'v_s', 'vs_ratio', 'thickness', 'member_thickness', 'notional_size', 'effective_thickness'],
  VS: ['volume_surface', 'volume_to_surface', 'v_s', 'vs_ratio', 'thickness', 'member_thickness', 'notional_size', 'effective_thickness'],
  // `h` is relative humidity in every model that has it (B4). The size names live
  // on vS/V/S above: an earlier revision offered `h <- thickness`, so a 50 mm
  // member was silently computed at 50 % RH — in range, plausible and wrong.
  h: ['humidity', 'rh', 'relative_humidity', 'ambient_humidity'],
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

/**
 * Case, spacing and punctuation are noise; a slash is not, unless it is dropped
 * like the rest. The workspace and the reference library write the ratios as
 * `w/c`, `a/c` and `V/S`, so a spreadsheet that copies those names has to match
 * the field — before, only the hyphen spelling did.
 */
const normalise = (value) => String(value).toLowerCase().replace(/[\s_.\-()/\\]/g, '');

/** Punctuation and spacing are noise, but case is kept. */
const strip = (value) => String(value).replace(/[\s_.\-()/\\]/g, '');

/** Every contract field, including the two without aliases. */
const FIELDS = [...Object.keys(ALIASES), 'Cs', 'sigma'];

/**
 * Same physical quantity under a different case: matching across case here is
 * correct, unlike the pairs below. ACI `H` and B4 `h` are both relative
 * humidity (%), `VS` and `vS` are both the volume-surface ratio (mm).
 */
const SAME_QUANTITY = [['H', 'h'], ['VS', 'vS']];

function sameQuantity(a, b) {
  return SAME_QUANTITY.some((group) => group.includes(a) && group.includes(b));
}

/**
 * Does this header name a *different* field (or one of its aliases) when read
 * case-sensitively? Concrete age `t` vs curing temperature `T`, and
 * cross-section area `Ac` vs aggregate-cement ratio `aC`, share a normalised
 * spelling, so a case-insensitive match used to offer one for the other —
 * age 365 suggested as `T` = 365 °C, a B4 `a/c` column suggested for MC2010's
 * `Ac`. Same-quantity pairs (`H`/`h`, `VS`/`vS`) are exempt: one manual pick
 * beats a plausible wrong number, but refusing a correct humidity match would
 * just be noise.
 */
function ownedByOther(field, header) {
  const key = strip(header);
  for (const other of FIELDS) {
    if (other === field) continue;
    if (sameQuantity(field, other)) continue;
    if (strip(other) === key) return true;
    for (const alias of ALIASES[other] ?? []) {
      if (strip(alias) === key) return true;
    }
  }
  return false;
}

/**
 * @param {string} field one of the model's required columns
 * @param {string[]} headers the columns the uploaded file actually has
 * @returns {string} the suggested source column, or '' when nothing is convincing
 */
export function suggestSource(field, headers) {
  // The file's own spelling wins first: an exact-case match is never ambiguous.
  const exactSensitive = headers.find((header) => strip(header) === strip(field));
  if (exactSensitive) return exactSensitive;
  for (const alias of ALIASES[field] ?? []) {
    const match = headers.find((header) => strip(header) === strip(alias));
    if (match) return match;
  }
  // Then the lenient match, skipping columns owned by another field.
  const wanted = normalise(field);
  const exact = headers.find((header) => normalise(header) === wanted && !ownedByOther(field, header));
  if (exact) return exact;

  for (const alias of ALIASES[field] ?? []) {
    const match = headers.find(
      (header) => normalise(header) === normalise(alias) && !ownedByOther(field, header),
    );
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
 * Every target is written from the *original* row before any source is dropped:
 * one entry's field name can be another entry's source name (`C -> B` and
 * `B -> A`), and deleting as we went dropped a value depending on the order the
 * entries happened to be in.
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

  const renames = mapping.filter(({ source }) => source);
  const targets = new Set(renames.map(({ field }) => field));
  const remapped = rows.map((row) => {
    const next = { ...row };
    for (const { field, source } of renames) next[field] = row[source];
    for (const { field, source } of renames) {
      if (source !== field && !targets.has(source)) delete next[source];
    }
    return next;
  });
  return { rows: remapped, conflicts };
}
