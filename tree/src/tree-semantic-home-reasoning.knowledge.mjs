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

// S2.8 placement.
export const SEMANTIC_HOME_PLACEMENT_STATES = Object.freeze({
  insideHome: 'inside-home',
  homeElsewhere: 'home-elsewhere',
  noHome: 'no-home',
  undetermined: 'undetermined',
});
export const SEMANTIC_HOME_PLACEMENT_REASONS = Object.freeze({
  homeOnLineageUndetermined: 'home-on-lineage-undetermined',
  homeElsewhereUndetermined: 'home-elsewhere-undetermined',
  candidateDiscoveryIncomplete: 'candidate-discovery-incomplete',
});
export const SEMANTIC_HOME_PLACEMENT_RELATIONS = Object.freeze({
  match: 'match',
  possibleUnevaluated: 'possible-unevaluated',
  possibleRootReading: 'possible-root-reading',
});
export const SEMANTIC_HOME_PLACEMENT_LOCATIONS = Object.freeze({ lineage: 'lineage', elsewhere: 'elsewhere' });

// S2.8 no-home evidence condition: the clauses a run can fail.
export const SEMANTIC_HOME_DISCOVERY_CLAUSES = Object.freeze({
  bridgeUnavailable: 'bridge-unavailable',
  folderLabelsUnavailable: 'folder-labels-unavailable',
  folderLabelAbsent: 'folder-label-absent',
  folderObservationRejected: 'folder-observation-rejected',
});
