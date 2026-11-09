import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareTreeStructureAdvisorInputs, runTreeStructureAdvisor } from '../src/tree-structure-advisor.wiring.mjs';
import { prepareNamingTreeStagingInputs, runNamingValidator } from '../../naming/src/naming-validator.host.mjs';
import { getValidatorById } from '../../src/core/validator-registry.knowledge.mjs';
import { prepareLinguisticFoundation } from '../../linguistic-foundation/src/linguistic-foundation.wiring.mjs';

const N1_KEY = 'namingSemanticEvidenceEnrichment';
const N2_KEY = 'namingFolderLabelObservations';

const withFixture = (callback) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-naming-section-intake-'));
  try {
    for (const relativePath of [
      'src/build/build-surface.logic.mjs',
      'src/build/build-surface.results.mjs',
      'src/Order_Flow/order-step.logic.mjs',
    ]) {
      fs.mkdirSync(path.join(fixtureRoot, path.dirname(relativePath)), { recursive: true });
      fs.writeFileSync(path.join(fixtureRoot, relativePath), 'export {};\n');
    }
    const staged = prepareNamingTreeStagingInputs(runNamingValidator(fixtureRoot, { scope: 'repo' }));
    callback({ fixtureRoot, staged });
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
};

// Prepared evidence carries functions created per run; compare them by name, everything else by value.
const comparable = (value) => {
  if (typeof value === 'function') return `[Function ${value.name}]`;
  if (value instanceof Map) return new Map([...value].map(([key, entry]) => [key, comparable(entry)]));
  if (value instanceof Set) return new Set([...value].map(comparable));
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, comparable(entry)]));
  return value;
};

const prepare = (fixtureRoot, options) => prepareTreeStructureAdvisorInputs(fixtureRoot, { scope: 'repo', ...options });

test('the default Tree path builds both sections with the staged inputs and accepts them', () => {
  withFixture(({ fixtureRoot, staged }) => {
    const { preparedDependencies } = prepare(fixtureRoot, staged);
    const payload = preparedDependencies.addressedNamingOccurrenceBridge;
    const intake = preparedDependencies.treeNamingSectionIntake;

    assert.equal(payload[N1_KEY].contractVersion, 'naming-semantic-evidence-enrichment.v1');
    assert.equal(payload[N2_KEY].contractVersion, 'naming-folder-label-observation.v1');
    assert.equal(intake.bridgeSource, 'tree-built');
    assert.deepEqual(intake.availability, {
      bridge: 'available',
      semanticEvidenceEnrichment: 'available',
      folderLabelObservations: 'available',
    });
    assert.equal(intake.semanticEvidenceEnrichment.acceptedRecords.length, 3);
    assert.deepEqual(
      intake.folderLabelObservations.acceptedRecords.map(({ repoRelativePath, parseOutcome }) => [repoRelativePath, parseOutcome]),
      payload[N2_KEY].records.map(({ repoRelativePath, parseOutcome }) => [repoRelativePath, parseOutcome]),
    );
    assert.equal(
      intake.folderLabelObservations.acceptedRecords.find((record) => record.repoRelativePath === 'src/Order_Flow').parseOutcome,
      'not-parsed',
    );
    assert.equal(intake.semanticEvidenceEnrichment.rejectedRecords.length + intake.folderLabelObservations.rejectedRecords.length, 0);
    assert.deepEqual(intake.diagnostics, []);
  });
});

test('standalone Tree builds neither section and reports every source not-staged', () => {
  withFixture(({ fixtureRoot }) => {
    const { preparedDependencies } = prepare(fixtureRoot, {});
    assert.equal(N1_KEY in preparedDependencies.addressedNamingOccurrenceBridge, false);
    assert.equal(N2_KEY in preparedDependencies.addressedNamingOccurrenceBridge, false);
    assert.deepEqual(preparedDependencies.treeNamingSectionIntake.availability, {
      bridge: 'not-staged',
      semanticEvidenceEnrichment: 'not-staged',
      folderLabelObservations: 'not-staged',
    });
  });
});

