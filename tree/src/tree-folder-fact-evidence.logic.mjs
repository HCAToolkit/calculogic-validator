// Tree Stage 1B-i folder fact evidence (Tree slice spec S1.3 fact level, S1.8; S1.11). Tree-owned:
// it turns the records Stage 1A intake accepted or rejected into one fact-level availability record
// per addressed occurrence and one composition observation per addressed folder. It reads only
// `treeNamingSectionIntake` and Tree's addressed snapshot, never Naming internals, and it proposes
// no candidate, comparison, relationship, facet or finding (those are Stage 1B-ii).

const SOURCE_ID = 'tree-folder-fact-evidence';
const AVAILABLE = 'available';

export const TREE_FILE_SEMANTIC_IDENTITY_STATES = Object.freeze({
  SEMANTIC_OBSERVATION: 'semantic-observation',
  NO_SEMANTIC_OBSERVATION: 'no-semantic-observation',
  REJECTED: 'rejected',
  UNAVAILABLE: 'unavailable',
});

export const TREE_FIELD_GROUP_FACT_STATES = Object.freeze({
  AVAILABLE: 'available',
  NOT_PROVIDED: 'not-provided',
  INVALID: 'invalid',
  REJECTED: 'rejected',
  UNAVAILABLE: 'unavailable',
});

export const TREE_FOLDER_LABEL_STATES = Object.freeze({
  PARSED: 'parsed',
  NOT_PARSED: 'not-parsed',
  ABSENT: 'absent',
});

export const TREE_FOLDER_BRIDGE_OBSERVATION_STATES = Object.freeze({
  ACCEPTED: 'accepted',
  NONE: 'none',
  REJECTED: 'rejected',
  UNAVAILABLE: 'unavailable',
});

// S1.3 comparison rule: the reason is the first that applies, in this order.
export const TREE_NOT_EVALUATED_REASONS = Object.freeze({
  RUN_UNAVAILABLE: 'run-unavailable',
  RECORD_REJECTED: 'record-rejected',
  INVALID_FIELD_GROUP: 'invalid-field-group',
  NO_SEMANTIC_OBSERVATION: 'no-semantic-observation',
  NOT_PROVIDED: 'not-provided',
});

const toTupleKey = ({ addressProfileId, addressedSnapshotId, occurrenceAddress }) =>
  `${addressProfileId}\u0000${addressedSnapshotId}\u0000${occurrenceAddress}`;

const toOccurrenceAddress = (occurrenceRecord) =>
  [occurrenceRecord.occurrenceAddress, occurrenceRecord.address, occurrenceRecord.addressPath].find(
    (value) => typeof value === 'string' && value.length > 0,
  );

const compareByAddress = (left, right) =>
  left.identityTuple.occurrenceAddress.localeCompare(right.identityTuple.occurrenceAddress);

// Accepted records keyed by tuple; rejected reasons keyed by tuple (tupleless rejections cannot be
// attributed to an occurrence and stay visible only in the intake).
const indexSection = ({ acceptedRecords = [], rejectedRecords = [] } = {}, toTuple = (record) => record) => {
  const acceptedByTuple = new Map(acceptedRecords.map((record) => [toTupleKey(toTuple(record)), record]));
  const rejectedReasonsByTuple = new Map();
  for (const { identityTuple, reason } of rejectedRecords) {
    if (!identityTuple) continue;
    const key = toTupleKey(identityTuple);
    rejectedReasonsByTuple.set(key, [...(rejectedReasonsByTuple.get(key) ?? []), reason]);
  }
  return { acceptedByTuple, rejectedReasonsByTuple };
};

const toRejectedFact = (state, reasons) => ({ state, reasons: [...new Set(reasons)].sort() });

