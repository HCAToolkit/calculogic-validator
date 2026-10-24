// Tree Stage 1A intake of the Naming envelope sections (Tree slice spec S1.2, S1.3 run and record
// levels; bridge occurrence identity contract §4.4-§4.6). Tree-owned consumer validation only: it
// accepts or rejects section records through the occurrence identity tuple and records availability.
// It derives no candidate, relationship, facet, or finding, and never interprets Naming material.

const SOURCE_ID = 'tree-naming-section-intake';
const BRIDGE_CONTRACT_VERSION = 'naming-occurrence-bridge.v1';
const IDENTITY_TUPLE_FIELDS = Object.freeze(['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress']);
// The roleStatus value shape approved for N1 (bridge contract §6.2 `role` row).
const ROLE_STATUS_VALUES = new Set(['active', 'deprecated', 'provisional']);
// The N2 label-fact vocabulary (bridge contract §6.3).
const LABEL_FACT_VALUES = new Set(['contains-connector-token']);

export const TREE_NAMING_SECTION_AVAILABILITY = Object.freeze({
  AVAILABLE: 'available',
  NOT_STAGED: 'not-staged',
  SECTION_ABSENT: 'section-absent',
  SECTION_UNSUPPORTED: 'section-unsupported',
  SECTION_INVALID: 'section-invalid',
});

export const TREE_NAMING_FIELD_GROUP_STATES = Object.freeze({
  ACCEPTED: 'accepted',
  OMITTED: 'omitted',
  INVALID: 'invalid',
});

const SECTIONS = Object.freeze({
  semanticEvidenceEnrichment: Object.freeze({
    key: 'namingSemanticEvidenceEnrichment',
    contractVersion: 'naming-semantic-evidence-enrichment.v1',
    diagnosticSection: 'naming-semantic-evidence-enrichment',
  }),
  folderLabelObservations: Object.freeze({
    key: 'namingFolderLabelObservations',
    contractVersion: 'naming-folder-label-observation.v1',
    diagnosticSection: 'naming-folder-label-observation',
  }),
});

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const isNonEmptyStringArray = (value) => Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);

const toTupleKey = ({ addressProfileId, addressedSnapshotId, occurrenceAddress }) =>
  `${addressProfileId}\u0000${addressedSnapshotId}\u0000${occurrenceAddress}`;

const toIdentityTuple = (record) =>
  isPlainObject(record) && IDENTITY_TUPLE_FIELDS.every((field) => isNonEmptyString(record[field]))
    ? {
        addressProfileId: record.addressProfileId,
        addressedSnapshotId: record.addressedSnapshotId,
        occurrenceAddress: record.occurrenceAddress,
      }
    : null;

const compareTuples = (left, right) =>
  left.addressProfileId.localeCompare(right.addressProfileId) ||
  left.addressedSnapshotId.localeCompare(right.addressedSnapshotId) ||
  left.occurrenceAddress.localeCompare(right.occurrenceAddress);

const compareNullableTuples = (left, right) =>
  left && right ? compareTuples(left, right) : left ? 1 : right ? -1 : 0;

// Addressing is the identity authority: an occurrence's address comes from the addressed snapshot.
const toOccurrenceByAddress = (occurrenceRecords) => {
  const occurrenceByAddress = new Map();
  for (const occurrenceRecord of Array.isArray(occurrenceRecords) ? occurrenceRecords : []) {
    if (!isPlainObject(occurrenceRecord)) continue;
    const occurrenceAddress = [occurrenceRecord.occurrenceAddress, occurrenceRecord.address, occurrenceRecord.addressPath]
      .find(isNonEmptyString);
    if (occurrenceAddress && !occurrenceByAddress.has(occurrenceAddress)) {
      occurrenceByAddress.set(occurrenceAddress, occurrenceRecord);
    }
  }
  return occurrenceByAddress;
};

const isInNamespace = (tuple, namespace) =>
  tuple.addressProfileId === namespace.addressProfileId && tuple.addressedSnapshotId === namespace.addressedSnapshotId;

