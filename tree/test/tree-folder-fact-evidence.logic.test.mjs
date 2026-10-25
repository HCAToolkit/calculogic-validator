import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTreeNamingSectionIntake } from '../src/tree-naming-section-intake.logic.mjs';
import {
  deriveSubtreeComposition,
  evaluateComparisonFacts,
  prepareTreeFolderFactEvidence,
} from '../src/tree-folder-fact-evidence.logic.mjs';

const NAMESPACE = { addressProfileId: 'tree-codebase', addressedSnapshotId: 'snapshot-001' };
const tuple = (occurrenceAddress) => ({ ...NAMESPACE, occurrenceAddress });

const folder = (addressPath, path, parentAddressPath = null) => ({ addressPath, path, name: path.split('/').pop(), occurrenceType: 'folder', parentAddressPath });
const file = (addressPath, path, parentAddressPath = null) => ({ addressPath, path, occurrenceType: 'file', parentAddressPath });

const OCCURRENCES = [
  file('1', 'README.md'),
  folder('A', 'src'),
  file('A.1', 'src/build-surface.logic.mjs', 'A'),
  file('A.2', 'src/build-plan.logic.mjs', 'A'),
  file('A.3', 'src/order-step.logic.mjs', 'A'),
  file('A.4', 'src/order-flow.logic.mjs', 'A'),
  file('A.5', 'src/notes.md', 'A'),
  file('A.6', 'src/zeta-alpha.logic.mjs', 'A'),
  folder('A.G', 'src/core', 'A'),
  file('A.G.1', 'src/core/build-core.logic.mjs', 'A.G'),
  folder('B', 'tree'),
  folder('C', 'Docs'),
  folder('D', 'pkg'),
  folder('E', 'lib'),
  folder('F', 'none'),
];

const fileObservation = (address, familyRoot, extra = {}) => ({ ...tuple(address), semanticName: `${familyRoot}-x`, familyRoot, semanticFamily: familyRoot, ...extra });
const V1_OBSERVATIONS = [
  fileObservation('1', 'readme'),
  fileObservation('A.1', 'build'),
  fileObservation('A.2', 'build'),
  fileObservation('A.3', 'order'),
  fileObservation('A.4', 'order'),
  fileObservation('A.6', 'zeta'),
  fileObservation('A.6', 'zeta'),
  fileObservation('A.G.1', 'build'),
  { ...tuple('B'), familyRoot: 'tree', semanticEvidenceKind: 'folder-semantic-context', occurrenceType: 'folder' },
  // Two observations on one folder: the v1 duplicate rule rejects both (#85 non-blocking track).
  { ...tuple('D'), familyRoot: 'pkg', semanticEvidenceKind: 'folder-semantic-context', occurrenceType: 'folder' },
  { ...tuple('D'), familyRoot: 'pkg', semanticEvidenceKind: 'semantic-family-root-folder', familyRootQualification: 'package-root-folder', occurrenceType: 'folder' },
];

const ROLE = { role: 'logic', roleCategory: 'concern-core', roleStatus: 'active' };
const N1_RECORDS = [
  { ...tuple('A.1'), semanticTokens: ['build', 'surface'], ...ROLE },
  { ...tuple('A.2'), semanticTokens: ['build', 'plan'] },
  { ...tuple('A.3'), semanticTokens: 'order-step', ...ROLE },
  { ...tuple('A.6'), semanticTokens: ['zeta', 'alpha'], ...ROLE },
  { ...tuple('A.G.1'), semanticTokens: ['build', 'core'], role: 'logic', roleCategory: 'architecture-support', roleStatus: 'active' },
];
const N2_RECORDS = [
  { ...tuple('A'), parseOutcome: 'parsed', labelTokens: ['src'], labelRoot: 'src' },
  { ...tuple('A.G'), parseOutcome: 'parsed', labelTokens: ['core'], labelRoot: 'core' },
  { ...tuple('B'), parseOutcome: 'parsed', labelTokens: ['tree'], labelRoot: 'tree' },
  { ...tuple('C'), parseOutcome: 'not-parsed', notParsedReasons: ['label-has-uppercase'] },
  { ...tuple('D'), parseOutcome: 'parsed', labelTokens: ['pkg'], labelRoot: 'pkg' },
  { ...tuple('E'), parseOutcome: 'maybe' },
];

const section = (contractVersion, records) => ({
  contractVersion,
  producerId: 'test',
  source: 'calculogic-validator/naming',
  identityTupleFields: ['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress'],
  recordCount: records.length,
  records,
});