const toSemanticIdentityFact = ({ key, bridgeAvailable, bridge }) => {
  const { SEMANTIC_OBSERVATION, NO_SEMANTIC_OBSERVATION, REJECTED, UNAVAILABLE } = TREE_FILE_SEMANTIC_IDENTITY_STATES;
  if (!bridgeAvailable) return { state: UNAVAILABLE };
  if (bridge.rejectedReasonsByTuple.has(key)) return toRejectedFact(REJECTED, bridge.rejectedReasonsByTuple.get(key));
  return bridge.acceptedByTuple.has(key) ? { state: SEMANTIC_OBSERVATION } : { state: NO_SEMANTIC_OBSERVATION };
};

// One N1 field group: `invalid` drops only that group (S1.3); `rejected` means the whole record.
const toFieldGroupFact = ({ key, enrichmentAvailable, enrichment, groupStateField }) => {
  const { AVAILABLE: GROUP_AVAILABLE, NOT_PROVIDED, INVALID, REJECTED, UNAVAILABLE } = TREE_FIELD_GROUP_FACT_STATES;
  if (!enrichmentAvailable) return { state: UNAVAILABLE };
  if (enrichment.rejectedReasonsByTuple.has(key)) return toRejectedFact(REJECTED, enrichment.rejectedReasonsByTuple.get(key));
  const record = enrichment.acceptedByTuple.get(key);
  if (!record) return { state: NOT_PROVIDED, reason: 'no-record' };
  if (record[groupStateField] === 'invalid') return { state: INVALID };
  return record[groupStateField] === 'accepted' ? { state: GROUP_AVAILABLE } : { state: NOT_PROVIDED, reason: 'group-omitted' };
};

const toFolderLabelFact = ({ key, labelsAvailable, labels }) => {
  const { PARSED, NOT_PARSED, ABSENT } = TREE_FOLDER_LABEL_STATES;
  if (!labelsAvailable) return { state: ABSENT, reason: 'run-unavailable' };
  const record = labels.acceptedByTuple.get(key);
  if (record?.parseOutcome === 'parsed') {
    return {
      state: PARSED,
      labelTokens: [...record.labelTokens],
      labelRoot: record.labelRoot,
      ...(record.labelFacts ? { labelFacts: [...record.labelFacts] } : {}),
    };
  }
  if (record?.parseOutcome === 'not-parsed') return { state: NOT_PARSED, notParsedReasons: [...record.notParsedReasons] };
  if (labels.rejectedReasonsByTuple.has(key)) {
    return { state: ABSENT, reason: 'record-rejected', rejectionReasons: [...new Set(labels.rejectedReasonsByTuple.get(key))].sort() };
  }
  return { state: ABSENT, reason: 'no-record' };
};

// A folder's own v1 observation (folder-semantic-context, package-root, composition). A rejection,
// including the duplicate-tuple case of #85's one-observation-per-occurrence track, stays visible.
const toFolderBridgeObservationFact = ({ key, bridgeAvailable, bridge }) => {
  const { ACCEPTED, NONE, REJECTED, UNAVAILABLE } = TREE_FOLDER_BRIDGE_OBSERVATION_STATES;
  if (!bridgeAvailable) return { state: UNAVAILABLE };
  if (bridge.rejectedReasonsByTuple.has(key)) return toRejectedFact(REJECTED, bridge.rejectedReasonsByTuple.get(key));
  const record = bridge.acceptedByTuple.get(key);
  return record ? { state: ACCEPTED, semanticEvidenceKind: record.observation.semanticEvidenceKind ?? null } : { state: NONE };
};

