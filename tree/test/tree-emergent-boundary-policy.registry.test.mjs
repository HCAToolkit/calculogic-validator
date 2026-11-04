// Acceptance tests B-1 to B-6 for the adopted Stage 3 policy (Tree spec S3.13.6-S3.13.8, slice B;
// calculogic-validator#171): the `tree/emergent-boundary-policy` registry, its loader, and the Stage 3
// policy sources. No finding reads the policy in this slice.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REGISTRY_LIFECYCLE_SLICES } from '../../src/core/registry-lifecycle/registry-lifecycle-inventory.knowledge.mjs';
import { initCustomRegistrySet } from '../../src/core/registry-lifecycle/registry-lifecycle-init.logic.mjs';
import { resolveActiveRegistrySet } from '../../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { RegistryLifecycleError, resolveRegistryLifecyclePaths } from '../../src/core/registry-lifecycle/registry-lifecycle-state.logic.mjs';
import { useRegistrySet } from '../../src/core/registry-lifecycle/registry-lifecycle-use.logic.mjs';
import { prepareNamingTreeStagingInputs, runNamingValidator } from '../../naming/src/naming-validator.host.mjs';
import {
  EMERGENT_BOUNDARY_POLICY_REGISTRY_ID,
  assertValidEmergentBoundaryPolicyRegistry,
  getBuiltinEmergentBoundaryPolicyRegistry,
} from '../src/registries/tree-emergent-boundary-policy-registry.logic.mjs';
import {
  NOT_PREPARED_TREE_EMERGENT_BOUNDARY_POLICY,
  getBuiltinTreeEmergentBoundaryPolicy,
  loadTreeEmergentBoundaryPolicy,
} from '../src/registries/tree-emergent-boundary-policy-loader.logic.mjs';
import { TREE_BUILTIN_REGISTRY_ROOT, TREE_REGISTRY_SLICE_ID } from '../src/registries/tree-registry-inventory.knowledge.mjs';
import { validateTreeRegistrySet } from '../src/registries/tree-registry-set.logic.mjs';
import { prepareTreeEmergentBoundaryReasoning } from '../src/tree-emergent-boundary-reasoning.logic.mjs';
import { prepareTreeStructureAdvisorInputs } from '../src/tree-structure-advisor.wiring.mjs';
import { runTreeStructureAdvisor as runTreeStructureAdvisorRuntime } from '../src/tree-structure-advisor.logic.mjs';
import { EMERGENT_BOUNDARY_CATALOGUE } from './fixtures/emergent-boundary-catalogue/emergent-boundary-catalogue-cases.fixture.mjs';
import { EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY } from './fixtures/emergent-boundary-catalogue/emergent-boundary-experimental-policy.fixture.mjs';
import { buildCatalogueCase, files } from './fixtures/semantic-home-catalogue/semantic-home-catalogue.fixture.mjs';
import { repositoryPackageBridgeSections, repositoryPackageElementsOf } from './fixtures/repository-package/repository-package.fixture.mjs';

// The S3.13.1 approved values, stated independently of the registry file and of the experimental fixture.
const APPROVED = Object.freeze({
  'minimum-primary-units': { status: 'resolved', value: 3 },
  'one-word-prefix': { status: 'resolved', value: 'no-allowance' },
  'responsibility-class-mapping': {
    status: 'resolved',
    value: {
      primary: ['concern-core', 'architecture-support', 'surface-system', 'data-model', 'indexing-registry'],
      supporting: ['quality-support'],
      documentation: 'primary-in-documentation-grouping',
    },
  },
  'separation-value-limit': { status: 'resolved', value: 'whole-directory-only' },
  'coverage-share': { status: 'unresolved' },
  'partial-evidence-aggregation': { status: 'unresolved' },
  'opportunity-selection': { status: 'unresolved' },
});

const builtinPayload = () => structuredClone(getBuiltinEmergentBoundaryPolicyRegistry());

