// Tree Stage 3 emergent structural-boundary reasoning, evidence only (Tree slice spec S3.1-S3.10;
// calculogic-validator#136). Prepares `treeEmergentBoundaryReasoning`: prefix-based V0 discovery,
// candidate relations, member sets and dimension evidence for every directory and, only under an
// explicitly supplied experimental policy (S3.8), each candidate's assessment by the S3.6 resolution
// order. It reads the Stage 1 and Stage 2 records by reference and never changes them, never
// tokenizes or compares tokens with folder labels as strings (S3.1, S3.10), and nothing reads its
// output: it emits no finding and no report field.

import { toCandidateKey } from './tree-folder-candidates.logic.mjs';
import { isTerminatingCandidate } from './tree-folder-semantic-evidence.logic.mjs';
import { governingChannelOf } from './tree-semantic-home-attribution.logic.mjs';
import {
  SEMANTIC_HOME_CHANNELS,
  SEMANTIC_HOME_OUTCOMES,
  SEMANTIC_HOME_PLACEMENT_LOCATIONS,
  SEMANTIC_HOME_PLACEMENT_REASONS,
  SEMANTIC_HOME_PLACEMENT_RELATIONS,
  SEMANTIC_HOME_PLACEMENT_STATES,
  SEMANTIC_HOME_REASONING_STATUSES,
} from './tree-semantic-home-reasoning.knowledge.mjs';
import {
  EMERGENT_BOUNDARY_ASSESSMENT_REASONS,
  EMERGENT_BOUNDARY_ASSESSMENT_STATUSES,
  EMERGENT_BOUNDARY_CLAIM_RELATIONS,
  EMERGENT_BOUNDARY_COMPLETION,
  EMERGENT_BOUNDARY_DECISIONS,
  EMERGENT_BOUNDARY_DIMENSIONS,
  EMERGENT_BOUNDARY_DISCOVERY_LIMITS,
  EMERGENT_BOUNDARY_DISCOVERY_METHODS,
  EMERGENT_BOUNDARY_MEMBER_EXPLANATIONS,
  EMERGENT_BOUNDARY_MEMBER_NOTES,
  EMERGENT_BOUNDARY_MEMBER_SETS,
  EMERGENT_BOUNDARY_OUTCOMES,
  EMERGENT_BOUNDARY_PARTIAL_EVIDENCE_POINT,
  EMERGENT_BOUNDARY_POLICY_STATUSES,
  EMERGENT_BOUNDARY_PREPARATION_REASONS,
  EMERGENT_BOUNDARY_PREPARATION_STATUSES,
  EMERGENT_BOUNDARY_REASONS,
  EMERGENT_BOUNDARY_RECOMMENDATION,
  EMERGENT_BOUNDARY_RELATIONS,
  EMERGENT_BOUNDARY_RESPONSIBILITY_CLASSES,
  EMERGENT_BOUNDARY_RULES,
  EMERGENT_BOUNDARY_SELECTION,
} from './tree-emergent-boundary-reasoning.knowledge.mjs';

const SOURCE_ID = 'tree-emergent-boundary-reasoning';
const SETS = EMERGENT_BOUNDARY_MEMBER_SETS;
const EXPLANATIONS = EMERGENT_BOUNDARY_MEMBER_EXPLANATIONS;
const RULES = EMERGENT_BOUNDARY_RULES;
const OUTCOMES = EMERGENT_BOUNDARY_OUTCOMES;
const REASONS = EMERGENT_BOUNDARY_REASONS;
const DECISIONS = EMERGENT_BOUNDARY_DECISIONS;
const DECISION_IDS = Object.freeze(Object.values(EMERGENT_BOUNDARY_DECISIONS));
const DOCUMENTATION = 'documentation';
const DOCUMENTATION_RULE = 'primary-in-documentation-grouping';

const toTupleKey = ({ addressProfileId, addressedSnapshotId, occurrenceAddress }) =>
  `${addressProfileId}\u0000${addressedSnapshotId}\u0000${occurrenceAddress}`;

const copyCandidateId = ({ folderAddressPath, candidateSource, labelObservationRef }) => ({
  folderAddressPath,
  candidateSource,
  labelObservationRef: { ...labelObservationRef },
});

const deepFreeze = (value) => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const isStringList = (value) => Array.isArray(value) && value.every(isNonEmptyString);

