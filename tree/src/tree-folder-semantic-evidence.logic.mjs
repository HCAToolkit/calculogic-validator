// Tree Stage 1B-ii folder semantic evidence (Tree slice spec S1.5-S1.7, S1.9; calculogic-validator#97
// D2, D3, C2, E1-E4). Tree-owned and counts-only: it compares each candidate with each member file on
// two independent channels, records each member's candidate-relative containment along its full
// lineage, and accounts the results per branch. It makes no eligibility, strength, placement or
// finding decision (Stage 2), never re-derives a fact, and reads a Naming field only when the
// matching Stage 1B-i fact says the value is usable.

import { evaluateComparisonFacts } from './tree-folder-fact-evidence.logic.mjs';
import { TREE_FOLDER_CANDIDATE_SOURCES } from './tree-folder-candidates.logic.mjs';

const SOURCE_ID = 'tree-folder-semantic-evidence';
const DIRECT_BRANCH = 'direct';

const toTupleKey = ({ addressProfileId, addressedSnapshotId, occurrenceAddress }) =>
  `${addressProfileId}\u0000${addressedSnapshotId}\u0000${occurrenceAddress}`;

// Count keys include open Naming values (`familyRoot`), so working tallies are prototype-free.
const createTally = () => Object.create(null);
const increment = (tally, key) => {
  tally[key] = (tally[key] ?? 0) + 1;
};
const sortedTally = (tally) => Object.fromEntries(Object.entries(tally).sort(([left], [right]) => left.localeCompare(right)));

const toNotEvaluatedKey = ({ reason, notProvidedReason }) => (notProvidedReason ? `${reason}:${notProvidedReason}` : reason);

// S1.5 channels. Whether a comparison can run is decided only by the Stage 1B-i comparison rule, and
// that rule is the fact gate: a Naming value is read only after it says the comparison is evaluated.
const toRootComparison = ({ candidate, facts, values, position }) => {
  const evaluation = evaluateComparisonFacts([facts.semanticIdentity]);
  if (evaluation.status !== 'evaluated') return { result: 'not-evaluated', ...evaluation, status: undefined };
  const observation = values.observation();
  return observation.familyRoot === candidate.lexicalRoot
    ? { result: 'match', ambiguity: toAmbiguity(observation), position }
    : { result: 'foreign', familyRoot: observation.familyRoot };
};

const isPrefixApplicable = (candidate) =>
  candidate.candidateId.candidateSource === TREE_FOLDER_CANDIDATE_SOURCES.FOLDER_LABEL && candidate.labelTokens.length >= 2;

const toPrefixComparison = ({ candidate, facts, values, position }) => {
  if (!isPrefixApplicable(candidate)) return { result: 'not-applicable' };
  const evaluation = evaluateComparisonFacts([facts.semanticIdentity, facts.tokens]);
  if (evaluation.status !== 'evaluated') return { result: 'not-evaluated', ...evaluation, status: undefined };
  const observation = values.observation();
  const tokens = values.enrichment().semanticTokens;
  const isMatch = candidate.labelTokens.every((token, index) => tokens[index] === token);
  return isMatch
    ? { result: 'match', ambiguity: toAmbiguity(observation), position }
    : { result: 'foreign', familyRoot: observation.familyRoot };
};

// D3: ambiguity is carried into the counts and never changes a comparison.
const toAmbiguity = (observation) =>
  Array.isArray(observation.ambiguityFlags) && observation.ambiguityFlags.length > 0 ? 'ambiguous' : 'singular';

const stripUndefined = (record) => Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));

const emptyChannelCounts = () => ({
  match: { singular: { direct: 0, descendant: 0 }, ambiguous: { direct: 0, descendant: 0 } },
  foreignByRoot: createTally(),
  notEvaluatedByReason: createTally(),
});

const addChannelResult = (counts, comparison) => {
  if (comparison.result === 'match') counts.match[comparison.ambiguity][comparison.position] += 1;
  else if (comparison.result === 'foreign') increment(counts.foreignByRoot, comparison.familyRoot);
  else if (comparison.result === 'not-evaluated') increment(counts.notEvaluatedByReason, toNotEvaluatedKey(comparison));
};

const freezeChannelCounts = (counts) => ({
  match: counts.match,
  foreignByRoot: sortedTally(counts.foreignByRoot),
  notEvaluatedByReason: sortedTally(counts.notEvaluatedByReason),
});

const emptyBranchRow = (branch) => ({
  branch,
  activeMemberCount: 0,
  terminatedMemberCount: 0,
  root: { match: 0, foreign: 0, notEvaluated: 0 },
  prefix: { match: 0, foreign: 0, notEvaluated: 0 },
  narrowingCandidateKeys: new Set(),
});

