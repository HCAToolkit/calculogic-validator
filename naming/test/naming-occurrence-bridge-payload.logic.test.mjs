import test from 'node:test';
import assert from 'node:assert/strict';
import { createNamingOccurrenceBridgePayload } from '../src/naming-occurrence-bridge-payload.logic.mjs';

const treeOwnedFields = [
  'structuralHome',
  'semanticHome',
  'folderKind',
  'repoShape',
  'placement',
  'placementConfidence',
  'scatterStatus',
  'clusterStatus',
  'driftStatus',
  'severity',
  'verdict',
  'parentStructuralHome',
  'childStructuralHome',
  'rootLanePlacement',
];

test('createNamingOccurrenceBridgePayload creates a versioned Naming bridge envelope', () => {
  const result = createNamingOccurrenceBridgePayload({
    namingSemanticFamilyBridge: { observations: [] },
    addressedOccurrenceNamespace: {
      addressProfileId: 'tree-codebase',
      addressedSnapshotId: 'snapshot-001',
      occurrenceRecords: [],
    },
    sourceReportRef: { reportId: 'naming-report-001' },
    sourceSnapshotRef: { snapshotId: 'source-snapshot-001' },
  });

  assert.equal(result.bridgeContractVersion, 'naming-occurrence-bridge.v1');
  assert.equal(result.bridgeSource, 'calculogic-validator/naming');
  assert.equal(result.bridgeProducerId, 'naming-semantic-family-occurrence-bridge');
  assert.equal(result.addressProfileId, 'tree-codebase');
  assert.equal(result.addressedSnapshotId, 'snapshot-001');
  assert.deepEqual(result.sourceReportRef, { reportId: 'naming-report-001' });
  assert.deepEqual(result.sourceSnapshotRef, { snapshotId: 'source-snapshot-001' });
  assert.deepEqual(result.observations, []);
  assert.equal(result.compatibility.pathKeyedSemanticPayloadPreserved, true);
  assert.equal(result.compatibility.addressedNamespaceValid, true);
  assert.equal(result.compatibility.invalidAddressedNamespaceDiagnosticCount, 0);
  assert.equal(result.addressProfileId, 'tree-codebase');
  assert.equal(result.addressedSnapshotId, 'snapshot-001');
});


test('createNamingOccurrenceBridgePayload reports missing addressProfileId as an invalid namespace', () => {
  const result = createNamingOccurrenceBridgePayload({
    namingSemanticFamilyBridge: {
      observations: [{ path: 'src/app.logic.mjs', semanticName: 'app', semanticFamily: 'app', familyRoot: 'app' }],
    },
    addressedOccurrenceNamespace: {
      addressedSnapshotId: 'snapshot-001',
      occurrenceRecords: [{ occurrenceAddress: 'A.1', addressPath: 'A.1', path: 'src/app.logic.mjs', occurrenceType: 'file' }],
    },
  });

  assert.equal(result.addressProfileId, null);
  assert.equal(result.addressedSnapshotId, 'snapshot-001');
  assert.deepEqual(result.observations, []);
  assert.equal(result.compatibility.addressedNamespaceValid, false);
  assert.equal(result.compatibility.invalidAddressedNamespaceDiagnosticCount, 1);
  assert.equal(result.compatibility.missingIdentityDiagnosticCount, 0);
  assert.equal(result.compatibility.totalDiagnosticCount, 1);
  assert.deepEqual(result.diagnostics, [
    {
      diagnosticType: 'invalid-addressed-namespace',
      reason: 'missing-address-profile-id',
      addressProfileId: null,
      addressedSnapshotId: 'snapshot-001',
    },
  ]);
});

