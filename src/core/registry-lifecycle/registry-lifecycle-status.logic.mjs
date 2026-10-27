/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.3, §7.2)
 * Responsibility: Builds the deterministic `status` output of the registry lifecycle.
 * Invariants: read-only; the same on-disk state always yields the same output (lifecycle spec §12.1).
 */
import { assessCustomRegistrySet } from './registry-lifecycle-assessment.logic.mjs';
import { customBridgeSides, resolveBridgeCompatibility } from './registry-lifecycle-bridge-compatibility.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from './registry-lifecycle-inventory.knowledge.mjs';
import {
  readRegistryLifecycleState,
  resolveRegistryLifecyclePaths,
} from './registry-lifecycle-state.logic.mjs';
import { CUSTOM_ISSUE_CONDITIONS } from './registry-lifecycle.contracts.mjs';

// The Custom set's bridge compatibility (spec §9.4, §12.1), whether the set is active or not. While a
// lifecycle transaction is pending it is computed from the files as they are and marked
// `interruptedTransaction: true`: diagnostic evidence about those files, never a statement that the
// set is valid or committed. The transaction condition in `customIssues` keeps its authority.
const buildCustomBridgeCompatibility = ({ paths, assessment, slices }) => {
  const interrupted = assessment.customIssues.some((issue) => issue.condition === CUSTOM_ISSUE_CONDITIONS.interruptedTransaction);
  const { set, bridges } = resolveBridgeCompatibility({ set: 'custom', sideOf: customBridgeSides({ paths, assessment, slices }), slices });
  return { set, ...(interrupted ? { interruptedTransaction: true } : {}), bridges };
};

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
    // Omitted without a Custom set: the record never describes Builtin in its place.
    ...(assessment.customExists ? { bridgeCompatibility: buildCustomBridgeCompatibility({ paths, assessment, slices }) } : {}),
  };
};
