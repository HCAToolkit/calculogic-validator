// Tree Stage 3 wiring and report isolation (Tree spec S3.7, S3.8; calculogic-validator#136). A real
// run prepares `treeEmergentBoundaryReasoning` without a policy, so without outcomes; the programmatic
// `emergentBoundaryPolicy` argument is the only way to supply one. With or without it, no finding,
// report field or `meta` entry reads the record.
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

test('a real run prepares Stage 3 evidence without outcomes: no policy reaches it', () => {
  withRepository(({ prepare }) => {
    const record = prepare().preparedDependencies.treeEmergentBoundaryReasoning;
    assert.deepEqual(record.preparation, { status: 'prepared' });
    assert.deepEqual(record.assessment, { status: 'configuration-unavailable', reason: 'experimental-policy-absent', policy: null });
    const lib = record.directories.find((directory) => directory.path === 'lib');
    assert.deepEqual(lib.candidates.map((candidate) => candidate.prefix.join('-')), ['registry', 'registry-lifecycle']);
    assert.ok(lib.candidates.every((candidate) => candidate.assessment === undefined));
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

test('report isolation: the Tree result is identical with and without the policy and carries none of the record', () => {
  withRepository(({ root, prepare }) => {
    const without = JSON.stringify(runTreeStructureAdvisorRuntime(prepare()));
    const withPolicy = JSON.stringify(runTreeStructureAdvisorRuntime(prepare({ emergentBoundaryPolicy: EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY })));
    assert.equal(withPolicy, without);
    const report = JSON.stringify(runValidatorRunner(root, { validators: ['tree-structure-advisor'], scope: 'repo' }));
    for (const serialized of [without, report]) {
      for (const marker of IDENTIFYING_MARKERS) assert.equal(serialized.includes(marker), false, marker);
    }
  });
});
