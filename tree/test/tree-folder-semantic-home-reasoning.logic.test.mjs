import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogueCase, files } from './fixtures/semantic-home-catalogue/semantic-home-catalogue.fixture.mjs';
import { prepareTreeFolderSemanticHomeReasoning } from '../src/tree-folder-semantic-home-reasoning.logic.mjs';
import { getBuiltinTreeSemanticHomeParameterSet } from '../src/registries/tree-semantic-home-parameter-set-loader.logic.mjs';
import { NOT_PREPARED_TREE_SEMANTIC_HOME_PARAMETER_SET } from '../src/tree-semantic-home-parameter-set.logic.mjs';

// The Stage 2A-i record (Tree spec S2.6, S2.7, S2.9): status, attribution and immutability.
const C6 = { files: [...files('app', 'app', 3), ...files('app/pricing', 'pricing', 8), ...files('app/pricing', 'app', 1)] };

test('Q1: status follows the parameter set one to one; only evaluated carries outcomes', () => {
  const { semanticEvidence, factEvidence, reasoning } = buildCatalogueCase(C6);
  assert.equal(reasoning.status, 'evaluated');
  assert.equal(reasoning.parameterSet, getBuiltinTreeSemanticHomeParameterSet());
  assert.equal(reasoning.semanticEvidenceSource, semanticEvidence);

  const unavailable = {
    registry: { registryId: 'tree/semantic-home-policy', version: '1', source: 'custom', digest: 'a'.repeat(64) },
    availability: 'configuration-unavailable',
    reason: 'parameter-set-absent',
    conformance: 'not-checked',
  };
  for (const [parameterSet, status] of [[unavailable, 'configuration-unavailable'], [NOT_PREPARED_TREE_SEMANTIC_HOME_PARAMETER_SET, 'not-prepared']]) {
    const record = prepareTreeFolderSemanticHomeReasoning({ semanticEvidence, factEvidence, parameterSet });
    assert.deepEqual(record, { source: 'tree-folder-semantic-home-reasoning', status, parameterSet });
  }
  assert.throws(() => prepareTreeFolderSemanticHomeReasoning({ semanticEvidence, factEvidence, parameterSet: { availability: 'other' } }), /Unknown/u);
});

test('the loaded parameter values decide: a stricter set changes outcomes, the evidence does not', () => {
  const builtin = getBuiltinTreeSemanticHomeParameterSet();
  const stricter = { ...builtin, parameters: { ...builtin.parameters, P_MIN_SUPPORT: { ...builtin.parameters.P_MIN_SUPPORT, value: 5 } } };
  const c = buildCatalogueCase({ files: files('auth', 'auth', 3) });
  assert.equal(c.outcomeAt('auth').outcome, 'eligible');
  const strict = buildCatalogueCase({ files: files('auth', 'auth', 3), parameterSet: stricter });
  assert.deepEqual([strict.outcomeAt('auth').outcome, strict.outcomeAt('auth').reasons], ['undetermined', ['insufficient-support']]);
});

test('Q2: a root-only match for a claim-unresolved nested candidate is attribution-undetermined', () => {
  const c = buildCatalogueCase({
    files: [...files('docs/tree-owned', 'tree', 7, { tokens: ['tree', 'notes'] }), ...files('docs/tree-owned', 'other', 2), ...files('docs', 'docs', 1)],
  });
  const byAttribution = Object.groupBy(c.attributionsAt('docs'), (record) => record.resolvedAttribution);
  assert.equal(byAttribution['attribution-undetermined'].length, 7);
  assert.ok(byAttribution['attribution-undetermined'].every((record) => record.reason === 'matches-undetermined-nested-candidate'));
  // The two `other` files are foreign for the nested candidate on both channels: retained.
  assert.equal(byAttribution.retained.length, 2);
  assert.deepEqual(byAttribution.retained[0].nestedOutcomes.map(({ outcome, reason }) => [outcome, reason]), [['undetermined', 'claim-unresolved']]);
});

