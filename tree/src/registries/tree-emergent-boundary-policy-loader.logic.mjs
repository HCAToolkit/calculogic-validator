/**
 * Tree adopted Stage 3 policy loader (Tree spec S3.8, S3.13.6; calculogic-validator#171).
 *
 * Prepares the adopted emergent-boundary policy from the run's lifecycle resolution: the resolved Tree
 * root and the registry's `registryProvenance` (lifecycle spec §11.2). It never reports a registry it did
 * not read or provenance it cannot establish, as the Semantic Home parameter loader (Tree spec S2.9):
 * - a resolution: the resolved registry, whatever its source (`builtin`, `custom` or `candidate`);
 * - no resolution and no root, or the Builtin root: the cached Builtin registry, with the digest the
 *   lifecycle's canonical digest gives;
 * - an explicit non-Builtin root without a resolution: `not-prepared`, never Builtin in its place.
 * It decides nothing: Stage 3 validates the policy against its source and applies it (S3.13.6).
 */
import path from 'node:path';
import { digestRegistryPayload } from '../../../src/core/registry-lifecycle/registry-lifecycle-canonical-digest.logic.mjs';
import { descriptorForPayload } from '../../../src/core/registry-lifecycle/registry-lifecycle-migration.logic.mjs';
import {
  EMERGENT_BOUNDARY_POLICY_REGISTRY_ID,
  getBuiltinEmergentBoundaryPolicyRegistry,
  loadEmergentBoundaryPolicyRegistryFromRegistryRoot,
  toTreeEmergentBoundaryAdoptedPolicy,
} from './tree-emergent-boundary-policy-registry.logic.mjs';
import {
  TREE_BUILTIN_REGISTRY_ROOT,
  TREE_REGISTRY_INVENTORY,
  TREE_REGISTRY_SLICE_ID,
} from './tree-registry-inventory.knowledge.mjs';

export const TREE_EMERGENT_BOUNDARY_POLICY_AVAILABILITY = Object.freeze({
  available: 'available',
  notPrepared: 'not-prepared',
});
export const TREE_EMERGENT_BOUNDARY_POLICY_UNAVAILABLE_REASONS = Object.freeze({
  registryResolutionAbsent: 'registry-resolution-absent',
});

const registryEntry = TREE_REGISTRY_INVENTORY.find((entry) => entry.registryId === EMERGENT_BOUNDARY_POLICY_REGISTRY_ID);

export const NOT_PREPARED_TREE_EMERGENT_BOUNDARY_POLICY = Object.freeze({
  availability: TREE_EMERGENT_BOUNDARY_POLICY_AVAILABILITY.notPrepared,
  reason: TREE_EMERGENT_BOUNDARY_POLICY_UNAVAILABLE_REASONS.registryResolutionAbsent,
});

const prepareFromResolution = (registryResolution, payload) => {
  const provenance = registryResolution.registryProvenance?.[TREE_REGISTRY_SLICE_ID]?.[EMERGENT_BOUNDARY_POLICY_REGISTRY_ID];
  if (!provenance) {
    throw new Error(`The registry resolution has no provenance for ${EMERGENT_BOUNDARY_POLICY_REGISTRY_ID}.`);
  }

  return Object.freeze({
    availability: TREE_EMERGENT_BOUNDARY_POLICY_AVAILABILITY.available,
    policy: toTreeEmergentBoundaryAdoptedPolicy(payload),
    registry: Object.freeze({
      registryId: EMERGENT_BOUNDARY_POLICY_REGISTRY_ID,
      version: payload.version,
      source: provenance.source,
      digest: provenance.digest,
    }),
  });
};

let cachedBuiltinAdoptedPolicy = null;

// The Builtin policy for direct library calls: the provenance a Builtin resolution would report.
export const getBuiltinTreeEmergentBoundaryPolicy = () => {
  if (cachedBuiltinAdoptedPolicy === null) {
    const payload = getBuiltinEmergentBoundaryPolicyRegistry();
    cachedBuiltinAdoptedPolicy = prepareFromResolution(
      {
        registryProvenance: {
          [TREE_REGISTRY_SLICE_ID]: {
            [EMERGENT_BOUNDARY_POLICY_REGISTRY_ID]: {
              source: 'builtin',
              digest: digestRegistryPayload(payload, descriptorForPayload(registryEntry, payload)),
            },
          },
        },
      },
      payload,
    );
  }

  return cachedBuiltinAdoptedPolicy;
};

// `registryResolution` is the run's lifecycle resolution; `registryRoots` matters only without one.
export const loadTreeEmergentBoundaryPolicy = ({ registryResolution, registryRoots } = {}) => {
  if (registryResolution) {
    const payload = loadEmergentBoundaryPolicyRegistryFromRegistryRoot(registryResolution.registryRoots[TREE_REGISTRY_SLICE_ID]);
    return prepareFromResolution(registryResolution, payload);
  }

  const treeRegistryRoot = registryRoots?.[TREE_REGISTRY_SLICE_ID];
  if (treeRegistryRoot === undefined || path.resolve(treeRegistryRoot) === path.resolve(TREE_BUILTIN_REGISTRY_ROOT)) {
    return getBuiltinTreeEmergentBoundaryPolicy();
  }

  return NOT_PREPARED_TREE_EMERGENT_BOUNDARY_POLICY;
};
