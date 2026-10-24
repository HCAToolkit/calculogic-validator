import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  TREE_NAMING_EVIDENCE_STRENGTHS,
  deriveTreeNamingEvidenceStrength,
} from '../src/tree-naming-evidence-strength.logic.mjs';
import { prepareTreeStructureAdvisorInputs } from '../src/tree-structure-advisor.wiring.mjs';
import { createNamingOccurrenceBridgePayload } from '../../naming/src/naming-occurrence-bridge-payload.logic.mjs';

const AMBIGUITY = ['family-boundary-heuristic'];
const SPLIT = ['family-root-observed-multiple-families'];

test('Tree derives Naming evidence strength from each limiting fact on its own', () => {
  assert.equal(deriveTreeNamingEvidenceStrength({}), TREE_NAMING_EVIDENCE_STRENGTHS.HIGH);
  assert.equal(deriveTreeNamingEvidenceStrength({ ambiguityFlags: [] }), TREE_NAMING_EVIDENCE_STRENGTHS.HIGH);
  assert.equal(deriveTreeNamingEvidenceStrength({ ambiguityFlags: AMBIGUITY }), TREE_NAMING_EVIDENCE_STRENGTHS.BOUNDED);
  assert.equal(deriveTreeNamingEvidenceStrength({ splitFamilyFlags: SPLIT }), TREE_NAMING_EVIDENCE_STRENGTHS.BOUNDED);
  assert.equal(
    deriveTreeNamingEvidenceStrength({ ambiguityFlags: AMBIGUITY, splitFamilyFlags: SPLIT }),
    TREE_NAMING_EVIDENCE_STRENGTHS.BOUNDED,
  );
  // A Naming-authored strength is not an input: only the source facts are.
  assert.equal(deriveTreeNamingEvidenceStrength({ evidenceStrength: 'bounded' }), TREE_NAMING_EVIDENCE_STRENGTHS.HIGH);
  assert.equal(
    deriveTreeNamingEvidenceStrength({ evidenceStrength: 'high', ambiguityFlags: AMBIGUITY }),
    TREE_NAMING_EVIDENCE_STRENGTHS.BOUNDED,
  );
});

const FILES = {
  'src/order-payment-flow-step.logic.mjs': {
    semanticName: 'order-payment-flow-step',
    semanticFamily: 'order-payment',
    familyRoot: 'order',
    familySubgroup: 'payment-flow',
    ambiguityFlags: AMBIGUITY,
    disambiguation: { roleLikeSemanticTokens: ['flow'] },
  },
  'src/build-surface.logic.mjs': { semanticName: 'build-surface', semanticFamily: 'build-surface', familyRoot: 'build', familySubgroup: 'surface', splitFamilyFlags: SPLIT },
  'src/app-shell.logic.mjs': { semanticName: 'app-shell', semanticFamily: 'app-shell', familyRoot: 'app', familySubgroup: 'shell' },
};

const withFixture = (run) => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-naming-evidence-strength-'));
  try {
    fs.mkdirSync(path.join(fixtureDir, 'src'));
    fs.writeFileSync(path.join(fixtureDir, 'package.json'), '{"name":"fixture","private":true}\n');
    for (const filePath of Object.keys(FILES)) {
      fs.writeFileSync(path.join(fixtureDir, filePath), 'export {};\n');
    }
    return run(fixtureDir);
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
};

const namingSemanticFamilyBridge = {
  observations: Object.entries(FILES).map(([filePath, fields]) => ({ path: filePath, ...structuredClone(fields) })),
};

