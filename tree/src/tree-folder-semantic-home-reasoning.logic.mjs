// Tree Stage 2A-i folder Semantic Home reasoning (Tree slice spec S2.1-S2.7, S2.9;
// calculogic-validator#102). Coordinates the Stage 2 modules into the prepared-evidence record
// `treeFolderSemanticHomeReasoning`: candidate outcomes and member attributions. Placement (S2.8)
// is Stage 2A-ii. It reads the Stage 1 records and the loaded parameter set by reference, never
// modifies them, and nothing reads its output yet, so no finding changes.

import { toCandidateKey } from './tree-folder-candidates.logic.mjs';
import {
  attributeCandidateMembers,
  governingChannelOf,
  isMultiTokenLabel,
  kindOf,
  orderCandidatesDeepestFirst,
  toMemberRecordKey,
} from './tree-semantic-home-attribution.logic.mjs';
import { decideCandidate } from './tree-semantic-home-eligibility.logic.mjs';
import {
  SEMANTIC_HOME_CHANNELS,
  SEMANTIC_HOME_NOTES,
  SEMANTIC_HOME_REASONING_STATUSES,
  SEMANTIC_HOME_REASONS,
} from './tree-semantic-home-reasoning.knowledge.mjs';
import { buildStrengthProfile, claimOf } from './tree-semantic-home-strength-profile.logic.mjs';

const SOURCE_ID = 'tree-folder-semantic-home-reasoning';

// Q1: the record's status follows the parameter set's availability one to one.
const STATUS_BY_AVAILABILITY = Object.freeze({
  available: SEMANTIC_HOME_REASONING_STATUSES.evaluated,
  'configuration-unavailable': SEMANTIC_HOME_REASONING_STATUSES.configurationUnavailable,
  'not-prepared': SEMANTIC_HOME_REASONING_STATUSES.notPrepared,
});

const PARAMETER_NAMES = Object.freeze(['P_COVERAGE', 'P_MIN_SUPPORT', 'P_NOT_ELIGIBLE_SHARE', 'P_ELIGIBLE_SHARE']);

const deepFreeze = (value) => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const copyCandidateId = ({ folderAddressPath, candidateSource, labelObservationRef }) => ({
  folderAddressPath,
  candidateSource,
  labelObservationRef: { ...labelObservationRef },
});

const toNotEvaluatedKey = ({ reason, notProvidedReason }) => (notProvidedReason ? `${reason}:${notProvidedReason}` : reason);

const emptyKinds = () => ({ support: 0, contradiction: 0, missing: 0 });
const kindCounts = (members, channel) => {
  const counts = emptyKinds();
  for (const member of members) counts[kindOf(member.channels[channel])] += 1;
  return counts;
};

// S2.9 decision counts on the governing channel, over the members C definitely holds.
const decisionCountsOf = (definite, undetermined, channel) => {
  const support = { singular: 0, ambiguous: 0 };
  // Keys are open Naming values (`familyRoot`), so the working tallies are prototype-free, as in Stage 1.
  const contradictionByRoot = Object.create(null);
  const missingByReason = Object.create(null);
  for (const member of definite) {
    const comparison = member.channels[channel];
    if (comparison.result === 'match') support[comparison.ambiguity] += 1;
    else if (comparison.result === 'foreign') contradictionByRoot[comparison.familyRoot] = (contradictionByRoot[comparison.familyRoot] ?? 0) + 1;
    else {
      const key = toNotEvaluatedKey(comparison);
      missingByReason[key] = (missingByReason[key] ?? 0) + 1;
    }
  }
  const sorted = (tally) => Object.fromEntries(Object.entries(tally).sort(([left], [right]) => left.localeCompare(right)));
  return {
    decisionMemberCount: definite.length,
    support,
    contradictionByRoot: sorted(contradictionByRoot),
    missingByReason: sorted(missingByReason),
    attributionUndetermined: { memberCount: undetermined.length, ...kindCounts(undetermined, channel) },
  };
};

const readingResult = ({ outcome, reason }) => ({ outcome, reason });
const referenceResult = (reference, multiToken) => ({
  outcome: reference.outcome,
  reason: reference.reason,
  ...(multiToken ? { readings: { prefix: readingResult(reference.prefix), root: readingResult(reference.root) } } : {}),
});

const rootReadingOf = (decision, rootCounts) =>
  decision.reason === SEMANTIC_HOME_REASONS.claimUnresolved
    ? { outcome: decision.root.outcome, reason: decision.root.reason, counts: rootCounts }
    : null;