// v1 observations Tree accepts for section association: a valid, unique tuple in the payload
// namespace that matches an occurrence in Tree's addressed snapshot.
const toAcceptedObservationOccurrences = ({ observations, namespace, occurrenceByAddress }) => {
  const tuples = observations.map(toIdentityTuple);
  const counts = new Map();
  for (const tuple of tuples) {
    if (tuple) counts.set(toTupleKey(tuple), (counts.get(toTupleKey(tuple)) ?? 0) + 1);
  }
  const accepted = new Map();
  for (const tuple of tuples) {
    if (!tuple || counts.get(toTupleKey(tuple)) > 1 || !isInNamespace(tuple, namespace)) continue;
    const occurrenceRecord = occurrenceByAddress.get(tuple.occurrenceAddress);
    if (occurrenceRecord) accepted.set(toTupleKey(tuple), occurrenceRecord);
  }
  return accepted;
};

// §4.4 rules 3 and 5: an unsupported version is unsupported enrichment; a malformed supported
// envelope is invalid as a whole.
const toEnvelopeState = (section, sectionSpec) => {
  if (!isPlainObject(section)) return TREE_NAMING_SECTION_AVAILABILITY.SECTION_INVALID;
  if (section.contractVersion !== sectionSpec.contractVersion) return TREE_NAMING_SECTION_AVAILABILITY.SECTION_UNSUPPORTED;
  const hasExactTupleFields =
    Array.isArray(section.identityTupleFields) &&
    section.identityTupleFields.length === IDENTITY_TUPLE_FIELDS.length &&
    section.identityTupleFields.every((field, index) => field === IDENTITY_TUPLE_FIELDS[index]);
  if (!hasExactTupleFields || !Array.isArray(section.records) || section.recordCount !== section.records.length) {
    return TREE_NAMING_SECTION_AVAILABILITY.SECTION_INVALID;
  }
  return TREE_NAMING_SECTION_AVAILABILITY.AVAILABLE;
};

// Record identity checks shared by both sections (§4.5, §4.6 consumer rules). Every record carrying
// a duplicated tuple is rejected; there is no path fallback.
const partitionByIdentity = ({ records, namespace, resolveTarget, expectedOccurrenceType }) => {
  const tupleCounts = new Map();
  for (const record of records) {
    const tuple = toIdentityTuple(record);
    if (tuple) tupleCounts.set(toTupleKey(tuple), (tupleCounts.get(toTupleKey(tuple)) ?? 0) + 1);
  }

  const candidates = [];
  const rejected = [];
  for (const record of records) {
    const tuple = toIdentityTuple(record);
    const reject = (reason) => rejected.push({ identityTuple: tuple, reason });
    if (!tuple) reject('invalid-identity');
    else if (tupleCounts.get(toTupleKey(tuple)) > 1) reject('duplicate-identity');
    else if (!isInNamespace(tuple, namespace)) reject('namespace-mismatch');
    else {
      const occurrenceRecord = resolveTarget(tuple);
      if (!occurrenceRecord) reject('unmatched-record');
      else if (occurrenceRecord.occurrenceType !== expectedOccurrenceType) reject('occurrence-type-mismatch');
      else candidates.push({ record, tuple });
    }
  }
  return { candidates, rejected };
};

const toTokenGroupState = (record) =>
  record.semanticTokens === undefined
    ? TREE_NAMING_FIELD_GROUP_STATES.OMITTED
    : isNonEmptyStringArray(record.semanticTokens)
      ? TREE_NAMING_FIELD_GROUP_STATES.ACCEPTED
      : TREE_NAMING_FIELD_GROUP_STATES.INVALID;

const toRoleFactGroupState = (record) => {
  if (record.role === undefined && record.roleCategory === undefined && record.roleStatus === undefined) {
    return TREE_NAMING_FIELD_GROUP_STATES.OMITTED;
  }
  return isNonEmptyString(record.role) && isNonEmptyString(record.roleCategory) && ROLE_STATUS_VALUES.has(record.roleStatus)
    ? TREE_NAMING_FIELD_GROUP_STATES.ACCEPTED
    : TREE_NAMING_FIELD_GROUP_STATES.INVALID;
};

// N1 field groups are validated independently: an invalid group is dropped, the other is kept.
const toAcceptedEnrichmentRecord = ({ record, tuple }) => {
  const tokenGroup = toTokenGroupState(record);
  const roleFactGroup = toRoleFactGroupState(record);
  return {
    ...tuple,
    ...(isNonEmptyString(record.repoRelativePath) ? { repoRelativePath: record.repoRelativePath } : {}),
    tokenGroup,
    roleFactGroup,
    ...(tokenGroup === TREE_NAMING_FIELD_GROUP_STATES.ACCEPTED ? { semanticTokens: [...record.semanticTokens] } : {}),
    ...(roleFactGroup === TREE_NAMING_FIELD_GROUP_STATES.ACCEPTED
      ? { role: record.role, roleCategory: record.roleCategory, roleStatus: record.roleStatus }
      : {}),
  };
};

