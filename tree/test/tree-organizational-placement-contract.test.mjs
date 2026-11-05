// Organizational-placement contract and catalogue (Tree spec S2.16). The test-only reference stays the
// contract's executable statement; `tree-organizational-placement.runtime.test.mjs` runs the same
// catalogue through the production classifier and emitter (slices 1 and 2). The catalogue OP-1 to OP-8
// runs real temporary repositories through Naming staging and Tree wiring; a test-only reference
// classifies each relation against fixture policies, reading R2 from the production emitter.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveActiveRegistrySet } from '../../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { prepareNamingTreeStagingInputs, runNamingValidator } from '../../naming/src/naming-validator.host.mjs';
import { prepareTreeStructureAdvisorInputs } from '../src/tree-structure-advisor.wiring.mjs';
import { collectSemanticHomeScatterFindings } from '../src/contributors/tree-semantic-home-scatter-contributor.logic.mjs';
import { assertValidOrganizationalPlacementPolicy, classifyOrganizationalPlacement } from './fixtures/organizational-placement-catalogue/organizational-placement-reference.fixture.mjs';
import { ORGANIZATIONAL_PLACEMENT_CASES, POLICY_CENTRALIZED, POLICY_EMPTY } from './fixtures/organizational-placement-catalogue/organizational-placement-cases.fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TREE = fs.readFileSync(path.join(ROOT, 'doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md'), 'utf8');
const S2_16 = TREE.slice(TREE.indexOf('#### S2.16 Organizational placement'), TREE.indexOf('\n### Emergent structural-boundary opportunities'));
const STRUCTURAL_HOMES = JSON.parse(fs.readFileSync(path.join(ROOT, 'tree/src/registries/_builtin/structural-homes.registry.json'), 'utf8')).structuralHomes.map((entry) => entry.structuralHome);

const prepare = (root) => {
  const registryResolution = resolveActiveRegistrySet({ targetRoot: root });
  const staged = prepareNamingTreeStagingInputs(runNamingValidator(root, { scope: 'repo', registryResolution }), { registryResolution });
  return prepareTreeStructureAdvisorInputs(root, { scope: 'repo', registryResolution, ...staged }).preparedDependencies;
};
const withRepository = (files, run) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-organizational-placement-'));
  try {
    for (const relative of files) {
      fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
      fs.writeFileSync(path.join(root, relative), 'export {};\n');
    }
    return run(prepare(root));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};
const reportedByEmitter = (preparedDependencies, validatorDevelopmentRoot) =>
  collectSemanticHomeScatterFindings({ preparedDependencies, validatorDevelopmentRoot }).flatMap((finding) => finding.details.files.map((file) => file.path)).sort();

for (const entry of ORGANIZATIONAL_PLACEMENT_CASES) {
  test(`${entry.id} (${entry.scenario}): every relation's classification, and what the contract would report`, () => {
    withRepository(entry.files, (preparedDependencies) => {
      const validatorDevelopmentRoot = entry.validatorDevelopmentRoot ?? null;
      assertValidOrganizationalPlacementPolicy(entry.policy, STRUCTURAL_HOMES);
      const result = classifyOrganizationalPlacement({ preparedDependencies, validatorDevelopmentRoot, policy: entry.policy });
      assert.equal(result.applicability, 'applicable', `${entry.id}: the run's vocabulary is usable`);
      assert.deepEqual(
        result.relations.map(({ path: filePath, homePath, classification, basis }) => ({ path: filePath, homePath, classification, rule: basis.rule })).sort((left, right) => `${left.path} ${left.homePath}`.localeCompare(`${right.path} ${right.homePath}`)),
        entry.expected,
        `${entry.id}: relations`,
      );
      assert.deepEqual(result.reported, entry.reported, `${entry.id}: reported under the policy`);
      // Production is unchanged: the emitter reports exactly what it reports today.
      assert.deepEqual(reportedByEmitter(preparedDependencies, validatorDevelopmentRoot), entry.reportedToday, `${entry.id}: production today`);
      // The empty Builtin policy reproduces the production emitter.
      assert.deepEqual(classifyOrganizationalPlacement({ preparedDependencies, validatorDevelopmentRoot, policy: POLICY_EMPTY }).reported, entry.reportedToday, `${entry.id}: empty policy`);
    });
  });
}