const assertAmbiguityReachesTree = (preparedDependencies) => {
  const bridgeByPath = new Map(
    preparedDependencies.addressedNamingOccurrenceBridge.observations.map((observation) => [observation.path, observation]),
  );
  const evidenceByPath = new Map(
    preparedDependencies.addressedNamingSemanticEvidenceBridge.observations.map((observation) => [observation.path, observation]),
  );
  const strengthByPath = new Map(
    preparedDependencies.treeSemanticHomeEvidence.evidenceRecords.map((record) => [record.path, record.semanticHomeEvidenceStrength]),
  );

  // The transported payload keeps both source facts separately and never carries a strength.
  assert.deepEqual(bridgeByPath.get('src/order-payment-flow-step.logic.mjs').ambiguityFlags, AMBIGUITY);
  assert.equal('splitFamilyFlags' in bridgeByPath.get('src/order-payment-flow-step.logic.mjs'), false);
  assert.deepEqual(bridgeByPath.get('src/build-surface.logic.mjs').splitFamilyFlags, SPLIT);
  assert.equal('ambiguityFlags' in bridgeByPath.get('src/build-surface.logic.mjs'), false);
  for (const observation of bridgeByPath.values()) {
    assert.equal('evidenceStrength' in observation, false);
  }
  // Built from Naming's source observations, not from a prepared view: source-only fields survive.
  assert.deepEqual(bridgeByPath.get('src/order-payment-flow-step.logic.mjs').disambiguation, { roleLikeSemanticTokens: ['flow'] });

  // The prepared view keeps them too.
  assert.deepEqual(evidenceByPath.get('src/order-payment-flow-step.logic.mjs').ambiguityFlags, AMBIGUITY);
  assert.deepEqual(evidenceByPath.get('src/build-surface.logic.mjs').splitFamilyFlags, SPLIT);

  // Tree's strength follows the facts.
  assert.deepEqual(Object.fromEntries(strengthByPath), {
    'src/app-shell.logic.mjs': 'high',
    'src/build-surface.logic.mjs': 'bounded',
    'src/order-payment-flow-step.logic.mjs': 'bounded',
  });
};

test('default Tree wiring: Naming ambiguity facts survive to Tree evidence (#82)', () => {
  withFixture((fixtureDir) => {
    const prepared = prepareTreeStructureAdvisorInputs(fixtureDir, { scope: 'repo', namingSemanticFamilyBridge });
    assertAmbiguityReachesTree(prepared.preparedDependencies);
  });
});

test('caller-supplied occurrence bridge: Naming ambiguity facts survive to Tree evidence (#82)', () => {
  withFixture((fixtureDir) => {
    const { structuralAddressSnapshot, preparedDependencies } = prepareTreeStructureAdvisorInputs(fixtureDir, { scope: 'repo' });
    const namingOccurrenceBridge = createNamingOccurrenceBridgePayload({
      namingSemanticFamilyBridge,
      addressedOccurrenceNamespace: {
        addressProfileId: preparedDependencies.addressedNamingOccurrenceBridge.addressProfileId,
        addressedSnapshotId: preparedDependencies.addressedNamingOccurrenceBridge.addressedSnapshotId,
        occurrenceRecords: structuralAddressSnapshot.occurrenceRecords,
      },
    });

    const prepared = prepareTreeStructureAdvisorInputs(fixtureDir, {
      scope: 'repo',
      namingSemanticFamilyBridge,
      namingOccurrenceBridge,
    });
    assert.equal(prepared.preparedDependencies.addressedNamingOccurrenceBridge, namingOccurrenceBridge);
    assertAmbiguityReachesTree(prepared.preparedDependencies);
  });
});

test('relationship evidence takes its strength from the Tree rule; relationship-qualified semantic homes stay bounded', () => {
  const strengthsFor = (extraFacts) => {
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-naming-relationship-strength-'));
    try {
      fs.writeFileSync(path.join(fixtureDir, 'package.json'), JSON.stringify({ name: 'root', private: true, workspaces: ['widget'] }));
      fs.mkdirSync(path.join(fixtureDir, 'widget'));
      fs.writeFileSync(path.join(fixtureDir, 'widget', 'package.json'), '{"name":"widget"}\n');
      const { preparedDependencies } = prepareTreeStructureAdvisorInputs(fixtureDir, {
        scope: 'repo',
        namingSemanticFamilyBridge: {
          observations: [{
            path: 'widget',
            occurrenceType: 'folder',
            semanticName: 'widget',
            familyRoot: 'widget',
            semanticFamily: 'widget',
            semanticEvidenceKind: 'semantic-family-root-folder',
            familyRootQualification: 'package-root-folder',
            ...extraFacts,
          }],
        },
      });
      const [relationship] = preparedDependencies.treeSemanticNamingFolderTypeRelationshipEvidence.relationshipRecords;
      const [semanticHome] = preparedDependencies.treeSemanticHomeEvidence.evidenceRecords;
      return [relationship.relationshipEvidenceStrength, semanticHome.semanticHomeEvidenceStrength];
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  };

  assert.deepEqual(strengthsFor({}), ['high', 'bounded']);
  assert.deepEqual(strengthsFor({ splitFamilyFlags: SPLIT }), ['bounded', 'bounded']);
  assert.deepEqual(strengthsFor({ ambiguityFlags: AMBIGUITY }), ['bounded', 'bounded']);
});
