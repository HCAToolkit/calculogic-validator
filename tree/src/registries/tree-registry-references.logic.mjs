/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.20)
 * Responsibility: Tree's reference resolver (lifecycle spec §12.11): turns a Tree source payload
 *   into the references its inventory's `references` declarations name.
 * Invariants: pure and source-only; reads only the payload it is given, never a target registry;
 *   emits structured identities, never address syntax; a value that is not a string emits no
 *   reference, and whether its registry is valid stays with Tree's registry-set validation.
 */
const SURFACE_PERSPECTIVE_REGISTRY_ID = 'tree/surface-structural-home-perspective';
const SURFACE_PERSPECTIVE_COLLECTION = 'structuralHomesBySurface.*';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Each surface record names the structural home it places.
const resolveSurfacePerspectiveReferences = (payload) => {
  const references = [];
  const bySurface = isPlainObject(payload.structuralHomesBySurface) ? payload.structuralHomesBySurface : {};
  for (const [surface, entries] of Object.entries(bySurface)) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!isPlainObject(entry) || typeof entry.structuralHome !== 'string') {
        continue;
      }
      references.push({
        edgeId: 'tree/perspective-structural-home',
        source: { collection: SURFACE_PERSPECTIVE_COLLECTION, groups: [surface], key: entry.structuralHome },
        target: { groups: [], key: entry.structuralHome },
      });
    }
  }
  return references;
};

const RESOLVERS_BY_REGISTRY = Object.freeze({ [SURFACE_PERSPECTIVE_REGISTRY_ID]: resolveSurfacePerspectiveReferences });

// [5.2.20] cfg-registryLifecycle · Derived value · "Tree reference resolver"
// `versions` are the source `version` values it reads; `resolve({ registryId, payload })` returns
// `[{ edgeId, source: { collection, groups, key? }, target: { groups, key } }]`.
export const TREE_REFERENCE_RESOLVER = Object.freeze({
  versions: Object.freeze(['1']),
  resolve: ({ registryId, payload }) => {
    const resolve = RESOLVERS_BY_REGISTRY[registryId];
    return resolve ? resolve(payload) : [];
  },
});