test('OP-6: one consistent relation never exempts the file\'s other relations', () => {
  const entry = ORGANIZATIONAL_PLACEMENT_CASES.find((item) => item.id === 'OP-6');
  withRepository(entry.files, (preparedDependencies) => {
    const { relations } = classifyOrganizationalPlacement({ preparedDependencies, policy: entry.policy });
    const classes = relations.filter((relation) => relation.path === 'doc/specs/widget-engine-overview.spec.md').map((relation) => relation.classification).sort();
    assert.deepEqual(classes, ['consistent', 'reportable']);
  });
});

test('policy validation: closed selectors, centralized entries list known namespaces, and one value has one owner per selector kind', () => {
  assertValidOrganizationalPlacementPolicy(POLICY_EMPTY, STRUCTURAL_HOMES);
  assertValidOrganizationalPlacementPolicy(POLICY_CENTRALIZED, STRUCTURAL_HOMES);
  const base = POLICY_CENTRALIZED.entries[0];
  const rejects = (entries, pattern) => assert.throws(() => assertValidOrganizationalPlacementPolicy({ entries }, STRUCTURAL_HOMES), pattern);
  rejects([{ ...base, select: { roles: ['spec'], roleCategories: ['documentation'] } }], /exactly one non-empty kind/u);
  rejects([{ ...base, namespaces: ['handbook'] }], /unknown namespace handbook/u);
  rejects([{ ...base, namespaces: [] }], /lists namespaces/u);
  rejects([{ ...base, arrangement: 'colocated' }], /lists no namespaces/u);
  rejects([base, { ...base, entryId: 'second' }], /already selected/u);
  rejects([{ ...base, arrangement: 'scattered' }], /unknown arrangement/u);
});

test('a selector outside the run\'s vocabulary is inapplicable and recorded, never an error; an unusable vocabulary disables the policy', () => {
  const entry = ORGANIZATIONAL_PLACEMENT_CASES.find((item) => item.id === 'OP-1');
  withRepository(entry.files, (preparedDependencies) => {
    const outside = { entries: [{ ...entry.policy.entries[0], entryId: 'unknown-category', select: { roleCategories: ['handbook-material'] } }] };
    const result = classifyOrganizationalPlacement({ preparedDependencies, policy: outside });
    assert.deepEqual(result.diagnostics, [{ entryId: 'unknown-category', reason: 'selector-outside-vocabulary', values: ['handbook-material'] }]);
    assert.deepEqual(result.relations.map((relation) => relation.basis.rule), ['no-applicable-entry']);
    const unusable = { ...preparedDependencies, treeRoleCategoryVocabularyIntake: { ...preparedDependencies.treeRoleCategoryVocabularyIntake, state: 'unavailable' } };
    const disabled = classifyOrganizationalPlacement({ preparedDependencies: unusable, policy: entry.policy });
    assert.equal(disabled.applicability, 'inapplicable');
    assert.deepEqual(disabled.relations.map((relation) => relation.basis.rule), ['policy-inapplicable']);
    assert.deepEqual(disabled.reported, entry.reportedToday);
  });
});

test('compatibility on this repository: production is unchanged, the empty policy reproduces it, and the recorded Custom-policy effect holds', () => {
  const preparedDependencies = prepare(ROOT);
  // Self-check (validator development root) and the installed-consumer view (none).
  for (const [validatorDevelopmentRoot, findings, files] of [['.', 2, 3], [null, 4, 25]]) {
    const emitted = collectSemanticHomeScatterFindings({ preparedDependencies, validatorDevelopmentRoot });
    assert.equal(emitted.length, findings, `production findings (${validatorDevelopmentRoot ?? 'no development root'})`);
    assert.equal(emitted.reduce((total, finding) => total + finding.details.fileCount, 0), files);
    const empty = classifyOrganizationalPlacement({ preparedDependencies, validatorDevelopmentRoot, policy: POLICY_EMPTY });
    assert.deepEqual(empty.reported, reportedByEmitter(preparedDependencies, validatorDevelopmentRoot), 'the empty policy reproduces production');
    assert.equal(empty.counts.consistent, 0);
  }
  const selfCheck = classifyOrganizationalPlacement({ preparedDependencies, validatorDevelopmentRoot: '.', policy: POLICY_CENTRALIZED });
  assert.deepEqual(selfCheck.reported, []);
  const consistentFiles = [...new Set(selfCheck.relations.filter((relation) => relation.classification === 'consistent').map((relation) => relation.path))].sort();
  assert.deepEqual(consistentFiles, [
    'doc/ValidatorSpecs/linguistic-foundation-shared-contract.spec.md',
    'doc/ValidatorSpecs/suite-owned/registry-lifecycle-builtin-custom.spec.md',
    'scripts/registry-lifecycle.host.mjs',
  ]);
  const pairedFiles = new Set(selfCheck.relations.filter((relation) => relation.classification === 'paired').map((relation) => relation.path));
  assert.equal(pairedFiles.size, 22, 'R2 keeps its 22 exempted documents as paired');
  const consumer = classifyOrganizationalPlacement({ preparedDependencies, validatorDevelopmentRoot: null, policy: POLICY_CENTRALIZED });
  assert.deepEqual(consumer.reported, []);
  assert.equal(new Set(consumer.relations.filter((relation) => relation.classification === 'consistent').map((relation) => relation.path)).size, 25);
});

