// Naming token lexical-identity projection (bridge contract §4.7, §6.4; calculogic-validator#150).
// Naming-side tests: nothing here imports Tree (Linguistic Foundation shared contract §8.5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { projectNamingTokenLexicalIdentities } from '../src/naming-token-lexical-identity-projection.logic.mjs';
import { createNamingOccurrenceBridgePayload } from '../src/naming-occurrence-bridge-payload.logic.mjs';
import { prepareLinguisticFoundation } from '../../linguistic-foundation/src/linguistic-foundation.wiring.mjs';
import { resolveSurfaceForm } from '../../linguistic-foundation/src/linguistic-foundation-resolution.logic.mjs';

const english = prepareLinguisticFoundation({ profileSelection: { profileId: 'english' } }).profile;
const tuple = (occurrenceAddress) => ({ addressProfileId: 'tree-codebase', addressedSnapshotId: 'snapshot-001', occurrenceAddress });
const semanticEvidenceEnrichmentSection = {
  records: [
    { ...tuple('B.2'), repoRelativePath: 'naming/src/rules/naming-rule-check-a.logic.mjs', semanticTokens: ['naming', 'rule', 'check', 'a'], role: 'logic', roleCategory: 'concern-core', roleStatus: 'active' },
    { ...tuple('B.1'), repoRelativePath: 'naming/src/x.logic.mjs', role: 'logic', roleCategory: 'concern-core', roleStatus: 'active' },
  ],
};
const folderLabelObservationSection = {
  records: [
    { ...tuple('B'), repoRelativePath: 'naming/src/rules', parseOutcome: 'parsed', labelTokens: ['rules'], labelRoot: 'rules' },
    { ...tuple('A'), repoRelativePath: 'doc/ValidatorSpecs', parseOutcome: 'not-parsed', notParsedReasons: ['label-has-uppercase'] },
  ],
};

test('the section carries one record per eligible source record, aligned token by token, sorted by identity tuple', () => {
  const section = projectNamingTokenLexicalIdentities({ semanticEvidenceEnrichmentSection, folderLabelObservationSection, lexicalProfile: english });
  assert.deepEqual(Object.keys(section), ['contractVersion', 'producerId', 'source', 'identityTupleFields', 'lexicalProfile', 'recordCount', 'records']);
  assert.equal(section.contractVersion, 'naming-token-lexical-identity.v1');
  assert.equal(section.producerId, 'naming-token-lexical-identity');
  assert.deepEqual(section.lexicalProfile, { profileId: 'english', profileVersion: '1', lexiconDigest: english.lexiconDigest });
  // The record without `semanticTokens` and the not-parsed label get no record.
  assert.deepEqual(section.records.map((record) => [record.occurrenceAddress, record.tokenSource]), [['B', 'label-tokens'], ['B.2', 'semantic-tokens']]);
  assert.equal(section.recordCount, 2);
  const [label, file] = section.records;
  assert.equal(label.repoRelativePath, 'naming/src/rules');
  assert.deepEqual(file.tokens.map((entry) => entry.surface), ['naming', 'rule', 'check', 'a']);
  assert.deepEqual(file.tokens.map((entry) => entry.status), ['unknown', 'resolved', 'unknown', 'unknown']);
  assert.deepEqual(label.tokens, [{ surface: 'rules', status: 'resolved', readings: [{ lexemeId: 'english.rule', features: { number: 'plural' }, basis: 'lexicon-entry' }] }]);
});

test('every entry is exactly the foundation resolution of its token: Naming adds no lexical rule', () => {
  const section = projectNamingTokenLexicalIdentities({ semanticEvidenceEnrichmentSection, folderLabelObservationSection, lexicalProfile: english });
  for (const record of section.records) {
    for (const entry of record.tokens) {
      const { status, readings } = resolveSurfaceForm(english, entry.surface);
      assert.deepEqual({ status: entry.status, readings: entry.readings }, { status, readings: readings.map((reading) => ({ ...reading, features: { ...reading.features } })) }, entry.surface);
    }
  }
});

test('with no active profile, or no eligible record, the section is omitted', () => {
  assert.equal(projectNamingTokenLexicalIdentities({ semanticEvidenceEnrichmentSection, folderLabelObservationSection, lexicalProfile: null }), null);
  assert.equal(projectNamingTokenLexicalIdentities({ semanticEvidenceEnrichmentSection, folderLabelObservationSection }), null);
  assert.equal(projectNamingTokenLexicalIdentities({ semanticEvidenceEnrichmentSection: null, folderLabelObservationSection: { records: [folderLabelObservationSection.records[1]] }, lexicalProfile: english }), null);
});

test('the bridge payload producer adds the section only with a profile, and changes nothing else', () => {
  const input = {
    namingSemanticFamilyBridge: { observations: [] },
    addressedOccurrenceNamespace: {
      addressProfileId: 'tree-codebase',
      addressedSnapshotId: 'snapshot-001',
      occurrenceRecords: [
        { occurrenceAddress: 'A', addressPath: 'A', path: 'rules', name: 'rules', occurrenceType: 'folder', parentAddressPath: null },
        { occurrenceAddress: 'B', addressPath: 'B', path: 'Docs', name: 'Docs', occurrenceType: 'folder', parentAddressPath: null },
      ],
    },
    interpretFolderLabel: (label) => (label === 'rules' ? { parseOutcome: 'parsed', labelTokens: ['rules'], labelRoot: 'rules' } : { parseOutcome: 'not-parsed', notParsedReasons: ['label-has-uppercase'] }),
  };
  const without = createNamingOccurrenceBridgePayload(input);
  const withProfile = createNamingOccurrenceBridgePayload({ ...input, lexicalProfile: english });
  assert.equal('namingTokenLexicalIdentities' in without, false);
  const { namingTokenLexicalIdentities, ...rest } = withProfile;
  assert.deepEqual(rest, without);
  assert.deepEqual(namingTokenLexicalIdentities.records.map((record) => [record.occurrenceAddress, record.tokenSource]), [['A', 'label-tokens']]);
  // An invalid addressed namespace omits the section with the others.
  const invalid = createNamingOccurrenceBridgePayload({ ...input, addressedOccurrenceNamespace: { ...input.addressedOccurrenceNamespace, addressProfileId: '' }, lexicalProfile: english });
  assert.equal('namingTokenLexicalIdentities' in invalid, false);
});
