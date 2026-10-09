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
  defineTreeRegistry('semantic-naming-folder-type-relationships'),
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
  defineTreeRegistry('structural-context-assessment-policies'),
  defineTreeRegistry('structural-home-signal-policy', { setLike: [{ path: 'structuralHomeSignalPolicy', key: 'token' }] }),
  defineTreeRegistry('structural-homes', { setLike: [{ path: 'structuralHomes', key: 'structuralHome' }] }),
  defineTreeRegistry('structural-role-tokens', { setLike: [{ path: 'structuralRoleTokens', key: 'token' }] }),
  defineTreeRegistry('surface-structural-home-perspective', {
    setLike: [{ path: 'structuralHomesBySurface.*', key: 'structuralHome' }],
  }),
  defineTreeRegistry('validator-owned-signals'),
]);

// [6.1] cfg-registryLifecycle · Primitive · "Tree reference edges" (spec §9.3; informative,
// enforced by Tree's registry-set validation entry point)
export const TREE_REGISTRY_REFERENCE_EDGES = Object.freeze([
  Object.freeze({
    from: 'tree/surface-structural-home-perspective',
    to: 'tree/structural-homes',
    via: 'structuralHomesBySurface[].structuralHome',
  }),
]);
