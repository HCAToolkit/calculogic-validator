const BRIDGE_CONTRACT_VERSION = 'naming-occurrence-bridge.v1';
const ENRICHMENT_SIDECAR_VERSION = 'naming-occurrence-bridge-enrichment.v1';
const BRIDGE_SOURCE = 'calculogic-validator/naming';
const BRIDGE_PRODUCER_ID = 'naming-semantic-family-occurrence-bridge';
const SEMANTIC_EVIDENCE_SECTION_VERSION = 'naming-semantic-evidence-enrichment.v1';
const SEMANTIC_EVIDENCE_SECTION_PRODUCER_ID = 'naming-semantic-evidence-enrichment';
const FOLDER_LABEL_SECTION_VERSION = 'naming-folder-label-observation.v1';
const FOLDER_LABEL_SECTION_PRODUCER_ID = 'naming-folder-label-observation';
const IDENTITY_TUPLE_FIELDS = ['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress'];
// The `roleStatus` value shape approved for the section (bridge contract §6.2 `role` row, from the
// FileNamingMasterList role status vocabulary).
const ROLE_STATUS_VALUES = new Set(['active', 'deprecated', 'provisional']);

const NAMING_SEMANTIC_FIELDS = [
  'semanticName',
  'semanticFamily',
  'familyRoot',
  'familySubgroup',
  'ambiguityFlags',
  'splitFamilyFlags',
  'disambiguation',
  'semanticEvidenceKind',
  'familyRootQualification',
  'evidenceSource',
  'folderCompositionKind',
  'semanticQualifier',
  'structuralRoleToken',
  'compositionQualification',
  'compositionConfidence',
  'tokenOrder',
  'semanticContext',
  'semanticContextQualification',
  'semanticContextConfidence',
];

const toOptionalNonEmptyString = (value) => (typeof value === 'string' && value.length > 0 ? value : null);

const cloneStringArray = (value) =>
  Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.length > 0) : null;

const toSortedUniqueStrings = (value) =>
  Array.isArray(value)
    ? Array.from(new Set(value.filter((item) => typeof item === 'string' && item.length > 0))).sort((left, right) =>
        left.localeCompare(right),
      )
    : null;

const toOptionalNonNegativeInteger = (value) =>
  Number.isInteger(value) && value >= 0 ? value : null;

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toPathKey = (value) => toOptionalNonEmptyString(value);

const buildOccurrenceByPath = (occurrenceRecords) => {
  const occurrenceByPath = new Map();

  for (const occurrenceRecord of Array.isArray(occurrenceRecords) ? occurrenceRecords : []) {
    if (!occurrenceRecord || typeof occurrenceRecord !== 'object' || Array.isArray(occurrenceRecord)) {
      continue;
    }

    const repoRelativePath = toPathKey(occurrenceRecord.repoRelativePath) ?? toPathKey(occurrenceRecord.path);
    if (!repoRelativePath || occurrenceByPath.has(repoRelativePath)) {
      continue;
    }

    occurrenceByPath.set(repoRelativePath, occurrenceRecord);
  }

  return occurrenceByPath;
};

const copyNamingSemanticPayload = (observation) => {
  const payload = {};

  for (const field of NAMING_SEMANTIC_FIELDS) {
    if (field === 'ambiguityFlags' || field === 'splitFamilyFlags') {
      const clonedFlags = cloneStringArray(observation[field]);
      if (clonedFlags) {
        payload[field] = clonedFlags;
      }
      continue;
    }

    if (field === 'tokenOrder') {
      const clonedTokenOrder = cloneStringArray(observation.tokenOrder);
      if (clonedTokenOrder) {
        payload.tokenOrder = clonedTokenOrder;
      }
      continue;
    }

    if (field === 'disambiguation') {
      if (isPlainObject(observation.disambiguation)) {
        payload.disambiguation = {
          ...(toSortedUniqueStrings(observation.disambiguation.roleLikeFolderTokens)
            ? { roleLikeFolderTokens: toSortedUniqueStrings(observation.disambiguation.roleLikeFolderTokens) }
            : {}),
          ...(toSortedUniqueStrings(observation.disambiguation.roleLikeSemanticTokens)
            ? { roleLikeSemanticTokens: toSortedUniqueStrings(observation.disambiguation.roleLikeSemanticTokens) }
            : {}),
        };
        if (Object.keys(payload.disambiguation).length === 0) {
          delete payload.disambiguation;
        }
      }
      continue;
    }

    const fieldValue = toOptionalNonEmptyString(observation[field]);
    if (fieldValue) {
      payload[field] = fieldValue;
    }
  }

  return payload;
};