// One candidate's assessment, without the policy identity that necessarily differs between sources.
const assessmentSignature = (candidate) => {
  const { completion, outcome, reasons, unresolvedDecisions, decidedBy, blockedAt, selection } = candidate.assessment;
  return {
    completion,
    outcome,
    reasons,
    unresolvedDecisions,
    decidedBy: decidedBy ? { rule: decidedBy.rule, decision: decidedBy.decision, value: decidedBy.value } : null,
    blockedAt: blockedAt ? blockedAt.rule : null,
    selection: selection ?? null,
  };
};
const signaturesOf = (record) =>
  Object.fromEntries(
    (record.directories ?? []).flatMap((directory) =>
      directory.candidates.map((candidate) => [`${directory.path} :: ${candidate.prefix.join('-')}`, assessmentSignature(candidate)]),
    ),
  );

test('B-1: the Builtin registry validates, states all seven decisions, and holds exactly the approved values', () => {
  assert.deepEqual(validateTreeRegistrySet(TREE_BUILTIN_REGISTRY_ROOT).filter((failure) => failure.registryId === EMERGENT_BOUNDARY_POLICY_REGISTRY_ID), []);
  const payload = builtinPayload();
  assert.deepEqual(payload.policies.map(({ policyId, policyVersion, policyStatus }) => ({ policyId, policyVersion, policyStatus })), [
    { policyId: 'emergent-boundary', policyVersion: '1', policyStatus: 'adopted' },
  ]);
  const decisions = Object.fromEntries(payload.decisions.map(({ decisionId, status, value }) => [decisionId, status === 'resolved' ? { status, value } : { status }]));
  assert.deepEqual(decisions, APPROVED);
  assert.deepEqual(getBuiltinTreeEmergentBoundaryPolicy().policy.decisions, APPROVED);
});

test('B-1: the shape is closed and every decision must be stated, with a value exactly when resolved', () => {
  const rejects = (mutate, pattern) => {
    const payload = builtinPayload();
    mutate(payload);
    assert.throws(() => assertValidEmergentBoundaryPolicyRegistry(payload), pattern);
  };
  rejects((payload) => { payload.decisions = payload.decisions.filter((entry) => entry.decisionId !== 'coverage-share'); }, /missing coverage-share/u);
  rejects((payload) => { payload.decisions.find((entry) => entry.decisionId === 'coverage-share').value = 0.5; }, /unresolved and must not carry a value/u);
  rejects((payload) => { delete payload.decisions.find((entry) => entry.decisionId === 'minimum-primary-units').value; }, /resolved and must carry a value/u);
  rejects((payload) => { payload.decisions.find((entry) => entry.decisionId === 'minimum-primary-units').value = 0; }, /not one Stage 3 can apply \(decision-value:minimum-primary-units\)/u);
  rejects((payload) => { payload.decisions.find((entry) => entry.decisionId === 'opportunity-selection').status = 'resolved'; payload.decisions.find((entry) => entry.decisionId === 'opportunity-selection').value = 'outer-only'; }, /decision-value:opportunity-selection/u);
  rejects((payload) => { payload.decisions.find((entry) => entry.decisionId === 'responsibility-class-mapping').value.extra = []; }, /unsupported field\(s\) extra/u);
  rejects((payload) => { payload.decisions.push({ decisionId: 'new-decision', status: 'unresolved', rationale: 'x' }); }, /decisionId must be one of/u);
  rejects((payload) => { payload.policies.push({ ...payload.policies[0], policyId: 'second' }); }, /exactly one policy/u);
});

test('B-2: every adopted value equals the experimental v1 value, decision by decision', () => {
  assert.deepEqual(getBuiltinTreeEmergentBoundaryPolicy().policy.decisions, structuredClone(EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY.decisions));
});

