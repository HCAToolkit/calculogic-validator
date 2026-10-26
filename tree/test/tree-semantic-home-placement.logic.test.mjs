import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogueCase, files } from './fixtures/semantic-home-catalogue/semantic-home-catalogue.fixture.mjs';
import { createCandidateFileComparator } from '../src/tree-folder-semantic-evidence.logic.mjs';
import { evaluateCandidateDiscovery } from '../src/tree-semantic-home-placement.logic.mjs';

// Stage 2A-ii placement (Tree spec S2.8; calculogic-validator#102 P1-P8): the S2.11 catalogue's
// placements, the precedence steps, the discovery condition and the shared comparison operation.
const summary = (c, placement) => ({
  state: placement.state,
  ...(placement.reason ? { reason: placement.reason } : {}),
  step: placement.decidedAtStep,
  nearest: placement.nearestHome ? c.pathOfAddress.get(placement.nearestHome.folderAddressPath) : null,
});
const all = (c, folder) => c.placementsIn(folder).map((placement) => summary(c, placement));
const every = (c, folder, expected) => {
  const placements = all(c, folder);
  assert.ok(placements.length > 0, folder);
  for (const placement of placements) assert.deepEqual(placement, expected, folder);
};

test('C1, C14: every file inside its home', () => {
  every(buildCatalogueCase({ files: files('pricing', 'pricing', 6) }), 'pricing', { state: 'inside-home', step: 1, nearest: 'pricing' });
  every(
    buildCatalogueCase({ files: files('registry-lifecycle', 'registry', 10, { tokens: ['registry', 'lifecycle', 'a', 'b'], ambiguous: true }) }),
    'registry-lifecycle',
    { state: 'inside-home', step: 1, nearest: 'registry-lifecycle' },
  );
});

test('C2: with discovery complete and no candidate relating to them, the files have no home', () => {
  const c = buildCatalogueCase({ files: [...files('src', 'alpha', 3), ...files('src', 'beta', 3), ...files('src', 'gamma', 2)] });
  assert.deepEqual(c.reasoning.candidateDiscovery, { complete: true, unmet: [] });
  every(c, 'src', { state: 'no-home', step: 5, nearest: null });
});

test('C3: a file without a semantic observation stops at the identity gate (step 0)', () => {
  every(buildCatalogueCase({ files: files('tests', 'x', 6, { noObservation: true }) }), 'tests', {
    state: 'undetermined',
    reason: 'no-semantic-observation',
    step: 0,
    nearest: null,
  });
});

test('C5, C6: placement follows matches, not containment', () => {
  const c5 = buildCatalogueCase({ files: [...files('billing', 'billing', 1), ...files('billing/src', 'billing', 6)] });
  every(c5, 'billing/src', { state: 'inside-home', step: 1, nearest: 'billing' });
  const c6 = buildCatalogueCase({ files: [...files('app', 'app', 3), ...files('app/pricing', 'pricing', 8), ...files('app/pricing', 'app', 1)] });
  const byRoot = Object.groupBy(c6.placementsIn('app/pricing'), (placement) => placement.path.split('/').pop().split('-')[0]);
  assert.ok(byRoot.pricing.every((placement) => summary(c6, placement).nearest === 'app/pricing'));
  assert.deepEqual(byRoot.app.map((placement) => summary(c6, placement)), [{ state: 'inside-home', step: 1, nearest: 'app' }]);
  every(c6, 'app', { state: 'inside-home', step: 1, nearest: 'app' });
});

test('C7: an undetermined home on the lineage is never read as absent', () => {
  const c = buildCatalogueCase({ files: [...files('ledger/audit', 'audit', 5), ...files('ledger/audit', 'ledger', 5)] });
  every(c, 'ledger/audit', { state: 'undetermined', reason: 'home-on-lineage-undetermined', step: 2, nearest: null });
});

const C8_FILES = [
  ...files('docs/tree-owned', 'tree', 7, { tokens: ['tree', 'notes'] }),
  ...files('docs/tree-owned', 'other', 2),
  ...files('tree', 'tree', 6),
];

test('C8: a root-only match in a claim-unresolved folder stops at step 2, even with an eligible home elsewhere', () => {
  const c = buildCatalogueCase({ files: C8_FILES });
  const treeFiles = c.placementsIn('docs/tree-owned').filter((placement) => placement.path.split('/').pop().startsWith('tree-'));
  assert.equal(treeFiles.length, 7);
  for (const placement of treeFiles) {
    assert.deepEqual(summary(c, placement), { state: 'undetermined', reason: 'home-on-lineage-undetermined', step: 2, nearest: null });
    assert.deepEqual(c.pathsOf(placement.elsewhereHomes), ['tree']);
    assert.deepEqual(placement.consultedCandidates.map(({ relation, location, reason }) => [relation, location, reason]), [
      ['possible-root-reading', 'lineage', 'claim-unresolved'],
    ]);
  }
  every(c, 'tree', { state: 'inside-home', step: 1, nearest: 'tree' });
});

