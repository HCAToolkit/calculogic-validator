/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.20)
 * Responsibility: Naming's reference resolver (lifecycle spec §12.11): turns a Naming source
 *   payload into the references its inventory's `references` declarations name.
 * Invariants: pure and source-only; reads only the payload it is given, never a target registry;
 *   emits structured identities, never address syntax; a value that is not a string emits no
 *   reference, and whether its registry is valid stays with Naming's registry-set validation.
 */
const PERSPECTIVE_REGISTRY_ID = 'naming/category-role-perspective';
const PERSPECTIVE_COLLECTION = 'rolesByCategory.*';
const MEANING_FIELDS = Object.freeze(['agnosticCoreMeanings', 'baseMeanings', 'overlayMeanings']);

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isString = (value) => typeof value === 'string';

// The perspective's references: each category key names a category; each role names its definition
// in `roles`; each distinct meaning across a role's three meaning lists names one agnostic core
// meaning; `inheritsFrom` names a role of a perspective category.
const resolvePerspectiveReferences = (payload) => {
  const references = [];
  const rolesByCategory = isPlainObject(payload.rolesByCategory) ? payload.rolesByCategory : {};
  for (const [category, entries] of Object.entries(rolesByCategory)) {
    references.push({
      edgeId: 'naming/perspective-category',
      source: { collection: PERSPECTIVE_COLLECTION, groups: [category] },
      target: { groups: [], key: category },
    });

    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!isPlainObject(entry) || !isString(entry.role)) {
        continue;
      }
      const source = { collection: PERSPECTIVE_COLLECTION, groups: [category], key: entry.role };
      references.push({ edgeId: 'naming/perspective-role-definition', source, target: { groups: [], key: entry.role } });

      const meanings = new Set(MEANING_FIELDS.flatMap((field) => (Array.isArray(entry[field]) ? entry[field] : [])));
      for (const meaning of [...meanings].filter(isString)) {
        references.push({ edgeId: 'naming/perspective-meaning', source, target: { groups: [], key: meaning } });
      }

      const parent = entry.inheritsFrom;
      if (isPlainObject(parent) && isString(parent.category) && isString(parent.role)) {
        references.push({
          edgeId: 'naming/perspective-inherits-from',
          source,
          target: { groups: [parent.category], key: parent.role },
        });
      }
    }
  }
  return references;
};

const RESOLVERS_BY_REGISTRY = Object.freeze({ [PERSPECTIVE_REGISTRY_ID]: resolvePerspectiveReferences });

// [5.2.20] cfg-registryLifecycle · Derived value · "Naming reference resolver"
// `versions` are the source `version` values it reads; `resolve({ registryId, payload })` returns
// `[{ edgeId, source: { collection, groups, key? }, target: { groups, key } }]`.
export const NAMING_REFERENCE_RESOLVER = Object.freeze({
  versions: Object.freeze(['1']),
  resolve: ({ registryId, payload }) => {
    const resolve = RESOLVERS_BY_REGISTRY[registryId];
    return resolve ? resolve(payload) : [];
  },
});
