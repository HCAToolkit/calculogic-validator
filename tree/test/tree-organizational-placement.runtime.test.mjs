// Organizational-placement runtime (Tree spec S2.16, slice 2): the production classifier, the prepared
// record `treeOrganizationalPlacement`, `meta.organizationalPlacement` and the `TREE_FAMILY_SCATTERED`
// presentation. The S2.16 catalogue OP-1 to OP-8 runs through a real Custom-set activation; the test-only
// reference must agree with the production classifier relation by relation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initCustomRegistrySet } from '../../src/core/registry-lifecycle/registry-lifecycle-init.logic.mjs';
import { resolveActiveRegistrySet } from '../../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { resolveRegistryLifecyclePaths } from '../../src/core/registry-lifecycle/registry-lifecycle-state.logic.mjs';
import { useRegistrySet } from '../../src/core/registry-lifecycle/registry-lifecycle-use.logic.mjs';
import { runValidatorRunner } from '../../src/core/validator-runner.logic.mjs';
import { prepareNamingTreeStagingInputs, runNamingValidator } from '../../naming/src/naming-validator.host.mjs';
import { toTreeOrganizationalPlacementPolicy } from '../src/registries/tree-organizational-placement-registry.logic.mjs';
import { prepareTreeOrganizationalPlacement, toTreeOrganizationalPlacementReport } from '../src/tree-organizational-placement.logic.mjs';
import { prepareTreeStructureAdvisorInputs } from '../src/tree-structure-advisor.wiring.mjs';
import { runTreeStructureAdvisor } from '../src/tree-structure-advisor.logic.mjs';
import { collectSemanticHomeScatterFindings } from '../src/contributors/tree-semantic-home-scatter-contributor.logic.mjs';
import { classifyOrganizationalPlacement } from './fixtures/organizational-placement-catalogue/organizational-placement-reference.fixture.mjs';
import { ORGANIZATIONAL_PLACEMENT_CASES, POLICY_CENTRALIZED } from './fixtures/organizational-placement-catalogue/organizational-placement-cases.fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const caseOf = (id) => ORGANIZATIONAL_PLACEMENT_CASES.find((entry) => entry.id === id);

const prepareRun = (root) => {
  const registryResolution = resolveActiveRegistrySet({ targetRoot: root });
  const staged = prepareNamingTreeStagingInputs(runNamingValidator(root, { scope: 'repo', registryResolution }), { registryResolution });
  return prepareTreeStructureAdvisorInputs(root, { scope: 'repo', registryResolution, ...staged });
};
// A temporary repository; with `policy`, a Custom set is initialized, holds the policy and is activated.
const withRepository = ({ files, policy }, run) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-organizational-placement-runtime-'));
  try {
    for (const relative of files) {
      fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
      fs.writeFileSync(path.join(root, relative), 'export {};\n');
    }
    if (policy) {
      initCustomRegistrySet({ targetRoot: root, validatorVersion: '0.1.0' });
      const customFile = path.join(resolveRegistryLifecyclePaths({ targetRoot: root }).customRoot, 'tree', 'organizational-placement.registry.json');
      fs.writeFileSync(customFile, `${JSON.stringify({ version: '1', entries: policy.entries }, null, 2)}\n`);
      useRegistrySet({ targetRoot: root, activeSet: 'custom' });
    }
    return run({ root, prepared: prepareRun(root) });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};
const summaryOf = (relations) =>
  relations
    .map(({ path: filePath, homePath, classification, basis }) => ({ path: filePath, homePath, classification, rule: basis.rule }))
    .sort((left, right) => `${left.path} ${left.homePath}`.localeCompare(`${right.path} ${right.homePath}`));
const reportedFiles = (findings) => findings.flatMap((finding) => finding.details.files.map((file) => file.path)).sort();
// The record as the classifier prepares it for another development root, from the run's prepared records.
const classifyAt = (deps, validatorDevelopmentRoot, placementPolicy = deps.treeOrganizationalPlacementPolicy) =>
  prepareTreeOrganizationalPlacement({
    semanticHomeReasoning: deps.treeFolderSemanticHomeReasoning,
    sectionIntake: deps.treeNamingSectionIntake,
    vocabularyIntake: deps.treeRoleCategoryVocabularyIntake,
    structuralHomeEvidence: deps.treeStructuralHomeEvidence,
    placementPolicy,
    validatorDevelopmentRoot,
  });