test('C9, C15: several qualifying candidates on the nearest folder are all kept', () => {
  const c9 = buildCatalogueCase({ folders: [{ path: 'tree', context: 'tree' }], files: files('tree', 'tree', 5) });
  for (const placement of c9.placementsIn('tree')) {
    assert.deepEqual(placement.nearestHome.candidateIds.map((id) => id.candidateSource).sort(), ['naming-folder-label', 'naming-folder-semantic-context']);
  }
  const c15 = buildCatalogueCase({ folders: [{ path: 'packages/ui', packageRoot: 'ui' }], files: files('packages/ui', 'ui', 6) });
  for (const placement of c15.placementsIn('packages/ui')) {
    assert.equal(summary(c15, placement).nearest, 'packages/ui');
    assert.deepEqual(placement.nearestHome.candidateIds.map((id) => id.candidateSource).sort(), ['naming-folder-label', 'naming-package-root']);
  }
});

test('C11: the relevant lineage stops at the terminating folder, which it includes; the outer home is elsewhere', () => {
  const c = buildCatalogueCase({
    folders: [{ path: 'platform/pkg', packageRoot: 'pkg' }],
    files: [...files('platform', 'platform', 5), ...files('platform/pkg', 'platform', 4)],
  });
  for (const placement of c.placementsIn('platform/pkg')) {
    assert.deepEqual(summary(c, placement), { state: 'home-elsewhere', step: 3, nearest: null });
    assert.deepEqual(c.pathsOf(placement.elsewhereHomes), ['platform']);
    assert.deepEqual(placement.lineageHomes, []);
  }
  every(c, 'platform', { state: 'inside-home', step: 1, nearest: 'platform' });
});

test('C12: every eligible home elsewhere is listed, without a forced choice', () => {
  const c = buildCatalogueCase({ files: [...files('services/billing', 'billing', 4), ...files('apps/billing', 'billing', 4), ...files('shared', 'billing', 1)] });
  const [shared] = c.placementsIn('shared');
  assert.deepEqual(summary(c, shared), { state: 'home-elsewhere', step: 3, nearest: null });
  assert.deepEqual(c.pathsOf(shared.elsewhereHomes).sort(), ['apps/billing', 'services/billing']);
});

test('C13: incomplete candidate discovery is never no-home, and names the unmet clause', () => {
  const tree = [...files('src', 'alpha', 3), ...files('src', 'beta', 3), ...files('src', 'gamma', 2), ...files('src', 'delta', 1)];
  const notStaged = buildCatalogueCase({ files: tree, n2: 'not-staged' });
  every(notStaged, 'src', { state: 'undetermined', reason: 'candidate-discovery-incomplete', step: 5, nearest: null });
  assert.deepEqual(notStaged.reasoning.candidateDiscovery, {
    complete: false,
    unmet: [{ clause: 'folder-labels-unavailable', availability: 'not-staged' }],
  });
  const rejected = buildCatalogueCase({ files: tree, n2: { rejected: 'src' } });
  every(rejected, 'src', { state: 'undetermined', reason: 'candidate-discovery-incomplete', step: 5, nearest: null });
  const [unmet] = rejected.reasoning.candidateDiscovery.unmet;
  assert.equal(unmet.clause, 'folder-label-absent');
  assert.equal(rejected.pathOfAddress.get(unmet.folder.occurrenceAddress), 'src');
  assert.equal(unmet.reason, 'record-rejected');
  assert.ok(unmet.rejectionReasons.length > 0);
});

test('C16: the nearest home first, every lineage home listed', () => {
  const c = buildCatalogueCase({ files: [...files('billing', 'billing', 3), ...files('billing/billing-api', 'billing', 4, { tokens: ['billing', 'api', 'x'] })] });
  for (const placement of c.placementsIn('billing/billing-api')) {
    assert.equal(summary(c, placement).nearest, 'billing/billing-api');
    assert.deepEqual(c.pathsOf(placement.lineageHomes), ['billing/billing-api', 'billing']);
  }
});

test('C18: a not-evaluated prefix comparison is a possible match on the lineage, never no-home', () => {
  const c = buildCatalogueCase({
    files: [...files('structural-addressing', 'structural', 5, { tokens: ['structural', 'addressing', 'x'] }), ...files('structural-addressing', 'structural', 1, { tokens: null })],
  });
  const states = c.placementsIn('structural-addressing').map((placement) => summary(c, placement));
  assert.equal(states.filter((s) => s.state === 'inside-home').length, 5);
  assert.deepEqual(states.filter((s) => s.state !== 'inside-home'), [{ state: 'undetermined', reason: 'home-on-lineage-undetermined', step: 2, nearest: null }]);
});

