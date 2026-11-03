// Naming §4.8 repository-package label section (bridge contract §4.4 rule 9, §4.8, §6.5;
// calculogic-validator#159). Naming-side tests: nothing here imports Tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { projectNamingRepositoryPackageLabels, REPOSITORY_PACKAGE_LABEL_SECTION_VERSION } from '../src/naming-repository-package-label-projection.logic.mjs';
import { createNamingOccurrenceBridgePayload } from '../src/naming-occurrence-bridge-payload.logic.mjs';
import { interpretNamingFolderLabel } from '../src/rules/naming-rule-interpret-folder-label.logic.mjs';
import { prepareNamingRuntimeInputs } from '../src/naming-validator.wiring.mjs';

const { caseRulesRuntime } = prepareNamingRuntimeInputs();
const interpretFolderLabel = (label) => interpretNamingFolderLabel(label, { caseRulesRuntime });
const namespace = {
  addressProfileId: 'tree-codebase',
  addressedSnapshotId: 'snapshot-001',
  occurrenceRecords: [{ addressPath: 'F1', path: 'src', occurrenceType: 'folder', name: 'src' }],
};

test('one record per declared segment, scope then name, each the folder-label interpretation unchanged', () => {
  const section = projectNamingRepositoryPackageLabels({ repositoryPackageIdentity: { scope: 'acme', name: 'widget-kit' }, interpretFolderLabel });
  assert.deepEqual(section, {
    contractVersion: REPOSITORY_PACKAGE_LABEL_SECTION_VERSION,
    producerId: 'naming-repository-package-label',
    source: 'calculogic-validator/naming',
    recordCount: 2,
    records: [
      { element: 'scope', segment: 'acme', ...interpretFolderLabel('acme') },
      { element: 'name', segment: 'widget-kit', ...interpretFolderLabel('widget-kit') },
    ],
  });
  assert.deepEqual(section.records[1].labelTokens, ['widget', 'kit']);
  assert.equal('identityTupleFields' in section, false, 'payload-level: no identity tuple');
  for (const record of section.records) assert.equal(['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress', 'repoRelativePath'].some((field) => field in record), false);

  const unscoped = projectNamingRepositoryPackageLabels({ repositoryPackageIdentity: { scope: null, name: 'ledger' }, interpretFolderLabel });
  assert.deepEqual(unscoped.records.map((record) => record.element), ['name']);
  const notParsed = projectNamingRepositoryPackageLabels({ repositoryPackageIdentity: { scope: 'Acme', name: 'widget' }, interpretFolderLabel });
  assert.deepEqual(notParsed.records[0], { element: 'scope', segment: 'Acme', parseOutcome: 'not-parsed', notParsedReasons: ['label-has-uppercase'] });
});

test('no fact, a value that is not a §3.11 fact, or no interpreter: no section', () => {
  for (const identity of [undefined, null, {}, { name: '' }, { scope: '', name: 'x' }, { scope: 5, name: 'x' }, 'validator']) {
    assert.equal(projectNamingRepositoryPackageLabels({ repositoryPackageIdentity: identity, interpretFolderLabel }), null, JSON.stringify(identity));
  }
  assert.equal(projectNamingRepositoryPackageLabels({ repositoryPackageIdentity: { scope: null, name: 'x' } }), null);
});

test('the producer adds the section last, independently of the addressed namespace, and changes nothing else', () => {
  const base = createNamingOccurrenceBridgePayload({ addressedOccurrenceNamespace: namespace, interpretFolderLabel });
  const withFact = createNamingOccurrenceBridgePayload({ addressedOccurrenceNamespace: namespace, interpretFolderLabel, repositoryPackageIdentity: { scope: 'acme', name: 'widget' } });
  const { namingRepositoryPackageLabels, ...rest } = withFact;
  assert.deepEqual(rest, base, 'nothing else in the payload changes');
  assert.deepEqual(Object.keys(withFact).at(-1), 'namingRepositoryPackageLabels');
  assert.equal(namingRepositoryPackageLabels.recordCount, 2);
  assert.equal('namingRepositoryPackageLabels' in base, false, 'without a fact the payload is unchanged');

  const invalidNamespace = createNamingOccurrenceBridgePayload({ addressedOccurrenceNamespace: {}, interpretFolderLabel, repositoryPackageIdentity: { scope: null, name: 'widget' } });
  assert.equal(invalidNamespace.compatibility.addressedNamespaceValid, false);
  assert.equal(invalidNamespace.namingRepositoryPackageLabels.recordCount, 1, 'an invalid namespace does not omit the payload-level section');
});
