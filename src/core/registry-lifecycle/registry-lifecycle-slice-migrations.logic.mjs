/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§2.1, §5.2.15)
 * Responsibility: Maps each inventory slice to its slice-owned migration transforms
 *   (`{ [transformId]: payload => payload }`), which its inventory's migration declarations name.
 * Invariants: suite core only runs the transforms; how an old shape maps to a new one stays with
 *   each slice (lifecycle spec §8.3). Every slice's map is empty while no registry has changed
 *   shape; a slice adds its `<slice>-registry-migrations.logic.mjs` module here with its first
 *   migration.
 */
const NO_TRANSFORMS = Object.freeze({});

// [5.2.15] cfg-registryLifecycle · Container · "Slice migration transforms"
export const SLICE_MIGRATION_TRANSFORMS = Object.freeze({
  naming: NO_TRANSFORMS,
  tree: NO_TRANSFORMS,
  suite: NO_TRANSFORMS,
});
