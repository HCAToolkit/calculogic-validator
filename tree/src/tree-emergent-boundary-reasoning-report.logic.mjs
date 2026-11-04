// Tree Stage 3 report summary (Tree slice spec S3.13.7; calculogic-validator#171, slice C). What the
// run's Stage 3 advisory findings rested on: whether eligibility was evaluated and, if not, which run
// condition failed (EL1 or EL2); the policy source and adopted-policy provenance; whether a language
// profile was active; and the eligibility and exclusion counts. Exclusions are counts, never findings.
// It reads the prepared record through the contributor's eligibility only and changes nothing.

import {
  evaluateEmergentBoundaryEligibility,
  EMERGENT_BOUNDARY_ELIGIBILITY_STATUSES,
  TREE_EMERGENT_BOUNDARY_OPPORTUNITY_CODE,
} from './contributors/tree-emergent-boundary-opportunity-contributor.logic.mjs';

// The finding codes decided from the Stage 3 record (S3.13.5).
export const TREE_EMERGENT_BOUNDARY_GOVERNED_CODES = Object.freeze([TREE_EMERGENT_BOUNDARY_OPPORTUNITY_CODE]);

const policyOf = (assessment) => {
  if (!assessment?.policy) return null;
  return {
    policyId: assessment.policy.policyId,
    policyVersion: assessment.policy.policyVersion,
    ...(assessment.policyRegistry ? { registry: { ...assessment.policyRegistry } } : {}),
  };
};

// `record` is `treeEmergentBoundaryReasoning`; null when Stage 3 was not prepared at all.
export const toTreeEmergentBoundaryReasoningReport = (record) => {
  if (!record) return null;
  const eligibility = evaluateEmergentBoundaryEligibility(record);
  const policy = policyOf(record.assessment);
  return {
    status: eligibility.status,
    ...(eligibility.status !== EMERGENT_BOUNDARY_ELIGIBILITY_STATUSES.evaluated ? { reason: eligibility.reason } : {}),
    policySource: record.assessment?.policySource ?? null,
    ...(policy ? { policy } : {}),
    lexicalProfileActive: Boolean(record.lexicalIdentity),
    ...(eligibility.counts ? { eligibility: structuredClone(eligibility.counts) } : {}),
    governedCodes: [...TREE_EMERGENT_BOUNDARY_GOVERNED_CODES],
  };
};
