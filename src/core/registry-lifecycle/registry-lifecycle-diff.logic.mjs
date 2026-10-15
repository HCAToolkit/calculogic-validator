/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.9)
 * Responsibility: The read-only three-way `diff` of a Custom set against its Baseline and the
 *   current Builtin (lifecycle spec §8.2, §12.3).
 * Invariants: writes nothing and never advances a Baseline; compares a registry only from trusted
 *   inputs (a verified `.baseline/` copy, a readable manifest, a valid Custom registry); output is
 *   deterministic, with ordinal ordering and counts per class.
 */
import fs from 'node:fs';
import path from 'node:path';
import { assessCustomRegistrySet } from './registry-lifecycle-assessment.logic.mjs';
import { ComparisonExtractionError, classifyEntry, walkComparisonEntries } from './registry-lifecycle-comparison.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from './registry-lifecycle-inventory.knowledge.mjs';
import {
  isLifecyclePathContained,
  readRegistryLifecycleState,
  readRegistrySetManifest,
  resolveRegistryLifecyclePaths,
} from './registry-lifecycle-state.logic.mjs';

// Status classifications that leave no trusted Custom input (lifecycle spec §12.1, §12.3).
const NOT_COMPARABLE_CLASSIFICATIONS = new Set(['missing', 'invalid', 'version-incompatible', 'baseline-unavailable']);

const compareOrdinal = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

const readJsonFile = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const countBy = (items, toKey) => {
  const counts = {};
  for (const item of items) {
    const key = toKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.keys(counts).sort(compareOrdinal).map((key) => [key, counts[key]]));
};

// Entries that differ across the three inputs, in ordinal address order.
const diffEntries = ({ baseline = new Map(), builtin = new Map(), custom = new Map() }) => {
  const addresses = [...new Set([...baseline.keys(), ...builtin.keys(), ...custom.keys()])].sort(compareOrdinal);
  return addresses.flatMap((address) => {
    const entryClass = classifyEntry(baseline.get(address), builtin.get(address), custom.get(address));
    if (entryClass === null) {
      return [];
    }

    return [
      {
        address,
        class: entryClass,
        ...(baseline.has(address) ? { baseline: baseline.get(address) } : {}),
        ...(builtin.has(address) ? { builtin: builtin.get(address) } : {}),
        ...(custom.has(address) ? { custom: custom.get(address) } : {}),
      },
    ];
  });
};

// [5.2.9] cfg-registryLifecycle · Derived value · "summarizeEntryDiff"
// The differing entries of three address → canonical value maps, with their counts per class. The
// migration plan previews B0′/B1/C0′ with it (spec §12.8).
export const summarizeEntryDiff = (inputs) => {
  const entries = diffEntries(inputs);
  return { counts: countBy(entries, (entry) => entry.class), entries };
};

const toValues = (walked) => new Map(walked.map(({ address, value }) => [address, value]));

// [5.2.9] cfg-registryLifecycle · Workflow · "diffRegistry"
// Returns the registry's diff, and for a compared registry its walked inputs (`{ builtin, custom }`,
// sites included), which the decisions check reads and the printed diff never carries.
const diffRegistry = (options) => {
  const walked = {};
  const registry = diffRegistryWith({ ...options, walked });
  return { registry, walked: Object.keys(walked).length > 0 ? walked : null };
};

const diffRegistryWith = ({ paths, slice, entry, statusEntry, manifestEntry, manifestError, walked }) => {
  const registryId = entry.registryId;
  if (manifestError) {
    return { registryId, class: 'not-comparable', reason: 'baseline-unavailable' };
  }

  const builtinPayload = readJsonFile(path.join(slice.builtinRoot, entry.fileName));
  const builtinWalked = walkComparisonEntries(builtinPayload, entry);
  const builtinEntries = toValues(builtinWalked);

  if (!manifestEntry) {
    return { registryId, class: 'registry-added', ...summarizeEntryDiff({ builtin: builtinEntries }) };
  }

  if (builtinPayload.version !== manifestEntry.version) {
    return {
      registryId,
      class: 'version-changed',
      detail: { baselineVersion: manifestEntry.version, builtinVersion: builtinPayload.version ?? null },
    };
  }

  if (NOT_COMPARABLE_CLASSIFICATIONS.has(statusEntry.classification)) {
    return {
      registryId,
      class: 'not-comparable',
      reason: statusEntry.classification,
      ...(statusEntry.detail ? { detail: statusEntry.detail } : {}),
    };
  }

  if (statusEntry.baselineMismatch !== false) {
    return { registryId, class: 'not-comparable', reason: 'baseline-mismatch' };
  }

  // Both files were verified contained by the assessment; checked again because they are read here.
  const customPath = path.join(paths.customRoot, slice.sliceId, entry.fileName);
  const baselinePath = path.join(paths.baselineRoot, slice.sliceId, entry.fileName);
  if (!isLifecyclePathContained(paths, customPath) || !isLifecyclePathContained(paths, baselinePath)) {
    return { registryId, class: 'not-comparable', reason: 'invalid' };
  }

  let customWalked;
  try {
    customWalked = walkComparisonEntries(readJsonFile(customPath), entry);
  } catch (error) {
    if (error instanceof ComparisonExtractionError) {
      return { registryId, class: 'not-comparable', reason: 'invalid', detail: error.message };
    }
    throw error;
  }

  const inputs = {
    baseline: toValues(walkComparisonEntries(readJsonFile(baselinePath), entry)),
    builtin: builtinEntries,
    custom: toValues(customWalked),
  };
  Object.assign(walked, { builtin: builtinWalked, custom: customWalked });

  const summary = summarizeEntryDiff(inputs);
  return summary.entries.length === 0 ? { registryId, class: 'unchanged' } : { registryId, class: 'differs', ...summary };
};

