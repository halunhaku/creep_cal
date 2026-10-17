import shell from './en/shell';
import workspace from './en/workspace';
import batch from './en/batch';

/**
 * The English interface catalogue, assembled from per-area modules so each file
 * stays short enough to review. `zh.js` mirrors it key for key; the parity test
 * holds the two together.
 *
 * Model content is deliberately absent — see `src/i18n/pick.js` for why a model's
 * parameter labels live in that model's own config instead.
 */
export default { ...shell, ...workspace, ...batch };