// S1.3 comparison rule. `requiredFacts` lists the facts a comparison needs, in order (semantic
// identity first, then any N1 group); the result never treats an unknown as a mismatch.
export const evaluateComparisonFacts = (requiredFacts) => {
  const states = requiredFacts.map((fact) => fact.state);
  if (states.includes('unavailable')) return { status: 'not-evaluated', reason: TREE_NOT_EVALUATED_REASONS.RUN_UNAVAILABLE };
  if (states.includes('rejected')) return { status: 'not-evaluated', reason: TREE_NOT_EVALUATED_REASONS.RECORD_REJECTED };
  if (states.includes('invalid')) return { status: 'not-evaluated', reason: TREE_NOT_EVALUATED_REASONS.INVALID_FIELD_GROUP };
  for (const fact of requiredFacts) {
    if (fact.state === 'no-semantic-observation') {
      return { status: 'not-evaluated', reason: TREE_NOT_EVALUATED_REASONS.NO_SEMANTIC_OBSERVATION };
    }
    if (fact.state === 'not-provided') {
      return { status: 'not-evaluated', reason: TREE_NOT_EVALUATED_REASONS.NOT_PROVIDED, notProvidedReason: fact.reason };
    }
  }
  return { status: 'evaluated' };
};

// Tally keys: the state, qualified by its reason where S1.3 keeps one on the state.
const toTallyKey = (fact) => (fact.state === 'not-provided' || fact.state === 'absent' ? `${fact.state}:${fact.reason}` : fact.state);

// Tally keys are open Naming values (a family root may be `constructor` or `toString`), so every
// working tally is prototype-free: a key is counted only when this tally holds it.
const createTally = () => Object.create(null);

const addCount = (tally, key, count) => {
  tally[key] = (tally[key] ?? 0) + count;
};

const increment = (tally, key) => addCount(tally, key, 1);

const sortedTally = (tally) => Object.fromEntries(Object.entries(tally).sort(([left], [right]) => left.localeCompare(right)));

const emptyTallies = () => ({
  fileCount: 0,
  familyRoots: createTally(),
  roleCategories: createTally(),
  semanticIdentity: createTally(),
  tokens: createTally(),
  roleFacts: createTally(),
});

const addFileFacts = (tallies, { facts, familyRoot, roleCategory }) => {
  tallies.fileCount += 1;
  if (typeof familyRoot === 'string' && familyRoot.length > 0) increment(tallies.familyRoots, familyRoot);
  if (typeof roleCategory === 'string' && roleCategory.length > 0) increment(tallies.roleCategories, roleCategory);
  increment(tallies.semanticIdentity, toTallyKey(facts.semanticIdentity));
  increment(tallies.tokens, toTallyKey(facts.tokens));
  increment(tallies.roleFacts, toTallyKey(facts.roleFacts));
};

const freezeTallies = (tallies) => ({
  fileCount: tallies.fileCount,
  familyRoots: sortedTally(tallies.familyRoots),
  roleCategories: sortedTally(tallies.roleCategories),
  semanticIdentity: sortedTally(tallies.semanticIdentity),
  tokens: sortedTally(tallies.tokens),
  roleFacts: sortedTally(tallies.roleFacts),
});