test('a caller-supplied payload is used as supplied: validated normally and never supplemented with staged evidence', () => {
  withFixture(({ fixtureRoot, staged }) => {
    const treeBuilt = prepare(fixtureRoot, staged).preparedDependencies.addressedNamingOccurrenceBridge;
    const { [N1_KEY]: n1Section, [N2_KEY]: n2Section, ...v1Only } = treeBuilt;

    // A complete payload with no runner staging at all: both sections are available.
    const complete = prepare(fixtureRoot, { namingOccurrenceBridge: treeBuilt }).preparedDependencies;
    assert.equal(complete.addressedNamingOccurrenceBridge, treeBuilt);
    assert.equal(complete.treeNamingSectionIntake.bridgeSource, 'caller-supplied');
    assert.deepEqual(complete.treeNamingSectionIntake.availability, {
      bridge: 'available',
      semanticEvidenceEnrichment: 'available',
      folderLabelObservations: 'available',
    });
    assert.equal(complete.treeNamingSectionIntake.semanticEvidenceEnrichment.acceptedRecords.length, n1Section.recordCount);
    assert.equal(complete.treeNamingSectionIntake.folderLabelObservations.acceptedRecords.length, n2Section.recordCount);

    // A payload without the sections, alongside staged inputs: the staged inputs are not used.
    let interpreterCalls = 0;
    const partial = prepare(fixtureRoot, {
      ...staged,
      interpretFolderLabel: (label) => {
        interpreterCalls += 1;
        return staged.interpretFolderLabel(label);
      },
      namingOccurrenceBridge: v1Only,
    }).preparedDependencies;
    assert.equal(partial.addressedNamingOccurrenceBridge, v1Only);
    assert.equal(interpreterCalls, 0);
    assert.deepEqual(partial.treeNamingSectionIntake.availability, {
      bridge: 'available',
      semanticEvidenceEnrichment: 'section-absent',
      folderLabelObservations: 'section-absent',
    });
  });
});

test('a caller-supplied payload from another address namespace yields no accepted section records', () => {
  withFixture(({ fixtureRoot, staged }) => {
    const treeBuilt = prepare(fixtureRoot, staged).preparedDependencies.addressedNamingOccurrenceBridge;
    const foreign = { addressProfileId: 'foreign-profile', addressedSnapshotId: 'foreign-snapshot' };
    const reNamespace = (record) => ({ ...record, ...foreign });
    const foreignPayload = {
      ...treeBuilt,
      ...foreign,
      observations: treeBuilt.observations.map(reNamespace),
      [N1_KEY]: { ...treeBuilt[N1_KEY], records: treeBuilt[N1_KEY].records.map(reNamespace) },
      [N2_KEY]: { ...treeBuilt[N2_KEY], records: treeBuilt[N2_KEY].records.map(reNamespace) },
    };
    const intake = prepare(fixtureRoot, { namingOccurrenceBridge: foreignPayload }).preparedDependencies.treeNamingSectionIntake;

    assert.equal(intake.semanticEvidenceEnrichment.acceptedRecords.length, 0);
    assert.equal(intake.folderLabelObservations.acceptedRecords.length, 0);
    assert.equal(intake.semanticEvidenceEnrichment.rejectedRecords.length, treeBuilt[N1_KEY].recordCount);
    assert.equal(intake.folderLabelObservations.rejectedRecords.length, treeBuilt[N2_KEY].recordCount);
    assert.ok([...intake.semanticEvidenceEnrichment.rejectedRecords, ...intake.folderLabelObservations.rejectedRecords]
      .every(({ reason }) => reason === 'unmatched-record'));
  });
});

