/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.5, §5.2.8, §5.4, §7.1)
 * Responsibility: Resolves the active registry set for one validation run into one resolved
 *   registry root per slice, plus the report provenance blocks.
 * Invariants: the active set is loaded whole, with no Builtin fallback; an active Custom set with a
 *   blocking condition stops the run before validation; inactive Custom problems are reported,
 *   never blocking; validation runs never write lifecycle files (lifecycle spec §6, §7, §11).
 */
import path from 'node:path';
import { assessCustomRegistrySet } from './registry-lifecycle-assessment.logic.mjs';
import { builtinBridgeSides, customBridgeSides, resolveBridgeCompatibility } from './registry-lifecycle-bridge-compatibility.logic.mjs';
import { digestRegistrySet } from './registry-lifecycle-canonical-digest.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from './registry-lifecycle-inventory.knowledge.mjs';
import {
  RegistryLifecycleError,
  readRegistryLifecycleState,
  resolveRegistryLifecyclePaths,
} from './registry-lifecycle-state.logic.mjs';
import {
  ACTIVE_SET_CUSTOM,
  CUSTOM_ISSUE_CONDITIONS,
  CUSTOM_SET_MISSING_CONDITION,
} from './registry-lifecycle.contracts.mjs';

// [5.2.5] cfg-registryLifecycle · Primitive · "Builtin registry roots"
export const getBuiltinRegistryRoots = ({ slices = REGISTRY_LIFECYCLE_SLICES } = {}) =>
  Object.freeze(Object.fromEntries(slices.map((slice) => [slice.sliceId, slice.builtinRoot])));

// [7.1] cfg-registryLifecycle · Primitive · "buildRegistrySetReport"
// `bridgeCompatibility` describes the resolved set only (spec §9.4): a run never reports an inactive
// Custom set's bridges, which `status` describes.
const buildRegistrySetReport = ({ activeSet, assessment, resolvedDigests, bridgeCompatibility }) => ({
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
  bridgeCompatibility,
});

// [7.1] cfg-registryLifecycle · Primitive · "buildRegistryProvenance"
// `source` is the run's source: the active set, or `candidate` (spec §11.2). Shared with 5.2.23.
export const buildRegistryProvenance = ({ source, resolvedDigests, slices }) =>
  Object.freeze(
    Object.fromEntries(
      slices.map((slice) => [
        slice.sliceId,
        Object.fromEntries(
          slice.inventory.map((entry) => [
            entry.registryId,
            { source, digest: resolvedDigests[entry.registryId] },
          ]),
        ),
      ]),
    ),
  );

// [5.2.5] cfg-registryLifecycle · Primitive · "Custom slice roots"
const getCustomRegistryRoots = ({ paths, slices }) =>
  Object.freeze(Object.fromEntries(slices.map((slice) => [slice.sliceId, path.join(paths.customRoot, slice.sliceId)])));

// [5.2.5] cfg-registryLifecycle · Primitive · "findCustomSetBlockers"
// The §7.1 blocking conditions of a Custom set: a missing set, and every reported issue except the
// non-blocking `baseline-mismatch` (`missing`, `version-incompatible`, `invalid`,
// `manifest-malformed`, `interrupted-transaction`). Without a set, the only reported issue is a
// pending transaction, named after the missing set. An empty list means the set resolves validly
// (spec §7.1, §11.1, §11.3).
export const findCustomSetBlockers = (assessment) => {
  const blockingIssues = assessment.customIssues.filter((issue) => issue.condition !== CUSTOM_ISSUE_CONDITIONS.baselineMismatch);
  if (!assessment.customExists) {
    return [
      { registryId: null, condition: CUSTOM_SET_MISSING_CONDITION, detail: 'No Custom registry set exists; run `registry:init-custom` to create one.' },
      ...blockingIssues,
    ];
  }

  return blockingIssues;
};

// [5.2.8] cfg-registryLifecycle · Primitive · "Active-Custom blocking notice"
// One lifecycle error naming each blocking condition and the two ways forward (spec §7.1, NL §7.3).
export const createCustomSetBlockedError = ({ paths, blockers, action }) =>
  new RegistryLifecycleError(
    [
      `${action}: the Custom registry set (${paths.customRoot}) cannot be used:`,
      ...blockers.map(
        (blocker) => `  - ${blocker.registryId ?? 'registry set'}: ${blocker.condition}: ${blocker.detail}`,
      ),
      'To continue, reconcile the Custom set (`registry:status` lists every registry), or run `registry:use builtin`, which keeps the Custom set as it is.',
    ].join('\n'),
    { conditions: blockers.map((blocker) => ({ ...blocker })) },
  );

// [5.2.5] cfg-registryLifecycle · Workflow · "resolveActiveRegistrySet"
// Returns:
// - `activeSet`;
// - `registryRoots`: one resolved registry root per slice id;
// - `customRegistryRoots`: the consumer Custom roots when a Custom set exists and resolves validly
//   (used only for transitional fields such as Naming's `registryDigests.custom`, spec §11.3);
// - `registrySet`: the set-level report block (spec §11.1);
// - `registryProvenance`: per-slice `{ [registryId]: { source, digest } }` (spec §11.2);
// - `baselineReference`, for an active Custom set only: the paths and inventory the assessment used,
//   which the Baseline entry comparison reads (5.2.24, spec §11.4). Slices pass it on unread.
export const resolveActiveRegistrySet = ({
  targetRoot,
  lifecycleRootOverride,
  slices = REGISTRY_LIFECYCLE_SLICES,
} = {}) => {
  const paths = resolveRegistryLifecyclePaths({ targetRoot, lifecycleRootOverride });
  const { activeSet } = readRegistryLifecycleState(paths);
  const assessment = assessCustomRegistrySet({ paths, slices });
  const blockers = findCustomSetBlockers(assessment);

  if (activeSet === ACTIVE_SET_CUSTOM && blockers.length > 0) {
    throw createCustomSetBlockedError({
      paths,
      blockers,
      action: `Registry lifecycle state selects the Custom set (${paths.statePath})`,
    });
  }

  const customRegistryRoots = blockers.length === 0 ? getCustomRegistryRoots({ paths, slices }) : undefined;
  const isCustomActive = activeSet === ACTIVE_SET_CUSTOM;
  // An active Custom set has a digest for every inventory registry, because an unparseable one blocks.
  const resolvedDigests = isCustomActive ? assessment.customDigests : assessment.builtinDigests;

  return {
    activeSet,
    registryRoots: isCustomActive ? customRegistryRoots : getBuiltinRegistryRoots({ slices }),
    ...(customRegistryRoots ? { customRegistryRoots } : {}),
    registrySet: buildRegistrySetReport({
      activeSet,
      assessment,
      resolvedDigests,
      bridgeCompatibility: resolveBridgeCompatibility({
        set: activeSet,
        sideOf: isCustomActive ? customBridgeSides({ paths, assessment, slices }) : builtinBridgeSides({ slices }),
        slices,
      }),
    }),
    registryProvenance: buildRegistryProvenance({ source: activeSet, resolvedDigests, slices }),
    ...(isCustomActive ? { baselineReference: Object.freeze({ paths, slices }) } : {}),
  };
};
