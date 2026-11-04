// Tree Stage 3 first advisory finding, `TREE_EMERGENT_BOUNDARY_OPPORTUNITY` (Tree slice spec S3.13.2-S3.13.5;
// calculogic-validator#171, slice C). Advisory eligibility and findings derivation over the prepared
// `treeEmergentBoundaryReasoning` record. It reads recorded fields only: it never re-assesses a candidate,
// re-derives evidence or changes the record, and it emits nothing for any candidate that fails EL1-EL5.
// Informational only: an opportunity is not a misplacement, and its absence is not approval (S3.12).

import {
  EMERGENT_BOUNDARY_ASSESSMENT_STATUSES,
  EMERGENT_BOUNDARY_COMPLETION,
  EMERGENT_BOUNDARY_OUTCOMES,
  EMERGENT_BOUNDARY_POLICY_SOURCES,
  EMERGENT_BOUNDARY_RELATIONS,
  EMERGENT_BOUNDARY_SELECTION,
} from '../tree-emergent-boundary-reasoning.knowledge.mjs';

export const TREE_EMERGENT_BOUNDARY_OPPORTUNITY_CODE = 'TREE_EMERGENT_BOUNDARY_OPPORTUNITY';
const BASIS = 'emergent-boundary-opportunity';
const CLASSIFICATION = 'advisory-structure';
const RULE_REF = 'calculogic-validator/doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md';
const MESSAGE =
  'This directory holds a cohesive group of files sharing a leading name sequence; a new folder for them may make the directory clearer. Advisory only, not a misplacement.';

// S3.13.7: why a run's candidates were not evaluated for eligibility.
export const EMERGENT_BOUNDARY_ELIGIBILITY_REASONS = Object.freeze({
  policyNotAdopted: 'policy-not-adopted',
  languageProfileInactive: 'language-profile-inactive',
});
export const EMERGENT_BOUNDARY_ELIGIBILITY_STATUSES = Object.freeze({
  evaluated: 'evaluated',
  notEvaluated: 'not-evaluated',
});

const prefixKey = (prefix) => prefix.join('-');
const byPrefix = (left, right) => prefixKey(left.prefix).localeCompare(prefixKey(right.prefix));
const copyTuple = ({ addressProfileId, addressedSnapshotId, occurrenceAddress }) => ({ addressProfileId, addressedSnapshotId, occurrenceAddress });

// EL1: evaluated under the adopted policy. EL2: an active language profile (the record carries
// `lexicalIdentity` only with an available lexical-identity section, S3.7).
const runConditionFailure = (record) => {
  const assessment = record?.assessment;
  if (assessment?.status !== EMERGENT_BOUNDARY_ASSESSMENT_STATUSES.evaluated || assessment.policySource !== EMERGENT_BOUNDARY_POLICY_SOURCES.adopted) {
    return EMERGENT_BOUNDARY_ELIGIBILITY_REASONS.policyNotAdopted;
  }
  if (!record.lexicalIdentity) return EMERGENT_BOUNDARY_ELIGIBILITY_REASONS.languageProfileInactive;
  return null;
};

// EL3-EL5 for one candidate, as the S3.13.7 category it falls into.
const candidateCategory = (candidate) => {
  const assessment = candidate.assessment;
  if (assessment?.completion !== EMERGENT_BOUNDARY_COMPLETION.complete) return 'incomplete';
  if (assessment.outcome !== EMERGENT_BOUNDARY_OUTCOMES.opportunity) return 'otherOutcome';
  if (assessment.selection?.status !== EMERGENT_BOUNDARY_SELECTION.notNeeded) return 'relatedOpportunity';
  return 'eligible';
};

