// Tree Stage 2B-i `TREE_FAMILY_SCATTERED` (Tree slice spec S2.12, B1-B8; calculogic-validator#102).
// Reports files whose placement is `home-elsewhere`: an eligible Semantic Home exists elsewhere and the
// file matches it, but sits outside it. It reads the prepared Stage 2A record and never re-decides
// eligibility, comparison or structural home; every other placement, and a run where Stage 2 was not
// evaluated, emits nothing, with no fallback to the earlier family heuristics. Informational only:
// being outside a home is not a misplacement (S2.15).

import { toCandidateKey } from '../tree-folder-candidates.logic.mjs';
import {
  SEMANTIC_HOME_CHANNELS,
  SEMANTIC_HOME_PLACEMENT_STATES,
  SEMANTIC_HOME_REASONING_STATUSES,
} from '../tree-semantic-home-reasoning.knowledge.mjs';
import { claimOf } from '../tree-semantic-home-strength-profile.logic.mjs';
import { toValidatorDevelopmentPathPrefix, toValidatorDocAuthorityPathPrefix } from '../tree-validator-development-root.logic.mjs';

const CODE = 'TREE_FAMILY_SCATTERED';
const BASIS = 'semantic-home-placement';
const RULE_REF = 'calculogic-validator/doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md';
const MESSAGE =
  'Files match an eligible Semantic Home elsewhere and sit outside it; this is an informational relationship, not a misplacement.';

const toTupleKey = ({ addressProfileId, addressedSnapshotId, occurrenceAddress }) =>
  `${addressProfileId}\u0000${addressedSnapshotId}\u0000${occurrenceAddress}`;
const copyTuple = ({ addressProfileId, addressedSnapshotId, occurrenceAddress }) => ({ addressProfileId, addressedSnapshotId, occurrenceAddress });
const copyCandidateId = ({ folderAddressPath, candidateSource, labelObservationRef }) => ({
  folderAddressPath,
  candidateSource,
  labelObservationRef: copyTuple(labelObservationRef),
});
const byAddress = (left, right) => left.occurrenceAddress.localeCompare(right.occurrenceAddress);
const byCandidateKey = (left, right) => toCandidateKey(left).localeCompare(toCandidateKey(right));

// B7: the claim stays on its candidate; a prefix claim keeps its tokens.
const toClaim = (candidate, governingChannel) => {
  const { channel, value } = claimOf(candidate, governingChannel);
  return governingChannel === SEMANTIC_HOME_CHANNELS.prefix ? { channel, tokens: value.split('\u0000') } : { channel, root: value };
};

// B2 (R2): a document under the validator development root's `doc/` is paired with a home when the
// home lies under that root, outside its `doc/`, in the top-level owned area the document's Naming
// `familyRoot` names. Without a validator development root nothing is paired.
const isPairedDocument = ({ filePath, familyRoot, homePath, developmentContext }) => {
  const { validatorRootPrefix, docAuthorityRootPrefix } = developmentContext;
  if (docAuthorityRootPrefix === null || !filePath.startsWith(docAuthorityRootPrefix)) return false;
  const homePrefix = `${homePath}/`;
  if (!homePrefix.startsWith(validatorRootPrefix) || homePrefix.startsWith(docAuthorityRootPrefix)) return false;
  const ownedArea = homePath.slice(validatorRootPrefix.length).split('/')[0];
  return typeof familyRoot === 'string' && ownedArea.length > 0 && familyRoot === ownedArea;
};

// B1: the file's homes are the distinct folders of the eligible candidates it matches elsewhere.
const homesOf = (placement, candidateByKey) => {
  const homeByFolder = new Map();
  for (const candidateId of placement.elsewhereHomes) {
    const candidate = candidateByKey.get(toCandidateKey(candidateId));
    if (!candidate) throw new Error(`No Stage 1 candidate for ${toCandidateKey(candidateId)}.`);
    const folderKey = toTupleKey(candidate.folderIdentityTuple);
    if (!homeByFolder.has(folderKey)) homeByFolder.set(folderKey, { folderKey, folder: candidate.folderIdentityTuple, folderPath: candidate.path, candidates: [] });
    homeByFolder.get(folderKey).candidates.push(candidate);
  }
  return [...homeByFolder.values()].sort((left, right) => byAddress(left.folder, right.folder));
};

