// Organizational-placement registry and loader (Tree spec S2.16, slice 1): the Builtin registry, its shape
// validation, the reference edge to `tree/structural-homes`, lifecycle integration and provenance. No
// reasoning or emitter reads the prepared policy, so every finding is unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initCustomRegistrySet } from '../../src/core/registry-lifecycle/registry-lifecycle-init.logic.mjs';
import { resolveActiveRegistrySet } from '../../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { RegistryLifecycleError, resolveRegistryLifecyclePaths } from '../../src/core/registry-lifecycle/registry-lifecycle-state.logic.mjs';
import { useRegistrySet } from '../../src/core/registry-lifecycle/registry-lifecycle-use.logic.mjs';
import { runValidatorRunner } from '../../src/core/validator-runner.logic.mjs';
import { prepareNamingTreeStagingInputs, runNamingValidator } from '../../naming/src/naming-validator.host.mjs';
import {
  ORGANIZATIONAL_PLACEMENT_REGISTRY_ID,
  assertOrganizationalPlacementReferences,
  assertValidOrganizationalPlacementRegistry,
  getBuiltinOrganizationalPlacementRegistry,
} from '../src/registries/tree-organizational-placement-registry.logic.mjs';
import {
  NOT_PREPARED_TREE_ORGANIZATIONAL_PLACEMENT_POLICY,
  getBuiltinTreeOrganizationalPlacementPolicy,
  loadTreeOrganizationalPlacementPolicy,
} from '../src/registries/tree-organizational-placement-loader.logic.mjs';
import { TREE_BUILTIN_REGISTRY_ROOT, TREE_REGISTRY_INVENTORY, TREE_REGISTRY_SLICE_ID } from '../src/registries/tree-registry-inventory.knowledge.mjs';
import { validateTreeRegistrySet } from '../src/registries/tree-registry-set.logic.mjs';
import { prepareTreeStructureAdvisorInputs } from '../src/tree-structure-advisor.wiring.mjs';
import { collectSemanticHomeScatterFindings } from '../src/contributors/tree-semantic-home-scatter-contributor.logic.mjs';
import { POLICY_CENTRALIZED, ORGANIZATIONAL_PLACEMENT_CASES } from './fixtures/organizational-placement-catalogue/organizational-placement-cases.fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STRUCTURAL_HOMES = JSON.parse(fs.readFileSync(path.join(TREE_BUILTIN_REGISTRY_ROOT, 'structural-homes.registry.json'), 'utf8'));
const centralized = POLICY_CENTRALIZED.entries[0];
const payloadWith = (entries) => ({ version: '1', entries: structuredClone(entries) });

test('the Builtin registry holds no entry, validates, and is in the Tree inventory and registry-set validation', () => {
  assert.deepEqual(getBuiltinOrganizationalPlacementRegistry(), { version: '1', entries: [] });
  const entry = TREE_REGISTRY_INVENTORY.find((item) => item.registryId === ORGANIZATIONAL_PLACEMENT_REGISTRY_ID);
  assert.ok(entry);
  assert.deepEqual(entry.comparison, [{ kind: 'keyed', path: 'entries', key: 'entryId' }]);
  assert.deepEqual(entry.reconciliation, []);
  assert.deepEqual(entry.references, [{ edgeId: 'tree/organizational-placement-namespace', to: 'tree/structural-homes', targetCollection: 'structuralHomes' }]);
  assert.deepEqual(validateTreeRegistrySet(TREE_BUILTIN_REGISTRY_ROOT), []);
});

