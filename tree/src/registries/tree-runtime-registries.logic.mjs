/**
 * Tree runtime registries from one resolved Tree registry root (#41 registry lifecycle, spec §6, §9.3).
 *
 * The one place Tree turns its resolved registry root into runtime-ready registries. Tree wiring
 * passes the result into prepared dependencies and contributors, so the Tree runtime holds no
 * module-level registry state and every registry a run reads comes from the run's resolved set.
 * The Builtin root is cached; a Custom root is read per call, because its files are user-editable.
 *
 * `semantic-home-policy` is loaded by the Semantic Home parameter loader
 * (`tree-semantic-home-parameter-set-loader.logic.mjs`), re-exported here so this module stays Tree
 * wiring's one registry entry point; it takes the run's whole resolution, because its provenance needs
 * it (Tree spec S2.9). Tree inventory registries without a runtime consumer
 * (`structural-home-signal-policy`, `surface-structural-home-perspective`) are validated by the
 * registry-set entry point (`tree-registry-set.logic.mjs`) only.
 */
import path from 'node:path';
import { TREE_BUILTIN_REGISTRY_ROOT } from './tree-registry-inventory.knowledge.mjs';
import {
  getBuiltinFolderKindsRegistry,
  loadFolderKindsRegistryFromRegistryRoot,
} from './tree-folder-kinds-registry.logic.mjs';
import {
  getBuiltinTreeRepoShapePolicy,
  loadTreeRepoShapePolicyFromRegistryRoot,
} from './tree-repo-shape-policy-registry.logic.mjs';
import {
  getBuiltinSemanticNamingFolderTypeRelationshipsRegistry,
  loadSemanticNamingFolderTypeRelationshipsRegistryFromRegistryRoot,
} from './tree-semantic-naming-folder-type-relationships-registry.logic.mjs';
import {
  getBuiltinTreeSignalPolicy,
  loadTreeSignalPolicyFromRegistryRoot,
} from './tree-signal-policy-registry.logic.mjs';
import {
  getBuiltinStructuralContextAssessmentPoliciesRegistry,
  loadStructuralContextAssessmentPoliciesRegistryFromRegistryRoot,
} from './tree-structural-context-assessment-policies-registry.logic.mjs';
import {
  getBuiltinStructuralHomesRegistry,
  loadStructuralHomesRegistryFromRegistryRoot,
} from './tree-structural-homes-registry.logic.mjs';
import {
  getBuiltinStructuralRoleTokensRegistry,
  loadStructuralRoleTokensRegistryFromRegistryRoot,
} from './tree-structural-role-tokens-registry.logic.mjs';

export { loadTreeSemanticHomeParameterSet } from './tree-semantic-home-parameter-set-loader.logic.mjs';

let cachedBuiltinTreeRuntimeRegistries = null;

// The Builtin runtime registries, from the cached Builtin loaders.
export const getBuiltinTreeRuntimeRegistries = () => {
  if (cachedBuiltinTreeRuntimeRegistries === null) {
    cachedBuiltinTreeRuntimeRegistries = Object.freeze({
      signalPolicy: getBuiltinTreeSignalPolicy(),
      repoShapePolicy: getBuiltinTreeRepoShapePolicy(),
      structuralHomesRegistry: getBuiltinStructuralHomesRegistry(),
      folderKindsRegistry: getBuiltinFolderKindsRegistry(),
      semanticNamingFolderTypeRelationshipsRegistry: getBuiltinSemanticNamingFolderTypeRelationshipsRegistry(),
      structuralRoleTokensRegistry: getBuiltinStructuralRoleTokensRegistry(),
      structuralContextAssessmentPoliciesRegistry: getBuiltinStructuralContextAssessmentPoliciesRegistry(),
    });
  }

  return cachedBuiltinTreeRuntimeRegistries;
};

// Loads every runtime-consumed Tree registry from `treeRegistryRoot`. Without a root (a direct call
// outside a validation run) the Builtin registries are used.
export const loadTreeRuntimeRegistries = (treeRegistryRoot) => {
  if (treeRegistryRoot === undefined || path.resolve(treeRegistryRoot) === path.resolve(TREE_BUILTIN_REGISTRY_ROOT)) {
    return getBuiltinTreeRuntimeRegistries();
  }

  return Object.freeze({
    signalPolicy: loadTreeSignalPolicyFromRegistryRoot(treeRegistryRoot),
    repoShapePolicy: loadTreeRepoShapePolicyFromRegistryRoot(treeRegistryRoot),
    structuralHomesRegistry: loadStructuralHomesRegistryFromRegistryRoot(treeRegistryRoot),
    folderKindsRegistry: loadFolderKindsRegistryFromRegistryRoot(treeRegistryRoot),
    semanticNamingFolderTypeRelationshipsRegistry:
      loadSemanticNamingFolderTypeRelationshipsRegistryFromRegistryRoot(treeRegistryRoot),
    structuralRoleTokensRegistry: loadStructuralRoleTokensRegistryFromRegistryRoot(treeRegistryRoot),
    structuralContextAssessmentPoliciesRegistry:
      loadStructuralContextAssessmentPoliciesRegistryFromRegistryRoot(treeRegistryRoot),
  });
};
