import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogueCase, files } from './fixtures/semantic-home-catalogue/semantic-home-catalogue.fixture.mjs';

// The S2.11 contrast catalogue (`semantic-home-catalogue`, version 2), candidate outcomes only
// (Stage 2A-i). Placements are added by Stage 2A-ii. Expected values are S2.11's, under the Builtin
// values and E2.
const outcomeOf = (outcome) => [outcome.outcome, outcome.reasons[0]];
const governingCounts = (outcome) => {
  const { decisionMemberCount, support, contradictionByRoot } = outcome.decisionCounts;
  const contradiction = Object.values(contradictionByRoot).reduce((sum, n) => sum + n, 0);
  return { members: decisionMemberCount, support: support.singular + support.ambiguous, contradiction };
};

test('C1 clear home: eligible', () => {
  const c = buildCatalogueCase({ files: files('pricing', 'pricing', 6) });
  assert.deepEqual(outcomeOf(c.outcomeAt('pricing')), ['eligible', 'supported']);
});

test('C2 all foreign: not-eligible, share 0', () => {
  const c = buildCatalogueCase({ files: [...files('src', 'alpha', 3), ...files('src', 'beta', 3), ...files('src', 'gamma', 2)] });
  assert.deepEqual(outcomeOf(c.outcomeAt('src')), ['not-eligible', 'contradicted']);
  assert.equal(c.outcomeAt('src').strengthProfile.supportShare, 0);
});

test('C3 all unevaluated: undetermined on coverage, missing is never contradiction', () => {
  const c = buildCatalogueCase({ files: files('tests', 'x', 6, { noObservation: true }) });
  const outcome = c.outcomeAt('tests');
  assert.deepEqual(outcomeOf(outcome), ['undetermined', 'insufficient-evaluated-coverage']);
  assert.deepEqual(outcome.decisionCounts.missingByReason, { 'no-semantic-observation': 6 });
  assert.deepEqual(outcome.decisionCounts.contradictionByRoot, {});
});

test('C4 mixed: undetermined, mixed-evidence at 0.5', () => {
  const c = buildCatalogueCase({ files: [...files('shared', 'shared', 4), ...files('shared', 'other', 4)] });
  assert.deepEqual(outcomeOf(c.outcomeAt('shared')), ['undetermined', 'mixed-evidence']);
  assert.equal(c.outcomeAt('shared').strengthProfile.supportShare, 0.5);
});

test('C5 generic nested folder: src not-eligible, billing eligible on 7 of 7 with nothing reattributed', () => {
  const c = buildCatalogueCase({ files: [...files('billing', 'billing', 1), ...files('billing/src', 'billing', 6)] });
  assert.deepEqual(outcomeOf(c.outcomeAt('billing/src')), ['not-eligible', 'contradicted']);
  assert.deepEqual(outcomeOf(c.outcomeAt('billing')), ['eligible', 'supported']);
  assert.deepEqual(governingCounts(c.outcomeAt('billing')), { members: 7, support: 7, contradiction: 0 });
  assert.ok(c.attributionsAt('billing').every((record) => record.resolvedAttribution === 'retained'));
});

test('C6 eligible nested candidate, per member (Option B)', () => {
  const c = buildCatalogueCase({ files: [...files('app', 'app', 3), ...files('app/pricing', 'pricing', 8), ...files('app/pricing', 'app', 1)] });
  assert.deepEqual(outcomeOf(c.outcomeAt('app/pricing')), ['eligible', 'supported']);
  assert.deepEqual(governingCounts(c.outcomeAt('app/pricing')), { members: 9, support: 8, contradiction: 1 });
  assert.deepEqual(outcomeOf(c.outcomeAt('app')), ['eligible', 'supported']);
  assert.deepEqual(governingCounts(c.outcomeAt('app')), { members: 4, support: 4, contradiction: 0 });
  const byAttribution = Object.groupBy(c.attributionsAt('app'), (record) => record.resolvedAttribution);
  assert.equal(byAttribution.reattributed.length, 8);
  assert.equal(byAttribution.retained.length, 1);
  assert.ok(byAttribution.reattributed.every((record) => record.reason === 'matches-eligible-nested-candidate'));
  assert.equal(c.outcomeAt('app').strengthProfile.reattributedMemberCount, 8);
});

