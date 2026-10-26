// Tree Stage 2 Semantic Home attribution (Tree slice spec S2.3, S2.6; calculogic-validator#102 Q2).
// Reads the Stage 1 member relationship records only: every comparison it needs, including a member's
// comparison for a nested candidate, is already recorded there (the member is in that candidate's
// subtree). It never recomputes a comparison and never reads Naming material.

import { TREE_FOLDER_CANDIDATE_SOURCES, toCandidateKey } from './tree-folder-candidates.logic.mjs';
import {
  SEMANTIC_HOME_ATTRIBUTIONS,
  SEMANTIC_HOME_ATTRIBUTION_REASONS,
  SEMANTIC_HOME_CHANNELS,
  SEMANTIC_HOME_OUTCOMES,
  SEMANTIC_HOME_REASONS,
} from './tree-semantic-home-reasoning.knowledge.mjs';

const toTupleKey = ({ addressProfileId, addressedSnapshotId, occurrenceAddress }) =>
  `${addressProfileId}\u0000${addressedSnapshotId}\u0000${occurrenceAddress}`;

export const toMemberRecordKey = (candidateId, member) => `${toCandidateKey(candidateId)}\u0001${toTupleKey(member)}`;

// S2.3: a multi-token label is tested on the prefix channel; every other candidate on the root channel.
export const isMultiTokenLabel = (candidate) =>
  candidate.candidateId.candidateSource === TREE_FOLDER_CANDIDATE_SOURCES.FOLDER_LABEL && candidate.labelTokens.length >= 2;
export const governingChannelOf = (candidate) =>
  isMultiTokenLabel(candidate) ? SEMANTIC_HOME_CHANNELS.prefix : SEMANTIC_HOME_CHANNELS.root;

// S2.6 order: deeper folders first, so every nested candidate is decided before its ancestors. Depth
// is the folder's ancestor count in the Stage 1B-i record; the walk visits each folder once (E4).
export const orderCandidatesDeepestFirst = (candidates, factEvidence) => {
  const parentByKey = new Map(
    (factEvidence?.occurrenceFacts ?? [])
      .filter((entry) => entry.occurrenceType === 'folder')
      .map((entry) => [
        toTupleKey(entry.identityTuple),
        entry.parentOccurrenceAddress ? toTupleKey({ ...entry.identityTuple, occurrenceAddress: entry.parentOccurrenceAddress }) : null,
      ]),
  );
  const depthOf = (candidate) => {
    const visited = new Set([toTupleKey(candidate.folderIdentityTuple)]);
    let depth = 0;
    let key = parentByKey.get(toTupleKey(candidate.folderIdentityTuple));
    while (key && !visited.has(key)) {
      visited.add(key);
      depth += 1;
      key = parentByKey.get(key);
    }
    return depth;
  };
  return candidates
    .map((candidate) => ({ candidate, depth: depthOf(candidate), key: toCandidateKey(candidate.candidateId) }))
    .sort((left, right) => right.depth - left.depth || left.key.localeCompare(right.key))
    .map(({ candidate }) => candidate);
};

const KIND_BY_RESULT = Object.freeze({ match: 'support', foreign: 'contradiction', 'not-evaluated': 'missing' });
export const kindOf = (comparison) => {
  const kind = KIND_BY_RESULT[comparison?.result];
  if (!kind) throw new Error(`A decision member has no evaluable comparison (${JSON.stringify(comparison?.result)}).`);
  return kind;
};

