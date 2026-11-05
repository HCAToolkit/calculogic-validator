// Tree organizational-placement registry shape validation and direct loader (#41 registry lifecycle;
// Tree spec S2.16). The registry records which artifact kinds a repository keeps in which structural
// namespaces: each entry selects Naming roles or role categories and states an arrangement, `centralized`
// (with the Tree structural homes that hold the kind) or `colocated`. This module owns the shape, so Tree's
// registry-set validation entry point covers it (lifecycle spec §9.3). It decides nothing: classifying a
// relation is the Stage 2 emitter's (S2.16), and whether a selector names a role or category the run's
// Naming vocabulary declares is checked at run time, never here.
import fs from 'node:fs';
import path from 'node:path';
import { assertAllowedFields } from '../../../src/core/registry-entry-shape.logic.mjs';
import { TREE_BUILTIN_REGISTRY_ROOT } from './tree-registry-inventory.knowledge.mjs';

export const ORGANIZATIONAL_PLACEMENT_REGISTRY_ID = 'tree/organizational-placement';
const ORGANIZATIONAL_PLACEMENT_REGISTRY_FILENAME = 'organizational-placement.registry.json';
const REGISTRY_LABEL = 'Tree organizational-placement';
const READABLE_VERSIONS = Object.freeze(['1']);
const ENTRY_FIELDS = Object.freeze(['entryId', 'select', 'arrangement', 'namespaces', 'definition']);
export const ORGANIZATIONAL_PLACEMENT_SELECTOR_KINDS = Object.freeze(['roles', 'roleCategories']);
export const ORGANIZATIONAL_PLACEMENT_ARRANGEMENTS = Object.freeze({ centralized: 'centralized', colocated: 'colocated' });

export const ORGANIZATIONAL_PLACEMENT_ROOT_FIELDS = Object.freeze(['entries']);

const fail = (message) => {
  throw new Error(`Invalid ${REGISTRY_LABEL} registry: ${message}`);
};
const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const assertNonEmptyStringList = (value, label) => {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isNonEmptyString)) fail(`${label} must be a non-empty array of non-empty strings.`);
  if (new Set(value).size !== value.length) fail(`${label} must not repeat a value.`);
};

// Shape only: a closed record per entry, one selector kind, an arrangement, and namespaces exactly when
// centralized. An empty `entries` is valid: it is the Builtin set (S2.16).
export const assertValidOrganizationalPlacementRegistry = (payload) => {
  if (!isPlainObject(payload)) fail('expected object payload.');
  if (!READABLE_VERSIONS.includes(payload.version)) {
    fail(`version ${JSON.stringify(payload.version ?? null)} is not readable; readable versions: ${READABLE_VERSIONS.join(', ')}.`);
  }
  if (!Array.isArray(payload.entries)) fail('entries must be an array.');

  const entryIds = new Set();
  // One value has at most one owner per selector kind, so precedence is never ambiguous (S2.16).
  const selectedBy = { roles: new Map(), roleCategories: new Map() };
  payload.entries.forEach((entry, index) => {
    const label = `entries[${index}]`;
    if (!isPlainObject(entry)) fail(`${label} must be an object.`);
    assertAllowedFields(entry, ENTRY_FIELDS, { registryLabel: REGISTRY_LABEL, label });
    for (const field of ['entryId', 'definition']) {
      if (!isNonEmptyString(entry[field])) fail(`${label}.${field} must be a non-empty string.`);
    }
    if (entryIds.has(entry.entryId)) fail(`${label}.entryId ${entry.entryId} is not unique.`);
    entryIds.add(entry.entryId);

    if (!isPlainObject(entry.select)) fail(`${label}.select must be an object.`);
    const kinds = Object.keys(entry.select);
    if (kinds.length !== 1 || !ORGANIZATIONAL_PLACEMENT_SELECTOR_KINDS.includes(kinds[0])) {
      fail(`${label}.select must hold exactly one of ${ORGANIZATIONAL_PLACEMENT_SELECTOR_KINDS.join(', ')}.`);
    }
    const [kind] = kinds;
    assertNonEmptyStringList(entry.select[kind], `${label}.select.${kind}`);
    for (const value of entry.select[kind]) {
      if (selectedBy[kind].has(value)) fail(`${label}.select.${kind} names ${value}, already selected by ${selectedBy[kind].get(value)}.`);
      selectedBy[kind].set(value, entry.entryId);
    }

    if (!Object.values(ORGANIZATIONAL_PLACEMENT_ARRANGEMENTS).includes(entry.arrangement)) {
      fail(`${label}.arrangement must be one of ${Object.values(ORGANIZATIONAL_PLACEMENT_ARRANGEMENTS).join(', ')}.`);
    }
    if (entry.arrangement === ORGANIZATIONAL_PLACEMENT_ARRANGEMENTS.centralized) {
      assertNonEmptyStringList(entry.namespaces, `${label}.namespaces`);
    } else if (Object.hasOwn(entry, 'namespaces')) {
      fail(`${label} is colocated and must not list namespaces.`);
    }
  });

  return payload;
};

// The same-slice reference edge `tree/organizational-placement-namespace` (lifecycle spec §12.11): every
// namespace a centralized entry names is a structural home declared in the same registry root.
export const assertOrganizationalPlacementReferences = (placementPayload, structuralHomesPayload) => {
  const declaredHomes = new Set(
    (Array.isArray(structuralHomesPayload?.structuralHomes) ? structuralHomesPayload.structuralHomes : []).map((entry) => entry?.structuralHome),
  );
  const dangling = new Set(
    placementPayload.entries.flatMap((entry) => entry.namespaces ?? []).filter((namespace) => !declaredHomes.has(namespace)),
  );
  if (dangling.size > 0) {
    fail(`namespaces not declared in structural-homes: ${[...dangling].sort().join(', ')}.`);
  }
};

// The prepared policy (S2.16): entries in registry order, frozen.
export const toTreeOrganizationalPlacementPolicy = (payload) =>
  Object.freeze({
    entries: Object.freeze(
      payload.entries.map((entry) =>
        Object.freeze({
          entryId: entry.entryId,
          select: Object.freeze(Object.fromEntries(Object.entries(entry.select).map(([kind, values]) => [kind, Object.freeze([...values])]))),
          arrangement: entry.arrangement,
          ...(entry.namespaces ? { namespaces: Object.freeze([...entry.namespaces]) } : {}),
          definition: entry.definition,
        }),
      ),
    ),
  });

let cachedBuiltinOrganizationalPlacementRegistry = null;

// Loads from one Tree registry root, Builtin or Custom (#41 registry lifecycle, spec §9.3).
export const loadOrganizationalPlacementRegistryFromRegistryRoot = (registryRoot) =>
  assertValidOrganizationalPlacementRegistry(
    JSON.parse(fs.readFileSync(path.join(registryRoot, ORGANIZATIONAL_PLACEMENT_REGISTRY_FILENAME), 'utf8')),
  );

export const getBuiltinOrganizationalPlacementRegistry = () => {
  if (!cachedBuiltinOrganizationalPlacementRegistry) {
    cachedBuiltinOrganizationalPlacementRegistry = loadOrganizationalPlacementRegistryFromRegistryRoot(TREE_BUILTIN_REGISTRY_ROOT);
  }
  return cachedBuiltinOrganizationalPlacementRegistry;
};