test('existing Tree findings and prepared evidence are unchanged by the staged N1 source and interpreter', () => {
  withFixture(({ fixtureRoot, staged }) => {
    const r1Only = { namingSemanticFamilyBridge: staged.namingSemanticFamilyBridge };
    const without = prepare(fixtureRoot, r1Only);
    const withSections = prepare(fixtureRoot, staged);
    const sectionKeys = new Set(['addressedNamingOccurrenceBridge', 'treeNamingSectionIntake', 'treeFolderFactEvidence', 'treeFolderSemanticEvidence', 'treeFolderSemanticHomeReasoning', 'treeEmergentBoundaryReasoning']);

    for (const key of Object.keys(without.preparedDependencies).filter((key) => !sectionKeys.has(key))) {
      assert.deepEqual(comparable(withSections.preparedDependencies[key]), comparable(without.preparedDependencies[key]), key);
    }
    const { [N1_KEY]: _n1, [N2_KEY]: _n2, ...v1Part } = withSections.preparedDependencies.addressedNamingOccurrenceBridge;
    assert.deepEqual(v1Part, without.preparedDependencies.addressedNamingOccurrenceBridge);

    assert.deepEqual(
      runTreeStructureAdvisor(fixtureRoot, { scope: 'repo', ...staged }).findings,
      runTreeStructureAdvisor(fixtureRoot, { scope: 'repo', ...r1Only }).findings,
    );
  });
});

test('the default Tree path builds Stage 1B-i fact evidence from the intake for every addressed occurrence', () => {
  withFixture(({ fixtureRoot, staged }) => {
    const { preparedDependencies, structuralAddressSnapshot } = prepare(fixtureRoot, staged);
    const evidence = preparedDependencies.treeFolderFactEvidence;

    assert.equal(evidence.availability, preparedDependencies.treeNamingSectionIntake.availability);
    assert.equal(evidence.occurrenceFacts.length, structuralAddressSnapshot.occurrenceRecords.length);
    assert.equal(
      evidence.compositionObservations.length,
      structuralAddressSnapshot.occurrenceRecords.filter((record) => record.occurrenceType === 'folder').length,
    );
    const orderFlow = evidence.compositionObservations.find((observation) => observation.path === 'src/Order_Flow');
    assert.deepEqual(orderFlow.label, { state: 'not-parsed', notParsedReasons: ['label-has-unsupported-character', 'label-has-uppercase'] });
    assert.equal(orderFlow.directMembers.fileCount, 1);
    assert.ok(evidence.occurrenceFacts.filter((entry) => entry.occurrenceType === 'file').every((entry) => entry.facts.semanticIdentity.state !== 'unavailable'));

    // Standalone Tree: the same structure, with every Naming-dependent fact unavailable.
    const standalone = prepare(fixtureRoot, {}).preparedDependencies.treeFolderFactEvidence;
    assert.ok(standalone.occurrenceFacts.filter((entry) => entry.occurrenceType === 'file').every((entry) => entry.facts.semanticIdentity.state === 'unavailable'));
    assert.ok(standalone.compositionObservations.every((observation) => observation.label.reason === 'run-unavailable'));
  });
});

test('the default Tree path builds Stage 1B-ii candidate evidence on the 1B-i record, held by reference', () => {
  withFixture(({ fixtureRoot, staged }) => {
    const { preparedDependencies } = prepare(fixtureRoot, staged);
    const evidence = preparedDependencies.treeFolderSemanticEvidence;

    assert.equal(evidence.availability, preparedDependencies.treeNamingSectionIntake.availability);
    assert.equal(evidence.diagnostics, preparedDependencies.treeNamingSectionIntake.diagnostics);
    assert.equal(evidence.compositionObservations, preparedDependencies.treeFolderFactEvidence.compositionObservations);
    // `src` and `build` parse; `Order_Flow` does not, so it proposes no candidate.
    assert.deepEqual(evidence.candidates.map((candidate) => candidate.path), ['src', 'src/build']);
    const build = evidence.candidates.find((candidate) => candidate.path === 'src/build');
    assert.deepEqual([build.facets.activeMemberCount, build.facets.channels.root.foreignByRoot], [2, {}]);
    assert.equal(build.references.folderKindEvidence.source, 'tree-folder-kind-evidence');

    assert.deepEqual(prepare(fixtureRoot, {}).preparedDependencies.treeFolderSemanticEvidence.candidates, []);
  });
});