test('createNamingOccurrenceBridgePayload reports missing addressedSnapshotId as an invalid namespace', () => {
  const result = createNamingOccurrenceBridgePayload({
    namingSemanticFamilyBridge: {
      observations: [{ path: 'src/app.logic.mjs', semanticName: 'app', semanticFamily: 'app', familyRoot: 'app' }],
    },
    addressedOccurrenceNamespace: {
      addressProfileId: 'tree-codebase',
      occurrenceRecords: [{ occurrenceAddress: 'A.1', addressPath: 'A.1', path: 'src/app.logic.mjs', occurrenceType: 'file' }],
    },
  });

  assert.equal(result.addressProfileId, 'tree-codebase');
  assert.equal(result.addressedSnapshotId, null);
  assert.deepEqual(result.observations, []);
  assert.equal(result.compatibility.addressedNamespaceValid, false);
  assert.equal(result.compatibility.invalidAddressedNamespaceDiagnosticCount, 1);
  assert.equal(result.compatibility.totalDiagnosticCount, 1);
  assert.deepEqual(result.diagnostics, [
    {
      diagnosticType: 'invalid-addressed-namespace',
      reason: 'missing-addressed-snapshot-id',
      addressProfileId: 'tree-codebase',
      addressedSnapshotId: null,
    },
  ]);
});

test('createNamingOccurrenceBridgePayload reports both missing namespace IDs and keeps observations empty', () => {
  const result = createNamingOccurrenceBridgePayload({
    namingSemanticFamilyBridge: {
      observations: [{ path: 'src/app.logic.mjs', semanticName: 'app', semanticFamily: 'app', familyRoot: 'app' }],
    },
    addressedOccurrenceNamespace: {
      occurrenceRecords: [{ occurrenceAddress: 'A.1', addressPath: 'A.1', path: 'src/app.logic.mjs', occurrenceType: 'file' }],
    },
  });

  assert.equal(result.addressProfileId, null);
  assert.equal(result.addressedSnapshotId, null);
  assert.deepEqual(result.observations, []);
  assert.equal(result.compatibility.addressedNamespaceValid, false);
  assert.equal(result.compatibility.invalidAddressedNamespaceDiagnosticCount, 2);
  assert.equal(result.compatibility.missingIdentityDiagnosticCount, 0);
  assert.equal(result.compatibility.totalDiagnosticCount, 2);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.reason), [
    'missing-address-profile-id',
    'missing-addressed-snapshot-id',
  ]);
});

test('createNamingOccurrenceBridgePayload attaches full occurrence identity and preserves Naming semantic payloads', () => {
  const result = createNamingOccurrenceBridgePayload({
    namingSemanticFamilyBridge: {
      observations: [
        {
          path: 'calculogic-validator/naming/src/naming-semantic-family-bridge-projection.logic.mjs',
          semanticName: 'naming-semantic-family-bridge-projection',
          semanticFamily: 'naming-semantic-family',
          familyRoot: 'naming',
          familySubgroup: 'semantic-family',
          ambiguityFlags: ['family-boundary-heuristic'],
          splitFamilyFlags: ['family-root-observed-multiple-families'],
        },
      ],
    },
    addressedOccurrenceNamespace: {
      addressProfileId: 'tree-codebase',
      addressedSnapshotId: 'snapshot-001',
      occurrenceRecords: [
        {
          occurrenceAddress: 'A.B.1',
          addressPath: 'A.B.1',
          path: 'calculogic-validator/naming/src/naming-semantic-family-bridge-projection.logic.mjs',
          occurrenceType: 'file',
        },
      ],
    },
  });

  assert.deepEqual(result.observations, [
    {
      addressProfileId: 'tree-codebase',
      addressedSnapshotId: 'snapshot-001',
      occurrenceAddress: 'A.B.1',
      repoRelativePath: 'calculogic-validator/naming/src/naming-semantic-family-bridge-projection.logic.mjs',
      path: 'calculogic-validator/naming/src/naming-semantic-family-bridge-projection.logic.mjs',
      addressPath: 'A.B.1',
      occurrenceType: 'file',
      semanticName: 'naming-semantic-family-bridge-projection',
      semanticFamily: 'naming-semantic-family',
      familyRoot: 'naming',
      familySubgroup: 'semantic-family',
      ambiguityFlags: ['family-boundary-heuristic'],
      splitFamilyFlags: ['family-root-observed-multiple-families'],
    },
  ]);
});

