/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§2.1, §5.2.25)
 * Responsibility: Maps each inventory slice that emits or interprets a cross-slice bridge to its
 *   slice-owned bridge-domain resolver (`{ versions, resolveEmitted?, resolveInterpretable? }`).
 * Invariants: suite core only calls the resolvers; which values a registry emits or interprets, and
 *   for which perspective, stays with each slice (lifecycle spec §9.4). A slice without bridges has
 *   no entry.
 */
import { NAMING_BRIDGE_DOMAIN_RESOLVER } from '../../../naming/src/registries/naming-registry-bridge-domains.logic.mjs';
import { TREE_BRIDGE_DOMAIN_RESOLVER } from '../../../tree/src/registries/tree-registry-bridge-domains.logic.mjs';

// [5.2.25] cfg-registryLifecycle · Container · "Slice bridge-domain resolvers"
export const SLICE_BRIDGE_DOMAIN_RESOLVERS = Object.freeze({
  naming: NAMING_BRIDGE_DOMAIN_RESOLVER,
  tree: TREE_BRIDGE_DOMAIN_RESOLVER,
});
