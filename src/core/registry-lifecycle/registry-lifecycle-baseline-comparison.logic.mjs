/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.24)
 * Responsibility: The slice-facing Baseline entry comparison (lifecycle spec §11.4): how each entry
 *   of one resolved registry relates to the Baseline the run's assessment verified.
 * Invariants: read-only and deterministic; uses the assessment's Baseline rule, the comparison
 *   declaration and the per-version descriptors, never a rule of its own; the Baseline is the
 *   resolution's own (a candidate's artifact, never the repository's Custom set) and is never migrated,
 *   manufactured or taken from Builtin; `unverifiable` is never turned into another state; returns
 *   no slice vocabulary.
 */
import { stableStringify } from '../validator-report-meta.logic.mjs';
import { verifyBaselineCopy } from './registry-lifecycle-assessment.logic.mjs';
import { ComparisonExtractionError, walkComparisonEntries } from './registry-lifecycle-comparison.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from './registry-lifecycle-inventory.knowledge.mjs';
import { descriptorForPayload } from './registry-lifecycle-migration.logic.mjs';
import { RegistryLifecycleError, readRegistrySetManifest } from './registry-lifecycle-state.logic.mjs';
import {
  ACTIVE_SET_BUILTIN,
  ACTIVE_SET_CUSTOM,
  BASELINE_COMPARISON_STATES,
  BASELINE_UNVERIFIABLE_REASONS,
  REGISTRY_RUN_SOURCE_CANDIDATE,
} from './registry-lifecycle.contracts.mjs';

const BASELINE_SOURCES = new Set([ACTIVE_SET_CUSTOM, REGISTRY_RUN_SOURCE_CANDIDATE]);

// The payload's entries under the registry's current declaration, canonicalized with the descriptor
// of the payload's own version (spec §5, §8.4).
const walkOwnVersion = (entry, payload) =>
  walkComparisonEntries(payload, { ...entry, descriptor: descriptorForPayload(entry, payload) });

const findSourceOf = (resolution, registryId) => {
  for (const sliceProvenance of Object.values(resolution?.registryProvenance ?? {})) {
    if (Object.hasOwn(sliceProvenance, registryId)) {
      return sliceProvenance[registryId].source;
    }
  }
  throw new Error(`Registry ${registryId} is not in the run's resolved set.`);
};

const findInventoryEntry = (slices, registryId) => {
  for (const slice of slices) {
    const entry = slice.inventory.find((candidate) => candidate.registryId === registryId);
    if (entry) {
      return { slice, entry };
    }
  }
  throw new Error(`Registry ${registryId} is not in the Baseline reference's inventory.`);
};

// Every resolved entry with one state (and reason), or each by its verified Baseline entry.
const toResult = ({ registryId, source, resolvedEntries, stateOf }) =>
  Object.freeze({
    registryId,
    source,
    entries: Object.freeze(resolvedEntries.map(({ address, value }) => Object.freeze({ address, ...stateOf(address, value) }))),
  });

const unverifiable = (reason) => () => ({ baselineComparison: BASELINE_COMPARISON_STATES.unverifiable, reason });

// [5.2.24] cfg-registryLifecycle · Derived value · "compareResolvedRegistryWithBaseline"
// `resolution` is the run's resolution (5.2.5 or 5.2.23), `payload` the resolved registry's parsed
// payload; `slices` names the inventory for a Builtin resolution. Returns frozen
// `{ registryId, source, entries: [{ address, baselineComparison, reason? }] }` in ordinal address
// order (spec §11.4).
export const compareResolvedRegistryWithBaseline = ({ resolution, registryId, payload, slices = REGISTRY_LIFECYCLE_SLICES }) => {
  const source = findSourceOf(resolution, registryId);
  if (source !== ACTIVE_SET_BUILTIN && !BASELINE_SOURCES.has(source)) {
    throw new Error(`Registry ${registryId} has an unknown resolution source ${JSON.stringify(source)}.`);
  }

  const reference = resolution.baselineReference;
  if (source !== ACTIVE_SET_BUILTIN && !reference) {
    throw new Error(`A ${source} resolution must carry its Baseline reference.`);
  }

  // A Builtin resolution carries no reference; its entries need only the registry's declaration.
  const { slice, entry } = findInventoryEntry(reference?.slices ?? slices, registryId);
  // A resolved payload the declaration cannot address is a programming error (spec §11.4): it throws.
  const resolvedEntries = walkOwnVersion(entry, payload);

  if (source === ACTIVE_SET_BUILTIN) {
    return toResult({
      registryId,
      source,
      resolvedEntries,
      stateOf: () => ({ baselineComparison: BASELINE_COMPARISON_STATES.notApplicable }),
    });
  }

  const { manifest, manifestError } = readRegistrySetManifest(reference.paths);
  const manifestEntry = manifest?.basedOn.registries[registryId];
  if (manifestError || !manifestEntry) {
    // Both block a run (spec §7.1), so the set changed after it was resolved.
    throw new RegistryLifecycleError(
      `The Baseline of registry ${registryId} cannot be read: ${manifestError ?? 'the manifest has no entry for it'}. The registry set changed after the run resolved it.`,
    );
  }

  const baseline = verifyBaselineCopy({ paths: reference.paths, slice, entry, manifestEntry });
  if (baseline.state === 'undescribed') {
    return toResult({ registryId, source, resolvedEntries, stateOf: unverifiable(BASELINE_UNVERIFIABLE_REASONS.versionUndescribed) });
  }
  if (baseline.state === 'mismatch') {
    return toResult({ registryId, source, resolvedEntries, stateOf: unverifiable(BASELINE_UNVERIFIABLE_REASONS.mismatch) });
  }

  let baselineValues;
  try {
    baselineValues = new Map(walkOwnVersion(entry, baseline.payload).map(({ address, value }) => [address, stableStringify(value)]));
  } catch (error) {
    if (error instanceof ComparisonExtractionError) {
      return toResult({ registryId, source, resolvedEntries, stateOf: unverifiable(BASELINE_UNVERIFIABLE_REASONS.notComparable) });
    }
    throw error;
  }

  return toResult({
    registryId,
    source,
    resolvedEntries,
    stateOf: (address, value) => {
      if (!baselineValues.has(address)) {
        return { baselineComparison: BASELINE_COMPARISON_STATES.absent };
      }
      return {
        baselineComparison:
          baselineValues.get(address) === stableStringify(value) ? BASELINE_COMPARISON_STATES.matches : BASELINE_COMPARISON_STATES.differs,
      };
    },
  });
};
