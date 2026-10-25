import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTreeNamingSectionIntake } from '../src/tree-naming-section-intake.logic.mjs';
import { deriveSubtreeComposition, prepareTreeFolderFactEvidence } from '../src/tree-folder-fact-evidence.logic.mjs';
import { prepareTreeFolderCandidates } from '../src/tree-folder-candidates.logic.mjs';
import { prepareTreeFolderSemanticEvidence } from '../src/tree-folder-semantic-evidence.logic.mjs';

const NAMESPACE = { addressProfileId: 'tree-codebase', addressedSnapshotId: 'snapshot-001' };
const tuple = (occurrenceAddress) => ({ ...NAMESPACE, occurrenceAddress });
const folder = (addressPath, path, parentAddressPath = null) => ({ addressPath, path, occurrenceType: 'folder', parentAddressPath });
const file = (addressPath, path, parentAddressPath) => ({ addressPath, path, occurrenceType: 'file', parentAddressPath });

// build/                 label `build` (candidate C)
//   files: build-surface (match), order-step (foreign), notes (no observation)
//   build-tools/         label `build-tools` (narrow for C) + context `tools` (redirect for C): E3
//   src/                 label `src` (provisional redirect for C)
//     pkg/               label `pkg` + package root `pkg` (terminate for C)
//   Docs/                not parsed: no candidate, no boundary
const OCCURRENCES = [
  folder('A', 'build'),
  file('A.1', 'build/build-surface.logic.mjs', 'A'),
  file('A.2', 'build/order-step.logic.mjs', 'A'),
  file('A.3', 'build/notes.md', 'A'),
  folder('A.B', 'build/build-tools', 'A'),
  file('A.B.1', 'build/build-tools/build-tools-run.logic.mjs', 'A.B'),
  file('A.B.2', 'build/build-tools/build-plan.logic.mjs', 'A.B'),
  file('A.B.3', 'build/build-tools/build-step.logic.mjs', 'A.B'),
  folder('A.C', 'build/src', 'A'),
  file('A.C.1', 'build/src/build-core.logic.mjs', 'A.C'),
  folder('A.C.D', 'build/src/pkg', 'A.C'),
  file('A.C.D.1', 'build/src/pkg/build-pkg.logic.mjs', 'A.C.D'),
  file('A.C.D.2', 'build/src/pkg/zzz-other.logic.mjs', 'A.C.D'),
  file('A.C.D.3', 'build/src/pkg/readme.md', 'A.C.D'),
  folder('A.E', 'build/Docs', 'A'),
  file('A.E.1', 'build/Docs/build-doc.logic.mjs', 'A.E'),
];