test('the Tree registry hook forwards the staged N1 source and interpreter to Tree', () => {
  withFixture(({ fixtureRoot, staged }) => {
    const interpretedLabels = [];
    let n1RecordsRead = false;
    const n1Source = {
      get records() {
        n1RecordsRead = true;
        return staged.namingSemanticEvidenceEnrichment.records;
      },
    };

    getValidatorById('tree-structure-advisor').run(fixtureRoot, {
      scope: 'repo',
      namingSemanticFamilyBridge: staged.namingSemanticFamilyBridge,
      namingSemanticEvidenceEnrichment: n1Source,
      interpretFolderLabel: (label) => {
        interpretedLabels.push(label);
        return staged.interpretFolderLabel(label);
      },
    });

    assert.equal(n1RecordsRead, true);
    assert.deepEqual([...new Set(interpretedLabels)].sort(), ['Order_Flow', 'build', 'src']);
  });
});

test('B2 unverified v1 diagnostics retain their prepared alias without public report effects', () => {
  withFixture(({ fixtureRoot, staged }) => {
    const verified = prepare(fixtureRoot, staged).preparedDependencies.addressedNamingOccurrenceBridge;
    const unverified = structuredClone(verified);
    delete unverified.observations[0].repoRelativePath;
    const options = { scope: 'repo', ...staged, namingOccurrenceBridge: unverified };
    const deps = prepare(fixtureRoot, options).preparedDependencies;
    const intake = deps.treeNamingSectionIntake;
    assert.equal(intake.diagnostics.filter((d) => d.reason === 'source-path-unverified').length, 1);
    assert.equal(deps.treeFolderSemanticEvidence.diagnostics, intake.diagnostics);
    assert.equal(intake.bridgeObservations.rejectedRecords.length, 0);
    const verifiedOptions = { scope: 'repo', ...staged, namingOccurrenceBridge: verified };
    assert.deepEqual(runTreeStructureAdvisor(fixtureRoot, options), runTreeStructureAdvisor(fixtureRoot, verifiedOptions));
    assert.deepEqual(getValidatorById('tree-structure-advisor').run(fixtureRoot, options),
      getValidatorById('tree-structure-advisor').run(fixtureRoot, verifiedOptions));
  });
});

test('Stage 1 diagnoses foreign envelopes and mixed records without alias recovery or supplementation', () => {
  withFixture(({ fixtureRoot, staged }) => {
    const baseline = prepare(fixtureRoot, staged).preparedDependencies.addressedNamingOccurrenceBridge;
    const foreign = structuredClone(baseline);
    foreign.addressProfileId = 'tree-structure-advisor-address-profile';
    const before = structuredClone(foreign);
    const rejected = prepare(fixtureRoot, { ...staged, namingOccurrenceBridge: foreign }).preparedDependencies;
    assert.equal(rejected.addressedNamingOccurrenceBridge, foreign);
    assert.equal(rejected.treeNamingSectionIntake.bridgeObservations.acceptedRecords.length, 0);
    assert.deepEqual(rejected.addressedNamingSemanticEvidenceBridge.observations, []);
    assert.equal(rejected.treeNamingOccurrenceBridgeIntake.status, 'recognized-with-diagnostics');
    assert.equal(rejected.treeNamingOccurrenceBridgeIntake.usedForCurrentTreeJoins, false);
    assert.ok(rejected.treeNamingOccurrenceBridgeIntake.diagnostics.some((d) => d.reason === 'incompatible-addressing-namespace'));
    assert.deepEqual(foreign, before);
    const mixed = structuredClone(baseline);
    mixed.observations[0].addressProfileId = 'tree-codebase@2';
    const deps = prepare(fixtureRoot, { namingOccurrenceBridge: mixed }).preparedDependencies;
    assert.equal(deps.treeNamingSectionIntake.bridgeObservations.acceptedRecords.length, mixed.observations.length - 1);
    assert.equal(deps.addressedNamingSemanticEvidenceBridge.observations.length, mixed.observations.length - 1);
    assert.equal(deps.treeFolderSemanticEvidence.diagnostics, deps.treeNamingSectionIntake.diagnostics);
  });
});

