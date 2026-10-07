import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  toValidatorDevelopmentPathPrefix,
  toValidatorDevelopmentRootTopLevelFolder,
} from '../src/tree-validator-development-root.logic.mjs';

// Refs #14, #34: one derivation of Validator-development paths from the prepared root.

test('validator development path prefix is empty for standalone and root-prefixed for embedded', () => {
  assert.equal(toValidatorDevelopmentPathPrefix('.'), '');
  assert.equal(toValidatorDevelopmentPathPrefix('calculogic-validator'), 'calculogic-validator/');
});

test('validator development path prefix is null without a validator development root', () => {
  for (const validatorDevelopmentRoot of [null, undefined, '', 42]) {
    assert.equal(toValidatorDevelopmentPathPrefix(validatorDevelopmentRoot), null, String(validatorDevelopmentRoot));
  }
});

test('validator development root top-level folder exists only for an embedded root inside the repository', () => {
  assert.equal(toValidatorDevelopmentRootTopLevelFolder('calculogic-validator'), 'calculogic-validator');
  assert.equal(toValidatorDevelopmentRootTopLevelFolder('packages/validator'), 'packages');
  for (const validatorDevelopmentRoot of ['.', null, undefined, '', '../outside']) {
    assert.equal(
      toValidatorDevelopmentRootTopLevelFolder(validatorDevelopmentRoot),
      null,
      String(validatorDevelopmentRoot),
    );
  }
});
