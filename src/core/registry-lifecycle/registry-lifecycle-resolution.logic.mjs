/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.5, §5.4, §7.1)
 * Responsibility: Resolves the active registry set for one validation run into one resolved
 *   registry root per slice, plus the report provenance blocks.
 * Invariants: the active set is loaded whole; while the activation gate is closed, a state that
 *   selects `custom` is a lifecycle error; inactive Custom problems are reported, never blocking;
 *   validation runs never write lifecycle files (lifecycle spec §6, §7, §11).
 */
import path from 'node:path';
import { assessCustomRegistrySet } from './registry-lifecycle-assessment.logic.mjs';
import { digestRegistrySet } from './registry-lifecycle-canonical-digest.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from './registry-lifecycle-inventory.knowledge.mjs';
import {
  RegistryLifecycleError,
  readRegistryLifecycleState,
  resolveRegistryLifecyclePaths,
} from './registry-lifecycle-state.logic.mjs';
import {
  ACTIVE_SET_BUILTIN,
  ACTIVE_SET_CUSTOM,
  CUSTOM_ACTIVATION_AVAILABLE,
} from './registry-lifecycle.contracts.mjs';

// [5.2.5] cfg-registryLifecycle · Primitive · "Builtin registry roots"
export const getBuiltinRegistryRoots = ({ slices = REGISTRY_LIFECYCLE_SLICES } = {}) =>
  Object.freeze(Object.fromEntries(slices.map((slice) => [slice.sliceId, slice.builtinRoot])));

// [7.1] cfg-registryLifecycle · Primitive · "buildRegistrySetReport"
const buildRegistrySetReport = ({ activeSet, assessment, resolvedDigests }) => ({
  activeSet,
  customExists: assessment.customExists,
  customDiffers: assessment.customDiffers,
  ...(assessment.basedOn ? { basedOn: assessment.basedOn } : {}),
  ...(assessment.builtinDriftSinceBaseline !== undefined
    ? { builtinDriftSinceBaseline: assessment.builtinDriftSinceBaseline }
    : {}),
  orphanRegistries: [...assessment.orphanRegistries],
  customIssues: assessment.customIssues.map((issue) => ({ ...issue })),
  resolvedSetDigest: digestRegistrySet(resolvedDigests),
});

// [7.1] cfg-registryLifecycle · Primitive · "buildRegistryProvenance"
const buildRegistryProvenance = ({ activeSet, resolvedDigests, slices }) =>
  Object.freeze(
    Object.fromEntries(
      slices.map((slice) => [
        slice.sliceId,
        Object.fromEntries(
          slice.inventory.map((entry) => [
            entry.registryId,
            { source: activeSet, digest: resolvedDigests[entry.registryId] },
          ]),
        ),
      ]),
    ),
  );

// [5.2.5] cfg-registryLifecycle · Workflow · "resolveActiveRegistrySet"
// Returns:
// - `activeSet`;
// - `registryRoots`: one resolved registry root per slice id;
// - `customRegistryRoots`: the consumer Custom roots when a Custom set exists (used only for
//   transitional fields such as Naming's `registryDigests.custom`);
// - `registrySet`: the set-level report block (spec §11.1);
// - `registryProvenance`: per-slice `{ [registryId]: { source, digest } }` (spec §11.2).
export const resolveActiveRegistrySet = ({
  targetRoot,
  lifecycleRootOverride,
  slices = REGISTRY_LIFECYCLE_SLICES,
} = {}) => {
  const paths = resolveRegistryLifecyclePaths({ targetRoot, lifecycleRootOverride });
  const { activeSet } = readRegistryLifecycleState(paths);

  if (activeSet === ACTIVE_SET_CUSTOM && !CUSTOM_ACTIVATION_AVAILABLE) {
    throw new RegistryLifecycleError(
      [
        `Registry lifecycle state selects the Custom set (${paths.statePath}), but Custom activation is not available yet.`,
        'Custom activation becomes available once every registry consumer reads the resolved set (#41 slice 3).',
        'To continue, set "activeSet" to "builtin" in that file. Your Custom set is kept as it is.',
      ].join(' '),
    );
  }

  const assessment = assessCustomRegistrySet({ paths, slices });
  const resolvedDigests = assessment.builtinDigests;
  const customRegistryRoots = assessment.customExists
    ? Object.freeze(
        Object.fromEntries(slices.map((slice) => [slice.sliceId, path.join(paths.customRoot, slice.sliceId)])),
      )
    : undefined;

  return {
    activeSet: ACTIVE_SET_BUILTIN,
    registryRoots: getBuiltinRegistryRoots({ slices }),
    ...(customRegistryRoots ? { customRegistryRoots } : {}),
    registrySet: buildRegistrySetReport({ activeSet: ACTIVE_SET_BUILTIN, assessment, resolvedDigests }),
    registryProvenance: buildRegistryProvenance({
      activeSet: ACTIVE_SET_BUILTIN,
      resolvedDigests,
      slices,
    }),
  };
};