test('Stage 1 keeps legitimate staging distinct from malformed addressed input and wrong-slot envelopes', () => {
  withFixture(({ fixtureRoot, staged }) => {
    const original = prepare(fixtureRoot, staged).preparedDependencies.addressedNamingOccurrenceBridge;
    assert.ok(original.observations.length > 0);
    const framed = prepare(fixtureRoot, { ...staged, namingSemanticFamilyBridge: original }).preparedDependencies;
    assert.ok(framed.treeNamingOccurrenceBridgeIntake.diagnostics.some((d) => d.reason === 'addressed-payload-in-staging'));
    assert.equal(framed.addressedNamingOccurrenceBridge.observations.some((o) => o.semanticName === original.observations[0].semanticName), false);
    for (const value of [null, false, '', 0]) {
      const deps = prepare(fixtureRoot, { ...staged, namingOccurrenceBridge: value }).preparedDependencies;
      assert.equal(deps.addressedNamingOccurrenceBridge, value);
      assert.equal(deps.treeNamingSectionIntake.bridgeSource, null);
      assert.deepEqual(deps.addressedNamingSemanticEvidenceBridge.observations, []);
      assert.ok(deps.treeNamingOccurrenceBridgeIntake.diagnostics.some((d) => d.reason === 'invalid-addressing-identity'));
    }
  });
});

test('Stage 1 compatibility diagnostics remain prepared-only on the public Tree runtime path', () => {
  withFixture(({ fixtureRoot, staged }) => {
    const payload = prepare(fixtureRoot, staged).preparedDependencies.addressedNamingOccurrenceBridge;
    const foreign = { ...payload, addressProfileId: 'unknown' };
    const options = { namingOccurrenceBridge: foreign };
    assert.ok(prepare(fixtureRoot, options).preparedDependencies.treeNamingOccurrenceBridgeIntake.diagnostics.length);
    const report = runTreeStructureAdvisor(fixtureRoot, { scope: 'repo', ...options });
    assert.equal(JSON.stringify(report).includes('incompatible-addressing-namespace'), false);
    assert.equal(Object.hasOwn(report, 'diagnostics'), false);
  });
});

test('Stage 1 inherited namespace fields reject every addressed route without modifying the payload', () => {
  withFixture(({ fixtureRoot, staged }) => {
    const lexicalProfile = prepareLinguisticFoundation({ profileSelection: { profileId: 'english' } }).profile;
    const baseline = prepare(fixtureRoot, { ...staged, lexicalProfile }).preparedDependencies.addressedNamingOccurrenceBridge;
    assert.ok(baseline.namingTokenLexicalIdentities.records.length);
    for (const field of ['addressProfileId', 'addressedSnapshotId']) {
      const payload = structuredClone(baseline);
      const inherited = payload[field]; delete payload[field]; Object.setPrototypeOf(payload, { [field]: inherited });
      const deps = prepare(fixtureRoot, { namingOccurrenceBridge: payload }).preparedDependencies;
      for (const key of ['bridgeObservations', 'semanticEvidenceEnrichment', 'folderLabelObservations']) {
        assert.deepEqual(deps.treeNamingSectionIntake[key].acceptedRecords, []);
      }
      assert.deepEqual(deps.treeLexicalIdentityIntake.acceptedRecords, []);
      assert.deepEqual(deps.addressedNamingSemanticEvidenceBridge.observations, []);
      assert.ok(deps.treeNamingOccurrenceBridgeIntake.diagnostics.some((d) => d.reason === 'invalid-addressing-identity'));
      assert.equal(deps.addressedNamingOccurrenceBridge, payload);
      assert.equal(Object.hasOwn(payload, field), false);
      assert.equal(payload[field], inherited);
    }
  });
});

