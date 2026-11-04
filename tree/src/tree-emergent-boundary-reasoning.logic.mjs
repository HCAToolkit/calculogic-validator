// Tree Stage 3 emergent structural-boundary reasoning, evidence only (Tree slice spec S3.1-S3.10;
// calculogic-validator#136). Prepares `treeEmergentBoundaryReasoning`: prefix-based V0 discovery,
// candidate relations, member sets and dimension evidence for every directory and, under the run's
// adopted policy or an explicitly supplied experimental override (S3.8, S3.13.6), each candidate's
// assessment by the S3.6 resolution order. The record states which source decided (`policySource`). It reads the Stage 1 and Stage 2 records by reference and never changes them, never
// tokenizes or compares tokens with folder labels as strings (S3.1, S3.10): S3.2 positional lineage
// expression compares Naming's parsed label tokens with Naming's N1 tokens for exact equality, the S1.5
// operation at another position. Lexical-label expression (calculogic-validator#153) reads only the
// foundation relation between two accepted resolutions, through Tree's lexical-identity evidence module,
// and only when the run's lexical-identity section is available. Nothing reads its output: it emits no
// finding and no report field.

import { toCandidateKey } from './tree-folder-candidates.logic.mjs';
import { isTerminatingCandidate } from './tree-folder-semantic-evidence.logic.mjs';
import { governingChannelOf } from './tree-semantic-home-attribution.logic.mjs';
import {
  SEMANTIC_HOME_CHANNELS,
  SEMANTIC_HOME_OUTCOMES,
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
  EMERGENT_BOUNDARY_LEXICAL_UNITS,
  EMERGENT_BOUNDARY_LINEAGE_BASES,
  EMERGENT_BOUNDARY_MEMBER_EXPLANATIONS,
  EMERGENT_BOUNDARY_MEMBER_NOTES,
  EMERGENT_BOUNDARY_MEMBER_SETS,
  EMERGENT_BOUNDARY_OUTCOMES,
  EMERGENT_BOUNDARY_PARTIAL_EVIDENCE_POINT,
  EMERGENT_BOUNDARY_POLICY_SOURCES,
  EMERGENT_BOUNDARY_POLICY_STATUSES,
  EMERGENT_BOUNDARY_PREPARATION_REASONS,
  EMERGENT_BOUNDARY_PREPARATION_STATUSES,
  EMERGENT_BOUNDARY_REASONS,
  EMERGENT_BOUNDARY_RECOMMENDATION,
  EMERGENT_BOUNDARY_RELATIONS,
  EMERGENT_BOUNDARY_RESPONSIBILITY_CLASSES,
  EMERGENT_BOUNDARY_RULES,
  EMERGENT_BOUNDARY_SELECTION,
  EMERGENT_BOUNDARY_UNCERTAINTY_READINGS,
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

// `expectedStatus` is the status the policy's source requires (S3.13.6): `experimental` for a programmatic
// override, `adopted` for the registry policy. A policy is never accepted under the other status.
export const validateTreeEmergentBoundaryPolicy = (policy, { expectedStatus = EMERGENT_BOUNDARY_POLICY_STATUSES.experimental } = {}) => {
  const problems = [];
  if (policy === null || typeof policy !== 'object') return { valid: false, problems: ['policy-not-an-object'] };
  if (!isNonEmptyString(policy.policyId)) problems.push('policy-id');
  if (!isNonEmptyString(policy.policyVersion)) problems.push('policy-version');
  if (policy.policyStatus !== expectedStatus) problems.push('policy-status');
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

// S3.13.6 policy sources. `policy` is the programmatic experimental override; `adoptedPolicy` is the
// prepared adopted policy from the run's resolved Tree registry (`loadTreeEmergentBoundaryPolicy`). An
// override, when supplied, decides, and is never replaced by the adopted policy even when it is invalid.
// Without one, the adopted policy decides when it is available and valid. Nothing falls back to anything
// else: with neither source there is no outcome.
const selectAssessmentPolicy = ({ policy, adoptedPolicy }) => {
  const unavailable = (reason, extra = {}) => ({
    status: EMERGENT_BOUNDARY_ASSESSMENT_STATUSES.configurationUnavailable,
    reason,
    policy: null,
    ...extra,
  });
  if (policy !== undefined && policy !== null) {
    const check = validateTreeEmergentBoundaryPolicy(policy, { expectedStatus: EMERGENT_BOUNDARY_POLICY_STATUSES.experimental });
    return check.valid
      ? { status: EMERGENT_BOUNDARY_ASSESSMENT_STATUSES.evaluated, policySource: EMERGENT_BOUNDARY_POLICY_SOURCES.experimentalOverride, policy: copyPolicy(policy) }
      : unavailable(EMERGENT_BOUNDARY_ASSESSMENT_REASONS.experimentalPolicyInvalid, { problems: check.problems });
  }
  // A direct call that supplies no policy source at all keeps the reason it always reported.
  if (adoptedPolicy === undefined || adoptedPolicy === null) return unavailable(EMERGENT_BOUNDARY_ASSESSMENT_REASONS.experimentalPolicyAbsent);
  if (adoptedPolicy.availability !== 'available') return unavailable(EMERGENT_BOUNDARY_ASSESSMENT_REASONS.adoptedPolicyUnavailable);
  const check = validateTreeEmergentBoundaryPolicy(adoptedPolicy.policy, { expectedStatus: EMERGENT_BOUNDARY_POLICY_STATUSES.adopted });
  return check.valid
    ? {
        status: EMERGENT_BOUNDARY_ASSESSMENT_STATUSES.evaluated,
        policySource: EMERGENT_BOUNDARY_POLICY_SOURCES.adopted,
        policy: copyPolicy(adoptedPolicy.policy),
        policyRegistry: { ...adoptedPolicy.registry },
      }
    : unavailable(EMERGENT_BOUNDARY_ASSESSMENT_REASONS.adoptedPolicyInvalid, { problems: check.problems });
};

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

// S3.2 members of every directory, with their tokens, lineage-expressed prefix and its provenance. Accepted intake
// values are read only behind the Stage 1B-i fact gates.
const LINEAGE_BASES = EMERGENT_BOUNDARY_LINEAGE_BASES;
const LEXICAL_UNITS = EMERGENT_BOUNDARY_LEXICAL_UNITS;
const SAME_LEXEME = 'same-lexeme';
const DIFFERENT_LEXEMES = 'different-lexemes';
const UNDETERMINED = 'undetermined';
// `relate`: Tree's lexical relation (tree-lexical-identity-evidence), or `null` without an available
// section; `units` counts the S3.2 (member, lineage folder) units when it is given. `packageElements`:
// the accepted repository package elements (tree-repository-package-evidence), empty without any.
const collectDirectories = ({ factEvidence, semanticEvidence, sectionIntake, relate = null, units = null, packageElements = [] }) => {
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
    const lineage = [];
    const seen = new Set();
    let key = parentKeyOf(file);
    while (key && folderByKey.has(key) && !seen.has(key)) {
      seen.add(key);
      lineage.push(key);
      if (terminatingFolderKeys.has(key)) break;
      key = parentKeyOf(folderByKey.get(key));
    }
    return lineage;
  };

  // S3.2 Stage 1 basis: the end each lineage folder's Stage 1 comparison reaches at the first token (a
  // prefix match its label tokens, a root match the first token), the furthest per folder.
  const stageOneEndsOf = (file) => {
    const ends = new Map();
    for (const record of recordsByMember.get(toTupleKey(file.identityTuple)) ?? []) {
      const candidate = candidateByKey.get(toCandidateKey(record.candidateId));
      if (!candidate) continue;
      const folderKey = toTupleKey(candidate.folderIdentityTuple);
      const reached = [
        ...(record.channels.prefix?.result === 'match' ? [{ end: candidate.labelTokens.length, basis: LINEAGE_BASES.stageOnePrefix }] : []),
        ...(record.channels.root?.result === 'match' ? [{ end: 1, basis: LINEAGE_BASES.stageOneRoot }] : []),
      ];
      for (const entry of reached) {
        const current = ends.get(folderKey);
        if (!current || entry.end > current.end) ends.set(folderKey, entry);
      }
    }
    return ends;
  };

  // S3.2 positional lineage expression: walk the relevant lineage from its outermost folder, starting
  // at p = 0. Each folder moves p to the furthest of p, its Stage 1 end, and p plus its label length when
  // its parsed Naming label tokens equal the member's tokens at p in full (exact equality, nothing
  // transformed). A folder that does not extend p expresses nothing; each folder is visited once. The
  // steps are the provenance: which folder expressed which positions, on which basis. A tie keeps the
  // Stage 1 basis, the comparison that already established the relationship.
  //
  // Lexical-label expression (calculogic-validator#153): only with `relate`, and only for a folder whose
  // label is aligned at p, not exactly equal there, and would reach beyond its Stage 1 end. The non-exact
  // positions alone are compared; one unit per (member, lineage folder): all `same-lexeme` expresses on
  // `lexical-label`; any `different-lexemes` records nothing; otherwise any `undetermined` is an
  // undetermined unit; otherwise (`possibly-same-lexeme`) a possible unit and a note, never a step.
  //
  // Repository package expression (calculogic-validator#157, #159): the accepted package elements, scope
  // then name, are walked first, from p = 0. Each expresses only at the position reached, only when its
  // label tokens equal the member's tokens there in full and in order, and at most once; one that does
  // not continue is passed over. No lexical comparison is made for them, and the step names the element
  // and segment, never a folder or occurrence.
  const lineageExpressionOf = (file, tokens) => {
    const stageOneEnds = stageOneEndsOf(file);
    const steps = [];
    const possible = [];
    let position = 0;
    for (const { element, segment, labelTokens } of packageElements) {
      const end = position + labelTokens.length;
      if (end > tokens.length || labelTokens.some((token, offset) => tokens[position + offset] !== token)) continue;
      steps.push({ element, segment, basis: LINEAGE_BASES.repositoryPackage, positions: { start: position, end }, tokens: tokens.slice(position, end) });
      position = end;
    }
    for (const folderKey of relevantLineageOf(file).reverse()) {
      const folder = folderByKey.get(folderKey);
      const reached = [];
      const stageOne = stageOneEnds.get(folderKey);
      const stageOneEnd = stageOne ? Math.min(stageOne.end, tokens.length) : 0;
      if (stageOne) reached.push({ end: stageOneEnd, basis: stageOne.basis });
      const label = folder.facts?.folderLabel;
      if (label?.state === 'parsed' && Array.isArray(label.labelTokens) && label.labelTokens.length > 0) {
        const labelTokens = label.labelTokens;
        const end = position + labelTokens.length;
        if (end <= tokens.length) {
          const nonExact = labelTokens.map((token, offset) => offset).filter((offset) => tokens[position + offset] !== labelTokens[offset]);
          if (nonExact.length === 0) reached.push({ end, basis: LINEAGE_BASES.positionalLabel });
          else if (relate && end > Math.max(position, stageOneEnd)) {
            const relations = nonExact.map((offset) => ({
              position: position + offset,
              labelToken: labelTokens[offset],
              memberToken: tokens[position + offset],
              ...relate({ folder: folder.identityTuple, labelIndex: offset, member: file.identityTuple, memberIndex: position + offset }),
            }));
            const has = (relation) => relations.some((entry) => entry.relation === relation);
            const unit = relations.every((entry) => entry.relation === SAME_LEXEME)
              ? LEXICAL_UNITS.lexical
              : has(DIFFERENT_LEXEMES)
                ? null
                : has(UNDETERMINED)
                  ? LEXICAL_UNITS.undetermined
                  : LEXICAL_UNITS.possible;
            if (unit) units[unit] += 1;
            if (unit === LEXICAL_UNITS.lexical) reached.push({ end, basis: LINEAGE_BASES.lexicalLabel, relations });
            if (unit === LEXICAL_UNITS.possible) possible.push({ folder: { ...folder.identityTuple }, folderPath: folder.path, positions: { start: position, end }, relations });
          }
        }
      }
      // Ties keep the earlier basis: Stage 1, then `positional-label`, then `lexical-label`.
      const furthest = reached.reduce((best, entry) => (!best || entry.end > best.end ? entry : best), null);
      if (!furthest || furthest.end <= position) continue;
      steps.push({
        folder: { ...folder.identityTuple },
        folderPath: folder.path,
        basis: furthest.basis,
        positions: { start: position, end: furthest.end },
        tokens: tokens.slice(position, furthest.end),
        ...(furthest.relations ? { relations: furthest.relations } : {}),
      });
      position = furthest.end;
    }
    return { length: position, steps, possible };
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
    const expression = tokens ? lineageExpressionOf(entry, tokens) : { length: 0, steps: [], possible: [] };
    directory.members.push({
      key,
      file: { ...entry.identityTuple },
      path: entry.path,
      semanticName: isNonEmptyString(observation?.semanticName) ? observation.semanticName : null,
      roleCategory: entry.facts.roleFacts.state === 'available' && isNonEmptyString(enrichment?.roleCategory) ? enrichment.roleCategory : null,
      ambiguous: Array.isArray(observation?.ambiguityFlags) && observation.ambiguityFlags.length > 0,
      tokens,
      lineageExpressedLength: expression.length,
      lineageExpression: expression.steps,
      possibleLexicalExpression: expression.possible,
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

// S3.5 claim-relative uncertainty: one consulted candidate read by the claim its Stage 2 relation puts
// forward. `match` puts forward the candidate's governing claim and `possible-root-reading` its root
// reading's claim; a relation that compared nothing puts forward none. A corresponding claim is
// established correspondence for a `match` and possible correspondence otherwise.
const READINGS = EMERGENT_BOUNDARY_UNCERTAINTY_READINGS;
export const readConsultedCandidate = ({ relation, governingClaim, rootClaim, leading }) => {
  const claim =
    relation === SEMANTIC_HOME_PLACEMENT_RELATIONS.match ? governingClaim
      : relation === SEMANTIC_HOME_PLACEMENT_RELATIONS.possibleRootReading ? rootClaim
        : null;
  if (!claim) return { claim: null, reading: READINGS.missingComparison };
  const claimRelation = claimRelationOf(claim, leading);
  if (claimRelation === EMERGENT_BOUNDARY_CLAIM_RELATIONS.corresponds) {
    return { claim, reading: relation === SEMANTIC_HOME_PLACEMENT_RELATIONS.match ? READINGS.establishedCorrespondence : READINGS.possibleCorrespondence };
  }
  return { claim, reading: claimRelation === EMERGENT_BOUNDARY_CLAIM_RELATIONS.broader ? READINGS.broaderContext : READINGS.possibleOtherDestination };
};

// S3.5: one member's set and explanation relative to a grouping, from its Stage 2 placement.
const classifyMember = ({ member, prefix, placement, claimOf, rootClaimOf, outcomeOf, existing }) => {
  const leading = [...member.tokens.slice(0, member.lineageExpressedLength), ...prefix];
  const note = (set, explanation = null, notes = [], uncertainty = []) => ({ set, explanation, notes, uncertainty });

  if (!placement) return note(SETS.unresolved, { reason: EXPLANATIONS.placementUndetermined, placementReason: null });

  // Existing-structure evidence is collected from every placement, whatever its state, before the
  // member's set is decided. Eligible homes elsewhere: a corresponding one explains the grouping, a
  // broader one is recorded, a different one is another destination.
  const differentHomes = [];
  for (const candidateId of placement.elsewhereHomes ?? []) {
    const relation = claimRelationOf(claimOf(candidateId), leading);
    if (relation === EMERGENT_BOUNDARY_CLAIM_RELATIONS.corresponds) existing.correspondingSupportedHomes.push(candidateId);
    else if (relation === EMERGENT_BOUNDARY_CLAIM_RELATIONS.broader) existing.broaderSupportedHomes.push(candidateId);
    else differentHomes.push(candidateId);
  }
  // Every consulted candidate (undetermined, or reached through a `possible-*` relation), with its reading.
  const uncertainty = (placement.consultedCandidates ?? [])
    .map((consulted) => ({
      candidateId: copyCandidateId(consulted.candidateId),
      outcome: outcomeOf(consulted.candidateId),
      relation: consulted.relation,
      location: consulted.location,
      ...readConsultedCandidate({ relation: consulted.relation, governingClaim: claimOf(consulted.candidateId), rootClaim: rootClaimOf(consulted.candidateId), leading }),
    }))
    .sort((left, right) => toCandidateKey(left.candidateId).localeCompare(toCandidateKey(right.candidateId)));
  const withReading = (reading) => uncertainty.filter((entry) => entry.reading === reading).map((entry) => entry.candidateId);
  existing.correspondingUndeterminedCandidates.push(...withReading(READINGS.establishedCorrespondence));
  existing.possiblyCorrespondingCandidates.push(...withReading(READINGS.possibleCorrespondence));
  existing.relatedUndeterminedCandidates.push(
    ...uncertainty.filter((entry) => entry.outcome === SEMANTIC_HOME_OUTCOMES.undetermined && entry.reading !== READINGS.establishedCorrespondence && entry.reading !== READINGS.possibleCorrespondence).map((entry) => entry.candidateId),
  );

  // S3.5: inside a home on the lineage, with no home, or at a broader home elsewhere, the member is supported.
  if (placement.state === SEMANTIC_HOME_PLACEMENT_STATES.insideHome || placement.state === SEMANTIC_HOME_PLACEMENT_STATES.noHome) return note(SETS.supported, null, [], uncertainty);
  if (differentHomes.length > 0) {
    return note(
      SETS.conflicting,
      { reason: EXPLANATIONS.homeElsewhereDifferentClaim, homes: sortById(differentHomes).map((candidateId) => ({ candidateId, claim: claimOf(candidateId) })) },
      [],
      uncertainty,
    );
  }
  if (placement.state === SEMANTIC_HOME_PLACEMENT_STATES.homeElsewhere) return note(SETS.supported, null, [], uncertainty);
  // An undetermined placement: decided by the readings, except for a run-wide reason.
  if (placement.reason === SEMANTIC_HOME_PLACEMENT_REASONS.candidateDiscoveryIncomplete || uncertainty.length === 0) {
    return note(SETS.unresolved, { reason: EXPLANATIONS.placementUndetermined, placementReason: placement.reason ?? null }, [], uncertainty);
  }
  const corresponding = [...withReading(READINGS.establishedCorrespondence), ...withReading(READINGS.possibleCorrespondence)];
  if (corresponding.length > 0) return note(SETS.unresolved, { reason: EXPLANATIONS.correspondingCandidateUndetermined, candidateIds: sortById(corresponding) }, [], uncertainty);
  const destinations = withReading(READINGS.possibleOtherDestination);
  if (destinations.length > 0) return note(SETS.unresolved, { reason: EXPLANATIONS.possibleOtherDestination, candidateIds: destinations }, [], uncertainty);
  const missing = withReading(READINGS.missingComparison);
  if (missing.length > 0) return note(SETS.unresolved, { reason: EXPLANATIONS.comparisonMissing, candidateIds: missing }, [], uncertainty);
  // Every consulted candidate puts forward a broader claim: context only.
  return note(SETS.supported, null, [{ note: EMERGENT_BOUNDARY_MEMBER_NOTES.relatedFolderUndetermined, candidateIds: withReading(READINGS.broaderContext) }], uncertainty);
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

// S3.6 coverage: is the conclusion invariant under every admissible completion of `k` unrecognized
// files? Walks the resolution order from single responsibility up to the rule that decides on current
// evidence, applying each rule's invariance condition over the S3.6 bounds (primary units P..P+k,
// outside members O..O+k, member files n..n+k; any category; redundancy and whole-directory coverage
// can break but never be created). A rule whose policy decision is unresolved is incomplete in every
// completion alike, so it ends the walk. The bound is conservative: it can deny invariance where it
// holds, never assert it where it fails. It decides nothing itself: the rules decide the outcome.
export const evaluateCoverageInvariance = ({
  unrecognizedFileCount: k,
  primaryUnitCount: P,
  memberFileCount: n,
  outsideMemberFileCount: O,
  redundant,
  coversWholeDirectory,
  prefixLength,
  minimumPrimaryUnits,
  joiningFileCanLeaveClassUnresolved,
}) => {
  const variantRules = [];
  const decisionsInvolved = new Set();
  const point = EMERGENT_BOUNDARY_PARTIAL_EVIDENCE_POINT;
  const steps = [
    () => {
      if (P === null) return { stops: true };
      const varies = P < 2 || joiningFileCanLeaveClassUnresolved;
      if (varies && joiningFileCanLeaveClassUnresolved) decisionsInvolved.add(DECISIONS.responsibilityClassMapping);
      return { rule: RULES.singleResponsibility, varies, stops: P === 1 };
    },
    () => ({ rule: RULES.redundancy, varies: redundant, stops: redundant }),
    () => ({ rule: RULES.wholeDirectory, varies: coversWholeDirectory, stops: coversWholeDirectory }),
    () => ({ rule: RULES.specificity, varies: false, stops: prefixLength === 1 }),
    () => {
      if (minimumPrimaryUnits === null) return { stops: true };
      return { rule: RULES.minimumUnits, varies: !(P >= minimumPrimaryUnits || P + k < minimumPrimaryUnits), stops: P < minimumPrimaryUnits };
    },
    () => {
      // Every completion passes: the worst one, with every file joining unresolved, is within the point.
      const allPass = P >= point.supportedPrimaryUnits && (O + k) * 5 <= (n + k) * point.outsideFilesPerFive;
      // Every completion fails: only when some member is already outside, so the step applies to every
      // completion, and even the best one (every file a new supported unit) misses the point.
      const allFail = O > 0 && (P + k < point.supportedPrimaryUnits || O * 5 > (n + k) * point.outsideFilesPerFive);
      const varies = !(allPass || allFail);
      if (varies) decisionsInvolved.add(DECISIONS.partialEvidenceAggregation);
      return { rule: RULES.partialEvidence, varies, stops: true };
    },
  ];
  for (const step of steps) {
    const { rule, varies, stops } = step();
    if (varies) variantRules.push(rule);
    if (stops) break;
  }
  return { invariant: variantRules.length === 0, variantRules, decisionsInvolved: [...decisionsInvolved].sort() };
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
  // Established and possible correspondence to an undetermined candidate both block (S3.5).
  if (existing.correspondingUndeterminedCandidates.length > 0 || existing.possiblyCorrespondingCandidates.length > 0) {
    return decided(RULES.existingStructure, OUTCOMES.insufficientEvidence, [REASONS.correspondingHomeUnresolved]);
  }

  // 2. Coverage: with unrecognized files, only a conclusion invariant under every admissible completion
  // proceeds without the `coverage-share` decision (S3.6). Complete coverage needs neither.
  const quality = evidence.evidenceQuality;
  if (quality.nonMemberFileCount > 0) {
    const coverage = evaluateCoverageInvariance({
      unrecognizedFileCount: quality.nonMemberFileCount,
      primaryUnitCount,
      memberFileCount: candidate.members.length,
      outsideMemberFileCount: outside,
      redundant: Boolean(candidate.redundantWith),
      coversWholeDirectory: evidence.separation.coversWholeDirectory,
      prefixLength: candidate.prefix.length,
      minimumPrimaryUnits: unresolved(DECISIONS.minimumPrimaryUnits) ? null : valueOf(DECISIONS.minimumPrimaryUnits),
      // The mapping leaves documentation in a mixed grouping unresolved, and a joining file may carry any
      // category, including one outside the mapping, so a joining file can always leave a class unresolved.
      joiningFileCanLeaveClassUnresolved: true,
    });
    assessmentEvidence.coverage = { unrecognizedFileCount: quality.nonMemberFileCount, ...coverage };
  }
  if (quality.nonMemberFileCount > 0 && !assessmentEvidence.coverage.invariant) {
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

const distinctSequences = (sequences) =>
  [...new Map(sequences.map((sequence) => [sequence.join('\u0000'), sequence])).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, sequence]) => [...sequence]);

const toMemberRecord = (member, prefix, classified) => ({
  file: member.file,
  path: member.path,
  semanticName: member.semanticName,
  roleCategory: member.roleCategory,
  ambiguous: member.ambiguous,
  // S3.2 provenance: the lineage folders that expressed this member's leading positions, and the tokens
  // the member leads with for the grouping (lineage-expressed tokens, then the shared prefix).
  lineageExpression: member.lineageExpression,
  leadingTokens: [...member.tokens.slice(0, member.lineageExpressedLength), ...prefix],
  set: classified.set,
  ...(classified.explanation ? { explanation: classified.explanation } : {}),
  ...(classified.notes.length > 0 ? { notes: classified.notes } : {}),
  ...(classified.uncertainty.length > 0 ? { uncertainty: classified.uncertainty } : {}),
  // S3.2 (calculogic-validator#153): recorded uncertainty, never a step; present only when there is one.
  ...(member.possibleLexicalExpression.length > 0 ? { possibleLexicalExpression: member.possibleLexicalExpression } : {}),
});

// `lexicalRelation`: Tree's lexical relation (`createTreeLexicalRelation`), only for an available
// lexical-identity section, with `lexicalProfile` its provenance; omitted otherwise (S3.2, S3.7).
// `repositoryPackageElements`: the accepted package elements (`toTreeRepositoryPackageElements`); with
// none, the record is exactly as without this input (calculogic-validator#159).
export const prepareTreeEmergentBoundaryReasoning = ({
  factEvidence,
  semanticEvidence,
  sectionIntake,
  semanticHomeReasoning,
  policy,
  adoptedPolicy,
  lexicalRelation = null,
  lexicalProfile = null,
  repositoryPackageElements = [],
} = {}) => {
  const assessment = selectAssessmentPolicy({ policy, adoptedPolicy });
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
  const rootClaimOf = (candidateId) => [candidateByKey.get(toCandidateKey(candidateId)).lexicalRoot];
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
  const expressionUnits = lexicalRelation ? Object.fromEntries(Object.values(LEXICAL_UNITS).map((unit) => [unit, 0])) : null;
  for (const { folder, fileCount, members } of collectDirectories({ factEvidence, semanticEvidence, sectionIntake, relate: lexicalRelation, units: expressionUnits, packageElements: repositoryPackageElements })) {
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
        possiblyCorrespondingCandidates: [],
        broaderSupportedHomes: [],
        relatedUndeterminedCandidates: [],
      };
      const memberRecords = group.members
        .map((member) => {
          const classified = applyMemberEvidence(
            member,
            classifyMember({ member, prefix: group.prefix, placement: placementByKey.get(member.key), claimOf, rootClaimOf, outcomeOf, existing }),
          );
          return toMemberRecord(member, group.prefix, classified);
        })
        .sort((left, right) => left.file.occurrenceAddress.localeCompare(right.file.occurrenceAddress));
      const supported = memberRecords.filter((member) => member.set === SETS.supported);
      const existingStructure = Object.fromEntries(Object.entries(existing).map(([field, candidateIds]) => [field, sortById(candidateIds)]));
      return {
        directory: { ...folder.identityTuple },
        directoryPath: folder.path,
        prefix: [...group.prefix],
        // S3.2: the prefix is the evidence-derived identifier; the leading tokens it was derived from are
        // kept beside it, one entry per distinct sequence among the members (members of one directory
        // may have different lineage-expressed tokens). No identity-migration rule is applied.
        leadingTokens: distinctSequences(memberRecords.map((member) => member.leadingTokens)),
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
    // S3.7 (calculogic-validator#153): only with an available lexical-identity section.
    ...(expressionUnits ? { lexicalIdentity: { lexicalProfile: { ...lexicalProfile }, expressionUnits } } : {}),
  });
};
