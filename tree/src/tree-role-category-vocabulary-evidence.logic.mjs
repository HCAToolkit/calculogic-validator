/**
 * Configuration: cfg-treeStructureAdvisor
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-treeStructureAdvisor.md (§2.4, role-category vocabulary intake)
 * Responsibility: Tree's role-category vocabulary evidence module (Tree slice spec S1.1–S1.3; bridge contract
 *   §4.4 rule 9, §4.9, §6.6; calculogic-validator#162): the intake of the payload-level Naming
 *   `namingRoleCategoryVocabulary` section into `treeRoleCategoryVocabularyIntake`, and the one accessor a
 *   future S3.6 slice would read.
 * Invariants: outside `treeNamingSectionIntake` and every Stage 1/Stage 2 module; imports no registry
 *   module and reads no registry state; trust comes from wiring's two origins, `bridgeOrigin` (who built the
 *   payload) and `vocabularyOrigin` (whether the staged vocabulary is the run's Naming derivation), never from
 *   the payload's `bridgeSource` field; the whole section is judged, never record by record; ordered
 *   checks, first failure decides the state; an absent section gives no record; Stage 1A's record is read
 *   only for consistency and never changed; diagnostics stay in the intake and are never findings.
 */
import { TREE_NAMING_FIELD_GROUP_STATES } from './tree-naming-section-intake.logic.mjs';

const SOURCE_ID = 'tree-role-category-vocabulary-evidence';
const SECTION_KEY = 'namingRoleCategoryVocabulary';
// Version 2 only (bridge contract §4.9.1): v1, or any other version, is `unsupported` and is never read as
// admissibility evidence.
const SECTION_VERSION = 'naming-role-category-vocabulary.v2';
const DIAGNOSTIC_SECTION = 'naming-role-category-vocabulary';
const REGISTRY_SOURCES = new Set(['builtin', 'custom', 'candidate']);
const ENVELOPE_KEYS = Object.freeze([
  'contractVersion', 'producerId', 'source', 'registrySource', 'categoryRolePerspectiveDigest', 'rolesDigest', 'recordCount', 'records', 'admissibleCategories',
]);
const RECORD_KEYS = new Set(['category', 'roles']);

export const TREE_BRIDGE_ORIGINS = Object.freeze({ treeBuilt: 'tree-built', callerSupplied: 'caller-supplied' });
// Whether the staged vocabulary Tree passed to the producer is the run's own Naming derivation (Tree spec S1.1).
export const TREE_VOCABULARY_ORIGINS = Object.freeze({ namingDerived: 'naming-derived', callerSupplied: 'caller-supplied' });

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
  invalidAdmissibleBound: 'invalid-admissible-bound',
  callerSupplied: 'caller-supplied',
  vocabularyNotNamingDerived: 'vocabulary-not-naming-derived',
  runProvenanceUnavailable: 'run-provenance-unavailable',
  sourceMismatch: 'source-mismatch',
  digestMismatch: 'digest-mismatch',
  rolesDigestMismatch: 'roles-digest-mismatch',
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

// [2.4] cfg-treeStructureAdvisor · Primitive · "isAdmissibleBound"
// Concern: Logic · Parent: "invalidReasonOf"
// Notes: §4.9.1 consumer rule: an array of non-empty strings, sorted, duplicate-free, each the category of a
// record. An empty array is a valid empty bound, never read as unavailable (Tree spec S1.3, v2).
const isAdmissibleBound = (bound, records) => {
  if (!Array.isArray(bound) || !bound.every(isNonEmptyString) || !isStrictlyAscending(bound)) return false;
  const declared = new Set(records.map((record) => record.category));
  return bound.every((category) => declared.has(category));
};

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
    !isNonEmptyString(section.rolesDigest) ||
    !Array.isArray(section.records) ||
    !Number.isInteger(section.recordCount)
  ) {
    return REASONS.invalidEnvelope;
  }
  if (!section.records.every(isValidRecord)) return REASONS.invalidRecord;
  if (!isStrictlyAscending(section.records.map((record) => record.category))) return REASONS.unsortedOrDuplicateCategory;
  if (section.recordCount !== section.records.length) return REASONS.recordCountMismatch;
  if (!isAdmissibleBound(section.admissibleCategories, section.records)) return REASONS.invalidAdmissibleBound;
  return null;
};

// [2.4] cfg-treeStructureAdvisor · Primitive · "provenanceMismatchReasonOf"
// Concern: Logic · Parent: "prepareTreeRoleCategoryVocabularyIntake"
// Notes: S1.2 check 4, strict (v2): the run's own provenance entries for `naming/category-role-perspective`
// and `naming/roles` must both exist and agree with the section on source and digest.
const isRunProvenanceEntry = (entry) => isPlainObject(entry) && isNonEmptyString(entry.source) && isNonEmptyString(entry.digest);
const provenanceMismatchReasonOf = (section, perspectiveProvenance, rolesProvenance) => {
  if (!isRunProvenanceEntry(perspectiveProvenance) || !isRunProvenanceEntry(rolesProvenance)) return REASONS.runProvenanceUnavailable;
  if (perspectiveProvenance.source !== section.registrySource || rolesProvenance.source !== section.registrySource) return REASONS.sourceMismatch;
  if (perspectiveProvenance.digest !== section.categoryRolePerspectiveDigest) return REASONS.digestMismatch;
  if (rolesProvenance.digest !== section.rolesDigest) return REASONS.rolesDigestMismatch;
  return null;
};

