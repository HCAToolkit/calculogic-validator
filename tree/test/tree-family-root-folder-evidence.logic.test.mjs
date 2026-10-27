import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareTreeFamilyRootFolderEvidence } from '../src/tree-family-root-folder-evidence.logic.mjs';

const namingSemanticEvidenceFixture = [
  {
    path: 'packages/app-shell',
    occurrenceType: 'folder',
    semanticEvidenceKind: 'semantic-family-root-folder',
    semanticName: 'app-shell',
    semanticFamily: 'app-shell',
    familyRoot: 'app',
    familySubgroup: 'shell',
    evidenceSource: 'namingSemanticFamilyBridge',
  },
  {
    path: 'packages/tree-structure-advisor',
    occurrenceType: 'folder',
    semanticEvidenceKind: 'semantic-family-root-folder',
    semanticName: 'tree-structure-advisor',
    semanticFamily: 'tree-structure-advisor',
    familyRoot: 'tree',
    evidenceSource: 'namingSemanticFamilyBridge',
    ambiguityFlags: ['family-boundary-heuristic'],
  },
  {
    path: 'packages/app-shell/app-shell.logic.ts',
    occurrenceType: 'file',
    semanticName: 'app-shell',
    semanticFamily: 'app-shell',
    familyRoot: 'app',
    evidenceSource: 'namingSemanticFamilyBridge',
  },
];

const addressedOccurrenceFixture = [
  { addressPath: 'A', parentAddressPath: null, path: 'packages', name: 'packages', occurrenceType: 'folder' },
  { addressPath: 'A.A', parentAddressPath: 'A', path: 'packages/app-shell', name: 'app-shell', occurrenceType: 'folder' },
  { addressPath: 'A.A.1', parentAddressPath: 'A.A', path: 'packages/app-shell/app-shell.logic.ts', name: 'app-shell.logic.ts', occurrenceType: 'file' },
  { addressPath: 'A.B', parentAddressPath: 'A', path: 'packages/tree-structure-advisor', name: 'tree-structure-advisor', occurrenceType: 'folder' },
];

test('returns deterministic folder-only records joined by path and preserves addressed ordering', () => {
  const beforeAddressed = structuredClone(addressedOccurrenceFixture);
  const beforeNaming = structuredClone(namingSemanticEvidenceFixture);
  const result = prepareTreeFamilyRootFolderEvidence({
    addressedOccurrenceRecords: addressedOccurrenceFixture,
    namingSemanticEvidenceRecords: namingSemanticEvidenceFixture,
  });

  assert.deepEqual(addressedOccurrenceFixture, beforeAddressed);
  assert.deepEqual(namingSemanticEvidenceFixture, beforeNaming);
  assert.equal(result.source, 'tree-family-root-folder-evidence');
  // S2.13: the file's own observation yields no record; only family-root folders do.
  assert.deepEqual(result.evidenceRecords.map((record) => record.addressPath), ['A.A', 'A.B']);
  assert.deepEqual(result.evidenceRecords[0], {
    addressPath: 'A.A',
    parentAddressPath: 'A',
    path: 'packages/app-shell',
    name: 'app-shell',
    occurrenceType: 'folder',
    familyRootEvidenceStrength: 'high',
    semanticName: 'app-shell',
    semanticFamily: 'app-shell',
    familyRoot: 'app',
    familySubgroup: 'shell',
    namingEvidenceSource: 'namingSemanticFamilyBridge',
    rationale: 'Tree joined addressed folder occurrence path with Naming-prepared family-root evidence path.',
  });
  // Tree derives strength from Naming's ambiguity facts (#82).
  assert.deepEqual(result.evidenceRecords.map((record) => record.familyRootEvidenceStrength), ['high', 'bounded']);
});

test('carries no retired semantic-home field: the folder claim is not a Semantic Home', () => {
  const { evidenceRecords } = prepareTreeFamilyRootFolderEvidence({
    addressedOccurrenceRecords: addressedOccurrenceFixture,
    namingSemanticEvidenceRecords: namingSemanticEvidenceFixture,
  });

  for (const record of evidenceRecords) {
    for (const key of ['semanticHome', 'semanticHomeSource', 'semanticHomeEvidenceStrength']) {
      assert.equal(Object.hasOwn(record, key), false, `${key} is retired (S2.13)`);
    }
  }
});

