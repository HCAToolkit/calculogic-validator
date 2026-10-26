// Tree Stage 2A-ii Semantic Home placement (Tree slice spec S2.8; calculogic-validator#102 P1-P8).
// Places every file occurrence relative to the decided candidates by the five-step precedence. It
// manufactures no certainty: only a `match` with an `eligible` candidate gives a home, a possible
// relation keeps the file undetermined, and `no-home` needs the run-wide discovery condition.
// Comparisons come from Stage 1 member records on the relevant lineage and, for every other pair,
// from the comparison operation Stage 1 itself uses; Naming material is never reinterpreted.

import { createCandidateFileComparator, isTerminatingCandidate } from './tree-folder-semantic-evidence.logic.mjs';
import { toCandidateKey } from './tree-folder-candidates.logic.mjs';
import { governingChannelOf, toMemberRecordKey } from './tree-semantic-home-attribution.logic.mjs';
import {
  SEMANTIC_HOME_CHANNELS,
  SEMANTIC_HOME_DISCOVERY_CLAUSES,
  SEMANTIC_HOME_OUTCOMES,
  SEMANTIC_HOME_PLACEMENT_LOCATIONS,
  SEMANTIC_HOME_PLACEMENT_REASONS,
  SEMANTIC_HOME_PLACEMENT_RELATIONS,
  SEMANTIC_HOME_PLACEMENT_STATES,
  SEMANTIC_HOME_REASONS,
} from './tree-semantic-home-reasoning.knowledge.mjs';

const toTupleKey = ({ addressProfileId, addressedSnapshotId, occurrenceAddress }) =>
  `${addressProfileId}\u0000${addressedSnapshotId}\u0000${occurrenceAddress}`;

const copyCandidateId = ({ folderAddressPath, candidateSource, labelObservationRef }) => ({
  folderAddressPath,
  candidateSource,
  labelObservationRef: { ...labelObservationRef },
});

const AVAILABLE = 'available';
const FOLDER_LEVEL_ABSENT_REASONS = new Set(['no-record', 'record-rejected']);

// S2.8 no-home evidence condition, once per run (P4). A run-level unavailability is one clause,
// never repeated per folder.
export const evaluateCandidateDiscovery = ({ sectionIntake, factEvidence }) => {
  const availability = sectionIntake?.availability ?? {};
  const unmet = [];
  if (availability.bridge !== AVAILABLE) {
    unmet.push({ clause: SEMANTIC_HOME_DISCOVERY_CLAUSES.bridgeUnavailable, availability: availability.bridge ?? null });
  }
  if (availability.folderLabelObservations !== AVAILABLE) {
    unmet.push({ clause: SEMANTIC_HOME_DISCOVERY_CLAUSES.folderLabelsUnavailable, availability: availability.folderLabelObservations ?? null });
  }
  for (const entry of factEvidence?.occurrenceFacts ?? []) {
    if (entry.occurrenceType !== 'folder') continue;
    const { folderLabel, bridgeObservation } = entry.facts;
    if (folderLabel.state === 'absent' && FOLDER_LEVEL_ABSENT_REASONS.has(folderLabel.reason)) {
      unmet.push({
        clause: SEMANTIC_HOME_DISCOVERY_CLAUSES.folderLabelAbsent,
        folder: { ...entry.identityTuple },
        reason: folderLabel.reason,
        ...(folderLabel.rejectionReasons ? { rejectionReasons: [...folderLabel.rejectionReasons] } : {}),
      });
    }
    if (bridgeObservation.state === 'rejected') {
      unmet.push({
        clause: SEMANTIC_HOME_DISCOVERY_CLAUSES.folderObservationRejected,
        folder: { ...entry.identityTuple },
        reasons: [...bridgeObservation.reasons],
      });
    }
  }
  return { complete: unmet.length === 0, unmet };
};

