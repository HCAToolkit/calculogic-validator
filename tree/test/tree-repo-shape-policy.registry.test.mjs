import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const TREE_REPO_SHAPE_POLICY_REGISTRY_PATH = new URL(
  '../src/registries/_builtin/repo-shape-policy.registry.json',
  import.meta.url,
);

// Generic structural peers only. Repository-specific folders come from context
// (tree-contextual-repo-shape-policy.logic.mjs): `calculogic-validator` through explicit embedded
// development context, and declared local packages such as `calculogic-doc-engine` through
// local-package evidence (#37).
const EXPECTED_ALLOWED_TOP_LEVEL_DIRECTORIES = [
  'bin',
  'doc',
  'docs',
  'public',
  'scripts',
  'src',
  'test',
  'tools',
];

test('tree repo-shape policy preserves bounded top-level directory allow policy', () => {
  const payload = JSON.parse(fs.readFileSync(TREE_REPO_SHAPE_POLICY_REGISTRY_PATH, 'utf8'));

  assert.equal(payload.version, '1');
  assert.deepEqual(payload.allowedTopLevelDirectories, EXPECTED_ALLOWED_TOP_LEVEL_DIRECTORIES);
  assert.equal(payload.allowedTopLevelDirectories.includes('data'), false);
  assert.equal(payload.allowedTopLevelDirectories.includes('vendor'), false);
  assert.equal(payload.allowedTopLevelDirectories.includes('assets'), false);
  assert.equal(payload.allowedTopLevelDirectories.includes('ops'), false);
  assert.equal(payload.allowedTopLevelDirectories.includes('calculogic-validator'), false);
  assert.equal(payload.allowedTopLevelDirectories.includes('calculogic-doc-engine'), false);
});
