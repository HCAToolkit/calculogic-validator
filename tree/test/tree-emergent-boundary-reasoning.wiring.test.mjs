// Tree Stage 3 wiring and report isolation (Tree spec S3.7, S3.8, S3.13; calculogic-validator#136, #171).
// A real run evaluates `treeEmergentBoundaryReasoning` under the adopted policy; the programmatic
// `emergentBoundaryPolicy` argument is the only way to supply an experimental one. The report never
// carries the record: only the S3.13 advisory finding and the `meta.emergentBoundaryReasoning` summary
// are derived from it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runValidatorRunner } from '../../src/core/validator-runner.logic.mjs';
import { resolveActiveRegistrySet } from '../../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { prepareNamingTreeStagingInputs, runNamingValidator } from '../../naming/src/naming-validator.host.mjs';
import { prepareTreeStructureAdvisorInputs } from '../src/tree-structure-advisor.wiring.mjs';
import { runTreeStructureAdvisor as runTreeStructureAdvisorRuntime } from '../src/tree-structure-advisor.logic.mjs';
import { EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY } from './fixtures/emergent-boundary-catalogue/emergent-boundary-experimental-policy.fixture.mjs';

// An E6-like directory: a `registry-lifecycle` group of three units among other `registry` units and
// unrelated siblings.
const FILES = [
  'lib/registry-lifecycle-loader.logic.mjs',
  'lib/registry-lifecycle-resolver.logic.mjs',
  'lib/registry-lifecycle-state.logic.mjs',
  'lib/registry-policy.logic.mjs',
  'lib/registry-report.logic.mjs',
  'lib/cache-store.logic.mjs',
  'lib/schema-parse.logic.mjs',
];

const withRepository = (run) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-emergent-boundary-'));
  try {
    for (const relativePath of FILES) {
      fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
      fs.writeFileSync(path.join(root, relativePath), 'export {};\n');
    }
    const registryResolution = resolveActiveRegistrySet({ targetRoot: root });
    const staged = prepareNamingTreeStagingInputs(runNamingValidator(root, { scope: 'repo', registryResolution }), { registryResolution });
    run({ root, prepare: (extra = {}) => prepareTreeStructureAdvisorInputs(root, { scope: 'repo', registryResolution, ...staged, ...extra }) });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

const IDENTIFYING_MARKERS = ['tree-emergent-boundary-reasoning', 'treeEmergentBoundaryReasoning', 'emergent-boundary-experimental', 'stage-3-evidence-only', 'prefix-v0'];

// Tree spec S3.13.6 (calculogic-validator#171, slice B): a real run evaluates Stage 3 under the adopted
// policy from its resolved Tree registry. Before slice B this run recorded `experimental-policy-absent`.
test('a real run evaluates Stage 3 under the adopted Builtin policy, and the record says so', () => {
  withRepository(({ prepare }) => {
    const prepared = prepare().preparedDependencies;
    const record = prepared.treeEmergentBoundaryReasoning;
    assert.deepEqual(record.preparation, { status: 'prepared' });
    assert.equal(record.assessment.status, 'evaluated');
    assert.equal(record.assessment.policySource, 'adopted');
    assert.deepEqual(
      [record.assessment.policy.policyId, record.assessment.policy.policyVersion, record.assessment.policy.policyStatus],
      ['emergent-boundary', '1', 'adopted'],
    );
    assert.deepEqual(
      { registryId: record.assessment.policyRegistry.registryId, version: record.assessment.policyRegistry.version, source: record.assessment.policyRegistry.source },
      { registryId: 'tree/emergent-boundary-policy', version: '1', source: 'builtin' },
    );
    assert.equal(record.assessment.policyRegistry.digest, prepared.treeEmergentBoundaryPolicy.registry.digest);
    const lib = record.directories.find((directory) => directory.path === 'lib');
    assert.deepEqual(lib.candidates.map((candidate) => candidate.prefix.join('-')), ['registry', 'registry-lifecycle']);
    const outcomes = Object.fromEntries(lib.candidates.map((candidate) => [candidate.prefix.join('-'), [candidate.assessment.outcome, ...candidate.assessment.reasons]]));
    assert.equal(outcomes['registry-lifecycle'][0], 'opportunity');
    assert.deepEqual(outcomes.registry, ['insufficient-evidence', 'low-specificity']);
  });
});

test('the programmatic policy argument evaluates the record: the E6 shape reaches its catalogue outcomes', () => {
  withRepository(({ prepare }) => {
    const record = prepare({ emergentBoundaryPolicy: EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY }).preparedDependencies.treeEmergentBoundaryReasoning;
    assert.equal(record.assessment.status, 'evaluated');
    const outcomes = Object.fromEntries(
      record.directories.find((directory) => directory.path === 'lib').candidates.map((candidate) => [candidate.prefix.join('-'), [candidate.assessment.outcome, ...candidate.assessment.reasons]]),
    );
    assert.deepEqual(outcomes['registry-lifecycle'][0], 'opportunity');
    assert.deepEqual(outcomes.registry, ['insufficient-evidence', 'low-specificity']);
  });
});

test('report isolation: the override changes only the Stage 3 summary, never a finding, and the report carries no record', () => {
  withRepository(({ root, prepare }) => {
    const without = runTreeStructureAdvisorRuntime(prepare());
    const withPolicy = runTreeStructureAdvisorRuntime(prepare({ emergentBoundaryPolicy: EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY }));
    // Since calculogic-validator#171 slice C the summary names the policy source (S3.13.7); neither run
    // emits a Stage 3 finding (no profile, EL2; the override, EL1).
    const { emergentBoundaryReasoning: summaryWith, ...restWith } = withPolicy;
    const { emergentBoundaryReasoning: summaryWithout, ...restWithout } = without;
    assert.equal(JSON.stringify(restWith), JSON.stringify(restWithout));
    assert.deepEqual([summaryWithout.policySource, summaryWith.policySource], ['adopted', 'experimental-override']);
    assert.deepEqual([summaryWithout.reason, summaryWith.reason], ['language-profile-inactive', 'policy-not-adopted']);
    const report = JSON.stringify(runValidatorRunner(root, { validators: ['tree-structure-advisor'], scope: 'repo' }));
    for (const serialized of [JSON.stringify(without), report]) {
      for (const marker of IDENTIFYING_MARKERS) assert.equal(serialized.includes(marker), false, marker);
    }
  });
});