// S3.8 policy shape. Each decision is `{ status: 'unresolved' }` or `{ status: 'resolved', value }`;
// a resolved value must be one this version can apply.
const RESOLVED_VALUE_CHECKS = Object.freeze({
  [EMERGENT_BOUNDARY_DECISIONS.minimumPrimaryUnits]: (value) => Number.isInteger(value) && value >= 1,
  [EMERGENT_BOUNDARY_DECISIONS.oneWordPrefix]: (value) => value === 'no-allowance',
  [EMERGENT_BOUNDARY_DECISIONS.responsibilityClassMapping]: (value) =>
    value !== null &&
    typeof value === 'object' &&
    isStringList(value.primary) &&
    isStringList(value.supporting) &&
    !value.primary.some((category) => category === DOCUMENTATION || value.supporting.includes(category)) &&
    !value.supporting.includes(DOCUMENTATION) &&
    value.documentation === DOCUMENTATION_RULE,
  [EMERGENT_BOUNDARY_DECISIONS.separationValueLimit]: (value) => value === 'whole-directory-only',
  [EMERGENT_BOUNDARY_DECISIONS.coverageShare]: (value) => typeof value === 'number' && value > 0 && value <= 1,
  // Beyond the S3.5 point, no aggregation limit or selection rule is defined yet: only `unresolved`.
  [EMERGENT_BOUNDARY_DECISIONS.partialEvidenceAggregation]: () => false,
  [EMERGENT_BOUNDARY_DECISIONS.opportunitySelection]: () => false,
});

export const validateTreeEmergentBoundaryPolicy = (policy) => {
  const problems = [];
  if (policy === null || typeof policy !== 'object') return { valid: false, problems: ['policy-not-an-object'] };
  if (!isNonEmptyString(policy.policyId)) problems.push('policy-id');
  if (!isNonEmptyString(policy.policyVersion)) problems.push('policy-version');
  if (policy.policyStatus !== EMERGENT_BOUNDARY_POLICY_STATUSES.experimental) problems.push('policy-status');
  const decisions = policy.decisions;
  if (decisions === null || typeof decisions !== 'object') {
    problems.push('decisions');
  } else {
    for (const key of Object.keys(decisions)) if (!DECISION_IDS.includes(key)) problems.push(`unknown-decision:${key}`);
    for (const id of DECISION_IDS) {
      const decision = decisions[id];
      if (!decision || (decision.status !== 'resolved' && decision.status !== 'unresolved')) problems.push(`decision:${id}`);
      else if (decision.status === 'resolved' && !RESOLVED_VALUE_CHECKS[id](decision.value)) problems.push(`decision-value:${id}`);
    }
  }
  return { valid: problems.length === 0, problems: problems.sort() };
};

const copyPolicy = (policy) => ({
  policyId: policy.policyId,
  policyVersion: policy.policyVersion,
  policyStatus: policy.policyStatus,
  decisions: Object.fromEntries(DECISION_IDS.map((id) => [id, structuredClone(policy.decisions[id])])),
});

// S3.5: an existing folder candidate's claim, as Naming tokens: its label tokens when the prefix
// channel governs, otherwise its lexical root.
const claimTokensOf = (candidate) =>
  governingChannelOf(candidate) === SEMANTIC_HOME_CHANNELS.prefix ? [...candidate.labelTokens] : [candidate.lexicalRoot];

const startsWith = (tokens, prefix) => prefix.length <= tokens.length && prefix.every((token, index) => tokens[index] === token);

// The claim is compared with the member's full leading sequence (lineage-expressed tokens plus the
// shared prefix), the sequence a Stage 2 `match` was decided on.
const claimRelationOf = (claimTokens, leading) => {
  if (claimTokens.length === leading.length && startsWith(leading, claimTokens)) return EMERGENT_BOUNDARY_CLAIM_RELATIONS.corresponds;
  if (claimTokens.length < leading.length && startsWith(leading, claimTokens)) return EMERGENT_BOUNDARY_CLAIM_RELATIONS.broader;
  return EMERGENT_BOUNDARY_CLAIM_RELATIONS.different;
};

const sortById = (candidateIds) =>
  [...new Map(candidateIds.map((candidateId) => [toCandidateKey(candidateId), candidateId])).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, candidateId]) => copyCandidateId(candidateId));

