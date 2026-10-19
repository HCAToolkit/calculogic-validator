/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.20)
 * Responsibility: The suite-owned mechanics of reference edges (lifecycle spec §12.11): checking
 *   the slices' declarations and their resolvers' output, forming source and target addresses, and
 *   joining each reference to the target registry's entries of the same set.
 * Invariants: never reads a registry field to find a reference and never decides what one means;
 *   resolvers receive a deep-frozen copy of their source payload and nothing else; addresses come
 *   only from the comparison module; declaration and resolver-output problems are programming
 *   errors, never data; an unreadable registry makes its edges unavailable, never unresolved;
 *   results are in ordinal order.
 */
import fs from 'node:fs';
import path from 'node:path';
import { stableStringify } from '../validator-report-meta.logic.mjs';
import { assertComparisonDeclaration, keyedEntryAddress, walkComparisonEntries } from './registry-lifecycle-comparison.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from './registry-lifecycle-inventory.knowledge.mjs';
import { deepFreeze, descriptorForPayload } from './registry-lifecycle-migration.logic.mjs';
import { SLICE_REFERENCE_RESOLVERS } from './registry-lifecycle-slice-references.logic.mjs';
import { CUSTOM_ISSUE_CONDITIONS } from './registry-lifecycle.contracts.mjs';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isProvenanceString = (value) => typeof value === 'string' && value.length > 0 && value === value.trim();
const compareOrdinal = (left, right) => (left === right ? 0 : left < right ? -1 : 1);
const hasExactKeys = (value, required, optional = []) =>
  isPlainObject(value) &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every((key) => required.includes(key) || optional.includes(key));

// [5.2.20] cfg-registryLifecycle · Primitive · "ReferenceDeclarationError"
// A declaration or resolver-output problem: a programming error in a slice, never a data finding.
export class ReferenceDeclarationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReferenceDeclarationError';
  }
}

const refuse = (message) => {
  throw new ReferenceDeclarationError(message);
};

// [5.2.20] cfg-registryLifecycle · Primitive · "assertReferenceDeclarations"
// Every `references` declaration is `{ edgeId, to, targetCollection }`: a provenance-string id
// prefixed by its slice id and unique across slices, a target registry of the same slice's current
// inventory, and a `keyed` collection of that registry's comparison declaration. A slice with an
// edge has a resolver whose versions cover every readable version of each source registry.
export const assertReferenceDeclarations = ({ slices = REGISTRY_LIFECYCLE_SLICES, resolvers = SLICE_REFERENCE_RESOLVERS } = {}) => {
  const edgeIds = new Set();
  for (const slice of slices) {
    const entriesById = new Map(slice.inventory.map((entry) => [entry.registryId, entry]));
    for (const entry of slice.inventory) {
      const references = entry.references ?? [];
      if (!Array.isArray(references)) {
        refuse(`Registry ${entry.registryId} declares references that are not a list.`);
      }
      if (references.length === 0) {
        continue;
      }

      const resolver = resolvers[slice.sliceId];
      if (!isPlainObject(resolver) || typeof resolver.resolve !== 'function' || !Array.isArray(resolver.versions)) {
        refuse(`Slice ${slice.sliceId} declares reference edges without a reference resolver.`);
      }
      const unhandled = entry.readableVersions.filter((version) => !resolver.versions.includes(version));
      if (unhandled.length > 0) {
        refuse(`The ${slice.sliceId} reference resolver does not read version ${unhandled.join(', ')} of ${entry.registryId}.`);
      }

      for (const edge of references) {
        if (!hasExactKeys(edge, ['edgeId', 'to', 'targetCollection']) || !isProvenanceString(edge.edgeId)) {
          refuse(`Registry ${entry.registryId} has a malformed reference declaration: ${JSON.stringify(edge)}.`);
        }
        if (!edge.edgeId.startsWith(`${slice.sliceId}/`) || edge.edgeId.length === slice.sliceId.length + 1) {
          refuse(`Reference edge ${edge.edgeId} must be named <sliceId>/<name> with slice id ${slice.sliceId}.`);
        }
        if (edgeIds.has(edge.edgeId)) {
          refuse(`Reference edge ${edge.edgeId} is declared more than once.`);
        }
        edgeIds.add(edge.edgeId);

        const target = entriesById.get(edge.to);
        if (!target) {
          refuse(`Reference edge ${edge.edgeId} targets ${JSON.stringify(edge.to)}, which is not a registry of slice ${slice.sliceId}.`);
        }
        if (!target.comparison.some((collection) => collection.kind === 'keyed' && collection.path === edge.targetCollection)) {
          refuse(`Reference edge ${edge.edgeId} targets ${JSON.stringify(edge.targetCollection)}, which is not a keyed collection of ${edge.to}.`);
        }
      }
    }
  }
};