test('Stage 1 inherited record identity is not admitted by v1, N1, N2 or lexical intake', () => {
  withFixture(({ fixtureRoot, staged }) => {
    const lexicalProfile = prepareLinguisticFoundation({ profileSelection: { profileId: 'english' } }).profile;
    const baseline = prepare(fixtureRoot, { ...staged, lexicalProfile }).preparedDependencies;
    const payload = baseline.addressedNamingOccurrenceBridge;
    for (const [section, resultKey] of [[null, 'bridgeObservations'], [N1_KEY, 'semanticEvidenceEnrichment'], [N2_KEY, 'folderLabelObservations'], ['namingTokenLexicalIdentities', null]]) {
      for (const field of ['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress']) {
        const changed = structuredClone(payload);
        const target = section ? changed[section].records[0] : changed.observations[0];
        const inherited = target[field]; delete target[field]; Object.setPrototypeOf(target, { [field]: inherited });
        const deps = prepare(fixtureRoot, { namingOccurrenceBridge: changed }).preparedDependencies;
        const before = resultKey ? baseline.treeNamingSectionIntake[resultKey] : baseline.treeLexicalIdentityIntake;
        const after = resultKey ? deps.treeNamingSectionIntake[resultKey] : deps.treeLexicalIdentityIntake;
        assert.equal(after.acceptedRecords.length, before.acceptedRecords.length - 1, `${section}/${field}`);
        assert.ok(deps.treeNamingOccurrenceBridgeIntake.diagnostics.some((d) => d.reason === 'invalid-addressing-identity'));
        assert.equal(Object.hasOwn(target, field), false);
        assert.equal(target[field], inherited);
      }
    }
  });
});

test('Stage 1 marker-less addressed staging is withheld while incidental observation fields remain permitted', () => {
  withFixture(({ fixtureRoot, staged }) => {
    const baseline = prepare(fixtureRoot, staged).preparedDependencies.addressedNamingOccurrenceBridge;
    const malformed = structuredClone(baseline); delete malformed.bridgeContractVersion;
    const rejected = prepare(fixtureRoot, { ...staged, namingSemanticFamilyBridge: malformed }).preparedDependencies;
    assert.ok(rejected.treeNamingOccurrenceBridgeIntake.diagnostics.some((d) => d.reason === 'addressed-payload-in-staging'));
    assert.equal(rejected.addressedNamingOccurrenceBridge.observations.some((o) => o.semanticName === baseline.observations[0].semanticName), false);
    assert.equal(Object.hasOwn(malformed, 'bridgeContractVersion'), false);
    const ordinary = { observations: staged.namingSemanticFamilyBridge.observations.map((o) => ({
      ...o, addressProfileId: 'incidental-profile', addressedSnapshotId: 'incidental-snapshot', occurrenceAddress: 'incidental-address',
    })) };
    const admitted = prepare(fixtureRoot, { ...staged, namingSemanticFamilyBridge: ordinary }).preparedDependencies;
    assert.equal(admitted.treeNamingSectionIntake.bridgeObservations.acceptedRecords.length, baseline.observations.length);
    assert.equal(admitted.treeNamingOccurrenceBridgeIntake.diagnostics.some((d) => d.reason === 'addressed-payload-in-staging'), false);
  });
});

