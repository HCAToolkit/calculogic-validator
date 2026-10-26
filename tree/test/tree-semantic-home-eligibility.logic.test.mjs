import test from 'node:test';
import assert from 'node:assert/strict';
import { combineReadings, decideCandidate, decideEligibility } from '../src/tree-semantic-home-eligibility.logic.mjs';

const BUILTIN = { P_COVERAGE: 0.5, P_MIN_SUPPORT: 2, P_NOT_ELIGIBLE_SHARE: 0.25, P_ELIGIBLE_SHARE: 0.75 };
const counts = (support, contradiction, missing) => ({ decisionMemberCount: support + contradiction + missing, support, contradiction });
const decide = (support, contradiction, missing, parameters = BUILTIN) => {
  const { outcome, reason } = decideEligibility(counts(support, contradiction, missing), parameters);
  return `${outcome}:${reason}`;
};

test('S2.5: the six steps in order, with inclusive bars', () => {
  assert.equal(decide(0, 0, 0), 'undetermined:no-active-members');
  assert.equal(decide(2, 0, 3), 'undetermined:insufficient-evaluated-coverage'); // 0.40
  assert.equal(decide(0, 2, 2), 'not-eligible:contradicted'); // coverage exactly 0.50
  assert.equal(decide(1, 3, 0), 'not-eligible:contradicted'); // share exactly 0.25
  assert.equal(decide(3, 1, 0), 'eligible:supported'); // share exactly 0.75
  assert.equal(decide(1, 0, 0), 'undetermined:insufficient-support');
  assert.equal(decide(2, 0, 0), 'eligible:supported'); // minimum support exactly 2
  assert.equal(decide(2, 2, 0), 'undetermined:mixed-evidence');
  // Missing evidence only lowers coverage; it is never contradiction.
  assert.equal(decide(3, 0, 3), 'eligible:supported');
  assert.equal(decide(3, 0, 4), 'undetermined:insufficient-evaluated-coverage');
});

test('S2.3 E2: the five rows of the truth table', () => {
  const r = (outcome, reason = 'r') => ({ outcome, reason });
  assert.deepEqual(combineReadings({ prefix: r('eligible', 'supported'), root: r('not-eligible') }), { outcome: 'eligible', reason: 'supported' });
  assert.deepEqual(combineReadings({ prefix: r('undetermined', 'mixed-evidence'), root: r('eligible') }), { outcome: 'undetermined', reason: 'mixed-evidence' });
  assert.deepEqual(combineReadings({ prefix: r('not-eligible'), root: r('eligible') }), { outcome: 'undetermined', reason: 'claim-unresolved' });
  assert.deepEqual(combineReadings({ prefix: r('not-eligible'), root: r('undetermined') }), { outcome: 'undetermined', reason: 'claim-unresolved' });
  assert.deepEqual(combineReadings({ prefix: r('not-eligible'), root: r('not-eligible') }), { outcome: 'not-eligible', reason: 'contradicted' });
});

// Members as [root kind, prefix kind]: S support, C contradiction, M missing. Prefix evaluated
// implies root evaluated (S1.5), so a member missing on root is missing on prefix too.
const PAIRS = [['S', 'S'], ['S', 'C'], ['C', 'S'], ['C', 'C'], ['S', 'M'], ['C', 'M'], ['M', 'M']];
const KIND = { S: 'support', C: 'contradiction', M: 'missing' };
const tally = (members, index) => {
  const out = { support: 0, contradiction: 0, missing: 0 };
  for (const member of members) out[KIND[member[index]]] += 1;
  return out;
};
const readingsOf = (fixed, open, multiToken) => {
  const reading = (index) => ({ definite: tally(fixed, index), undetermined: tally(open, index) });
  return { root: reading(0), ...(multiToken ? { prefix: reading(1) } : {}) };
};
const worldOutcome = (members, multiToken, parameters) => {
  const root = decideEligibility(counts(...Object.values(tally(members, 0))), parameters);
  if (!multiToken) return root.outcome;
  const prefix = decideEligibility(counts(...Object.values(tally(members, 1))), parameters);
  return combineReadings({ prefix, root }).outcome;
};
// The oracle: Definition 1, every subset of the attribution-undetermined members removed.
const enumerate = (fixed, open, multiToken, parameters) => {
  const outcomes = new Set();
  for (let mask = 0; mask < 1 << open.length; mask += 1) {
    outcomes.add(worldOutcome([...fixed, ...open.filter((_, i) => !(mask & (1 << i)))], multiToken, parameters));
  }
  const [only] = outcomes;
  return outcomes.size === 1 && only !== 'undetermined' ? only : 'undetermined';
};
const multisets = (pairs, maxSize, minSize = 0) => {
  const out = [];
  const walk = (start, acc) => {
    if (acc.length >= minSize) out.push(acc);
    if (acc.length === maxSize) return;
    for (let i = start; i < pairs.length; i += 1) walk(i, [...acc, pairs[i]]);
  };
  walk(0, []);
  return out;
};
const PARAMETER_SETS = [BUILTIN, { P_COVERAGE: 0.3, P_MIN_SUPPORT: 1, P_NOT_ELIGIBLE_SHARE: 0.4, P_ELIGIBLE_SHARE: 0.6 }, { P_COVERAGE: 1, P_MIN_SUPPORT: 3, P_NOT_ELIGIBLE_SHARE: 0, P_ELIGIBLE_SHARE: 1 }];

