/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.25)
 * Responsibility: Tree's bridge-domain resolver (lifecycle spec §9.4): the values a Tree registry
 *   can interpret through each bridge its inventory declares it interprets.
 * Invariants: pure and source-only; reads only the payload it is given; selects with the same
 *   predicate as the runtime relationship that interprets the values; an unknown bridge is a
 *   programming error.
 */
import { selectInterpretableStructuralRoleTokens } from '../tree-semantic-naming-folder-type-relationship.logic.mjs';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// `naming/folder-composition-structural-role-token`: every token the semantic-naming folder-type
// relationship can resolve for the bridge's relationship perspective.
const resolveStructuralRoleTokenDomain = ({ perspective, payload }) => {
  const registry = {
    structuralRoleTokens: Array.isArray(payload.structuralRoleTokens) ? payload.structuralRoleTokens.filter(isPlainObject) : [],
  };
  return [...selectInterpretableStructuralRoleTokens(registry, perspective).keys()].map((value) => ({ value }));
};

const INTERPRETABLE_DOMAIN_RESOLVERS = Object.freeze({
  'naming/folder-composition-structural-role-token': resolveStructuralRoleTokenDomain,
});

// [5.2.25] cfg-registryLifecycle · Container · "Tree bridge-domain resolver"
export const TREE_BRIDGE_DOMAIN_RESOLVER = Object.freeze({
  versions: Object.freeze(['1']),
  resolveInterpretable: ({ bridgeId, perspective, payload }) => {
    const resolve = INTERPRETABLE_DOMAIN_RESOLVERS[bridgeId];
    if (!resolve) {
      throw new Error(`Tree declares no interpretable domain for bridge ${JSON.stringify(bridgeId)}.`);
    }
    return resolve({ perspective, payload });
  },
});
