import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTreeNamingSectionIntake } from '../src/tree-naming-section-intake.logic.mjs';

const NAMESPACE = { addressProfileId: 'tree-codebase', addressedSnapshotId: 'snapshot-001' };
const tuple = (occurrenceAddress, overrides = {}) => ({ ...NAMESPACE, occurrenceAddress, ...overrides });

const OCCURRENCES = [
  { addressPath: 'A', path: 'src', name: 'src', occurrenceType: 'folder' },
  { addressPath: 'A.1', path: 'src/build-surface.logic.mjs', occurrenceType: 'file' },
  { addressPath: 'A.2', path: 'src/zeta-alpha.logic.mjs', occurrenceType: 'file' },
  { addressPath: 'A.3', path: 'src/order-step.logic.mjs', occurrenceType: 'file' },
  { addressPath: 'B', path: 'tree', name: 'tree', occurrenceType: 'folder' },
];

const V1_OBSERVATIONS = [
  { ...tuple('A.1'), repoRelativePath: 'src/build-surface.logic.mjs', semanticName: 'build-surface', familyRoot: 'build', semanticFamily: 'build' },
  { ...tuple('A.2'), repoRelativePath: 'src/zeta-alpha.logic.mjs', semanticName: 'zeta-alpha', familyRoot: 'zeta', semanticFamily: 'zeta' },
  { ...tuple('A.3'), repoRelativePath: 'src/order-step.logic.mjs', semanticName: 'order-step', familyRoot: 'order', semanticFamily: 'order' },
  // A v1 observation on a folder occurrence (for example folder-composition evidence).
  { ...tuple('A'), repoRelativePath: 'src', semanticName: 'naming', familyRoot: 'naming', semanticFamily: 'naming', semanticEvidenceKind: 'folder-semantic-context' },
];

const section = (contractVersion, records, overrides = {}) => ({
  contractVersion,
  producerId: 'test',
  source: 'calculogic-validator/naming',
  identityTupleFields: ['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress'],
  recordCount: records.length,
  records,
  ...overrides,
});
const n1 = (records, overrides) => section('naming-semantic-evidence-enrichment.v1', records, overrides);
const n2 = (records, overrides) => section('naming-folder-label-observation.v1', records, overrides);

const payload = (sections = {}, overrides = {}) => ({
  bridgeContractVersion: 'naming-occurrence-bridge.v1',
  ...NAMESPACE,
  observations: V1_OBSERVATIONS,
  ...sections,
  ...overrides,
});

const ROLE = { role: 'logic', roleCategory: 'concern-core', roleStatus: 'active' };
const STAGED = { namingSemanticFamilyBridge: { observations: [] }, namingSemanticEvidenceEnrichment: { records: [] }, interpretFolderLabel: () => ({}) };

const intake = (namingOccurrenceBridge, { bridgeSource = 'tree-built', staged = STAGED } = {}) =>
  prepareTreeNamingSectionIntake({ namingOccurrenceBridge, bridgeSource, addressedNamespace: NAMESPACE, addressedOccurrenceRecords: OCCURRENCES, staged });

test('N1 intake accepts records through the identity tuple and rejects every §4.5 case with a distinct reason', () => {
  const result = intake(payload({
    namingSemanticEvidenceEnrichment: n1([
      { ...tuple('A.1'), repoRelativePath: 'src/build-surface.logic.mjs', semanticTokens: ['build', 'surface'], ...ROLE },
      { addressProfileId: 'tree-codebase', occurrenceAddress: 'A.2', semanticTokens: ['zeta'] },
      { ...tuple('A.3'), semanticTokens: ['order', 'step'] },
      { ...tuple('A.3'), semanticTokens: ['order', 'other'] },
      { ...tuple('A.2', { addressedSnapshotId: 'other-snapshot' }), semanticTokens: ['zeta', 'alpha'] },
      // No accepted v1 observation carries this tuple, even though the path would match one.
      { ...tuple('Z.9'), repoRelativePath: 'src/zeta-alpha.logic.mjs', semanticTokens: ['zeta', 'alpha'] },
      // The matching v1 observation is on a folder occurrence.
      { ...tuple('A'), semanticTokens: ['src'] },
    ]),
  }));
  const enrichment = result.semanticEvidenceEnrichment;

  assert.equal(result.availability.semanticEvidenceEnrichment, 'available');
  assert.deepEqual(enrichment.acceptedRecords, [
    { ...tuple('A.1'), repoRelativePath: 'src/build-surface.logic.mjs', tokenGroup: 'accepted', roleFactGroup: 'accepted', semanticTokens: ['build', 'surface'], ...ROLE },
  ]);
  // Deterministic order: tupleless records first, then by profile, snapshot and address.
  assert.deepEqual(enrichment.rejectedRecords, [
    { identityTuple: null, reason: 'invalid-identity' },
    { identityTuple: tuple('A.2', { addressedSnapshotId: 'other-snapshot' }), reason: 'namespace-mismatch' },
    { identityTuple: tuple('A'), reason: 'occurrence-type-mismatch' },
    { identityTuple: tuple('A.3'), reason: 'duplicate-identity' },
    { identityTuple: tuple('A.3'), reason: 'duplicate-identity' },
    { identityTuple: tuple('Z.9'), reason: 'unmatched-record' },
  ]);
});