const PARSED_ONLY_FIELDS = ['labelTokens', 'labelRoot', 'labelFacts'];

// §4.6 / §6.3 record shape: exactly one outcome's field group.
const isValidFolderLabelShape = (record) => {
  if (record.parseOutcome === 'parsed') {
    return (
      record.notParsedReasons === undefined &&
      isNonEmptyStringArray(record.labelTokens) &&
      record.labelRoot === record.labelTokens[0] &&
      (record.labelFacts === undefined ||
        (isNonEmptyStringArray(record.labelFacts) && record.labelFacts.every((fact) => LABEL_FACT_VALUES.has(fact))))
    );
  }
  if (record.parseOutcome === 'not-parsed') {
    return PARSED_ONLY_FIELDS.every((field) => record[field] === undefined) && isNonEmptyStringArray(record.notParsedReasons);
  }
  return false;
};

const toAcceptedFolderLabelRecord = ({ record, tuple }) => ({
  ...tuple,
  ...(isNonEmptyString(record.repoRelativePath) ? { repoRelativePath: record.repoRelativePath } : {}),
  parseOutcome: record.parseOutcome,
  ...(record.parseOutcome === 'parsed'
    ? {
        labelTokens: [...record.labelTokens],
        labelRoot: record.labelRoot,
        ...(record.labelFacts ? { labelFacts: [...record.labelFacts] } : {}),
      }
    : { notParsedReasons: [...record.notParsedReasons] }),
});

const EMPTY_SECTION_RESULT = Object.freeze({ acceptedRecords: [], rejectedRecords: [] });

// S1.3 run level. A section that arrives in the payload is validated on its own merits, whatever
// route delivered the payload. Absence is `not-staged` only for a Tree-built payload whose staged
// Naming input for that section was not supplied; a caller-supplied payload is never supplemented.
const toAbsentState = ({ bridgeSource, stagedInputSupplied }) =>
  bridgeSource === 'tree-built' && !stagedInputSupplied
    ? TREE_NAMING_SECTION_AVAILABILITY.NOT_STAGED
    : TREE_NAMING_SECTION_AVAILABILITY.SECTION_ABSENT;