test('Q3: the corner procedure equals exhaustive enumeration of every admissible resolution (Definition 1)', () => {
  let compared = 0;
  let decidedWithOpen = 0;
  for (const multiToken of [false, true]) {
    const pairs = multiToken ? PAIRS : [['S'], ['C'], ['M']];
    for (const fixed of multisets(pairs, 4)) {
      for (const open of multisets(pairs, 3, 1)) {
        for (const parameters of PARAMETER_SETS) {
          const expected = enumerate(fixed, open, multiToken, parameters);
          const { outcome } = decideCandidate({ readings: readingsOf(fixed, open, multiToken), multiToken, parameters });
          assert.equal(outcome, expected, JSON.stringify({ fixed, open, multiToken, parameters }));
          compared += 1;
          if (expected !== 'undetermined') decidedWithOpen += 1;
        }
      }
    }
  }
  assert.ok(compared > 10000 && decidedWithOpen > 1000, `${compared} compared, ${decidedWithOpen} decided`);
});

test('Q3: with no attribution-undetermined member the outcome is the plain S2.5 / E2 result', () => {
  for (const multiToken of [false, true]) {
    for (const fixed of multisets(multiToken ? PAIRS : [['S'], ['C'], ['M']], 6)) {
      const decision = decideCandidate({ readings: readingsOf(fixed, [], multiToken), multiToken, parameters: BUILTIN });
      assert.equal(decision.outcome, worldOutcome(fixed, multiToken, BUILTIN));
      assert.equal(decision.referenceResolutions, undefined);
      assert.ok(decision.conditionChecks.every((check) => Object.values(check.corner).every((n) => n === 0)));
    }
  }
});

// C30's counts: a multi-token candidate definitely holding one member contradicted on both readings
// and one contradicted on root and missing on prefix, with two attribution-undetermined members of
// the same two kinds.
const C30 = { fixed: [['C', 'C'], ['C', 'M']], open: [['C', 'C'], ['C', 'M']] };

test('C30: the two reference resolutions and a single resolution are wrong procedures; the corners are right', () => {
  const { fixed, open } = C30;
  const decision = decideCandidate({ readings: readingsOf(fixed, open, true), multiToken: true, parameters: BUILTIN });
  assert.equal(decision.outcome, 'undetermined');
  assert.equal(decision.reason, 'depends-on-undetermined-nested-candidate');
  assert.equal(enumerate(fixed, open, true, BUILTIN), 'undetermined');

  // Wrong procedure 1: deciding from the two S2.6 reference resolutions alone.
  assert.equal(worldOutcome([...fixed, ...open], true, BUILTIN), 'not-eligible');
  assert.equal(worldOutcome(fixed, true, BUILTIN), 'not-eligible');
  assert.deepEqual([decision.referenceResolutions.retained.outcome, decision.referenceResolutions.removed.outcome], ['not-eligible', 'not-eligible']);
  // Wrong procedure 2: one "worst" resolution for every condition at once. Removing every
  // undetermined member is the least favourable resolution for the share, and it says not-eligible.
  assert.equal(worldOutcome(fixed, true, BUILTIN), 'not-eligible');
  // The mixed resolution the corners find: remove only the member contradicted on both readings.
  assert.equal(worldOutcome([...fixed, open[1]], true, BUILTIN), 'undetermined');
  const failing = decision.conditionChecks.filter((check) => !check.holds && check.reading === 'prefix' && check.condition === 'coverage');
  assert.deepEqual(failing.map(({ corner, value }) => ({ corner, value })), [
    { corner: { removedSupport: 0, removedContradiction: 1, removedMissing: 0 }, value: 1 / 3 },
  ]);
});

test('decision evidence: every condition of both outcomes, per reading tested, with bound, corner and value', () => {
  const decision = decideCandidate({ readings: readingsOf([['S', 'S'], ['S', 'S']], [['C', 'C']], true), multiToken: true, parameters: BUILTIN });
  assert.deepEqual(
    decision.conditionChecks.map((check) => `${check.reading}:${check.condition}`),
    ['prefix', 'root'].flatMap((reading) =>
      ['active-members', 'coverage', 'eligible-share', 'minimum-support', 'not-eligible-share'].map((condition) => `${reading}:${condition}`),
    ),
  );
  // Keeping the contradicting member is least favourable for the eligible share: 2 of 3.
  const share = decision.conditionChecks.find((check) => check.reading === 'prefix' && check.condition === 'eligible-share');
  assert.deepEqual(share, {
    reading: 'prefix',
    condition: 'eligible-share',
    comparator: '>=',
    bound: 0.75,
    corner: { removedSupport: 0, removedContradiction: 0, removedMissing: 0 },
    value: 2 / 3,
    holds: false,
  });
  assert.equal(decision.outcome, 'undetermined');

  // The active-members condition is least favourable where every undetermined member, of every kind, leaves.
  const withMissing = decideCandidate({ readings: readingsOf([['S']], [['C'], ['M']], false), multiToken: false, parameters: BUILTIN });
  const active = withMissing.conditionChecks.find((check) => check.condition === 'active-members');
  assert.deepEqual([active.corner, active.value], [{ removedSupport: 0, removedContradiction: 1, removedMissing: 1 }, 1]);
  const coverage = withMissing.conditionChecks.find((check) => check.condition === 'coverage');
  assert.deepEqual(coverage.corner, { removedSupport: 0, removedContradiction: 1, removedMissing: 0 });
});

test('E2-I1: zero root matches never give claim-unresolved', () => {
  for (const fixed of multisets(PAIRS.filter(([root]) => root !== 'S'), 7)) {
    const decision = decideCandidate({ readings: readingsOf(fixed, [], true), multiToken: true, parameters: BUILTIN });
    assert.notEqual(decision.reason, 'claim-unresolved', JSON.stringify(fixed));
  }
});