for (const entry of ORGANIZATIONAL_PLACEMENT_CASES) {
  test(`${entry.id} (${entry.scenario}) through a Custom set: production classification, findings and meta, in step with the reference`, () => {
    withRepository(entry, ({ prepared }) => {
      const deps = prepared.preparedDependencies;
      assert.equal(deps.treeOrganizationalPlacementPolicy.registry.source, 'custom');
      const validatorDevelopmentRoot = entry.validatorDevelopmentRoot ?? prepared.validatorDevelopmentRoot;
      const record = entry.validatorDevelopmentRoot ? classifyAt(deps, entry.validatorDevelopmentRoot) : deps.treeOrganizationalPlacement;
      assert.equal(record.policy.applicability, 'applicable');
      assert.deepEqual(summaryOf(record.relations), entry.expected, `${entry.id}: relations`);
      assert.deepEqual(reportedFiles(collectSemanticHomeScatterFindings({ preparedDependencies: deps, validatorDevelopmentRoot })), entry.reported, `${entry.id}: reported`);
      // The reference and the production classifier agree on every relation, basis included.
      const reference = classifyOrganizationalPlacement({ preparedDependencies: deps, validatorDevelopmentRoot, policy: { entries: entry.policy.entries } });
      assert.deepEqual(record.relations.map((relation) => ({ ...relation })), reference.relations, `${entry.id}: reference parity`);
      const result = runTreeStructureAdvisor(prepared);
      assert.deepEqual(result.organizationalPlacement, toTreeOrganizationalPlacementReport(deps.treeOrganizationalPlacement));
      assert.equal(result.organizationalPlacement.policy.source, 'custom');
    });
  });

  test(`${entry.id} under the Builtin policy: production findings are exactly today's`, () => {
    withRepository({ files: entry.files }, ({ prepared }) => {
      const deps = prepared.preparedDependencies;
      const validatorDevelopmentRoot = entry.validatorDevelopmentRoot ?? prepared.validatorDevelopmentRoot;
      assert.equal(deps.treeOrganizationalPlacementPolicy.registry.source, 'builtin');
      assert.deepEqual(reportedFiles(collectSemanticHomeScatterFindings({ preparedDependencies: deps, validatorDevelopmentRoot })), entry.reportedToday);
      const record = entry.validatorDevelopmentRoot ? classifyAt(deps, entry.validatorDevelopmentRoot) : deps.treeOrganizationalPlacement;
      assert.equal(record.relations.some((relation) => relation.classification === 'consistent'), false);
    });
  });
}

test('OP-6 presentation: the consistent home leaves the finding\'s home set and is listed as consistentHomes', () => {
  const entry = caseOf('OP-6');
  withRepository(entry, ({ prepared }) => {
    const [finding] = collectSemanticHomeScatterFindings({ preparedDependencies: prepared.preparedDependencies, validatorDevelopmentRoot: null });
    assert.deepEqual(finding.details.homes.map((home) => home.folderPath), ['doc/widget-engine']);
    const [file] = finding.details.files;
    assert.equal(file.consistentHomes.length, 1);
    assert.equal(Object.hasOwn(file, 'pairedHomes'), false);
    const srcHome = prepared.preparedDependencies.treeOrganizationalPlacement.relations.find((relation) => relation.homePath === 'src/widget-engine').home;
    assert.deepEqual(file.consistentHomes, [srcHome]);
  });
});

test('applicability: an unusable vocabulary or an unprepared policy disables the policy; a selector outside the vocabulary is recorded', () => {
  const entry = caseOf('OP-1');
  withRepository(entry, ({ prepared }) => {
    const deps = prepared.preparedDependencies;
    const unusable = prepareTreeOrganizationalPlacement({
      semanticHomeReasoning: deps.treeFolderSemanticHomeReasoning,
      sectionIntake: deps.treeNamingSectionIntake,
      vocabularyIntake: { ...deps.treeRoleCategoryVocabularyIntake, state: 'mismatched' },
      structuralHomeEvidence: deps.treeStructuralHomeEvidence,
      placementPolicy: deps.treeOrganizationalPlacementPolicy,
      validatorDevelopmentRoot: null,
    });
    assert.deepEqual([unusable.policy.applicability, unusable.policy.reason], ['inapplicable', 'vocabulary-unusable']);
    assert.deepEqual(unusable.relations.map((relation) => relation.basis.rule), ['policy-inapplicable']);
    const notPrepared = classifyAt(deps, null, { availability: 'not-prepared', reason: 'registry-resolution-absent' });
    assert.deepEqual([notPrepared.policy.applicability, notPrepared.policy.reason], ['inapplicable', 'policy-not-prepared']);
    assert.deepEqual(notPrepared.relations.map((relation) => relation.classification), ['reportable']);

    const outside = { ...deps.treeOrganizationalPlacementPolicy, policy: toTreeOrganizationalPlacementPolicy({ entries: [{ ...entry.policy.entries[0], entryId: 'unknown-category', select: { roleCategories: ['handbook-material'] } }] }) };
    const record = classifyAt(deps, null, outside);
    assert.deepEqual(record.diagnostics, [{ entryId: 'unknown-category', reason: 'selector-outside-vocabulary', values: ['handbook-material'] }]);
    assert.deepEqual(record.relations.map((relation) => relation.basis.rule), ['no-applicable-entry']);
    assert.deepEqual(toTreeOrganizationalPlacementReport(record).diagnostics, record.diagnostics);
  });
});

