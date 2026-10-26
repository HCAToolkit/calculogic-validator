import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { walkComparisonEntries } from '../../src/core/registry-lifecycle/registry-lifecycle-comparison.logic.mjs';
import { deepFreeze } from '../../src/core/registry-lifecycle/registry-lifecycle-migration.logic.mjs';
import { TREE_REGISTRY_INVENTORY } from '../src/registries/tree-registry-inventory.knowledge.mjs';
import {
  ORIGIN_BY_BASELINE_COMPARISON,
  prepareTreeSemanticHomeParameterSet,
} from '../src/tree-semantic-home-parameter-set.logic.mjs';

// The pure converter (Tree spec S2.9, S2.10 RR4), fed synthetic Baseline comparison results.
const readJson = (url) => JSON.parse(fs.readFileSync(url, 'utf8'));
const V2 = readJson(new URL('../src/registries/_builtin/semantic-home-policy.registry.json', import.meta.url));
const V1 = readJson(new URL('./fixtures/registry-migrations/semantic-home-policy.v1.registry.json', import.meta.url));
const ENTRY = TREE_REGISTRY_INVENTORY.find((entry) => entry.registryId === 'tree/semantic-home-policy');
const REGISTRY = { registryId: 'tree/semantic-home-policy', version: '2', source: 'custom', digest: 'a'.repeat(64) };
const NAMES = ['P_COVERAGE', 'P_MIN_SUPPORT', 'P_NOT_ELIGIBLE_SHARE', 'P_ELIGIBLE_SHARE'];

// A comparison over the payload's real addresses, each state chosen by address, in the given order.
const comparisonOf = (payload, stateOf = () => ({ baselineComparison: 'matches' }), order = (entries) => entries) => ({
  registryId: REGISTRY.registryId,
  source: REGISTRY.source,
  entries: order(walkComparisonEntries(payload, ENTRY).map(({ address }) => ({ address, ...stateOf(address) }))),
});
const parameterState = (states) => (address) => {
  const match = /parameterId="([^"]+)"/u.exec(address);
  return match && states[match[1]] ? states[match[1]] : { baselineComparison: 'matches' };
};

test('parameters are keyed by S2.5 name and found by identity, whatever the comparison order', () => {
  const states = parameterState({
    coverage: { baselineComparison: 'differs' },
    'eligible-share': { baselineComparison: 'absent' },
  });
  const forward = prepareTreeSemanticHomeParameterSet({ payload: V2, registry: REGISTRY, comparison: comparisonOf(V2, states) });
  const reversed = prepareTreeSemanticHomeParameterSet({
    payload: V2,
    registry: REGISTRY,
    comparison: comparisonOf(V2, states, (entries) => [...entries].reverse()),
  });

  assert.deepEqual(reversed, forward);
  assert.deepEqual(Object.keys(forward.parameters), NAMES);
  assert.equal(forward.parameters.P_COVERAGE.parameterId, 'coverage');
  assert.equal(forward.parameters.P_COVERAGE.baselineComparison, 'differs');
  assert.equal(forward.parameters.P_ELIGIBLE_SHARE.baselineComparison, 'absent');
  assert.equal(forward.parameters.P_MIN_SUPPORT.baselineComparison, 'matches');
  assert.equal(forward.parameters.P_COVERAGE.value, 0.5);
  assert.deepEqual(forward.parameters.P_MIN_SUPPORT.catalogueCases, ['C17', 'C20']);
});

test('each Baseline comparison state gives its RR4 origin; differs and absent stay apart under override', () => {
  assert.deepEqual(ORIGIN_BY_BASELINE_COMPARISON, {
    'not-applicable': 'builtin',
    matches: 'baseline',
    differs: 'override',
    absent: 'override',
    unverifiable: 'unverified',
  });
  for (const [baselineComparison, origin] of Object.entries(ORIGIN_BY_BASELINE_COMPARISON)) {
    const reason = baselineComparison === 'unverifiable' ? { reason: 'baseline-mismatch' } : {};
    const set = prepareTreeSemanticHomeParameterSet({
      payload: V2,
      registry: REGISTRY,
      comparison: comparisonOf(V2, () => ({ baselineComparison, ...reason })),
    });
    for (const name of NAMES) {
      assert.equal(set.parameters[name].origin, origin, `${baselineComparison} → ${name}`);
      assert.equal(set.parameters[name].baselineComparison, baselineComparison);
    }
  }
});

test('unverifiable keeps the lifecycle reason; no other state carries one', () => {
  for (const reason of ['baseline-mismatch', 'baseline-version-undescribed', 'baseline-not-comparable']) {
    const set = prepareTreeSemanticHomeParameterSet({
      payload: V2,
      registry: REGISTRY,
      comparison: comparisonOf(V2, () => ({ baselineComparison: 'unverifiable', reason })),
    });
    for (const name of NAMES) {
      assert.equal(set.parameters[name].origin, 'unverified');
      assert.equal(set.parameters[name].baselineComparisonReason, reason);
    }
  }

  const verified = prepareTreeSemanticHomeParameterSet({ payload: V2, registry: REGISTRY, comparison: comparisonOf(V2) });
  for (const name of NAMES) {
    assert.deepEqual(Object.keys(verified.parameters[name]).sort(), [
      'baselineComparison',
      'catalogueCases',
      'origin',
      'parameterId',
      'value',
    ]);
  }
});

test('a version 1 payload is configuration-unavailable, with no parameters and no Builtin values', () => {
  const set = prepareTreeSemanticHomeParameterSet({
    payload: V1,
    registry: { ...REGISTRY, version: '1' },
    comparison: comparisonOf(V1),
  });
  assert.deepEqual(set, {
    registry: { ...REGISTRY, version: '1' },
    availability: 'configuration-unavailable',
    reason: 'parameter-set-absent',
    conformance: 'not-checked',
  });
});

test('conformance is not-checked for every source, and the set is deeply frozen from a frozen input', () => {
  for (const source of ['builtin', 'custom', 'candidate']) {
    const set = prepareTreeSemanticHomeParameterSet({
      payload: deepFreeze(structuredClone(V2)),
      registry: { ...REGISTRY, source },
      comparison: deepFreeze(comparisonOf(V2)),
    });
    assert.equal(set.conformance, 'not-checked');
    assert.equal(set.registry.source, source);
    assert.ok(Object.isFrozen(set) && Object.isFrozen(set.registry) && Object.isFrozen(set.parameters));
    for (const name of NAMES) {
      assert.ok(Object.isFrozen(set.parameters[name]) && Object.isFrozen(set.parameters[name].catalogueCases));
    }
  }
});

test('a parameter missing from the comparison, or an unknown state, is an error, never a default', () => {
  const missing = comparisonOf(V2);
  missing.entries = missing.entries.filter((entry) => !entry.address.includes('"coverage"'));
  assert.throws(
    () => prepareTreeSemanticHomeParameterSet({ payload: V2, registry: REGISTRY, comparison: missing }),
    /Parameter coverage .* is missing/u,
  );
  assert.throws(
    () => prepareTreeSemanticHomeParameterSet({
      payload: V2,
      registry: REGISTRY,
      comparison: comparisonOf(V2, () => ({ baselineComparison: 'unknown' })),
    }),
    /Unknown Baseline comparison state/u,
  );
});
