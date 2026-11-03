// Repository package expression on the default path, across target types (Tree spec S1.1-S1.3, S3.2,
// S3.7; bridge contract §4.8; capability inventory §3.11; calculogic-validator#159, Gate 3). Each target is
// the same consumer-style tree with a different root manifest. The control is a manifest without `name`
// (no fact) over the same files, so the snapshot is the same.
//
// Compatibility boundaries: the bridge payload gains the §4.8 section whenever a fact exists; the Tree
// intake exists exactly when the section does; the Stage 3 record and the report are byte-identical
// whenever no package element is accepted, and otherwise change only through `repository-package` steps.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveActiveRegistrySet } from '../../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { prepareNamingTreeStagingInputs, runNamingValidator } from '../../naming/src/naming-validator.host.mjs';
import { prepareTreeStructureAdvisorInputs } from '../src/tree-structure-advisor.wiring.mjs';
import { runTreeStructureAdvisor as runTreeStructureAdvisorRuntime } from '../src/tree-structure-advisor.logic.mjs';
import { prepareTreeEmergentBoundaryReasoning } from '../src/tree-emergent-boundary-reasoning.logic.mjs';
import { createTreeLexicalRelation } from '../src/tree-lexical-identity-evidence.logic.mjs';
import { EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY } from './fixtures/emergent-boundary-catalogue/emergent-boundary-experimental-policy.fixture.mjs';

const FILES = [
  ...['widget-kit-alpha', 'widget-kit-beta', 'widget-kit-gamma', 'widget-render', 'widget-store', 'kit-runner'].map((name) => `src/${name}.logic.mjs`),
  ...['acme-config', 'acme-tokens', 'acme-theme'].map((name) => `src/${name}.knowledge.mjs`),
  ...['kit-layout', 'kit-shell', 'kit-slots'].map((name) => `src/kit/${name}.logic.mjs`),
  ...['acme-widget-kit-cli', 'acme-widget-serve', 'acme-widget-build'].map((name) => `bin/${name}.host.mjs`),
];