test('B-2: the catalogue reproduces every assessment under the adopted policy, cases and companions alike', () => {
  const adoptedPolicy = getBuiltinTreeEmergentBoundaryPolicy();
  let candidates = 0;
  for (const entry of [...EMERGENT_BOUNDARY_CATALOGUE.cases, ...EMERGENT_BOUNDARY_CATALOGUE.companions]) {
    const built = buildCatalogueCase({
      files: entry.tree.files.flatMap(({ dir, root, count, ...options }) => files(dir, root, count, options)),
      bridgeSections: repositoryPackageBridgeSections(entry.repositoryPackage),
    });
    const inputs = {
      factEvidence: built.factEvidence,
      semanticEvidence: built.semanticEvidence,
      sectionIntake: built.sectionIntake,
      semanticHomeReasoning: built.reasoning,
      repositoryPackageElements: repositoryPackageElementsOf(built),
    };
    const adopted = prepareTreeEmergentBoundaryReasoning({ ...inputs, adoptedPolicy });
    const experimental = prepareTreeEmergentBoundaryReasoning({ ...inputs, policy: EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY });
    assert.equal(adopted.assessment.policySource, 'adopted', entry.id);
    assert.equal(experimental.assessment.policySource, 'experimental-override', entry.id);
    assert.deepEqual(signaturesOf(adopted), signaturesOf(experimental), entry.id);
    candidates += Object.keys(signaturesOf(adopted)).length;
  }
  assert.ok(candidates > 0);
});

test('B-3: the loader and Stage 3 tell adopted and experimental policies apart, and never convert one into the other', () => {
  const experimentalAsRegistry = builtinPayload();
  experimentalAsRegistry.policies[0].policyStatus = 'experimental';
  assert.throws(() => assertValidEmergentBoundaryPolicyRegistry(experimentalAsRegistry), /policyStatus must be one of adopted/u);

  const adoptedPolicy = getBuiltinTreeEmergentBoundaryPolicy();
  const empty = {};
  assert.equal(prepareTreeEmergentBoundaryReasoning({ ...empty, adoptedPolicy }).assessment.policySource, 'adopted');
  assert.equal(
    prepareTreeEmergentBoundaryReasoning({ ...empty, adoptedPolicy, policy: EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY }).assessment.policySource,
    'experimental-override',
  );
  // An override claiming adoption is invalid, and the adopted policy does not stand in for it.
  const overrideClaimingAdoption = prepareTreeEmergentBoundaryReasoning({
    ...empty,
    adoptedPolicy,
    policy: { ...EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY, policyStatus: 'adopted' },
  }).assessment;
  assert.deepEqual(overrideClaimingAdoption, {
    status: 'configuration-unavailable',
    reason: 'experimental-policy-invalid',
    policy: null,
    problems: ['policy-status'],
  });
  // An adopted source carrying an experimental policy is invalid as well.
  const adoptedCarryingExperimental = prepareTreeEmergentBoundaryReasoning({
    ...empty,
    adoptedPolicy: { ...adoptedPolicy, policy: EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY },
  }).assessment;
  assert.deepEqual(adoptedCarryingExperimental, {
    status: 'configuration-unavailable',
    reason: 'adopted-policy-invalid',
    policy: null,
    problems: ['policy-status'],
  });
});

test('B-4: an unavailable or invalid adopted policy gives configuration-unavailable, never the experimental fixture', () => {
  assert.deepEqual(prepareTreeEmergentBoundaryReasoning({ adoptedPolicy: NOT_PREPARED_TREE_EMERGENT_BOUNDARY_POLICY }).assessment, {
    status: 'configuration-unavailable',
    reason: 'adopted-policy-unavailable',
    policy: null,
  });
  const invalid = getBuiltinTreeEmergentBoundaryPolicy();
  const assessment = prepareTreeEmergentBoundaryReasoning({
    adoptedPolicy: { ...invalid, policy: { ...invalid.policy, decisions: { ...invalid.policy.decisions, 'minimum-primary-units': { status: 'resolved', value: -1 } } } },
  }).assessment;
  assert.deepEqual(assessment, {
    status: 'configuration-unavailable',
    reason: 'adopted-policy-invalid',
    policy: null,
    problems: ['decision-value:minimum-primary-units'],
  });
  // Neither source: the reason a direct call without any policy has always reported.
  assert.deepEqual(prepareTreeEmergentBoundaryReasoning({}).assessment, { status: 'configuration-unavailable', reason: 'experimental-policy-absent', policy: null });
  // An explicit non-Builtin root without a resolution is not prepared, and is never read as Builtin.
  assert.equal(loadTreeEmergentBoundaryPolicy({ registryRoots: { [TREE_REGISTRY_SLICE_ID]: os.tmpdir() } }), NOT_PREPARED_TREE_EMERGENT_BOUNDARY_POLICY);
  assert.equal(loadTreeEmergentBoundaryPolicy({}), getBuiltinTreeEmergentBoundaryPolicy());
});

