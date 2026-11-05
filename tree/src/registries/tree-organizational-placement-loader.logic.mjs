/**
 * Tree organizational-placement policy loader (Tree spec S2.16).
 *
 * Prepares the organizational-placement policy from the run's lifecycle resolution: the resolved Tree
 * root and the registry's `registryProvenance` (lifecycle spec §11.2), as the adopted Stage 3 policy
 * loader does (S3.13.6):
 * - a resolution: the resolved registry, whatever its source (`builtin`, `custom` or `candidate`);
 * - no resolution and no root, or the Builtin root: the cached Builtin registry, with the digest the
 *   lifecycle's canonical digest gives;
 * - an explicit non-Builtin root without a resolution: `not-prepared`, never Builtin in its place.
 * It decides nothing, and no Tree consumer reads the prepared policy yet: relation classification is a
 * separately authorized slice (S2.16).
 */
import path from 'node:path';
import { digestRegistryPayload } from '../../../src/core/registry-lifecycle/registry-lifecycle-canonical-digest.logic.mjs';
import { descriptorForPayload } from '../../../src/core/registry-lifecycle/registry-lifecycle-migration.logic.mjs';
import {
  ORGANIZATIONAL_PLACEMENT_REGISTRY_ID,
  getBuiltinOrganizationalPlacementRegistry,
  loadOrganizationalPlacementRegistryFromRegistryRoot,
  toTreeOrganizationalPlacementPolicy,
} from './tree-organizational-placement-registry.logic.mjs';
import { TREE_BUILTIN_REGISTRY_ROOT, TREE_REGISTRY_INVENTORY, TREE_REGISTRY_SLICE_ID } from './tree-registry-inventory.knowledge.mjs';

export const TREE_ORGANIZATIONAL_PLACEMENT_AVAILABILITY = Object.freeze({ available: 'available', notPrepared: 'not-prepared' });
export const TREE_ORGANIZATIONAL_PLACEMENT_UNAVAILABLE_REASONS = Object.freeze({ registryResolutionAbsent: 'registry-resolution-absent' });

const registryEntry = TREE_REGISTRY_INVENTORY.find((entry) => entry.registryId === ORGANIZATIONAL_PLACEMENT_REGISTRY_ID);

export const NOT_PREPARED_TREE_ORGANIZATIONAL_PLACEMENT_POLICY = Object.freeze({
  availability: TREE_ORGANIZATIONAL_PLACEMENT_AVAILABILITY.notPrepared,
  reason: TREE_ORGANIZATIONAL_PLACEMENT_UNAVAILABLE_REASONS.registryResolutionAbsent,
});

const prepareFromResolution = (registryResolution, payload) => {
  const provenance = registryResolution.registryProvenance?.[TREE_REGISTRY_SLICE_ID]?.[ORGANIZATIONAL_PLACEMENT_REGISTRY_ID];
  if (!provenance) throw new Error(`The registry resolution has no provenance for ${ORGANIZATIONAL_PLACEMENT_REGISTRY_ID}.`);
  return Object.freeze({
    availability: TREE_ORGANIZATIONAL_PLACEMENT_AVAILABILITY.available,
    policy: toTreeOrganizationalPlacementPolicy(payload),
    registry: Object.freeze({ registryId: ORGANIZATIONAL_PLACEMENT_REGISTRY_ID, version: payload.version, source: provenance.source, digest: provenance.digest }),
  });
};

let cachedBuiltinPolicy = null;

// The Builtin policy for direct library calls: the provenance a Builtin resolution would report.
export const getBuiltinTreeOrganizationalPlacementPolicy = () => {
  if (cachedBuiltinPolicy === null) {
    const payload = getBuiltinOrganizationalPlacementRegistry();
    cachedBuiltinPolicy = prepareFromResolution(
      {
        registryProvenance: {
          [TREE_REGISTRY_SLICE_ID]: {
            [ORGANIZATIONAL_PLACEMENT_REGISTRY_ID]: { source: 'builtin', digest: digestRegistryPayload(payload, descriptorForPayload(registryEntry, payload)) },
          },
        },
      },
      payload,
    );
  }
  return cachedBuiltinPolicy;
};

// `registryResolution` is the run's lifecycle resolution; `registryRoots` matters only without one.
export const loadTreeOrganizationalPlacementPolicy = ({ registryResolution, registryRoots } = {}) => {
  if (registryResolution) {
    return prepareFromResolution(registryResolution, loadOrganizationalPlacementRegistryFromRegistryRoot(registryResolution.registryRoots[TREE_REGISTRY_SLICE_ID]));
  }
  const treeRegistryRoot = registryRoots?.[TREE_REGISTRY_SLICE_ID];
  if (treeRegistryRoot === undefined || path.resolve(treeRegistryRoot) === path.resolve(TREE_BUILTIN_REGISTRY_ROOT)) {
    return getBuiltinTreeOrganizationalPlacementPolicy();
  }
  return NOT_PREPARED_TREE_ORGANIZATIONAL_PLACEMENT_POLICY;
};