// S3.2 members of every directory, with their tokens and lineage-expressed prefix. Accepted intake
// values are read only behind the Stage 1B-i fact gates.
const collectDirectories = ({ factEvidence, semanticEvidence, sectionIntake }) => {
  const occurrenceFacts = factEvidence?.occurrenceFacts ?? [];
  const observationByKey = new Map((sectionIntake?.bridgeObservations?.acceptedRecords ?? []).map((record) => [toTupleKey(record), record.observation]));
  const enrichmentByKey = new Map((sectionIntake?.semanticEvidenceEnrichment?.acceptedRecords ?? []).map((record) => [toTupleKey(record), record]));
  const candidates = semanticEvidence?.candidates ?? [];
  const candidateByKey = new Map(candidates.map((candidate) => [toCandidateKey(candidate.candidateId), candidate]));
  const terminatingFolderKeys = new Set(candidates.filter(isTerminatingCandidate).map((candidate) => toTupleKey(candidate.folderIdentityTuple)));
  const recordsByMember = new Map();
  for (const record of semanticEvidence?.memberRelationships ?? []) {
    const key = toTupleKey(record.member);
    recordsByMember.set(key, [...(recordsByMember.get(key) ?? []), record]);
  }
  const folderByKey = new Map(occurrenceFacts.filter((entry) => entry.occurrenceType === 'folder').map((entry) => [toTupleKey(entry.identityTuple), entry]));
  const parentKeyOf = (entry) =>
    entry.parentOccurrenceAddress ? toTupleKey({ ...entry.identityTuple, occurrenceAddress: entry.parentOccurrenceAddress }) : null;

  // S2.8 P6, P7: the relevant lineage, from the parent upward through the first terminating folder.
  const relevantLineageOf = (file) => {
    const lineage = new Set();
    let key = parentKeyOf(file);
    while (key && folderByKey.has(key) && !lineage.has(key)) {
      lineage.add(key);
      if (terminatingFolderKeys.has(key)) break;
      key = parentKeyOf(folderByKey.get(key));
    }
    return lineage;
  };

  // S3.2: the leading tokens an ancestor on the relevant lineage expresses, by the Stage 1 comparison:
  // a prefix match expresses the candidate's label tokens, a root match the first token.
  const lineageExpressedLengthOf = (file) => {
    const lineage = relevantLineageOf(file);
    let length = 0;
    for (const record of recordsByMember.get(toTupleKey(file.identityTuple)) ?? []) {
      const candidate = candidateByKey.get(toCandidateKey(record.candidateId));
      if (!candidate || !lineage.has(toTupleKey(candidate.folderIdentityTuple))) continue;
      if (record.channels.prefix?.result === 'match') length = Math.max(length, candidate.labelTokens.length);
      if (record.channels.root?.result === 'match') length = Math.max(length, 1);
    }
    return length;
  };

  const directories = new Map();
  for (const entry of occurrenceFacts) {
    if (entry.occurrenceType !== 'file') continue;
    const parentKey = parentKeyOf(entry);
    const folder = parentKey ? folderByKey.get(parentKey) : null;
    if (!folder) continue;
    const directory = directories.get(parentKey) ?? { folder, fileCount: 0, members: [] };
    directories.set(parentKey, directory);
    directory.fileCount += 1;
    if (entry.facts.semanticIdentity.state !== 'semantic-observation') continue;
    const key = toTupleKey(entry.identityTuple);
    const observation = observationByKey.get(key);
    const enrichment = enrichmentByKey.get(key);
    const tokens = entry.facts.tokens.state === 'available' && Array.isArray(enrichment?.semanticTokens) ? [...enrichment.semanticTokens] : null;
    directory.members.push({
      key,
      file: { ...entry.identityTuple },
      path: entry.path,
      semanticName: isNonEmptyString(observation?.semanticName) ? observation.semanticName : null,
      roleCategory: entry.facts.roleFacts.state === 'available' && isNonEmptyString(enrichment?.roleCategory) ? enrichment.roleCategory : null,
      ambiguous: Array.isArray(observation?.ambiguityFlags) && observation.ambiguityFlags.length > 0,
      tokens,
      lineageExpressedLength: tokens ? Math.min(lineageExpressedLengthOf(entry), tokens.length) : 0,
    });
  }
  return [...directories.values()].sort((left, right) => left.folder.identityTuple.occurrenceAddress.localeCompare(right.folder.identityTuple.occurrenceAddress));
};

