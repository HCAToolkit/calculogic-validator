/**
 * Configuration: cfg-treeStructureAdvisor
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-treeStructureAdvisor.md (§2.4, role-category vocabulary intake)
 * Responsibility: Tree's role-category vocabulary evidence module (Tree slice spec S1.1–S1.3; bridge contract
 *   §4.4 rule 9, §4.9, §6.6; calculogic-validator#162): the intake of the payload-level Naming
 *   `namingRoleCategoryVocabulary` section into `treeRoleCategoryVocabularyIntake`, and the one accessor a
 *   future S3.6 slice would read.
 * Invariants: outside `treeNamingSectionIntake` and every Stage 1/Stage 2 module; imports no registry
 *   module and reads no registry state; trust comes from `bridgeOrigin` (wiring's execution branch), never
 *   from the payload's `bridgeSource` field; the whole section is judged, never record by record; ordered
 *   checks, first failure decides the state; an absent section gives no record; Stage 1A's record is read
 *   only for consistency and never changed; diagnostics stay in the intake and are never findings.
 */
import { TREE_NAMING_FIELD_GROUP_STATES } from './tree-naming-section-intake.logic.mjs';

const SOURCE_ID = 'tree-role-category-vocabulary-evidence';
const SECTION_KEY = 'namingRoleCategoryVocabulary';
const SECTION_VERSION = 'naming-role-category-vocabulary.v1';
const DIAGNOSTIC_SECTION = 'naming-role-category-vocabulary';
const REGISTRY_SOURCES = new Set(['builtin', 'custom', 'candidate']);
const ENVELOPE_KEYS = Object.freeze(['contractVersion', 'producerId', 'source', 'registrySource', 'categoryRolePerspectiveDigest', 'recordCount', 'records']);
const RECORD_KEYS = new Set(['category', 'roles']);

export const TREE_BRIDGE_ORIGINS = Object.freeze({ treeBuilt: 'tree-built', callerSupplied: 'caller-supplied' });

// Tree spec S1.3 states, in S1.2 check order (`absent` is no record at all).
export const TREE_ROLE_CATEGORY_VOCABULARY_STATES = Object.freeze({
  unsupported: 'unsupported',
  invalid: 'invalid',
  untrusted: 'untrusted',
  mismatched: 'mismatched',
  inconsistent: 'inconsistent',
  usable: 'usable',
});
const STATES = TREE_ROLE_CATEGORY_VOCABULARY_STATES;

export const TREE_ROLE_CATEGORY_VOCABULARY_REASONS = Object.freeze({
  unsupportedVersion: 'unsupported-version',
  invalidEnvelope: 'invalid-envelope',
  invalidRecord: 'invalid-record',
  unsortedOrDuplicateCategory: 'unsorted-or-duplicate-category',
  recordCountMismatch: 'record-count-mismatch',
  callerSupplied: 'caller-supplied',
  runProvenanceUnavailable: 'run-provenance-unavailable',
  sourceMismatch: 'source-mismatch',
  digestMismatch: 'digest-mismatch',
  observedCategoryMissing: 'observed-category-missing',
});
const REASONS = TREE_ROLE_CATEGORY_VOCABULARY_REASONS;

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isStrictlyAscending = (values) => values.every((value, index) => index === 0 || values[index - 1] < value);

// [2.4] cfg-treeStructureAdvisor · Primitive · "isValidRecord"
// Concern: Logic · Parent: "invalidReasonOf"
// Notes: §6.6: only `category` and `roles`; a non-empty category; non-empty, sorted, duplicate-free roles.
const isValidRecord = (record) =>
  isPlainObject(record) &&
  Object.keys(record).every((key) => RECORD_KEYS.has(key)) &&
  isNonEmptyString(record.category) &&
  Array.isArray(record.roles) &&
  record.roles.length > 0 &&
  record.roles.every(isNonEmptyString) &&
  isStrictlyAscending(record.roles);

// [2.4] cfg-treeStructureAdvisor · Primitive · "invalidReasonOf"
// Concern: Logic · Parent: "prepareTreeRoleCategoryVocabularyIntake"
// Notes: S1.2 check 2, the whole section: envelope (§4.4 rules 3 and 9, §6.6), then every record, then
// category order and uniqueness, then the count. Returns null for a valid section.
const invalidReasonOf = (section) => {
  if (
    'identityTupleFields' in section ||
    ENVELOPE_KEYS.some((key) => !(key in section)) ||
    !isNonEmptyString(section.producerId) ||
    !isNonEmptyString(section.source) ||
    !REGISTRY_SOURCES.has(section.registrySource) ||
    !isNonEmptyString(section.categoryRolePerspectiveDigest) ||
    !Array.isArray(section.records) ||
    !Number.isInteger(section.recordCount)
  ) {
    return REASONS.invalidEnvelope;
  }
  if (!section.records.every(isValidRecord)) return REASONS.invalidRecord;
  if (!isStrictlyAscending(section.records.map((record) => record.category))) return REASONS.unsortedOrDuplicateCategory;
  if (section.recordCount !== section.records.length) return REASONS.recordCountMismatch;
  return null;
};

