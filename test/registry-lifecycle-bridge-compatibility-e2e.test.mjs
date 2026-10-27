import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { initCustomRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-init.logic.mjs';
import { exportPortableSet } from '../src/core/registry-lifecycle/registry-lifecycle-portable-set.logic.mjs';
import { resolveCandidateRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-candidate.logic.mjs';
import { resolveActiveRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { buildRegistryLifecycleStatus } from '../src/core/registry-lifecycle/registry-lifecycle-status.logic.mjs';
import { useRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-use.logic.mjs';
import { resolveRegistryLifecyclePaths } from '../src/core/registry-lifecycle/registry-lifecycle-state.logic.mjs';
import { LIFECYCLE_TRANSACTION_DIRNAME } from '../src/core/registry-lifecycle/registry-lifecycle.contracts.mjs';
import { runValidatorRunner } from '../src/core/validator-runner.logic.mjs';
import { runNamingValidator } from '../naming/src/naming-validator.wiring.mjs';
import { prepareTreeStructureAdvisorInputs } from '../tree/src/tree-structure-advisor.wiring.mjs';

// Cross-slice bridge compatibility end to end (lifecycle spec §9.4, calculogic-validator#61), over the
// real inventories, resolvers, Builtin set and runtime. Every case reads the one declared bridge.
const packageRoot = path.resolve(new URL('..', import.meta.url).pathname);
const validateAllScript = path.join(packageRoot, 'scripts/validate-all.host.mjs');
const BRIDGE = Object.freeze({
  bridgeId: 'naming/folder-composition-structural-role-token',
  perspective: 'semantic-qualified-structural-container',
  emitter: { sliceId: 'naming', registryId: 'naming/folder-composition-patterns' },
  consumer: { sliceId: 'tree', registryId: 'tree/structural-role-tokens' },
});
const SRC_PATTERN = 'folderCompositionPatterns[patternId="semantic-qualified-src-container.v1"]';
const LIB_PATTERN = 'folderCompositionPatterns[patternId="tree-lib-container"]';
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, payload) => fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
const compatible = (set) => ({ set, bridges: [{ ...BRIDGE, state: 'compatible', uninterpretable: [] }] });
const gaps = (set, uninterpretable) => ({ set, bridges: [{ ...BRIDGE, state: 'gaps', uninterpretable }] });
const unavailable = (set, sides, extra = {}) => ({ set, ...extra, bridges: [{ ...BRIDGE, state: 'unavailable', unavailable: sides }] });

const libPattern = (patternId = 'tree-lib-container', folderName = 'tree-lib') => ({
  patternId,
  status: 'active',
  compositionKind: 'semantic-qualified-structural-container',
  semanticQualifier: 'tree',
  structuralRoleToken: 'lib',
  tokenOrder: ['semantic-qualifier', 'structural-role-token'],
  folderName,
  qualification: 'explicit-supported-folder-composition',
  confidence: 'bounded',
  definition: 'A consumer-owned composition pattern for a tree library container.',
});

const withCustomSet = (run) => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-bridge-compatibility-'));
  try {
    fs.writeFileSync(path.join(targetRoot, 'package.json'), '{"name":"bridge-compatibility-fixture","private":true}\n');
    fs.writeFileSync(path.join(targetRoot, 'widget.logic.mjs'), 'export const widget = 1;\n');
    initCustomRegistrySet({ targetRoot, validatorVersion: '0.0.0-test' });
    const paths = resolveRegistryLifecyclePaths({ targetRoot });
    const customFile = (registryId) => {
      const [sliceId, name] = registryId.split('/');
      return path.join(paths.customRoot, sliceId, `${name}.registry.json`);
    };
    const update = (registryId, change) => writeJson(customFile(registryId), change(readJson(customFile(registryId))));
    return run({
      targetRoot,
      paths,
      customFile,
      update,
      status: () => buildRegistryLifecycleStatus({ targetRoot }),
      addLibPattern: (...patterns) =>
        update(BRIDGE.emitter.registryId, (payload) => ({
          ...payload,
          folderCompositionPatterns: [...payload.folderCompositionPatterns, ...(patterns.length > 0 ? patterns : [libPattern()])],
        })),
      runReport: () => runValidatorRunner(targetRoot, { scope: 'repo' }),
      exitCode: () => spawnSync(process.execPath, ['--experimental-strip-types', validateAllScript, '--scope=repo'], { cwd: targetRoot, encoding: 'utf8' }).status,
      relationshipOf: (folderPath) =>
        prepareTreeStructureAdvisorInputs(targetRoot, { scope: 'repo', registryResolution: resolveActiveRegistrySet({ targetRoot }) })
          .preparedDependencies.treeSemanticNamingFolderTypeRelationshipEvidence.relationshipRecords.find((record) => record.path === folderPath),
    });
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
};

test('case 1: Builtin domains match; every run report carries the Builtin record, and status without a Custom set has none', () => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-bridge-compatibility-builtin-'));
  try {
    fs.writeFileSync(path.join(targetRoot, 'widget.logic.mjs'), 'export const widget = 1;\n');
    const runner = runValidatorRunner(targetRoot, { scope: 'repo' });
    const naming = runNamingValidator(targetRoot, { scope: 'repo' });
    assert.deepEqual(runner.registrySet.bridgeCompatibility, compatible('builtin'));
    // The direct Naming report carries the same record, though Tree did not run: it describes registries.
    assert.deepEqual(naming.registrySet.bridgeCompatibility, runner.registrySet.bridgeCompatibility);
    assert.equal(Object.hasOwn(buildRegistryLifecycleStatus({ targetRoot }), 'bridgeCompatibility'), false);
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
});

test('case 2: a Custom Naming token Tree cannot interpret is reported before any matching folder exists, and Tree\'s folder interpretation is unchanged once one does', () => {
  withCustomSet(({ targetRoot, status, addLibPattern, runReport, exitCode, relationshipOf }) => {
    const builtinRun = runReport();
    const builtinExit = exitCode();
    addLibPattern();

    // No `tree-lib` folder exists: the gap is a registry-level fact.
    assert.equal(fs.existsSync(path.join(targetRoot, 'tree-lib')), false);
    const expected = gaps('custom', [{ value: 'lib', emittedBy: [LIB_PATTERN] }]);
    assert.deepEqual(status().bridgeCompatibility, expected);
    assert.deepEqual(status().customIssues, [], 'a gap is never a Custom issue');

    // A gap never blocks: the set activates, and runs report the same record.
    useRegistrySet({ targetRoot, activeSet: 'custom' });
    const customRun = runReport();
    assert.deepEqual(customRun.registrySet.bridgeCompatibility, expected);
    assert.deepEqual(runNamingValidator(targetRoot, { scope: 'repo' }).registrySet.bridgeCompatibility, expected);
    // Without a matching folder Tree has nothing to interpret, so findings and exit code are Builtin's.
    assert.equal(relationshipOf('tree-lib'), undefined);
    assert.deepEqual(
      customRun.validators.map((entry) => [entry.id, entry.findings]),
      builtinRun.validators.map((entry) => [entry.id, entry.findings]),
    );
    assert.equal(exitCode(), builtinExit);

    // Once a matching folder exists, Tree's own per-folder interpretation is as before, and the
    // registry-level record does not depend on it.
    fs.mkdirSync(path.join(targetRoot, 'tree-lib'));
    fs.writeFileSync(path.join(targetRoot, 'tree-lib', 'helper.logic.mjs'), 'export const helper = 1;\n');
    const relationship = relationshipOf('tree-lib');
    assert.equal(relationship.relationshipInterpretation, 'structural-token-not-registered-for-this-perspective');
    assert.equal(relationship.structuralRoleToken, 'lib');
    assert.equal(relationship.structuralRole, null);
    assert.deepEqual(status().bridgeCompatibility, expected);
    assert.deepEqual(runReport().registrySet.bridgeCompatibility, expected);
  });
});

test('every pattern emitting an uninterpretable value is listed, in ordinal order', () => {
  withCustomSet(({ status, addLibPattern }) => {
    addLibPattern(libPattern('z-lib-container', 'z-lib'), libPattern('a-lib-container', 'a-lib'));
    assert.deepEqual(
      status().bridgeCompatibility,
      gaps('custom', [
        {
          value: 'lib',
          emittedBy: ['folderCompositionPatterns[patternId="a-lib-container"]', 'folderCompositionPatterns[patternId="z-lib-container"]'],
        },
      ]),
    );
  });
});

test('case 3: a Custom Tree change leaves a supported Naming token uninterpretable, attributed to its unedited emitter', () => {
  for (const change of [{ status: 'deprecated' }, { relationshipPerspective: 'another-perspective' }]) {
    withCustomSet(({ status, update }) => {
      update(BRIDGE.consumer.registryId, (payload) => ({
        ...payload,
        structuralRoleTokens: payload.structuralRoleTokens.map((entry) => (entry.token === 'src' ? { ...entry, ...change } : entry)),
      }));
      assert.deepEqual(status().bridgeCompatibility, gaps('custom', [{ value: 'src', emittedBy: [SRC_PATTERN] }]), JSON.stringify(change));
    });
  }
});

test('case 4: an unreadable consumer in an inactive Custom set is unavailable, never an empty domain; its own condition, not the bridge, refuses activation', () => {
  withCustomSet(({ targetRoot, status, customFile, runReport }) => {
    fs.writeFileSync(customFile(BRIDGE.consumer.registryId), '{ broken');
    const reported = status();
    assert.equal(reported.bridgeCompatibility.bridges[0].state, 'unavailable');
    assert.deepEqual(
      reported.bridgeCompatibility.bridges[0].unavailable.map(({ side, registryId, condition }) => [side, registryId, condition]),
      [['consumer', BRIDGE.consumer.registryId, 'invalid']],
    );
    assert.equal(Object.hasOwn(reported.bridgeCompatibility.bridges[0], 'uninterpretable'), false);
    const statusEntry = reported.registries.find((entry) => entry.registryId === BRIDGE.consumer.registryId);
    assert.equal(reported.bridgeCompatibility.bridges[0].unavailable[0].detail, statusEntry.detail);
    assert.deepEqual(reported.customIssues.map((issue) => `${issue.registryId}:${issue.condition}`), [`${BRIDGE.consumer.registryId}:invalid`]);
    assert.throws(() => useRegistrySet({ targetRoot, activeSet: 'custom' }), /tree\/structural-role-tokens: invalid/u);
    // The Builtin run describes Builtin, never the inactive Custom set.
    assert.deepEqual(runReport().registrySet.bridgeCompatibility, compatible('builtin'));
  });
});

test('case 5: a missing emitter is unavailable; Builtin patterns are never substituted', () => {
  withCustomSet(({ status, customFile }) => {
    fs.rmSync(customFile(BRIDGE.emitter.registryId));
    assert.deepEqual(
      status().bridgeCompatibility,
      unavailable('custom', [{ side: 'emitter', registryId: BRIDGE.emitter.registryId, condition: 'missing', detail: 'Absent from the Custom set.' }]),
    );
  });
});

test('availability follows the status classification: version-incompatible, slice-invalid, and both sides at once', () => {
  withCustomSet(({ status, update }) => {
    update(BRIDGE.consumer.registryId, (payload) => ({ ...payload, version: '9' }));
    const [side] = status().bridgeCompatibility.bridges[0].unavailable;
    assert.deepEqual([side.side, side.condition], ['consumer', 'version-incompatible']);
    assert.match(side.detail, /Version "9" is not readable/u);
  });
  // Parses and is readable, but fails Naming's registry-set validation: the runtime would refuse it.
  withCustomSet(({ status, update }) => {
    update(BRIDGE.emitter.registryId, (payload) => ({ ...payload, unexpected: true }));
    const reported = status();
    const [side] = reported.bridgeCompatibility.bridges[0].unavailable;
    assert.deepEqual([side.side, side.condition], ['emitter', 'invalid']);
    assert.equal(side.detail, reported.registries.find((entry) => entry.registryId === BRIDGE.emitter.registryId).detail);
  });
  withCustomSet(({ status, customFile }) => {
    fs.rmSync(customFile(BRIDGE.emitter.registryId));
    fs.writeFileSync(customFile(BRIDGE.consumer.registryId), '{ broken');
    assert.deepEqual(
      status().bridgeCompatibility.bridges[0].unavailable.map(({ side, condition }) => [side, condition]),
      [['emitter', 'missing'], ['consumer', 'invalid']],
    );
  });
});

test('a malformed manifest leaves the registries comparable', () => {
  withCustomSet(({ status, paths, addLibPattern }) => {
    addLibPattern();
    fs.writeFileSync(paths.manifestPath, '{ broken');
    const reported = status();
    assert.ok(reported.manifestError);
    assert.deepEqual(reported.bridgeCompatibility, gaps('custom', [{ value: 'lib', emittedBy: [LIB_PATTERN] }]));
  });
});

test('an interrupted transaction: compatibility is diagnostic and marked; the transaction condition keeps its authority', () => {
  withCustomSet(({ targetRoot, paths, status }) => {
    fs.mkdirSync(path.join(paths.lifecycleRoot, LIFECYCLE_TRANSACTION_DIRNAME));
    const reported = status();
    assert.deepEqual(reported.bridgeCompatibility, { ...compatible('custom'), interruptedTransaction: true });
    assert.deepEqual(Object.keys(reported.bridgeCompatibility), ['set', 'interruptedTransaction', 'bridges']);
    // A compatible bridge neither clears the condition nor enables activation.
    assert.ok(reported.customIssues.some((issue) => issue.condition === 'interrupted-transaction'));
    assert.throws(() => useRegistrySet({ targetRoot, activeSet: 'custom' }), /interrupted-transaction/u);
    assert.ok(fs.existsSync(path.join(paths.lifecycleRoot, LIFECYCLE_TRANSACTION_DIRNAME)), 'status never recovers a transaction');
  });
});

test('a candidate run describes the candidate set, not the repository\'s Custom set', () => {
  withCustomSet(({ targetRoot, addLibPattern }) => {
    addLibPattern();
    const artifact = exportPortableSet({ targetRoot, validatorVersion: '0.0.0-test' });
    withCustomSet(({ targetRoot: otherRoot, status }) => {
      // The repository running the candidate has its own, compatible Custom set.
      assert.deepEqual(status().bridgeCompatibility, compatible('custom'));
      const resolution = resolveCandidateRegistrySet({ artifactBytes: Buffer.from(JSON.stringify(artifact)) });
      try {
        assert.deepEqual(resolution.registrySet.bridgeCompatibility, gaps('candidate', [{ value: 'lib', emittedBy: [LIB_PATTERN] }]));
        const report = runValidatorRunner(otherRoot, { scope: 'repo', registryResolution: resolution });
        assert.deepEqual(report.registrySet.bridgeCompatibility, resolution.registrySet.bridgeCompatibility);
      } finally {
        resolution.dispose();
      }
    });
  });
});
