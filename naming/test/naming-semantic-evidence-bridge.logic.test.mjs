import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareNamingSemanticEvidenceBridge } from '../src/naming-semantic-evidence-bridge.logic.mjs';

test('prepareNamingSemanticEvidenceBridge returns deterministic evidence-only observations with stable ordering', () => {
  const input = {
    observations: [
      {
        path: 'src/z/order-payment.logic.ts',
        semanticName: 'order-payment',
        semanticFamily: 'order-payment',
        familyRoot: 'order',
        familySubgroup: 'payment',
        ambiguityFlags: ['family-boundary-heuristic', 'family-boundary-heuristic'],
      },
      {
        path: 'src/a/build-surface.logic.ts',
        semanticName: 'build-surface',
        semanticFamily: 'build-surface',
        familyRoot: 'build',
        splitFamilyFlags: ['family-root-observed-multiple-families'],
      },
    ],
  };

  const before = structuredClone(input);
  const result = prepareNamingSemanticEvidenceBridge(input);

  assert.deepEqual(input, before);
  assert.deepEqual(result, {
    observations: [
      {
        path: 'src/a/build-surface.logic.ts',
        semanticName: 'build-surface',
        semanticFamily: 'build-surface',
        familyRoot: 'build',
        semanticNameSource: 'naming-canonical-finding',
        semanticFamilySource: 'naming-family-derivation',
        evidenceSource: 'namingSemanticFamilyBridge',
        splitFamilyFlags: ['family-root-observed-multiple-families'],
      },
      {
        path: 'src/z/order-payment.logic.ts',
        semanticName: 'order-payment',
        semanticFamily: 'order-payment',
        familyRoot: 'order',
        familySubgroup: 'payment',
        semanticNameSource: 'naming-canonical-finding',
        semanticFamilySource: 'naming-family-derivation',
        evidenceSource: 'namingSemanticFamilyBridge',
        ambiguityFlags: ['family-boundary-heuristic'],
      },
    ],
  });

  for (const observation of result.observations) {
    assert.equal('findingCode' in observation, false);
    assert.equal('severity' in observation, false);
    assert.equal('verdict' in observation, false);
    assert.equal('placementVerdict' in observation, false);
    assert.equal('addressPath' in observation, false);
    assert.equal('parentAddressPath' in observation, false);
    assert.equal('isKnownTopRoot' in observation, false);
    assert.equal('structuralClass' in observation, false);
  }
});

// #82: the prepared view keeps Naming's two ambiguity facts separately and carries no strength, so
// preparing it again (as any re-wrapping path does) cannot turn ambiguous evidence into clean evidence.
test('prepareNamingSemanticEvidenceBridge keeps ambiguity facts separately, authors no strength, and is idempotent', () => {
  const input = {
    observations: [
      { path: 'a/ambiguous.logic.mjs', semanticName: 'a-b-c-d', semanticFamily: 'a-b', familyRoot: 'a', ambiguityFlags: ['family-boundary-heuristic'] },
      { path: 'a/split.logic.mjs', semanticName: 'a-x', semanticFamily: 'a-x', familyRoot: 'a', splitFamilyFlags: ['family-root-observed-multiple-families'] },
      {
        path: 'a/both.logic.mjs',
        semanticName: 'a-y-z-w',
        semanticFamily: 'a-y',
        familyRoot: 'a',
        ambiguityFlags: ['family-boundary-heuristic'],
        splitFamilyFlags: ['family-root-observed-multiple-families'],
      },
      { path: 'a/clean.logic.mjs', semanticName: 'clean', semanticFamily: 'clean', familyRoot: 'clean' },
    ],
  };

  const once = prepareNamingSemanticEvidenceBridge(input);
  const byPath = new Map(once.observations.map((observation) => [observation.path, observation]));
  assert.deepEqual(byPath.get('a/ambiguous.logic.mjs').ambiguityFlags, ['family-boundary-heuristic']);
  assert.equal('splitFamilyFlags' in byPath.get('a/ambiguous.logic.mjs'), false);
  assert.deepEqual(byPath.get('a/split.logic.mjs').splitFamilyFlags, ['family-root-observed-multiple-families']);
  assert.equal('ambiguityFlags' in byPath.get('a/split.logic.mjs'), false);
  assert.deepEqual(byPath.get('a/both.logic.mjs').ambiguityFlags, ['family-boundary-heuristic']);
  assert.deepEqual(byPath.get('a/both.logic.mjs').splitFamilyFlags, ['family-root-observed-multiple-families']);
  assert.equal('ambiguityFlags' in byPath.get('a/clean.logic.mjs'), false);
  for (const observation of once.observations) {
    for (const derivedField of ['evidenceStrength', 'ambiguityStatus', 'splitMarkers']) {
      assert.equal(derivedField in observation, false, derivedField);
    }
  }

  assert.deepEqual(prepareNamingSemanticEvidenceBridge(once), once);
  assert.deepEqual(prepareNamingSemanticEvidenceBridge(prepareNamingSemanticEvidenceBridge(once)), once);
});

