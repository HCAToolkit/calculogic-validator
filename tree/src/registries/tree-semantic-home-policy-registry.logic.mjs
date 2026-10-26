// Tree semantic-home-policy registry shape validation (#41 registry lifecycle; Tree spec Stage 2 S2.10).
// Version "1" holds the descriptive input lanes; version "2" adds `semanticHomeParameters`, the four
// Stage 2 policy values (RR3). The registry has no runtime consumer yet: this module owns its shape so
// Tree's registry-set validation entry point covers it (lifecycle spec §9.3).
import { assertRegistryEntries } from '../../../src/core/registry-entry-shape.logic.mjs';

export const SEMANTIC_HOME_POLICY_INPUT_LANES = Object.freeze([
  'folder-context',
  'parent-lineage',
  'naming-bridge',
  'structural-home-boundary',
  'structural-signal-boundary',
  'repo-top-structural-boundary',
]);
export const SEMANTIC_HOME_POLICY_STATUSES = Object.freeze(['active']);

// Root fields besides `version`, per readable version (RR5: a version-1 file never carries parameters).
export const SEMANTIC_HOME_POLICY_ROOT_FIELDS_BY_VERSION = Object.freeze({
  1: Object.freeze(['semanticHomePolicy']),
  2: Object.freeze(['semanticHomePolicy', 'semanticHomeParameters']),
});

// The closed parameter set and the S2.5 constraint on each value; the Tree spec's S2.10 identifier
// table maps each `parameterId` to its S2.5 name.
export const SEMANTIC_HOME_PARAMETER_IDS = Object.freeze(['coverage', 'minimum-support', 'not-eligible-share', 'eligible-share']);
const PARAMETER_VALUE_RULES = Object.freeze({
  coverage: { accepts: (value) => value > 0 && value <= 1, describe: 'greater than 0 and at most 1' },
  'minimum-support': { accepts: (value) => Number.isInteger(value) && value >= 1, describe: 'an integer of at least 1' },
  'not-eligible-share': { accepts: (value) => value >= 0 && value <= 1, describe: 'between 0 and 1 inclusive' },
  'eligible-share': { accepts: (value) => value >= 0 && value <= 1, describe: 'between 0 and 1 inclusive' },
});
const CATALOGUE_CASE_PATTERN = /^C[1-9][0-9]*$/u;

const assertSemanticHomeParameters = (parameters, registryLabel) => {
  const fail = (message) => {
    throw new Error(`Invalid ${registryLabel} registry: ${message}`);
  };

  assertRegistryEntries(parameters, {
    registryLabel,
    listLabel: 'semanticHomeParameters',
    keyField: 'parameterId',
    requiredStringFields: ['rationale'],
    enumFields: { parameterId: SEMANTIC_HOME_PARAMETER_IDS },
    otherFields: ['value', 'catalogueCases'],
  });

  const valueById = new Map();
  parameters.forEach((entry, index) => {
    const label = `semanticHomeParameters[${index}]`;
    // Each range rejects NaN and the infinities, so a number passing its rule is finite.
    if (!Object.hasOwn(entry, 'value') || typeof entry.value !== 'number') {
      fail(`${label}.value must be a number.`);
    }
    const rule = PARAMETER_VALUE_RULES[entry.parameterId];
    if (!rule.accepts(entry.value)) {
      fail(`${label}.value for ${entry.parameterId} must be ${rule.describe}.`);
    }
    const cases = entry.catalogueCases;
    if (
      !Array.isArray(cases) ||
      cases.length === 0 ||
      !cases.every((caseId) => typeof caseId === 'string' && CATALOGUE_CASE_PATTERN.test(caseId)) ||
      new Set(cases).size !== cases.length
    ) {
      fail(`${label}.catalogueCases must be a non-empty list of unique catalogue case ids (C followed by a number).`);
    }
    valueById.set(entry.parameterId, entry.value);
  });

  const missing = SEMANTIC_HOME_PARAMETER_IDS.filter((parameterId) => !valueById.has(parameterId));
  if (missing.length > 0) {
    fail(`semanticHomeParameters must hold every parameter; missing ${missing.join(', ')}.`);
  }
  if (!(valueById.get('not-eligible-share') < valueById.get('eligible-share'))) {
    fail('semanticHomeParameters not-eligible-share must be less than eligible-share.');
  }
};

export const assertValidSemanticHomePolicyRegistry = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid Tree semantic-home-policy registry: expected object payload.');
  }
  if (typeof payload.version !== 'string' || !Object.hasOwn(SEMANTIC_HOME_POLICY_ROOT_FIELDS_BY_VERSION, payload.version)) {
    throw new Error(
      `Invalid Tree semantic-home-policy registry: version ${JSON.stringify(payload.version ?? null)} is not readable; readable versions: ${Object.keys(SEMANTIC_HOME_POLICY_ROOT_FIELDS_BY_VERSION).join(', ')}.`,
    );
  }

  assertRegistryEntries(payload.semanticHomePolicy, {
    registryLabel: 'Tree semantic-home-policy',
    listLabel: 'semanticHomePolicy',
    keyField: 'policyId',
    requiredStringFields: ['definition', 'derivationMeaning', 'guardrails'],
    enumFields: { inputLane: SEMANTIC_HOME_POLICY_INPUT_LANES, status: SEMANTIC_HOME_POLICY_STATUSES },
  });

  if (payload.version === '2') {
    assertSemanticHomeParameters(payload.semanticHomeParameters, 'Tree semantic-home-policy');
  } else if (Object.hasOwn(payload, 'semanticHomeParameters')) {
    throw new Error('Invalid Tree semantic-home-policy registry: version "1" must not carry semanticHomeParameters.');
  }

  return payload;
};