const toAddressAttachedObservation = ({
  semanticObservation,
  occurrenceRecord,
  addressProfileId,
  addressedSnapshotId,
}) => {
  const repoRelativePath =
    toPathKey(semanticObservation.repoRelativePath) ??
    toPathKey(occurrenceRecord.repoRelativePath) ??
    toPathKey(semanticObservation.path) ??
    toPathKey(occurrenceRecord.path);
  const occurrenceAddress =
    toOptionalNonEmptyString(occurrenceRecord.occurrenceAddress) ??
    toOptionalNonEmptyString(occurrenceRecord.address) ??
    toOptionalNonEmptyString(occurrenceRecord.addressPath);

  if (!addressProfileId || !addressedSnapshotId || !occurrenceAddress || !repoRelativePath) {
    return null;
  }

  return {
    addressProfileId,
    addressedSnapshotId,
    occurrenceAddress,
    repoRelativePath,
    path: toPathKey(semanticObservation.path) ?? repoRelativePath,
    ...(toOptionalNonEmptyString(occurrenceRecord.addressPath)
      ? { addressPath: occurrenceRecord.addressPath }
      : {}),
    ...(toOptionalNonEmptyString(occurrenceRecord.occurrenceType)
      ? { occurrenceType: occurrenceRecord.occurrenceType }
      : {}),
    ...copyNamingSemanticPayload(semanticObservation),
    ...(isPlainObject(semanticObservation.evidenceProvenance)
      ? { evidenceProvenance: { ...semanticObservation.evidenceProvenance } }
      : {}),
  };
};


const isKebabCaseString = (value) =>
  typeof value === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value);

const sortContractNotes = (notes) =>
  Array.from(
    new Map(
      notes
        .filter(
          (note) =>
            isPlainObject(note) &&
            isKebabCaseString(note.code) &&
            toOptionalNonEmptyString(note.message) &&
            note.source === 'naming',
        )
        .map((note) => [
          `${note.code}\u0000${note.message}\u0000${note.source}`,
          { code: note.code, message: note.message, source: 'naming' },
        ]),
    ).values(),
  ).sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      left.message.localeCompare(right.message) ||
      left.source.localeCompare(right.source),
  );

const toDisambiguationNotes = (disambiguation) => {
  if (!isPlainObject(disambiguation)) {
    return [];
  }

  const roleLikeFolderTokens = toSortedUniqueStrings(disambiguation.roleLikeFolderTokens);
  const roleLikeSemanticTokens = toSortedUniqueStrings(disambiguation.roleLikeSemanticTokens);

  return sortContractNotes([
    ...(roleLikeFolderTokens?.map((token) => ({
      code: 'role-like-folder-token',
      message: `Role-like folder token: ${token}`,
      source: 'naming',
    })) ?? []),
    ...(roleLikeSemanticTokens?.map((token) => ({
      code: 'role-like-semantic-token',
      message: `Role-like semantic token: ${token}`,
      source: 'naming',
    })) ?? []),
  ]);
};

const toEvidenceLimitNote = (note) => {
  if (!isPlainObject(note)) {
    return null;
  }

  if (isKebabCaseString(note.code) && toOptionalNonEmptyString(note.message) && note.source === 'naming') {
    return { code: note.code, message: note.message, source: 'naming' };
  }

  if (isKebabCaseString(note.noteType)) {
    const detail = toOptionalNonEmptyString(note.detail);
    return {
      code: note.noteType,
      message: detail ?? note.noteType,
      source: 'naming',
    };
  }

  return null;
};

