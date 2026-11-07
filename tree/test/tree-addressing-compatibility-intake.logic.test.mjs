import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTreeAddressingCompatibilityIntake as qualify, prepareTreeNamingStagingCompatibility as staging } from '../src/tree-addressing-compatibility-intake.logic.mjs';

const namespace = { addressProfileId: 'tree-codebase@2', addressedSnapshotId: 'same-snapshot' };
const record = (occurrenceAddress = 'A') => ({ ...namespace, occurrenceAddress, path: 'pkg/core', repoRelativePath: 'pkg/core' });
const occurrences = [{ addressPath: 'A', path: 'pkg/core', occurrenceType: 'folder' }];
const run = (payload) => qualify({ payload, addressedNamespace: namespace, occurrenceRecords: occurrences });

test('different policies reject even with identical occurrence paths and addresses', () => {
  const old = { ...namespace, addressProfileId: 'tree-codebase@1' };
  const payload = { ...old, observations: [{ ...record(), ...old }] };
  assert.deepEqual(run(payload).observations, []);
  assert.equal(run(payload).diagnostics[0].reason, 'incompatible-addressing-namespace');
  assert.equal(run({ ...namespace, observations: [record()] }).observations.length, 1);
  // An incompatible envelope cannot be rescued by a record stamped with current identity.
  assert.deepEqual(run({ ...old, observations: [record()] }).observations, []);
});

test('missing and unknown namespace identities reject all addressed observations', () => {
  for (const payload of [undefined, null, false, {}, { ...namespace, addressProfileId: '' },
    { ...namespace, addressedSnapshotId: null }, { ...namespace, addressProfileId: 'unknown' },
    { ...namespace, addressedSnapshotId: 'another-snapshot' }]) {
    const result = run(payload);
    assert.deepEqual(result.observations, []);
    assert.equal(result.diagnostics.length, 1);
  }
});

test('mixed records qualify individually by explicit tuple and actual lookup, never path aliases', () => {
  const good = record();
  const foreign = { ...record(), addressProfileId: 'tree-codebase@1' };
  const missing = { ...record(), occurrenceAddress: undefined, addressPath: 'A' };
  const unmatched = { ...record('B'), addressPath: 'A' };
  const payload = { ...namespace, observations: [foreign, good, missing, unmatched] };
  const before = structuredClone(payload);
  const result = run(payload);
  assert.deepEqual(result.observations, [good]);
  assert.deepEqual(result.diagnostics.map((d) => d.reason).sort(), ['incompatible-addressing-namespace', 'invalid-addressing-identity', 'unmatched-addressing-identity']);
  assert.deepEqual(payload, before);
  assert.deepEqual(run({ ...payload, observations: [...payload.observations].reverse() }).diagnostics, result.diagnostics);
});

test('compatibility never applies B2 paths, semantic shape or duplicate rejection', () => {
  const first = { ...record(), repoRelativePath: null };
  const second = { ...record(), repoRelativePath: 'wrong/path', semanticName: null };
  assert.deepEqual(run({ ...namespace, observations: [first, second] }).observations, [first, second]);
});

test('addressed sections and context get diagnostics; independent sections are untouched', () => {
  const bad = { ...record(), addressProfileId: 'unknown' };
  const payload = { ...namespace, observations: [],
    namingSemanticEvidenceEnrichment: { records: [bad] }, namingFolderLabelObservations: { records: [bad] },
    namingTokenLexicalIdentities: { records: [bad] }, occurrenceContextEnrichment: { enrichedObservations: [bad] },
    namingRepositoryPackageLabels: { records: [{ value: 'independent' }] },
    namingRoleCategoryVocabulary: { value: 'independent' } };
  const before = structuredClone(payload);
  assert.equal(run(payload).diagnostics.length, 4);
  assert.deepEqual(payload, before);
});

test('legitimate unaddressed staging passes unchanged; explicit addressed framing is withheld', () => {
  const family = { observations: [{ path: 'pkg/core', familyRoot: 'core', addressPath: 'incidental' }] };
  const enrichment = { records: [{ path: 'pkg/core', semanticTokens: ['core'] }] };
  const safe = staging({ namingSemanticFamilyBridge: family, namingSemanticEvidenceEnrichment: enrichment });
  assert.equal(safe.namingSemanticFamilyBridge, family);
  assert.equal(safe.namingSemanticEvidenceEnrichment, enrichment);
  assert.deepEqual(safe.diagnostics, []);
  for (const framed of [{ bridgeContractVersion: 'naming-occurrence-bridge.v1', observations: [] }, { namingOccurrenceBridge: {} }]) {
    for (const field of ['namingSemanticFamilyBridge', 'namingSemanticEvidenceEnrichment']) {
      const result = staging({ [field]: framed });
      assert.equal(result[field], undefined);
      assert.equal(result.diagnostics[0].reason, 'addressed-payload-in-staging');
    }
  }
});

