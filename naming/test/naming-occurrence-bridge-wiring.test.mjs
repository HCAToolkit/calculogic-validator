import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  projectNamingOccurrenceBridge,
  projectNamingSemanticFamilyBridge,
  runNamingValidator,
} from '../src/naming-validator.host.mjs';

const createRuntimeOutput = () => ({
  findings: [
    {
      path: 'src/build-surface.logic.mjs',
      classification: 'canonical',
      details: {
        semanticName: 'build-surface',
        familyRoot: 'build',
        semanticFamily: 'build-surface',
        familySubgroup: 'surface',
      },
    },
  ],
});

const validNamespace = {
  addressProfileId: 'tree-codebase',
  addressedSnapshotId: 'snapshot-001',
  occurrenceRecords: [
    {
      repoRelativePath: 'src/build-surface.logic.mjs',
      path: 'src/build-surface.logic.mjs',
      occurrenceAddress: 'A.1',
      addressPath: 'A.1',
      occurrenceType: 'file',
    },
  ],
};

test('projectNamingOccurrenceBridge produces versioned payload without changing path-keyed semantic-family bridge', () => {
  const runtimeOutput = createRuntimeOutput();
  const pathKeyedBridgeBefore = projectNamingSemanticFamilyBridge(runtimeOutput);

  const occurrenceBridge = projectNamingOccurrenceBridge(runtimeOutput, {
    addressedOccurrenceNamespace: validNamespace,
  });

  assert.equal(occurrenceBridge.bridgeContractVersion, 'naming-occurrence-bridge.v1');
  assert.equal(occurrenceBridge.compatibility.pathKeyedSemanticPayloadPreserved, true);
  assert.deepEqual(projectNamingSemanticFamilyBridge(runtimeOutput), pathKeyedBridgeBefore);
  assert.deepEqual(pathKeyedBridgeBefore, {
    observations: [
      {
        path: 'src/build-surface.logic.mjs',
        semanticName: 'build-surface',
        familyRoot: 'build',
        semanticFamily: 'build-surface',
        familySubgroup: 'surface',
      },
    ],
  });
});

test('projectNamingOccurrenceBridge attaches addresses for a valid namespace and omits Tree conclusions', () => {
  const occurrenceBridge = projectNamingOccurrenceBridge(createRuntimeOutput(), {
    addressedOccurrenceNamespace: validNamespace,
  });

  assert.deepEqual(occurrenceBridge.observations, [
    {
      addressProfileId: 'tree-codebase',
      addressedSnapshotId: 'snapshot-001',
      occurrenceAddress: 'A.1',
      repoRelativePath: 'src/build-surface.logic.mjs',
      path: 'src/build-surface.logic.mjs',
      addressPath: 'A.1',
      occurrenceType: 'file',
      semanticName: 'build-surface',
      semanticFamily: 'build-surface',
      familyRoot: 'build',
      familySubgroup: 'surface',
    },
  ]);

  const forbiddenTreeConclusionFields = [
    'semanticHome',
    'structuralHome',
    'folderKind',
    'placementConfidence',
    'scatter',
    'cluster',
    'drift',
  ];
  for (const field of forbiddenTreeConclusionFields) {
    assert.equal(Object.hasOwn(occurrenceBridge.observations[0], field), false);
  }
});

test('projectNamingOccurrenceBridge keeps missing namespace diagnostics visible with empty address-attached observations', () => {
  const occurrenceBridge = projectNamingOccurrenceBridge(createRuntimeOutput());

  assert.equal(occurrenceBridge.addressProfileId, null);
  assert.equal(occurrenceBridge.addressedSnapshotId, null);
  assert.deepEqual(occurrenceBridge.observations, []);
  assert.equal(occurrenceBridge.compatibility.addressedNamespaceValid, false);
  assert.deepEqual(
    occurrenceBridge.diagnostics.map((diagnostic) => diagnostic.reason),
    ['missing-address-profile-id', 'missing-addressed-snapshot-id'],
  );
});

