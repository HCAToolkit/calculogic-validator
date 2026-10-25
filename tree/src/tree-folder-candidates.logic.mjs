// Tree Stage 1B-ii folder candidates (Tree slice spec S1.4; calculogic-validator#97 D4, D5, E4).
// Tree-owned: a candidate is permission to investigate one interpretation of one folder, never
// evidence that it is correct. Candidates come only from the closed source list, read through the
// Stage 1B-i facts (which say whether a record is usable) and the Stage 1A intake (which holds the
// accepted record's values). Nothing is suppressed, and no candidate is derived from file contents.

export const TREE_FOLDER_CANDIDATE_SOURCES = Object.freeze({
  FOLDER_LABEL: 'naming-folder-label',
  FOLDER_SEMANTIC_CONTEXT: 'naming-folder-semantic-context',
  PACKAGE_ROOT: 'naming-package-root',
});

const toTupleKey = ({ addressProfileId, addressedSnapshotId, occurrenceAddress }) =>
  `${addressProfileId}\u0000${addressedSnapshotId}\u0000${occurrenceAddress}`;

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

export const toCandidateKey = ({ folderAddressPath, candidateSource }) => `${folderAddressPath}\u0000${candidateSource}`;

const compareCandidates = (left, right) =>
  left.candidateId.folderAddressPath.localeCompare(right.candidateId.folderAddressPath) ||
  left.candidateId.candidateSource.localeCompare(right.candidateId.candidateSource);

// D5: Tree's own evidence is referenced by that evidence's record identity, `{ source, addressPath }`.
const toEvidenceReference = (evidence, addressPath) => {
  const record = (evidence?.evidenceRecords ?? []).find((entry) => entry.addressPath === addressPath);
  return record ? { source: evidence.source, addressPath } : null;
};

// The folder's own v1 observation proposes a context or package-root candidate (D4: lexicalRoot is
// the observation's `familyRoot`, with no further derivation).
const toObservationCandidate = (observation) => {
  if (!isNonEmptyString(observation?.familyRoot)) return null;
  if (observation.semanticEvidenceKind === 'folder-semantic-context') {
    return { candidateSource: TREE_FOLDER_CANDIDATE_SOURCES.FOLDER_SEMANTIC_CONTEXT, lexicalRoot: observation.familyRoot };
  }
  if (observation.semanticEvidenceKind === 'semantic-family-root-folder' && observation.familyRootQualification === 'package-root-folder') {
    return { candidateSource: TREE_FOLDER_CANDIDATE_SOURCES.PACKAGE_ROOT, lexicalRoot: observation.familyRoot, bounded: true };
  }
  return null;
};

export const prepareTreeFolderCandidates = ({ factEvidence, sectionIntake, folderKindEvidence, structuralHomeEvidence } = {}) => {
  const folderEntries = (factEvidence?.occurrenceFacts ?? []).filter((entry) => entry.occurrenceType === 'folder');
  const acceptedObservationByTuple = new Map(
    (sectionIntake?.bridgeObservations?.acceptedRecords ?? []).map((record) => [toTupleKey(record), record.observation]),
  );

  const proposed = [];
  for (const entry of folderEntries) {
    const { identityTuple, facts } = entry;
    const folderAddressPath = identityTuple.occurrenceAddress;
    const base = { folderIdentityTuple: identityTuple, path: entry.path };
    if (facts.folderLabel.state === 'parsed') {
      proposed.push({
        ...base,
        candidateId: { folderAddressPath, candidateSource: TREE_FOLDER_CANDIDATE_SOURCES.FOLDER_LABEL, labelObservationRef: identityTuple },
        lexicalRoot: facts.folderLabel.labelRoot,
        labelTokens: [...facts.folderLabel.labelTokens],
      });
    }
    // Read the observation only when the fact says it was accepted for a usable run.
    if (facts.bridgeObservation.state === 'accepted') {
      const observation = acceptedObservationByTuple.get(toTupleKey(identityTuple));
      const candidate = toObservationCandidate(observation);
      if (candidate) {
        const { candidateSource, ...fields } = candidate;
        proposed.push({ ...base, candidateId: { folderAddressPath, candidateSource, labelObservationRef: identityTuple }, ...fields });
      }
    }
  }

  const candidatesByFolder = new Map();
  for (const candidate of proposed) {
    const key = toTupleKey(candidate.folderIdentityTuple);
    candidatesByFolder.set(key, [...(candidatesByFolder.get(key) ?? []), candidate]);
  }
  const parentByKey = new Map(
    folderEntries.map((entry) => [
      toTupleKey(entry.identityTuple),
      entry.parentOccurrenceAddress ? toTupleKey({ ...entry.identityTuple, occurrenceAddress: entry.parentOccurrenceAddress }) : null,
    ]),
  );

  // rootAncestry: any ancestor candidate, of any source, with the same lexicalRoot. The ancestor walk
  // visits each folder once by occurrence identity (E4).
  const toRootAncestry = (candidate) => {
    const visited = new Set([toTupleKey(candidate.folderIdentityTuple)]);
    let ancestorKey = parentByKey.get(toTupleKey(candidate.folderIdentityTuple));
    while (ancestorKey && !visited.has(ancestorKey)) {
      visited.add(ancestorKey);
      if ((candidatesByFolder.get(ancestorKey) ?? []).some((ancestor) => ancestor.lexicalRoot === candidate.lexicalRoot)) return 'anchored';
      ancestorKey = parentByKey.get(ancestorKey);
    }
    return 'unanchored';
  };

  return proposed
    .map((candidate) => ({
      ...candidate,
      rootAncestry: toRootAncestry(candidate),
      references: {
        sameFolderCandidates: (candidatesByFolder.get(toTupleKey(candidate.folderIdentityTuple)) ?? [])
          .filter((other) => other !== candidate)
          .map((other) => other.candidateId)
          .sort((left, right) => left.candidateSource.localeCompare(right.candidateSource)),
        folderKindEvidence: toEvidenceReference(folderKindEvidence, candidate.candidateId.folderAddressPath),
        structuralHomeEvidence: toEvidenceReference(structuralHomeEvidence, candidate.candidateId.folderAddressPath),
      },
    }))
    .sort(compareCandidates);
};
