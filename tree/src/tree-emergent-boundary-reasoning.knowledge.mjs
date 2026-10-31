// Tree Stage 3 emergent-boundary reasoning vocabularies (Tree slice spec S3.3-S3.8, S3.10;
// calculogic-validator#136). Closed lists only; the rules live in `tree-emergent-boundary-reasoning.logic.mjs`.

export const EMERGENT_BOUNDARY_PREPARATION_STATUSES = Object.freeze({
  prepared: 'prepared',
  notPrepared: 'not-prepared',
});
export const EMERGENT_BOUNDARY_PREPARATION_REASONS = Object.freeze({
  semanticHomeReasoningNotEvaluated: 'semantic-home-reasoning-not-evaluated',
});

// S3.8: outcomes need an explicitly supplied experimental policy; there is no default.
export const EMERGENT_BOUNDARY_ASSESSMENT_STATUSES = Object.freeze({
  evaluated: 'evaluated',
  configurationUnavailable: 'configuration-unavailable',
});
export const EMERGENT_BOUNDARY_ASSESSMENT_REASONS = Object.freeze({
  experimentalPolicyAbsent: 'experimental-policy-absent',
  experimentalPolicyInvalid: 'experimental-policy-invalid',
});

// S3.3, S3.10: the discovery method, and the limits inherent to it (never detected, always recorded).
export const EMERGENT_BOUNDARY_DISCOVERY_METHODS = Object.freeze({ prefixV0: 'prefix-v0' });
export const EMERGENT_BOUNDARY_DISCOVERY_LIMITS = Object.freeze({
  singularPluralRelationship: 'singular-plural-relationship',
  relationshipsAwayFromLeadingTokens: 'relationships-away-from-leading-tokens',
});

// S3.4.
export const EMERGENT_BOUNDARY_RELATIONS = Object.freeze({
  nestedSubgroup: 'nested-subgroup',
  redundant: 'redundant',
  competing: 'competing',
  disjoint: 'disjoint',
});

// S3.5 member sets, and the explanation each non-supported member carries.
export const EMERGENT_BOUNDARY_MEMBER_SETS = Object.freeze({
  supported: 'supported',
  conflicting: 'conflicting',
  unresolved: 'unresolved',
});
export const EMERGENT_BOUNDARY_MEMBER_EXPLANATIONS = Object.freeze({
  // conflicting: positive evidence of another destination.
  homeElsewhereDifferentClaim: 'home-elsewhere-different-claim',
  // unresolved: insufficient evidence for a decision.
  placementUndetermined: 'placement-undetermined',
  undeterminedCandidateElsewhere: 'undetermined-candidate-elsewhere',
  roleCategoryAbsent: 'role-category-absent',
  semanticNameAbsent: 'semantic-name-absent',
});
// S3.5: contextual evidence a supported member keeps (an undetermined ancestor alone).
export const EMERGENT_BOUNDARY_MEMBER_NOTES = Object.freeze({ relatedFolderUndetermined: 'related-folder-undetermined' });

// S3.5 claim relations of an existing folder's candidate to a grouping.
export const EMERGENT_BOUNDARY_CLAIM_RELATIONS = Object.freeze({
  corresponds: 'corresponds',
  broader: 'broader',
  different: 'different',
});

// S3.6.
export const EMERGENT_BOUNDARY_OUTCOMES = Object.freeze({
  opportunity: 'opportunity',
  insufficientEvidence: 'insufficient-evidence',
  explainedByExistingStructure: 'explained-by-existing-structure',
  notAnOpportunity: 'not-an-opportunity',
});
export const EMERGENT_BOUNDARY_REASONS = Object.freeze({
  belowMinimumUnits: 'below-minimum-units',
  lowSpecificity: 'low-specificity',
  correspondingHomeUnresolved: 'corresponding-home-unresolved',
  responsibilityEvidenceInsufficient: 'responsibility-evidence-insufficient',
  lowCoverage: 'low-coverage',
  memberPlacementUnresolved: 'member-placement-unresolved',
  internalBoundaryDeferred: 'internal-boundary-deferred',
  competingCandidateUnresolved: 'competing-candidate-unresolved',
  wholeDirectoryValueUndetermined: 'whole-directory-value-undetermined',
  singleResponsibilityUnit: 'single-responsibility-unit',
  redundantWith: 'redundant-with',
});
// S3.5 dimensions: the supporting reasons of an `opportunity`.
export const EMERGENT_BOUNDARY_DIMENSIONS = Object.freeze({
  concentration: 'concentration',
  lexicalSpecificity: 'lexical-specificity',
  responsibilityDiversity: 'responsibility-diversity',
  separationValue: 'separation-value',
});

// S3.6 outcome resolution, in order.
export const EMERGENT_BOUNDARY_RULES = Object.freeze({
  existingStructure: 'existing-structure',
  coverage: 'coverage',
  singleResponsibility: 'single-responsibility',
  redundancy: 'redundancy',
  wholeDirectory: 'whole-directory',
  specificity: 'specificity',
  minimumUnits: 'minimum-units',
  partialEvidence: 'partial-evidence',
  opportunity: 'opportunity',
});
export const EMERGENT_BOUNDARY_RESOLUTION_ORDER = Object.freeze(Object.values(EMERGENT_BOUNDARY_RULES));

export const EMERGENT_BOUNDARY_COMPLETION = Object.freeze({ complete: 'complete', incomplete: 'incomplete' });
export const EMERGENT_BOUNDARY_SELECTION = Object.freeze({ notNeeded: 'not-needed', unresolved: 'unresolved' });

// S3.8 provisional decisions: every experimental policy states each one, resolved or unresolved.
export const EMERGENT_BOUNDARY_DECISIONS = Object.freeze({
  minimumPrimaryUnits: 'minimum-primary-units',
  oneWordPrefix: 'one-word-prefix',
  responsibilityClassMapping: 'responsibility-class-mapping',
  separationValueLimit: 'separation-value-limit',
  coverageShare: 'coverage-share',
  partialEvidenceAggregation: 'partial-evidence-aggregation',
  opportunitySelection: 'opportunity-selection',
});
export const EMERGENT_BOUNDARY_POLICY_STATUSES = Object.freeze({ experimental: 'experimental' });

// S3.5 responsibility classes.
export const EMERGENT_BOUNDARY_RESPONSIBILITY_CLASSES = Object.freeze({ primary: 'primary', supporting: 'supporting' });

// S3.5: the one partial-evidence point the catalogue fixes (E14, E15). Contract, not policy.
export const EMERGENT_BOUNDARY_PARTIAL_EVIDENCE_POINT = Object.freeze({ supportedPrimaryUnits: 4, outsideFilesPerFive: 1 });

// Every outcome carries this: an evaluated candidate is never an authorized recommendation (S3.7, S3.11).
export const EMERGENT_BOUNDARY_RECOMMENDATION = Object.freeze({ status: 'not-authorized', reason: 'stage-3-evidence-only' });