test('a repository-top folder needs the family-home relationship, which takes precedence over Naming', () => {
  const addressedOccurrenceRecords = [
    { addressPath: 'A', parentAddressPath: null, path: 'calculogic-doc-engine', name: 'calculogic-doc-engine', occurrenceType: 'folder' },
    { addressPath: 'B', parentAddressPath: null, path: 'widget', name: 'widget', occurrenceType: 'folder' },
  ];
  const namingSemanticEvidenceRecords = [
    { path: 'calculogic-doc-engine', occurrenceType: 'folder', semanticEvidenceKind: 'semantic-family-root-folder', semanticName: 'calculogic-doc-engine', semanticFamily: 'calculogic-doc-engine', familyRoot: 'calculogic' },
    { path: 'widget', occurrenceType: 'folder', semanticEvidenceKind: 'semantic-family-root-folder', semanticName: 'widget', semanticFamily: 'widget', familyRoot: 'widget' },
  ];
  const relationshipRecord = {
    path: 'calculogic-doc-engine',
    occurrenceType: 'folder',
    relationshipPerspective: 'semantic-repository-top-family-home',
    relationshipSource: 'tree-semantic-naming-folder-type-relationship',
    semanticName: 'calculogic-doc-engine',
    semanticFamily: 'calculogic-doc-engine',
    familyRoot: 'calculogic',
    namingEvidenceSource: 'naming-semantic-family-bridge-projection',
  };

  const result = prepareTreeFamilyRootFolderEvidence({
    addressedOccurrenceRecords,
    namingSemanticEvidenceRecords,
    treeSemanticNamingFolderTypeRelationshipEvidence: { relationshipRecords: [relationshipRecord] },
  });

  // `widget` is repository-top without the relationship, so it has no record.
  assert.deepEqual(result.evidenceRecords.map((record) => record.path), ['calculogic-doc-engine']);
  const [record] = result.evidenceRecords;
  assert.equal(record.relationshipPerspective, 'semantic-repository-top-family-home');
  assert.equal(record.relationshipSource, 'tree-semantic-naming-folder-type-relationship');
  assert.equal(record.familyRootEvidenceStrength, 'bounded');
  // The value is Naming's `semanticFamily`, unchanged; `familyRoot` stays its own field.
  assert.equal(record.semanticFamily, 'calculogic-doc-engine');
  assert.equal(record.familyRoot, 'calculogic');
  assert.equal(record.rationale, 'Tree family-root folder evidence consumed semantic-naming-to-folder-type relationship interpretation.');

  // Where both match the same folder, the relationship record is the one joined.
  const nested = prepareTreeFamilyRootFolderEvidence({
    addressedOccurrenceRecords: addressedOccurrenceFixture,
    namingSemanticEvidenceRecords: namingSemanticEvidenceFixture,
    treeSemanticNamingFolderTypeRelationshipEvidence: { relationshipRecords: [{ ...relationshipRecord, path: 'packages/app-shell' }] },
  });
  const appShell = nested.evidenceRecords.find((entry) => entry.path === 'packages/app-shell');
  assert.equal(appShell.relationshipPerspective, 'semantic-repository-top-family-home');
  assert.equal(appShell.familyRootEvidenceStrength, 'bounded');
});

test('does not emit finding/verdict/advisor or retired root-classification fields', () => {
  const result = prepareTreeFamilyRootFolderEvidence({
    addressedOccurrenceRecords: addressedOccurrenceFixture,
    namingSemanticEvidenceRecords: namingSemanticEvidenceFixture,
  });

  const evidenceRecord = result.evidenceRecords[0];
  const forbiddenKeys = [
    'finding',
    'findingCode',
    'severity',
    'verdict',
    'placementVerdict',
    'advisorDecision',
    'isRepoShapeAllowedTopLevelDirectory',
    'isStructuralRoot',
    'isSemanticRoot',
    'structuralClass',
    'structuralKind',
  ];

  for (const key of forbiddenKeys) {
    assert.equal(Object.hasOwn(evidenceRecord, key), false);
  }
});

test('safely skips unlinked naming evidence and unlinked addressed occurrences', () => {
  const result = prepareTreeFamilyRootFolderEvidence({
    addressedOccurrenceRecords: [
      { addressPath: 'A.A', parentAddressPath: 'A', path: 'src/only-addressed', name: 'only-addressed', occurrenceType: 'folder' },
    ],
    namingSemanticEvidenceRecords: [
      { path: 'src/only-naming', occurrenceType: 'folder', semanticEvidenceKind: 'semantic-family-root-folder', semanticName: 'only-naming', semanticFamily: 'only-naming', familyRoot: 'only' },
    ],
  });

  assert.deepEqual(result, { source: 'tree-family-root-folder-evidence', evidenceRecords: [] });
});

test('handles empty inputs and deterministically rejects invalid payloads', () => {
  assert.deepEqual(
    prepareTreeFamilyRootFolderEvidence({ addressedOccurrenceRecords: [], namingSemanticEvidenceRecords: [] }),
    { source: 'tree-family-root-folder-evidence', evidenceRecords: [] },
  );

  assert.throws(() => prepareTreeFamilyRootFolderEvidence(), /input must be an object/u);
  assert.throws(
    () => prepareTreeFamilyRootFolderEvidence({ addressedOccurrenceRecords: [] }),
    /namingSemanticEvidenceRecords must be an array/u,
  );
  assert.throws(
    () => prepareTreeFamilyRootFolderEvidence({ namingSemanticEvidenceRecords: [] }),
    /addressedOccurrenceRecords must be an array/u,
  );
});

test('excludes folder context and mixed folder composition observations from family-root folder evidence', () => {
  const result = prepareTreeFamilyRootFolderEvidence({
    addressedOccurrenceRecords: [
      { addressPath: 'A.1', parentAddressPath: null, path: 'calculogic-validator/naming', name: 'naming', occurrenceType: 'folder' },
      { addressPath: 'A.1.1', parentAddressPath: 'A.1', path: 'calculogic-validator/naming/naming-src', name: 'naming-src', occurrenceType: 'folder' },
    ],
    namingSemanticEvidenceRecords: [
      { addressPath: 'A.1', path: 'calculogic-validator/naming', occurrenceType: 'folder', semanticName: 'naming', semanticFamily: 'naming', familyRoot: 'naming', semanticEvidenceKind: 'folder-semantic-context', semanticContext: 'naming' },
      { addressPath: 'A.1.1', path: 'calculogic-validator/naming/naming-src', occurrenceType: 'folder', semanticName: 'naming', semanticFamily: 'naming', familyRoot: 'naming', semanticEvidenceKind: 'folder-semantic-structural-composition', folderCompositionKind: 'semantic-qualified-structural-container', semanticQualifier: 'naming', structuralRoleToken: 'src' },
    ],
  });

  assert.deepEqual(result.evidenceRecords, []);
});