const toNamingMetadataNotes = (semanticObservation) => {
  const notes = {};
  const disambiguationNotes = toDisambiguationNotes(semanticObservation.disambiguation);

  if (disambiguationNotes.length > 0) {
    notes.disambiguationNotes = disambiguationNotes;
  }

  const evidenceLimitNotes = Array.isArray(semanticObservation.evidenceLimitNotes)
    ? sortContractNotes(semanticObservation.evidenceLimitNotes.map(toEvidenceLimitNote).filter(Boolean))
    : [];

  if (evidenceLimitNotes.length > 0) {
    notes.evidenceLimitNotes = evidenceLimitNotes;
  }

  return notes;
};

const toEnrichmentRecord = ({ observation, semanticObservation, occurrenceRecord }) => {
  const enrichment = {
    addressProfileId: observation.addressProfileId,
    addressedSnapshotId: observation.addressedSnapshotId,
    occurrenceAddress: observation.occurrenceAddress,
  };

  const parentOccurrenceAddressSource = occurrenceRecord.parentOccurrenceAddress ?? occurrenceRecord.parentAddressPath;
  if (parentOccurrenceAddressSource === null) {
    enrichment.parentOccurrenceAddress = null;
  } else {
    const parentOccurrenceAddress = toOptionalNonEmptyString(parentOccurrenceAddressSource);
    if (parentOccurrenceAddress) {
      enrichment.parentOccurrenceAddress = parentOccurrenceAddress;
    }
  }

  const occurrenceDepth = toOptionalNonNegativeInteger(occurrenceRecord.occurrenceDepth ?? occurrenceRecord.depth);
  if (occurrenceDepth !== null) {
    enrichment.occurrenceDepth = occurrenceDepth;
  }

  const occurrenceOrderIndex = toOptionalNonNegativeInteger(
    occurrenceRecord.occurrenceOrderIndex ?? occurrenceRecord.orderIndex,
  );
  if (occurrenceOrderIndex !== null) {
    enrichment.occurrenceOrderIndex = occurrenceOrderIndex;
  }

  Object.assign(enrichment, toNamingMetadataNotes(semanticObservation));

  return Object.keys(enrichment).length > 3 ? enrichment : null;
};

const toMissingIdentityDiagnostic = ({ semanticObservation, reason }) => ({
  diagnosticType: 'missing-occurrence-identity',
  reason,
  repoRelativePath: toPathKey(semanticObservation.repoRelativePath) ?? toPathKey(semanticObservation.path) ?? null,
  path: toPathKey(semanticObservation.path) ?? null,
  semanticName: toOptionalNonEmptyString(semanticObservation.semanticName) ?? null,
});

const toInvalidAddressedNamespaceDiagnostics = ({ addressProfileId, addressedSnapshotId }) => {
  const diagnostics = [];

  if (!addressProfileId) {
    diagnostics.push({
      diagnosticType: 'invalid-addressed-namespace',
      reason: 'missing-address-profile-id',
      addressProfileId: null,
      addressedSnapshotId: addressedSnapshotId ?? null,
    });
  }

  if (!addressedSnapshotId) {
    diagnostics.push({
      diagnosticType: 'invalid-addressed-namespace',
      reason: 'missing-addressed-snapshot-id',
      addressProfileId: addressProfileId ?? null,
      addressedSnapshotId: null,
    });
  }

  return diagnostics;
};

const compareIdentityTuples = (left, right) =>
  left.addressProfileId.localeCompare(right.addressProfileId) ||
  left.addressedSnapshotId.localeCompare(right.addressedSnapshotId) ||
  left.occurrenceAddress.localeCompare(right.occurrenceAddress);

const toValidSemanticTokens = (value) =>
  Array.isArray(value) && value.length > 0 && value.every((token) => toOptionalNonEmptyString(token))
    ? [...value]
    : null;

const toValidRoleFacts = (sourceRecord) =>
  toOptionalNonEmptyString(sourceRecord.role) &&
  toOptionalNonEmptyString(sourceRecord.roleCategory) &&
  ROLE_STATUS_VALUES.has(sourceRecord.roleStatus)
    ? { role: sourceRecord.role, roleCategory: sourceRecord.roleCategory, roleStatus: sourceRecord.roleStatus }
    : null;

const hasAnyRoleFact = (sourceRecord) =>
  sourceRecord.role !== undefined || sourceRecord.roleCategory !== undefined || sourceRecord.roleStatus !== undefined;