const fileObservation = (address, familyRoot, extra = {}) => ({ ...tuple(address), semanticName: `${familyRoot}-x`, familyRoot, semanticFamily: familyRoot, ...extra });
const V1_OBSERVATIONS = [
  fileObservation('A.1', 'build'),
  fileObservation('A.2', 'order'),
  fileObservation('A.B.1', 'build', { ambiguityFlags: ['hyphen-role-ambiguity'] }),
  fileObservation('A.B.2', 'build'),
  fileObservation('A.B.3', 'build'),
  fileObservation('A.C.1', 'build'),
  fileObservation('A.C.D.1', 'build'),
  fileObservation('A.C.D.2', 'zzz'),
  fileObservation('A.E.1', 'build'),
  { ...tuple('A.B'), familyRoot: 'tools', semanticName: 'tools', semanticEvidenceKind: 'folder-semantic-context', occurrenceType: 'folder' },
  { ...tuple('A.C.D'), familyRoot: 'pkg', semanticEvidenceKind: 'semantic-family-root-folder', familyRootQualification: 'package-root-folder', occurrenceType: 'folder' },
];
const ROLE = { role: 'logic', roleCategory: 'concern-core', roleStatus: 'active' };
const N1_RECORDS = [
  { ...tuple('A.1'), semanticTokens: ['build', 'surface'], ...ROLE },
  { ...tuple('A.B.1'), semanticTokens: ['build', 'tools', 'run'], ...ROLE },
  { ...tuple('A.B.2'), semanticTokens: ['build', 'plan'], ...ROLE },
  // Role facts only: the token group is omitted.
  { ...tuple('A.B.3'), ...ROLE },
];
const N2_RECORDS = [
  { ...tuple('A'), parseOutcome: 'parsed', labelTokens: ['build'], labelRoot: 'build' },
  { ...tuple('A.B'), parseOutcome: 'parsed', labelTokens: ['build', 'tools'], labelRoot: 'build' },
  { ...tuple('A.C'), parseOutcome: 'parsed', labelTokens: ['src'], labelRoot: 'src' },
  { ...tuple('A.C.D'), parseOutcome: 'parsed', labelTokens: ['pkg'], labelRoot: 'pkg' },
  { ...tuple('A.E'), parseOutcome: 'not-parsed', notParsedReasons: ['label-has-uppercase'] },
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
const FOLDER_KIND_EVIDENCE = { source: 'tree-folder-kind-evidence', evidenceRecords: [{ addressPath: 'A', folderKind: 'semantic' }] };
const STRUCTURAL_HOME_EVIDENCE = { source: 'tree-structural-home-evidence', evidenceRecords: [{ addressPath: 'A.C', structuralHome: 'src' }] };

const build = ({ bridge = payload(), bridgeSource = 'tree-built', staged = STAGED, occurrences = OCCURRENCES } = {}) => {
  const sectionIntake = prepareTreeNamingSectionIntake({
    namingOccurrenceBridge: bridge,
    bridgeSource,
    addressedNamespace: NAMESPACE,
    addressedOccurrenceRecords: occurrences,
    staged,
  });
  const factEvidence = prepareTreeFolderFactEvidence({ sectionIntake, addressedNamespace: NAMESPACE, addressedOccurrenceRecords: occurrences });
  const candidates = prepareTreeFolderCandidates({
    factEvidence,
    sectionIntake,
    folderKindEvidence: FOLDER_KIND_EVIDENCE,
    structuralHomeEvidence: STRUCTURAL_HOME_EVIDENCE,
  });
  return { sectionIntake, factEvidence, evidence: prepareTreeFolderSemanticEvidence({ sectionIntake, factEvidence, candidates }) };
};

const id = (folderAddressPath, candidateSource) => ({ folderAddressPath, candidateSource, labelObservationRef: tuple(folderAddressPath) });
const candidateAt = (evidence, address, source) =>
  evidence.candidates.find((candidate) => candidate.candidateId.folderAddressPath === address && candidate.candidateId.candidateSource === source);
const memberOf = (evidence, address, source, memberAddress) =>
  evidence.memberRelationships.find(
    (record) =>
      record.candidateId.folderAddressPath === address &&
      record.candidateId.candidateSource === source &&
      record.member.occurrenceAddress === memberAddress,
  );
const LABEL = 'naming-folder-label';
const CONTEXT = 'naming-folder-semantic-context';
const PACKAGE_ROOT = 'naming-package-root';

test('candidates: every closed source, D4 lexical roots, bounded package roots, rootAncestry and D5 references', () => {
  const { evidence } = build();
  assert.deepEqual(
    evidence.candidates.map(({ candidateId }) => `${candidateId.folderAddressPath} ${candidateId.candidateSource}`),
    ['A naming-folder-label', 'A.B naming-folder-label', 'A.B naming-folder-semantic-context', 'A.C naming-folder-label', 'A.C.D naming-folder-label', 'A.C.D naming-package-root'],
  );
  const top = candidateAt(evidence, 'A', LABEL);
  assert.deepEqual(
    { candidateId: top.candidateId, lexicalRoot: top.lexicalRoot, labelTokens: top.labelTokens, rootAncestry: top.rootAncestry, bounded: top.bounded },
    { candidateId: id('A', LABEL), lexicalRoot: 'build', labelTokens: ['build'], rootAncestry: 'unanchored', bounded: undefined },
  );
  assert.deepEqual(top.references, {
    sameFolderCandidates: [],
    folderKindEvidence: { source: 'tree-folder-kind-evidence', addressPath: 'A' },
    structuralHomeEvidence: null,
  });
  // The label root of a compound label, anchored by the same root above it.
  const tools = candidateAt(evidence, 'A.B', LABEL);
  assert.deepEqual([tools.lexicalRoot, tools.labelTokens, tools.rootAncestry], ['build', ['build', 'tools'], 'anchored']);
  assert.deepEqual(tools.references.sameFolderCandidates, [id('A.B', CONTEXT)]);
  // D4: a context candidate's root is the observation's familyRoot, with no label tokens.
  const context = candidateAt(evidence, 'A.B', CONTEXT);
  assert.deepEqual([context.lexicalRoot, 'labelTokens' in context, context.rootAncestry], ['tools', false, 'unanchored']);
  const packageRoot = candidateAt(evidence, 'A.C.D', PACKAGE_ROOT);
  assert.deepEqual([packageRoot.lexicalRoot, packageRoot.bounded], ['pkg', true]);
  assert.deepEqual(candidateAt(evidence, 'A.C', LABEL).references.structuralHomeEvidence, { source: 'tree-structural-home-evidence', addressPath: 'A.C' });
  // A not-parsed folder proposes nothing.
  assert.equal(evidence.candidates.some(({ candidateId }) => candidateId.folderAddressPath === 'A.E'), false);
});

test('facets for the outer candidate: full-lineage containment, branch accounting and terminated members counted apart', () => {
  const { evidence } = build();
  const { facets } = candidateAt(evidence, 'A', LABEL);
  assert.deepEqual(facets.channels, {
    root: {
      match: { singular: { direct: 1, descendant: 4 }, ambiguous: { direct: 0, descendant: 1 } },
      foreignByRoot: { order: 1 },
      notEvaluatedByReason: { 'no-semantic-observation': 1 },
    },
    prefix: { applicable: false },
  });
  assert.deepEqual([facets.activeMemberCount, facets.terminatedMemberCount], [8, 3]);
  assert.deepEqual(facets.terminatedByFolder, { 'A.C.D': 3 });
  assert.deepEqual(facets.branches, [
    { branch: 'A.B', activeMemberCount: 3, terminatedMemberCount: 0, root: { match: 3, foreign: 0, notEvaluated: 0 }, narrowingCandidateIds: [id('A.B', LABEL)] },
    { branch: 'A.C', activeMemberCount: 1, terminatedMemberCount: 3, root: { match: 1, foreign: 0, notEvaluated: 0 }, narrowingCandidateIds: [] },
    { branch: 'A.E', activeMemberCount: 1, terminatedMemberCount: 0, root: { match: 1, foreign: 0, notEvaluated: 0 }, narrowingCandidateIds: [] },
    { branch: 'direct', activeMemberCount: 3, terminatedMemberCount: 0, root: { match: 1, foreign: 1, notEvaluated: 1 }, narrowingCandidateIds: [] },
  ]);
  // Branch rows sum to the candidate's totals.
  const sum = (field) => facets.branches.reduce((total, row) => total + row[field], 0);
  assert.equal(sum('activeMemberCount'), facets.activeMemberCount);
  assert.equal(sum('terminatedMemberCount'), facets.terminatedMemberCount);
  assert.equal(facets.branches.reduce((total, row) => total + row.root.match + row.root.foreign + row.root.notEvaluated, 0), facets.activeMemberCount);
  assert.deepEqual(facets.provisionalRedirectBoundaries, [
    { folderAddress: 'A.B', nestedCandidateIds: [id('A.B', CONTEXT)], memberCount: 3 },
    { folderAddress: 'A.C', nestedCandidateIds: [id('A.C', LABEL)], memberCount: 4 },
    { folderAddress: 'A.C.D', nestedCandidateIds: [id('A.C.D', LABEL), id('A.C.D', PACKAGE_ROOT)], memberCount: 3 },
  ]);
  assert.deepEqual(facets.narrowAttributions, [{ folderAddress: 'A.B', narrowingCandidateIds: [id('A.B', LABEL)], memberCount: 3 }]);
  assert.equal(facets.corroborationReferences, candidateAt(evidence, 'A', LABEL).references);
});

test('E1: a terminated member keeps its match, foreign and not-evaluated comparisons visible and contributes to none of the totals', () => {
  const { evidence } = build();
  const terminatedMatch = memberOf(evidence, 'A', LABEL, 'A.C.D.1');
  const terminatedForeign = memberOf(evidence, 'A', LABEL, 'A.C.D.2');
  const terminatedUnevaluated = memberOf(evidence, 'A', LABEL, 'A.C.D.3');
  for (const record of [terminatedMatch, terminatedForeign, terminatedUnevaluated]) {
    assert.equal(record.relationship, 'terminated');
    assert.equal(record.terminatedAt, 'A.C.D');
    // Full lineage: the redirect above the termination is kept as provenance.
    assert.deepEqual(record.provisionalRedirectBoundaries.map(({ folderAddress }) => folderAddress), ['A.C', 'A.C.D']);
  }
  assert.deepEqual(terminatedMatch.channels.root, { result: 'match', ambiguity: 'singular', position: 'descendant' });
  assert.deepEqual(terminatedForeign.channels.root, { result: 'foreign', familyRoot: 'zzz' });
  assert.deepEqual(terminatedUnevaluated.channels.root, { result: 'not-evaluated', reason: 'no-semantic-observation' });

  const { root } = candidateAt(evidence, 'A', LABEL).facets.channels;
  const matches = root.match.singular.direct + root.match.singular.descendant + root.match.ambiguous.direct + root.match.ambiguous.descendant;
  assert.equal(matches, 6);
  assert.equal('zzz' in root.foreignByRoot, false);
  assert.deepEqual(root.notEvaluatedByReason, { 'no-semantic-observation': 1 });
});

test('C2: a provisional member’s evaluated match counts as matching evidence; the relationship alone never does', () => {
  const { evidence } = build();
  const provisional = memberOf(evidence, 'A', LABEL, 'A.C.1');
  assert.deepEqual(
    { relationship: provisional.relationship, status: provisional.status, boundaries: provisional.provisionalRedirectBoundaries, root: provisional.channels.root },
    {
      relationship: 'preserved',
      status: 'provisional',
      boundaries: [{ folderAddress: 'A.C', candidateIds: [id('A.C', LABEL)] }],
      root: { result: 'match', ambiguity: 'singular', position: 'descendant' },
    },
  );
  assert.equal(candidateAt(evidence, 'A', LABEL).facets.branches.find((row) => row.branch === 'A.C').root.match, 1);
  // `src`: its one active member is provisional and foreign, so it has no match at all.
  const src = candidateAt(evidence, 'A.C', LABEL).facets;
  assert.deepEqual([src.activeMemberCount, src.terminatedMemberCount, src.channels.root.match], [1, 3, { singular: { direct: 0, descendant: 0 }, ambiguous: { direct: 0, descendant: 0 } }]);
  assert.deepEqual(src.channels.root.foreignByRoot, { build: 1 });
});

test('E3: one folder can narrow C and provisionally redirect it at once; a narrow member counts once per candidate', () => {
  const { evidence } = build();
  const record = memberOf(evidence, 'A', LABEL, 'A.B.1');
  assert.deepEqual(record.narrowAttributions, [{ folderAddress: 'A.B', candidateIds: [id('A.B', LABEL)] }]);
  assert.deepEqual(record.provisionalRedirectBoundaries, [{ folderAddress: 'A.B', candidateIds: [id('A.B', CONTEXT)] }]);
  assert.equal(record.relationship, 'preserved');
  // Counted once in C and once in the narrowing candidate, never twice within one.
  const timesCounted = (address, source) =>
    evidence.memberRelationships.filter(
      (entry) => entry.member.occurrenceAddress === 'A.B.1' && entry.candidateId.folderAddressPath === address && entry.candidateId.candidateSource === source,
    ).length;
  assert.deepEqual([timesCounted('A', LABEL), timesCounted('A.B', LABEL)], [1, 1]);
  assert.equal(candidateAt(evidence, 'A.B', LABEL).facets.activeMemberCount, 3);
});

test('channels: root and prefix are independent, prefix applies only to multi-token labels, ambiguity never changes a result', () => {
  const { evidence } = build();
  const { channels } = candidateAt(evidence, 'A.B', LABEL).facets;
  assert.deepEqual(channels.root.match, { singular: { direct: 2, descendant: 0 }, ambiguous: { direct: 1, descendant: 0 } });
  assert.deepEqual(channels.prefix, {
    applicable: true,
    match: { singular: { direct: 0, descendant: 0 }, ambiguous: { direct: 1, descendant: 0 } },
    foreignByRoot: { build: 1 },
    notEvaluatedByReason: { 'not-provided:group-omitted': 1 },
  });
  assert.deepEqual(memberOf(evidence, 'A.B', LABEL, 'A.B.3').channels, {
    root: { result: 'match', ambiguity: 'singular', position: 'direct' },
    prefix: { result: 'not-evaluated', reason: 'not-provided', notProvidedReason: 'group-omitted' },
  });
  assert.deepEqual(memberOf(evidence, 'A', LABEL, 'A.1').channels.prefix, { result: 'not-applicable' });
  assert.deepEqual(memberOf(evidence, 'A.B', CONTEXT, 'A.B.1').channels, { root: { result: 'foreign', familyRoot: 'build' }, prefix: { result: 'not-applicable' } });

  // Without ambiguity flags, every comparison result is unchanged; only the ambiguity label differs.
  const plain = build({ bridge: payload({ observations: V1_OBSERVATIONS.map(({ ambiguityFlags, ...observation }) => observation) }) }).evidence;
  const results = (record) => Object.values(record.channels).map(({ result }) => result);
  for (const record of evidence.memberRelationships) {
    const twin = plain.memberRelationships.find(
      (other) => other.member.occurrenceAddress === record.member.occurrenceAddress && other.candidateId.folderAddressPath === record.candidateId.folderAddressPath && other.candidateId.candidateSource === record.candidateId.candidateSource,
    );
    assert.deepEqual(results(twin), results(record));
  }
});

test('Naming values are read only behind their facts: an unusable run proposes no candidate from listed records and evaluates nothing', () => {
  // A Tree-built payload whose v1 bridge was not staged: the intake still lists the v1 records, the facts say unavailable.
  const unstaged = build({ staged: { namingSemanticEvidenceEnrichment: { records: [] }, interpretFolderLabel: () => ({}) } });
  assert.equal(unstaged.factEvidence.availability.bridge, 'not-staged');
  assert.ok(unstaged.sectionIntake.bridgeObservations.acceptedRecords.length > 0);
  assert.deepEqual(unstaged.evidence.candidates.map(({ candidateId }) => candidateId.candidateSource).sort(), [LABEL, LABEL, LABEL, LABEL]);
  for (const record of unstaged.evidence.memberRelationships) {
    assert.deepEqual(record.channels.root, { result: 'not-evaluated', reason: 'run-unavailable' });
  }
  // The N1 tokens are listed and their own fact is available, but the comparison also needs the
  // unavailable semantic identity, so no token value is used.
  const prefixRecords = unstaged.evidence.memberRelationships.filter((record) => record.channels.prefix.result !== 'not-applicable');
  assert.ok(prefixRecords.length > 0);
  for (const record of prefixRecords) assert.deepEqual(record.channels.prefix, { result: 'not-evaluated', reason: 'run-unavailable' });
  // Standalone Tree: nothing usable, so no candidate at all.
  assert.deepEqual(build({ staged: {}, bridge: payload({ n1: null, n2: null }) }).evidence.candidates, []);
});

test('the output holds Stage 1A and 1B-i records by reference and is deterministic across input orderings', () => {
  const first = build();
  assert.equal(first.evidence.availability, first.sectionIntake.availability);
  assert.equal(first.evidence.diagnostics, first.sectionIntake.diagnostics);
  assert.equal(first.evidence.compositionObservations, first.factEvidence.compositionObservations);
  const shuffled = build({
    occurrences: [...OCCURRENCES].reverse(),
    bridge: payload({ observations: [...V1_OBSERVATIONS].reverse(), n1: [...N1_RECORDS].reverse(), n2: [...N2_RECORDS].reverse() }),
  });
  assert.deepEqual(shuffled.evidence, first.evidence);
});

test('E4: every structural walk terminates on a malformed cyclic snapshot and counts each folder once', { timeout: 10000 }, () => {
  // X and Y name each other as parent; Z is its own parent.
  const occurrences = [
    folder('X', 'x', 'Y'),
    folder('Y', 'y', 'X'),
    file('X.1', 'x/build-a.logic.mjs', 'X'),
    file('Y.1', 'y/build-b.logic.mjs', 'Y'),
    folder('Z', 'z', 'Z'),
    file('Z.1', 'z/build-c.logic.mjs', 'Z'),
  ];
  const { factEvidence, evidence } = build({
    occurrences,
    bridge: payload({
      observations: [fileObservation('X.1', 'build'), fileObservation('Y.1', 'build'), fileObservation('Z.1', 'build')],
      n1: null,
      n2: [
        { ...tuple('X'), parseOutcome: 'parsed', labelTokens: ['build'], labelRoot: 'build' },
        { ...tuple('Y'), parseOutcome: 'parsed', labelTokens: ['build'], labelRoot: 'build' },
        { ...tuple('Z'), parseOutcome: 'parsed', labelTokens: ['build'], labelRoot: 'build' },
      ],
    }),
  });
  assert.equal(deriveSubtreeComposition(factEvidence, 'X').fileCount, 2);
  assert.equal(deriveSubtreeComposition(factEvidence, 'Z').fileCount, 1);
  // rootAncestry walks the parent cycle without hanging; members are collected once each.
  assert.deepEqual(evidence.candidates.map((candidate) => [candidate.candidateId.folderAddressPath, candidate.rootAncestry]), [['X', 'anchored'], ['Y', 'anchored'], ['Z', 'unanchored']]);
  assert.deepEqual(evidence.candidates.map((candidate) => candidate.facets.activeMemberCount), [2, 2, 1]);
  assert.deepEqual(
    evidence.memberRelationships.filter((record) => record.candidateId.folderAddressPath === 'X').map((record) => record.member.occurrenceAddress),
    ['X.1', 'Y.1'],
  );
});
