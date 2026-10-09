// Tree structural-home-signal-policy registry shape validation (#41 registry lifecycle).
// The registry is evidence-policy reference data with no runtime consumer yet; this module owns
// its shape so Tree's registry-set validation entry point covers it (lifecycle spec §9.3).

export const STRUCTURAL_HOME_SIGNAL_CATEGORIES = Object.freeze(['strong', 'contextual', 'weak', 'anti-pattern']);
export const STRUCTURAL_HOME_SIGNAL_STATUSES = Object.freeze(['active']);

const fail = (message) => {
  throw new Error(`Invalid Tree structural-home-signal-policy registry: ${message}`);
};

const assertNonEmptyString = (value, label) => {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} must be a non-empty string.`);
  }
};

export const assertValidStructuralHomeSignalPolicyRegistry = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    fail('expected object payload.');
  }
  if (!Array.isArray(payload.structuralHomeSignalPolicy) || payload.structuralHomeSignalPolicy.length === 0) {
    fail('structuralHomeSignalPolicy must be a non-empty array.');
  }

  const seenTokens = new Set();
  payload.structuralHomeSignalPolicy.forEach((entry, index) => {
    const label = `structuralHomeSignalPolicy[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      fail(`${label} must be an object.`);
    }
    for (const field of ['token', 'definition', 'evidenceMeaning', 'notes']) {
      assertNonEmptyString(entry[field], `${label}.${field}`);
    }
    if (seenTokens.has(entry.token)) {
      fail(`${label}.token "${entry.token}" is duplicated.`);
    }
    seenTokens.add(entry.token);
    if (!STRUCTURAL_HOME_SIGNAL_CATEGORIES.includes(entry.signalCategory)) {
      fail(`${label}.signalCategory must be one of ${STRUCTURAL_HOME_SIGNAL_CATEGORIES.join(', ')}.`);
    }
    if (!STRUCTURAL_HOME_SIGNAL_STATUSES.includes(entry.status)) {
      fail(`${label}.status must be one of ${STRUCTURAL_HOME_SIGNAL_STATUSES.join(', ')}.`);
    }
  });

  return payload;
};
