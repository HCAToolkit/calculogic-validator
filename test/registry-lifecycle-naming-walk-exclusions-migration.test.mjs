import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REGISTRY_LIFECYCLE_SLICES } from '../src/core/registry-lifecycle/registry-lifecycle-inventory.knowledge.mjs';
import { digestRegistryPayload } from '../src/core/registry-lifecycle/registry-lifecycle-canonical-digest.logic.mjs';
import { initCustomRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-init.logic.mjs';
import { applyRegistryMigrationPlan } from '../src/core/registry-lifecycle/registry-lifecycle-migrate.logic.mjs';
import { buildRegistryMigrationPlan } from '../src/core/registry-lifecycle/registry-lifecycle-migration-plan.logic.mjs';
import { buildRegistryLifecycleDiff } from '../src/core/registry-lifecycle/registry-lifecycle-diff.logic.mjs';
import { resolveActiveRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { buildRegistryLifecycleStatus } from '../src/core/registry-lifecycle/registry-lifecycle-status.logic.mjs';
import { validateSliceRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-slice-validation.logic.mjs';
import { useRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-use.logic.mjs';
import {
  readRegistrySetManifest,
  resolveRegistryLifecyclePaths,
} from '../src/core/registry-lifecycle/registry-lifecycle-state.logic.mjs';
import { runNamingValidator } from '../naming/src/naming-validator.wiring.mjs';

// The retirement of `allowDotFiles` (calculogic-validator#54): a Custom set initialized while
// naming/walk-exclusions shipped at version "1" meets a release whose Builtin is version "2", the
// only readable version. The real inventories, transforms, slice validation and Naming runtime are
// used throughout; only the Builtin roots are private copies, so the release can be emulated.
const REGISTRY_ID = 'naming/walk-exclusions';
const FILE_NAME = 'walk-exclusions.registry.json';
const TRANSFORM_ID = 'walk-exclusions-v1-to-v2';
const V1_FIXTURE = new URL('../naming/test/fixtures/registry-migrations/walk-exclusions.v1.registry.json', import.meta.url);
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, payload) => fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
const namingEntry = REGISTRY_LIFECYCLE_SLICES.find((slice) => slice.sliceId === 'naming').inventory.find(
  (entry) => entry.registryId === REGISTRY_ID,
);

const withVersionOneCustomSet = (run) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-naming-we-'));
  const targetRoot = path.join(fixtureRoot, 'target');
  fs.mkdirSync(targetRoot);
  // Something for the Naming runtime to walk: a reportable file, and one under a directory a
  // consumer may exclude.
  fs.writeFileSync(path.join(targetRoot, 'widget.logic.mjs'), 'export const widget = 1;\n');
  fs.mkdirSync(path.join(targetRoot, 'vendor'));
  fs.writeFileSync(path.join(targetRoot, 'vendor', 'library.logic.mjs'), 'export const library = 1;\n');
  const slices = REGISTRY_LIFECYCLE_SLICES.map((slice) => {
    const builtinRoot = path.join(fixtureRoot, 'builtin', slice.sliceId);
    fs.cpSync(slice.builtinRoot, builtinRoot, { recursive: true });
    return { ...slice, builtinRoot };
  });
  const builtinFile = path.join(fixtureRoot, 'builtin', 'naming', FILE_NAME);
  const v2Builtin = fs.readFileSync(builtinFile);

  try {
    // The previous release: version "1" Builtin, from which the Custom set and its Baseline are copied.
    fs.copyFileSync(V1_FIXTURE, builtinFile);
    initCustomRegistrySet({ targetRoot, validatorVersion: '0.0.0-v1-release', slices });
    // The current release ships version "2".
    fs.writeFileSync(builtinFile, v2Builtin);

    const paths = resolveRegistryLifecyclePaths({ targetRoot });
    const registryRoots = Object.fromEntries(slices.map((slice) => [slice.sliceId, slice.builtinRoot]));
    return run({
      targetRoot,
      slices,
      paths,
      v2: JSON.parse(v2Builtin.toString('utf8')),
      customFile: path.join(paths.customRoot, 'naming', FILE_NAME),
      baselineFile: path.join(paths.baselineRoot, 'naming', FILE_NAME),
      registryOf: (output) => output.registries.find((registry) => registry.registryId === REGISTRY_ID),
      // The Naming run on the active set, with the release's (private) Builtin roots.
      runNaming: () => {
        const resolution = resolveActiveRegistrySet({ targetRoot, slices });
        return runNamingValidator(targetRoot, {
          scope: 'repo',
          registryResolution: resolution.activeSet === 'custom' ? resolution : { ...resolution, registryRoots },
        });
      },
      migrateAll: () => {
        const document = buildRegistryMigrationPlan({ targetRoot, slices });
        const accepted = {
          ...document,
          registries: document.registries.map((record) => ({ ...record, decision: 'accept' })),
        };
        return applyRegistryMigrationPlan({ loadDocument: () => structuredClone(accepted), targetRoot, slices });
      },
    });
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
};

const selectedPathsOf = (output) => output.findings.map((finding) => finding.path).sort();

test('a version 1 Custom set is version-incompatible: reported while inactive, refused when active, offered a migration', () => {
  withVersionOneCustomSet(({ targetRoot, slices, paths, customFile, registryOf, runNaming }) => {
    const customBefore = fs.readFileSync(customFile);
    assert.equal(readJson(customFile).version, '1');
    // Its retired field is not reported as an unsupported field: the version decides the shape.
    assert.deepEqual(validateSliceRegistrySet('naming', path.join(paths.customRoot, 'naming')), []);

    const status = buildRegistryLifecycleStatus({ targetRoot, slices });
    assert.equal(registryOf(status).classification, 'version-incompatible');
    assert.deepEqual(status.customIssues, [
      {
        registryId: REGISTRY_ID,
        condition: 'version-incompatible',
        detail: 'Version "1" is not readable; readable versions: 2.',
      },
    ]);

    // Inactive (Builtin is the active set): validation runs on Builtin and leaves the Custom set as it is.
    assert.equal(runNaming().registrySet.activeSet, 'builtin');

    // Active: `use custom` is refused, and a state file that selects Custom blocks validation.
    assert.throws(() => useRegistrySet({ targetRoot, activeSet: 'custom', slices }), /naming\/walk-exclusions: version-incompatible/u);
    writeJson(paths.statePath, { schemaVersion: '1', activeSet: 'custom' });
    assert.throws(runNaming, /naming\/walk-exclusions: version-incompatible/u);

    // Neither run migrated the Custom file.
    assert.deepEqual(fs.readFileSync(customFile), customBefore);

    const plan = buildRegistryMigrationPlan({ targetRoot, slices });
    assert.deepEqual(plan.registries.map((record) => record.registryId), [REGISTRY_ID]);
    assert.deepEqual(registryOf(plan).path.map((step) => step.transform), [TRANSFORM_ID]);
    assert.deepEqual(plan.notMigratable, []);
  });
});

test('migrating an unmodified version 1 Custom set yields the version 2 Builtin, for the Baseline and the Custom file alike', () => {
  withVersionOneCustomSet(({ targetRoot, slices, paths, v2, customFile, baselineFile, registryOf, migrateAll, runNaming }) => {
    const v1Digest = digestRegistryPayload(readJson(V1_FIXTURE), namingEntry.migrations[0].fromDescriptor);
    assert.deepEqual(migrateAll(), { applied: [REGISTRY_ID], skipped: [] });

    assert.deepEqual(readJson(baselineFile), v2);
    assert.deepEqual(readJson(customFile), v2);
    assert.equal(Object.hasOwn(readJson(customFile), 'allowDotFiles'), false);
    const manifestEntry = readRegistrySetManifest(paths).manifest.basedOn.registries[REGISTRY_ID];
    assert.deepEqual(manifestEntry, {
      validatorVersion: '0.0.0-v1-release',
      version: '2',
      digest: digestRegistryPayload(v2, namingEntry.descriptor),
      migration: { fromVersion: '1', fromDigest: v1Digest, path: [TRANSFORM_ID] },
    });

    const status = buildRegistryLifecycleStatus({ targetRoot, slices });
    assert.equal(registryOf(status).classification, 'unchanged');
    assert.deepEqual(status.customIssues, []);
    assert.deepEqual(registryOf(buildRegistryLifecycleDiff({ targetRoot, slices })).entries ?? [], []);
    assert.deepEqual(validateSliceRegistrySet('naming', path.join(paths.customRoot, 'naming')), []);

    // The migrated set is usable, and the Custom run selects what the Builtin run selects.
    const builtinRun = runNaming();
    useRegistrySet({ targetRoot, activeSet: 'custom', slices });
    const customRun = runNaming();
    assert.equal(customRun.registrySet.activeSet, 'custom');
    assert.deepEqual(selectedPathsOf(customRun), selectedPathsOf(builtinRun));
    assert.deepEqual(customRun.findings, builtinRun.findings);
  });
});

test('a consumer edit to the walk policy survives migration and reaches the runtime', () => {
  withVersionOneCustomSet(({ targetRoot, slices, v2, customFile, baselineFile, registryOf, migrateAll, runNaming }) => {
    const edited = readJson(customFile);
    edited.excludedDirectories = [...edited.excludedDirectories, 'vendor'];
    edited.allowDotFiles = [...edited.allowDotFiles, '.npmrc'];
    writeJson(customFile, edited);

    assert.deepEqual(migrateAll(), { applied: [REGISTRY_ID], skipped: [] });

    assert.deepEqual(readJson(baselineFile), v2);
    assert.deepEqual(readJson(customFile), {
      version: '2',
      excludedDirectories: edited.excludedDirectories,
      skipDotDirectories: edited.skipDotDirectories,
    });
    const diff = registryOf(buildRegistryLifecycleDiff({ targetRoot, slices }));
    assert.deepEqual(
      diff.entries.map((entry) => [entry.class, entry.address]),
      [['custom-only', 'excludedDirectories["vendor"]']],
    );

    assert.ok(selectedPathsOf(runNaming()).includes('vendor/library.logic.mjs'));
    useRegistrySet({ targetRoot, activeSet: 'custom', slices });
    const customPaths = selectedPathsOf(runNaming());
    assert.ok(customPaths.includes('widget.logic.mjs'));
    assert.equal(customPaths.includes('vendor/library.logic.mjs'), false);
  });
});

test('a consumer difference confined to allowDotFiles is discarded by migration', () => {
  withVersionOneCustomSet(({ targetRoot, slices, v2, customFile, registryOf, migrateAll }) => {
    const edited = readJson(customFile);
    edited.allowDotFiles = ['.npmrc', '.editorconfig'];
    writeJson(customFile, edited);
    assert.equal(registryOf(buildRegistryLifecycleStatus({ targetRoot, slices })).classification, 'version-incompatible');

    assert.deepEqual(migrateAll(), { applied: [REGISTRY_ID], skipped: [] });

    assert.deepEqual(readJson(customFile), v2);
    assert.equal(registryOf(buildRegistryLifecycleStatus({ targetRoot, slices })).classification, 'unchanged');
    assert.deepEqual(registryOf(buildRegistryLifecycleDiff({ targetRoot, slices })).entries ?? [], []);
  });
});

test('a version 2 Custom payload that carries the retired field is invalid and blocks', () => {
  withVersionOneCustomSet(({ targetRoot, slices, paths, customFile, registryOf, migrateAll }) => {
    migrateAll();
    writeJson(customFile, { ...readJson(customFile), allowDotFiles: ['.eslintrc'] });

    const [failure] = validateSliceRegistrySet('naming', path.join(paths.customRoot, 'naming'));
    assert.equal(failure.registryId, REGISTRY_ID);
    assert.match(failure.detail, /unsupported field\(s\) allowDotFiles/u);

    const status = buildRegistryLifecycleStatus({ targetRoot, slices });
    assert.equal(registryOf(status).classification, 'invalid');
    assert.deepEqual(status.customIssues.map((issue) => `${issue.registryId}:${issue.condition}`), [`${REGISTRY_ID}:invalid`]);
    assert.throws(() => useRegistrySet({ targetRoot, activeSet: 'custom', slices }), /naming\/walk-exclusions: invalid/u);
  });
});