const payload = ({ observations = V1_OBSERVATIONS, n1 = N1_RECORDS, n2 = N2_RECORDS } = {}) => ({
  bridgeContractVersion: 'naming-occurrence-bridge.v1',
  ...NAMESPACE,
  observations,
  ...(n1 ? { namingSemanticEvidenceEnrichment: section('naming-semantic-evidence-enrichment.v1', n1) } : {}),
  ...(n2 ? { namingFolderLabelObservations: section('naming-folder-label-observation.v1', n2) } : {}),
});

const STAGED = { namingSemanticFamilyBridge: { observations: [] }, namingSemanticEvidenceEnrichment: { records: [] }, interpretFolderLabel: () => ({}) };

const build = ({ bridge = payload(), bridgeSource = 'tree-built', staged = STAGED, occurrences = OCCURRENCES } = {}) => {
  const sectionIntake = prepareTreeNamingSectionIntake({
    namingOccurrenceBridge: bridge,
    bridgeSource,
    addressedNamespace: NAMESPACE,
    addressedOccurrenceRecords: occurrences,
    staged,
  });
  return { sectionIntake, evidence: prepareTreeFolderFactEvidence({ sectionIntake, addressedNamespace: NAMESPACE, addressedOccurrenceRecords: occurrences }) };
};

const factsAt = (evidence, address) => evidence.occurrenceFacts.find((entry) => entry.identityTuple.occurrenceAddress === address).facts;
const compositionAt = (evidence, address) =>
  evidence.compositionObservations.find((observation) => observation.identityTuple.occurrenceAddress === address);

test('intake exposes v1 observations exactly as its association rule accepts or rejects them (D1)', () => {
  const { sectionIntake } = build();
  const { bridgeObservations, semanticEvidenceEnrichment } = sectionIntake;

  assert.deepEqual(
    bridgeObservations.acceptedRecords.map(({ occurrenceAddress }) => occurrenceAddress),
    ['1', 'A.1', 'A.2', 'A.3', 'A.4', 'A.G.1', 'B'],
  );
  assert.deepEqual(bridgeObservations.acceptedRecords[1].observation, fileObservation('A.1', 'build'));
  assert.deepEqual(bridgeObservations.rejectedRecords, [
    { identityTuple: tuple('A.6'), reason: 'duplicate-identity' },
    { identityTuple: tuple('A.6'), reason: 'duplicate-identity' },
    { identityTuple: tuple('D'), reason: 'duplicate-identity' },
    { identityTuple: tuple('D'), reason: 'duplicate-identity' },
  ]);
  // The exposed set is the one N1 association uses: N1 attaches exactly to accepted file observations.
  const acceptedFiles = new Set(bridgeObservations.acceptedRecords.map(({ occurrenceAddress }) => occurrenceAddress));
  for (const record of semanticEvidenceEnrichment.acceptedRecords) assert.ok(acceptedFiles.has(record.occurrenceAddress));
  assert.deepEqual(semanticEvidenceEnrichment.rejectedRecords, [{ identityTuple: tuple('A.6'), reason: 'unmatched-record' }]);

  const other = prepareTreeNamingSectionIntake({
    namingOccurrenceBridge: payload({
      observations: [{ occurrenceAddress: 'A.1' }, { ...fileObservation('A.2', 'b'), addressProfileId: 'other' }, fileObservation('Z.9', 'z')],
      n1: null,
      n2: null,
    }),
    bridgeSource: 'caller-supplied',
    addressedNamespace: NAMESPACE,
    addressedOccurrenceRecords: OCCURRENCES,
  });
  assert.deepEqual(other.bridgeObservations.rejectedRecords, [
    { identityTuple: null, reason: 'invalid-identity' },
    { identityTuple: { ...tuple('A.2'), addressProfileId: 'other' }, reason: 'namespace-mismatch' },
    { identityTuple: tuple('Z.9'), reason: 'unmatched-record' },
  ]);
});