test('inherited envelope and tuple fields cannot satisfy compatibility admission', () => {
  for (const field of ['addressProfileId', 'addressedSnapshotId']) {
    const payload = { ...namespace, observations: [record()] };
    delete payload[field]; Object.setPrototypeOf(payload, { [field]: namespace[field] });
    const result = run(payload);
    assert.deepEqual(result.observations, []);
    assert.equal(result.diagnostics[0].reason, 'invalid-addressing-identity');
    assert.equal(Object.hasOwn(payload, field), false);
  }
  const inherited = ['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress'].map((field) => {
    const value = record(); const identity = value[field]; delete value[field];
    Object.setPrototypeOf(value, { [field]: identity }); return value;
  });
  const payload = { ...namespace, observations: [record(), ...inherited] };
  const result = run(payload);
  assert.deepEqual(result.observations, [payload.observations[0]]);
  assert.deepEqual(result.diagnostics.map((d) => d.reason), Array(3).fill('invalid-addressing-identity'));
  assert.deepEqual(run({ ...payload, observations: [...payload.observations].reverse() }).diagnostics, result.diagnostics);
});

test('marker-less addressed envelopes are withheld without rejecting incidental observation identities', () => {
  const addressed = record();
  for (const collection of ['observations', 'records']) {
    for (const framed of [
      { ...namespace, [collection]: [addressed] },
      { addressProfileId: namespace.addressProfileId, [collection]: [addressed] },
      { ...namespace, [collection]: [{ occurrenceAddress: 'A', path: 'pkg/core' }] },
      { addressProfileId: null, addressedSnapshotId: '', [collection]: [] },
    ]) {
      for (const field of ['namingSemanticFamilyBridge', 'namingSemanticEvidenceEnrichment']) {
        const result = staging({ [field]: framed });
        assert.equal(result[field], undefined);
        assert.equal(result.diagnostics[0].reason, 'addressed-payload-in-staging');
      }
    }
  }
  for (const ordinary of [
    { observations: [addressed] },
    { records: [addressed] },
    { ...namespace, observations: [{ path: 'pkg/core', familyRoot: 'core' }] },
    { addressProfileId: 'incidental', observations: [{ path: 'pkg/core', addressPath: 'A' }] },
  ]) {
    const result = staging({ namingSemanticFamilyBridge: ordinary });
    assert.equal(result.namingSemanticFamilyBridge, ordinary);
    assert.deepEqual(result.diagnostics, []);
  }
});

test('identity-only views preserve source-path ownership, prototypes and the original input', () => {
  const prototype = { addressProfileId: namespace.addressProfileId, repoRelativePath: 'inherited/path', semanticTokens: ['kept'] };
  const inherited = Object.assign(Object.create(prototype), { addressedSnapshotId: namespace.addressedSnapshotId, occurrenceAddress: 'A' });
  Object.defineProperty(inherited, 'path', { value: 'pkg/core', enumerable: true, writable: false });
  const payload = { ...namespace, observations: [inherited] };
  const view = run(payload).addressedPayload;
  assert.notEqual(view, payload);
  assert.equal(view.observations[0].addressProfileId, undefined);
  assert.equal(Object.getPrototypeOf(view.observations[0]), prototype);
  assert.equal(Object.hasOwn(view.observations[0], 'repoRelativePath'), false);
  assert.equal(view.observations[0].repoRelativePath, inherited.repoRelativePath);
  assert.equal(view.observations[0].semanticTokens, inherited.semanticTokens);
  assert.deepEqual(Object.getOwnPropertyDescriptor(view.observations[0], 'path'), Object.getOwnPropertyDescriptor(inherited, 'path'));
  assert.equal(Object.hasOwn(inherited, 'addressProfileId'), false);
  const ordinary = { ...namespace, observations: [record()] };
  assert.equal(run(ordinary).addressedPayload, ordinary);
});