// S3.3: one candidate per shared residual prefix, at every specificity, carried by at least two member files.
const discoverCandidates = (members) => {
  const groups = new Map();
  for (const member of members) {
    if (!member.tokens) continue;
    const residual = member.tokens.slice(member.lineageExpressedLength);
    for (let length = 1; length <= residual.length; length += 1) {
      const prefix = residual.slice(0, length);
      const key = prefix.join('\u0000');
      const group = groups.get(key) ?? { prefix, members: [] };
      groups.set(key, group);
      group.members.push(member);
    }
  }
  return [...groups.entries()]
    .filter(([, group]) => group.members.length >= 2)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, group]) => group);
};

// S3.4: exactly one relation per pair.
const relationOf = (left, right) => {
  const leftKeys = new Set(left.members.map((member) => member.key));
  const shared = right.members.filter((member) => leftKeys.has(member.key)).length;
  if (shared === 0) return { relation: EMERGENT_BOUNDARY_RELATIONS.disjoint };
  if (shared === left.members.length && shared === right.members.length) return { relation: EMERGENT_BOUNDARY_RELATIONS.redundant };
  const leftExtends = startsWith(left.prefix, right.prefix) && left.prefix.length > right.prefix.length;
  const rightExtends = startsWith(right.prefix, left.prefix) && right.prefix.length > left.prefix.length;
  if (leftExtends && shared === left.members.length) return { relation: EMERGENT_BOUNDARY_RELATIONS.nestedSubgroup, subgroup: 'left' };
  if (rightExtends && shared === right.members.length) return { relation: EMERGENT_BOUNDARY_RELATIONS.nestedSubgroup, subgroup: 'right' };
  return { relation: EMERGENT_BOUNDARY_RELATIONS.competing };
};

// S3.5: one member's set and explanation relative to a grouping, from its Stage 2 placement.
const classifyMember = ({ member, prefix, placement, claimOf, outcomeOf, existing }) => {
  const leading = [...member.tokens.slice(0, member.lineageExpressedLength), ...prefix];
  const note = (set, explanation = null, notes = []) => ({ set, explanation, notes });

  if (!placement) return note(SETS.unresolved, { reason: EXPLANATIONS.placementUndetermined, placementReason: null });
  if (placement.state === SEMANTIC_HOME_PLACEMENT_STATES.insideHome) return note(SETS.supported);
  if (placement.state === SEMANTIC_HOME_PLACEMENT_STATES.noHome) return note(SETS.supported);

  // Eligible homes elsewhere: a corresponding one explains the grouping, a broader one is recorded,
  // a different one is another destination.
  const differentHomes = [];
  for (const candidateId of placement.elsewhereHomes ?? []) {
    const relation = claimRelationOf(claimOf(candidateId), leading);
    if (relation === EMERGENT_BOUNDARY_CLAIM_RELATIONS.corresponds) existing.correspondingSupportedHomes.push(candidateId);
    else if (relation === EMERGENT_BOUNDARY_CLAIM_RELATIONS.broader) existing.broaderSupportedHomes.push(candidateId);
    else differentHomes.push(candidateId);
  }
  // Undetermined candidates consulted: a corresponding `match` blocks the grouping wherever it is.
  const undeterminedElsewhere = [];
  const undeterminedOnLineage = [];
  for (const consulted of placement.consultedCandidates ?? []) {
    if (outcomeOf(consulted.candidateId) !== SEMANTIC_HOME_OUTCOMES.undetermined) continue;
    const relation = claimRelationOf(claimOf(consulted.candidateId), leading);
    if (consulted.relation === SEMANTIC_HOME_PLACEMENT_RELATIONS.match && relation === EMERGENT_BOUNDARY_CLAIM_RELATIONS.corresponds) {
      existing.correspondingUndeterminedCandidates.push(consulted.candidateId);
    } else {
      existing.relatedUndeterminedCandidates.push(consulted.candidateId);
    }
    (consulted.location === SEMANTIC_HOME_PLACEMENT_LOCATIONS.lineage ? undeterminedOnLineage : undeterminedElsewhere).push(consulted.candidateId);
  }

  if (differentHomes.length > 0) {
    return note(SETS.conflicting, {
      reason: EXPLANATIONS.homeElsewhereDifferentClaim,
      homes: sortById(differentHomes).map((candidateId) => ({ candidateId, claim: claimOf(candidateId) })),
    });
  }
  if (placement.state === SEMANTIC_HOME_PLACEMENT_STATES.homeElsewhere) return note(SETS.supported);
  // S3.5 undetermined ancestors: an undetermined lineage candidate alone leaves the member supported,
  // with the uncertainty kept; an undetermined candidate elsewhere still leaves it unresolved.
  if (placement.reason === SEMANTIC_HOME_PLACEMENT_REASONS.homeOnLineageUndetermined) {
    if (undeterminedElsewhere.length > 0) {
      return note(SETS.unresolved, { reason: EXPLANATIONS.undeterminedCandidateElsewhere, candidateIds: sortById(undeterminedElsewhere) });
    }
    return note(SETS.supported, null, [{ note: EMERGENT_BOUNDARY_MEMBER_NOTES.relatedFolderUndetermined, candidateIds: sortById(undeterminedOnLineage) }]);
  }
  return note(SETS.unresolved, { reason: EXPLANATIONS.placementUndetermined, placementReason: placement.reason ?? null });
};