// The registry's payload and comparison entries, or why its edges cannot be evaluated: absent or
// unparseable (as `inputOf` reports it), at a version the inventory does not declare readable, or
// not extractable by its comparison declaration.
const readAvailable = (entry, inputOf) => {
  const input = inputOf(entry.registryId);
  if (!Object.hasOwn(input, 'payload')) {
    return { unavailable: { registryId: entry.registryId, condition: input.condition, detail: input.detail } };
  }
  const { payload } = input;
  if (!isPlainObject(payload) || !entry.readableVersions.includes(payload.version)) {
    return {
      unavailable: {
        registryId: entry.registryId,
        condition: CUSTOM_ISSUE_CONDITIONS.versionIncompatible,
        detail: `version ${JSON.stringify(isPlainObject(payload) ? payload.version : undefined)} is not one this engine reads.`,
      },
    };
  }
  // A malformed declaration is the slice's programming error, so it is checked first and raised. Any
  // failure after that comes from the payload: canonicalization (a number outside the finite JSON
  // range, such as `1e400`) or extraction (an uncovered field, a duplicate key).
  assertComparisonDeclaration(entry.comparison, entry.registryId);
  try {
    const entries = new Set(walkComparisonEntries(payload, { ...entry, descriptor: descriptorForPayload(entry, payload) }).map(({ address }) => address));
    return { payload, entries };
  } catch (error) {
    return { unavailable: { registryId: entry.registryId, condition: CUSTOM_ISSUE_CONDITIONS.invalid, detail: error.message } };
  }
};

// The source registry's references as `{ edgeId, source, target }` addresses, each output item
// checked against the declarations; a problem names the registry and the offending item.
const resolveSourceReferences = ({ entry, payload, sourceEntries, resolver, edgesById, entriesById }) => {
  const output = resolver.resolve({ registryId: entry.registryId, payload: deepFreeze(structuredClone(payload)) });
  if (!Array.isArray(output)) {
    refuse(`The reference resolver returned no list for ${entry.registryId}.`);
  }

  const seen = new Set();
  return output.map((item) => {
    const problem = (detail) => refuse(`The reference resolver output for ${entry.registryId} ${detail}: ${JSON.stringify(item)}.`);
    if (!hasExactKeys(item, ['edgeId', 'source', 'target'])) {
      problem('has another shape');
    }
    const edge = edgesById.get(item.edgeId);
    if (!edge) {
      problem('names an edge not declared on the registry');
    }
    // A present `key` is a string: an explicit `undefined` must not turn a record into a group.
    const keyIsValid = (identity) => !Object.hasOwn(identity, 'key') || typeof identity.key === 'string';
    if (
      !hasExactKeys(item.source, ['collection', 'groups'], ['key']) ||
      !hasExactKeys(item.target, ['groups', 'key']) ||
      !keyIsValid(item.source) ||
      !keyIsValid(item.target)
    ) {
      problem('has a malformed source or target identity');
    }
    const source = keyedEntryAddress(entry, item.source);
    if (source === null) {
      problem('has a source identity that does not fit a keyed collection of the registry');
    }
    if (!sourceEntries.has(source)) {
      problem(`names a source entry the payload does not have (${source})`);
    }
    const target = keyedEntryAddress(entriesById.get(edge.to), { collection: edge.targetCollection, ...item.target });
    if (target === null) {
      problem(`has a target identity that does not fit ${edge.to} ${edge.targetCollection}`);
    }
    const identity = stableStringify([item.edgeId, source, target]);
    if (seen.has(identity)) {
      problem('repeats a reference');
    }
    seen.add(identity);
    return { edgeId: item.edgeId, source, target };
  });
};

