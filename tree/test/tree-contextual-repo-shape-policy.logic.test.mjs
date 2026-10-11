import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareContextualTreeRepoShapePolicy } from '../src/tree-contextual-repo-shape-policy.logic.mjs';
import { getBuiltinTreeRepoShapePolicy } from '../src/registries/tree-repo-shape-policy-registry.logic.mjs';

// Refs #14: the effective repo-shape policy is a prepared value derived from the builtin policy and
// the prepared validator development root. The builtin policy is never modified.

const registryPolicyFixture = () => ({
  version: '1',
  allowedTopLevelDirectories: ['doc', 'src', 'test'],
});

test('contextual repo-shape policy adds the explicit embedded root top-level folder', () => {
  const policy = prepareContextualTreeRepoShapePolicy({
    registryPolicy: registryPolicyFixture(),
    validatorDevelopmentRoot: 'calculogic-validator',
  });

  assert.deepEqual(policy, {
    version: '1',
    allowedTopLevelDirectories: ['calculogic-validator', 'doc', 'src', 'test'],
  });
});

test('contextual repo-shape policy uses only the top-level folder of a nested embedded root', () => {
  const policy = prepareContextualTreeRepoShapePolicy({
    registryPolicy: registryPolicyFixture(),
    validatorDevelopmentRoot: 'packages/validator',
  });

  assert.deepEqual(policy.allowedTopLevelDirectories, ['doc', 'packages', 'src', 'test']);
});

test('contextual repo-shape policy adds nothing for standalone, installed-consumer, or unusable roots', () => {
  for (const validatorDevelopmentRoot of ['.', null, undefined, '', '../outside']) {
    const policy = prepareContextualTreeRepoShapePolicy({
      registryPolicy: registryPolicyFixture(),
      validatorDevelopmentRoot,
    });

    assert.deepEqual(
      policy.allowedTopLevelDirectories,
      ['doc', 'src', 'test'],
      `validatorDevelopmentRoot ${String(validatorDevelopmentRoot)}`,
    );
  }
});

test('contextual repo-shape policy does not duplicate an already-allowed folder', () => {
  const policy = prepareContextualTreeRepoShapePolicy({
    registryPolicy: registryPolicyFixture(),
    validatorDevelopmentRoot: 'src',
  });

  assert.deepEqual(policy.allowedTopLevelDirectories, ['doc', 'src', 'test']);
});

test('contextual repo-shape policy returns a new object and never mutates the builtin policy', () => {
  const registryPolicy = registryPolicyFixture();
  const before = structuredClone(registryPolicy);

  const policy = prepareContextualTreeRepoShapePolicy({
    registryPolicy,
    validatorDevelopmentRoot: 'calculogic-validator',
  });

  assert.notEqual(policy, registryPolicy);
  assert.notEqual(policy.allowedTopLevelDirectories, registryPolicy.allowedTopLevelDirectories);
  assert.deepEqual(registryPolicy, before);
});

test('contextual repo-shape policy leaves the cached builtin policy unchanged across runs', () => {
  const cachedBefore = structuredClone(getBuiltinTreeRepoShapePolicy());

  const embedded = prepareContextualTreeRepoShapePolicy({
    registryPolicy: getBuiltinTreeRepoShapePolicy(),
    validatorDevelopmentRoot: 'calculogic-validator',
  });
  const consumer = prepareContextualTreeRepoShapePolicy({
    registryPolicy: getBuiltinTreeRepoShapePolicy(),
    validatorDevelopmentRoot: null,
  });

  assert.equal(embedded.allowedTopLevelDirectories.includes('calculogic-validator'), true);
  assert.equal(consumer.allowedTopLevelDirectories.includes('calculogic-validator'), false);
  assert.deepEqual(getBuiltinTreeRepoShapePolicy(), cachedBefore);
  assert.equal(getBuiltinTreeRepoShapePolicy().allowedTopLevelDirectories.includes('calculogic-validator'), false);
});

test('contextual repo-shape policy rejects a missing or malformed builtin policy', () => {
  for (const registryPolicy of [undefined, null, {}, { allowedTopLevelDirectories: 'src' }]) {
    assert.throws(
      () => prepareContextualTreeRepoShapePolicy({ registryPolicy, validatorDevelopmentRoot: '.' }),
      /requires a registry policy with allowedTopLevelDirectories/u,
    );
  }
  assert.throws(() => prepareContextualTreeRepoShapePolicy(), /requires a registry policy/u);
});
