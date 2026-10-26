/**
 * Tree Semantic Home parameter set loader (Tree spec Stage 2 S2.9; calculogic-validator#102).
 *
 * Prepares `treeSemanticHomeParameterSet` from the run's lifecycle resolution: the resolved Tree root,
 * the registry's `registryProvenance` and the lifecycle Baseline entry comparison (lifecycle spec
 * §11.2, §11.4). It reads the resolved payload once and hands that same payload to the comparison and
 * the converter. It never reports a registry it did not read or provenance it cannot establish:
 * - a resolution: the resolved registry, whatever its source;
 * - no resolution and no root, or the Builtin root: the cached Builtin set;
 * - an explicit non-Builtin root without a resolution: `not-prepared`, never Builtin in its place.
 * It also computes, once per process, the source digest of the reasoning modules actually installed
 * (RR4, K2) and hands it to the converter; if any bound module cannot be read, the digest is null and
 * conformance stays `not-checked`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digestRegistryPayload } from '../../../src/core/registry-lifecycle/registry-lifecycle-canonical-digest.logic.mjs';
import { compareResolvedRegistryWithBaseline } from '../../../src/core/registry-lifecycle/registry-lifecycle-baseline-comparison.logic.mjs';
import { descriptorForPayload } from '../../../src/core/registry-lifecycle/registry-lifecycle-migration.logic.mjs';
import { TREE_SEMANTIC_HOME_REASONING_MODULES } from '../tree-semantic-home-conformance.knowledge.mjs';
import { digestTreeSemanticHomeReasoningSources } from '../tree-semantic-home-conformance.logic.mjs';
import {
  NOT_PREPARED_TREE_SEMANTIC_HOME_PARAMETER_SET,
  prepareTreeSemanticHomeParameterSet,
} from '../tree-semantic-home-parameter-set.logic.mjs';
import {
  TREE_BUILTIN_REGISTRY_ROOT,
  TREE_REGISTRY_INVENTORY,
  TREE_REGISTRY_SLICE_ID,
} from './tree-registry-inventory.knowledge.mjs';
import {
  SEMANTIC_HOME_POLICY_REGISTRY_ID,
  getBuiltinSemanticHomePolicyRegistry,
  loadSemanticHomePolicyRegistryFromRegistryRoot,
} from './tree-semantic-home-policy-registry.logic.mjs';

const registryEntry = TREE_REGISTRY_INVENTORY.find((entry) => entry.registryId === SEMANTIC_HOME_POLICY_REGISTRY_ID);

// This module sits at `tree/src/registries/` in the repository and in the installed package alike.
const PACKAGE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// K2: the digest of the bound modules under `packageRoot`, or null when any is missing or unreadable.
export const computeTreeSemanticHomeReasoningSourceDigest = ({ packageRoot = PACKAGE_ROOT } = {}) => {
  try {
    return digestTreeSemanticHomeReasoningSources(
      TREE_SEMANTIC_HOME_REASONING_MODULES.map((modulePath) => ({
        path: modulePath,
        text: fs.readFileSync(path.join(packageRoot, ...modulePath.split('/')), 'utf8'),
      })),
    );
  } catch {
    return null;
  }
};

let cachedReasoningSourceDigest;
const installedReasoningSourceDigest = () => {
  if (cachedReasoningSourceDigest === undefined) cachedReasoningSourceDigest = computeTreeSemanticHomeReasoningSourceDigest();
  return cachedReasoningSourceDigest;
};

// Provenance, comparison and conversion of one payload under one resolution.
const prepareFromResolution = (registryResolution, payload) => {
  const provenance = registryResolution.registryProvenance?.[TREE_REGISTRY_SLICE_ID]?.[SEMANTIC_HOME_POLICY_REGISTRY_ID];
  if (!provenance) {
    throw new Error(`The registry resolution has no provenance for ${SEMANTIC_HOME_POLICY_REGISTRY_ID}.`);
  }

  return prepareTreeSemanticHomeParameterSet({
    payload,
    registry: {
      registryId: SEMANTIC_HOME_POLICY_REGISTRY_ID,
      version: payload.version,
      source: provenance.source,
      digest: provenance.digest,
    },
    comparison: compareResolvedRegistryWithBaseline({
      resolution: registryResolution,
      registryId: SEMANTIC_HOME_POLICY_REGISTRY_ID,
      payload,
    }),
    reasoningSourceDigest: installedReasoningSourceDigest(),
  });
};

let cachedBuiltinParameterSet = null;

// The Builtin set for direct library calls: the provenance a Builtin resolution would report, with the
// digest from the lifecycle's own canonical digest (S2.9).
export const getBuiltinTreeSemanticHomeParameterSet = () => {
  if (cachedBuiltinParameterSet === null) {
    const payload = getBuiltinSemanticHomePolicyRegistry();
    const builtinResolution = {
      registryProvenance: {
        [TREE_REGISTRY_SLICE_ID]: {
          [SEMANTIC_HOME_POLICY_REGISTRY_ID]: {
            source: 'builtin',
            digest: digestRegistryPayload(payload, descriptorForPayload(registryEntry, payload)),
          },
        },
      },
    };
    cachedBuiltinParameterSet = prepareFromResolution(builtinResolution, payload);
  }

  return cachedBuiltinParameterSet;
};

// `registryResolution` is the run's lifecycle resolution; `registryRoots` matters only without one.
export const loadTreeSemanticHomeParameterSet = ({ registryResolution, registryRoots } = {}) => {
  if (registryResolution) {
    const payload = loadSemanticHomePolicyRegistryFromRegistryRoot(registryResolution.registryRoots[TREE_REGISTRY_SLICE_ID]);
    return prepareFromResolution(registryResolution, payload);
  }

  const treeRegistryRoot = registryRoots?.[TREE_REGISTRY_SLICE_ID];
  if (treeRegistryRoot === undefined || path.resolve(treeRegistryRoot) === path.resolve(TREE_BUILTIN_REGISTRY_ROOT)) {
    return getBuiltinTreeSemanticHomeParameterSet();
  }

  return NOT_PREPARED_TREE_SEMANTIC_HOME_PARAMETER_SET;
};