const countByKey = (values) => {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
};

// Contract §4.4 and §4.5. Enrichment source records are path-keyed Naming facts. The producer
// correlates each one with the Naming source observation it describes, before identity attachment
// filters any observation out, and then with the v1 file observation that source observation became.
// The section record carries that observation's identity tuple, which is the only association
// consumers may use. A path that matches more than one source observation, or more than one source
// record, is ambiguous, so it yields no record instead of a guessed one.
const toSemanticEvidenceEnrichmentSection = ({ sourceRecords, sourceObservations, emittedObservationBySource }) => {
  const records = [];
  const diagnostics = [];
  const validSourceRecords = sourceRecords.filter(
    (sourceRecord) => isPlainObject(sourceRecord) && toPathKey(sourceRecord.path),
  );
  const sourcePathCounts = countByKey(validSourceRecords.map((sourceRecord) => sourceRecord.path));
  const sourceObservationsByPath = new Map();
  for (const sourceObservation of sourceObservations) {
    if (!isPlainObject(sourceObservation)) continue;
    const paths = new Set([toPathKey(sourceObservation.path), toPathKey(sourceObservation.repoRelativePath)].filter(Boolean));
    for (const path of paths) {
      if (!sourceObservationsByPath.has(path)) sourceObservationsByPath.set(path, []);
      sourceObservationsByPath.get(path).push(sourceObservation);
    }
  }
  const reportedPaths = new Set();

  for (const sourceRecord of validSourceRecords) {
    const repoRelativePath = sourceRecord.path;
    const matchingSourceObservations = sourceObservationsByPath.get(repoRelativePath) ?? [];
    if (matchingSourceObservations.length === 0) {
      continue;
    }

    const ambiguityReason = (sourcePathCounts.get(repoRelativePath) ?? 0) > 1
      ? 'duplicate-source-path'
      : matchingSourceObservations.length > 1
        ? 'ambiguous-source-observation'
        : null;
    if (ambiguityReason) {
      if (!reportedPaths.has(repoRelativePath)) {
        reportedPaths.add(repoRelativePath);
        diagnostics.push({ diagnosticType: 'unattached-enrichment-source', reason: ambiguityReason, repoRelativePath });
      }
      continue;
    }

    const observation = emittedObservationBySource.get(matchingSourceObservations[0]);
    if (observation?.occurrenceType !== 'file') {
      continue;
    }

    const semanticTokens = toValidSemanticTokens(sourceRecord.semanticTokens);
    if (!semanticTokens && sourceRecord.semanticTokens !== undefined) {
      diagnostics.push({ diagnosticType: 'invalid-enrichment-field-group', fieldGroup: 'semantic-tokens', repoRelativePath });
    }

    const roleFacts = toValidRoleFacts(sourceRecord);
    if (!roleFacts && hasAnyRoleFact(sourceRecord)) {
      diagnostics.push({ diagnosticType: 'invalid-enrichment-field-group', fieldGroup: 'role-facts', repoRelativePath });
    }

    if (!semanticTokens && !roleFacts) {
      continue;
    }

    records.push({
      addressProfileId: observation.addressProfileId,
      addressedSnapshotId: observation.addressedSnapshotId,
      occurrenceAddress: observation.occurrenceAddress,
      repoRelativePath,
      ...(semanticTokens ? { semanticTokens } : {}),
      ...(roleFacts ?? {}),
    });
  }

  if (records.length === 0) {
    return null;
  }

  return {
    contractVersion: SEMANTIC_EVIDENCE_SECTION_VERSION,
    producerId: SEMANTIC_EVIDENCE_SECTION_PRODUCER_ID,
    source: BRIDGE_SOURCE,
    identityTupleFields: [...IDENTITY_TUPLE_FIELDS],
    recordCount: records.length,
    records: records.sort(compareIdentityTuples),
    ...(diagnostics.length > 0
      ? {
          diagnostics: diagnostics.sort(
            (left, right) =>
              left.repoRelativePath.localeCompare(right.repoRelativePath) ||
              left.diagnosticType.localeCompare(right.diagnosticType) ||
              (left.reason ?? left.fieldGroup).localeCompare(right.reason ?? right.fieldGroup),
          ),
        }
      : {}),
  };
};