// P1, P2: the one relation of file f to an eligible or undetermined candidate, or null.
const relationOf = (channels, candidate, outcome) => {
  const governing = channels[governingChannelOf(candidate)];
  if (governing.result === 'match') return SEMANTIC_HOME_PLACEMENT_RELATIONS.match;
  if (governing.result === 'not-evaluated') return SEMANTIC_HOME_PLACEMENT_RELATIONS.possibleUnevaluated;
  if (outcome.reasons[0] === SEMANTIC_HOME_REASONS.claimUnresolved && channels[SEMANTIC_HOME_CHANNELS.root].result === 'match') {
    return SEMANTIC_HOME_PLACEMENT_RELATIONS.possibleRootReading;
  }
  return null;
};

export const placeFiles = ({ factEvidence, semanticEvidence, sectionIntake, candidateOutcomes, scope }) => {
  const occurrenceFacts = factEvidence?.occurrenceFacts ?? [];
  const parentKeyOf = (entry) =>
    entry.parentOccurrenceAddress ? toTupleKey({ ...entry.identityTuple, occurrenceAddress: entry.parentOccurrenceAddress }) : null;
  const folderByKey = new Map(occurrenceFacts.filter((entry) => entry.occurrenceType === 'folder').map((entry) => [toTupleKey(entry.identityTuple), entry]));

  const outcomeByKey = new Map(candidateOutcomes.map((outcome) => [toCandidateKey(outcome.candidateId), outcome]));
  const candidates = semanticEvidence?.candidates ?? [];
  // Not-eligible candidates take no part in placement.
  const active = candidates
    .map((candidate) => ({ candidate, key: toCandidateKey(candidate.candidateId), outcome: outcomeByKey.get(toCandidateKey(candidate.candidateId)) }))
    .filter(({ outcome }) => outcome && outcome.outcome !== SEMANTIC_HOME_OUTCOMES.notEligible)
    .sort((left, right) => left.key.localeCompare(right.key));
  const terminatingFolderKeys = new Set(candidates.filter(isTerminatingCandidate).map((candidate) => toTupleKey(candidate.folderIdentityTuple)));
  const recordByKey = new Map((semanticEvidence?.memberRelationships ?? []).map((record) => [toMemberRecordKey(record.candidateId, record.member), record]));
  const compare = createCandidateFileComparator({ sectionIntake });
  const candidateDiscovery = evaluateCandidateDiscovery({ sectionIntake, factEvidence });

  // P6, P7: from f's parent upward, through the first terminating folder; each folder once (E4).
  const relevantLineageOf = (file) => {
    const lineage = [];
    const visited = new Set();
    let key = parentKeyOf(file);
    while (key && folderByKey.has(key) && !visited.has(key)) {
      visited.add(key);
      lineage.push(key);
      if (terminatingFolderKeys.has(key)) break;
      key = parentKeyOf(folderByKey.get(key));
    }
    return lineage;
  };

  const placements = occurrenceFacts
    .filter((entry) => entry.occurrenceType === 'file')
    .map((file) => {
      const base = { file: { ...file.identityTuple }, path: file.path };
      const identityState = file.facts.semanticIdentity.state;
      if (identityState !== 'semantic-observation') {
        return { ...base, state: SEMANTIC_HOME_PLACEMENT_STATES.undetermined, reason: identityState, decidedAtStep: 0, nearestHome: null, lineageHomes: [], elsewhereHomes: [], consultedCandidates: [], scope };
      }

      const lineage = relevantLineageOf(file);
      const lineageIndex = new Map(lineage.map((key, index) => [key, index]));
      const lineageHomes = [];
      const elsewhereHomes = [];
      const consulted = [];
      for (const { candidate, key, outcome } of active) {
        const folderIndex = lineageIndex.get(toTupleKey(candidate.folderIdentityTuple));
        const onLineage = folderIndex !== undefined;
        let channels;
        if (onLineage) {
          // P8: f is a Stage 1 member of every candidate on its relevant lineage.
          const record = recordByKey.get(toMemberRecordKey(candidate.candidateId, file.identityTuple));
          if (!record) throw new Error(`No Stage 1 member record for ${key} and ${file.identityTuple.occurrenceAddress}.`);
          channels = record.channels;
        } else {
          channels = compare({ candidate, file });
        }
        const relation = relationOf(channels, candidate, outcome);
        if (relation === null) continue;
        const isEligible = outcome.outcome === SEMANTIC_HOME_OUTCOMES.eligible;
        if (isEligible && relation === SEMANTIC_HOME_PLACEMENT_RELATIONS.match) {
          (onLineage ? lineageHomes : elsewhereHomes).push({ candidate, key, folderIndex });
        } else {
          consulted.push({
            candidateId: copyCandidateId(candidate.candidateId),
            outcome: outcome.outcome,
            reason: outcome.reasons[0],
            relation,
            location: onLineage ? SEMANTIC_HOME_PLACEMENT_LOCATIONS.lineage : SEMANTIC_HOME_PLACEMENT_LOCATIONS.elsewhere,
          });
        }
      }
      lineageHomes.sort((left, right) => left.folderIndex - right.folderIndex || left.key.localeCompare(right.key));
      consulted.sort((left, right) => left.location.localeCompare(right.location) || toCandidateKey(left.candidateId).localeCompare(toCandidateKey(right.candidateId)));

      const evidence = {
        lineageHomes: lineageHomes.map(({ candidate }) => copyCandidateId(candidate.candidateId)),
        elsewhereHomes: elsewhereHomes.map(({ candidate }) => copyCandidateId(candidate.candidateId)),
        consultedCandidates: consulted,
        scope,
      };
      const consultedAt = (location) => consulted.some((entry) => entry.location === location);

      if (lineageHomes.length > 0) {
        // P3: the nearest folder carrying an eligible matching candidate, with all of them.
        const nearestIndex = lineageHomes[0].folderIndex;
        const nearest = lineageHomes.filter((home) => home.folderIndex === nearestIndex);
        return {
          ...base,
          state: SEMANTIC_HOME_PLACEMENT_STATES.insideHome,
          decidedAtStep: 1,
          nearestHome: {
            folderAddressPath: nearest[0].candidate.candidateId.folderAddressPath,
            candidateIds: nearest.map(({ candidate }) => copyCandidateId(candidate.candidateId)),
          },
          ...evidence,
        };
      }
      if (consultedAt(SEMANTIC_HOME_PLACEMENT_LOCATIONS.lineage)) {
        return { ...base, state: SEMANTIC_HOME_PLACEMENT_STATES.undetermined, reason: SEMANTIC_HOME_PLACEMENT_REASONS.homeOnLineageUndetermined, decidedAtStep: 2, nearestHome: null, ...evidence };
      }
      if (elsewhereHomes.length > 0) {
        return { ...base, state: SEMANTIC_HOME_PLACEMENT_STATES.homeElsewhere, decidedAtStep: 3, nearestHome: null, ...evidence };
      }
      if (consultedAt(SEMANTIC_HOME_PLACEMENT_LOCATIONS.elsewhere)) {
        return { ...base, state: SEMANTIC_HOME_PLACEMENT_STATES.undetermined, reason: SEMANTIC_HOME_PLACEMENT_REASONS.homeElsewhereUndetermined, decidedAtStep: 4, nearestHome: null, ...evidence };
      }
      return candidateDiscovery.complete
        ? { ...base, state: SEMANTIC_HOME_PLACEMENT_STATES.noHome, decidedAtStep: 5, nearestHome: null, ...evidence }
        : { ...base, state: SEMANTIC_HOME_PLACEMENT_STATES.undetermined, reason: SEMANTIC_HOME_PLACEMENT_REASONS.candidateDiscoveryIncomplete, decidedAtStep: 5, nearestHome: null, ...evidence };
    })
    .sort((left, right) => left.file.occurrenceAddress.localeCompare(right.file.occurrenceAddress));

  return { placements, candidateDiscovery };
};
