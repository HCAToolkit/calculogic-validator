/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.25)
 * Responsibility: Naming's bridge-domain resolver (lifecycle spec §9.4): the values a Naming
 *   registry can emit through each bridge its inventory declares, each with the entry that emits it.
 * Invariants: pure and source-only; reads only the payload it is given; selects with the same
 *   predicate as the runtime projection that emits the values; emits structured identities, never
 *   address syntax; an unknown bridge or perspective is a programming error.
 */
import { selectEmittingFolderCompositionPatterns } from '../naming-folder-composition-projection.logic.mjs';
import { NAMING_FOLDER_COMPOSITION_KINDS } from '../naming-validator.contracts.mjs';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// `naming/folder-composition-structural-role-token`: the structural-role token of every composition
// pattern the folder-composition projection can emit an observation from, for the composition kind
// the bridge's perspective names.
const resolveStructuralRoleTokenDomain = ({ perspective, payload }) => {
  if (perspective !== NAMING_FOLDER_COMPOSITION_KINDS.SEMANTIC_QUALIFIED_STRUCTURAL_CONTAINER) {
    throw new Error(`Naming emits no structural-role tokens for perspective ${JSON.stringify(perspective)}.`);
  }
  const patterns = Array.isArray(payload.folderCompositionPatterns) ? payload.folderCompositionPatterns.filter(isPlainObject) : [];
  return [...selectEmittingFolderCompositionPatterns(patterns).values()].map((pattern) => ({
    value: pattern.structuralRoleToken,
    source: { collection: 'folderCompositionPatterns', groups: [], key: pattern.patternId },
  }));
};

const EMITTED_DOMAIN_RESOLVERS = Object.freeze({
  'naming/folder-composition-structural-role-token': resolveStructuralRoleTokenDomain,
});

// [5.2.25] cfg-registryLifecycle · Container · "Naming bridge-domain resolver"
export const NAMING_BRIDGE_DOMAIN_RESOLVER = Object.freeze({
  versions: Object.freeze(['1']),
  resolveEmitted: ({ bridgeId, perspective, payload }) => {
    const resolve = EMITTED_DOMAIN_RESOLVERS[bridgeId];
    if (!resolve) {
      throw new Error(`Naming declares no emitted domain for bridge ${JSON.stringify(bridgeId)}.`);
    }
    return resolve({ perspective, payload });
  },
});