test('createNamingOccurrenceBridgePayload makes missing or unmatched occurrence identity visible', () => {
  const result = createNamingOccurrenceBridgePayload({
    namingSemanticFamilyBridge: {
      observations: [
        { path: 'src/missing.logic.mjs', semanticName: 'missing', semanticFamily: 'missing', familyRoot: 'missing' },
        { path: 'src/incomplete.logic.mjs', semanticName: 'incomplete', semanticFamily: 'incomplete', familyRoot: 'incomplete' },
      ],
    },
    addressedOccurrenceNamespace: {
      addressProfileId: 'tree-codebase',
      addressedSnapshotId: 'snapshot-001',
      occurrenceRecords: [{ path: 'src/incomplete.logic.mjs', occurrenceType: 'file' }],
    },
  });

  assert.deepEqual(result.observations, []);
  assert.equal(result.compatibility.addressAttachedObservationsOmitMissingIdentity, true);
  assert.equal(result.compatibility.missingIdentityDiagnosticCount, 2);
  assert.equal(result.compatibility.totalDiagnosticCount, 2);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.reason), [
    'unmatched-occurrence-record',
    'incomplete-occurrence-identity',
  ]);
});

test('createNamingOccurrenceBridgePayload does not emit Tree-owned conclusion fields', () => {
  const result = createNamingOccurrenceBridgePayload({
    namingSemanticFamilyBridge: {
      observations: [
        {
          path: 'src/app.logic.mjs',
          semanticName: 'app',
          semanticFamily: 'app',
          familyRoot: 'app',
          structuralHome: 'src',
          semanticHome: 'app',
          folderKind: 'semantic',
          placementConfidence: 'high',
          severity: 'warning',
          verdict: 'drift',
        },
      ],
    },
    addressedOccurrenceNamespace: {
      addressProfileId: 'tree-codebase',
      addressedSnapshotId: 'snapshot-001',
      occurrenceRecords: [{ occurrenceAddress: 'A.1', addressPath: 'A.1', path: 'src/app.logic.mjs', occurrenceType: 'file' }],
    },
  });

  for (const observation of result.observations) {
    for (const field of treeOwnedFields) {
      assert.equal(Object.hasOwn(observation, field), false, `${field} must not be emitted`);
    }
  }
});

const deferredOrRejectedEnrichmentFields = [
  'lineageKey',
  'contextPartitionKey',
  'siblingContextKey',
  'subtreeContextKey',
  'semanticTokens',
  'role',
  'evidenceStrength',
  'noteType',
  'token',
  'detail',
  'severity',
  'confidence',
  'finding',
  'structuralHome',
  'semanticHome',
  'placement',
];

const collectObjectKeys = (value) => {
  if (!value || typeof value !== 'object') {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectObjectKeys);
  }

  return [
    ...Object.keys(value),
    ...Object.values(value).flatMap(collectObjectKeys),
  ];
};