test('N1 field groups are independent: an invalid group is dropped and reported, the other is kept', () => {
  const result = intake(payload({
    namingSemanticEvidenceEnrichment: n1([
      { ...tuple('A.1'), semanticTokens: 'build-surface', ...ROLE },
      { ...tuple('A.2'), semanticTokens: ['zeta', 'alpha'], role: 'logic', roleCategory: 'concern-core', roleStatus: 'retired' },
      { ...tuple('A.3'), ...ROLE },
    ]),
  }));

  assert.deepEqual(
    result.semanticEvidenceEnrichment.acceptedRecords.map(({ occurrenceAddress, tokenGroup, roleFactGroup, semanticTokens, role }) => ({
      occurrenceAddress, tokenGroup, roleFactGroup, semanticTokens, role,
    })),
    [
      { occurrenceAddress: 'A.1', tokenGroup: 'invalid', roleFactGroup: 'accepted', semanticTokens: undefined, role: 'logic' },
      { occurrenceAddress: 'A.2', tokenGroup: 'accepted', roleFactGroup: 'invalid', semanticTokens: ['zeta', 'alpha'], role: undefined },
      { occurrenceAddress: 'A.3', tokenGroup: 'omitted', roleFactGroup: 'accepted', semanticTokens: undefined, role: 'logic' },
    ],
  );
  assert.equal(result.semanticEvidenceEnrichment.rejectedRecords.length, 0);
  assert.deepEqual(result.diagnostics, [
    { section: 'naming-semantic-evidence-enrichment', reason: 'invalid-field-group', fieldGroup: 'semantic-tokens', identityTuple: tuple('A.1') },
    { section: 'naming-semantic-evidence-enrichment', reason: 'invalid-field-group', fieldGroup: 'role-facts', identityTuple: tuple('A.2') },
  ]);
});

test('N2 intake attaches to addressed folder occurrences and rejects every §4.6 case with a distinct reason', () => {
  const result = intake(payload({
    namingFolderLabelObservations: n2([
      { ...tuple('A'), repoRelativePath: 'src', parseOutcome: 'parsed', labelTokens: ['src'], labelRoot: 'src' },
      { ...tuple('B'), repoRelativePath: 'tree', parseOutcome: 'not-parsed', notParsedReasons: ['label-has-uppercase'] },
      { ...tuple('A.1'), parseOutcome: 'parsed', labelTokens: ['x'], labelRoot: 'x' },
      { ...tuple('Q'), repoRelativePath: 'src', parseOutcome: 'parsed', labelTokens: ['src'], labelRoot: 'src' },
      { ...tuple('A', { addressProfileId: 'other-profile' }), parseOutcome: 'parsed', labelTokens: ['src'], labelRoot: 'src' },
      { occurrenceAddress: 'B', parseOutcome: 'parsed', labelTokens: ['tree'], labelRoot: 'tree' },
    ]),
  }));

  assert.deepEqual(result.folderLabelObservations.acceptedRecords, [
    { ...tuple('A'), repoRelativePath: 'src', parseOutcome: 'parsed', labelTokens: ['src'], labelRoot: 'src' },
    { ...tuple('B'), repoRelativePath: 'tree', parseOutcome: 'not-parsed', notParsedReasons: ['label-has-uppercase'] },
  ]);
  assert.deepEqual(result.folderLabelObservations.rejectedRecords, [
    { identityTuple: null, reason: 'invalid-identity' },
    { identityTuple: tuple('A', { addressProfileId: 'other-profile' }), reason: 'namespace-mismatch' },
    { identityTuple: tuple('A.1'), reason: 'occurrence-type-mismatch' },
    { identityTuple: tuple('Q'), reason: 'unmatched-record' },
  ]);
});