test('C1 revision 1 rejects legacy evidence on every addressed route even when coordinates match', () => {
  withFixture(({ fixtureRoot, staged }) => {
    const lexicalProfile = prepareLinguisticFoundation({ profileSelection: { profileId: 'english' } }).profile;
    const source = { observations: [...staged.namingSemanticFamilyBridge.observations, {
      path: 'src/build', occurrenceType: 'folder', semanticName: 'build', semanticFamily: 'build', familyRoot: 'build', semanticEvidenceKind: 'semantic-family-root-folder',
    }] };
    const baseline = prepare(fixtureRoot, { ...staged, namingSemanticFamilyBridge: source, lexicalProfile }).preparedDependencies;
    const payload = baseline.addressedNamingOccurrenceBridge;
    assert.equal(payload.addressProfileId, 'tree-codebase@1');
    assert.equal(payload.addressedSnapshotId, 'tree-structure-advisor-current-snapshot');
    assert.ok(baseline.treeFamilyRootFolderEvidence.evidenceRecords.length);
    assert.ok(baseline.treeLexicalIdentityIntake.acceptedRecords.length);
    for (const profile of ['tree-structure-advisor-address-profile', 'tree-codebase@2', 'tree-codebase@01']) {
      const foreign = structuredClone(payload); foreign.addressProfileId = profile;
      for (const records of [foreign.observations, foreign[N1_KEY].records, foreign[N2_KEY].records, foreign.namingTokenLexicalIdentities.records, foreign.occurrenceContextEnrichment?.enrichedObservations ?? []]) {
        for (const record of records) record.addressProfileId = profile;
      }
      const deps = prepare(fixtureRoot, { namingOccurrenceBridge: foreign }).preparedDependencies;
      assert.deepEqual(foreign.observations.map((r) => [r.path, r.occurrenceAddress]), payload.observations.map((r) => [r.path, r.occurrenceAddress]));
      for (const section of ['bridgeObservations', 'semanticEvidenceEnrichment', 'folderLabelObservations']) assert.deepEqual(deps.treeNamingSectionIntake[section].acceptedRecords, []);
      assert.deepEqual(deps.treeLexicalIdentityIntake.acceptedRecords, []);
      assert.deepEqual(deps.treeFamilyRootFolderEvidence.evidenceRecords, []);
      assert.deepEqual(deps.treeSemanticNamingFolderTypeRelationshipEvidence.relationshipRecords, []);
      assert.ok(deps.treeNamingOccurrenceBridgeIntake.diagnostics.some((d) => d.reason === 'incompatible-addressing-namespace'));
    }
  });
});

