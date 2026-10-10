/**
 * Tree's registry-set validation entry point (#41 registry lifecycle, spec §9.3).
 *
 * Runs Tree's own shape validation over one Tree registry root, one registry at a time, and returns
 * a deterministic list of `{ registryId, detail }` failures. It builds no runtime state. Tree's
 * runtime loaders keep reading Builtin until Tree adopts resolved roots (#41 slice 3). Every Tree
 * inventory registry has exactly one slice-owned validator; there is no generic fallback.
 */
import fs from 'node:fs';
import path from 'node:path';
import { normalizeFolderKindsRegistryPayload } from './tree-folder-kinds-registry.logic.mjs';
import { normalizeTreeRepoShapePolicyRegistryPayload } from './tree-repo-shape-policy-registry.logic.mjs';
import { assertValidSemanticNamingFolderTypeRelationshipsRegistry } from './tree-semantic-naming-folder-type-relationships-registry.logic.mjs';
import {
  loadShimDetectionSignalsRegistryPayload,
  loadValidatorOwnedSignalsRegistryPayload,
} from './tree-signal-policy-registry.logic.mjs';
import { normalizeStructuralContextAssessmentPoliciesRegistryPayload } from './tree-structural-context-assessment-policies-registry.logic.mjs';
import { normalizeStructuralHomesRegistryPayload } from './tree-structural-homes-registry.logic.mjs';
import { assertValidStructuralRoleTokensRegistry } from './tree-structural-role-tokens-registry.logic.mjs';
import { assertValidSemanticHomePolicyRegistry } from './tree-semantic-home-policy-registry.logic.mjs';
import { assertValidStructuralHomeSignalPolicyRegistry } from './tree-structural-home-signal-policy-registry.logic.mjs';
import {
  assertSurfaceStructuralHomePerspectiveReferences,
  assertValidSurfaceStructuralHomePerspectiveRegistry,
} from './tree-surface-structural-home-perspective-registry.logic.mjs';
import { assertRegistryRootFields } from '../../../src/core/registry-entry-shape.logic.mjs';
import { TREE_REGISTRY_INVENTORY } from './tree-registry-inventory.knowledge.mjs';

const readRegistryPayload = (registryRoot, fileName) =>
  JSON.parse(fs.readFileSync(path.join(registryRoot, fileName), 'utf8'));

// Validators that read their registry file themselves.
const TREE_REGISTRY_FILE_VALIDATORS = Object.freeze({
  'shim-detection-signals': loadShimDetectionSignalsRegistryPayload,
  'validator-owned-signals': loadValidatorOwnedSignalsRegistryPayload,
});

const TREE_REGISTRY_PAYLOAD_VALIDATORS = Object.freeze({
  'folder-kinds': normalizeFolderKindsRegistryPayload,
  'repo-shape-policy': normalizeTreeRepoShapePolicyRegistryPayload,
  'semantic-home-policy': assertValidSemanticHomePolicyRegistry,
  'semantic-naming-folder-type-relationships': assertValidSemanticNamingFolderTypeRelationshipsRegistry,
  'structural-context-assessment-policies': normalizeStructuralContextAssessmentPoliciesRegistryPayload,
  'structural-home-signal-policy': assertValidStructuralHomeSignalPolicyRegistry,
  'structural-homes': normalizeStructuralHomesRegistryPayload,
  'structural-role-tokens': assertValidStructuralRoleTokensRegistry,
  'surface-structural-home-perspective': assertValidSurfaceStructuralHomePerspectiveRegistry,
});

// Root fields of each Tree registry besides `version`. Payload roots are closed: a loader ignores
// an undeclared root field, so it would pass validation and never reach runtime.
const TREE_REGISTRY_ROOT_FIELDS = Object.freeze({
  'folder-kinds': ['folderKinds'],
  'repo-shape-policy': ['allowedTopLevelDirectories'],
  'semantic-home-policy': ['semanticHomePolicy'],
  'semantic-naming-folder-type-relationships': ['semanticNamingFolderTypeRelationships'],
  'shim-detection-signals': ['shimDetectionSignals', 'shimExtensionAllowlist', 'shimSuppressionVocabularies'],
  'structural-context-assessment-policies': ['policies'],
  'structural-home-signal-policy': ['structuralHomeSignalPolicy'],
  'structural-homes': ['structuralHomes'],
  'structural-role-tokens': ['structuralRoleTokens'],
  'surface-structural-home-perspective': ['structuralHomesBySurface'],
  'validator-owned-signals': ['validatorOwnedBasenameSignals'],
});

// Same-slice reference edges, checked against the resolved root once the referring registry's shape
// passed. Each check reads its registries and throws on a failed edge (lifecycle spec §9.3).
const TREE_REGISTRY_REFERENCE_CHECKS = Object.freeze({
  'surface-structural-home-perspective': (registryRoot) =>
    assertSurfaceStructuralHomePerspectiveReferences(
      readRegistryPayload(registryRoot, 'surface-structural-home-perspective.registry.json'),
      readRegistryPayload(registryRoot, 'structural-homes.registry.json'),
    ),
});

// Every inventory registry has exactly one validator; a gap is a programming error, never a pass.
const assertTreeValidatorCoverage = () => {
  const inventoryNames = TREE_REGISTRY_INVENTORY.map((entry) => entry.name).sort();
  const validatedNames = [
    ...Object.keys(TREE_REGISTRY_FILE_VALIDATORS),
    ...Object.keys(TREE_REGISTRY_PAYLOAD_VALIDATORS),
  ].sort();
  const rootFieldNames = Object.keys(TREE_REGISTRY_ROOT_FIELDS).sort();
  if (
    JSON.stringify(inventoryNames) !== JSON.stringify(validatedNames) ||
    JSON.stringify(inventoryNames) !== JSON.stringify(rootFieldNames)
  ) {
    throw new Error('Tree registry-set validation must check every Tree inventory registry exactly once.');
  }
};

export const validateTreeRegistrySet = (registryRoot) => {
  assertTreeValidatorCoverage();
  const failures = [];

  for (const entry of TREE_REGISTRY_INVENTORY) {
    try {
      assertRegistryRootFields(readRegistryPayload(registryRoot, entry.fileName), TREE_REGISTRY_ROOT_FIELDS[entry.name], {
        registryLabel: `Tree ${entry.name}`,
      });
      const validateFile = TREE_REGISTRY_FILE_VALIDATORS[entry.name];
      if (validateFile) {
        validateFile(path.join(registryRoot, entry.fileName));
        continue;
      }

      const payload = readRegistryPayload(registryRoot, entry.fileName);
      TREE_REGISTRY_PAYLOAD_VALIDATORS[entry.name](payload);
      TREE_REGISTRY_REFERENCE_CHECKS[entry.name]?.(registryRoot);
    } catch (error) {
      failures.push({ registryId: entry.registryId, detail: error.message });
    }
  }

  return failures.sort((left, right) =>
    left.registryId === right.registryId ? 0 : left.registryId < right.registryId ? -1 : 1,
  );
};
