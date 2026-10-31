import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareTreeStructureAdvisorInputs, runTreeStructureAdvisor } from '../src/tree-structure-advisor.wiring.mjs';
import { prepareNamingTreeStagingInputs, runNamingValidator } from '../../naming/src/naming-validator.host.mjs';
import { getValidatorById } from '../../src/core/validator-registry.knowledge.mjs';

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