// S3.13.3: the run's eligibility. `eligible` lists `{ directory, candidate }` pairs, in directory order
// and then prefix order; `counts` only when EL1 and EL2 hold.
export const evaluateEmergentBoundaryEligibility = (record) => {
  const failure = runConditionFailure(record);
  if (failure !== null) {
    return { status: EMERGENT_BOUNDARY_ELIGIBILITY_STATUSES.notEvaluated, reason: failure, eligible: [] };
  }
  const counts = { eligible: 0, notEligible: { incomplete: 0, relatedOpportunity: 0, otherOutcome: 0 } };
  const eligible = [];
  for (const directory of record.directories ?? []) {
    for (const candidate of [...directory.candidates].sort(byPrefix)) {
      const category = candidateCategory(candidate);
      if (category === 'eligible') {
        counts.eligible += 1;
        eligible.push({ directory, candidate });
      } else {
        counts.notEligible[category] += 1;
      }
    }
  }
  return { status: EMERGENT_BOUNDARY_ELIGIBILITY_STATUSES.evaluated, counts, eligible };
};

// S3.13.5: every non-disjoint relation of the candidate, with the partner's completion and outcome.
const relatedCandidatesOf = (directory, candidate) => {
  const key = prefixKey(candidate.prefix);
  const byKey = new Map(directory.candidates.map((entry) => [prefixKey(entry.prefix), entry]));
  return directory.relations
    .filter((relation) => relation.relation !== EMERGENT_BOUNDARY_RELATIONS.disjoint && relation.candidates.some((ref) => prefixKey(ref.prefix) === key))
    .map((relation) => {
      const partnerRef = relation.candidates.find((ref) => prefixKey(ref.prefix) !== key);
      const partner = byKey.get(prefixKey(partnerRef.prefix));
      return {
        prefix: [...partnerRef.prefix],
        relation: relation.relation,
        completion: partner?.assessment?.completion ?? null,
        outcome: partner?.assessment?.outcome ?? null,
      };
    })
    .sort(byPrefix);
};

const toFinding = (record, directory, candidate) => {
  const { assessment } = candidate;
  const quality = candidate.evidence.evidenceQuality;
  const supported = candidate.members
    .filter((member) => member.set === 'supported')
    .map((member) => ({ occurrence: copyTuple(member.file), path: member.path, semanticName: member.semanticName, roleCategory: member.roleCategory }))
    .sort((left, right) => left.occurrence.occurrenceAddress.localeCompare(right.occurrence.occurrenceAddress));
  return {
    code: TREE_EMERGENT_BOUNDARY_OPPORTUNITY_CODE,
    severity: 'info',
    path: directory.path,
    classification: CLASSIFICATION,
    message: MESSAGE,
    ruleRef: RULE_REF,
    details: {
      basis: BASIS,
      directory: { identity: copyTuple(directory.directory), path: directory.path },
      candidate: { discoveryMethod: candidate.discoveryMethod, prefix: [...candidate.prefix], leadingTokens: [...candidate.leadingTokens] },
      members: supported,
      evidence: {
        primaryUnitCount: assessment.evidence.primaryUnitCount,
        supportingMemberFileCount: assessment.evidence.supportingMemberFileCount,
        memberFileCount: candidate.members.length,
        directoryFileCount: quality.directoryFileCount,
        directoryMemberCount: quality.directoryMemberCount,
        unrecognizedFileCount: quality.nonMemberFileCount,
      },
      decidedBy: structuredClone(assessment.decidedBy),
      policy: {
        policyId: record.assessment.policy.policyId,
        policyVersion: record.assessment.policy.policyVersion,
        registry: { ...record.assessment.policyRegistry },
      },
      lexicalProfile: structuredClone(record.lexicalIdentity.lexicalProfile),
      relatedCandidates: relatedCandidatesOf(directory, candidate),
    },
  };
};

// One finding per eligible candidate; nothing when Stage 3 was not prepared or EL1/EL2 fails.
export const collectEmergentBoundaryOpportunityFindings = ({ preparedDependencies } = {}) => {
  const record = preparedDependencies?.treeEmergentBoundaryReasoning;
  if (!record) return [];
  return evaluateEmergentBoundaryEligibility(record).eligible.map(({ directory, candidate }) => toFinding(record, directory, candidate));
};