test('file facts cover every S1.3 state, with N1 field groups independent of each other', () => {
  const { evidence } = build();
  assert.deepEqual(factsAt(evidence, 'A.1'), { semanticIdentity: { state: 'semantic-observation' }, tokens: { state: 'available' }, roleFacts: { state: 'available' } });
  assert.deepEqual(factsAt(evidence, 'A.2'), {
    semanticIdentity: { state: 'semantic-observation' },
    tokens: { state: 'available' },
    roleFacts: { state: 'not-provided', reason: 'group-omitted' },
  });
  assert.deepEqual(factsAt(evidence, 'A.3'), { semanticIdentity: { state: 'semantic-observation' }, tokens: { state: 'invalid' }, roleFacts: { state: 'available' } });
  assert.deepEqual(factsAt(evidence, 'A.4'), {
    semanticIdentity: { state: 'semantic-observation' },
    tokens: { state: 'not-provided', reason: 'no-record' },
    roleFacts: { state: 'not-provided', reason: 'no-record' },
  });
  assert.deepEqual(factsAt(evidence, 'A.5'), {
    semanticIdentity: { state: 'no-semantic-observation' },
    tokens: { state: 'not-provided', reason: 'no-record' },
    roleFacts: { state: 'not-provided', reason: 'no-record' },
  });
  assert.deepEqual(factsAt(evidence, 'A.6'), {
    semanticIdentity: { state: 'rejected', reasons: ['duplicate-identity'] },
    tokens: { state: 'rejected', reasons: ['unmatched-record'] },
    roleFacts: { state: 'rejected', reasons: ['unmatched-record'] },
  });
});

test('folder facts: every label state and a visible rejection for a folder whose own v1 observations collide (D6)', () => {
  const { evidence } = build();
  assert.deepEqual(factsAt(evidence, 'A'), { folderLabel: { state: 'parsed', labelTokens: ['src'], labelRoot: 'src' }, bridgeObservation: { state: 'none' } });
  assert.deepEqual(factsAt(evidence, 'B').bridgeObservation, { state: 'accepted', semanticEvidenceKind: 'folder-semantic-context' });
  assert.deepEqual(factsAt(evidence, 'C').folderLabel, { state: 'not-parsed', notParsedReasons: ['label-has-uppercase'] });
  assert.deepEqual(factsAt(evidence, 'D').bridgeObservation, { state: 'rejected', reasons: ['duplicate-identity'] });
  assert.deepEqual(factsAt(evidence, 'E').folderLabel, { state: 'absent', reason: 'record-rejected', rejectionReasons: ['invalid-record-shape'] });
  assert.deepEqual(factsAt(evidence, 'F').folderLabel, { state: 'absent', reason: 'no-record' });
});

test('run-level unavailability makes every dependent fact unavailable, never a negative fact', () => {
  // Standalone Tree: no staged input at all.
  const standalone = build({ staged: {}, bridge: payload({ n1: null, n2: null }) }).evidence;
  assert.deepEqual(factsAt(standalone, 'A.1'), { semanticIdentity: { state: 'unavailable' }, tokens: { state: 'unavailable' }, roleFacts: { state: 'unavailable' } });
  assert.deepEqual(factsAt(standalone, 'A'), { folderLabel: { state: 'absent', reason: 'run-unavailable' }, bridgeObservation: { state: 'unavailable' } });
  assert.deepEqual(evaluateComparisonFacts([factsAt(standalone, 'A.1').semanticIdentity]), { status: 'not-evaluated', reason: 'run-unavailable' });
  // Composition tallies derive from the facts: records the intake listed for an unavailable run count nowhere.
  assert.deepEqual(compositionAt(standalone, 'A').directMembers, {
    fileCount: 6,
    familyRoots: {},
    roleCategories: {},
    semanticIdentity: { unavailable: 6 },
    tokens: { unavailable: 6 },
    roleFacts: { unavailable: 6 },
  });

  // Caller-supplied bridge without sections: the v1 bridge is available, the sections are absent.
  const supplied = build({ bridgeSource: 'caller-supplied', staged: {}, bridge: payload({ n1: null, n2: null }) }).evidence;
  assert.deepEqual(factsAt(supplied, 'A.1'), { semanticIdentity: { state: 'semantic-observation' }, tokens: { state: 'unavailable' }, roleFacts: { state: 'unavailable' } });
  assert.deepEqual(factsAt(supplied, 'A').folderLabel, { state: 'absent', reason: 'run-unavailable' });
  assert.deepEqual(
    evaluateComparisonFacts([factsAt(supplied, 'A.1').semanticIdentity, factsAt(supplied, 'A.1').tokens]),
    { status: 'not-evaluated', reason: 'run-unavailable' },
  );
});

