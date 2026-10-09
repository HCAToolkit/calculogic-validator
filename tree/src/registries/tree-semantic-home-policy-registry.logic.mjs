// Tree semantic-home-policy registry shape validation (#41 registry lifecycle).
// The registry is evidence-policy reference data with no runtime consumer yet; this module owns
// its shape so Tree's registry-set validation entry point covers it (lifecycle spec §9.3).
import { assertTreeRegistryEntries } from './tree-registry-entry-shape.logic.mjs';

export const SEMANTIC_HOME_POLICY_INPUT_LANES = Object.freeze([
  'folder-context',
  'parent-lineage',
  'naming-bridge',
  'structural-home-boundary',
  'structural-signal-boundary',
  'repo-top-structural-boundary',
]);
export const SEMANTIC_HOME_POLICY_STATUSES = Object.freeze(['active']);

export const assertValidSemanticHomePolicyRegistry = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid Tree semantic-home-policy registry: expected object payload.');
  }

  assertTreeRegistryEntries(payload.semanticHomePolicy, {
    registryLabel: 'semantic-home-policy',
    listLabel: 'semanticHomePolicy',
    keyField: 'policyId',
    requiredStringFields: ['definition', 'derivationMeaning', 'guardrails'],
    enumFields: { inputLane: SEMANTIC_HOME_POLICY_INPUT_LANES, status: SEMANTIC_HOME_POLICY_STATUSES },
  });

  return payload;
};
