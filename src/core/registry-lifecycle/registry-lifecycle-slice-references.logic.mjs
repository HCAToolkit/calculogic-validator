/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§2.1, §5.2.20)
 * Responsibility: Maps each inventory slice that declares reference edges to its slice-owned
 *   reference resolver (`{ versions, resolve }`).
 * Invariants: suite core only calls the resolvers; which fields hold references and what they
 *   name stays with each slice (lifecycle spec §12.11). A slice without edges has no entry.
 */
import { NAMING_REFERENCE_RESOLVER } from '../../../naming/src/registries/naming-registry-references.logic.mjs';
import { TREE_REFERENCE_RESOLVER } from '../../../tree/src/registries/tree-registry-references.logic.mjs';

// [5.2.20] cfg-registryLifecycle · Container · "Slice reference resolvers"
export const SLICE_REFERENCE_RESOLVERS = Object.freeze({
  naming: NAMING_REFERENCE_RESOLVER,
  tree: TREE_REFERENCE_RESOLVER,
});