// [2.4] cfg-treeStructureAdvisor · Primitive · "provenanceMismatchReasonOf"
// Concern: Logic · Parent: "prepareTreeRoleCategoryVocabularyIntake"
// Notes: S1.2 check 4, strict: the run's own provenance entry must exist and agree on source and digest.
const provenanceMismatchReasonOf = (section, runProvenance) => {
  if (!isPlainObject(runProvenance) || !isNonEmptyString(runProvenance.source) || !isNonEmptyString(runProvenance.digest)) {
    return REASONS.runProvenanceUnavailable;
  }
  if (runProvenance.source !== section.registrySource) return REASONS.sourceMismatch;
  if (runProvenance.digest !== section.categoryRolePerspectiveDigest) return REASONS.digestMismatch;
  return null;
};

// [2.4] cfg-treeStructureAdvisor · Primitive · "missingObservedCategoriesOf"
// Concern: Logic · Parent: "prepareTreeRoleCategoryVocabularyIntake"
// Notes: S1.2 check 5: the `roleCategory` of every accepted §4.5 role-fact group in Stage 1A's record that
// the vocabulary lacks, sorted. Bounds disagreement with observed evidence; proves nothing about the rest.
const missingObservedCategoriesOf = (section, sectionIntake) => {
  const declared = new Set(section.records.map((record) => record.category));
  const observed = new Set(
    (sectionIntake?.semanticEvidenceEnrichment?.acceptedRecords ?? [])
      .filter((record) => record.roleFactGroup === TREE_NAMING_FIELD_GROUP_STATES.ACCEPTED && isNonEmptyString(record.roleCategory))
      .map((record) => record.roleCategory),
  );
  return [...observed].filter((category) => !declared.has(category)).sort();
};

const toIntake = ({ state, bridgeOrigin, reason, vocabulary = null, missingCategories }) =>
  Object.freeze({
    source: SOURCE_ID,
    state,
    bridgeOrigin: bridgeOrigin ?? null,
    vocabulary,
    diagnostics: reason
      ? [{ section: DIAGNOSTIC_SECTION, state, reason, ...(missingCategories ? { missingCategories } : {}) }]
      : [],
  });

// [2.4] cfg-treeStructureAdvisor · Container · "prepareTreeRoleCategoryVocabularyIntake"
// Concern: Logic · Parent: Tree wiring
// Notes: reads only the payload's §4.9 section. Returns `null` when the payload carries none (`absent`).
// Otherwise the S1.2 checks in order, the first failure deciding the state: version (`unsupported`),
// whole-section validity (`invalid`), origin (`untrusted` unless `bridgeOrigin` is exactly `tree-built`),
// strict run provenance (`mismatched`), consistency with Stage 1A's accepted role facts (`inconsistent`),
// else `usable`. The payload's own `bridgeSource` is never read.
export const prepareTreeRoleCategoryVocabularyIntake = ({
  namingOccurrenceBridge,
  bridgeOrigin,
  runCategoryRolePerspectiveProvenance,
  sectionIntake,
} = {}) => {
  const payload = isPlainObject(namingOccurrenceBridge) ? namingOccurrenceBridge : null;
  if (!payload || payload[SECTION_KEY] === undefined) return null;
  const section = payload[SECTION_KEY];
  if (isPlainObject(section) && section.contractVersion !== SECTION_VERSION) {
    return toIntake({ state: STATES.unsupported, bridgeOrigin, reason: REASONS.unsupportedVersion });
  }
  const invalidReason = isPlainObject(section) ? invalidReasonOf(section) : REASONS.invalidEnvelope;
  if (invalidReason) return toIntake({ state: STATES.invalid, bridgeOrigin, reason: invalidReason });
  if (bridgeOrigin !== TREE_BRIDGE_ORIGINS.treeBuilt) {
    return toIntake({ state: STATES.untrusted, bridgeOrigin, reason: REASONS.callerSupplied });
  }
  const mismatchReason = provenanceMismatchReasonOf(section, runCategoryRolePerspectiveProvenance);
  if (mismatchReason) return toIntake({ state: STATES.mismatched, bridgeOrigin, reason: mismatchReason });
  const missingCategories = missingObservedCategoriesOf(section, sectionIntake);
  if (missingCategories.length > 0) {
    return toIntake({ state: STATES.inconsistent, bridgeOrigin, reason: REASONS.observedCategoryMissing, missingCategories });
  }
  return toIntake({
    state: STATES.usable,
    bridgeOrigin,
    vocabulary: Object.freeze({
      registrySource: section.registrySource,
      categoryRolePerspectiveDigest: section.categoryRolePerspectiveDigest,
      records: section.records.map(({ category, roles }) => ({ category, roles: [...roles] })),
    }),
  });
};

// [2.4] cfg-treeStructureAdvisor · Container · "toTreeUsableRoleCategoryVocabulary"
// Concern: Logic · Parent: a future S3.6 slice (Tree spec S3.6 future rule; not read at runtime yet)
// Notes: the vocabulary only for a `usable` intake; `null` for every other state and for an absent section.
export const toTreeUsableRoleCategoryVocabulary = (intake) =>
  intake?.state === STATES.usable && intake.vocabulary ? intake.vocabulary : null;