// [2.4] cfg-treeStructureAdvisor · Primitive · "missingObservedCategoriesOf"
// Concern: Logic · Parent: "prepareTreeRoleCategoryVocabularyIntake"
// Notes: S1.2 check 5 (v2): the `roleCategory` of every accepted §4.5 role-fact group in Stage 1A's record
// that the admissible bound lacks, sorted. A declared but non-admissible category counts as missing. Bounds
// disagreement with observed evidence; proves nothing about the rest.
const missingObservedCategoriesOf = (section, sectionIntake) => {
  const declared = new Set(section.admissibleCategories);
  const observed = new Set(
    (sectionIntake?.semanticEvidenceEnrichment?.acceptedRecords ?? [])
      .filter((record) => record.roleFactGroup === TREE_NAMING_FIELD_GROUP_STATES.ACCEPTED && isNonEmptyString(record.roleCategory))
      .map((record) => record.roleCategory),
  );
  return [...observed].filter((category) => !declared.has(category)).sort();
};

const toIntake = ({ state, bridgeOrigin, vocabularyOrigin, reason, vocabulary = null, missingCategories }) =>
  Object.freeze({
    source: SOURCE_ID,
    state,
    bridgeOrigin: bridgeOrigin ?? null,
    vocabularyOrigin: vocabularyOrigin ?? null,
    vocabulary,
    diagnostics: reason
      ? [{ section: DIAGNOSTIC_SECTION, state, reason, ...(missingCategories ? { missingCategories } : {}) }]
      : [],
  });

// [2.4] cfg-treeStructureAdvisor · Container · "prepareTreeRoleCategoryVocabularyIntake"
// Concern: Logic · Parent: Tree wiring
// Notes: reads only the payload's §4.9 section, version 2 (§4.9.1). Returns `null` when the payload carries none (`absent`).
// Otherwise the S1.2 checks in order, the first failure deciding the state: version (`unsupported`),
// whole-section validity (`invalid`), origin (`untrusted` unless `bridgeOrigin` is exactly `tree-built` and
// `vocabularyOrigin` exactly `naming-derived`), strict run provenance (`mismatched`), consistency with
// Stage 1A's accepted role facts (`inconsistent`), else `usable`. The payload's own `bridgeSource` is never
// read. Tree building the payload is not enough: the completeness guarantee is the Naming derivation's.
export const prepareTreeRoleCategoryVocabularyIntake = ({
  namingOccurrenceBridge,
  bridgeOrigin,
  vocabularyOrigin,
  runCategoryRolePerspectiveProvenance,
  runRolesProvenance,
  sectionIntake,
} = {}) => {
  const payload = isPlainObject(namingOccurrenceBridge) ? namingOccurrenceBridge : null;
  if (!payload || payload[SECTION_KEY] === undefined) return null;
  const section = payload[SECTION_KEY];
  if (isPlainObject(section) && section.contractVersion !== SECTION_VERSION) {
    return toIntake({ state: STATES.unsupported, bridgeOrigin, vocabularyOrigin, reason: REASONS.unsupportedVersion });
  }
  const invalidReason = isPlainObject(section) ? invalidReasonOf(section) : REASONS.invalidEnvelope;
  if (invalidReason) return toIntake({ state: STATES.invalid, bridgeOrigin, vocabularyOrigin, reason: invalidReason });
  if (bridgeOrigin !== TREE_BRIDGE_ORIGINS.treeBuilt) {
    return toIntake({ state: STATES.untrusted, bridgeOrigin, vocabularyOrigin, reason: REASONS.callerSupplied });
  }
  if (vocabularyOrigin !== TREE_VOCABULARY_ORIGINS.namingDerived) {
    return toIntake({ state: STATES.untrusted, bridgeOrigin, vocabularyOrigin, reason: REASONS.vocabularyNotNamingDerived });
  }
  const mismatchReason = provenanceMismatchReasonOf(section, runCategoryRolePerspectiveProvenance, runRolesProvenance);
  if (mismatchReason) return toIntake({ state: STATES.mismatched, bridgeOrigin, vocabularyOrigin, reason: mismatchReason });
  const missingCategories = missingObservedCategoriesOf(section, sectionIntake);
  if (missingCategories.length > 0) {
    return toIntake({ state: STATES.inconsistent, bridgeOrigin, vocabularyOrigin, reason: REASONS.observedCategoryMissing, missingCategories });
  }
  return toIntake({
    state: STATES.usable,
    bridgeOrigin,
    vocabularyOrigin,
    vocabulary: Object.freeze({
      registrySource: section.registrySource,
      categoryRolePerspectiveDigest: section.categoryRolePerspectiveDigest,
      rolesDigest: section.rolesDigest,
      records: section.records.map(({ category, roles }) => ({ category, roles: [...roles] })),
      admissibleCategories: [...section.admissibleCategories],
    }),
  });
};

// [2.4] cfg-treeStructureAdvisor · Container · "toTreeUsableRoleCategoryVocabulary"
// Concern: Logic · Parent: a future S3.6 slice (Tree spec S3.6 future rule; not read at runtime yet)
// Notes: the vocabulary only for a `usable` intake; `null` for every other state and for an absent section.
export const toTreeUsableRoleCategoryVocabulary = (intake) =>
  intake?.state === STATES.usable && intake.vocabulary ? intake.vocabulary : null;