// [5.2.9] cfg-registryLifecycle · Workflow · "compareRegistryLifecycle"
// The comparison together with the assessment's per-registry status entries (digests), so a consumer
// that binds to the compared inputs (spec §12.4) reads them from the same assessment, and the walked
// Builtin and Custom inputs of each compared registry (`walkedById`). It never reads
// `registry-state.json`: the comparison does not depend on the active set, and a malformed state file
// does not stop it. Only `diff` adds `activeSet` (spec §12.3).
// `registryIds` restricts the output; an id that is neither an inventory registry nor an orphan of
// this Custom set throws.
export const compareRegistryLifecycle = ({
  targetRoot,
  lifecycleRootOverride,
  registryIds,
  slices = REGISTRY_LIFECYCLE_SLICES,
} = {}) => {
  const paths = resolveRegistryLifecyclePaths({ targetRoot, lifecycleRootOverride });
  const assessment = assessCustomRegistrySet({ paths, slices });

  const knownIds = new Set([
    ...slices.flatMap((slice) => slice.inventory.map((entry) => entry.registryId)),
    ...assessment.orphanRegistries,
  ]);
  const unknownIds = (registryIds ?? []).filter((registryId) => !knownIds.has(registryId));
  if (unknownIds.length > 0) {
    throw new Error(`Unknown registry id(s): ${[...unknownIds].sort(compareOrdinal).join(', ')}.`);
  }

  const statusById = new Map(assessment.registries.map((statusEntry) => [statusEntry.registryId, statusEntry]));
  const walkedById = new Map();
  if (!assessment.customExists) {
    return { comparison: { customExists: false, counts: {}, registries: [] }, statusById, walkedById };
  }

  const isSelected = (registryId) => !registryIds?.length || registryIds.includes(registryId);
  const { manifest } = readRegistrySetManifest(paths);
  const manifestEntries = assessment.manifestError ? {} : manifest.basedOn.registries;

  const registries = [
    ...slices.flatMap((slice) =>
      slice.inventory
        .filter((entry) => isSelected(entry.registryId))
        .map((entry) => {
          const { registry, walked } = diffRegistry({
            paths,
            slice,
            entry,
            statusEntry: statusById.get(entry.registryId),
            manifestEntry: manifestEntries[entry.registryId],
            manifestError: assessment.manifestError,
          });
          if (walked) {
            walkedById.set(entry.registryId, walked);
          }
          return registry;
        }),
    ),
    ...assessment.orphanRegistries.filter(isSelected).map((registryId) => ({ registryId, class: 'orphan' })),
  ].sort((left, right) => compareOrdinal(left.registryId, right.registryId));

  const comparison = {
    customExists: true,
    ...(assessment.manifestError ? { manifestError: assessment.manifestError } : {}),
    counts: {
      registries: countBy(registries, (registry) => registry.class),
      entries: countBy(registries.flatMap((registry) => registry.entries ?? []), (entry) => entry.class),
    },
    registries,
  };
  return { comparison, statusById, walkedById };
};

// [5.2.9] cfg-registryLifecycle · Workflow · "buildRegistryLifecycleDiff"
export const buildRegistryLifecycleDiff = (options = {}) => {
  const { activeSet } = readRegistryLifecycleState(
    resolveRegistryLifecyclePaths({ targetRoot: options.targetRoot, lifecycleRootOverride: options.lifecycleRootOverride }),
  );
  return { activeSet, ...compareRegistryLifecycle(options).comparison };
};
