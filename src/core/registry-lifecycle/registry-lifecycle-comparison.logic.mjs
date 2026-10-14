/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.9)
 * Responsibility: Turns a registry payload into addressed comparison entries, following the
 *   registry's slice-owned comparison identity declaration, and classifies one entry three ways.
 * Invariants: suite core applies the declaration and never interprets registry content; every
 *   input is canonicalized before extraction; a payload the declaration does not fully cover, or
 *   with a duplicate key, is not extracted; addresses and their order are deterministic (spec §8.4).
 */
import { stableStringify } from '../validator-report-meta.logic.mjs';
import { canonicalizeRegistryPayload } from './registry-lifecycle-canonical-digest.logic.mjs';
import { COMPARISON_KINDS, ENTRY_CLASSES } from './registry-lifecycle.contracts.mjs';

const WILDCARD = '*';
const ORDER_SUFFIX = '#order';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const compareOrdinal = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

// [5.2.9] cfg-registryLifecycle · Primitive · "ComparisonExtractionError"
export class ComparisonExtractionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ComparisonExtractionError';
  }
}

const fail = (message) => {
  throw new ComparisonExtractionError(message);
};

// [5.2.9] cfg-registryLifecycle · Primitive · "assertComparisonDeclaration"
// A declaration is a non-empty list of `{ kind, path, key?, ordered? }`. Only the last path segment
// may be the `*` wildcard; `key` belongs to `keyed` only, and `ordered` to `keyed` only.
export const assertComparisonDeclaration = (comparison, registryId) => {
  if (!Array.isArray(comparison) || comparison.length === 0) {
    throw new Error(`Registry ${registryId} declares no comparison identity.`);
  }

  for (const collection of comparison) {
    const segments = typeof collection?.path === 'string' ? collection.path.split('.') : [];
    const isValid =
      COMPARISON_KINDS.includes(collection?.kind) &&
      segments.length > 0 &&
      segments.every((segment, index) => segment.length > 0 && (segment !== WILDCARD || index === segments.length - 1)) &&
      segments[0] !== WILDCARD &&
      (collection.kind === 'keyed' ? typeof collection.key === 'string' && collection.key.length > 0 : collection.key === undefined) &&
      (collection.ordered === undefined || (collection.kind === 'keyed' && typeof collection.ordered === 'boolean'));
    if (!isValid) {
      throw new Error(`Registry ${registryId} has a malformed comparison collection: ${JSON.stringify(collection)}.`);
    }
  }
};

// Every root field except `version` is covered by exactly one collection, either directly (its own
// path, or its path with a final `*`) or through declared paths for each of its properties.
const assertCoverage = (canonicalPayload, comparison) => {
  const declaredPaths = comparison.map((collection) =>
    collection.path.endsWith(`.${WILDCARD}`) ? collection.path.slice(0, -2) : collection.path,
  );

  const checkNode = (node, nodePath) => {
    const prefix = nodePath === '' ? '' : `${nodePath}.`;
    for (const field of Object.keys(node).sort(compareOrdinal)) {
      if (nodePath === '' && field === 'version') {
        continue;
      }

      const fieldPath = `${prefix}${field}`;
      const exactMatches = declaredPaths.filter((declaredPath) => declaredPath === fieldPath).length;
      const deeperMatches = declaredPaths.filter((declaredPath) => declaredPath.startsWith(`${fieldPath}.`)).length;
      if (exactMatches > 1 || (exactMatches === 1 && deeperMatches > 0)) {
        fail(`Field "${fieldPath}" is covered by more than one comparison collection.`);
      }

      if (exactMatches === 1) {
        continue;
      }

      if (deeperMatches === 0 || !isPlainObject(node[field])) {
        fail(`Field "${fieldPath}" is not covered by the comparison identity declaration.`);
      }

      checkNode(node[field], fieldPath);
    }
  };

  checkNode(canonicalPayload, '');
};

const resolvePath = (payload, segments) => {
  let node = payload;
  for (const segment of segments) {
    if (!isPlainObject(node) || !Object.hasOwn(node, segment)) {
      return { found: false };
    }
    node = node[segment];
  }
  return { found: true, node };
};

// The collection's located nodes: `{ base, node, container, isGroup }`, where `base` is the
// address prefix and `container` the field path to the node. A final `*` yields one node per map
// property, addressed `<path>["<property>"]`.
const locateCollection = (canonicalPayload, collection) => {
  const segments = collection.path.split('.');
  const isWildcard = segments.at(-1) === WILDCARD;
  const literalSegments = isWildcard ? segments.slice(0, -1) : segments;
  const { found, node } = resolvePath(canonicalPayload, literalSegments);
  if (!found) {
    return [];
  }

  const literalBase = literalSegments.join('.');
  if (!isWildcard) {
    return [{ base: literalBase, node, container: literalSegments, isGroup: false }];
  }

  if (!isPlainObject(node)) {
    fail(`"${literalBase}" must be an object for "${collection.path}".`);
  }

  return Object.keys(node)
    .sort(compareOrdinal)
    .map((property) => ({
      base: `${literalBase}[${JSON.stringify(property)}]`,
      node: node[property],
      container: [...literalSegments, property],
      isGroup: true,
    }));
};