test('N2 intake rejects every invalid record shape', () => {
  const shapes = [
    { parseOutcome: 'maybe', labelTokens: ['src'], labelRoot: 'src' },
    { labelTokens: ['src'], labelRoot: 'src' },
    { parseOutcome: 'parsed', labelTokens: ['src'], labelRoot: 'src', notParsedReasons: ['label-empty'] },
    { parseOutcome: 'parsed', labelTokens: ['src'], labelRoot: 'other' },
    { parseOutcome: 'parsed', labelTokens: [], labelRoot: 'src' },
    { parseOutcome: 'parsed', labelTokens: ['src'], labelRoot: 'src', labelFacts: ['means-ownership'] },
    { parseOutcome: 'not-parsed', notParsedReasons: [] },
    { parseOutcome: 'not-parsed', notParsedReasons: ['label-empty'], labelRoot: 'src' },
  ];
  for (const shape of shapes) {
    const result = intake(payload({ namingFolderLabelObservations: n2([{ ...tuple('A'), ...shape }]) }));
    assert.deepEqual(result.folderLabelObservations.rejectedRecords, [{ identityTuple: tuple('A'), reason: 'invalid-record-shape' }], JSON.stringify(shape));
    assert.equal(result.folderLabelObservations.acceptedRecords.length, 0);
  }
});

test('envelope: an unsupported version is unsupported enrichment and a malformed envelope is invalid as a whole; nothing else is affected', () => {
  const validN2 = n2([{ ...tuple('A'), parseOutcome: 'parsed', labelTokens: ['src'], labelRoot: 'src' }]);
  const unsupported = intake(payload({
    namingSemanticEvidenceEnrichment: n1([{ ...tuple('A.1'), semanticTokens: ['build'] }], { contractVersion: 'naming-semantic-evidence-enrichment.v2' }),
    namingFolderLabelObservations: validN2,
  }));
  assert.equal(unsupported.availability.semanticEvidenceEnrichment, 'section-unsupported');
  assert.equal(unsupported.availability.folderLabelObservations, 'available');
  assert.equal(unsupported.availability.bridge, 'available');
  assert.equal(unsupported.folderLabelObservations.acceptedRecords.length, 1);
  assert.equal(unsupported.semanticEvidenceEnrichment.rejectedRecords.length, 0);
  assert.deepEqual(unsupported.diagnostics, [{ section: 'naming-semantic-evidence-enrichment', reason: 'section-unsupported', identityTuple: null }]);

  for (const malformed of [
    'not-an-object',
    n2(validN2.records, { recordCount: 5 }),
    n2(validN2.records, { identityTupleFields: ['occurrenceAddress'] }),
    n2(validN2.records, { records: 'nope' }),
  ]) {
    const result = intake(payload({ namingFolderLabelObservations: malformed }));
    assert.equal(result.availability.folderLabelObservations, 'section-invalid');
    assert.deepEqual(result.folderLabelObservations, { acceptedRecords: [], rejectedRecords: [] });
  }
});

test('run-level availability: not-staged only for a Tree-built payload without staged input; a caller-supplied payload is validated as supplied', () => {
  // Tree-built payload, no staged Naming input at all.
  assert.deepEqual(intake(payload(), { staged: {} }).availability, {
    bridge: 'not-staged',
    semanticEvidenceEnrichment: 'not-staged',
    folderLabelObservations: 'not-staged',
  });
  // Tree-built payload, staged input supplied, but the producer emitted no section.
  assert.deepEqual(intake(payload()).availability, {
    bridge: 'available',
    semanticEvidenceEnrichment: 'section-absent',
    folderLabelObservations: 'section-absent',
  });
  // Caller-supplied payload without any runner staging: its sections are validated normally.
  const supplied = intake(
    payload({
      namingSemanticEvidenceEnrichment: n1([{ ...tuple('A.1'), semanticTokens: ['build', 'surface'] }]),
      namingFolderLabelObservations: n2([{ ...tuple('A'), parseOutcome: 'parsed', labelTokens: ['src'], labelRoot: 'src' }]),
    }),
    { bridgeSource: 'caller-supplied', staged: {} },
  );
  assert.equal(supplied.bridgeSource, 'caller-supplied');
  assert.deepEqual(supplied.availability, { bridge: 'available', semanticEvidenceEnrichment: 'available', folderLabelObservations: 'available' });
  assert.equal(supplied.semanticEvidenceEnrichment.acceptedRecords.length, 1);
  assert.equal(supplied.folderLabelObservations.acceptedRecords.length, 1);
  // A caller-supplied payload missing a section reports it absent, never not-staged.
  assert.deepEqual(intake(payload(), { bridgeSource: 'caller-supplied', staged: {} }).availability, {
    bridge: 'available',
    semanticEvidenceEnrichment: 'section-absent',
    folderLabelObservations: 'section-absent',
  });
  // An unsupported bridge version.
  assert.equal(intake(payload({}, { bridgeContractVersion: 'naming-occurrence-bridge.v9' }), { bridgeSource: 'caller-supplied' }).availability.bridge, 'section-unsupported');
  // No payload at all.
  assert.deepEqual(prepareTreeNamingSectionIntake({}).availability, {
    bridge: 'not-staged',
    semanticEvidenceEnrichment: 'not-staged',
    folderLabelObservations: 'not-staged',
  });
});