// Contract §4.6. Records come from the addressed folder occurrences themselves, so identity exists by
// construction and is never recovered from a path or depth. Every folder occurrence Structural
// Addressing supplies is covered, scope roots included; nothing is manufactured for a root that is
// not an occurrence. The label interpreter sees only the label.
const toFolderLabelObservationSection = ({ occurrenceRecords, addressProfileId, addressedSnapshotId, interpretFolderLabel }) => {
  const records = [];
  const diagnostics = [];

  for (const occurrenceRecord of Array.isArray(occurrenceRecords) ? occurrenceRecords : []) {
    if (!isPlainObject(occurrenceRecord) || occurrenceRecord.occurrenceType !== 'folder') {
      continue;
    }

    const repoRelativePath = toPathKey(occurrenceRecord.repoRelativePath) ?? toPathKey(occurrenceRecord.path);
    const occurrenceAddress =
      toOptionalNonEmptyString(occurrenceRecord.occurrenceAddress) ??
      toOptionalNonEmptyString(occurrenceRecord.address) ??
      toOptionalNonEmptyString(occurrenceRecord.addressPath);
    if (!occurrenceAddress) {
      diagnostics.push({
        diagnosticType: 'missing-occurrence-identity',
        reason: 'missing-occurrence-address',
        repoRelativePath: repoRelativePath ?? null,
      });
      continue;
    }

    const label = toOptionalNonEmptyString(occurrenceRecord.name) ?? toOptionalNonEmptyString(occurrenceRecord.actualName) ?? '';
    records.push({
      addressProfileId,
      addressedSnapshotId,
      occurrenceAddress,
      ...(repoRelativePath ? { repoRelativePath } : {}),
      ...interpretFolderLabel(label),
    });
  }

  if (records.length === 0) {
    return null;
  }

  return {
    contractVersion: FOLDER_LABEL_SECTION_VERSION,
    producerId: FOLDER_LABEL_SECTION_PRODUCER_ID,
    source: BRIDGE_SOURCE,
    identityTupleFields: [...IDENTITY_TUPLE_FIELDS],
    recordCount: records.length,
    records: records.sort(compareIdentityTuples),
    ...(diagnostics.length > 0
      ? { diagnostics: diagnostics.sort((left, right) => (left.repoRelativePath ?? '').localeCompare(right.repoRelativePath ?? '')) }
      : {}),
  };
};