test('createNamingOccurrenceBridgePayload emits explicitly versioned additive enrichment sidecar without changing v1 observations', () => {
  const result = createNamingOccurrenceBridgePayload({
    namingSemanticFamilyBridge: {
      observations: [
        {
          path: 'src/host/app.logic.mjs',
          semanticName: 'app',
          semanticFamily: 'app',
          familyRoot: 'app',
          disambiguation: {
            roleLikeFolderTokens: ['host', 'host'],
            roleLikeSemanticTokens: ['wiring', 'host'],
          },
          evidenceLimitNotes: [
            { code: 'z-limit', message: 'Z limit', source: 'naming' },
            { code: 'naming-source-bounded', message: 'Canonical finding only', source: 'naming' },
            { code: 'naming-source-bounded', message: 'Canonical finding only', source: 'naming' },
            { noteType: 'legacy-limit-note', detail: 'Legacy deterministic detail' },
            { noteType: 'legacy-empty-detail' },
            { code: 'tree-policy', message: 'Tree policy conclusion', source: 'tree' },
            { noteType: 'badLegacy', detail: 'invalid code' },
            { severity: 'warning', confidence: 'high', detail: 'must not emit' },
          ],
        },
      ],
    },
    addressedOccurrenceNamespace: {
      addressProfileId: 'tree-codebase',
      addressedSnapshotId: 'snapshot-001',
      occurrenceRecords: [
        {
          occurrenceAddress: 'A.1.1',
          addressPath: 'A.1.1',
          parentAddressPath: 'A.1',
          path: 'src/host/app.logic.mjs',
          occurrenceType: 'file',
          depth: 2,
          orderIndex: 7,
        },
      ],
    },
  });

  assert.equal(result.bridgeContractVersion, 'naming-occurrence-bridge.v1');
  assert.equal(result.compatibility.enrichmentSidecarVersion, 'naming-occurrence-bridge-enrichment.v1');
  assert.equal(result.occurrenceContextEnrichment.enrichmentContractVersion, 'naming-occurrence-bridge-enrichment.v1');
  assert.deepEqual(result.occurrenceContextEnrichment.identityTupleFields, [
    'addressProfileId',
    'addressedSnapshotId',
    'occurrenceAddress',
  ]);
  assert.deepEqual(result.observations, [
    {
      addressProfileId: 'tree-codebase',
      addressedSnapshotId: 'snapshot-001',
      occurrenceAddress: 'A.1.1',
      repoRelativePath: 'src/host/app.logic.mjs',
      path: 'src/host/app.logic.mjs',
      addressPath: 'A.1.1',
      occurrenceType: 'file',
      semanticName: 'app',
      semanticFamily: 'app',
      familyRoot: 'app',
      disambiguation: {
        roleLikeFolderTokens: ['host'],
        roleLikeSemanticTokens: ['host', 'wiring'],
      },
    },
  ]);
  assert.deepEqual(result.occurrenceContextEnrichment.enrichedObservations, [
    {
      addressProfileId: 'tree-codebase',
      addressedSnapshotId: 'snapshot-001',
      occurrenceAddress: 'A.1.1',
      parentOccurrenceAddress: 'A.1',
      occurrenceDepth: 2,
      occurrenceOrderIndex: 7,
      disambiguationNotes: [
        { code: 'role-like-folder-token', message: 'Role-like folder token: host', source: 'naming' },
        { code: 'role-like-semantic-token', message: 'Role-like semantic token: host', source: 'naming' },
        { code: 'role-like-semantic-token', message: 'Role-like semantic token: wiring', source: 'naming' },
      ],
      evidenceLimitNotes: [
        { code: 'legacy-empty-detail', message: 'legacy-empty-detail', source: 'naming' },
        { code: 'legacy-limit-note', message: 'Legacy deterministic detail', source: 'naming' },
        { code: 'naming-source-bounded', message: 'Canonical finding only', source: 'naming' },
        { code: 'z-limit', message: 'Z limit', source: 'naming' },
      ],
    },
  ]);

  const emittedEnrichmentKeys = collectObjectKeys(result.occurrenceContextEnrichment);
  for (const field of deferredOrRejectedEnrichmentFields) {
    assert.equal(emittedEnrichmentKeys.includes(field), false, `${field} must not be emitted`);
  }
});

test('createNamingOccurrenceBridgePayload omits invalid or unavailable enrichment fields while preserving occurrence identity', () => {
  const result = createNamingOccurrenceBridgePayload({
    namingSemanticFamilyBridge: {
      observations: [
        { path: 'src/root.logic.mjs', semanticName: 'root', semanticFamily: 'root', familyRoot: 'root' },
        { path: 'src/child.logic.mjs', semanticName: 'child', semanticFamily: 'child', familyRoot: 'child' },
      ],
    },
    addressedOccurrenceNamespace: {
      addressProfileId: 'tree-codebase',
      addressedSnapshotId: 'snapshot-001',
      occurrenceRecords: [
        {
          occurrenceAddress: 'A',
          addressPath: 'A',
          parentAddressPath: null,
          path: 'src/root.logic.mjs',
          depth: 0,
          orderIndex: 0,
        },
        {
          occurrenceAddress: 'A.1',
          addressPath: 'A.1',
          path: 'src/child.logic.mjs',
          depth: -1,
          orderIndex: 1.5,
        },
      ],
    },
  });

  assert.deepEqual(result.occurrenceContextEnrichment.enrichedObservations, [
    {
      addressProfileId: 'tree-codebase',
      addressedSnapshotId: 'snapshot-001',
      occurrenceAddress: 'A',
      parentOccurrenceAddress: null,
      occurrenceDepth: 0,
      occurrenceOrderIndex: 0,
    },
  ]);
  assert.deepEqual(
    result.observations.map(({ addressProfileId, addressedSnapshotId, occurrenceAddress }) => ({
      addressProfileId,
      addressedSnapshotId,
      occurrenceAddress,
    })),
    [
      { addressProfileId: 'tree-codebase', addressedSnapshotId: 'snapshot-001', occurrenceAddress: 'A' },
      { addressProfileId: 'tree-codebase', addressedSnapshotId: 'snapshot-001', occurrenceAddress: 'A.1' },
    ],
  );
});