test('malformed selected paths cannot crash legacy projection or hide the v1/N1 rejection cascade', () => {
  withFixture(({ fixtureRoot, staged }) => {
    const baseline = prepare(fixtureRoot, staged).preparedDependencies;
    const payload = baseline.addressedNamingOccurrenceBridge;
    const sameIdentity = (left, right) => ['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress'].every((field) => left[field] === right[field]);
    const index = payload.observations.findIndex((record) => record.occurrenceType === 'file' &&
      record.repoRelativePath === 'src/build/build-surface.results.mjs' && payload[N1_KEY].records.some((n1) => sameIdentity(n1, record)));
    assert.notEqual(index, -1, 'fixture requires an addressed file and an N1 record with the same complete tuple');
    const source = payload.observations[index];
    const n1 = payload[N1_KEY].records.find((record) => sameIdentity(record, source));
    const control = prepare(fixtureRoot, { namingOccurrenceBridge: payload }).preparedDependencies;
    assert.ok(control.treeNamingSectionIntake.bridgeObservations.acceptedRecords.some((record) => sameIdentity(record, source)));
    assert.ok(control.treeNamingSectionIntake.semanticEvidenceEnrichment.acceptedRecords.some((record) => sameIdentity(record, n1)));
    assert.ok(control.addressedNamingSemanticEvidenceBridge.observations.some((record) => sameIdentity(record, source)));
    for (const value of [1, true, {}, []]) {
      const malformed = structuredClone(payload); malformed.observations[index].repoRelativePath = value;
      const before = structuredClone(malformed);
      const deps = prepare(fixtureRoot, { namingOccurrenceBridge: malformed }).preparedDependencies;
      assert.equal(deps.addressedNamingOccurrenceBridge, malformed);
      assert.equal(deps.treeNamingSectionIntake.bridgeObservations.rejectedRecords.find(({ identityTuple }) => sameIdentity(identityTuple, source))?.reason, 'invalid-source-path');
      assert.equal(deps.treeNamingSectionIntake.semanticEvidenceEnrichment.rejectedRecords.find(({ identityTuple }) => sameIdentity(identityTuple, n1))?.reason, 'unmatched-record');
      assert.deepEqual(malformed[N1_KEY].records.find((record) => sameIdentity(record, n1)), n1);
      assert.equal(deps.addressedNamingSemanticEvidenceBridge.observations.some((record) => sameIdentity(record, source)), false);
      assert.deepEqual(malformed, before);
    }
    for (const [label, value] of [['undefined', undefined], ['null', null], ['empty', ''], ['escape', '../escape'], ['mismatch', 'different/path']]) {
      const malformed = structuredClone(payload); malformed.observations[index].repoRelativePath = value;
      const before = structuredClone(malformed);
      const deps = prepare(fixtureRoot, { namingOccurrenceBridge: malformed }).preparedDependencies;
      assert.equal(deps.treeNamingSectionIntake.bridgeObservations.rejectedRecords.find(({ identityTuple }) => sameIdentity(identityTuple, source))?.reason,
        label === 'mismatch' ? 'path-mismatch' : 'invalid-source-path');
      assert.equal(deps.treeNamingSectionIntake.semanticEvidenceEnrichment.rejectedRecords.find(({ identityTuple }) => sameIdentity(identityTuple, n1))?.reason, 'unmatched-record');
      const legacy = deps.addressedNamingSemanticEvidenceBridge.observations.find((record) => sameIdentity(record, source));
      assert.ok(legacy, 'B2-only rejection must not automatically remove legacy evidence');
      assert.equal(legacy.path, value ?? source.path);
      assert.deepEqual(malformed, before);
    }
    const omitted = structuredClone(payload); delete omitted.observations[index].repoRelativePath;
    const omittedIntake = prepare(fixtureRoot, { namingOccurrenceBridge: omitted }).preparedDependencies.treeNamingSectionIntake;
    assert.ok(omittedIntake.bridgeObservations.acceptedRecords.some((record) => sameIdentity(record, source)));
    assert.ok(omittedIntake.semanticEvidenceEnrichment.acceptedRecords.some((record) => sameIdentity(record, n1)));
    assert.ok(omittedIntake.diagnostics.some(({ reason, identityTuple }) => reason === 'source-path-unverified' && sameIdentity(identityTuple, source)));
    for (const shape of ['incompatible', 'missing', 'inherited-envelope', 'inherited-record']) {
      const foreign = structuredClone(payload); foreign.observations[index].repoRelativePath = 1;
      if (shape === 'incompatible') foreign.addressProfileId = 'tree-codebase@2';
      else if (shape === 'missing') delete foreign.addressProfileId;
      else {
        const record = shape === 'inherited-envelope' ? foreign : foreign.observations[index];
        const identity = record.addressProfileId; delete record.addressProfileId; Object.setPrototypeOf(record, { addressProfileId: identity });
      }
      const deps = prepare(fixtureRoot, { namingOccurrenceBridge: foreign }).preparedDependencies;
      assert.equal(deps.treeNamingSectionIntake.bridgeObservations.acceptedRecords.some((record) => sameIdentity(record, source)), false);
      assert.equal(deps.treeNamingSectionIntake.semanticEvidenceEnrichment.acceptedRecords.some((record) => sameIdentity(record, n1)), false);
      assert.equal(deps.addressedNamingSemanticEvidenceBridge.observations.some((record) => sameIdentity(record, source)), false);
      assert.ok(deps.treeNamingOccurrenceBridgeIntake.diagnostics.some(({ reason }) => ['invalid-addressing-identity', 'incompatible-addressing-namespace'].includes(reason)));
    }
  });
});