const addBranchResult = (row, channel, comparison) => {
  if (comparison.result === 'match') row[channel].match += 1;
  else if (comparison.result === 'foreign') row[channel].foreign += 1;
  else if (comparison.result === 'not-evaluated') row[channel].notEvaluated += 1;
};

const candidateKeyOf = (candidate) => `${candidate.candidateId.folderAddressPath}\u0000${candidate.candidateId.candidateSource}`;

export const prepareTreeFolderSemanticEvidence = ({ sectionIntake, factEvidence, candidates = [] } = {}) => {
  const occurrenceFacts = factEvidence?.occurrenceFacts ?? [];
  const factsByKey = new Map(occurrenceFacts.map((entry) => [toTupleKey(entry.identityTuple), entry]));
  const observationByKey = new Map(
    (sectionIntake?.bridgeObservations?.acceptedRecords ?? []).map((record) => [toTupleKey(record), record.observation]),
  );
  const enrichmentByKey = new Map((sectionIntake?.semanticEvidenceEnrichment?.acceptedRecords ?? []).map((record) => [toTupleKey(record), record]));

  // Structure comes only from the Stage 1B-i record: children per folder, by occurrence identity.
  const childFoldersByKey = new Map();
  const childFilesByKey = new Map();
  for (const entry of occurrenceFacts) {
    if (!entry.parentOccurrenceAddress) continue;
    const parentKey = toTupleKey({ ...entry.identityTuple, occurrenceAddress: entry.parentOccurrenceAddress });
    const bucket = entry.occurrenceType === 'folder' ? childFoldersByKey : childFilesByKey;
    bucket.set(parentKey, [...(bucket.get(parentKey) ?? []), entry]);
  }

  const candidatesByFolderKey = new Map();
  for (const candidate of candidates) {
    const key = toTupleKey(candidate.folderIdentityTuple);
    candidatesByFolderKey.set(key, [...(candidatesByFolderKey.get(key) ?? []), candidate]);
  }

  // S1.6 boundary facts of one lineage folder relative to C (E3: several may apply at once).
  const toBoundaryFacts = (candidate, folderKey) => {
    const others = candidatesByFolderKey.get(folderKey) ?? [];
    const terminate = others.filter((other) => other.candidateId.candidateSource === TREE_FOLDER_CANDIDATE_SOURCES.PACKAGE_ROOT);
    const narrow = others.filter(
      (other) => other.candidateId.candidateSource === TREE_FOLDER_CANDIDATE_SOURCES.FOLDER_LABEL && other.lexicalRoot === candidate.lexicalRoot,
    );
    const redirect = others.filter((other) => other.lexicalRoot !== candidate.lexicalRoot);
    return { terminate, narrow, redirect };
  };

  // Members and their lineage: a depth-first walk of C's subtree, each folder visited once (E4).
  const collectMembers = (candidate) => {
    const rootKey = toTupleKey(candidate.folderIdentityTuple);
    const members = [];
    const visited = new Set([rootKey]);
    const pending = [{ folderKey: rootKey, lineage: [] }];
    while (pending.length > 0) {
      const { folderKey, lineage } = pending.pop();
      for (const file of childFilesByKey.get(folderKey) ?? []) members.push({ file, lineage });
      for (const child of childFoldersByKey.get(folderKey) ?? []) {
        const childKey = toTupleKey(child.identityTuple);
        if (visited.has(childKey)) continue;
        visited.add(childKey);
        pending.push({ folderKey: childKey, lineage: [...lineage, child] });
      }
    }
    return members;
  };

  const memberRelationships = [];
  const evaluatedCandidates = candidates.map((candidate) => {
    const prefixApplicable = isPrefixApplicable(candidate);
    const root = emptyChannelCounts();
    const prefix = emptyChannelCounts();
    const branchRows = new Map();
    const terminatedByFolder = createTally();
    const redirectBoundaries = new Map();
    const narrowAttributions = new Map();
    let activeMemberCount = 0;
    let terminatedMemberCount = 0;

    for (const { file, lineage } of collectMembers(candidate)) {
      const memberKey = toTupleKey(file.identityTuple);
      const position = lineage.length === 0 ? 'direct' : 'descendant';
      const branch = lineage.length === 0 ? DIRECT_BRANCH : lineage[0].identityTuple.occurrenceAddress;
      const row = branchRows.get(branch) ?? emptyBranchRow(branch);
      branchRows.set(branch, row);

      // Every boundary fact on the full lineage, from F downward; evaluation never stops early.
      const terminateAt = [];
      const narrowAt = [];
      const redirectAt = [];
      for (const folder of lineage) {
        const folderKey = toTupleKey(folder.identityTuple);
        const { terminate, narrow, redirect } = toBoundaryFacts(candidate, folderKey);
        const folderAddress = folder.identityTuple.occurrenceAddress;
        if (terminate.length > 0) terminateAt.push(folderAddress);
        if (narrow.length > 0) {
          narrowAt.push({ folderAddress, candidateIds: narrow.map((other) => other.candidateId) });
          for (const other of narrow) row.narrowingCandidateKeys.add(candidateKeyOf(other));
          const attribution = narrowAttributions.get(folderAddress) ?? { folderAddress, narrowingCandidateIds: narrow.map((other) => other.candidateId), memberCount: 0 };
          attribution.memberCount += 1;
          narrowAttributions.set(folderAddress, attribution);
        }
        if (redirect.length > 0) {
          redirectAt.push({ folderAddress, candidateIds: redirect.map((other) => other.candidateId) });
          const boundary = redirectBoundaries.get(folderAddress) ?? { folderAddress, nestedCandidateIds: redirect.map((other) => other.candidateId), memberCount: 0 };
          boundary.memberCount += 1;
          redirectBoundaries.set(folderAddress, boundary);
        }
      }

      // Values are fetched on demand, only by a comparison its facts allow (see the channels above).
      const facts = file.facts;
      const values = { observation: () => observationByKey.get(memberKey), enrichment: () => enrichmentByKey.get(memberKey) };
      const rootComparison = stripUndefined(toRootComparison({ candidate, facts, values, position }));
      const prefixComparison = stripUndefined(toPrefixComparison({ candidate, facts, values, position }));

      const terminated = terminateAt.length > 0;
      memberRelationships.push({
        candidateId: candidate.candidateId,
        member: file.identityTuple,
        path: file.path,
        branch,
        relationship: terminated ? 'terminated' : 'preserved',
        ...(terminated ? { terminatedAt: terminateAt[0] } : { status: 'provisional' }),
        narrowAttributions: narrowAt,
        provisionalRedirectBoundaries: redirectAt,
        // E1: a terminated member's comparisons stay visible here and count nowhere else.
        channels: { root: rootComparison, prefix: prefixComparison },
      });

      if (terminated) {
        terminatedMemberCount += 1;
        row.terminatedMemberCount += 1;
        increment(terminatedByFolder, terminateAt[0]);
        continue;
      }
      // C2: a provisional member's evaluated comparison counts; the relationship alone never does.
      activeMemberCount += 1;
      row.activeMemberCount += 1;
      addChannelResult(root, rootComparison);
      addBranchResult(row, 'root', rootComparison);
      if (prefixApplicable) {
        addChannelResult(prefix, prefixComparison);
        addBranchResult(row, 'prefix', prefixComparison);
      }
    }

    const narrowingCandidateIdByKey = new Map(candidates.map((other) => [candidateKeyOf(other), other.candidateId]));
    return {
      ...candidate,
      facets: {
        activeMemberCount,
        terminatedMemberCount,
        channels: {
          root: freezeChannelCounts(root),
          prefix: prefixApplicable ? { applicable: true, ...freezeChannelCounts(prefix) } : { applicable: false },
        },
        branches: [...branchRows.values()]
          .map(({ narrowingCandidateKeys, ...row }) => ({
            ...row,
            ...(prefixApplicable ? {} : { prefix: undefined }),
            narrowingCandidateIds: [...narrowingCandidateKeys].sort().map((key) => narrowingCandidateIdByKey.get(key)),
          }))
          .map(stripUndefined)
          .sort((left, right) => left.branch.localeCompare(right.branch)),
        terminatedByFolder: sortedTally(terminatedByFolder),
        provisionalRedirectBoundaries: [...redirectBoundaries.values()].sort((left, right) => left.folderAddress.localeCompare(right.folderAddress)),
        narrowAttributions: [...narrowAttributions.values()].sort((left, right) => left.folderAddress.localeCompare(right.folderAddress)),
        corroborationReferences: candidate.references,
      },
    };
  });

  return {
    source: SOURCE_ID,
    factEvidenceSource: factEvidence?.source ?? null,
    // D2/C3: held by reference, never recomputed or copied.
    availability: sectionIntake?.availability ?? null,
    diagnostics: sectionIntake?.diagnostics ?? [],
    compositionObservations: factEvidence?.compositionObservations ?? [],
    candidates: evaluatedCandidates,
    memberRelationships: memberRelationships.sort(
      (left, right) =>
        left.candidateId.folderAddressPath.localeCompare(right.candidateId.folderAddressPath) ||
        left.candidateId.candidateSource.localeCompare(right.candidateId.candidateSource) ||
        left.member.occurrenceAddress.localeCompare(right.member.occurrenceAddress),
    ),
  };
};
