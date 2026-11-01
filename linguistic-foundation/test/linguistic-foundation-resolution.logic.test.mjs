// Resolution and comparison (cfg-linguisticFoundation 5.2.3, 5.2.5, 5.2.6; contract §4.3, §6, §7;
// calculogic-validator#148). The runtime is checked against the `english` profile and, for conformance,
// against the contract's test-only reference model over the contract's sample profile.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compareLexicalResolutions, resolveSurfaceForm } from '../src/linguistic-foundation-resolution.logic.mjs';
import { toLanguageProfileRuntime } from '../src/linguistic-foundation-runtime-converters.logic.mjs';
import {
  digestLanguageProfileRegistry,
  getBuiltinLanguageProfileRegistries,
  normalizeLanguageProfileRegistryPayload,
} from '../src/registries/linguistic-foundation-language-profile-registry.logic.mjs';
import { SAMPLE_PROFILE } from '../../test/fixtures/linguistic-foundation/linguistic-foundation-contract-cases.fixture.mjs';
import { compare as referenceCompare, resolve as referenceResolve } from '../../test/fixtures/linguistic-foundation/linguistic-foundation-reference-model.fixture.mjs';

const english = toLanguageProfileRuntime(getBuiltinLanguageProfileRegistries()[0]);
const runtimeOf = (payload) => {
  const normalized = normalizeLanguageProfileRegistryPayload(payload);
  return toLanguageProfileRuntime({ payload: normalized, lexiconDigest: digestLanguageProfileRegistry(normalized) });
};
const r = (surface, profile = english) => resolveSurfaceForm(profile, surface);

test('english v1 relates the E10 and E11 folder labels to their member tokens', () => {
  assert.equal(compareLexicalResolutions(r('rules'), r('rule')), 'same-lexeme');
  assert.equal(compareLexicalResolutions(r('registries'), r('registry')), 'same-lexeme');
  assert.equal(compareLexicalResolutions(r('rule'), r('registry')), 'different-lexemes');
  assert.deepEqual(r('rules').readings, [{ lexemeId: 'english.rule', features: { number: 'plural' }, basis: 'lexicon-entry' }]);
  assert.deepEqual(r('registry').provenance, { profileId: 'english', profileVersion: '1', lexiconDigest: getBuiltinLanguageProfileRegistries()[0].lexiconDigest });
});

test('english v1 derives nothing: undeclared, case-varied and strip-trap forms are unknown and undetermined', () => {
  for (const surface of ['status', 'address', 'cross', 'readiness', 'policies', 'Rules', 'RULE', 'rule-s', 'rulez', 'registrys', 'rules.', 'statu']) {
    const resolution = r(surface);
    assert.equal(resolution.status, 'unknown', surface);
    assert.deepEqual(resolution.readings, []);
    assert.equal(compareLexicalResolutions(resolution, r('rule')), 'undetermined', `${surface}: unknown is never evidence`);
  }
});

test('without an active profile every resolution is profile-unavailable, with no provenance', () => {
  for (const profile of [null, undefined]) {
    assert.deepEqual(resolveSurfaceForm(profile, 'rule'), { surface: 'rule', status: 'profile-unavailable', readings: [] });
  }
  assert.equal(compareLexicalResolutions(resolveSurfaceForm(null, 'rule'), r('rule')), 'undetermined');
});

test('a surface form that is not a non-empty string is a caller error', () => {
  for (const surface of ['', undefined, null, 1, ['rule']]) assert.throws(() => resolveSurfaceForm(english, surface), TypeError);
});

test('records are frozen and do not expose the runtime lookup to mutation', () => {
  const resolution = r('rules');
  assert.ok(Object.isFrozen(resolution) && Object.isFrozen(resolution.readings) && Object.isFrozen(resolution.readings[0].features) && Object.isFrozen(resolution.provenance));
  assert.ok(Object.isFrozen(english));
  assert.throws(() => resolution.readings.push({}), TypeError);
});

test('regression (PR #149 review): no caller can change a resolution through the public runtime profile', () => {
  const before = JSON.stringify(['rules', 'rule', 'status'].map((surface) => r(surface)));
  // No lookup is exposed: the runtime has no Map-valued property, and its accessors cannot be replaced.
  assert.equal(Object.values(english).some((value) => value instanceof Map || value instanceof Set), false);
  assert.deepEqual(Object.keys(english).sort(), ['lexiconDigest', 'profileId', 'profileVersion', 'readingsOf', 'surfaces']);
  assert.throws(() => { english.readingsOf = () => []; }, TypeError);
  assert.throws(() => { english.lexiconDigest = 'x'; }, TypeError);
  // What the accessors return is frozen, the shared empty result included.
  for (const surface of ['rules', 'status']) {
    const readings = english.readingsOf(surface);
    assert.throws(() => readings.push({ lexemeId: 'english.status', features: {}, basis: 'lexicon-entry' }), TypeError, surface);
    assert.throws(() => { readings.length = 0; }, TypeError, surface);
  }
  assert.throws(() => english.readingsOf('rules')[0].features.number = 'singular', TypeError);
  assert.throws(() => english.surfaces().push('status'), TypeError);
  assert.equal(JSON.stringify(['rules', 'rule', 'status'].map((surface) => r(surface))), before, 'every resolution is unchanged');
});

test('resolution and digest are independent of entry and form order', () => {
  const sample = { version: '1', ...SAMPLE_PROFILE };
  const reversed = { ...sample, entries: [...sample.entries].reverse().map((entry) => ({ ...entry, forms: [...entry.forms].reverse() })) };
  const [forward, backward] = [runtimeOf(sample), runtimeOf(reversed)];
  assert.equal(forward.lexiconDigest, backward.lexiconDigest);
  for (const surface of forward.surfaces()) assert.deepEqual(resolveSurfaceForm(backward, surface), resolveSurfaceForm(forward, surface), surface);
});

test('conformance: the runtime gives the reference model\'s statuses, readings and relations over the contract sample profile', () => {
  const runtime = runtimeOf({ version: '1', ...SAMPLE_PROFILE });
  const surfaces = [...new Set([...SAMPLE_PROFILE.entries.flatMap((entry) => entry.forms.map((form) => form.surface)), 'cross', 'readiness', 'statu'])].sort();
  for (const surface of surfaces) {
    const actual = resolveSurfaceForm(runtime, surface);
    const expected = referenceResolve(SAMPLE_PROFILE, surface);
    assert.equal(actual.status, expected.status, surface);
    assert.deepEqual(actual.readings, expected.readings, surface);
  }
  for (const left of surfaces) {
    for (const right of surfaces) {
      assert.equal(
        compareLexicalResolutions(resolveSurfaceForm(runtime, left), resolveSurfaceForm(runtime, right)),
        referenceCompare(referenceResolve(SAMPLE_PROFILE, left), referenceResolve(SAMPLE_PROFILE, right)),
        `${left} / ${right}`,
      );
    }
  }
});

test('different profiles or profile versions are never compared', () => {
  const sample = runtimeOf({ version: '1', ...SAMPLE_PROFILE });
  const nextVersion = runtimeOf({ version: '1', ...SAMPLE_PROFILE, profileVersion: '1' });
  assert.equal(compareLexicalResolutions(resolveSurfaceForm(sample, 'rule'), resolveSurfaceForm(nextVersion, 'rule')), 'undetermined');
  assert.equal(compareLexicalResolutions(resolveSurfaceForm(sample, 'rule'), r('rule')), 'undetermined');
});
