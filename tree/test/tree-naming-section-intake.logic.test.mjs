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
    { parseOutcome: 'not-parsed', notParsedReasons: ['this-is-not-a-reason'] },
    { parseOutcome: 'not-parsed', notParsedReasons: ['label-empty', 'this-is-not-a-reason'] },
    { parseOutcome: 'not-parsed', notParsedReasons: ['label-has-uppercase', 'label-has-malformed-separator'] },
    { parseOutcome: 'not-parsed', notParsedReasons: ['label-has-uppercase', 'label-has-uppercase'] },
    { parseOutcome: 'parsed', labelTokens: ['src'], labelRoot: 'src', labelFacts: ['contains-connector-token', 'contains-connector-token'] },
    { parseOutcome: 'not-parsed', notParsedReasons: ['label-empty'], labelRoot: 'src' },
  ];
  for (const shape of shapes) {
    const result = intake(payload({ namingFolderLabelObservations: n2([{ ...tuple('A'), ...shape }]) }));
    assert.deepEqual(result.folderLabelObservations.rejectedRecords, [{ identityTuple: tuple('A'), reason: 'invalid-record-shape' }], JSON.stringify(shape));
    assert.equal(result.folderLabelObservations.acceptedRecords.length, 0);
  }
});

test('envelope: an unsupported version is unsupported enrichment and a malformed envelope is invalid as a whole; nothing else is affected', () => {
  const validN2 = n2([{ ...tuple('A'), repoRelativePath: 'src', parseOutcome: 'parsed', labelTokens: ['src'], labelRoot: 'src' }]);
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
      namingFolderLabelObservations: n2([{ ...tuple('A'), repoRelativePath: 'src', parseOutcome: 'parsed', labelTokens: ['src'], labelRoot: 'src' }]),
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
    namingOccurrenceBridge: payload({ namingFolderLabelObservations: n2([{ ...tuple('A'), repoRelativePath: 'src', parseOutcome: 'parsed', labelTokens: ['src'], labelRoot: 'src' }]) }),
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

test('N2 accepts sorted, unique codes from the §6.3 vocabularies', () => {
  const result = intake(payload({
    namingFolderLabelObservations: n2([
      { ...tuple('A'), repoRelativePath: 'src', parseOutcome: 'parsed', labelTokens: ['src', 'with', 'care'], labelRoot: 'src', labelFacts: ['contains-connector-token'] },
      { ...tuple('B'), repoRelativePath: 'tree', parseOutcome: 'not-parsed', notParsedReasons: ['label-has-malformed-separator', 'label-has-unsupported-character', 'label-has-uppercase'] },
    ]),
  }));
  assert.equal(result.folderLabelObservations.rejectedRecords.length, 0);
  assert.deepEqual(result.folderLabelObservations.acceptedRecords.map(({ occurrenceAddress }) => occurrenceAddress), ['A', 'B']);
});

// B2 fixtures isolate tuple association from the lexical path representation under test.
const correspondenceCase = (lane, source, { omit = false, resolved = 'unit/item', unverifiedV1 = false } = {}) => {
  const folderLane = lane === 'N2';
  const address = folderLane ? 'A' : 'A.1';
  const occurrence = { addressPath: address, path: resolved, resolvedPath: 'alias/must-not-be-used', occurrenceType: folderLane ? 'folder' : 'file' };
  const observation = { ...tuple(address), semanticName: 'unit-item', familyRoot: 'unit', semanticFamily: 'unit' };
  if (!unverifiedV1) observation.repoRelativePath = resolved;
  const record = lane === 'v1' ? observation : lane === 'N1'
    ? { ...tuple(address), semanticTokens: ['unit', 'item'] }
    : { ...tuple(address), parseOutcome: 'parsed', labelTokens: ['unit'], labelRoot: 'unit' };
  if (omit) delete record.repoRelativePath;
  else record.repoRelativePath = source;
  const bridge = payload({
    ...(lane === 'N1' ? { namingSemanticEvidenceEnrichment: n1([record]) } : {}),
    ...(folderLane ? { namingFolderLabelObservations: n2([record]) } : {}),
  }, { observations: folderLane ? [] : [observation] });
  const run = () => prepareTreeNamingSectionIntake({ namingOccurrenceBridge: bridge, bridgeSource: 'caller-supplied', addressedNamespace: NAMESPACE, addressedOccurrenceRecords: [occurrence] });
  const select = (result) => result[lane === 'v1' ? 'bridgeObservations' : lane === 'N1' ? 'semanticEvidenceEnrichment' : 'folderLabelObservations'];
  return { bridge, record, occurrence, run, select };
};

for (const lane of ['v1', 'N1', 'N2']) {
  test(`B2 ${lane}: normalization compares both sides without rewriting input`, () => {
    const equivalent = [
      ['unit/item', 'unit/item'], ['unit\\item', 'unit/item'], ['./unit/item', 'unit/item'],
      ['.\\unit\\item', 'unit/item'], ['unit/é', 'unit/é'], ['unit/e\u0301', 'unit/e\u0301'],
      ['unit/ item ', 'unit/ item '], ['unit/%2e%2e/item', 'unit/%2e%2e/item'],
    ];
    for (const [left, right] of equivalent) for (const [source, resolved] of [[left, right], [right, left]]) {
      const c = correspondenceCase(lane, source, { resolved });
      const before = structuredClone({ bridge: c.bridge, occurrence: c.occurrence });
      const result = c.run();
      assert.equal(c.select(result).acceptedRecords.length, 1, JSON.stringify([source, resolved]));
      assert.deepEqual(c.select(result).rejectedRecords, []);
      assert.deepEqual({ bridge: c.bridge, occurrence: c.occurrence }, before);
    }
    for (const [source, resolved] of [['Unit/item', 'unit/item'], ['unit/item ', 'unit/item'], ['unit/é', 'unit/e\u0301']]) {
      const c = correspondenceCase(lane, source, { resolved });
      assert.equal(c.select(c.run()).rejectedRecords[0].reason, 'path-mismatch');
    }
  });

  test(`B2 ${lane}: malformed supplied and resolved representations reject per record`, () => {
    const malformed = [undefined, null, '', 7, {}, [], '/unit/item', 'C:/unit/item', 'C:unit/item',
      '\\\\host\\share', '//host/share', './C:/unit/item', './/unit/item', 'unit//item',
      'unit/item/', 'unit/./item', 'unit/../item', '././unit/item', '.', '..', './'];
    for (const value of malformed) {
      const supplied = correspondenceCase(lane, value);
      assert.equal(supplied.select(supplied.run()).rejectedRecords[0].reason, 'invalid-source-path', String(value));
      // An omitted v1 trace keeps N1's prerequisite accepted while testing a malformed target.
      const resolved = correspondenceCase(lane, 'unit/item', { resolved: value, unverifiedV1: lane === 'N1' });
      if (value === undefined) resolved.occurrence.path = undefined;
      assert.equal(resolved.select(resolved.run()).rejectedRecords[0].reason, 'invalid-source-path', String(value));
    }
  });

  test(`B2 ${lane}: only own-property absence is omission; aliases do not establish correspondence`, () => {
    const c = correspondenceCase(lane, 'wrong/path');
    c.record.path = 'unit/item'; c.record.addressPath = 'unit/item';
    assert.equal(c.select(c.run()).rejectedRecords[0].reason, 'path-mismatch');
    delete c.occurrence.path; c.record.repoRelativePath = c.occurrence.resolvedPath;
    if (lane === 'N1') delete c.bridge.observations[0].repoRelativePath;
    assert.equal(c.select(c.run()).rejectedRecords[0].reason, 'invalid-source-path');
    const absent = correspondenceCase(lane, undefined, { omit: true });
    Object.setPrototypeOf(absent.record, { repoRelativePath: 'inherited/wrong-path' });
    const result = absent.run();
    assert.equal(absent.select(result).acceptedRecords.length, lane === 'N2' ? 0 : 1);
    if (lane === 'N2') assert.equal(absent.select(result).rejectedRecords[0].reason, 'invalid-record-shape');
    if (lane === 'v1') assert.deepEqual(result.diagnostics, [{ section: 'naming-occurrence-bridge', reason: 'source-path-unverified', identityTuple: tuple('A.1') }]);
    if (lane === 'N1') assert.deepEqual(result.diagnostics, []);
  });
}

test('B2 v1 rejection cascades to N1; N1 omission never upgrades unverified v1 evidence', () => {
  const c = correspondenceCase('N1', 'unit/item');
  c.bridge.observations[0].repoRelativePath = 'wrong/path';
  let result = c.run();
  assert.equal(result.bridgeObservations.rejectedRecords[0].reason, 'path-mismatch');
  assert.equal(result.semanticEvidenceEnrichment.rejectedRecords[0].reason, 'unmatched-record');
  delete c.bridge.observations[0].repoRelativePath;
  delete c.record.repoRelativePath;
  result = c.run();
  assert.equal(result.bridgeObservations.acceptedRecords.length, 1);
  assert.equal(result.semanticEvidenceEnrichment.acceptedRecords.length, 1);
  assert.deepEqual(result.diagnostics, [{ section: 'naming-occurrence-bridge', reason: 'source-path-unverified', identityTuple: tuple('A.1') }]);
  c.record.repoRelativePath = 'wrong/path';
  result = c.run();
  assert.equal(result.semanticEvidenceEnrichment.rejectedRecords[0].reason, 'path-mismatch');
  assert.equal(result.bridgeObservations.acceptedRecords.length, 1);
});

test('B2 existing identity, namespace, lookup, type and N2 shape errors precede path checks', () => {
  const c = correspondenceCase('N2', null);
  c.record.parseOutcome = 'invalid';
  assert.equal(c.select(c.run()).rejectedRecords[0].reason, 'invalid-record-shape');
  c.record.parseOutcome = 'parsed'; c.occurrence.occurrenceType = 'file';
  assert.equal(c.select(c.run()).rejectedRecords[0].reason, 'occurrence-type-mismatch');
  c.record.occurrenceAddress = 'Z';
  assert.equal(c.select(c.run()).rejectedRecords[0].reason, 'unmatched-record');
  c.record.addressProfileId = 'foreign';
  assert.equal(c.select(c.run()).rejectedRecords[0].reason, 'namespace-mismatch');
  c.bridge.namingFolderLabelObservations.records.push({ ...c.record });
  c.bridge.namingFolderLabelObservations.recordCount = 2;
  assert.ok(c.select(c.run()).rejectedRecords.every((r) => r.reason === 'duplicate-identity'));
  delete c.record.addressProfileId;
  assert.equal(c.select(c.run()).rejectedRecords.find((r) => r.identityTuple === null).reason, 'invalid-identity');
});

test('B2 rejects only the mismatched record and sorts diagnostics independently of input order', () => {
  const p = payload({ namingSemanticEvidenceEnrichment: n1([
    { ...tuple('A.1'), repoRelativePath: 'wrong/path', semanticTokens: ['build'] },
    { ...tuple('A.2'), repoRelativePath: 'src/zeta-alpha.logic.mjs', semanticTokens: ['zeta'] },
  ]) });
  const first = intake(p);
  assert.deepEqual(first.semanticEvidenceEnrichment.acceptedRecords.map((r) => r.occurrenceAddress), ['A.2']);
  assert.equal(first.semanticEvidenceEnrichment.rejectedRecords[0].reason, 'path-mismatch');
  p.observations.reverse(); p.namingSemanticEvidenceEnrichment.records.reverse();
  assert.deepEqual(intake(p), first);
});
