/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Knowledge
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§6.1)
 * Responsibility: Tree's registry inventory for the Builtin/Custom registry lifecycle.
 * Invariants: lists only Tree-owned registries; descriptors declare comparison canonicalization
 *   only (spec §5), and set-like paths are declared only where Tree's loaders already treat
 *   order as insignificant.
 */
import { fileURLToPath } from 'node:url';

export const TREE_REGISTRY_SLICE_ID = 'tree';

export const TREE_BUILTIN_REGISTRY_ROOT = fileURLToPath(new URL('./_builtin/', import.meta.url));

const READABLE_VERSIONS_V1 = Object.freeze(['1']);

const defineTreeRegistry = (name, descriptor = {}) =>
  Object.freeze({
    registryId: `${TREE_REGISTRY_SLICE_ID}/${name}`,
    name,
    fileName: `${name}.registry.json`,
    readableVersions: READABLE_VERSIONS_V1,
    descriptor: Object.freeze(descriptor),
  });

// [6.1] cfg-registryLifecycle · Container · "Tree registry inventory"
export const TREE_REGISTRY_INVENTORY = Object.freeze([
  defineTreeRegistry('folder-kinds', { setLike: [{ path: 'folderKinds', key: 'folderKind' }] }),
  defineTreeRegistry('repo-shape-policy', { setLike: [{ path: 'allowedTopLevelDirectories' }] }),
  defineTreeRegistry('semantic-home-policy', { setLike: [{ path: 'semanticHomePolicy', key: 'policyId' }] }),
  // At most one rule can match (relationshipPerspective is unique), so order carries no meaning.
  defineTreeRegistry('semantic-naming-folder-type-relationships', {
    setLike: [{ path: 'semanticNamingFolderTypeRelationships', key: 'relationshipPerspective' }],
  }),
  // The loader converts all six vocabularies to Sets.
  defineTreeRegistry('shim-detection-signals', {
    setLike: [
      { path: 'shimDetectionSignals.folderSignals' },
      { path: 'shimDetectionSignals.nameTokenSignals' },
      { path: 'shimDetectionSignals.surfaceSegmentSignals' },
      { path: 'shimSuppressionVocabularies.nonRuntimeWeakSignalSurfaces' },
      { path: 'shimSuppressionVocabularies.detectorImplementationTokens' },
      { path: 'shimExtensionAllowlist.relevantFileExtensions' },
    ],
  }),
  // policyId is unique, a second match is an ambiguity error, and results are sorted.
  defineTreeRegistry('structural-context-assessment-policies', { setLike: [{ path: 'policies', key: 'policyId' }] }),
  defineTreeRegistry('structural-home-signal-policy', { setLike: [{ path: 'structuralHomeSignalPolicy', key: 'token' }] }),
  defineTreeRegistry('structural-homes', { setLike: [{ path: 'structuralHomes', key: 'structuralHome' }] }),
  defineTreeRegistry('structural-role-tokens', { setLike: [{ path: 'structuralRoleTokens', key: 'token' }] }),
  defineTreeRegistry('surface-structural-home-perspective', {
    setLike: [{ path: 'structuralHomesBySurface.*', key: 'structuralHome' }],
  }),
  // Both consumers test the matchers with .some(), so order and repetition carry no meaning.
  defineTreeRegistry('validator-owned-signals', { setLike: [{ path: 'validatorOwnedBasenameSignals', key: 'pattern' }] }),
]);

// [6.1] cfg-registryLifecycle · Container · "Tree retired registry inventory"
// Registries a release removed or renamed keep their id and canonical-form descriptor here, so an
// orphan's Baseline copy from an earlier release can still be verified (lifecycle spec §12.1). Empty
// until a tree registry is retired.
export const TREE_RETIRED_REGISTRY_INVENTORY = Object.freeze([]);

// [6.1] cfg-registryLifecycle · Primitive · "Tree reference edges" (spec §9.3; informative,
// enforced by Tree's registry-set validation entry point)
export const TREE_REGISTRY_REFERENCE_EDGES = Object.freeze([
  Object.freeze({
    from: 'tree/surface-structural-home-perspective',
    to: 'tree/structural-homes',
    via: 'structuralHomesBySurface[].structuralHome',
  }),
]);