test('C26, C28: a real home elsewhere is found before an unresolved claim elsewhere', () => {
  const c26 = buildCatalogueCase({
    files: [
      ...files('billing-api', 'billing', 8, { tokens: ['billing', 'api', 'x'] }),
      ...files('billing-api', 'billing', 1, { tokens: ['billing', 'core'] }),
      ...files('billing-api', 'other', 1),
      ...files('billing', 'billing', 4),
    ],
  });
  const stray = c26.placementsIn('billing-api').find((placement) => placement.path.endsWith('/billing-8.logic.mjs'));
  assert.deepEqual(summary(c26, stray), { state: 'home-elsewhere', step: 3, nearest: null });
  assert.deepEqual(c26.pathsOf(stray.elsewhereHomes), ['billing']);

  const c28 = buildCatalogueCase({ files: [...C8_FILES, ...files('docs', 'tree', 1, { tokens: ['tree', 'notes'] })] });
  const [notes] = c28.placementsIn('docs');
  assert.deepEqual(summary(c28, notes), { state: 'home-elsewhere', step: 3, nearest: null });
  assert.deepEqual(notes.consultedCandidates.map(({ relation, location }) => [relation, location]), [['possible-root-reading', 'elsewhere']]);
});

test('C27: the single file of a claim-unresolved folder is undetermined', () => {
  every(buildCatalogueCase({ files: files('ops-owned', 'ops', 1, { tokens: ['ops', 'notes'] }) }), 'ops-owned', {
    state: 'undetermined',
    reason: 'home-on-lineage-undetermined',
    step: 2,
    nearest: null,
  });
});

test('P2: an undetermined candidate whose comparison is foreign does not block no-home', () => {
  const c = buildCatalogueCase({ files: [...files('shared', 'shared', 4), ...files('shared', 'other', 4)] });
  assert.equal(c.outcomeAt('shared').outcome, 'undetermined');
  const byRoot = Object.groupBy(c.placementsIn('shared'), (placement) => placement.path.split('/').pop().split('-')[0]);
  for (const placement of byRoot.other) {
    assert.deepEqual(summary(c, placement), { state: 'no-home', step: 5, nearest: null });
    assert.deepEqual(placement.consultedCandidates, []);
  }
  for (const placement of byRoot.shared) assert.deepEqual(summary(c, placement), { state: 'undetermined', reason: 'home-on-lineage-undetermined', step: 2, nearest: null });
});

test('C21: a file matching only a not-eligible candidate has no home; not-eligible candidates take no part', () => {
  const c = buildCatalogueCase({ files: [...files('lib', 'lib', 1), ...files('lib', 'other', 9)] });
  assert.equal(c.outcomeAt('lib').outcome, 'not-eligible');
  const [libFile] = c.placementsIn('lib').filter((placement) => placement.path.endsWith('/lib-0.logic.mjs'));
  assert.deepEqual(summary(c, libFile), { state: 'no-home', step: 5, nearest: null });
  assert.deepEqual(libFile.consultedCandidates, []);
});

test('P1: missing N1 tokens give an eligible multi-token candidate a possible relation, never a match', () => {
  const c = buildCatalogueCase({
    files: [
      ...files('billing-api', 'billing', 8, { tokens: ['billing', 'api', 'x'] }),
      ...files('misc', 'billing', 1, { tokens: null }),
      ...files('misc', 'zzz', 1, { tokens: null }),
    ],
  });
  assert.equal(c.outcomeAt('billing-api').outcome, 'eligible');
  for (const placement of c.placementsIn('misc')) {
    assert.deepEqual(summary(c, placement), { state: 'undetermined', reason: 'home-elsewhere-undetermined', step: 4, nearest: null });
    assert.deepEqual(placement.elsewhereHomes, []);
    assert.deepEqual(placement.consultedCandidates.map(({ outcome, relation, location }) => [outcome, relation, location]), [
      ['eligible', 'possible-unevaluated', 'elsewhere'],
    ]);
  }
});

test('P7: a file with no parent folder has an empty lineage and reaches steps 3-5', () => {
  const c = buildCatalogueCase({ files: [...files('', 'tree', 1), ...files('', 'loose', 1), ...files('tree', 'tree', 3)] });
  const byRoot = Object.groupBy(c.placementsIn(''), (placement) => placement.path.split('-')[0]);
  assert.deepEqual(summary(c, byRoot.tree[0]), { state: 'home-elsewhere', step: 3, nearest: null });
  assert.deepEqual(byRoot.tree[0].lineageHomes, []);
  assert.deepEqual(summary(c, byRoot.loose[0]), { state: 'no-home', step: 5, nearest: null });
});

