// Tree Stage 2 Semantic Home reasoning vocabularies (Tree slice spec S2.2, S2.6, S2.9;
// calculogic-validator#102). Closed lists only; the rules live in the reasoning modules.

export const SEMANTIC_HOME_REASONING_STATUSES = Object.freeze({
  evaluated: 'evaluated',
  configurationUnavailable: 'configuration-unavailable',
  notPrepared: 'not-prepared',
});

export const SEMANTIC_HOME_OUTCOMES = Object.freeze({
  eligible: 'eligible',
  notEligible: 'not-eligible',
  undetermined: 'undetermined',
});

// S2.2 reasons, each with its single outcome.
export const SEMANTIC_HOME_REASONS = Object.freeze({
  supported: 'supported',
  contradicted: 'contradicted',
  noActiveMembers: 'no-active-members',
  insufficientEvaluatedCoverage: 'insufficient-evaluated-coverage',
  insufficientSupport: 'insufficient-support',
  mixedEvidence: 'mixed-evidence',
  dependsOnUndeterminedNestedCandidate: 'depends-on-undetermined-nested-candidate',
  claimUnresolved: 'claim-unresolved',
});

export const SEMANTIC_HOME_NOTES = Object.freeze({
  channelDisagreement: 'channel-disagreement',
  bounded: 'bounded',
});

export const SEMANTIC_HOME_CHANNELS = Object.freeze({ root: 'root', prefix: 'prefix' });

// S2.6 member attribution.
export const SEMANTIC_HOME_ATTRIBUTIONS = Object.freeze({
  retained: 'retained',
  reattributed: 'reattributed',
  attributionUndetermined: 'attribution-undetermined',
});
export const SEMANTIC_HOME_ATTRIBUTION_REASONS = Object.freeze({
  matchesEligibleNestedCandidate: 'matches-eligible-nested-candidate',
  matchesUndeterminedNestedCandidate: 'matches-undetermined-nested-candidate',
  noEligibleMatchingNestedCandidate: 'no-eligible-matching-nested-candidate',
});

// S2.6 decision evidence: the conditions of `eligible` and `not-eligible`.
export const SEMANTIC_HOME_CONDITIONS = Object.freeze({
  activeMembers: 'active-members',
  coverage: 'coverage',
  eligibleShare: 'eligible-share',
  minimumSupport: 'minimum-support',
  notEligibleShare: 'not-eligible-share',
});