test('role-over-category precedence: a roles entry decides for its role, whatever a category entry says', () => {
  const entry = caseOf('OP-1');
  const specColocated = { entryId: 'spec-colocated', select: { roles: ['spec'] }, arrangement: 'colocated', definition: 'Specifications beside their subject.' };
  withRepository({ files: entry.files, policy: { entries: [...entry.policy.entries, specColocated] } }, ({ prepared }) => {
    const [relation] = prepared.preparedDependencies.treeOrganizationalPlacement.relations;
    assert.deepEqual([relation.classification, relation.basis.rule, relation.basis.entryId], ['reportable', 'colocated', 'spec-colocated']);
  });
});

test('this repository under the Builtin policy: findings, R2 pairing and the report summary', () => {
  const prepared = prepareRun(ROOT);
  const deps = prepared.preparedDependencies;
  const record = deps.treeOrganizationalPlacement;
  assert.equal(record.validatorDevelopmentRoot, '.');
  assert.deepEqual(record.policy.applicability, 'applicable');
  const filesOf = (classification) => new Set(record.relations.filter((relation) => relation.classification === classification).map((relation) => relation.path));
  assert.equal(filesOf('paired').size, 22, 'R2 pairs its 22 documents');
  assert.deepEqual([...filesOf('reportable')].sort(), [
    'doc/ValidatorSpecs/linguistic-foundation-shared-contract.spec.md',
    'doc/ValidatorSpecs/suite-owned/registry-lifecycle-builtin-custom.spec.md',
    'scripts/registry-lifecycle.host.mjs',
  ]);
  assert.equal(filesOf('consistent').size, 0);
  const findings = collectSemanticHomeScatterFindings({ preparedDependencies: deps, validatorDevelopmentRoot: '.' });
  assert.deepEqual(findings.map((finding) => finding.details.fileCount), [1, 2]);
  // The contributor reuses the prepared record for the run's root, and reclassifies for another root.
  assert.deepEqual(classifyAt(deps, '.'), record);
  assert.equal(reportedFiles(collectSemanticHomeScatterFindings({ preparedDependencies: deps, validatorDevelopmentRoot: null })).length, 25);
  const [entry] = runValidatorRunner(ROOT, { validators: ['tree-structure-advisor'], scope: 'repo' }).validators;
  assert.deepEqual(entry.meta.organizationalPlacement, toTreeOrganizationalPlacementReport(record));
  assert.deepEqual(Object.keys(entry.meta.organizationalPlacement), ['policy', 'counts', 'governedCodes']);
  assert.equal(entry.meta.organizationalPlacement.counts.reportable, 4, 'the linguistic-foundation spec has two homes');
});

test('this repository under the recorded Custom policy: the three reported files become consistent, and R2 stays paired', () => {
  const deps = prepareRun(ROOT).preparedDependencies;
  const custom = { ...deps.treeOrganizationalPlacementPolicy, policy: toTreeOrganizationalPlacementPolicy({ entries: POLICY_CENTRALIZED.entries }) };
  const { treeOrganizationalPlacement, ...withoutRecord } = deps;
  const findings = collectSemanticHomeScatterFindings({ preparedDependencies: { ...withoutRecord, treeOrganizationalPlacementPolicy: custom }, validatorDevelopmentRoot: '.' });
  assert.deepEqual(findings, []);
  const record = classifyAt(deps, '.', custom);
  assert.equal(new Set(record.relations.filter((relation) => relation.classification === 'paired').map((relation) => relation.path)).size, 22);
  assert.equal(new Set(record.relations.filter((relation) => relation.classification === 'consistent').map((relation) => relation.path)).size, 3);
  assert.equal(treeOrganizationalPlacement.relations.length, record.relations.length);
});

test('the classifier reads prepared records only and owns R2: the contributor no longer implements it', () => {
  const contributor = fs.readFileSync(path.join(ROOT, 'tree/src/contributors/tree-semantic-home-scatter-contributor.logic.mjs'), 'utf8');
  for (const name of ['isPairedDocument', 'toValidatorDocAuthorityPathPrefix', 'familyRoot ===']) assert.equal(contributor.includes(name), false, name);
  const classifier = fs.readFileSync(path.join(ROOT, 'tree/src/tree-organizational-placement.logic.mjs'), 'utf8');
  for (const name of ['readFileSync', "from 'node:fs'", 'split(\'-\')', '.basename']) assert.equal(classifier.includes(name), false, name);
});
