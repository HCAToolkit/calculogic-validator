/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Knowledge
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md
 * Responsibility: Fixed vocabulary, file names and schema versions of the Builtin/Custom registry lifecycle.
 * Invariants: values mirror doc/ValidatorSpecs/suite-owned/registry-lifecycle-builtin-custom.spec.md; no logic.
 */

// [6.3] cfg-registryLifecycle · Primitive · "Lifecycle root segments"
export const REGISTRY_LIFECYCLE_ROOT_SEGMENTS = Object.freeze(['.calculogic', 'registries']);

// [6.3] cfg-registryLifecycle · Primitive · "Lifecycle file and folder names"
export const REGISTRY_STATE_FILENAME = 'registry-state.json';
export const CUSTOM_SET_DIRNAME = 'custom';
export const BASELINE_DIRNAME = '.baseline';
export const REGISTRY_SET_MANIFEST_FILENAME = 'registry-set.manifest.json';
export const REGISTRY_FILENAME_SUFFIX = '.registry.json';

// [6.3] cfg-registryLifecycle · Primitive · "Schema versions"
export const REGISTRY_STATE_SCHEMA_VERSION = '1';
export const REGISTRY_SET_MANIFEST_SCHEMA_VERSION = '1';

// [6.3] cfg-registryLifecycle · Primitive · "Active set vocabulary"
export const ACTIVE_SET_BUILTIN = 'builtin';
export const ACTIVE_SET_CUSTOM = 'custom';
export const ACTIVE_SET_VALUES = Object.freeze([ACTIVE_SET_BUILTIN, ACTIVE_SET_CUSTOM]);

// [6.3] cfg-registryLifecycle · Primitive · "customIssues conditions" (spec §11.1)
export const CUSTOM_ISSUE_CONDITIONS = Object.freeze({
  missing: 'missing',
  versionIncompatible: 'version-incompatible',
  invalid: 'invalid',
  manifestMalformed: 'manifest-malformed',
  baselineMismatch: 'baseline-mismatch',
  interruptedTransaction: 'interrupted-transaction',
});

// [6.3] cfg-registryLifecycle · Primitive · "status classifications in precedence order" (spec §12.1)
export const STATUS_CLASSIFICATIONS = Object.freeze([
  'missing',
  'orphan',
  'invalid',
  'version-incompatible',
  'baseline-unavailable',
  'aligned',
  'both-changed',
  'custom-modified',
  'builtin-changed',
  'unchanged',
]);

// [6.3] cfg-registryLifecycle · Primitive · "Comparison collection kinds" (spec §8.4)
export const COMPARISON_KINDS = Object.freeze(['value', 'keyed', 'members']);

// [6.3] cfg-registryLifecycle · Primitive · "Entry classes" (spec §8.2)
export const ENTRY_CLASSES = Object.freeze({
  builtinAdded: 'builtin-added',
  builtinChanged: 'builtin-changed',
  builtinRemoved: 'builtin-removed',
  customOnly: 'custom-only',
  aligned: 'aligned',
  bothChanged: 'both-changed',
});

// [6.3] cfg-registryLifecycle · Primitive · "diff registry classes in precedence order" (spec §12.3)
export const DIFF_REGISTRY_CLASSES = Object.freeze([
  'orphan',
  'registry-added',
  'version-changed',
  'not-comparable',
  'differs',
  'unchanged',
]);

// [6.3] cfg-registryLifecycle · Primitive · "Update decisions document" (spec §12.4)
export const UPDATE_DECISIONS_KIND = 'calculogic-registry-update-decisions';
export const UPDATE_DECISIONS_SCHEMA_VERSION = '2';
// Schema `"1"` predates structured decisions: every decision is a string or null (spec §12.4).
export const UPDATE_DECISIONS_READABLE_SCHEMA_VERSIONS = Object.freeze(['1', UPDATE_DECISIONS_SCHEMA_VERSION]);

// [6.3] cfg-registryLifecycle · Primitive · "Registry-level decisions by diff registry class" (spec §12.4)
// Only `registry-added` takes a registry-level decision; `differs` registries are decided per entry.
export const REGISTRY_DECISIONS_BY_CLASS = Object.freeze({
  'registry-added': Object.freeze(['inherit']),
});

// [6.3] cfg-registryLifecycle · Primitive · "Entry decisions" (spec §12.4)
export const ENTRY_DECISIONS = Object.freeze({ keepCustom: 'keep-custom', takeBuiltin: 'take-builtin' });

// [6.3] cfg-registryLifecycle · Primitive · "Structured entry decision kinds" (spec §12.7)
// Accepted only where the entry's collection declares them, and only on these classes, where both
// a Builtin and a Custom form exist.
export const STRUCTURED_ENTRY_DECISIONS = Object.freeze({ mergeFields: 'merge-fields', addAlongside: 'add-alongside' });
export const STRUCTURED_DECISION_CLASSES = Object.freeze(['builtin-changed', 'both-changed']);