export const createNamingOccurrenceBridgePayload = ({
  namingSemanticFamilyBridge = {},
  addressedOccurrenceNamespace = {},
  namingSemanticEvidenceEnrichment,
  interpretFolderLabel,
  sourceReportRef,
  sourceSnapshotRef,
} = {}) => {
  const sourceObservations = Array.isArray(namingSemanticFamilyBridge.observations)
    ? namingSemanticFamilyBridge.observations
    : [];
  const addressProfileId = toOptionalNonEmptyString(addressedOccurrenceNamespace.addressProfileId);
  const addressedSnapshotId = toOptionalNonEmptyString(addressedOccurrenceNamespace.addressedSnapshotId);
  const occurrenceByPath = buildOccurrenceByPath(addressedOccurrenceNamespace.occurrenceRecords);

  const observations = [];
  const emittedObservationBySource = new Map();
  const enrichedObservations = [];
  const diagnostics = toInvalidAddressedNamespaceDiagnostics({ addressProfileId, addressedSnapshotId });
  const hasValidAddressedNamespace = diagnostics.length === 0;

  if (hasValidAddressedNamespace) {
    for (const semanticObservation of sourceObservations) {
      if (!semanticObservation || typeof semanticObservation !== 'object' || Array.isArray(semanticObservation)) {
        continue;
      }

      const pathKey = toPathKey(semanticObservation.repoRelativePath) ?? toPathKey(semanticObservation.path);
      if (!pathKey) {
        diagnostics.push(toMissingIdentityDiagnostic({ semanticObservation, reason: 'missing-path-key' }));
        continue;
      }

      const occurrenceRecord = occurrenceByPath.get(pathKey);
      if (!occurrenceRecord) {
        diagnostics.push(toMissingIdentityDiagnostic({ semanticObservation, reason: 'unmatched-occurrence-record' }));
        continue;
      }

      const observation = toAddressAttachedObservation({
        semanticObservation,
        occurrenceRecord,
        addressProfileId,
        addressedSnapshotId,
      });

      if (!observation) {
        diagnostics.push(toMissingIdentityDiagnostic({ semanticObservation, reason: 'incomplete-occurrence-identity' }));
        continue;
      }

      observations.push(observation);
      emittedObservationBySource.set(semanticObservation, observation);

      const enrichedObservation = toEnrichmentRecord({ observation, semanticObservation, occurrenceRecord });
      if (enrichedObservation) {
        enrichedObservations.push(enrichedObservation);
      }
    }
  }

  const semanticEvidenceEnrichmentSection =
    hasValidAddressedNamespace && Array.isArray(namingSemanticEvidenceEnrichment?.records)
      ? toSemanticEvidenceEnrichmentSection({
          sourceRecords: namingSemanticEvidenceEnrichment.records,
          sourceObservations,
          emittedObservationBySource,
        })
      : null;

  const folderLabelObservationSection =
    hasValidAddressedNamespace && typeof interpretFolderLabel === 'function'
      ? toFolderLabelObservationSection({
          occurrenceRecords: addressedOccurrenceNamespace.occurrenceRecords,
          addressProfileId,
          addressedSnapshotId,
          interpretFolderLabel,
        })
      : null;

  return {
    bridgeContractVersion: BRIDGE_CONTRACT_VERSION,
    bridgeSource: BRIDGE_SOURCE,
    bridgeProducerId: BRIDGE_PRODUCER_ID,
    addressProfileId: addressProfileId ?? null,
    addressedSnapshotId: addressedSnapshotId ?? null,
    ...(sourceReportRef !== undefined ? { sourceReportRef } : {}),
    ...(sourceSnapshotRef !== undefined ? { sourceSnapshotRef } : {}),
    compatibility: {
      pathKeyedSemanticPayloadPreserved: true,
      temporaryCompatibilityPathField: 'path',
      temporaryDebugAddressPathField: 'addressPath',
      addressAttachedObservationsOmitMissingIdentity: true,
      addressedNamespaceValid: hasValidAddressedNamespace,
      invalidAddressedNamespaceDiagnosticCount: diagnostics.filter(
        (diagnostic) => diagnostic.diagnosticType === 'invalid-addressed-namespace',
      ).length,
      sourceObservationCount: sourceObservations.length,
      addressAttachedObservationCount: observations.length,
      missingIdentityDiagnosticCount: diagnostics.filter(
        (diagnostic) => diagnostic.diagnosticType === 'missing-occurrence-identity',
      ).length,
      totalDiagnosticCount: diagnostics.length,
      enrichmentSidecarVersion: ENRICHMENT_SIDECAR_VERSION,
      enrichmentObservationCount: enrichedObservations.length,
    },
    observations: observations.sort((left, right) =>
      left.addressProfileId.localeCompare(right.addressProfileId) ||
      left.addressedSnapshotId.localeCompare(right.addressedSnapshotId) ||
      left.occurrenceAddress.localeCompare(right.occurrenceAddress) ||
      left.repoRelativePath.localeCompare(right.repoRelativePath),
    ),
    ...(enrichedObservations.length > 0
      ? {
          occurrenceContextEnrichment: {
            enrichmentContractVersion: ENRICHMENT_SIDECAR_VERSION,
            identityTupleFields: ['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress'],
            // Sidecar route preserves v1 payload semantics while keeping enrichment safely ignorable by Tree v1 intake.
            enrichedObservations: enrichedObservations.sort((left, right) =>
              left.addressProfileId.localeCompare(right.addressProfileId) ||
              left.addressedSnapshotId.localeCompare(right.addressedSnapshotId) ||
              left.occurrenceAddress.localeCompare(right.occurrenceAddress),
            ),
          },
        }
      : {}),
    ...(semanticEvidenceEnrichmentSection ? { namingSemanticEvidenceEnrichment: semanticEvidenceEnrichmentSection } : {}),
    ...(folderLabelObservationSection ? { namingFolderLabelObservations: folderLabelObservationSection } : {}),
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
  };
};