test('C7 undetermined nested candidate: ledger depends on audit, with both reference resolutions', () => {
  const c = buildCatalogueCase({ files: [...files('ledger/audit', 'audit', 5), ...files('ledger/audit', 'ledger', 5)] });
  assert.deepEqual(outcomeOf(c.outcomeAt('ledger/audit')), ['undetermined', 'mixed-evidence']);
  const ledger = c.outcomeAt('ledger');
  assert.deepEqual(outcomeOf(ledger), ['undetermined', 'depends-on-undetermined-nested-candidate']);
  assert.deepEqual(ledger.dependsOn.nestedCandidateIds.map((id) => c.pathOfAddress.get(id.folderAddressPath)), ['ledger/audit']);
  assert.deepEqual(ledger.dependsOn.retained, { outcome: 'undetermined', reason: 'mixed-evidence' });
  assert.deepEqual(ledger.dependsOn.removed, { outcome: 'eligible', reason: 'supported' });
  assert.equal(c.attributionsAt('ledger').filter((record) => record.resolvedAttribution === 'attribution-undetermined').length, 5);
});

const C8_FILES = [
  ...files('docs/tree-owned', 'tree', 7, { tokens: ['tree', 'notes'] }),
  ...files('docs/tree-owned', 'other', 2),
  ...files('tree', 'tree', 6),
];

test('C8 compound label, prefix unsupported: claim-unresolved with the root reading and a channel-disagreement note', () => {
  const c = buildCatalogueCase({ files: C8_FILES });
  const owned = c.outcomeAt('docs/tree-owned');
  assert.equal(owned.governingChannel, 'prefix');
  assert.deepEqual(outcomeOf(owned), ['undetermined', 'claim-unresolved']);
  assert.deepEqual(owned.rootReading, { outcome: 'eligible', reason: 'supported', counts: { support: 7, contradiction: 2, missing: 0 } });
  assert.deepEqual(owned.notes, ['channel-disagreement']);
  assert.deepEqual(outcomeOf(c.outcomeAt('tree')), ['eligible', 'supported']);
});

test('C9 same-folder agreement: both eligible, each corroborating the other, never pooled', () => {
  const c = buildCatalogueCase({ folders: [{ path: 'tree', context: 'tree' }], files: files('tree', 'tree', 5) });
  for (const [source, other] of [['label', 'naming-folder-semantic-context'], ['context', 'naming-folder-label']]) {
    const outcome = c.outcomeAt('tree', source);
    assert.deepEqual(outcomeOf(outcome), ['eligible', 'supported']);
    assert.equal(governingCounts(outcome).support, 5);
    assert.deepEqual(outcome.strengthProfile.corroboration.map(({ candidateId, outcome: o }) => [candidateId.candidateSource, o]), [[other, 'eligible']]);
  }
});

test('C10 same-folder candidates with different roots: independent, no corroboration', () => {
  const c = buildCatalogueCase({ folders: [{ path: 'kit', context: 'toolkit' }], files: [...files('kit', 'kit', 6), ...files('kit', 'other', 1)] });
  assert.deepEqual(outcomeOf(c.outcomeAt('kit')), ['eligible', 'supported']);
  assert.deepEqual(outcomeOf(c.outcomeAt('kit', 'context')), ['not-eligible', 'contradicted']);
  assert.deepEqual(c.outcomeAt('kit').strengthProfile.corroboration, []);
});

test('C11 home behind a termination: platform eligible on 5 of 5; pkg not-eligible and bounded', () => {
  const c = buildCatalogueCase({
    folders: [{ path: 'platform/pkg', packageRoot: 'pkg' }],
    files: [...files('platform', 'platform', 5), ...files('platform/pkg', 'platform', 4)],
  });
  assert.deepEqual(outcomeOf(c.outcomeAt('platform')), ['eligible', 'supported']);
  assert.equal(governingCounts(c.outcomeAt('platform')).members, 5);
  const pkg = c.outcomeAt('platform/pkg', 'package-root');
  assert.deepEqual(outcomeOf(pkg), ['not-eligible', 'contradicted']);
  assert.deepEqual(pkg.notes, ['bounded']);
});

test('C12 two eligible homes for one root, shared not-eligible', () => {
  const c = buildCatalogueCase({ files: [...files('services/billing', 'billing', 4), ...files('apps/billing', 'billing', 4), ...files('shared', 'billing', 1)] });
  assert.deepEqual(outcomeOf(c.outcomeAt('services/billing')), ['eligible', 'supported']);
  assert.deepEqual(outcomeOf(c.outcomeAt('apps/billing')), ['eligible', 'supported']);
  assert.deepEqual(outcomeOf(c.outcomeAt('shared')), ['not-eligible', 'contradicted']);
});