const withTargetRoot = (run) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-emergent-boundary-policy-'));
  const targetRoot = path.join(fixtureRoot, 'target');
  fs.mkdirSync(targetRoot);
  try {
    return run({ targetRoot, paths: resolveRegistryLifecyclePaths({ targetRoot }) });
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
};

test('B-5: the run resolution provides the registry with its provenance, and the loader reports exactly that', () => {
  withTargetRoot(({ targetRoot }) => {
    const registryResolution = resolveActiveRegistrySet({ targetRoot });
    const provenance = registryResolution.registryProvenance[TREE_REGISTRY_SLICE_ID][EMERGENT_BOUNDARY_POLICY_REGISTRY_ID];
    assert.equal(provenance.source, 'builtin');
    const loaded = loadTreeEmergentBoundaryPolicy({ registryResolution });
    assert.deepEqual(loaded.registry, { registryId: EMERGENT_BOUNDARY_POLICY_REGISTRY_ID, version: '1', source: 'builtin', digest: provenance.digest });
    assert.equal(loaded.registry.digest, getBuiltinTreeEmergentBoundaryPolicy().registry.digest);
  });
});

test('B-5: a Custom set copy is consumer policy with source custom; an active Custom set without it is blocked as incomplete', () => {
  withTargetRoot(({ targetRoot, paths }) => {
    initCustomRegistrySet({ targetRoot, validatorVersion: '0.0.0-test', slices: REGISTRY_LIFECYCLE_SLICES });
    useRegistrySet({ targetRoot, activeSet: 'custom' });
    const loaded = loadTreeEmergentBoundaryPolicy({ registryResolution: resolveActiveRegistrySet({ targetRoot }) });
    assert.equal(loaded.registry.source, 'custom');
    assert.deepEqual(loaded.policy, getBuiltinTreeEmergentBoundaryPolicy().policy);

    fs.rmSync(path.join(paths.customRoot, TREE_REGISTRY_SLICE_ID, 'emergent-boundary-policy.registry.json'));
    assert.throws(
      () => resolveActiveRegistrySet({ targetRoot }),
      (error) =>
        error instanceof RegistryLifecycleError &&
        error.conditions.some((condition) => condition.registryId === EMERGENT_BOUNDARY_POLICY_REGISTRY_ID && condition.condition === 'missing'),
    );
  });
});

test('B-6: on this repository, adopted assessments equal the experimental-v1 assessments and every Tree finding is unchanged', () => {
  const repositoryRoot = process.cwd();
  const registryResolution = resolveActiveRegistrySet({ targetRoot: repositoryRoot });
  const staged = prepareNamingTreeStagingInputs(runNamingValidator(repositoryRoot, { scope: 'repo', registryResolution }), { registryResolution });
  const prepare = (extra = {}) => prepareTreeStructureAdvisorInputs(repositoryRoot, { scope: 'repo', registryResolution, ...staged, ...extra });
  const adopted = prepare();
  const experimental = prepare({ emergentBoundaryPolicy: EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY });
  const adoptedRecord = adopted.preparedDependencies.treeEmergentBoundaryReasoning;
  assert.equal(adoptedRecord.assessment.policySource, 'adopted');
  assert.ok(Object.keys(signaturesOf(adoptedRecord)).length > 0);
  assert.deepEqual(signaturesOf(adoptedRecord), signaturesOf(experimental.preparedDependencies.treeEmergentBoundaryReasoning));
  assert.equal(JSON.stringify(runTreeStructureAdvisorRuntime(adopted)), JSON.stringify(runTreeStructureAdvisorRuntime(experimental)));
});
