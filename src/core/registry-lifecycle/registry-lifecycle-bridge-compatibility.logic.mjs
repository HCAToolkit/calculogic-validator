/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.25)
 * Responsibility: The suite-owned mechanics of cross-slice bridge compatibility (lifecycle spec
 *   §9.4): checking the slices' bridge and interpretation declarations and their resolvers' output,
 *   deciding each bridge side's availability in the described set, and comparing the emitted with
 *   the interpretable values.
 * Invariants: never reads a registry field and never interprets a perspective or a value; resolvers
 *   receive a deep-frozen copy of their own payload and nothing else; an unavailable side is never an
 *   empty domain and is never replaced by another set's values; declaration and resolver-output
 *   problems are programming errors, never data; the result never blocks and never changes a
 *   registry; results are in ordinal order.
 */
import { keyedEntryAddress } from './registry-lifecycle-comparison.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from './registry-lifecycle-inventory.knowledge.mjs';
import { deepFreeze } from './registry-lifecycle-migration.logic.mjs';
import { builtinReferenceInputs, customReferenceInputs, inspectReferenceRegistry } from './registry-lifecycle-references.logic.mjs';
import { SLICE_BRIDGE_DOMAIN_RESOLVERS } from './registry-lifecycle-slice-bridge-domains.logic.mjs';
import { CUSTOM_ISSUE_CONDITIONS } from './registry-lifecycle.contracts.mjs';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isProvenanceString = (value) => typeof value === 'string' && value.length > 0 && value === value.trim();
const compareOrdinal = (left, right) => (left === right ? 0 : left < right ? -1 : 1);
const hasExactKeys = (value, keys) =>
  isPlainObject(value) && keys.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => keys.includes(key));

// Status classifications that leave a bridge side without a domain (lifecycle spec §9.4, §12.1).
const UNAVAILABLE_CLASSIFICATIONS = new Set([
  CUSTOM_ISSUE_CONDITIONS.missing,
  CUSTOM_ISSUE_CONDITIONS.invalid,
  CUSTOM_ISSUE_CONDITIONS.versionIncompatible,
]);
const MISSING_DETAIL = 'Absent from the Custom set.';
// A side whose slice's registry-set validation did not run (spec §9.4): its classification does not
// establish that its contents were validated, so it has no domain. A bridge-availability condition,
// never a registry classification.
const NOT_VALIDATED_CONDITION = 'not-validated';

// [5.2.25] cfg-registryLifecycle · Primitive · "BridgeDeclarationError"
// A declaration or resolver-output problem: a programming error in a slice, never a data finding.
export class BridgeDeclarationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BridgeDeclarationError';
  }
}

const refuse = (message) => {
  throw new BridgeDeclarationError(message);
};

const assertResolverCovers = ({ resolvers, sliceId, entry, method, role }) => {
  const resolver = resolvers[sliceId];
  if (!isPlainObject(resolver) || typeof resolver[method] !== 'function' || !Array.isArray(resolver.versions)) {
    refuse(`Slice ${sliceId} ${role} a bridge without a bridge-domain resolver providing ${method}.`);
  }
  const unhandled = entry.readableVersions.filter((version) => !resolver.versions.includes(version));
  if (unhandled.length > 0) {
    refuse(`The ${sliceId} bridge-domain resolver does not read version ${unhandled.join(', ')} of ${entry.registryId}.`);
  }
};