test('inspectability: each relation record carries identities, classification and basis, and counts are derivable', () => {
  const entry = ORGANIZATIONAL_PLACEMENT_CASES.find((item) => item.id === 'OP-8');
  withRepository(entry.files, (preparedDependencies) => {
    const result = classifyOrganizationalPlacement({ preparedDependencies, policy: entry.policy });
    for (const relation of result.relations) {
      assert.deepEqual(Object.keys(relation), ['file', 'path', 'home', 'homePath', 'classification', 'basis']);
      assert.deepEqual(Object.keys(relation.file), ['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress']);
      assert.deepEqual(Object.keys(relation.home), ['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress']);
    }
    assert.deepEqual(result.counts, { paired: 0, consistent: 1, reportable: 1 });
    const consistent = result.relations.find((relation) => relation.classification === 'consistent');
    assert.deepEqual(consistent.basis, { rule: 'organizational-policy', entryId: 'documentation-centralized', arrangement: 'centralized', fileNamespace: 'doc', homeNamespace: 'src' });
  });
});

test('S2.16 states the contract and its catalogue, and only the owning modules name the policy', () => {
  assert.match(S2_16, /Builtin policy changes no finding/u);
  assert.match(S2_16, /\*\*Builtin:\*\* `entries: \[\]`\. The Builtin set adopts no organizational exemption/u);
  for (const classification of ['`paired`', '`consistent`', '`reportable`']) assert.ok(S2_16.includes(`**${classification}:**`), classification);
  for (const entry of ORGANIZATIONAL_PLACEMENT_CASES) assert.ok(S2_16.includes(`| ${entry.id} `), `${entry.id}: a catalogue row`);
  assert.match(S2_16, /`meta\.organizationalPlacement`/u);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ROOT, 'tree/src/registries/_builtin/organizational-placement.registry.json'), 'utf8')), { version: '1', entries: [] });
  // The registry module, its loader, the lifecycle and wiring surfaces, the classification layer (S2.16
  // slice 2), the runtime summary and the contributor that presents it; nothing else.
  const owners = [
    'contributors/tree-semantic-home-scatter-contributor.logic.mjs',
    'registries/tree-organizational-placement-loader.logic.mjs',
    'registries/tree-organizational-placement-registry.logic.mjs',
    'registries/tree-registry-inventory.knowledge.mjs',
    'registries/tree-registry-references.logic.mjs',
    'registries/tree-registry-set.logic.mjs',
    'registries/tree-runtime-registries.logic.mjs',
    'tree-organizational-placement.logic.mjs',
    'tree-structure-advisor.logic.mjs',
    'tree-structure-advisor.wiring.mjs',
  ];
  const readers = fs.readdirSync(path.join(ROOT, 'tree/src'), { recursive: true })
    .map(String)
    .filter((name) => name.endsWith('.mjs'))
    .filter((name) => /organizational-placement|OrganizationalPlacement|organizationalPlacement/u.test(fs.readFileSync(path.join(ROOT, 'tree/src', name), 'utf8')))
    .map((name) => name.split(path.sep).join('/'))
    .sort();
  assert.deepEqual(readers, owners);
});