export const prepareTreeFolderSemanticHomeReasoning = ({ semanticEvidence, factEvidence, parameterSet } = {}) => {
  const status = STATUS_BY_AVAILABILITY[parameterSet?.availability];
  if (!status) throw new Error(`Unknown Semantic Home parameter set availability ${JSON.stringify(parameterSet?.availability)}.`);
  if (status !== SEMANTIC_HOME_REASONING_STATUSES.evaluated) {
    // Stage 2 did not run: no outcome, attribution or placement, not even an undetermined one.
    return Object.freeze({ source: SOURCE_ID, status, parameterSet });
  }

  const parameters = Object.fromEntries(PARAMETER_NAMES.map((name) => [name, parameterSet.parameters[name].value]));
  const candidates = semanticEvidence?.candidates ?? [];
  const memberRecords = semanticEvidence?.memberRelationships ?? [];
  const candidateByKey = new Map(candidates.map((candidate) => [toCandidateKey(candidate.candidateId), candidate]));
  const recordByKey = new Map(memberRecords.map((record) => [toMemberRecordKey(record.candidateId, record.member), record]));
  const recordsByCandidate = new Map();
  for (const record of memberRecords) {
    const key = toCandidateKey(record.candidateId);
    recordsByCandidate.set(key, [...(recordsByCandidate.get(key) ?? []), record]);
  }

  const decided = new Map();
  const outcomes = [];
  const memberAttributions = [];
  for (const candidate of orderCandidatesDeepestFirst(candidates, factEvidence)) {
    const key = toCandidateKey(candidate.candidateId);
    const governingChannel = governingChannelOf(candidate);
    const multiToken = isMultiTokenLabel(candidate);
    const { definite, undetermined, reattributed, attributions } = attributeCandidateMembers({
      memberRecords: recordsByCandidate.get(key) ?? [],
      outcomeOf: (nestedKey) => decided.get(nestedKey),
      memberRecordOf: (candidateId, member) => recordByKey.get(toMemberRecordKey(candidateId, member)),
      candidateByKey,
    });

    const readingOf = (channel) => ({ definite: kindCounts(definite, channel), undetermined: kindCounts(undetermined, channel) });
    const readings = {
      root: readingOf(SEMANTIC_HOME_CHANNELS.root),
      ...(multiToken ? { prefix: readingOf(SEMANTIC_HOME_CHANNELS.prefix) } : {}),
    };
    const decision = decideCandidate({ readings, multiToken, parameters });
    decided.set(key, { outcome: decision.outcome, reason: decision.reason });

    const rootReading = rootReadingOf(decision, readings.root.definite);
    const strengthProfile = buildStrengthProfile({
      candidate,
      governingChannel,
      definiteMembers: definite,
      undeterminedMemberCount: undetermined.length,
      reattributedMemberCount: reattributed.length,
      rootReading,
    });
    const notes = [
      ...(strengthProfile.channelDisagreementMemberCount > 0 ? [SEMANTIC_HOME_NOTES.channelDisagreement] : []),
      ...(strengthProfile.bounded ? [SEMANTIC_HOME_NOTES.bounded] : []),
    ];
    const dependsOn = decision.referenceResolutions
      ? {
          nestedCandidateIds: [
            ...new Map(
              attributions
                .filter((entry) => entry.resolvedAttribution === 'attribution-undetermined')
                .flatMap((entry) => entry.attributedTo)
                .map((candidateId) => [toCandidateKey(candidateId), candidateId]),
            ).entries(),
          ]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([, candidateId]) => copyCandidateId(candidateId)),
          retained: referenceResult(decision.referenceResolutions.retained, multiToken),
          removed: referenceResult(decision.referenceResolutions.removed, multiToken),
        }
      : null;

    outcomes.push({
      candidate,
      outcome: {
        candidateId: copyCandidateId(candidate.candidateId),
        governingChannel,
        outcome: decision.outcome,
        reasons: [decision.reason],
        notes,
        decisionCounts: decisionCountsOf(definite, undetermined, governingChannel),
        decisionEvidence: decision.conditionChecks,
        ...(dependsOn ? { dependsOn } : {}),
        ...(rootReading ? { rootReading } : {}),
        strengthProfile,
      },
    });

    for (const entry of attributions) {
      memberAttributions.push({
        candidateId: copyCandidateId(candidate.candidateId),
        member: { ...entry.memberRecord.member },
        path: entry.memberRecord.path,
        originalComparison: { channel: governingChannel, ...entry.memberRecord.channels[governingChannel] },
        resolvedAttribution: entry.resolvedAttribution,
        attributedTo: entry.attributedTo.map(copyCandidateId),
        reason: entry.reason,
        nestedOutcomes: entry.nestedOutcomes.map(({ candidateId, outcome, reason }) => ({ candidateId: copyCandidateId(candidateId), outcome, reason })),
      });
    }
  }

  // S2.7 corroboration (Q4): same-folder candidates with the same claim, and their outcomes. Descriptive only.
  const candidateOutcomes = outcomes
    .map(({ candidate, outcome }) => {
      const claim = claimOf(candidate, outcome.governingChannel);
      const makesSameClaim = (other) => {
        const otherClaim = claimOf(other, governingChannelOf(other));
        return otherClaim.channel === claim.channel && otherClaim.value === claim.value;
      };
      const corroboration = (candidate.references?.sameFolderCandidates ?? [])
        .map((candidateId) => candidateByKey.get(toCandidateKey(candidateId)))
        .filter((other) => other && makesSameClaim(other))
        .map((other) => ({ candidateId: copyCandidateId(other.candidateId), outcome: decided.get(toCandidateKey(other.candidateId)).outcome }));
      return { ...outcome, strengthProfile: { ...outcome.strengthProfile, corroboration } };
    })
    .sort(
      (left, right) =>
        left.candidateId.folderAddressPath.localeCompare(right.candidateId.folderAddressPath) ||
        left.candidateId.candidateSource.localeCompare(right.candidateId.candidateSource),
    );

  return Object.freeze({
    source: SOURCE_ID,
    status,
    // Held by reference: neither is copied or frozen here.
    parameterSet,
    semanticEvidenceSource: semanticEvidence,
    candidateOutcomes: deepFreeze(candidateOutcomes),
    memberAttributions: deepFreeze(
      memberAttributions.sort(
        (left, right) =>
          left.candidateId.folderAddressPath.localeCompare(right.candidateId.folderAddressPath) ||
          left.candidateId.candidateSource.localeCompare(right.candidateId.candidateSource) ||
          left.member.occurrenceAddress.localeCompare(right.member.occurrenceAddress),
      ),
    ),
  });
};
