/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.21)
 * Responsibility: The read-only `trace` (lifecycle spec §12.11): one set's declared references, whole
 *   or for one entry (direct, reverse and one-step potential impact).
 * Invariants: observes only; never reads `registry-state.json`, never writes and never recovers a
 *   transaction; both forms select from one `resolveRegistryReferences` result and never read a
 *   registry field to find a reference; an unavailable registry is never reported as an absent entry;
 *   results are in ordinal order.
 */
import { parseComparisonAddress } from './registry-lifecycle-comparison.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from './registry-lifecycle-inventory.knowledge.mjs';
import {
  builtinReferenceInputs,
  customReferenceInputs,
  inspectReferenceRegistry,
  resolveRegistryReferences,
} from './registry-lifecycle-references.logic.mjs';
import { SLICE_REFERENCE_RESOLVERS } from './registry-lifecycle-slice-references.logic.mjs';
import {
  RegistryLifecycleError,
  customSetExists,
  isLifecyclePathContained,
  resolveRegistryLifecyclePaths,
} from './registry-lifecycle-state.logic.mjs';
import { lifecycleTransactionPending } from './registry-lifecycle-transaction.logic.mjs';
import { ACTIVE_SET_BUILTIN, ACTIVE_SET_CUSTOM, ACTIVE_SET_VALUES } from './registry-lifecycle.contracts.mjs';

const compareOrdinal = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

// [5.2.21] cfg-registryLifecycle · Primitive · "RegistryTraceUsageError"
// A `trace` request the command cannot carry out as given: the CLI reports it as a usage error.
export class RegistryTraceUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RegistryTraceUsageError';
  }
}

// The set's `inputOf` and whether it may be an intermediate state. Builtin is read from the package and
// never written by a transaction; Custom is read through the containment-checked reader, after the
// lifecycle root and `custom/` are checked and the set is known to exist.
const openSet = ({ set, targetRoot, lifecycleRootOverride, slices }) => {
  if (set === ACTIVE_SET_BUILTIN) {
    return { inputOf: builtinReferenceInputs({ slices }), interruptedTransaction: false };
  }

  const paths = resolveRegistryLifecyclePaths({ targetRoot, lifecycleRootOverride });
  for (const lifecyclePath of [paths.lifecycleRoot, paths.customRoot]) {
    if (!isLifecyclePathContained(paths, lifecyclePath)) {
      throw new RegistryLifecycleError(
        `Registry lifecycle path resolves outside the validation target (${lifecyclePath}); trace reads only inside the target repository.`,
      );
    }
  }
  if (!customSetExists(paths)) {
    throw new RegistryLifecycleError('No Custom registry set exists. Run registry:init-custom first, or trace --set builtin.');
  }
  return { inputOf: customReferenceInputs({ paths, slices }), interruptedTransaction: lifecycleTransactionPending(paths) };
};

// Each registry is read once, so presence and resolution see the same payload.
const memoize = (inputOf) => {
  const inputs = new Map();
  return (registryId) => {
    if (!inputs.has(registryId)) {
      inputs.set(registryId, inputOf(registryId));
    }
    return inputs.get(registryId);
  };
};

const wholeSet = (edges) =>
  edges.map((edge) => {
    if (edge.unavailable) {
      return edge;
    }
    const { references, ...identity } = edge;
    const unresolved = references.filter((reference) => reference.state === 'unresolved').length;
    return { ...identity, counts: { resolved: references.length - unresolved, unresolved }, references };
  });

// The entry's direct, reverse and impact views, selected from the resolution; all three are null when
// the registry cannot be inspected.
const entryViews = ({ edges, entry, address, inspected }) => {
  const unavailable = edges
    .filter((edge) => edge.unavailable && (edge.from === entry.registryId || edge.to === entry.registryId))
    .map(({ edgeId, from, to, unavailable: reason }) => ({ edgeId, from, to, ...reason }));
  if (inspected.unavailable) {
    const { condition, detail } = inspected.unavailable;
    return {
      entry: { registryId: entry.registryId, address, present: null, unavailable: { condition, detail } },
      direct: null,
      reverse: null,
      impact: null,
      unavailable,
    };
  }

  const available = edges.filter((edge) => !edge.unavailable);
  const byAddressThenEdge = (side) => (left, right) =>
    compareOrdinal(left[side].address, right[side].address) ||
    compareOrdinal(left[side].registryId, right[side].registryId) ||
    compareOrdinal(left.edgeId, right.edgeId);
  const direct = available
    .filter((edge) => edge.from === entry.registryId)
    .flatMap((edge) =>
      edge.references
        .filter((reference) => reference.source === address)
        .map((reference) => ({ edgeId: edge.edgeId, target: { registryId: edge.to, address: reference.target }, state: reference.state })),
    )
    .sort(byAddressThenEdge('target'));
  const reverse = available
    .filter((edge) => edge.to === entry.registryId)
    .flatMap((edge) =>
      edge.references
        .filter((reference) => reference.target === address)
        .map((reference) => ({ edgeId: edge.edgeId, source: { registryId: edge.from, address: reference.source }, state: reference.state })),
    )
    .sort(byAddressThenEdge('source'));
  const impact = [...new Map(reverse.map(({ source }) => [`${source.registryId}\u0000${source.address}`, source])).values()].sort(
    (left, right) => compareOrdinal(left.registryId, right.registryId) || compareOrdinal(left.address, right.address),
  );
  return {
    entry: { registryId: entry.registryId, address, present: inspected.entries.has(address) },
    direct,
    reverse,
    impact,
    unavailable,
  };
};

// [5.2.21] cfg-registryLifecycle · Workflow · "buildRegistryTrace"
// `set` is `builtin` or `custom`; `registryId` and `address` name one entry, or are both omitted for
// the whole set. Returns `{ command: 'trace', set, interruptedTransaction, edges }` or, for an entry,
// `{ command: 'trace', set, interruptedTransaction, entry, direct, reverse, impact, unavailable }`.
export const buildRegistryTrace = ({
  set,
  registryId,
  address,
  targetRoot,
  lifecycleRootOverride,
  slices = REGISTRY_LIFECYCLE_SLICES,
  resolvers = SLICE_REFERENCE_RESOLVERS,
}) => {
  if (!ACTIVE_SET_VALUES.includes(set)) {
    throw new RegistryTraceUsageError(`trace needs --set ${ACTIVE_SET_BUILTIN} or --set ${ACTIVE_SET_CUSTOM}.`);
  }
  const hasEntry = registryId !== undefined || address !== undefined;
  const entry = hasEntry ? slices.flatMap((slice) => slice.inventory).find((candidate) => candidate.registryId === registryId) : undefined;
  if (hasEntry && !entry) {
    throw new RegistryTraceUsageError(`Unknown registry id: ${registryId}.`);
  }
  if (hasEntry && parseComparisonAddress(address, entry) === null) {
    throw new RegistryTraceUsageError(`${JSON.stringify(address)} is not an address the comparison declaration of ${registryId} can produce.`);
  }

  const { inputOf, interruptedTransaction } = openSet({ set, targetRoot, lifecycleRootOverride, slices });
  const sharedInputOf = memoize(inputOf);
  const { edges } = resolveRegistryReferences({ slices, resolvers, inputOf: sharedInputOf });
  const header = { command: 'trace', set, interruptedTransaction };
  if (!hasEntry) {
    return { ...header, edges: wholeSet(edges) };
  }
  return { ...header, ...entryViews({ edges, entry, address, inspected: inspectReferenceRegistry(entry, sharedInputOf) }) };
};