test('the shape: closed entries, exactly one selector kind, an arrangement, namespaces exactly when centralized, unique ids and one owner per value', () => {
  // Every catalogue fixture policy is a valid registry payload.
  for (const entry of ORGANIZATIONAL_PLACEMENT_CASES) assertValidOrganizationalPlacementRegistry(payloadWith(entry.policy.entries));
  const rejects = (entries, pattern) => assert.throws(() => assertValidOrganizationalPlacementRegistry(payloadWith(entries)), pattern);
  rejects([{ ...centralized, extra: true }], /unsupported field\(s\) extra/u);
  rejects([{ ...centralized, select: { roles: ['spec'], roleCategories: ['documentation'] } }], /exactly one of roles, roleCategories/u);
  rejects([{ ...centralized, select: { owners: ['x'] } }], /exactly one of roles, roleCategories/u);
  rejects([{ ...centralized, select: { roles: [] } }], /select\.roles must be a non-empty array/u);
  rejects([{ ...centralized, arrangement: 'scattered' }], /arrangement must be one of centralized, colocated/u);
  rejects([{ ...centralized, namespaces: [] }], /namespaces must be a non-empty array/u);
  rejects([{ ...centralized, namespaces: ['doc', 'doc'] }], /must not repeat a value/u);
  rejects([{ ...centralized, arrangement: 'colocated' }], /colocated and must not list namespaces/u);
  rejects([centralized, { ...centralized, entryId: 'second' }], /names documentation, already selected by documentation-centralized/u);
  rejects([centralized, { ...centralized, select: { roleCategories: ['quality-support'] } }], /entryId documentation-centralized is not unique/u);
  rejects([{ ...centralized, definition: '' }], /definition must be a non-empty string/u);
  assert.throws(() => assertValidOrganizationalPlacementRegistry({ version: '2', entries: [] }), /version "2" is not readable/u);
  assert.throws(() => assertValidOrganizationalPlacementRegistry({ version: '1' }), /entries must be an array/u);
  // A role and a category selector may name overlapping kinds: roles take precedence at run time (S2.16).
  assertValidOrganizationalPlacementRegistry(payloadWith([centralized, { entryId: 'spec-colocated', select: { roles: ['spec'] }, arrangement: 'colocated', definition: 'Specs beside code.' }]));
});

test('the reference edge: every namespace a centralized entry names is a declared structural home', () => {
  assertOrganizationalPlacementReferences(payloadWith(POLICY_CENTRALIZED.entries), STRUCTURAL_HOMES);
  assert.throws(() => assertOrganizationalPlacementReferences(payloadWith([{ ...centralized, namespaces: ['doc', 'handbook'] }]), STRUCTURAL_HOMES), /namespaces not declared in structural-homes: handbook/u);
});

// A repository with an initialized, activated Custom set, which a test may edit.
const withCustomSet = (run) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-organizational-placement-registry-'));
  try {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'widget.logic.mjs'), 'export {};\n');
    initCustomRegistrySet({ targetRoot: root, validatorVersion: '0.1.0' });
    useRegistrySet({ targetRoot: root, activeSet: 'custom' });
    const customFile = path.join(resolveRegistryLifecyclePaths({ targetRoot: root }).customRoot, TREE_REGISTRY_SLICE_ID, 'organizational-placement.registry.json');
    run({ root, customFile });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

