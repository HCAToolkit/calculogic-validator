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

// [6.3] cfg-registryLifecycle · Primitive · "Activation gate" (spec §6, §13)
// Custom activation stays unavailable until every registry consumer of every inventory slice
// reads its resolved root. Tree adopts resolved roots in #41 slice 3; until then this is false.
export const CUSTOM_ACTIVATION_AVAILABLE = false;

// [6.3] cfg-registryLifecycle · Primitive · "Lifecycle error code"
export const REGISTRY_LIFECYCLE_ERROR_CODE = 'REGISTRY_LIFECYCLE_ERROR';
