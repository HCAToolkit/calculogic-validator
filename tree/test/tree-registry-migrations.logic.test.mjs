import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { TREE_REGISTRY_MIGRATION_TRANSFORMS } from '../src/registries/tree-registry-migrations.logic.mjs';
import { TREE_REGISTRY_INVENTORY } from '../src/registries/tree-registry-inventory.knowledge.mjs';
import { assertValidSemanticHomePolicyRegistry } from '../src/registries/tree-semantic-home-policy-registry.logic.mjs';
import {
  assertMigrationDeclaration,
  deepFreeze,
  runMigrationPath,
} from '../../src/core/registry-lifecycle/registry-lifecycle-migration.logic.mjs';

const readJson = (url) => JSON.parse(fs.readFileSync(url, 'utf8'));
// The exact version "1" registry as it shipped (main at a065393), and the version "2" Builtin.
const V1_URL = new URL('./fixtures/registry-migrations/semantic-home-policy.v1.registry.json', import.meta.url);
const V2_BUILTIN_URL = new URL('../src/registries/_builtin/semantic-home-policy.registry.json', import.meta.url);
const TRANSFORM_ID = 'semantic-home-policy-v1-to-v2';
const entry = TREE_REGISTRY_INVENTORY.find((candidate) => candidate.registryId === 'tree/semantic-home-policy');

test('migrating the unmodified version 1 registry produces exactly the version 2 Builtin records (RR6)', () => {
  const migrated = TREE_REGISTRY_MIGRATION_TRANSFORMS[TRANSFORM_ID](deepFreeze(readJson(V1_URL)));
  assert.deepEqual(migrated, readJson(V2_BUILTIN_URL));
  assert.doesNotThrow(() => assertValidSemanticHomePolicyRegistry(migrated));
});

test('the transform keeps edited lanes and never mutates its input', () => {
  const edited = readJson(V1_URL);
  edited.semanticHomePolicy[0] = { ...edited.semanticHomePolicy[0], definition: 'A consumer-edited definition.' };
  const frozen = deepFreeze(structuredClone(edited));
  const migrated = TREE_REGISTRY_MIGRATION_TRANSFORMS[TRANSFORM_ID](frozen);
  assert.deepEqual(migrated.semanticHomePolicy, edited.semanticHomePolicy);
  assert.deepEqual(migrated.semanticHomeParameters, readJson(V2_BUILTIN_URL).semanticHomeParameters);
  assert.deepEqual(frozen, edited);
});

test('the inventory declares the one step, and the lifecycle runs it through the declared path', () => {
  assert.doesNotThrow(() => assertMigrationDeclaration(entry, TREE_REGISTRY_MIGRATION_TRANSFORMS));
  assert.deepEqual(entry.readableVersions, ['1', '2']);
  assert.deepEqual(Object.keys(TREE_REGISTRY_MIGRATION_TRANSFORMS), [TRANSFORM_ID]);
  assert.deepEqual(runMigrationPath(entry.migrations, TREE_REGISTRY_MIGRATION_TRANSFORMS, readJson(V1_URL)), {
    payload: readJson(V2_BUILTIN_URL),
  });
});

test('the parameter section is atomic: it declares no reconciliation', () => {
  assert.deepEqual(
    entry.reconciliation.map((declaration) => declaration.path),
    ['semanticHomePolicy'],
  );
  assert.ok(entry.comparison.some((collection) => collection.path === 'semanticHomeParameters' && collection.key === 'parameterId'));
});