test('createNamingOccurrenceBridgePayload keeps same-family nested observations distinct by occurrence identity', () => {
  const result = createNamingOccurrenceBridgePayload({
    namingSemanticFamilyBridge: {
      observations: [
        { path: 'src/alpha/shared.logic.mjs', semanticName: 'shared', semanticFamily: 'shared-runtime', familyRoot: 'shared' },
        { path: 'src/alpha/nested/shared.logic.mjs', semanticName: 'shared', semanticFamily: 'shared-runtime', familyRoot: 'shared' },
      ],
    },
    addressedOccurrenceNamespace: {
      addressProfileId: 'tree-codebase',
      addressedSnapshotId: 'snapshot-001',
      occurrenceRecords: [
        { occurrenceAddress: 'A.1', addressPath: 'A.1', path: 'src/alpha/shared.logic.mjs', parentAddressPath: 'A', depth: 2, orderIndex: 3 },
        { occurrenceAddress: 'A.1.1', addressPath: 'A.1.1', path: 'src/alpha/nested/shared.logic.mjs', parentAddressPath: 'A.1', depth: 3, orderIndex: 4 },
      ],
    },
  });

  assert.deepEqual(
    result.occurrenceContextEnrichment.enrichedObservations.map((observation) => [
      observation.occurrenceAddress,
      observation.parentOccurrenceAddress,
      observation.occurrenceDepth,
      observation.occurrenceOrderIndex,
    ]),
    [
      ['A.1', 'A', 2, 3],
      ['A.1.1', 'A.1', 3, 4],
    ],
  );
  assert.equal(new Set(result.observations.map((observation) => observation.semanticFamily)).size, 1);
  assert.equal(new Set(result.observations.map((observation) => observation.occurrenceAddress)).size, 2);
});

// Naming semantic-evidence enrichment section (bridge contract §4.4, §4.5; #87).

const enrichmentNamespace = {
  addressProfileId: 'tree-codebase',
  addressedSnapshotId: 'snapshot-001',
  occurrenceRecords: [
    { occurrenceAddress: 'A.2', addressPath: 'A.2', path: 'src/zeta-alpha.logic.mjs', occurrenceType: 'file' },
    { occurrenceAddress: 'A.1', addressPath: 'A.1', path: 'src/build-surface.logic.mjs', occurrenceType: 'file' },
    { occurrenceAddress: 'A', addressPath: 'A', path: 'naming-src', occurrenceType: 'folder' },
  ],
};

const enrichmentSemanticBridge = {
  observations: [
    { path: 'src/zeta-alpha.logic.mjs', semanticName: 'zeta-alpha', semanticFamily: 'zeta', familyRoot: 'zeta', familySubgroup: 'alpha' },
    { path: 'src/build-surface.logic.mjs', semanticName: 'build-surface', semanticFamily: 'build', familyRoot: 'build', familySubgroup: 'surface' },
    {
      path: 'naming-src',
      semanticName: 'naming',
      semanticFamily: 'naming',
      familyRoot: 'naming',
      semanticEvidenceKind: 'folder-semantic-structural-composition',
    },
  ],
};

const roleFacts = { role: 'logic', roleCategory: 'concern-core', roleStatus: 'active' };

const enrichmentSource = (records) => ({ records });

const createEnrichedPayload = (records, overrides = {}) =>
  createNamingOccurrenceBridgePayload({
    namingSemanticFamilyBridge: enrichmentSemanticBridge,
    addressedOccurrenceNamespace: enrichmentNamespace,
    namingSemanticEvidenceEnrichment: enrichmentSource(records),
    ...overrides,
  });

