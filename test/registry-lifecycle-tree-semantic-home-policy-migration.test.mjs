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
import { buildRegistryLifecycleStatus } from '../src/core/registry-lifecycle/registry-lifecycle-status.logic.mjs';
import { validateSliceRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-slice-validation.logic.mjs';
import {
  readRegistrySetManifest,
  resolveRegistryLifecyclePaths,
} from '../src/core/registry-lifecycle/registry-lifecycle-state.logic.mjs';

// The first real registry migration (Tree spec Stage 2 S2.10 RR5, RR6): a Custom set initialized
// while tree/semantic-home-policy shipped at version "1" meets a release whose Builtin is version
// "2". The real inventories, transforms and slice validation are used throughout; only the Builtin
// roots are private copies, so the release can be emulated.
const REGISTRY_ID = 'tree/semantic-home-policy';
const FILE_NAME = 'semantic-home-policy.registry.json';
const V1_FIXTURE = new URL('../tree/test/fixtures/registry-migrations/semantic-home-policy.v1.registry.json', import.meta.url);
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const treeEntry = REGISTRY_LIFECYCLE_SLICES.find((slice) => slice.sliceId === 'tree').inventory.find(
  (entry) => entry.registryId === REGISTRY_ID,
);

const withVersionOneCustomSet = (run) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-tree-shp-'));
  const targetRoot = path.join(fixtureRoot, 'target');
  fs.mkdirSync(targetRoot);
  const slices = REGISTRY_LIFECYCLE_SLICES.map((slice) => {
    const builtinRoot = path.join(fixtureRoot, 'builtin', slice.sliceId);
    fs.cpSync(slice.builtinRoot, builtinRoot, { recursive: true });
    return { ...slice, builtinRoot };
  });
  const builtinFile = path.join(fixtureRoot, 'builtin', 'tree', FILE_NAME);
  const v2Builtin = fs.readFileSync(builtinFile);

  try {
    // The previous release: version "1" Builtin, from which the Custom set and its Baseline are copied.
    fs.copyFileSync(V1_FIXTURE, builtinFile);
    initCustomRegistrySet({ targetRoot, validatorVersion: '0.0.0-v1-release', slices });
    // The current release ships version "2".
    fs.writeFileSync(builtinFile, v2Builtin);

    const paths = resolveRegistryLifecyclePaths({ targetRoot });
    return run({
      targetRoot,
      slices,
      paths,
      v2: JSON.parse(v2Builtin.toString('utf8')),
      customFile: path.join(paths.customRoot, 'tree', FILE_NAME),
      baselineFile: path.join(paths.baselineRoot, 'tree', FILE_NAME),
      registryOf: (output) => output.registries.find((registry) => registry.registryId === REGISTRY_ID),
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

test('a version 1 Custom set stays valid and non-blocking against a version 2 Builtin, and is offered a migration', () => {
  withVersionOneCustomSet(({ targetRoot, slices, paths, customFile, registryOf }) => {
    assert.equal(readJson(customFile).version, '1');
    assert.deepEqual(validateSliceRegistrySet('tree', path.join(paths.customRoot, 'tree')), []);

    const status = buildRegistryLifecycleStatus({ targetRoot, slices });
    assert.deepEqual(status.customIssues, []);
    assert.equal(registryOf(status).classification, 'builtin-changed');

    assert.deepEqual(registryOf(buildRegistryLifecycleDiff({ targetRoot, slices })), {
      registryId: REGISTRY_ID,
      class: 'version-changed',
      detail: { baselineVersion: '1', builtinVersion: '2' },
    });

    const plan = buildRegistryMigrationPlan({ targetRoot, slices });
    assert.deepEqual(plan.registries.map((record) => record.registryId), [REGISTRY_ID]);
    assert.deepEqual(registryOf(plan).path.map((step) => step.transform), ['semantic-home-policy-v1-to-v2']);
  });
});

test('migrating an unmodified version 1 Custom set yields the version 2 Builtin, for the Baseline and the Custom file alike', () => {
  withVersionOneCustomSet(({ targetRoot, slices, paths, v2, customFile, baselineFile, registryOf, migrateAll }) => {
    const v1Digest = digestRegistryPayload(readJson(V1_FIXTURE), treeEntry.migrations[0].fromDescriptor);
    assert.deepEqual(migrateAll(), { applied: [REGISTRY_ID], skipped: [] });

    // The migrated Baseline is checked on its own: it must equal the version 2 Builtin, or later
    // drift reporting would be wrong even with a correct Custom file.
    assert.deepEqual(readJson(baselineFile), v2);
    assert.deepEqual(readJson(customFile), v2);
    const manifestEntry = readRegistrySetManifest(paths).manifest.basedOn.registries[REGISTRY_ID];
    assert.deepEqual(manifestEntry, {
      validatorVersion: '0.0.0-v1-release',
      version: '2',
      digest: digestRegistryPayload(v2, treeEntry.descriptor),
      migration: { fromVersion: '1', fromDigest: v1Digest, path: ['semantic-home-policy-v1-to-v2'] },
    });

    assert.equal(registryOf(buildRegistryLifecycleStatus({ targetRoot, slices })).classification, 'unchanged');
    const diff = registryOf(buildRegistryLifecycleDiff({ targetRoot, slices }));
    assert.notEqual(diff.class, 'version-changed');
    assert.deepEqual(diff.entries ?? [], []);
    assert.deepEqual(validateSliceRegistrySet('tree', path.join(paths.customRoot, 'tree')), []);
  });
});

test('migrating a consumer-edited version 1 Custom set keeps the edit and adds the parameters', () => {
  withVersionOneCustomSet(({ targetRoot, slices, v2, customFile, baselineFile, registryOf, migrateAll }) => {
    const edited = readJson(customFile);
    edited.semanticHomePolicy = edited.semanticHomePolicy.map((lane) =>
      lane.policyId === 'folder-context' ? { ...lane, definition: 'A consumer-owned definition of folder context.' } : lane,
    );
    fs.writeFileSync(customFile, `${JSON.stringify(edited, null, 2)}\n`);

    assert.deepEqual(migrateAll(), { applied: [REGISTRY_ID], skipped: [] });

    // The Baseline advances to the migrated Builtin form, independent of the consumer's edit.
    assert.deepEqual(readJson(baselineFile), v2);
    const migrated = readJson(customFile);
    assert.equal(migrated.version, '2');
    assert.deepEqual(migrated.semanticHomePolicy, edited.semanticHomePolicy);
    assert.deepEqual(migrated.semanticHomeParameters, v2.semanticHomeParameters);

    const diff = registryOf(buildRegistryLifecycleDiff({ targetRoot, slices }));
    assert.deepEqual(
      diff.entries.map((entry) => [entry.class, entry.address]),
      [['custom-only', 'semanticHomePolicy[policyId="folder-context"]']],
    );
  });
});