test('the loader: Builtin provenance for a direct call, the resolution\'s provenance in a run, a Custom set\'s entries, and not-prepared without a resolution', () => {
  const builtin = getBuiltinTreeOrganizationalPlacementPolicy();
  assert.equal(builtin.availability, 'available');
  assert.deepEqual(builtin.policy, { entries: [] });
  assert.deepEqual([builtin.registry.registryId, builtin.registry.version, builtin.registry.source], [ORGANIZATIONAL_PLACEMENT_REGISTRY_ID, '1', 'builtin']);
  assert.ok(Object.isFrozen(builtin) && Object.isFrozen(builtin.policy.entries));
  assert.equal(loadTreeOrganizationalPlacementPolicy(), builtin);
  assert.equal(loadTreeOrganizationalPlacementPolicy({ registryRoots: { tree: TREE_BUILTIN_REGISTRY_ROOT } }), builtin);
  assert.equal(loadTreeOrganizationalPlacementPolicy({ registryRoots: { tree: os.tmpdir() } }), NOT_PREPARED_TREE_ORGANIZATIONAL_PLACEMENT_POLICY);

  const resolution = resolveActiveRegistrySet({ targetRoot: ROOT });
  const fromRun = loadTreeOrganizationalPlacementPolicy({ registryResolution: resolution });
  assert.deepEqual(fromRun, builtin, 'a Builtin resolution reports the same digest as the direct Builtin policy');
  assert.deepEqual(resolution.registryProvenance.tree[ORGANIZATIONAL_PLACEMENT_REGISTRY_ID], { source: 'builtin', digest: builtin.registry.digest });

  withCustomSet(({ root, customFile }) => {
    fs.writeFileSync(customFile, `${JSON.stringify(payloadWith(POLICY_CENTRALIZED.entries), null, 2)}\n`);
    const custom = loadTreeOrganizationalPlacementPolicy({ registryResolution: resolveActiveRegistrySet({ targetRoot: root }) });
    assert.equal(custom.registry.source, 'custom');
    assert.notEqual(custom.registry.digest, builtin.registry.digest);
    assert.deepEqual(custom.policy.entries.map((entry) => entry.entryId), ['documentation-centralized', 'entry-scripts-centralized']);
    assert.deepEqual(custom.policy.entries[1], { entryId: 'entry-scripts-centralized', select: { roles: ['host', 'entry', 'cli'] }, arrangement: 'centralized', namespaces: ['bin', 'scripts'], definition: POLICY_CENTRALIZED.entries[1].definition });
  });
});

test('lifecycle: a Custom set validates the registry and its edge, and an active Custom set without it is blocked as incomplete', () => {
  withCustomSet(({ root, customFile }) => {
    fs.writeFileSync(customFile, `${JSON.stringify(payloadWith([{ ...centralized, namespaces: ['handbook'] }]), null, 2)}\n`);
    const failures = validateTreeRegistrySet(path.dirname(customFile)).filter((failure) => failure.registryId === ORGANIZATIONAL_PLACEMENT_REGISTRY_ID);
    assert.equal(failures.length, 1);
    assert.match(failures[0].detail, /namespaces not declared in structural-homes: handbook/u);

    fs.rmSync(customFile);
    assert.throws(
      () => resolveActiveRegistrySet({ targetRoot: root }),
      (error) => error instanceof RegistryLifecycleError && error.conditions.some((condition) => condition.registryId === ORGANIZATIONAL_PLACEMENT_REGISTRY_ID && condition.condition === 'missing'),
    );
  });
});

test('no finding changes under the Builtin policy: a run prepares the policy and reports its provenance', () => {
  const registryResolution = resolveActiveRegistrySet({ targetRoot: ROOT });
  const staged = prepareNamingTreeStagingInputs(runNamingValidator(ROOT, { scope: 'repo', registryResolution }), { registryResolution });
  const prepared = prepareTreeStructureAdvisorInputs(ROOT, { scope: 'repo', registryResolution, ...staged }).preparedDependencies;
  assert.deepEqual(prepared.treeOrganizationalPlacementPolicy, getBuiltinTreeOrganizationalPlacementPolicy());
  const files = collectSemanticHomeScatterFindings({ preparedDependencies: prepared, validatorDevelopmentRoot: '.' }).flatMap((finding) => finding.details.files.map((file) => file.path)).sort();
  assert.deepEqual(files, [
    'doc/ValidatorSpecs/linguistic-foundation-shared-contract.spec.md',
    'doc/ValidatorSpecs/suite-owned/registry-lifecycle-builtin-custom.spec.md',
    'scripts/registry-lifecycle.host.mjs',
  ]);
  const [entry] = runValidatorRunner(ROOT, { validators: ['tree-structure-advisor'], scope: 'repo' }).validators;
  assert.deepEqual(entry.meta.registryProvenance[ORGANIZATIONAL_PLACEMENT_REGISTRY_ID], { source: 'builtin', digest: getBuiltinTreeOrganizationalPlacementPolicy().registry.digest });
  // Slice 2: the report carries the summary, with the Builtin provenance and no consistent relation.
  assert.equal(entry.meta.organizationalPlacement.policy.source, 'builtin');
  assert.equal(entry.meta.organizationalPlacement.counts.consistent, 0);
});