const isScalar = (value) => value === null || ['string', 'number', 'boolean'].includes(typeof value);

// [5.2.9] cfg-registryLifecycle · Derived value · "walkComparisonEntries"
// The one owner of the address grammar (spec §8.4). Returns `[{ address, value, site }]` in ordinal
// address order, where `value` is the canonical entry value and `site` the structured location the
// address names: `{ kind, container }` plus `member` (members), `keyField`, `key` and `grouped`
// (records), or `keyField` and `grouped` (order). `kind` is `value`, `member`, `record`, `group` or
// `order`; `container` is the field path to the value, the members list, the keyed list or the group
// property; `grouped` marks a keyed list that is a group of a wildcard map, itself an entry.
export const walkComparisonEntries = (payload, { descriptor, comparison, registryId }) => {
  assertComparisonDeclaration(comparison, registryId);
  if (!isPlainObject(payload)) {
    fail('The registry payload must be an object.');
  }

  const canonicalPayload = canonicalizeRegistryPayload(payload, descriptor);
  assertCoverage(canonicalPayload, comparison);
  const entries = new Map();
  const addEntry = (address, value, site) => {
    if (entries.has(address)) {
      fail(`Comparison address "${address}" occurs twice.`);
    }
    entries.set(address, { address, value, site });
  };

  for (const collection of comparison) {
    for (const { base, node, container, isGroup } of locateCollection(canonicalPayload, collection)) {
      if (collection.kind === 'value') {
        addEntry(base, node, { kind: 'value', container });
        continue;
      }

      if (!Array.isArray(node)) {
        fail(`"${base}" must be an array for a ${collection.kind} collection.`);
      }

      if (collection.kind === 'members') {
        for (const member of node) {
          if (!isScalar(member)) {
            fail(`"${base}" members must be scalars.`);
          }
          addEntry(`${base}[${JSON.stringify(member)}]`, member, { kind: 'member', container, member });
        }
        continue;
      }

      // keyed
      const keyField = collection.key;
      if (isGroup) {
        addEntry(base, true, { kind: 'group', container });
      }
      const keys = node.map((record) => {
        const key = isPlainObject(record) ? record[keyField] : undefined;
        if (!isScalar(key) || key === null) {
          fail(`Every record of "${base}" needs a scalar "${keyField}".`);
        }
        addEntry(`${base}[${keyField}=${JSON.stringify(key)}]`, record, {
          kind: 'record',
          container,
          keyField,
          key,
          grouped: isGroup,
        });
        return key;
      });
      if (collection.ordered) {
        addEntry(`${base}${ORDER_SUFFIX}`, keys, { kind: 'order', container, keyField, grouped: isGroup });
      }
    }
  }

  return [...entries.values()].sort((left, right) => compareOrdinal(left.address, right.address));
};

// [5.2.9] cfg-registryLifecycle · Derived value · "extractComparisonEntries"
// Returns a Map from address to canonical entry value, in ordinal address order.
export const extractComparisonEntries = (payload, entry) =>
  new Map(walkComparisonEntries(payload, entry).map(({ address, value }) => [address, value]));

// [5.2.9] cfg-registryLifecycle · Derived value · "classifyEntry"
// Three-way class of one entry (spec §8.2). Each argument is the entry's canonical value, or
// `undefined` when the entry is absent from that input. Returns null when nothing differs.
export const classifyEntry = (baseline, builtin, custom) => {
  const [baselineKey, builtinKey, customKey] = [baseline, builtin, custom].map((value) =>
    value === undefined ? undefined : stableStringify(value),
  );
  const builtinChanged = builtinKey !== baselineKey;
  const customChanged = customKey !== baselineKey;

  if (builtinChanged && customChanged) {
    return customKey === builtinKey ? ENTRY_CLASSES.aligned : ENTRY_CLASSES.bothChanged;
  }

  if (builtinChanged) {
    if (baselineKey === undefined) {
      return ENTRY_CLASSES.builtinAdded;
    }
    return builtinKey === undefined ? ENTRY_CLASSES.builtinRemoved : ENTRY_CLASSES.builtinChanged;
  }

  return customChanged ? ENTRY_CLASSES.customOnly : null;
};