// Missing role or identity evidence leaves an otherwise supported member unresolved (S3.5, S3.10).
const applyMemberEvidence = (member, classified) => {
  if (classified.set !== SETS.supported) return classified;
  if (!member.semanticName) return { ...classified, set: SETS.unresolved, explanation: { reason: EXPLANATIONS.semanticNameAbsent } };
  if (!member.roleCategory) return { ...classified, set: SETS.unresolved, explanation: { reason: EXPLANATIONS.roleCategoryAbsent } };
  return classified;
};

// S3.5 responsibility classes under the policy's mapping; `null` when the mapping leaves it unresolved.
const classOf = (mapping, roleCategory, allDocumentation) => {
  if (mapping.primary.includes(roleCategory)) return EMERGENT_BOUNDARY_RESPONSIBILITY_CLASSES.primary;
  if (mapping.supporting.includes(roleCategory)) return EMERGENT_BOUNDARY_RESPONSIBILITY_CLASSES.supporting;
  if (roleCategory === DOCUMENTATION && allDocumentation) return EMERGENT_BOUNDARY_RESPONSIBILITY_CLASSES.primary;
  return null;
};

// S3.6 outcome resolution over the prepared evidence, under one policy.
const assessCandidate = ({ candidate, policy }) => {
  const { evidence } = candidate;
  const decisionOf = (id) => policy.decisions[id];
  const unresolved = (id) => decisionOf(id).status === 'unresolved';
  const valueOf = (id) => decisionOf(id).value;
  const policyRef = { policyId: policy.policyId, policyVersion: policy.policyVersion };
  const assessmentEvidence = {};
  const finish = (fields) => ({
    ...fields,
    evidence: assessmentEvidence,
    recommendation: { ...EMERGENT_BOUNDARY_RECOMMENDATION },
  });
  const decided = (rule, outcome, reasons, extra = {}, decision = null) =>
    finish({
      completion: EMERGENT_BOUNDARY_COMPLETION.complete,
      outcome,
      reasons,
      ...extra,
      unresolvedDecisions: [],
      decidedBy: { rule, ...policyRef, ...(decision ? { decision, value: structuredClone(valueOf(decision)) } : {}) },
    });
  const incomplete = (rule, decisions) =>
    finish({ completion: EMERGENT_BOUNDARY_COMPLETION.incomplete, outcome: null, reasons: [], unresolvedDecisions: decisions, blockedAt: { rule, ...policyRef } });

  // Evidence evaluation (S3.6): every policy-dependent dimension is computed before resolution, so a
  // rule that decides early never hides the rest.
  const supported = candidate.members.filter((member) => member.set === SETS.supported);
  const outside = candidate.members.length - supported.length;
  let primaryUnitCount = null;
  if (!unresolved(DECISIONS.responsibilityClassMapping)) {
    const mapping = valueOf(DECISIONS.responsibilityClassMapping);
    const allDocumentation = supported.length > 0 && supported.every((member) => member.roleCategory === DOCUMENTATION);
    const classes = supported.map((member) => classOf(mapping, member.roleCategory, allDocumentation));
    if (!classes.includes(null)) {
      primaryUnitCount = new Set(supported.filter((_, index) => classes[index] === EMERGENT_BOUNDARY_RESPONSIBILITY_CLASSES.primary).map((member) => member.semanticName)).size;
      assessmentEvidence.primaryUnitCount = primaryUnitCount;
      assessmentEvidence.supportingMemberFileCount = classes.filter((value) => value === EMERGENT_BOUNDARY_RESPONSIBILITY_CLASSES.supporting).length;
    }
  }
  if (primaryUnitCount === null) assessmentEvidence.responsibilityClasses = { unresolvedDecision: DECISIONS.responsibilityClassMapping };
  let withinPoint = null;
  if (outside > 0) {
    const point = EMERGENT_BOUNDARY_PARTIAL_EVIDENCE_POINT;
    withinPoint = primaryUnitCount !== null && primaryUnitCount >= point.supportedPrimaryUnits && outside * 5 <= candidate.members.length * point.outsideFilesPerFive;
    assessmentEvidence.partialEvidence = { outsideMemberFileCount: outside, withinCataloguePoint: withinPoint };
  }

  // Outcome resolution, in the S3.6 order.
  // 1. Existing structure, in the S3.5 table's row order.
  const existing = candidate.existingStructure;
  if (existing.directoryHomes.length > 0) return decided(RULES.existingStructure, OUTCOMES.insufficientEvidence, [REASONS.internalBoundaryDeferred]);
  if (existing.correspondingSupportedHomes.length > 0) {
    return decided(RULES.existingStructure, OUTCOMES.explainedByExistingStructure, [], { home: copyCandidateId(existing.correspondingSupportedHomes[0]) });
  }
  if (existing.correspondingUndeterminedCandidates.length > 0) return decided(RULES.existingStructure, OUTCOMES.insufficientEvidence, [REASONS.correspondingHomeUnresolved]);

  // 2. Coverage: complete coverage passes any share.
  const quality = evidence.evidenceQuality;
  if (quality.nonMemberFileCount > 0) {
    if (unresolved(DECISIONS.coverageShare)) return incomplete(RULES.coverage, [DECISIONS.coverageShare]);
    if (quality.directoryMemberCount / quality.directoryFileCount < valueOf(DECISIONS.coverageShare)) {
      return decided(RULES.coverage, OUTCOMES.insufficientEvidence, [REASONS.lowCoverage], {}, DECISIONS.coverageShare);
    }
  }

  // 3. Single responsibility, under the responsibility-class mapping.
  if (primaryUnitCount === null) return incomplete(RULES.singleResponsibility, [DECISIONS.responsibilityClassMapping]);
  if (primaryUnitCount === 1) return decided(RULES.singleResponsibility, OUTCOMES.notAnOpportunity, [REASONS.singleResponsibilityUnit], {}, DECISIONS.responsibilityClassMapping);

  // 4. Redundancy: the less specific candidate of a redundant pair.
  if (candidate.redundantWith) return decided(RULES.redundancy, OUTCOMES.notAnOpportunity, [REASONS.redundantWith], { redundantWith: { prefix: [...candidate.redundantWith] } });

  // 5. Whole directory, measured on the supported set.
  if (evidence.separation.coversWholeDirectory) return decided(RULES.wholeDirectory, OUTCOMES.insufficientEvidence, [REASONS.wholeDirectoryValueUndetermined]);

  // 6. Specificity.
  if (candidate.prefix.length === 1) {
    if (unresolved(DECISIONS.oneWordPrefix)) return incomplete(RULES.specificity, [DECISIONS.oneWordPrefix]);
    return decided(RULES.specificity, OUTCOMES.insufficientEvidence, [REASONS.lowSpecificity], {}, DECISIONS.oneWordPrefix);
  }

  // 7. Minimum primary units.
  if (unresolved(DECISIONS.minimumPrimaryUnits)) return incomplete(RULES.minimumUnits, [DECISIONS.minimumPrimaryUnits]);
  if (primaryUnitCount < valueOf(DECISIONS.minimumPrimaryUnits)) {
    return decided(RULES.minimumUnits, OUTCOMES.insufficientEvidence, [REASONS.belowMinimumUnits], {}, DECISIONS.minimumPrimaryUnits);
  }

  // 8. Partial evidence: only the S3.5 point lets members outside the supported set through.
  if (outside > 0 && !withinPoint) return incomplete(RULES.partialEvidence, [DECISIONS.partialEvidenceAggregation]);

  // 9. Opportunity: every dimension holds, separation by the policy's limit.
  if (unresolved(DECISIONS.separationValueLimit)) return incomplete(RULES.opportunity, [DECISIONS.separationValueLimit]);
  return decided(RULES.opportunity, OUTCOMES.opportunity, Object.values(EMERGENT_BOUNDARY_DIMENSIONS), {}, DECISIONS.separationValueLimit);
};