// [5.2.25] cfg-registryLifecycle · Primitive · "assertBridgeDeclarations"
// Every `bridges` item is `{ bridgeId, perspective, consumer }`: a provenance-string id prefixed by
// its slice id and unique across slices, a provenance-string perspective, and a consumer registry of
// another slice's current inventory. Every bridge has exactly one `interprets` item `{ bridgeId }`, on
// its consumer registry, and every `interprets` item names a declared bridge. The emitting and
// consuming slices have resolvers whose versions cover every readable version of their registries.
// Returns the bridges, sorted by id, each with its emitter and consumer entries and slice ids.
export const assertBridgeDeclarations = ({ slices = REGISTRY_LIFECYCLE_SLICES, resolvers = SLICE_BRIDGE_DOMAIN_RESOLVERS } = {}) => {
  const located = new Map(slices.flatMap((slice) => slice.inventory.map((entry) => [entry.registryId, { sliceId: slice.sliceId, entry }])));
  const bridges = new Map();
  for (const slice of slices) {
    for (const entry of slice.inventory) {
      const declared = entry.bridges ?? [];
      if (!Array.isArray(declared)) {
        refuse(`Registry ${entry.registryId} declares bridges that are not a list.`);
      }
      for (const bridge of declared) {
        if (
          !hasExactKeys(bridge, ['bridgeId', 'perspective', 'consumer']) ||
          !isProvenanceString(bridge.bridgeId) ||
          !isProvenanceString(bridge.perspective)
        ) {
          refuse(`Registry ${entry.registryId} has a malformed bridge declaration: ${JSON.stringify(bridge)}.`);
        }
        if (!bridge.bridgeId.startsWith(`${slice.sliceId}/`) || bridge.bridgeId.length === slice.sliceId.length + 1) {
          refuse(`Bridge ${bridge.bridgeId} must be named <sliceId>/<name> with slice id ${slice.sliceId}.`);
        }
        if (bridges.has(bridge.bridgeId)) {
          refuse(`Bridge ${bridge.bridgeId} is declared more than once.`);
        }
        const consumer = located.get(bridge.consumer);
        if (!consumer) {
          refuse(`Bridge ${bridge.bridgeId} names consumer ${JSON.stringify(bridge.consumer)}, which is not a current inventory registry.`);
        }
        if (consumer.sliceId === slice.sliceId) {
          refuse(`Bridge ${bridge.bridgeId} names a consumer of its own slice; a same-slice relationship is a reference edge.`);
        }
        assertResolverCovers({ resolvers, sliceId: slice.sliceId, entry, method: 'resolveEmitted', role: 'emits' });
        bridges.set(bridge.bridgeId, {
          bridge,
          emitter: { sliceId: slice.sliceId, entry },
          consumer,
          interpretations: [],
        });
      }
    }
  }

  for (const slice of slices) {
    for (const entry of slice.inventory) {
      const interprets = entry.interprets ?? [];
      if (!Array.isArray(interprets)) {
        refuse(`Registry ${entry.registryId} declares interpretations that are not a list.`);
      }
      for (const interpretation of interprets) {
        if (!hasExactKeys(interpretation, ['bridgeId']) || !isProvenanceString(interpretation.bridgeId)) {
          refuse(`Registry ${entry.registryId} has a malformed interpretation declaration: ${JSON.stringify(interpretation)}.`);
        }
        const declared = bridges.get(interpretation.bridgeId);
        if (!declared) {
          refuse(`Registry ${entry.registryId} interprets ${interpretation.bridgeId}, which no registry declares as a bridge.`);
        }
        if (declared.bridge.consumer !== entry.registryId) {
          refuse(`Registry ${entry.registryId} interprets ${interpretation.bridgeId}, whose consumer is ${declared.bridge.consumer}.`);
        }
        declared.interpretations.push(entry.registryId);
      }
    }
  }

  return [...bridges.values()]
    .map(({ bridge, emitter, consumer, interpretations }) => {
      if (interpretations.length !== 1) {
        refuse(`Bridge ${bridge.bridgeId} must be interpreted exactly once by ${bridge.consumer}; it is interpreted ${interpretations.length} times.`);
      }
      assertResolverCovers({ resolvers, sliceId: consumer.sliceId, entry: consumer.entry, method: 'resolveInterpretable', role: 'interprets' });
      return { bridge, emitter, consumer };
    })
    .sort((left, right) => compareOrdinal(left.bridge.bridgeId, right.bridge.bridgeId));
};

// The emitted values, grouped: `value → sorted emitting entry addresses`. Each item is checked
// against the emitting registry's keyed collections and payload entries.
const resolveEmittedValues = ({ bridge, emitter, side, resolver }) => {
  const output = resolver.resolveEmitted({
    bridgeId: bridge.bridgeId,
    perspective: bridge.perspective,
    registryId: emitter.entry.registryId,
    payload: deepFreeze(structuredClone(side.payload)),
  });
  if (!Array.isArray(output)) {
    refuse(`The bridge-domain resolver returned no list of emitted values for ${bridge.bridgeId}.`);
  }
  const emittedBy = new Map();
  for (const item of output) {
    const problem = (detail) => refuse(`The emitted domain of ${bridge.bridgeId} ${detail}: ${JSON.stringify(item)}.`);
    if (!hasExactKeys(item, ['value', 'source']) || !isProvenanceString(item.value)) {
      problem('has an item of another shape');
    }
    if (!hasExactKeys(item.source, ['collection', 'groups', 'key']) || typeof item.source.key !== 'string') {
      problem('has a malformed source identity');
    }
    const address = keyedEntryAddress(emitter.entry, item.source);
    if (address === null) {
      problem(`has a source identity that does not fit a keyed collection of ${emitter.entry.registryId}`);
    }
    if (!side.entries.has(address)) {
      problem(`names a source entry the payload does not have (${address})`);
    }
    const addresses = emittedBy.get(item.value) ?? new Set();
    if (addresses.has(address)) {
      problem('repeats an item');
    }
    emittedBy.set(item.value, addresses.add(address));
  }
  return emittedBy;
};