test('Q2: missing evidence for a nested candidate is never a possible claim; the member is retained', () => {
  // `billing-api` is eligible; one `billing` file lacks N1 tokens, so its prefix comparison for
  // `billing-api` is not evaluated. It stays with `app` as contradiction (root `billing`, not `app`).
  const c = buildCatalogueCase({
    files: [
      ...files('app', 'app', 4),
      ...files('app/billing-api', 'billing', 3, { tokens: ['billing', 'api', 'x'] }),
      ...files('app/billing-api', 'billing', 1, { tokens: null }),
    ],
  });
  assert.equal(c.outcomeAt('app/billing-api').outcome, 'eligible');
  const records = c.attributionsAt('app');
  assert.deepEqual(records.map((record) => record.resolvedAttribution).sort(), ['reattributed', 'reattributed', 'reattributed', 'retained']);
  const retained = records.find((record) => record.resolvedAttribution === 'retained');
  assert.equal(retained.reason, 'no-eligible-matching-nested-candidate');
  assert.deepEqual(retained.originalComparison, { channel: 'root', result: 'foreign', familyRoot: 'billing' });
  assert.deepEqual(c.outcomeAt('app').decisionCounts.contradictionByRoot, { billing: 1 });
  assert.equal(c.outcomeAt('app').decisionCounts.attributionUndetermined.memberCount, 0);
});

test('deepest-first: a nested candidate is decided before every ancestor, three levels down', () => {
  const c = buildCatalogueCase({
    files: [...files('a', 'a', 2), ...files('a/pricing', 'pricing', 3), ...files('a/pricing/rates', 'rates', 4)],
  });
  assert.equal(c.outcomeAt('a/pricing/rates').outcome, 'eligible');
  assert.equal(c.outcomeAt('a/pricing').outcome, 'eligible');
  assert.deepEqual(c.outcomeAt('a/pricing').strengthProfile.reattributedMemberCount, 4);
  assert.deepEqual([c.outcomeAt('a').outcome, c.outcomeAt('a').decisionCounts.decisionMemberCount], ['eligible', 2]);
  // Reattributed to the deepest eligible matching candidate only.
  const rates = c.attributionsAt('a').filter((record) => record.path.includes('/rates/'));
  assert.ok(rates.every((record) => c.pathOfAddress.get(record.attributedTo[0].folderAddressPath) === 'a/pricing/rates'));
});

test('a member matching two eligible nested candidates is attributed to the deepest, the other listed', () => {
  const c = buildCatalogueCase({
    files: [...files('a', 'a', 2), ...files('a/billing', 'billing', 2), ...files('a/billing/billing', 'billing', 3)],
  });
  assert.equal(c.outcomeAt('a/billing').outcome, 'eligible');
  assert.equal(c.outcomeAt('a/billing/billing').outcome, 'eligible');
  const deep = c.attributionsAt('a').filter((record) => record.path.startsWith('a/billing/billing/'));
  assert.equal(deep.length, 3);
  for (const record of deep) {
    assert.deepEqual(record.attributedTo.map((id) => c.pathOfAddress.get(id.folderAddressPath)), ['a/billing/billing', 'a/billing']);
  }
});

test('Stage 1 records are read, never modified; the record is frozen and deterministic', () => {
  const first = buildCatalogueCase(C6);
  const before = JSON.stringify([first.semanticEvidence, first.factEvidence]);
  const again = prepareTreeFolderSemanticHomeReasoning({
    semanticEvidence: first.semanticEvidence,
    factEvidence: first.factEvidence,
    parameterSet: getBuiltinTreeSemanticHomeParameterSet(),
  });
  assert.equal(JSON.stringify([first.semanticEvidence, first.factEvidence]), before);
  assert.equal(Object.isFrozen(first.semanticEvidence), false);
  assert.ok(Object.isFrozen(again) && Object.isFrozen(again.candidateOutcomes) && Object.isFrozen(again.candidateOutcomes[0].decisionEvidence[0]));
  assert.ok(Object.isFrozen(again.memberAttributions[0].attributedTo));
  const strip = ({ parameterSet, semanticEvidenceSource, ...rest }) => rest;
  assert.deepEqual(strip(again), strip(first.reasoning));
  assert.equal(again.placements, undefined);
});