// S2.6 steps 1-3 for one active member m of C. `outcomeOf` returns a decided nested candidate's
// outcome; `memberRecordOf` returns a Stage 1 member record.
const attributeMember = ({ memberRecord, outcomeOf, memberRecordOf, candidateByKey }) => {
  // Nested candidates at m's boundaries, deepest boundary first (Stage 1 lists them from F downward).
  const nested = [];
  const seen = new Set();
  memberRecord.provisionalRedirectBoundaries.forEach((boundary, depth) => {
    for (const candidateId of boundary.candidateIds) {
      const key = toCandidateKey(candidateId);
      if (seen.has(key)) continue;
      seen.add(key);
      nested.push({ candidateId, key, depth });
    }
  });
  nested.sort((left, right) => right.depth - left.depth || left.key.localeCompare(right.key));

  const assessed = nested.map(({ candidateId, key }) => {
    const nestedCandidate = candidateByKey.get(key);
    const decided = outcomeOf(key);
    if (!nestedCandidate || !decided) throw new Error(`Nested candidate ${key} was not decided before its ancestor.`);
    const record = memberRecordOf(candidateId, memberRecord.member);
    if (!record) throw new Error(`No Stage 1 member record for ${key} and ${memberRecord.member.occurrenceAddress}.`);
    const governingMatch = record.channels[governingChannelOf(nestedCandidate)].result === 'match';
    // Q2: a claim-unresolved candidate's admissible root reading may claim m; missing evidence never does.
    const rootReadingMatch =
      decided.reason === SEMANTIC_HOME_REASONS.claimUnresolved && record.channels[SEMANTIC_HOME_CHANNELS.root].result === 'match';
    return { candidateId, outcome: decided.outcome, reason: decided.reason, governingMatch, possiblyClaims: governingMatch || rootReadingMatch };
  });

  const nestedOutcomes = assessed.map(({ candidateId, outcome, reason }) => ({ candidateId, outcome, reason }));
  const eligibleMatches = assessed.filter((entry) => entry.outcome === SEMANTIC_HOME_OUTCOMES.eligible && entry.governingMatch);
  if (eligibleMatches.length > 0) {
    return {
      resolvedAttribution: SEMANTIC_HOME_ATTRIBUTIONS.reattributed,
      attributedTo: eligibleMatches.map(({ candidateId }) => candidateId),
      reason: SEMANTIC_HOME_ATTRIBUTION_REASONS.matchesEligibleNestedCandidate,
      nestedOutcomes,
    };
  }
  const undeterminedClaims = assessed.filter((entry) => entry.outcome === SEMANTIC_HOME_OUTCOMES.undetermined && entry.possiblyClaims);
  if (undeterminedClaims.length > 0) {
    return {
      resolvedAttribution: SEMANTIC_HOME_ATTRIBUTIONS.attributionUndetermined,
      attributedTo: undeterminedClaims.map(({ candidateId }) => candidateId),
      reason: SEMANTIC_HOME_ATTRIBUTION_REASONS.matchesUndeterminedNestedCandidate,
      nestedOutcomes,
    };
  }
  return {
    resolvedAttribution: SEMANTIC_HOME_ATTRIBUTIONS.retained,
    attributedTo: [],
    reason: SEMANTIC_HOME_ATTRIBUTION_REASONS.noEligibleMatchingNestedCandidate,
    nestedOutcomes,
  };
};

// The active members of C, split by attribution, and the S2.6 member attribution records for the
// members behind at least one provisional-redirect boundary.
export const attributeCandidateMembers = ({ memberRecords, outcomeOf, memberRecordOf, candidateByKey }) => {
  const definite = [];
  const undetermined = [];
  const reattributed = [];
  const attributions = [];
  for (const memberRecord of memberRecords) {
    if (memberRecord.relationship === 'terminated') continue;
    if (memberRecord.provisionalRedirectBoundaries.length === 0) {
      definite.push(memberRecord);
      continue;
    }
    const attribution = attributeMember({ memberRecord, outcomeOf, memberRecordOf, candidateByKey });
    attributions.push({ memberRecord, ...attribution });
    if (attribution.resolvedAttribution === SEMANTIC_HOME_ATTRIBUTIONS.reattributed) reattributed.push(memberRecord);
    else if (attribution.resolvedAttribution === SEMANTIC_HOME_ATTRIBUTIONS.attributionUndetermined) undetermined.push(memberRecord);
    else definite.push(memberRecord);
  }
  return { definite, undetermined, reattributed, attributions };
};