const resolveInterpretableValues = ({ bridge, consumer, side, resolver }) => {
  const output = resolver.resolveInterpretable({
    bridgeId: bridge.bridgeId,
    perspective: bridge.perspective,
    registryId: consumer.entry.registryId,
    payload: deepFreeze(structuredClone(side.payload)),
  });
  if (!Array.isArray(output)) {
    refuse(`The bridge-domain resolver returned no list of interpretable values for ${bridge.bridgeId}.`);
  }
  const values = new Set();
  for (const item of output) {
    if (!hasExactKeys(item, ['value']) || !isProvenanceString(item.value) || values.has(item.value)) {
      refuse(`The interpretable domain of ${bridge.bridgeId} has a malformed or repeated item: ${JSON.stringify(item)}.`);
    }
    values.add(item.value);
  }
  return values;
};

// [5.2.25] cfg-registryLifecycle · Workflow · "resolveBridgeCompatibility"
// Compares every declared bridge over one described set. `set` names that set (`builtin`, `custom` or
// `candidate`). `sideOf(entry)` gives a registry of that set as `{ payload, entries }`, or
// `{ unavailable: { registryId, condition, detail } }`. Returns `{ set, bridges }`, each bridge
// `{ bridgeId, perspective, emitter, consumer, state }` plus `uninterpretable` (`compatible`, `gaps`)
// or `unavailable` (a list of `{ side, registryId, condition, detail }`, emitter first).
export const resolveBridgeCompatibility = ({ set, sideOf, slices = REGISTRY_LIFECYCLE_SLICES, resolvers = SLICE_BRIDGE_DOMAIN_RESOLVERS }) => {
  const bridges = assertBridgeDeclarations({ slices, resolvers }).map(({ bridge, emitter, consumer }) => {
    const record = {
      bridgeId: bridge.bridgeId,
      perspective: bridge.perspective,
      emitter: { sliceId: emitter.sliceId, registryId: emitter.entry.registryId },
      consumer: { sliceId: consumer.sliceId, registryId: consumer.entry.registryId },
    };
    const emitterSide = sideOf(emitter.entry);
    const consumerSide = sideOf(consumer.entry);
    const unavailable = [
      ['emitter', emitterSide],
      ['consumer', consumerSide],
    ]
      .filter(([, side]) => side.unavailable)
      .map(([sideName, side]) => ({ side: sideName, ...side.unavailable }));
    if (unavailable.length > 0) {
      return { ...record, state: 'unavailable', unavailable };
    }

    const emittedBy = resolveEmittedValues({ bridge, emitter, side: emitterSide, resolver: resolvers[emitter.sliceId] });
    const interpretable = resolveInterpretableValues({ bridge, consumer, side: consumerSide, resolver: resolvers[consumer.sliceId] });
    const uninterpretable = [...emittedBy.keys()]
      .filter((value) => !interpretable.has(value))
      .sort(compareOrdinal)
      .map((value) => ({ value, emittedBy: [...emittedBy.get(value)].sort(compareOrdinal) }));
    return { ...record, state: uninterpretable.length === 0 ? 'compatible' : 'gaps', uninterpretable };
  });
  return { set, bridges };
};

// [5.2.25] cfg-registryLifecycle · Derived value · "builtinBridgeSides"
// `sideOf` for the Builtin set: each registry read from its slice's package Builtin root.
export const builtinBridgeSides = ({ slices = REGISTRY_LIFECYCLE_SLICES } = {}) => {
  const inputOf = builtinReferenceInputs({ slices });
  return (entry) => inspectReferenceRegistry(entry, inputOf);
};

// [5.2.25] cfg-registryLifecycle · Derived value · "customBridgeSides"
// `sideOf` for a Custom (or candidate) set, decided only from the assessment, never a second judgement:
// - a registry whose status classification is `missing`, `invalid` or `version-incompatible` is
//   unavailable with that condition and the status detail;
// - any other registry of a slice whose registry-set validation did not run is unavailable as
//   `not-validated`, with every reason the assessment recorded;
// - any other registry is read through the assessment's containment-checked reader.
export const customBridgeSides = ({ paths, assessment, slices = REGISTRY_LIFECYCLE_SLICES }) => {
  const statusById = new Map(assessment.registries.map((statusEntry) => [statusEntry.registryId, statusEntry]));
  const sliceIdById = new Map(slices.flatMap((slice) => slice.inventory.map((entry) => [entry.registryId, slice.sliceId])));
  const inputOf = customReferenceInputs({ paths, slices });
  return (entry) => {
    const statusEntry = statusById.get(entry.registryId);
    if (statusEntry && UNAVAILABLE_CLASSIFICATIONS.has(statusEntry.classification)) {
      return {
        unavailable: {
          registryId: entry.registryId,
          condition: statusEntry.classification,
          detail: statusEntry.detail ?? MISSING_DETAIL,
        },
      };
    }
    const sliceId = sliceIdById.get(entry.registryId);
    const skipReasons = assessment.unvalidatedSlices?.[sliceId];
    if (skipReasons) {
      return {
        unavailable: {
          registryId: entry.registryId,
          condition: NOT_VALIDATED_CONDITION,
          detail: `Slice ${sliceId} was not validated: ${skipReasons.join(' ')}`,
        },
      };
    }
    return inspectReferenceRegistry(entry, inputOf);
  };
};