const toFileRecord = ({ placement, pairedHomes, observation }) => ({
  occurrence: copyTuple(placement.file),
  path: placement.path,
  matchedCandidates: placement.elsewhereHomes.map(copyCandidateId).sort(byCandidateKey),
  ...(pairedHomes.length > 0 ? { pairedHomes: pairedHomes.map((home) => copyTuple(home.folder)) } : {}),
  otherCandidates: placement.consultedCandidates.map(({ candidateId, outcome, reason, relation, location }) => ({
    candidateId: copyCandidateId(candidateId),
    outcome,
    reason,
    relation,
    location,
  })),
  ...((observation?.splitFamilyFlags ?? []).length > 0 ? { splitFamilyFlags: [...observation.splitFamilyFlags] } : {}),
});

const toFinding = (group, outcomeByKey) => {
  const files = group.members.map(toFileRecord).sort((left, right) => byAddress(left.occurrence, right.occurrence));
  const homes = group.homes.map((home) => {
    // Only the candidates some file in this finding matches qualify.
    const qualifying = new Map();
    for (const member of group.members) {
      for (const candidate of member.homes.find((entry) => entry.folderKey === home.folderKey).candidates) {
        qualifying.set(toCandidateKey(candidate.candidateId), candidate);
      }
    }
    return {
      folder: copyTuple(home.folder),
      folderPath: home.folderPath,
      qualifyingCandidates: [...qualifying.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, candidate]) => {
          const { governingChannel } = outcomeByKey.get(key);
          return { candidateId: copyCandidateId(candidate.candidateId), governingChannel, claim: toClaim(candidate, governingChannel) };
        }),
    };
  });
  const firstPath = files.map((file) => file.path).sort((left, right) => left.localeCompare(right))[0];
  return {
    code: CODE,
    severity: 'info',
    path: firstPath,
    classification: 'advisory-structure',
    message: MESSAGE,
    ruleRef: RULE_REF,
    details: { basis: BASIS, homes, files, fileCount: files.length },
  };
};

// `preparedDependencies` are the run's prepared Tree dependencies; `validatorDevelopmentRoot` is the
// prepared development root, or null for installed consumers.
export const collectSemanticHomeScatterFindings = ({ preparedDependencies, validatorDevelopmentRoot = null } = {}) => {
  const reasoning = preparedDependencies?.treeFolderSemanticHomeReasoning;
  // B5: no evaluated reasoning is no evidence; the report's `meta.semanticHomeReasoning` says why.
  if (reasoning?.status !== SEMANTIC_HOME_REASONING_STATUSES.evaluated) return [];

  const candidateByKey = new Map((reasoning.semanticEvidenceSource?.candidates ?? []).map((candidate) => [toCandidateKey(candidate.candidateId), candidate]));
  const outcomeByKey = new Map(reasoning.candidateOutcomes.map((outcome) => [toCandidateKey(outcome.candidateId), outcome]));
  const observationByTuple = new Map(
    (preparedDependencies.treeNamingSectionIntake?.bridgeObservations?.acceptedRecords ?? []).map((record) => [toTupleKey(record), record.observation]),
  );
  const developmentContext = {
    validatorRootPrefix: toValidatorDevelopmentPathPrefix(validatorDevelopmentRoot),
    docAuthorityRootPrefix: toValidatorDocAuthorityPathPrefix(validatorDevelopmentRoot),
  };

  const groups = new Map();
  for (const placement of reasoning.placements) {
    if (placement.state !== SEMANTIC_HOME_PLACEMENT_STATES.homeElsewhere) continue;
    const observation = observationByTuple.get(toTupleKey(placement.file));
    const homes = homesOf(placement, candidateByKey);
    if (homes.length === 0) throw new Error(`Placement home-elsewhere without an eligible home for ${placement.path}.`);
    const pairedHomes = homes.filter((home) =>
      isPairedDocument({ filePath: placement.path, familyRoot: observation?.familyRoot, homePath: home.folderPath, developmentContext }),
    );
    // B2: a document paired with every home it belongs to is documentation beside its runtime.
    if (pairedHomes.length === homes.length) continue;
    const setKey = homes.map((home) => home.folderKey).join('\u0001');
    if (!groups.has(setKey)) groups.set(setKey, { setKey, homes, members: [] });
    groups.get(setKey).members.push({ placement, homes, pairedHomes, observation });
  }

  return [...groups.values()]
    .map((group) => ({ setKey: group.setKey, finding: toFinding(group, outcomeByKey) }))
    .sort((left, right) => left.finding.path.localeCompare(right.finding.path) || left.setKey.localeCompare(right.setKey))
    .map(({ finding }) => finding);
};