// One run of a consumer-style target with the given root manifest text (or none).
const runTarget = (manifestText) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-repository-package-'));
  try {
    for (const relativePath of FILES) {
      fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
      fs.writeFileSync(path.join(root, relativePath), 'export {};\n');
    }
    if (manifestText !== undefined) fs.writeFileSync(path.join(root, 'package.json'), manifestText);
    const registryResolution = resolveActiveRegistrySet({ targetRoot: root });
    const staged = prepareNamingTreeStagingInputs(runNamingValidator(root, { scope: 'repo', registryResolution }), { registryResolution });
    const prepared = prepareTreeStructureAdvisorInputs(root, { scope: 'repo', registryResolution, ...staged, emergentBoundaryPolicy: EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY });
    const deps = prepared.preparedDependencies;
    // The same prepared evidence through Stage 3 without package elements: attribution control.
    const withoutPackage = prepareTreeEmergentBoundaryReasoning({
      factEvidence: deps.treeFolderFactEvidence,
      semanticEvidence: deps.treeFolderSemanticEvidence,
      sectionIntake: deps.treeNamingSectionIntake,
      semanticHomeReasoning: deps.treeFolderSemanticHomeReasoning,
      policy: EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY,
      lexicalRelation: createTreeLexicalRelation(deps.treeLexicalIdentityIntake),
      lexicalProfile: deps.treeLexicalIdentityIntake?.lexicalProfile ?? null,
    });
    return {
      stage3: JSON.stringify(deps.treeEmergentBoundaryReasoning),
      stage3WithoutPackage: JSON.stringify(withoutPackage),
      record: deps.treeEmergentBoundaryReasoning,
      report: JSON.stringify(runTreeStructureAdvisorRuntime(prepared)),
      occurrences: JSON.stringify(prepared.structuralAddressSnapshot.occurrenceRecords),
      stageOne: JSON.stringify([deps.treeNamingSectionIntake, deps.treeFolderFactEvidence, deps.treeFolderSemanticEvidence, deps.treeFolderSemanticHomeReasoning]),
      section: deps.addressedNamingOccurrenceBridge.namingRepositoryPackageLabels,
      intake: deps.treeRepositoryPackageIntake,
      hasIntakeDependency: 'treeRepositoryPackageIntake' in deps,
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};
const candidatesOf = (record, directoryPath) =>
  Object.fromEntries((record.directories.find((directory) => directory.path === directoryPath)?.candidates ?? []).map((candidate) => [candidate.prefix.join('-'), candidate.assessment.outcome]));

const CONTROL = runTarget(JSON.stringify({ version: '1.0.0' }));

test('the control (no `name`): no section, no intake, and the consumer tree has its inflated `widget-kit` opportunity', () => {
  assert.equal(CONTROL.section, undefined);
  assert.equal(CONTROL.hasIntakeDependency, false);
  assert.equal(CONTROL.stage3, CONTROL.stage3WithoutPackage);
  assert.deepEqual(candidatesOf(CONTROL.record, 'src'), { acme: 'insufficient-evidence', widget: 'insufficient-evidence', 'widget-kit': 'opportunity' });
});

test('no identity fact (malformed manifest, non-string, unusable `name`): no section, no intake; everything byte-identical to the control', () => {
  for (const manifest of ['{"name": "@acme/widget-kit",', JSON.stringify({ name: 5 }), JSON.stringify({ name: 'acme/widget-kit' }), JSON.stringify({ name: ' widget-kit' })]) {
    const run = runTarget(manifest);
    assert.equal(run.section, undefined, manifest);
    assert.equal(run.hasIntakeDependency, false, `${manifest}: no prepared dependency`);
    for (const key of ['stage3', 'report', 'occurrences', 'stageOne']) assert.equal(run[key], CONTROL[key], `${manifest}: ${key}`);
  }
  const noManifest = runTarget(undefined);
  assert.equal(noManifest.section, undefined, 'no manifest');
  assert.equal(noManifest.hasIntakeDependency, false, 'no manifest: no prepared dependency');
});

test('an identity Naming does not parse: section and intake present, no element accepted, Stage 3 and report byte-identical to the control', () => {
  const run = runTarget(JSON.stringify({ name: '@Acme/Widget-Kit' }));
  assert.deepEqual(run.section.records.map((record) => [record.element, record.parseOutcome]), [['scope', 'not-parsed'], ['name', 'not-parsed']]);
  assert.equal(run.intake.availability, 'available');
  assert.equal(run.intake.acceptedRecords.length, 2);
  assert.deepEqual(run.intake.rejectedRecords, []);
  for (const key of ['stage3', 'report', 'occurrences', 'stageOne']) assert.equal(run[key], CONTROL[key], key);
});

test('accepted elements (scoped, unscoped, scope only): Stage 3 changes only through `repository-package` steps; report, snapshot and Stage 1-2 unchanged', () => {
  const expectations = {
    [JSON.stringify({ name: '@acme/widget-kit' })]: { src: { widget: 'insufficient-evidence' }, bin: { widget: 'insufficient-evidence' } },
    // Unscoped: `widget-kit-*` express the full name and leave no shared residual, so they join no
    // candidate; `widget-render` and `widget-store` keep `widget`, since a partial label never expresses.
    [JSON.stringify({ name: 'widget-kit' })]: { src: { acme: 'insufficient-evidence', widget: 'insufficient-evidence' } },
    [JSON.stringify({ name: '@acme/Widget-Kit' })]: { src: { widget: 'insufficient-evidence', 'widget-kit': 'opportunity' }, bin: { widget: 'insufficient-evidence' } },
  };
  for (const [manifest, expected] of Object.entries(expectations)) {
    const run = runTarget(manifest);
    assert.notEqual(run.stage3, CONTROL.stage3, `${manifest}: Stage 3 changes`);
    assert.equal(run.stage3WithoutPackage, CONTROL.stage3, `${manifest}: without the package elements, Stage 3 is the control's`);
    for (const key of ['report', 'occurrences', 'stageOne']) assert.equal(run[key], CONTROL[key], `${manifest}: ${key}`);
    for (const [directoryPath, candidates] of Object.entries(expected)) assert.deepEqual(candidatesOf(run.record, directoryPath), candidates, `${manifest} ${directoryPath}`);
    const steps = run.record.directories.flatMap((directory) => directory.candidates).flatMap((candidate) => candidate.members).flatMap((member) => member.lineageExpression);
    const packageSteps = steps.filter((step) => step.basis === 'repository-package');
    // Recorded members carry package steps exactly where a recorded member leads with a full element.
    const leadsWithElement = run.record.directories.flatMap((directory) => directory.candidates).flatMap((candidate) => candidate.members)
      .some((member) => run.section.records.some((record) => record.parseOutcome === 'parsed' && record.labelTokens.every((token, index) => member.leadingTokens[index] === token)));
    assert.equal(packageSteps.length > 0, leadsWithElement, `${manifest}: package steps exactly where a recorded member leads with an element`);
    for (const step of packageSteps) assert.deepEqual(Object.keys(step).sort(), ['basis', 'element', 'positions', 'segment', 'tokens'], `${manifest}: no folder, folder path or identity tuple`);
  }
});