test('comparison rule: one case per precedence step, in S1.3 order', () => {
  const fact = (state, reason) => ({ state, ...(reason ? { reason } : {}) });
  const cases = [
    [[fact('rejected'), fact('unavailable')], { status: 'not-evaluated', reason: 'run-unavailable' }],
    [[fact('invalid'), fact('rejected')], { status: 'not-evaluated', reason: 'record-rejected' }],
    [[fact('no-semantic-observation'), fact('invalid')], { status: 'not-evaluated', reason: 'invalid-field-group' }],
    [[fact('no-semantic-observation'), fact('not-provided', 'group-omitted')], { status: 'not-evaluated', reason: 'no-semantic-observation' }],
    [[fact('semantic-observation'), fact('not-provided', 'group-omitted')], { status: 'not-evaluated', reason: 'not-provided', notProvidedReason: 'group-omitted' }],
    [[fact('semantic-observation'), fact('not-provided', 'no-record')], { status: 'not-evaluated', reason: 'not-provided', notProvidedReason: 'no-record' }],
    [[fact('semantic-observation'), fact('available')], { status: 'evaluated' }],
    [[fact('semantic-observation')], { status: 'evaluated' }],
  ];
  for (const [facts, expected] of cases) assert.deepEqual(evaluateComparisonFacts(facts), expected, JSON.stringify(facts));
});

test('composition: one observation per addressed folder, direct members only, top-level files in none', () => {
  const { evidence } = build();
  assert.deepEqual(
    evidence.compositionObservations.map(({ identityTuple }) => identityTuple.occurrenceAddress),
    ['A', 'A.G', 'B', 'C', 'D', 'E', 'F'],
  );
  assert.deepEqual(compositionAt(evidence, 'A'), {
    identityTuple: tuple('A'),
    path: 'src',
    label: { state: 'parsed', labelTokens: ['src'], labelRoot: 'src' },
    bridgeObservation: { state: 'none' },
    childFolderAddresses: ['A.G'],
    directMembers: {
      fileCount: 6,
      familyRoots: { build: 2, order: 2 },
      roleCategories: { 'concern-core': 2 },
      semanticIdentity: { 'no-semantic-observation': 1, rejected: 1, 'semantic-observation': 4 },
      tokens: { available: 2, invalid: 1, 'not-provided:no-record': 2, rejected: 1 },
      roleFacts: { available: 2, 'not-provided:group-omitted': 1, 'not-provided:no-record': 2, rejected: 1 },
    },
  });
  // A candidate-less, not-parsed and empty folder still has its observation.
  assert.deepEqual(compositionAt(evidence, 'C').directMembers.fileCount, 0);
  assert.deepEqual(compositionAt(evidence, 'C').label.state, 'not-parsed');
  const totalDirect = evidence.compositionObservations.reduce((sum, observation) => sum + observation.directMembers.fileCount, 0);
  assert.equal(totalDirect, OCCURRENCES.filter((occurrence) => occurrence.occurrenceType === 'file' && occurrence.parentAddressPath).length);
});

test('the subtree view is derived from the direct records and equals their sum; nothing derived is stored', () => {
  const { evidence } = build();
  const subtree = deriveSubtreeComposition(evidence, 'A');
  const direct = [compositionAt(evidence, 'A'), compositionAt(evidence, 'A.G')].map((observation) => observation.directMembers);
  assert.equal(subtree.fileCount, direct[0].fileCount + direct[1].fileCount);
  assert.deepEqual(subtree.familyRoots, { build: 3, order: 2 });
  assert.deepEqual(subtree.roleCategories, { 'architecture-support': 1, 'concern-core': 2 });
  assert.deepEqual(subtree.semanticIdentity, { 'no-semantic-observation': 1, rejected: 1, 'semantic-observation': 5 });
  assert.deepEqual(deriveSubtreeComposition(evidence, 'A.G'), compositionAt(evidence, 'A.G').directMembers);
  assert.equal(deriveSubtreeComposition(evidence, 'Z'), null);
  for (const observation of evidence.compositionObservations) {
    assert.deepEqual(Object.keys(observation).sort(), ['bridgeObservation', 'childFolderAddresses', 'directMembers', 'identityTuple', 'label', 'path']);
  }
});

test('output is deterministic across input orderings and reuses the intake availability record', () => {
  const first = build();
  const shuffled = build({
    occurrences: [...OCCURRENCES].reverse(),
    bridge: payload({ observations: [...V1_OBSERVATIONS].reverse(), n1: [...N1_RECORDS].reverse(), n2: [...N2_RECORDS].reverse() }),
  });
  assert.deepEqual(shuffled.evidence, first.evidence);
  assert.equal(first.evidence.availability, first.sectionIntake.availability);
  assert.equal(first.evidence.sectionIntakeSource, 'tree-naming-section-intake');
});