// [5.2.20] cfg-registryLifecycle · Workflow · "resolveRegistryReferences"
// Resolves every declared edge over one whole set. `inputOf(registryId)` gives that set's payload of
// a registry as `{ payload }`, or `{ condition, detail }` when it is absent or unreadable. Returns
// `{ edges }`, sorted by edge id, each `{ edgeId, from, to, targetCollection }` plus either
// `references: [{ source, target, state }]` (sorted by source, then target; `state` is `resolved`
// or `unresolved`) or `unavailable: { registryId, condition, detail }`.
export const resolveRegistryReferences = ({ slices = REGISTRY_LIFECYCLE_SLICES, resolvers = SLICE_REFERENCE_RESOLVERS, inputOf }) => {
  assertReferenceDeclarations({ slices, resolvers });
  const edges = [];
  for (const slice of slices) {
    const entriesById = new Map(slice.inventory.map((entry) => [entry.registryId, entry]));
    const available = new Map();
    const availableOf = (registryId) => {
      if (!available.has(registryId)) {
        available.set(registryId, readAvailable(entriesById.get(registryId), inputOf));
      }
      return available.get(registryId);
    };

    for (const entry of slice.inventory.filter((candidate) => (candidate.references ?? []).length > 0)) {
      const describe = (edge) => ({ edgeId: edge.edgeId, from: entry.registryId, to: edge.to, targetCollection: edge.targetCollection });
      const source = availableOf(entry.registryId);
      if (source.unavailable) {
        edges.push(...entry.references.map((edge) => ({ ...describe(edge), unavailable: source.unavailable })));
        continue;
      }

      const references = resolveSourceReferences({
        entry,
        payload: source.payload,
        sourceEntries: source.entries,
        resolver: resolvers[slice.sliceId],
        edgesById: new Map(entry.references.map((edge) => [edge.edgeId, edge])),
        entriesById,
      });
      for (const edge of entry.references) {
        const target = availableOf(edge.to);
        if (target.unavailable) {
          edges.push({ ...describe(edge), unavailable: target.unavailable });
          continue;
        }
        edges.push({
          ...describe(edge),
          references: references
            .filter((reference) => reference.edgeId === edge.edgeId)
            .map(({ source: sourceAddress, target: targetAddress }) => ({
              source: sourceAddress,
              target: targetAddress,
              state: target.entries.has(targetAddress) ? 'resolved' : 'unresolved',
            }))
            .sort((left, right) => compareOrdinal(left.source, right.source) || compareOrdinal(left.target, right.target)),
        });
      }
    }
  }
  return { edges: edges.sort((left, right) => compareOrdinal(left.edgeId, right.edgeId)) };
};

// [5.2.20] cfg-registryLifecycle · Derived value · "builtinReferenceInputs"
// `inputOf` for the Builtin set: each registry read from its slice's package Builtin root.
export const builtinReferenceInputs = ({ slices = REGISTRY_LIFECYCLE_SLICES } = {}) => {
  const filesById = new Map(
    slices.flatMap((slice) => slice.inventory.map((entry) => [entry.registryId, path.join(slice.builtinRoot, entry.fileName)])),
  );
  return (registryId) => {
    let text;
    try {
      text = fs.readFileSync(filesById.get(registryId), 'utf8');
    } catch {
      return { condition: CUSTOM_ISSUE_CONDITIONS.missing, detail: 'The registry file is absent.' };
    }
    try {
      return { payload: JSON.parse(text) };
    } catch (error) {
      return { condition: CUSTOM_ISSUE_CONDITIONS.invalid, detail: `The registry file does not parse: ${error.message}` };
    }
  };
};