export const prepareTreeNamingSectionIntake = ({
  namingOccurrenceBridge,
  bridgeSource,
  addressedOccurrenceRecords = [],
  staged = {},
} = {}) => {
  const payload = isPlainObject(namingOccurrenceBridge) ? namingOccurrenceBridge : null;
  const diagnostics = [];

  const v1Availability = !payload
    ? TREE_NAMING_SECTION_AVAILABILITY.NOT_STAGED
    : payload.bridgeContractVersion !== BRIDGE_CONTRACT_VERSION
      ? TREE_NAMING_SECTION_AVAILABILITY.SECTION_UNSUPPORTED
      : !Array.isArray(payload.observations)
        ? TREE_NAMING_SECTION_AVAILABILITY.SECTION_INVALID
        : bridgeSource === 'tree-built' && !staged.namingSemanticFamilyBridge
          ? TREE_NAMING_SECTION_AVAILABILITY.NOT_STAGED
          : TREE_NAMING_SECTION_AVAILABILITY.AVAILABLE;

  const namespace = {
    addressProfileId: payload?.addressProfileId ?? null,
    addressedSnapshotId: payload?.addressedSnapshotId ?? null,
  };
  const occurrenceByAddress = toOccurrenceByAddress(addressedOccurrenceRecords);
  const acceptedObservationOccurrences =
    v1Availability === TREE_NAMING_SECTION_AVAILABILITY.SECTION_UNSUPPORTED || !Array.isArray(payload?.observations)
      ? new Map()
      : toAcceptedObservationOccurrences({ observations: payload.observations, namespace, occurrenceByAddress });

  const intakeSection = ({ sectionSpec, stagedInputSupplied, resolveTarget, expectedOccurrenceType, toAcceptedRecord }) => {
    if (!payload) {
      return { availability: TREE_NAMING_SECTION_AVAILABILITY.NOT_STAGED, ...EMPTY_SECTION_RESULT };
    }
    const section = payload[sectionSpec.key];
    if (section === undefined) {
      return { availability: toAbsentState({ bridgeSource, stagedInputSupplied }), ...EMPTY_SECTION_RESULT };
    }
    const availability = toEnvelopeState(section, sectionSpec);
    if (availability !== TREE_NAMING_SECTION_AVAILABILITY.AVAILABLE) {
      diagnostics.push({ section: sectionSpec.diagnosticSection, reason: availability, identityTuple: null });
      return { availability, ...EMPTY_SECTION_RESULT };
    }

    const { candidates, rejected } = partitionByIdentity({
      records: section.records,
      namespace,
      resolveTarget,
      expectedOccurrenceType,
    });
    const acceptedRecords = [];
    const rejectedRecords = [...rejected];
    for (const candidate of candidates) {
      const acceptedRecord = toAcceptedRecord(candidate);
      if (acceptedRecord) acceptedRecords.push(acceptedRecord);
      else rejectedRecords.push({ identityTuple: candidate.tuple, reason: 'invalid-record-shape' });
    }

    for (const { identityTuple, reason } of rejectedRecords) {
      diagnostics.push({ section: sectionSpec.diagnosticSection, reason, identityTuple });
    }
    for (const acceptedRecord of acceptedRecords) {
      for (const [fieldGroup, state] of [['semantic-tokens', acceptedRecord.tokenGroup], ['role-facts', acceptedRecord.roleFactGroup]]) {
        if (state === TREE_NAMING_FIELD_GROUP_STATES.INVALID) {
          diagnostics.push({
            section: sectionSpec.diagnosticSection,
            reason: 'invalid-field-group',
            fieldGroup,
            identityTuple: IDENTITY_TUPLE_FIELDS.reduce((tuple, field) => ({ ...tuple, [field]: acceptedRecord[field] }), {}),
          });
        }
      }
    }

    return {
      availability,
      acceptedRecords: acceptedRecords.sort(compareTuples),
      rejectedRecords: rejectedRecords.sort(
        (left, right) => compareNullableTuples(left.identityTuple, right.identityTuple) || left.reason.localeCompare(right.reason),
      ),
    };
  };

  const semanticEvidenceEnrichment = intakeSection({
    sectionSpec: SECTIONS.semanticEvidenceEnrichment,
    stagedInputSupplied: staged.namingSemanticEvidenceEnrichment !== undefined,
    // N1 records attach to a v1 file observation Tree accepted (§4.5).
    resolveTarget: (tuple) => acceptedObservationOccurrences.get(toTupleKey(tuple)),
    expectedOccurrenceType: 'file',
    toAcceptedRecord: toAcceptedEnrichmentRecord,
  });
  const folderLabelObservations = intakeSection({
    sectionSpec: SECTIONS.folderLabelObservations,
    stagedInputSupplied: typeof staged.interpretFolderLabel === 'function',
    // N2 records attach to an addressed folder occurrence in Tree's snapshot (§4.6).
    resolveTarget: (tuple) => occurrenceByAddress.get(tuple.occurrenceAddress),
    expectedOccurrenceType: 'folder',
    toAcceptedRecord: (candidate) => (isValidFolderLabelShape(candidate.record) ? toAcceptedFolderLabelRecord(candidate) : null),
  });

  return {
    source: SOURCE_ID,
    bridgeSource: payload ? bridgeSource : null,
    availability: {
      bridge: v1Availability,
      semanticEvidenceEnrichment: semanticEvidenceEnrichment.availability,
      folderLabelObservations: folderLabelObservations.availability,
    },
    semanticEvidenceEnrichment: {
      acceptedRecords: semanticEvidenceEnrichment.acceptedRecords,
      rejectedRecords: semanticEvidenceEnrichment.rejectedRecords,
    },
    folderLabelObservations: {
      acceptedRecords: folderLabelObservations.acceptedRecords,
      rejectedRecords: folderLabelObservations.rejectedRecords,
    },
    diagnostics: diagnostics.sort(
      (left, right) =>
        left.section.localeCompare(right.section) ||
        compareNullableTuples(left.identityTuple, right.identityTuple) ||
        left.reason.localeCompare(right.reason) ||
        (left.fieldGroup ?? '').localeCompare(right.fieldGroup ?? ''),
    ),
  };
};