test('P4: each discovery clause is recorded once, with what identifies it', () => {
  const folder = (address, folderLabel, bridgeObservation) => ({
    identityTuple: { addressProfileId: 'p', addressedSnapshotId: 's', occurrenceAddress: address },
    occurrenceType: 'folder',
    facts: { folderLabel, bridgeObservation },
  });
  const discovery = evaluateCandidateDiscovery({
    sectionIntake: { availability: { bridge: 'not-staged', folderLabelObservations: 'section-invalid' } },
    factEvidence: {
      occurrenceFacts: [
        folder('A', { state: 'absent', reason: 'run-unavailable' }, { state: 'unavailable' }),
        folder('B', { state: 'absent', reason: 'no-record' }, { state: 'none' }),
        folder('C', { state: 'parsed' }, { state: 'rejected', reasons: ['duplicate-identity-tuple'] }),
        folder('D', { state: 'not-parsed' }, { state: 'accepted' }),
      ],
    },
  });
  assert.deepEqual(discovery, {
    complete: false,
    unmet: [
      { clause: 'bridge-unavailable', availability: 'not-staged' },
      { clause: 'folder-labels-unavailable', availability: 'section-invalid' },
      { clause: 'folder-label-absent', folder: { addressProfileId: 'p', addressedSnapshotId: 's', occurrenceAddress: 'B' }, reason: 'no-record' },
      { clause: 'folder-observation-rejected', folder: { addressProfileId: 'p', addressedSnapshotId: 's', occurrenceAddress: 'C' }, reasons: ['duplicate-identity-tuple'] },
    ],
  });
});

test('P8: the shared comparator reproduces every Stage 1 member comparison, across the catalogue', () => {
  const cases = [
    { files: C8_FILES },
    { folders: [{ path: 'platform/pkg', packageRoot: 'pkg' }], files: [...files('platform', 'platform', 5), ...files('platform/pkg', 'platform', 4)] },
    { files: [...files('structural-addressing', 'structural', 5, { tokens: ['structural', 'addressing', 'x'] }), ...files('structural-addressing', 'structural', 1, { tokens: null })] },
    { files: [...files('ledger/audit', 'audit', 5), ...files('ledger/audit', 'ledger', 5), ...files('tests', 'x', 2, { noObservation: true })] },
    { files: files('registry-lifecycle', 'registry', 3, { tokens: ['registry', 'lifecycle', 'a'], ambiguous: true }) },
  ];
  let compared = 0;
  for (const spec of cases) {
    const c = buildCatalogueCase(spec);
    const compare = createCandidateFileComparator({ sectionIntake: c.sectionIntake });
    const fileByAddress = new Map(c.factEvidence.occurrenceFacts.map((entry) => [entry.identityTuple.occurrenceAddress, entry]));
    for (const record of c.semanticEvidence.memberRelationships) {
      const candidate = c.semanticEvidence.candidates.find((other) => JSON.stringify(other.candidateId) === JSON.stringify(record.candidateId));
      const position = record.branch === 'direct' ? 'direct' : 'descendant';
      assert.deepEqual(compare({ candidate, file: fileByAddress.get(record.member.occurrenceAddress), position }), record.channels);
      compared += 1;
    }
  }
  assert.ok(compared > 50, `${compared} member comparisons`);
});

test('P8: the comparator reads only accepted Naming values behind the fact gate, never paths or positions it is not given', () => {
  const c = buildCatalogueCase({ files: [...files('tree', 'tree', 1), ...files('other', 'other', 1)] });
  const compare = createCandidateFileComparator({ sectionIntake: c.sectionIntake });
  const candidate = c.semanticEvidence.candidates.find((other) => c.pathOfAddress.get(other.candidateId.folderAddressPath) === 'tree');
  const outsider = c.factEvidence.occurrenceFacts.find((entry) => entry.path.startsWith('other/') && entry.occurrenceType === 'file');
  const result = compare({ candidate, file: outsider });
  assert.deepEqual(result.root, { result: 'foreign', familyRoot: 'other' });
  // Paths and folder names are not evidence: renaming them changes nothing.
  assert.deepEqual(compare({ candidate: { ...candidate, path: 'renamed' }, file: { ...outsider, path: 'tree/tree-9.logic.mjs' } }), result);
  // The fact gate comes first: an unavailable identity is never compared, whatever the intake holds.
  const gated = compare({ candidate, file: { ...outsider, facts: { ...outsider.facts, semanticIdentity: { state: 'unavailable' } } } });
  assert.deepEqual(gated.root, { result: 'not-evaluated', reason: 'run-unavailable' });
  // A cross-branch pair gets no direct or descendant position.
  const insider = c.factEvidence.occurrenceFacts.find((entry) => entry.path.startsWith('tree/') && entry.occurrenceType === 'file');
  assert.deepEqual(compare({ candidate, file: insider }).root, { result: 'match', ambiguity: 'singular' });
});
