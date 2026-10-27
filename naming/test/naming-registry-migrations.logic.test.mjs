import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { NAMING_REGISTRY_MIGRATION_TRANSFORMS } from '../src/registries/naming-registry-migrations.logic.mjs';
import { NAMING_REGISTRY_INVENTORY } from '../src/registries/naming-registry-inventory.knowledge.mjs';
import { validateNamingRegistrySet } from '../src/registries/registry-state.logic.mjs';
import {
  assertMigrationDeclaration,
  deepFreeze,
  runMigrationPath,
} from '../../src/core/registry-lifecycle/registry-lifecycle-migration.logic.mjs';
import { digestRegistryPayload } from '../../src/core/registry-lifecycle/registry-lifecycle-canonical-digest.logic.mjs';

const readJson = (url) => JSON.parse(fs.readFileSync(url, 'utf8'));
// The exact version "1" registry as it shipped (main at a0fbc8a), and the version "2" Builtin.
const V1_URL = new URL('./fixtures/registry-migrations/walk-exclusions.v1.registry.json', import.meta.url);
const BUILTIN_ROOT_URL = new URL('../src/registries/_builtin/', import.meta.url);
const V2_BUILTIN_URL = new URL('walk-exclusions.registry.json', BUILTIN_ROOT_URL);
const TRANSFORM_ID = 'walk-exclusions-v1-to-v2';
const entry = NAMING_REGISTRY_INVENTORY.find((candidate) => candidate.registryId === 'naming/walk-exclusions');

// Naming slice validation over a copy of the Builtin root whose walk-exclusions file is `payload`.
const failuresWithWalkExclusions = (payload) => {
  const registryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'naming-walk-exclusions-'));
  try {
    fs.cpSync(BUILTIN_ROOT_URL, registryRoot, { recursive: true });
    fs.writeFileSync(path.join(registryRoot, 'walk-exclusions.registry.json'), JSON.stringify(payload));
    return validateNamingRegistrySet(registryRoot);
  } finally {
    fs.rmSync(registryRoot, { recursive: true, force: true });
  }
};

test('migrating the unmodified version 1 registry produces exactly the version 2 Builtin', () => {
  const migrated = NAMING_REGISTRY_MIGRATION_TRANSFORMS[TRANSFORM_ID](deepFreeze(readJson(V1_URL)));
  assert.deepEqual(migrated, readJson(V2_BUILTIN_URL));
  assert.deepEqual(failuresWithWalkExclusions(migrated), []);
});

test('the transform keeps edits to the walk policy, drops allowDotFiles, and never mutates its input', () => {
  const edited = {
    ...readJson(V1_URL),
    excludedDirectories: ['vendor', '.git'],
    skipDotDirectories: false,
    allowDotFiles: ['.npmrc', '.editorconfig'],
  };
  const frozen = deepFreeze(structuredClone(edited));
  const migrated = NAMING_REGISTRY_MIGRATION_TRANSFORMS[TRANSFORM_ID](frozen);
  assert.deepEqual(migrated, { version: '2', excludedDirectories: ['vendor', '.git'], skipDotDirectories: false });
  assert.deepEqual(frozen, edited);
  assert.deepEqual(NAMING_REGISTRY_MIGRATION_TRANSFORMS[TRANSFORM_ID](frozen), migrated, 'deterministic');
});

test('the inventory declares the one step, version "2" is the only readable version, and the lifecycle runs the declared path', () => {
  assert.doesNotThrow(() => assertMigrationDeclaration(entry, NAMING_REGISTRY_MIGRATION_TRANSFORMS));
  assert.deepEqual(entry.readableVersions, ['2']);
  assert.deepEqual(entry.migrations.map((step) => [step.from, step.to, step.transform]), [['1', '2', TRANSFORM_ID]]);
  assert.deepEqual(Object.keys(NAMING_REGISTRY_MIGRATION_TRANSFORMS), [TRANSFORM_ID]);
  assert.deepEqual(runMigrationPath(entry.migrations, NAMING_REGISTRY_MIGRATION_TRANSFORMS, readJson(V1_URL)), {
    payload: readJson(V2_BUILTIN_URL),
  });
  // Every other Naming registry still reads version "1" only.
  for (const other of NAMING_REGISTRY_INVENTORY.filter((candidate) => candidate !== entry)) {
    assert.deepEqual(other.readableVersions, ['1'], other.registryId);
    assert.deepEqual(other.migrations, [], other.registryId);
  }
});

test('the step describes version 1 payloads as the release that wrote them did', () => {
  // A version 1 Baseline copy carries the digest that release recorded, so the step's `fromDescriptor`
  // must canonicalize as its descriptor did (main at a0fbc8a): both arrays set-like.
  const { fromDescriptor } = entry.migrations[0];
  assert.equal(
    digestRegistryPayload(readJson(V1_URL), fromDescriptor),
    '94f9f3caf8541dffdfe4636ce38473c09928ac17f0229600e8acbc959703de85',
  );
  const v1 = readJson(V1_URL);
  assert.equal(
    digestRegistryPayload({ ...v1, allowDotFiles: ['.npmrc', '.eslintrc'] }, fromDescriptor),
    digestRegistryPayload({ ...v1, allowDotFiles: ['.eslintrc', '.npmrc', '.npmrc'] }, fromDescriptor),
  );
});

test('slice validation rejects a version 2 payload carrying the retired field, and leaves version 1 to the version check', () => {
  const v2 = readJson(V2_BUILTIN_URL);
  const [failure, ...rest] = failuresWithWalkExclusions({ ...v2, allowDotFiles: ['.eslintrc'] });
  assert.deepEqual(rest, []);
  assert.equal(failure.registryId, 'naming/walk-exclusions');
  assert.match(failure.detail, /unsupported field\(s\) allowDotFiles/u);
  assert.match(failuresWithWalkExclusions({ ...v2, allowDotFiles: [] })[0].detail, /allowDotFiles/u);

  // A version the root fields do not list skips the root check; its shape is still loaded.
  assert.deepEqual(failuresWithWalkExclusions(readJson(V1_URL)), []);
  assert.match(
    failuresWithWalkExclusions({ ...readJson(V1_URL), excludedDirectories: ['a/b'] })[0].detail,
    /bare directory name/u,
  );
});
