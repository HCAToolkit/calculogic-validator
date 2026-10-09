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
  defineTreeRegistry('semantic-home-policy'),
  defineTreeRegistry('semantic-naming-folder-type-relationships'),
  defineTreeRegistry('shim-detection-signals'),
  defineTreeRegistry('structural-context-assessment-policies'),
  defineTreeRegistry('structural-home-signal-policy'),
  defineTreeRegistry('structural-homes', { setLike: [{ path: 'structuralHomes', key: 'structuralHome' }] }),
  defineTreeRegistry('structural-role-tokens', { setLike: [{ path: 'structuralRoleTokens', key: 'token' }] }),
  defineTreeRegistry('surface-structural-home-perspective'),
  defineTreeRegistry('validator-owned-signals'),
]);
