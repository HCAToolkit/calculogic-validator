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

// [6.3] cfg-registryLifecycle · Primitive · "Missing-set blocking condition" (spec §7.1 item 1)
// Blocks activation and an active-Custom run when no Custom set exists. It is not a `customIssues`
// condition, because `customIssues` describe an existing set.
export const CUSTOM_SET_MISSING_CONDITION = 'missing-set';

// [6.3] cfg-registryLifecycle · Primitive · "Lifecycle error code"
export const REGISTRY_LIFECYCLE_ERROR_CODE = 'REGISTRY_LIFECYCLE_ERROR';