test('N1 association never falls back to the path: a record whose tuple has no accepted v1 observation is unmatched', () => {
  const result = intake(payload({
    namingSemanticEvidenceEnrichment: n1([{ ...tuple('A.9'), repoRelativePath: 'src/build-surface.logic.mjs', semanticTokens: ['build', 'surface'] }]),
  }));
  assert.deepEqual(result.semanticEvidenceEnrichment.rejectedRecords, [{ identityTuple: tuple('A.9'), reason: 'unmatched-record' }]);
});

test('N1 attaches only through a v1 observation Tree accepts: a duplicated v1 tuple makes the record unmatched', () => {
  const result = intake(payload(
    { namingSemanticEvidenceEnrichment: n1([{ ...tuple('A.2'), semanticTokens: ['zeta', 'alpha'] }]) },
    { observations: [...V1_OBSERVATIONS, { ...tuple('A.2'), repoRelativePath: 'src/zeta-alpha.logic.mjs', semanticName: 'zeta-alpha' }] },
  ));
  assert.deepEqual(result.semanticEvidenceEnrichment.rejectedRecords, [{ identityTuple: tuple('A.2'), reason: 'unmatched-record' }]);
});

test('section records resolve only inside the snapshot Tree consumes: a payload from another namespace matches nothing', () => {
  const foreign = { addressProfileId: 'foreign-profile', addressedSnapshotId: 'foreign-snapshot' };
  const result = intake(payload(
    {
      namingSemanticEvidenceEnrichment: n1([{ ...tuple('A.1', foreign), semanticTokens: ['build', 'surface'] }]),
      namingFolderLabelObservations: n2([{ ...tuple('A', foreign), parseOutcome: 'parsed', labelTokens: ['src'], labelRoot: 'src' }]),
    },
    { ...foreign, observations: V1_OBSERVATIONS.map((observation) => ({ ...observation, ...foreign })) },
  ), { bridgeSource: 'caller-supplied' });

  assert.equal(result.semanticEvidenceEnrichment.acceptedRecords.length, 0);
  assert.equal(result.folderLabelObservations.acceptedRecords.length, 0);
  assert.deepEqual(result.semanticEvidenceEnrichment.rejectedRecords, [{ identityTuple: tuple('A.1', foreign), reason: 'unmatched-record' }]);
  assert.deepEqual(result.folderLabelObservations.rejectedRecords, [{ identityTuple: tuple('A', foreign), reason: 'unmatched-record' }]);
  // Without Tree's addressed namespace nothing can resolve either.
  const unanchored = prepareTreeNamingSectionIntake({
    namingOccurrenceBridge: payload({ namingFolderLabelObservations: n2([{ ...tuple('A'), parseOutcome: 'parsed', labelTokens: ['src'], labelRoot: 'src' }]) }),
    bridgeSource: 'caller-supplied',
    addressedOccurrenceRecords: OCCURRENCES,
  });
  assert.deepEqual(unanchored.folderLabelObservations.rejectedRecords, [{ identityTuple: tuple('A'), reason: 'unmatched-record' }]);
});

test('N1 checks the matching v1 observation occurrenceType as well as the addressed occurrence (§4.5)', () => {
  const observations = V1_OBSERVATIONS.map((observation) =>
    observation.occurrenceAddress === 'A.1' ? { ...observation, occurrenceType: 'folder' }
      : observation.occurrenceAddress === 'A.2' ? { ...observation, occurrenceType: 'file' }
        : observation);
  const result = intake(payload(
    { namingSemanticEvidenceEnrichment: n1([{ ...tuple('A.1'), semanticTokens: ['build'] }, { ...tuple('A.2'), semanticTokens: ['zeta'] }]) },
    { observations },
  ));
  assert.deepEqual(result.semanticEvidenceEnrichment.rejectedRecords, [{ identityTuple: tuple('A.1'), reason: 'occurrence-type-mismatch' }]);
  assert.deepEqual(result.semanticEvidenceEnrichment.acceptedRecords.map(({ occurrenceAddress }) => occurrenceAddress), ['A.2']);
});