const toMemberRecord = (member, classified) => ({
  file: member.file,
  path: member.path,
  semanticName: member.semanticName,
  roleCategory: member.roleCategory,
  ambiguous: member.ambiguous,
  set: classified.set,
  ...(classified.explanation ? { explanation: classified.explanation } : {}),
  ...(classified.notes.length > 0 ? { notes: classified.notes } : {}),
});

export const prepareTreeEmergentBoundaryReasoning = ({ factEvidence, semanticEvidence, sectionIntake, semanticHomeReasoning, policy } = {}) => {
  const policyCheck = policy === undefined || policy === null ? null : validateTreeEmergentBoundaryPolicy(policy);
  const assessment =
    policyCheck === null
      ? { status: EMERGENT_BOUNDARY_ASSESSMENT_STATUSES.configurationUnavailable, reason: EMERGENT_BOUNDARY_ASSESSMENT_REASONS.experimentalPolicyAbsent, policy: null }
      : policyCheck.valid
        ? { status: EMERGENT_BOUNDARY_ASSESSMENT_STATUSES.evaluated, policy: copyPolicy(policy) }
        : {
            status: EMERGENT_BOUNDARY_ASSESSMENT_STATUSES.configurationUnavailable,
            reason: EMERGENT_BOUNDARY_ASSESSMENT_REASONS.experimentalPolicyInvalid,
            policy: null,
            problems: policyCheck.problems,
          };
  const base = {
    source: SOURCE_ID,
    evidenceOnly: true,
    discoveryMethod: EMERGENT_BOUNDARY_DISCOVERY_METHODS.prefixV0,
    discoveryLimits: Object.values(EMERGENT_BOUNDARY_DISCOVERY_LIMITS),
    assessment,
  };

  // Member sets need Stage 2 placements; without them nothing is prepared (S3.1).
  if (semanticHomeReasoning?.status !== SEMANTIC_HOME_REASONING_STATUSES.evaluated) {
    return deepFreeze({
      ...base,
      preparation: { status: EMERGENT_BOUNDARY_PREPARATION_STATUSES.notPrepared, reason: EMERGENT_BOUNDARY_PREPARATION_REASONS.semanticHomeReasoningNotEvaluated },
    });
  }

  const candidateByKey = new Map((semanticEvidence?.candidates ?? []).map((candidate) => [toCandidateKey(candidate.candidateId), candidate]));
  const claimOf = (candidateId) => claimTokensOf(candidateByKey.get(toCandidateKey(candidateId)));
  const outcomeByKey = new Map(semanticHomeReasoning.candidateOutcomes.map((outcome) => [toCandidateKey(outcome.candidateId), outcome.outcome]));
  const outcomeOf = (candidateId) => outcomeByKey.get(toCandidateKey(candidateId));
  const placementByKey = new Map(semanticHomeReasoning.placements.map((placement) => [toTupleKey(placement.file), placement]));
  const eligibleIdsByFolderKey = new Map();
  for (const candidate of semanticEvidence?.candidates ?? []) {
    if (outcomeOf(candidate.candidateId) !== SEMANTIC_HOME_OUTCOMES.eligible) continue;
    const key = toTupleKey(candidate.folderIdentityTuple);
    eligibleIdsByFolderKey.set(key, [...(eligibleIdsByFolderKey.get(key) ?? []), candidate.candidateId]);
  }

  const limitations = { filesWithoutEvaluatedIdentity: 0, membersWithoutTokenSequence: 0, membersWithoutRoleCategory: 0 };
  const directories = [];
  for (const { folder, fileCount, members } of collectDirectories({ factEvidence, semanticEvidence, sectionIntake })) {
    limitations.filesWithoutEvaluatedIdentity += fileCount - members.length;
    limitations.membersWithoutTokenSequence += members.filter((member) => !member.tokens).length;
    limitations.membersWithoutRoleCategory += members.filter((member) => !member.roleCategory).length;
    const groups = discoverCandidates(members);
    if (groups.length === 0) continue;

    const relations = [];
    const redundantWith = new Map();
    for (let left = 0; left < groups.length; left += 1) {
      for (let right = left + 1; right < groups.length; right += 1) {
        const { relation, subgroup } = relationOf(groups[left], groups[right]);
        const [first, second] = [groups[left], groups[right]];
        relations.push({
          candidates: [{ prefix: [...first.prefix] }, { prefix: [...second.prefix] }],
          relation,
          ...(subgroup ? { subgroup: { prefix: [...(subgroup === 'left' ? first : second).prefix] } } : {}),
        });
        if (relation === EMERGENT_BOUNDARY_RELATIONS.redundant) {
          // The less specific candidate is redundant with the most specific one carrying the same members.
          const [less, more] = first.prefix.length < second.prefix.length ? [first, second] : [second, first];
          const current = redundantWith.get(less);
          if (!current || more.prefix.length > current.prefix.length) redundantWith.set(less, more);
        }
      }
    }

    const folderKey = toTupleKey(folder.identityTuple);
    const directoryMemberCount = members.length;
    const candidates = groups.map((group) => {
      const existing = {
        directoryHomes: eligibleIdsByFolderKey.get(folderKey) ?? [],
        correspondingSupportedHomes: [],
        correspondingUndeterminedCandidates: [],
        broaderSupportedHomes: [],
        relatedUndeterminedCandidates: [],
      };
      const memberRecords = group.members
        .map((member) => {
          const classified = applyMemberEvidence(
            member,
            classifyMember({ member, prefix: group.prefix, placement: placementByKey.get(member.key), claimOf, outcomeOf, existing }),
          );
          return toMemberRecord(member, classified);
        })
        .sort((left, right) => left.file.occurrenceAddress.localeCompare(right.file.occurrenceAddress));
      const supported = memberRecords.filter((member) => member.set === SETS.supported);
      const existingStructure = Object.fromEntries(Object.entries(existing).map(([field, candidateIds]) => [field, sortById(candidateIds)]));
      return {
        directory: { ...folder.identityTuple },
        directoryPath: folder.path,
        prefix: [...group.prefix],
        discoveryMethod: EMERGENT_BOUNDARY_DISCOVERY_METHODS.prefixV0,
        members: memberRecords,
        memberSets: Object.fromEntries(
          Object.values(SETS).map((set) => [set, memberRecords.filter((member) => member.set === set).map((member) => member.file.occurrenceAddress)]),
        ),
        existingStructure,
        ...(redundantWith.has(group) ? { redundantWith: [...redundantWith.get(group).prefix] } : {}),
        // S3.5 dimension evidence, on the supported members only; class-dependent counts need a policy.
        evidence: {
          concentration: {
            memberFileCount: memberRecords.length,
            supportedMemberFileCount: supported.length,
            supportedUnitCount: new Set(supported.map((member) => member.semanticName)).size,
          },
          lexicalSpecificity: { prefixLength: group.prefix.length },
          separation: { supportedMemberFileCount: supported.length, directoryMemberCount, coversWholeDirectory: supported.length === directoryMemberCount },
          evidenceQuality: {
            directoryFileCount: fileCount,
            directoryMemberCount,
            nonMemberFileCount: fileCount - directoryMemberCount,
            ambiguousMemberFileCount: memberRecords.filter((member) => member.ambiguous).length,
          },
        },
      };
    });

    if (assessment.status === EMERGENT_BOUNDARY_ASSESSMENT_STATUSES.evaluated) {
      for (const candidate of candidates) candidate.assessment = assessCandidate({ candidate, policy: assessment.policy });
      // S3.6 selection: related opportunities are all kept; no selection rule is defined yet.
      const isOpportunity = (candidate) => candidate.assessment.outcome === OUTCOMES.opportunity;
      const keyOf = (prefix) => prefix.join('\u0000');
      const byKey = new Map(candidates.map((candidate) => [keyOf(candidate.prefix), candidate]));
      for (const candidate of candidates.filter(isOpportunity)) {
        const related = relations
          .filter((entry) => entry.relation !== EMERGENT_BOUNDARY_RELATIONS.disjoint && entry.candidates.some((ref) => keyOf(ref.prefix) === keyOf(candidate.prefix)))
          .map((entry) => entry.candidates.find((ref) => keyOf(ref.prefix) !== keyOf(candidate.prefix)))
          .filter((ref) => isOpportunity(byKey.get(keyOf(ref.prefix))));
        candidate.assessment.selection =
          related.length === 0
            ? { status: EMERGENT_BOUNDARY_SELECTION.notNeeded }
            : { status: EMERGENT_BOUNDARY_SELECTION.unresolved, decision: DECISIONS.opportunitySelection, relatedOpportunities: related };
      }
    }

    directories.push({
      directory: { ...folder.identityTuple },
      path: folder.path,
      fileCount,
      memberCount: directoryMemberCount,
      candidates,
      relations,
    });
  }

  return deepFreeze({
    ...base,
    preparation: { status: EMERGENT_BOUNDARY_PREPARATION_STATUSES.prepared },
    directories,
    limitations,
  });
};