export const prepareTreeFolderFactEvidence = ({ sectionIntake, addressedNamespace, addressedOccurrenceRecords = [] } = {}) => {
  const availability = sectionIntake?.availability ?? {};
  const bridgeAvailable = availability.bridge === AVAILABLE;
  const enrichmentAvailable = availability.semanticEvidenceEnrichment === AVAILABLE;
  const labelsAvailable = availability.folderLabelObservations === AVAILABLE;
  const bridge = indexSection(sectionIntake?.bridgeObservations);
  const enrichment = indexSection(sectionIntake?.semanticEvidenceEnrichment);
  const labels = indexSection(sectionIntake?.folderLabelObservations);

  const occurrences = (Array.isArray(addressedOccurrenceRecords) ? addressedOccurrenceRecords : [])
    .map((occurrenceRecord) => ({ occurrenceRecord, occurrenceAddress: toOccurrenceAddress(occurrenceRecord) }))
    .filter(({ occurrenceAddress }) => occurrenceAddress);

  const occurrenceFacts = occurrences.map(({ occurrenceRecord, occurrenceAddress }) => {
    const identityTuple = { ...addressedNamespace, occurrenceAddress };
    const key = toTupleKey(identityTuple);
    const isFolder = occurrenceRecord.occurrenceType === 'folder';
    return {
      identityTuple,
      occurrenceType: occurrenceRecord.occurrenceType,
      path: occurrenceRecord.path,
      parentOccurrenceAddress: occurrenceRecord.parentAddressPath ?? null,
      facts: isFolder
        ? {
            folderLabel: toFolderLabelFact({ key, labelsAvailable, labels }),
            bridgeObservation: toFolderBridgeObservationFact({ key, bridgeAvailable, bridge }),
          }
        : {
            semanticIdentity: toSemanticIdentityFact({ key, bridgeAvailable, bridge }),
            tokens: toFieldGroupFact({ key, enrichmentAvailable, enrichment, groupStateField: 'tokenGroup' }),
            roleFacts: toFieldGroupFact({ key, enrichmentAvailable, enrichment, groupStateField: 'roleFactGroup' }),
          },
    };
  });

  // S1.8: one composition observation per addressed folder, holding direct members only.
  const compositionByAddress = new Map();
  for (const entry of occurrenceFacts) {
    if (entry.occurrenceType !== 'folder') continue;
    compositionByAddress.set(entry.identityTuple.occurrenceAddress, {
      entry,
      tallies: emptyTallies(),
      childFolderAddresses: [],
    });
  }
  for (const entry of occurrenceFacts) {
    const parent = compositionByAddress.get(entry.parentOccurrenceAddress);
    if (!parent) continue;
    if (entry.occurrenceType === 'folder') {
      parent.childFolderAddresses.push(entry.identityTuple.occurrenceAddress);
      continue;
    }
    const key = toTupleKey(entry.identityTuple);
    const familyRoot = entry.facts.semanticIdentity.state === 'semantic-observation'
      ? bridge.acceptedByTuple.get(key)?.observation.familyRoot
      : undefined;
    const roleCategory = entry.facts.roleFacts.state === 'available' ? enrichment.acceptedByTuple.get(key)?.roleCategory : undefined;
    addFileFacts(parent.tallies, { facts: entry.facts, familyRoot, roleCategory });
  }

  const compositionObservations = [...compositionByAddress.values()]
    .map(({ entry, tallies, childFolderAddresses }) => ({
      identityTuple: entry.identityTuple,
      path: entry.path,
      label: entry.facts.folderLabel,
      bridgeObservation: entry.facts.bridgeObservation,
      childFolderAddresses: childFolderAddresses.sort((left, right) => left.localeCompare(right)),
      directMembers: freezeTallies(tallies),
    }))
    .sort(compareByAddress);

  return {
    source: SOURCE_ID,
    sectionIntakeSource: sectionIntake?.source ?? null,
    // The run-level availability is Stage 1A's own record, never recomputed here.
    availability: sectionIntake?.availability ?? null,
    occurrenceFacts: occurrenceFacts.sort(compareByAddress),
    compositionObservations,
  };
};

// S1.8 derived view: a folder's subtree tallies, summed from the stored direct records on demand.
// Nothing derived is stored, so the subtree view can never disagree with the direct records.
export const deriveSubtreeComposition = (folderFactEvidence, occurrenceAddress) => {
  const byAddress = new Map(
    (folderFactEvidence?.compositionObservations ?? []).map((observation) => [observation.identityTuple.occurrenceAddress, observation]),
  );
  if (!byAddress.has(occurrenceAddress)) return null;
  const totals = emptyTallies();
  const pending = [occurrenceAddress];
  while (pending.length > 0) {
    const observation = byAddress.get(pending.pop());
    if (!observation) continue;
    const { directMembers } = observation;
    totals.fileCount += directMembers.fileCount;
    for (const field of ['familyRoots', 'roleCategories', 'semanticIdentity', 'tokens', 'roleFacts']) {
      for (const [key, count] of Object.entries(directMembers[field])) addCount(totals[field], key, count);
    }
    pending.push(...observation.childFolderAddresses);
  }
  return freezeTallies(totals);
};
