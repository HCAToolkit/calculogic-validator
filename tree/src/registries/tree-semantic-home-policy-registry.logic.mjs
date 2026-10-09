// Tree semantic-home-policy registry shape validation (#41 registry lifecycle).
// The registry is evidence-policy reference data with no runtime consumer yet; this module owns
// its shape so Tree's registry-set validation entry point covers it (lifecycle spec §9.3).

export const SEMANTIC_HOME_POLICY_INPUT_LANES = Object.freeze([
  'folder-context',
  'parent-lineage',
  'naming-bridge',
  'structural-home-boundary',
  'structural-signal-boundary',
  'repo-top-structural-boundary',
]);
export const SEMANTIC_HOME_POLICY_STATUSES = Object.freeze(['active']);

const fail = (message) => {
  throw new Error(`Invalid Tree semantic-home-policy registry: ${message}`);
};

const assertNonEmptyString = (value, label) => {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} must be a non-empty string.`);
  }
};

export const assertValidSemanticHomePolicyRegistry = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    fail('expected object payload.');
  }
  if (!Array.isArray(payload.semanticHomePolicy) || payload.semanticHomePolicy.length === 0) {
    fail('semanticHomePolicy must be a non-empty array.');
  }

  const seenPolicyIds = new Set();
  payload.semanticHomePolicy.forEach((entry, index) => {
    const label = `semanticHomePolicy[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      fail(`${label} must be an object.`);
    }
    for (const field of ['policyId', 'inputLane', 'definition', 'derivationMeaning', 'guardrails']) {
      assertNonEmptyString(entry[field], `${label}.${field}`);
    }
    if (seenPolicyIds.has(entry.policyId)) {
      fail(`${label}.policyId "${entry.policyId}" is duplicated.`);
    }
    seenPolicyIds.add(entry.policyId);
    if (!SEMANTIC_HOME_POLICY_INPUT_LANES.includes(entry.inputLane)) {
      fail(`${label}.inputLane must be one of ${SEMANTIC_HOME_POLICY_INPUT_LANES.join(', ')}.`);
    }
    if (!SEMANTIC_HOME_POLICY_STATUSES.includes(entry.status)) {
      fail(`${label}.status must be one of ${SEMANTIC_HOME_POLICY_STATUSES.join(', ')}.`);
    }
  });

  return payload;
};
