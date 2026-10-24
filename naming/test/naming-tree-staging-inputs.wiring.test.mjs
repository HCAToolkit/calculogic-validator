import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareNamingTreeStagingInputs, projectNamingSemanticFamilyBridge } from '../src/naming-validator.host.mjs';
import { projectNamingSemanticEvidenceEnrichment } from '../src/naming-semantic-evidence-enrichment-projection.logic.mjs';
import { getBuiltinRegistryRoots } from '../../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { NAMING_BUILTIN_REGISTRY_ROOT } from '../src/registries/naming-registry-inventory.knowledge.mjs';

const runOutput = {
  findings: [
    {
      path: 'src/build-surface.logic.mjs',
      classification: 'canonical',
      details: {
        semanticName: 'build-surface',
        familyRoot: 'build',
        semanticFamily: 'build-surface',
        familySubgroup: 'surface',
        role: 'logic',
        roleCategory: 'concern-core',
        roleStatus: 'active',
      },
    },
  ],
};

// A Naming registry root whose case rules declare a style the interpreter cannot use.
const withUnsupportedCaseRules = (callback) => {
  const namingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'naming-tree-staging-'));
  try {
    fs.cpSync(NAMING_BUILTIN_REGISTRY_ROOT, namingRoot, { recursive: true });
    fs.writeFileSync(
      path.join(namingRoot, 'case-rules.registry.json'),
      `${JSON.stringify({ version: '1', semanticName: { style: 'camelCase' } }, null, 2)}\n`,
    );
    callback({ activeSet: 'builtin', registryRoots: { ...getBuiltinRegistryRoots(), naming: namingRoot } });
  } finally {
    fs.rmSync(namingRoot, { recursive: true, force: true });
  }
};

test('staging prepares R1 and the N1 source when called, plus a folder-label interpreter', () => {
  const staged = prepareNamingTreeStagingInputs(runOutput);

  assert.deepEqual(Object.keys(staged).sort(), ['interpretFolderLabel', 'namingSemanticEvidenceEnrichment', 'namingSemanticFamilyBridge']);
  assert.deepEqual(staged.namingSemanticFamilyBridge, projectNamingSemanticFamilyBridge(runOutput));
  assert.deepEqual(staged.namingSemanticEvidenceEnrichment, projectNamingSemanticEvidenceEnrichment(runOutput));
  assert.equal(staged.namingSemanticEvidenceEnrichment.records.length, 1);
  assert.equal(typeof staged.interpretFolderLabel, 'function');
  // Without a run resolution, the Builtin case rules apply.
  assert.deepEqual(staged.interpretFolderLabel('registry-lifecycle'), {
    parseOutcome: 'parsed',
    labelTokens: ['registry', 'lifecycle'],
    labelRoot: 'registry',
  });
});

test('only the interpreter case rules are lazy, and they come from the run registryResolution', () => {
  withUnsupportedCaseRules((registryResolution) => {
    // Staging itself succeeds: R1 and N1 do not depend on the case rules and are not deferred.
    const staged = prepareNamingTreeStagingInputs(runOutput, { registryResolution });
    assert.deepEqual(staged.namingSemanticFamilyBridge, projectNamingSemanticFamilyBridge(runOutput));
    assert.deepEqual(staged.namingSemanticEvidenceEnrichment, projectNamingSemanticEvidenceEnrichment(runOutput));
    // The first interpretation resolves the run's case rules, not the Builtin ones.
    assert.throws(() => staged.interpretFolderLabel('src'), /Invalid case-rules registry/);
  });
});