// [6.3] cfg-registryLifecycle · Primitive · "Entry decisions by entry class" (spec §12.4)
// The decidable entry classes and the choices each accepts. `custom-only` is kept and `aligned`
// counts as decided (spec §8.2), so neither takes a decision.
const CONTENT_ENTRY_DECISIONS = Object.freeze([ENTRY_DECISIONS.keepCustom, ENTRY_DECISIONS.takeBuiltin]);
export const ENTRY_DECISIONS_BY_CLASS = Object.freeze({
  'builtin-added': CONTENT_ENTRY_DECISIONS,
  'builtin-changed': CONTENT_ENTRY_DECISIONS,
  'builtin-removed': CONTENT_ENTRY_DECISIONS,
  'both-changed': CONTENT_ENTRY_DECISIONS,
});

// [6.3] cfg-registryLifecycle · Primitive · "Update decisions problems" (spec §12.4)
export const UPDATE_DECISIONS_PROBLEMS = Object.freeze({
  malformed: 'malformed',
  unknownRegistry: 'unknown-registry',
  duplicateRegistry: 'duplicate-registry',
  notDecidable: 'not-decidable',
  stale: 'stale',
  unknownEntry: 'unknown-entry',
  duplicateEntry: 'duplicate-entry',
  missingEntry: 'missing-entry',
  entryClassMismatch: 'entry-class-mismatch',
  unsupportedDecision: 'unsupported-decision',
  invalidDecision: 'invalid-decision',
});

// [6.3] cfg-registryLifecycle · Primitive · "Lifecycle transaction" (spec §4.6)
// The transaction directory lives in the lifecycle root, outside `custom/`.
export const LIFECYCLE_TRANSACTION_DIRNAME = '.lifecycle-transaction';
export const LIFECYCLE_TRANSACTION_JOURNAL_FILENAME = 'journal.json';
export const LIFECYCLE_TRANSACTION_SCHEMA_VERSION = '1';
export const LIFECYCLE_TRANSACTION_OUTCOMES = Object.freeze({ committed: 'committed', rolledBack: 'rolled-back' });

// [6.3] cfg-registryLifecycle · Primitive · "update skip reasons" (spec §12.5)
export const UPDATE_SKIP_REASONS = Object.freeze({
  undecided: 'undecided',
  notYetSupported: 'not-yet-supported',
});

// [6.3] cfg-registryLifecycle · Primitive · "Migration plan" (spec §12.8)
export const MIGRATION_PLAN_KIND = 'calculogic-registry-migration-plan';
export const MIGRATION_PLAN_SCHEMA_VERSION = '1';
export const MIGRATION_PLAN_DECISIONS = Object.freeze({ accept: 'accept' });

// [6.3] cfg-registryLifecycle · Primitive · "Not-migratable reasons in precedence order" (spec §12.8)
export const NOT_MIGRATABLE_REASONS = Object.freeze({
  noMigrationPath: 'no-migration-path',
  baselineMismatch: 'baseline-mismatch',
  missing: 'missing',
  invalid: 'invalid',
  customVersionMismatch: 'custom-version-mismatch',
  transformFailed: 'transform-failed',
});

// [6.3] cfg-registryLifecycle · Primitive · "Migration plan problems" (spec §12.8)
export const MIGRATION_PLAN_PROBLEMS = Object.freeze({
  malformed: 'malformed',
  unknownRegistry: 'unknown-registry',
  duplicateRegistry: 'duplicate-registry',
  notMigratable: 'not-migratable',
  stale: 'stale',
  unsupportedDecision: 'unsupported-decision',
});

// [6.3] cfg-registryLifecycle · Primitive · "Edit document" (spec §12.10)
export const EDIT_DOCUMENT_KIND = 'calculogic-registry-edit';
export const EDIT_DOCUMENT_SCHEMA_VERSION = '1';
export const EDIT_OPERATIONS = Object.freeze({ add: 'add', change: 'change', remove: 'remove' });

// [6.3] cfg-registryLifecycle · Primitive · "Edit document problems" (spec §12.10)
export const EDIT_DOCUMENT_PROBLEMS = Object.freeze({
  malformed: 'malformed',
  unknownRegistry: 'unknown-registry',
  duplicateRegistry: 'duplicate-registry',
  notEditable: 'not-editable',
  stale: 'stale',
  invalidAddress: 'invalid-address',
  unsupportedOperation: 'unsupported-operation',
  duplicateAddress: 'duplicate-address',
  absentEntry: 'absent-entry',
  presentEntry: 'present-entry',
  invalidValue: 'invalid-value',
  inconsistentOperations: 'inconsistent-operations',
  invalidResult: 'invalid-result',
});

// [6.3] cfg-registryLifecycle · Primitive · "migrate skip reasons" (spec §12.9)
export const MIGRATE_SKIP_REASONS = Object.freeze({ undecided: 'undecided' });

// [6.3] cfg-registryLifecycle · Primitive · "Missing-set blocking condition" (spec §7.1 item 1)
// Blocks activation and an active-Custom run when no Custom set exists. It is not a `customIssues`
// condition, because `customIssues` describe an existing set; the one exception,
// `interrupted-transaction`, belongs to the lifecycle root and is reported either way.
export const CUSTOM_SET_MISSING_CONDITION = 'missing-set';

// [6.3] cfg-registryLifecycle · Primitive · "Lifecycle error code"
export const REGISTRY_LIFECYCLE_ERROR_CODE = 'REGISTRY_LIFECYCLE_ERROR';
