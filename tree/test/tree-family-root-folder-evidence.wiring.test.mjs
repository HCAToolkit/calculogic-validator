// Tree slice spec S2.13 (calculogic-validator#102): the retired `treeSemanticHomeEvidence` is replaced by
// `treeFamilyRootFolderEvidence` without changing what Tree classifies. These tests hold the behaviour
// the migration must preserve: a family-root repository-top folder stays a semantic root, its
// classification parity still matches, and replacement readiness stays `candidate-ready`.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareTreeStructureAdvisorInputs } from '../src/tree-structure-advisor.wiring.mjs';
import { prepareTreeFamilyRootFolderEvidence } from '../src/tree-family-root-folder-evidence.logic.mjs';
import { prepareTreeFolderKindEvidence } from '../src/tree-folder-kind-evidence.logic.mjs';
import { prepareTreeOccurrenceClassificationReplacementRuntime } from '../src/tree-occurrence-classification.logic.mjs';

const FAMILY_ROOT_FOLDER = 'calculogic-doc-engine';

// The Calculogic_React_App case: a workspace package at the repository top whose name Naming reads
// as a family root, and no structural home.
const prepareFamilyRootRepositoryTop = () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-family-root-folder-evidence-'));
  try {
    fs.writeFileSync(path.join(fixtureDir, 'package.json'), JSON.stringify({ name: 'root', private: true, workspaces: [FAMILY_ROOT_FOLDER] }));
    fs.mkdirSync(path.join(fixtureDir, FAMILY_ROOT_FOLDER));
    fs.writeFileSync(path.join(fixtureDir, FAMILY_ROOT_FOLDER, 'package.json'), `{"name":"${FAMILY_ROOT_FOLDER}"}\n`);
    return prepareTreeStructureAdvisorInputs(fixtureDir, {
      scope: 'repo',
      namingSemanticFamilyBridge: {
        observations: [{
          path: FAMILY_ROOT_FOLDER,
          occurrenceType: 'folder',
          semanticName: FAMILY_ROOT_FOLDER,
          familyRoot: 'calculogic',
          semanticFamily: FAMILY_ROOT_FOLDER,
          semanticEvidenceKind: 'semantic-family-root-folder',
          familyRootQualification: 'package-root-folder',
        }],
      },
    });
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
};

const collectKeys = (value, keys = new Set()) => {
  if (!value || typeof value !== 'object') return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    collectKeys(child, keys);
  }
  return keys;
};

test('a family-root repository-top folder keeps its semantic-root classification, parity and readiness', () => {
  const { structuralAddressSnapshot, preparedDependencies } = prepareFamilyRootRepositoryTop();

  const [evidence] = preparedDependencies.treeFamilyRootFolderEvidence.evidenceRecords;
  assert.equal(evidence.path, FAMILY_ROOT_FOLDER);
  assert.equal(evidence.relationshipPerspective, 'semantic-repository-top-family-home');
  assert.equal(evidence.semanticFamily, FAMILY_ROOT_FOLDER);

  const folderKind = preparedDependencies.treeFolderKindEvidence.evidenceRecords.find((record) => record.path === FAMILY_ROOT_FOLDER);
  assert.equal(folderKind.folderKind, 'semantic');
  assert.equal(folderKind.folderKindEvidenceStrength, 'derived-from-naming-family-root-evidence');
  assert.equal(folderKind.semanticFamily, FAMILY_ROOT_FOLDER);

  const classification = preparedDependencies.treeOccurrenceClassificationReplacementRuntime
    .classifyOccurrenceRecords(structuralAddressSnapshot.occurrenceRecords)
    .find((record) => record.path === FAMILY_ROOT_FOLDER && record.occurrenceType === 'folder');
  assert.equal(classification.structuralClass, 'repo-top-semantic-root');
  assert.equal(classification.isSemanticRoot, true);

  const parity = preparedDependencies.treeOccurrenceClassificationParityEvidence.parityRecords.find((record) => record.path === FAMILY_ROOT_FOLDER);
  assert.equal(parity.parityStatus, 'matches');
  assert.equal(parity.replacementFamilyRootSemanticFamily, FAMILY_ROOT_FOLDER);
  assert.equal(preparedDependencies.treeOccurrenceClassificationParitySummary.differedRecords, 0);
  assert.equal(preparedDependencies.treeOccurrenceClassificationReplacementReadiness.replacementDecision, 'candidate-ready');
});

test('prepared dependencies carry no retired `semanticHome` key', () => {
  const { preparedDependencies } = prepareFamilyRootRepositoryTop();
  const keys = collectKeys(preparedDependencies);
  for (const retired of ['semanticHome', 'semanticHomeSource', 'semanticHomeEvidenceStrength', 'replacementSemanticHome', 'treeSemanticHomeEvidence']) {
    assert.equal(keys.has(retired), false, `${retired} is retired (S2.13)`);
  }
});

test('a Custom folder-kinds registry without `semantic` still classifies the family-root folder as a semantic root', () => {
  const addressedOccurrenceRecords = [
    { addressPath: 'A', parentAddressPath: null, path: FAMILY_ROOT_FOLDER, resolvedPath: FAMILY_ROOT_FOLDER, name: FAMILY_ROOT_FOLDER, occurrenceType: 'folder' },
  ];
  const relationshipEvidence = {
    relationshipRecords: [{
      addressPath: 'A',
      path: FAMILY_ROOT_FOLDER,
      occurrenceType: 'folder',
      relationshipPerspective: 'semantic-repository-top-family-home',
      semanticName: FAMILY_ROOT_FOLDER,
      semanticFamily: FAMILY_ROOT_FOLDER,
      familyRoot: 'calculogic',
    }],
  };
  const treeStructuralHomeEvidence = { source: 'test', evidenceRecords: [] };
  const treeFamilyRootFolderEvidence = prepareTreeFamilyRootFolderEvidence({
    addressedOccurrenceRecords,
    namingSemanticEvidenceRecords: [],
    treeSemanticNamingFolderTypeRelationshipEvidence: relationshipEvidence,
  });
  const treeFolderKindEvidence = prepareTreeFolderKindEvidence({
    addressedOccurrenceRecords,
    treeStructuralHomeEvidence,
    treeFamilyRootFolderEvidence,
    folderKindsRegistry: { version: '1', folderKinds: [{ folderKind: 'structural' }, { folderKind: 'unspecified' }] },
  });
  assert.equal(treeFolderKindEvidence.evidenceRecords[0].folderKind, 'unspecified');

  const [classification] = prepareTreeOccurrenceClassificationReplacementRuntime({
    treeStructuralHomeEvidence,
    treeFamilyRootFolderEvidence,
    treeFolderKindEvidence,
    treeRepoShapePolicy: { allowedTopLevelDirectories: [] },
  }).classifyOccurrenceRecords(addressedOccurrenceRecords);
  assert.equal(classification.structuralClass, 'repo-top-semantic-root');
  assert.equal(classification.isRepoShapeAllowedTopLevelDirectory, true);
});