test('prepareNamingSemanticEvidenceBridge returns empty observations for empty payload', () => {
  assert.deepEqual(prepareNamingSemanticEvidenceBridge({}), { observations: [] });
});

test('prepareNamingSemanticEvidenceBridge deterministically rejects non-object payload', () => {
  assert.throws(
    () => prepareNamingSemanticEvidenceBridge([]),
    /requires an object payload/u,
  );
});

test('non-string selected paths are omitted for singletons and either two-observation order', () => {
  const good = { path: 'src/good.logic.mjs', semanticName: 'good', semanticFamily: 'good', familyRoot: 'good' };
  const expected = prepareNamingSemanticEvidenceBridge({ observations: [good] });
  for (const value of [1, 0, NaN, true, false, {}, [], new String('source')]) {
    const bad = { ...good, path: 'src/bad.logic.mjs', repoRelativePath: value };
    for (const observations of [[bad], [good, bad], [bad, good]]) {
      const input = { observations }; const before = structuredClone(input);
      const result = prepareNamingSemanticEvidenceBridge(input);
      assert.deepEqual(result, observations.length === 1 ? { observations: [] } : expected);
      assert.deepEqual(input, before);
      assert.deepEqual(prepareNamingSemanticEvidenceBridge(result), result);
    }
  }
});

test('legacy string selection, nullish fallback and original path validation are preserved', () => {
  const source = { path: 'src/original.logic.mjs', semanticName: 'original', semanticFamily: 'original', familyRoot: 'original' };
  for (const value of [undefined, null, '', '../escape', 'different/path', 'src/selected.logic.mjs']) {
    const input = { observations: [{ ...source, repoRelativePath: value }] }; const before = structuredClone(input);
    const result = prepareNamingSemanticEvidenceBridge(input);
    assert.equal(result.observations.length, 1);
    assert.equal(result.observations[0].path, value ?? source.path);
    assert.deepEqual(input, before);
    // Empty-string legacy output is intentionally preserved; its original path guard still applies on re-entry.
    if (value !== '') assert.deepEqual(prepareNamingSemanticEvidenceBridge(result), result);
  }
  for (const value of [undefined, null, '', 1]) {
    assert.deepEqual(prepareNamingSemanticEvidenceBridge({ observations: [{ ...source, path: value, repoRelativePath: 'valid/source' }] }), { observations: [] });
  }
  const input = { observations: ['z', 'a'].map((name) => ({ ...source, path: `src/${name}.logic.mjs`, repoRelativePath: `selected/${name}` })) };
  const before = structuredClone(input); const result = prepareNamingSemanticEvidenceBridge(input);
  assert.deepEqual(result.observations.map(({ path }) => path), ['selected/a', 'selected/z']);
  assert.deepEqual(prepareNamingSemanticEvidenceBridge({ observations: [...input.observations].reverse() }), result);
  assert.deepEqual(prepareNamingSemanticEvidenceBridge(result), result);
  assert.deepEqual(input, before);
});