test('enrichment section: versioned envelope, tuple-sorted records, file observations only', () => {
  const result = createEnrichedPayload([
    { path: 'src/zeta-alpha.logic.mjs', semanticTokens: ['zeta', 'alpha'], ...roleFacts },
    { path: 'src/build-surface.logic.mjs', semanticTokens: ['build', 'surface'] },
    // A source record for a folder observation's path must never enrich it.
    { path: 'naming-src', semanticTokens: ['naming', 'src'] },
  ]);

  assert.deepEqual(result.namingSemanticEvidenceEnrichment, {
    contractVersion: 'naming-semantic-evidence-enrichment.v1',
    producerId: 'naming-semantic-evidence-enrichment',
    source: 'calculogic-validator/naming',
    identityTupleFields: ['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress'],
    recordCount: 2,
    records: [
      {
        addressProfileId: 'tree-codebase',
        addressedSnapshotId: 'snapshot-001',
        occurrenceAddress: 'A.1',
        repoRelativePath: 'src/build-surface.logic.mjs',
        semanticTokens: ['build', 'surface'],
      },
      {
        addressProfileId: 'tree-codebase',
        addressedSnapshotId: 'snapshot-001',
        occurrenceAddress: 'A.2',
        repoRelativePath: 'src/zeta-alpha.logic.mjs',
        semanticTokens: ['zeta', 'alpha'],
        ...roleFacts,
      },
    ],
  });
});

test('enrichment section leaves every other payload field byte-identical and carries no Tree conclusions', () => {
  const withoutSection = createNamingOccurrenceBridgePayload({
    namingSemanticFamilyBridge: enrichmentSemanticBridge,
    addressedOccurrenceNamespace: enrichmentNamespace,
  });
  const withSection = createEnrichedPayload([
    { path: 'src/zeta-alpha.logic.mjs', semanticTokens: ['zeta', 'alpha'], ...roleFacts },
  ]);

  assert.equal('namingSemanticEvidenceEnrichment' in withoutSection, false);
  const { namingSemanticEvidenceEnrichment, ...rest } = withSection;
  assert.ok(namingSemanticEvidenceEnrichment);
  assert.deepEqual(rest, withoutSection);
  assert.deepEqual(Object.keys(withSection.compatibility), Object.keys(withoutSection.compatibility));

  const serialized = JSON.stringify(namingSemanticEvidenceEnrichment);
  assert.equal(serialized.includes('evidenceStrength'), false);
  for (const field of treeOwnedFields) {
    assert.equal(serialized.includes(`"${field}"`), false, `${field} must not appear in the section`);
  }
});

test('enrichment section is omitted without input, with an invalid namespace, or with no records', () => {
  const records = [{ path: 'src/zeta-alpha.logic.mjs', semanticTokens: ['zeta', 'alpha'] }];

  assert.equal(
    'namingSemanticEvidenceEnrichment' in createNamingOccurrenceBridgePayload({
      namingSemanticFamilyBridge: enrichmentSemanticBridge,
      addressedOccurrenceNamespace: enrichmentNamespace,
    }),
    false,
  );
  assert.equal(
    'namingSemanticEvidenceEnrichment' in createEnrichedPayload(records, {
      addressedOccurrenceNamespace: { ...enrichmentNamespace, addressedSnapshotId: undefined },
    }),
    false,
  );
  assert.equal('namingSemanticEvidenceEnrichment' in createEnrichedPayload([]), false);
  assert.equal(
    'namingSemanticEvidenceEnrichment' in createEnrichedPayload([{ path: 'src/unknown.logic.mjs', semanticTokens: ['unknown', 'x'] }]),
    false,
  );
});

test('enrichment section never attaches without an emitted v1 observation: no path fallback, no synthesized address', () => {
  const result = createNamingOccurrenceBridgePayload({
    namingSemanticFamilyBridge: {
      observations: [
        ...enrichmentSemanticBridge.observations,
        // Naming evidence whose occurrence is not in the addressed snapshot: v1 omits it.
        { path: 'src/outside-scope.logic.mjs', semanticName: 'outside-scope', semanticFamily: 'outside', familyRoot: 'outside' },
      ],
    },
    addressedOccurrenceNamespace: enrichmentNamespace,
    namingSemanticEvidenceEnrichment: enrichmentSource([
      { path: 'src/outside-scope.logic.mjs', semanticTokens: ['outside', 'scope'] },
      { path: 'src/build-surface.logic.mjs', semanticTokens: ['build', 'surface'] },
    ]),
  });

  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.reason === 'unmatched-occurrence-record'));
  assert.deepEqual(
    result.namingSemanticEvidenceEnrichment.records.map((record) => record.repoRelativePath),
    ['src/build-surface.logic.mjs'],
  );
  assert.equal('diagnostics' in result.namingSemanticEvidenceEnrichment, false);
});

