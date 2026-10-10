/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Knowledge
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§6.1)
 * Responsibility: Naming's registry inventory for the Builtin/Custom registry lifecycle.
 * Invariants: lists only Naming-owned registries; descriptors declare comparison canonicalization
 *   only (spec §5), and set-like paths are declared only where Naming's loaders already treat
 *   order as insignificant.
 */
import { fileURLToPath } from 'node:url';

export const NAMING_REGISTRY_SLICE_ID = 'naming';

export const NAMING_BUILTIN_REGISTRY_ROOT = fileURLToPath(new URL('./_builtin/', import.meta.url));

const READABLE_VERSIONS_V1 = Object.freeze(['1']);

const defineNamingRegistry = (name, descriptor = {}) =>
  Object.freeze({
    registryId: `${NAMING_REGISTRY_SLICE_ID}/${name}`,
    name,
    fileName: `${name}.registry.json`,
    readableVersions: READABLE_VERSIONS_V1,
    descriptor: Object.freeze(descriptor),
  });

// [6.1] cfg-registryLifecycle · Container · "Naming registry inventory"
export const NAMING_REGISTRY_INVENTORY = Object.freeze([
  defineNamingRegistry('agnostic-core-meanings', { setLike: [{ path: 'meanings', key: 'meaning' }] }),
  defineNamingRegistry('case-rules'),
  defineNamingRegistry('categories', { setLike: [{ path: 'categories', key: 'category' }] }),
  defineNamingRegistry('category-role-perspective', {
    setLike: [
      { path: 'rolesByCategory.*', key: 'role' },
      { path: 'rolesByCategory.*[].agnosticCoreMeanings' },
      { path: 'rolesByCategory.*[].baseMeanings' },
      { path: 'rolesByCategory.*[].overlayMeanings' },
    ],
  }),
  defineNamingRegistry('finding-policy'),
  // The projection indexes active patterns by their unique folder name and sorts its observations,
  // so pattern order carries no meaning; `tokenOrder` stays ordered.
  defineNamingRegistry('folder-composition-patterns', {
    setLike: [
      { path: 'folderCompositionPatterns', key: 'patternId' },
      { path: 'folderSemanticContextPatterns', key: 'patternId' },
    ],
  }),
  defineNamingRegistry('missing-role-patterns', {
    setLike: [{ path: 'missingRolePatterns[].extensionSegmentIndexes' }],
  }),
  defineNamingRegistry('reportable-extensions', { setLike: [{ path: 'reportableExtensions' }] }),
  defineNamingRegistry('reportable-root-files', { setLike: [{ path: 'reportableRootFiles' }] }),
  defineNamingRegistry('roles', {
    setLike: [{ path: 'roles', key: 'role' }],
    omitEmpty: ['roles[].notes'],
  }),
  // `specialCases` is first-match ordered; its match lists are membership tests.
  defineNamingRegistry('special-cases', {
    setLike: [{ path: 'specialCases[].match.suffixEquals' }, { path: 'specialCases[].match.basenameEquals' }],
  }),
  defineNamingRegistry('summary-buckets'),
  defineNamingRegistry('walk-exclusions', {
    setLike: [{ path: 'excludedDirectories' }, { path: 'allowDotFiles' }],
  }),
]);

// [6.1] cfg-registryLifecycle · Container · "Naming retired registry inventory"
// Registries a release removed or renamed keep their id and canonical-form descriptor here, so an
// orphan's Baseline copy from an earlier release can still be verified (lifecycle spec §12.1). Empty
// until a naming registry is retired.
export const NAMING_RETIRED_REGISTRY_INVENTORY = Object.freeze([]);

// [6.1] cfg-registryLifecycle · Primitive · "Naming reference edges" (spec §9.3; informative,
// enforced by Naming's registry-set validation entry point)
export const NAMING_REGISTRY_REFERENCE_EDGES = Object.freeze([
  Object.freeze({ from: 'naming/category-role-perspective', to: 'naming/categories', via: 'rolesByCategory keys' }),
  Object.freeze({ from: 'naming/category-role-perspective', to: 'naming/roles', via: 'role status' }),
  Object.freeze({
    from: 'naming/category-role-perspective',
    to: 'naming/agnostic-core-meanings',
    via: 'agnosticCoreMeanings, baseMeanings and overlayMeanings values',
  }),
  Object.freeze({ from: 'naming/category-role-perspective', to: 'naming/category-role-perspective', via: 'inheritsFrom' }),
]);