test('C13 candidate discovery incomplete: N2 not staged gives no label candidates; a rejected record gives none for its folder', () => {
  const tree = [...files('src', 'alpha', 3), ...files('src', 'beta', 3), ...files('src', 'gamma', 2), ...files('src', 'delta', 1)];
  assert.deepEqual(buildCatalogueCase({ files: tree, n2: 'not-staged' }).reasoning.candidateOutcomes, []);
  const rejected = buildCatalogueCase({ files: tree, n2: { rejected: 'src' } });
  assert.equal(rejected.sectionIntake.availability.folderLabelObservations, 'available');
  assert.ok(rejected.sectionIntake.folderLabelObservations.rejectedRecords.length > 0);
  assert.equal(rejected.outcomeAt('src'), undefined);
});

test('C14 ambiguity-heavy folder: eligible, the ambiguous share recorded', () => {
  const c = buildCatalogueCase({ files: files('registry-lifecycle', 'registry', 10, { tokens: ['registry', 'lifecycle', 'a', 'b'], ambiguous: true }) });
  const outcome = c.outcomeAt('registry-lifecycle');
  assert.deepEqual(outcomeOf(outcome), ['eligible', 'supported']);
  assert.deepEqual(outcome.decisionCounts.support, { singular: 0, ambiguous: 10 });
  assert.equal(outcome.strengthProfile.support.ambiguous, 10);
});

test('C15 bounded package root: ui eligible and bounded, packages has no active members', () => {
  const c = buildCatalogueCase({ folders: [{ path: 'packages/ui', packageRoot: 'ui' }], files: files('packages/ui', 'ui', 6) });
  const ui = c.outcomeAt('packages/ui', 'package-root');
  assert.deepEqual(outcomeOf(ui), ['eligible', 'supported']);
  assert.deepEqual(ui.notes, ['bounded']);
  assert.deepEqual(outcomeOf(c.outcomeAt('packages')), ['undetermined', 'no-active-members']);
});

test('C16 narrowing compound label: both eligible, the four files count for both', () => {
  const c = buildCatalogueCase({ files: [...files('billing', 'billing', 3), ...files('billing/billing-api', 'billing', 4, { tokens: ['billing', 'api', 'x'] })] });
  assert.deepEqual(outcomeOf(c.outcomeAt('billing')), ['eligible', 'supported']);
  assert.deepEqual(governingCounts(c.outcomeAt('billing')), { members: 7, support: 7, contradiction: 0 });
  assert.deepEqual(outcomeOf(c.outcomeAt('billing/billing-api')), ['eligible', 'supported']);
  assert.deepEqual(c.attributionsAt('billing'), []);
});

test('C17 single matching file: insufficient-support', () => {
  assert.deepEqual(outcomeOf(buildCatalogueCase({ files: files('ops', 'ops', 1) }).outcomeAt('ops')), ['undetermined', 'insufficient-support']);
});

test('C18 prefix not evaluable: eligible on 5 evaluated of 6', () => {
  const c = buildCatalogueCase({
    files: [...files('structural-addressing', 'structural', 5, { tokens: ['structural', 'addressing', 'x'] }), ...files('structural-addressing', 'structural', 1, { tokens: null })],
  });
  const outcome = c.outcomeAt('structural-addressing');
  assert.deepEqual(outcomeOf(outcome), ['eligible', 'supported']);
  assert.equal(outcome.strengthProfile.coverage, 5 / 6);
  assert.deepEqual(outcome.decisionCounts.missingByReason, { 'not-provided:group-omitted': 1 });
});

test('C19 genuinely unobservable folder: coverage 0.30 although every evaluated file matches', () => {
  const c = buildCatalogueCase({ files: [...files('reports', 'reports', 3), ...files('reports', 'x', 7, { noObservation: true })] });
  assert.deepEqual(outcomeOf(c.outcomeAt('reports')), ['undetermined', 'insufficient-evaluated-coverage']);
  assert.equal(c.outcomeAt('reports').strengthProfile.coverage, 0.3);
});

test('C20 two-file grouping: eligible, each occurrence counted once', () => {
  const outcome = buildCatalogueCase({ files: files('ops', 'ops', 2) }).outcomeAt('ops');
  assert.deepEqual(outcomeOf(outcome), ['eligible', 'supported']);
  assert.deepEqual(governingCounts(outcome), { members: 2, support: 2, contradiction: 0 });
});