test('runNamingValidator stages occurrence bridge only when an addressed namespace is supplied', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'naming-occurrence-bridge-wiring-'));
  try {
    fs.mkdirSync(path.join(tempRoot, 'src'));
    fs.writeFileSync(path.join(tempRoot, 'src', 'build-surface.logic.mjs'), 'export const value = true;\n');

    const withoutNamespace = runNamingValidator(tempRoot, { scope: 'repo' });
    assert.equal(Object.hasOwn(withoutNamespace, 'namingOccurrenceBridge'), false);

    const withNamespace = runNamingValidator(tempRoot, {
      scope: 'repo',
      addressedOccurrenceNamespace: validNamespace,
    });

    assert.equal(withNamespace.namingOccurrenceBridge.bridgeContractVersion, 'naming-occurrence-bridge.v1');
    assert.equal(withNamespace.namingOccurrenceBridge.observations.length, 1);
    assert.equal(Object.hasOwn(withNamespace.namingOccurrenceBridge, 'occurrenceContextEnrichment'), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('projectNamingOccurrenceBridge preserves existing Naming disambiguation evidence when present', () => {
  const runtimeOutput = {
    findings: [
      {
        path: 'src/host/app-host.logic.mjs',
        classification: 'canonical',
        details: {
          semanticName: 'app-host',
          familyRoot: 'app',
          semanticFamily: 'app-host',
          disambiguation: {
            roleLikeFolderTokens: ['host'],
            roleLikeSemanticTokens: ['host'],
          },
        },
      },
    ],
  };

  const occurrenceBridge = projectNamingOccurrenceBridge(runtimeOutput, {
    addressedOccurrenceNamespace: {
      addressProfileId: 'tree-codebase',
      addressedSnapshotId: 'snapshot-001',
      occurrenceRecords: [
        {
          repoRelativePath: 'src/host/app-host.logic.mjs',
          path: 'src/host/app-host.logic.mjs',
          occurrenceAddress: 'A.2',
          addressPath: 'A.2',
        },
      ],
    },
  });

  assert.deepEqual(occurrenceBridge.observations[0].disambiguation, {
    roleLikeFolderTokens: ['host'],
    roleLikeSemanticTokens: ['host'],
  });
  assert.deepEqual(occurrenceBridge.occurrenceContextEnrichment.enrichedObservations[0].disambiguationNotes, [
    { code: 'role-like-folder-token', message: 'Role-like folder token: host', source: 'naming' },
    { code: 'role-like-semantic-token', message: 'Role-like semantic token: host', source: 'naming' },
  ]);
});


test('projectNamingOccurrenceBridge forwards evidenceLimitNotes from canonical findings through normal projection', () => {
  const runtimeOutput = {
    findings: [
      {
        path: 'src/limited-source.logic.mjs',
        classification: 'canonical',
        details: {
          semanticName: 'limited-source',
          familyRoot: 'limited',
          semanticFamily: 'limited-source',
          evidenceLimitNotes: [
            { code: 'z-limit', message: 'Z limit', source: 'naming' },
            { code: 'source-limit', message: 'Source limit', source: 'naming' },
            { code: 'source-limit', message: 'Source limit', source: 'naming' },
          ],
        },
      },
    ],
  };

  const projectedBridge = projectNamingSemanticFamilyBridge(runtimeOutput);
  assert.deepEqual(projectedBridge.observations[0].evidenceLimitNotes, [
    { code: 'z-limit', message: 'Z limit', source: 'naming' },
    { code: 'source-limit', message: 'Source limit', source: 'naming' },
    { code: 'source-limit', message: 'Source limit', source: 'naming' },
  ]);

  const occurrenceBridge = projectNamingOccurrenceBridge(runtimeOutput, {
    addressedOccurrenceNamespace: {
      addressProfileId: 'tree-codebase',
      addressedSnapshotId: 'snapshot-001',
      occurrenceRecords: [
        {
          repoRelativePath: 'src/limited-source.logic.mjs',
          path: 'src/limited-source.logic.mjs',
          occurrenceAddress: 'A.3',
          addressPath: 'A.3',
        },
      ],
    },
  });

  assert.deepEqual(occurrenceBridge.occurrenceContextEnrichment.enrichedObservations[0].evidenceLimitNotes, [
    { code: 'source-limit', message: 'Source limit', source: 'naming' },
    { code: 'z-limit', message: 'Z limit', source: 'naming' },
  ]);
  assert.equal(Object.hasOwn(occurrenceBridge.observations[0], 'evidenceLimitNotes'), false);
});

test('runNamingValidator with an addressed namespace carries the Naming semantic-evidence enrichment section (#87)', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'naming-semantic-evidence-wiring-'));
  try {
    fs.mkdirSync(path.join(tempRoot, 'src'));
    fs.writeFileSync(path.join(tempRoot, 'src', 'build-surface.logic.mjs'), 'export const value = true;\n');

    const withoutNamespace = runNamingValidator(tempRoot, { scope: 'repo' });
    assert.equal(Object.hasOwn(withoutNamespace, 'namingOccurrenceBridge'), false);

    const { namingOccurrenceBridge } = runNamingValidator(tempRoot, {
      scope: 'repo',
      addressedOccurrenceNamespace: validNamespace,
    });
    assert.deepEqual(namingOccurrenceBridge.namingSemanticEvidenceEnrichment, {
      contractVersion: 'naming-semantic-evidence-enrichment.v1',
      producerId: 'naming-semantic-evidence-enrichment',
      source: 'calculogic-validator/naming',
      identityTupleFields: ['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress'],
      recordCount: 1,
      records: [
        {
          addressProfileId: 'tree-codebase',
          addressedSnapshotId: 'snapshot-001',
          occurrenceAddress: 'A.1',
          repoRelativePath: 'src/build-surface.logic.mjs',
          semanticTokens: ['build', 'surface'],
          role: 'logic',
          roleCategory: 'concern-core',
          roleStatus: 'active',
        },
      ],
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('projectNamingOccurrenceBridge honors a caller-supplied enrichment source and leaves the path-keyed bridge unchanged', () => {
  const runtimeOutput = createRuntimeOutput();
  const pathKeyedBridgeBefore = projectNamingSemanticFamilyBridge(runtimeOutput);

  const derived = projectNamingOccurrenceBridge(runtimeOutput, { addressedOccurrenceNamespace: validNamespace });
  // The runtime output carries no tokens or role facts, so Naming's own projection yields no section.
  assert.equal(Object.hasOwn(derived, 'namingSemanticEvidenceEnrichment'), false);

  const supplied = projectNamingOccurrenceBridge(runtimeOutput, {
    addressedOccurrenceNamespace: validNamespace,
    namingSemanticEvidenceEnrichment: {
      records: [{ path: 'src/build-surface.logic.mjs', semanticTokens: ['build', 'surface'] }],
    },
  });
  assert.deepEqual(
    supplied.namingSemanticEvidenceEnrichment.records.map(({ occurrenceAddress, semanticTokens }) => ({ occurrenceAddress, semanticTokens })),
    [{ occurrenceAddress: 'A.1', semanticTokens: ['build', 'surface'] }],
  );
  assert.deepEqual(projectNamingSemanticFamilyBridge(runtimeOutput), pathKeyedBridgeBefore);
});

const folderNamespace = {
  addressProfileId: 'tree-codebase',
  addressedSnapshotId: 'snapshot-001',
  occurrenceRecords: [
    { repoRelativePath: 'src', path: 'src', name: 'src', addressPath: 'A', occurrenceType: 'folder' },
    { repoRelativePath: 'src/123-folder', path: 'src/123-folder', name: '123-folder', addressPath: 'A.1', occurrenceType: 'folder' },
    { repoRelativePath: 'src/_builtin', path: 'src/_builtin', name: '_builtin', addressPath: 'A.2', occurrenceType: 'folder' },
  ],
};

const outcomesOf = (bridge) =>
  bridge.namingFolderLabelObservations.records.map(({ repoRelativePath, parseOutcome }) => [repoRelativePath, parseOutcome]);

test('runNamingValidator with an addressed namespace carries the folder-label section (#91)', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'naming-folder-label-wiring-'));
  try {
    fs.mkdirSync(path.join(tempRoot, 'src', '_builtin'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'src', 'build-surface.logic.mjs'), 'export const value = true;\n');

    assert.equal(Object.hasOwn(runNamingValidator(tempRoot, { scope: 'repo' }), 'namingOccurrenceBridge'), false);

    const { namingOccurrenceBridge } = runNamingValidator(tempRoot, { scope: 'repo', addressedOccurrenceNamespace: folderNamespace });
    assert.equal(namingOccurrenceBridge.namingFolderLabelObservations.contractVersion, 'naming-folder-label-observation.v1');
    assert.deepEqual(outcomesOf(namingOccurrenceBridge), [
      ['src', 'parsed'],
      ['src/123-folder', 'parsed'],
      ['src/_builtin', 'not-parsed'],
    ]);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('projectNamingOccurrenceBridge uses the supplied case rules, falls back to Builtin, and honors a caller interpreter', () => {
  const runtimeOutput = createRuntimeOutput();

  // Outside a run: Builtin case rules.
  assert.deepEqual(outcomesOf(projectNamingOccurrenceBridge(runtimeOutput, { addressedOccurrenceNamespace: folderNamespace })), [
    ['src', 'parsed'],
    ['src/123-folder', 'parsed'],
    ['src/_builtin', 'not-parsed'],
  ]);

  // A supplied case-rules runtime is the one the interpreter applies (a hand-built stricter pattern
  // fails closed for a label the reason vocabulary cannot describe).
  const stricterRuntime = { semanticName: { style: 'kebab-case', pattern: /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/ } };
  assert.throws(
    () => projectNamingOccurrenceBridge(runtimeOutput, { addressedOccurrenceNamespace: folderNamespace, caseRulesRuntime: stricterRuntime }),
    /not-parsed reason vocabulary cannot describe/,
  );

  const supplied = projectNamingOccurrenceBridge(runtimeOutput, {
    addressedOccurrenceNamespace: folderNamespace,
    interpretFolderLabel: () => ({ parseOutcome: 'parsed', labelTokens: ['x'], labelRoot: 'x' }),
  });
  assert.deepEqual(supplied.namingFolderLabelObservations.records.map((record) => record.labelRoot), ['x', 'x', 'x']);
});
