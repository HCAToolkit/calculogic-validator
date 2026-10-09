/**
 * Tree's registry-set validation entry point (#41 registry lifecycle, spec §9.3).
 *
 * Runs Tree's own shape validation over one Tree registry root, one registry at a time, and returns
 * a deterministic list of `{ registryId, detail }` failures. It builds no runtime state. Tree's
 * runtime loaders keep reading Builtin until Tree adopts resolved roots (#41 slice 3); registries
 * without a Tree loader are checked as parseable JSON objects only.
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
import { TREE_REGISTRY_INVENTORY } from './tree-registry-inventory.knowledge.mjs';

const readRegistryPayload = (registryRoot, fileName) =>
  JSON.parse(fs.readFileSync(path.join(registryRoot, fileName), 'utf8'));

const assertObjectPayload = (payload, name) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`Invalid ${name} registry: expected object payload.`);
  }

  return payload;
};

// Validators that read their registry file themselves.
const TREE_REGISTRY_FILE_VALIDATORS = Object.freeze({
  'shim-detection-signals': loadShimDetectionSignalsRegistryPayload,
  'validator-owned-signals': loadValidatorOwnedSignalsRegistryPayload,
});

const TREE_REGISTRY_PAYLOAD_VALIDATORS = Object.freeze({
  'folder-kinds': normalizeFolderKindsRegistryPayload,
  'repo-shape-policy': normalizeTreeRepoShapePolicyRegistryPayload,
  'semantic-naming-folder-type-relationships': assertValidSemanticNamingFolderTypeRelationshipsRegistry,
  'structural-context-assessment-policies': normalizeStructuralContextAssessmentPoliciesRegistryPayload,
  'structural-homes': normalizeStructuralHomesRegistryPayload,
  'structural-role-tokens': assertValidStructuralRoleTokensRegistry,
});

export const validateTreeRegistrySet = (registryRoot) => {
  const failures = [];

  for (const entry of TREE_REGISTRY_INVENTORY) {
    try {
      const validateFile = TREE_REGISTRY_FILE_VALIDATORS[entry.name];
      if (validateFile) {
        validateFile(path.join(registryRoot, entry.fileName));
        continue;
      }

      const payload = readRegistryPayload(registryRoot, entry.fileName);
      const validatePayload = TREE_REGISTRY_PAYLOAD_VALIDATORS[entry.name];
      if (validatePayload) {
        validatePayload(payload);
      } else {
        assertObjectPayload(payload, entry.name);
      }
    } catch (error) {
      failures.push({ registryId: entry.registryId, detail: error.message });
    }
  }

  return failures.sort((left, right) =>
    left.registryId === right.registryId ? 0 : left.registryId < right.registryId ? -1 : 1,
  );
};