test('C21-C24 the contradiction and eligibility bars, inclusive', () => {
  const at = (folder, own, other) => outcomeOf(buildCatalogueCase({ files: [...files(folder, folder, own), ...files(folder, 'other', other)] }).outcomeAt(folder));
  assert.deepEqual(at('lib', 1, 9), ['not-eligible', 'contradicted']);
  assert.deepEqual(at('cache', 1, 3), ['not-eligible', 'contradicted']);
  assert.deepEqual(at('queue', 4, 6), ['undetermined', 'mixed-evidence']);
  assert.deepEqual(at('auth', 3, 1), ['eligible', 'supported']);
});

test('C25 compound label, incidental root overlap: both readings contradicted, not-eligible', () => {
  const c = buildCatalogueCase({ files: [...files('docs/tree-owned', 'tree', 1, { tokens: ['tree', 'notes'] }), ...files('docs/tree-owned', 'other', 8)] });
  assert.deepEqual(outcomeOf(c.outcomeAt('docs/tree-owned')), ['not-eligible', 'contradicted']);
});

test('C26 subject compound with a root-only stray: eligible, never claim-unresolved', () => {
  const c = buildCatalogueCase({
    files: [
      ...files('billing-api', 'billing', 8, { tokens: ['billing', 'api', 'x'] }),
      ...files('billing-api', 'billing', 1, { tokens: ['billing', 'core'] }),
      ...files('billing-api', 'other', 1),
      ...files('billing', 'billing', 4),
    ],
  });
  assert.deepEqual(outcomeOf(c.outcomeAt('billing-api')), ['eligible', 'supported']);
  assert.equal(c.outcomeAt('billing-api').strengthProfile.supportShare, 0.8);
  assert.deepEqual(outcomeOf(c.outcomeAt('billing')), ['eligible', 'supported']);
});

test('C27 single-file ownership folder: claim-unresolved with an insufficient-support root reading', () => {
  const owned = buildCatalogueCase({ files: files('ops-owned', 'ops', 1, { tokens: ['ops', 'notes'] }) }).outcomeAt('ops-owned');
  assert.deepEqual(outcomeOf(owned), ['undetermined', 'claim-unresolved']);
  assert.deepEqual([owned.rootReading.outcome, owned.rootReading.reason], ['undetermined', 'insufficient-support']);
});

test('C28 unresolved claim and a real home elsewhere: outcomes as C8', () => {
  const c = buildCatalogueCase({ files: [...C8_FILES, ...files('docs', 'tree', 1, { tokens: ['tree', 'notes'] })] });
  assert.deepEqual(outcomeOf(c.outcomeAt('docs/tree-owned')), ['undetermined', 'claim-unresolved']);
  assert.deepEqual(outcomeOf(c.outcomeAt('tree')), ['eligible', 'supported']);
});

test('C29 invariant E2-I1: zero root matches never give claim-unresolved', () => {
  const owned = buildCatalogueCase({ files: [...files('audit-owned', 'other', 4), ...files('audit-owned', 'other', 4, { tokens: null })] }).outcomeAt('audit-owned');
  assert.deepEqual(outcomeOf(owned), ['not-eligible', 'contradicted']);
});

test('C30 opposite-direction removal: both reference resolutions not-eligible, the corner procedure undetermined', () => {
  const c = buildCatalogueCase({
    files: [
      ...files('ledger-sync', 'other', 1),
      ...files('ledger-sync/queue', 'queue', 1),
      ...files('ledger-sync/queue', 'queue', 1, { tokens: null }),
      ...files('ledger-sync/queue', 'other', 1, { tokens: null }),
    ],
  });
  assert.deepEqual(outcomeOf(c.outcomeAt('ledger-sync/queue')), ['undetermined', 'mixed-evidence']);
  const sync = c.outcomeAt('ledger-sync');
  assert.deepEqual(outcomeOf(sync), ['undetermined', 'depends-on-undetermined-nested-candidate']);
  for (const reference of [sync.dependsOn.retained, sync.dependsOn.removed]) {
    assert.deepEqual(reference, {
      outcome: 'not-eligible',
      reason: 'contradicted',
      readings: { prefix: { outcome: 'not-eligible', reason: 'contradicted' }, root: { outcome: 'not-eligible', reason: 'contradicted' } },
    });
  }
  const coverage = sync.decisionEvidence.find((check) => check.reading === 'prefix' && check.condition === 'coverage');
  assert.deepEqual(coverage, {
    reading: 'prefix',
    condition: 'coverage',
    comparator: '>=',
    bound: 0.5,
    corner: { removedSupport: 0, removedContradiction: 1, removedMissing: 0 },
    value: 1 / 3,
    holds: false,
  });
});