test('enrichment section rejects duplicate or conflicting source records for one path deterministically', () => {
  const conflicting = [
    { path: 'src/zeta-alpha.logic.mjs', semanticTokens: ['zeta', 'alpha'] },
    { path: 'src/zeta-alpha.logic.mjs', semanticTokens: ['zeta', 'other'] },
    { path: 'src/build-surface.logic.mjs', semanticTokens: ['build', 'surface'] },
  ];
  const identical = [
    { path: 'src/zeta-alpha.logic.mjs', semanticTokens: ['zeta', 'alpha'] },
    { path: 'src/zeta-alpha.logic.mjs', semanticTokens: ['zeta', 'alpha'] },
    { path: 'src/build-surface.logic.mjs', semanticTokens: ['build', 'surface'] },
  ];

  for (const records of [conflicting, identical, [...conflicting].reverse()]) {
    const section = createEnrichedPayload(records).namingSemanticEvidenceEnrichment;
    assert.deepEqual(section.records.map((record) => record.repoRelativePath), ['src/build-surface.logic.mjs']);
    assert.deepEqual(section.diagnostics, [
      { diagnosticType: 'unattached-enrichment-source', reason: 'duplicate-source-path', repoRelativePath: 'src/zeta-alpha.logic.mjs' },
    ]);
  }
});

test('enrichment section rejects a source path shared by more than one emitted v1 file observation', () => {
  const result = createNamingOccurrenceBridgePayload({
    namingSemanticFamilyBridge: {
      observations: [
        ...enrichmentSemanticBridge.observations,
        { path: 'src/zeta-alpha.logic.mjs', semanticName: 'zeta-alpha', semanticFamily: 'zeta-alpha', familyRoot: 'zeta' },
      ],
    },
    addressedOccurrenceNamespace: enrichmentNamespace,
    namingSemanticEvidenceEnrichment: enrichmentSource([
      { path: 'src/zeta-alpha.logic.mjs', semanticTokens: ['zeta', 'alpha'] },
      { path: 'src/build-surface.logic.mjs', semanticTokens: ['build', 'surface'] },
    ]),
  });

  assert.equal(result.observations.filter((observation) => observation.repoRelativePath === 'src/zeta-alpha.logic.mjs').length, 2);
  assert.deepEqual(
    result.namingSemanticEvidenceEnrichment.records.map((record) => record.repoRelativePath),
    ['src/build-surface.logic.mjs'],
  );
  assert.deepEqual(result.namingSemanticEvidenceEnrichment.diagnostics, [
    { diagnosticType: 'unattached-enrichment-source', reason: 'ambiguous-observation-path', repoRelativePath: 'src/zeta-alpha.logic.mjs' },
  ]);
});

test('enrichment section drops only an invalid field group and reports it', () => {
  const section = createEnrichedPayload([
    { path: 'src/zeta-alpha.logic.mjs', semanticTokens: 'zeta-alpha', ...roleFacts },
    { path: 'src/build-surface.logic.mjs', semanticTokens: ['build', 'surface'], role: 'logic', roleCategory: 'concern-core', roleStatus: 'retired' },
  ]).namingSemanticEvidenceEnrichment;

  assert.deepEqual(
    section.records.map(({ repoRelativePath, semanticTokens, role }) => ({ repoRelativePath, semanticTokens, role })),
    [
      { repoRelativePath: 'src/build-surface.logic.mjs', semanticTokens: ['build', 'surface'], role: undefined },
      { repoRelativePath: 'src/zeta-alpha.logic.mjs', semanticTokens: undefined, role: 'logic' },
    ],
  );
  assert.deepEqual(section.diagnostics, [
    { diagnosticType: 'invalid-enrichment-field-group', fieldGroup: 'role-facts', repoRelativePath: 'src/build-surface.logic.mjs' },
    { diagnosticType: 'invalid-enrichment-field-group', fieldGroup: 'semantic-tokens', repoRelativePath: 'src/zeta-alpha.logic.mjs' },
  ]);
  for (const record of section.records) {
    assert.equal(['role', 'roleCategory', 'roleStatus'].filter((field) => field in record).length % 3, 0);
  }
});
