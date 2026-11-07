import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareStructuralAddressingProfileCompatibility as derive } from '../src/structural-addressing-profile-compatibility.logic.mjs';
import { TREE_CODEBASE_ADDRESSING_PROFILE as PROFILE } from '../src/structural-addressing-profile.knowledge.mjs';

test('production remains explicitly legacy-unqualified without a claimed revision', () => {
  const before = structuredClone(PROFILE);
  assert.deepEqual(derive(PROFILE), {
    addressProfileId: 'tree-structure-advisor-address-profile',
    compatibilityPolicy: { status: 'legacy-unqualified', revision: null },
  });
  assert.deepEqual(PROFILE, before);
});

test('future encoding separates family and revision without changing the active profile', () => {
  const ids = new Set();
  for (const family of ['tree-codebase', 'code-file', 'nl-document']) for (const revision of ['1', '2', '10', '99999999999999999999']) {
    const profile = { profileId: family, compatibilityPolicy: { status: 'versioned', revision } };
    const result = derive(profile);
    assert.equal(result.addressProfileId, `${family}@${revision}`);
    assert.deepEqual(derive(structuredClone(profile)), result);
    ids.add(result.addressProfileId);
  }
  assert.equal(ids.size, 12);
  assert.equal(PROFILE.compatibilityPolicy.status, 'legacy-unqualified');
});

test('invalid families, revisions and unknown or inconsistent statuses never fall back', () => {
  const versioned = { profileId: 'tree-codebase', compatibilityPolicy: { status: 'versioned', revision: '1' } };
  for (const profileId of [undefined, null, 1, {}, '', 'Tree', 'a@1', 'a--b', 'a-', '-a', 'a/b', ' tree']) {
    assert.throws(() => derive({ ...versioned, profileId }), /profile family/u);
  }
  for (const revision of [undefined, null, 1, '', '0', '01', '-1', '+1', '1.0', ' 1', '1 ', '1\n']) {
    assert.throws(() => derive({ ...versioned, compatibilityPolicy: { status: 'versioned', revision } }), /descriptor/u);
  }
  for (const descriptor of [
    { ...versioned, legacyAddressProfileId: 'old' },
    { ...versioned, compatibilityPolicy: { status: 'unknown', revision: '1' } },
    { ...PROFILE, compatibilityPolicy: { status: 'legacy-unqualified', revision: '1' } },
    { ...PROFILE, legacyAddressProfileId: '' },
  ]) assert.throws(() => derive(descriptor), /descriptor/u);
});
