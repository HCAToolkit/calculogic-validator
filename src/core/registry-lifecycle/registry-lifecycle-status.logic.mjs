/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.3, §7.2)
 * Responsibility: Builds the deterministic `status` output of the registry lifecycle.
 * Invariants: read-only; the same on-disk state always yields the same output (lifecycle spec §12.1).
 */
import { assessCustomRegistrySet } from './registry-lifecycle-assessment.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from './registry-lifecycle-inventory.knowledge.mjs';
import {
  readRegistryLifecycleState,
  resolveRegistryLifecyclePaths,
} from './registry-lifecycle-state.logic.mjs';

// [7.2] cfg-registryLifecycle · Workflow · "buildRegistryLifecycleStatus"
export const buildRegistryLifecycleStatus = ({
  targetRoot,
  lifecycleRootOverride,
  slices = REGISTRY_LIFECYCLE_SLICES,
} = {}) => {
  const paths = resolveRegistryLifecyclePaths({ targetRoot, lifecycleRootOverride });
  const { activeSet } = readRegistryLifecycleState(paths);
  const assessment = assessCustomRegistrySet({ paths, slices });

  return {
    activeSet,
    customExists: assessment.customExists,
    customDiffers: assessment.customDiffers,
    ...(assessment.basedOn ? { basedOn: assessment.basedOn } : {}),
    ...(assessment.builtinDriftSinceBaseline !== undefined
      ? { builtinDriftSinceBaseline: assessment.builtinDriftSinceBaseline }
      : {}),
    ...(assessment.manifestError ? { manifestError: assessment.manifestError } : {}),
    orphanRegistries: assessment.orphanRegistries,
    customIssues: assessment.customIssues,
    registries: assessment.registries,
  };
};
