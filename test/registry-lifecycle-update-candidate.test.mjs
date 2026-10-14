import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyEntry, extractComparisonEntries } from '../src/core/registry-lifecycle/registry-lifecycle-comparison.logic.mjs';
import {
  RegistryUpdateCandidateError,
  buildRegistryUpdateCandidate,
} from '../src/core/registry-lifecycle/registry-lifecycle-update-candidate.logic.mjs';
import { ENTRY_DECISIONS_BY_CLASS } from '../src/core/registry-lifecycle/registry-lifecycle.contracts.mjs';

// One synthetic registry with every comparison shape (spec §8.4): a value, a wildcard map of values,
// members, a wildcard map of members, members on a nested path, keyed records, an ordered keyed
// collection, a wildcard map of keyed collections (group presence) and an ordered one.
const ENTRY = Object.freeze({
  registryId: 'test/all-shapes',
  descriptor: {},
  comparison: [
    { kind: 'value', path: 'title' },
    { kind: 'value', path: 'profiles.*' },
    { kind: 'members', path: 'extensions' },
    { kind: 'members', path: 'tagsByKind.*' },
    { kind: 'members', path: 'nested.signals' },
    { kind: 'keyed', path: 'roles', key: 'role' },
    { kind: 'keyed', path: 'rules', key: 'id', ordered: true },
    { kind: 'keyed', path: 'rolesByCategory.*', key: 'role' },
    { kind: 'keyed', path: 'pipelines.*', key: 'step', ordered: true },
  ],
});

const BASELINE = Object.freeze({
  version: 1,
  title: 'base',
  profiles: { a: { x: 1 }, b: { x: 2 } },
  extensions: ['.js', '.ts'],
  tagsByKind: { k1: ['t1'] },
  nested: { signals: ['n1'] },
  roles: [
    { role: 'r1', v: 1 },
    { role: 'r2', v: 2 },
  ],
  rules: [{ id: 's1' }, { id: 's2' }],
  rolesByCategory: { c1: [{ role: 'x', v: 1 }] },
  pipelines: { p1: [{ step: 'a' }, { step: 'b' }] },
});

const copy = (value) => JSON.parse(JSON.stringify(value));
const edit = (payload, change) => {
  const next = copy(payload);
  change(next);
  return next;
};

const deepFreeze = (value) => {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

const classesOf = (baseline, builtin, custom) => {
  const [b, bi, c] = [baseline, builtin, custom].map((payload) => extractComparisonEntries(payload, ENTRY));
  const addresses = [...new Set([...b.keys(), ...bi.keys(), ...c.keys()])].sort();
  return new Map(
    addresses
      .map((address) => [address, classifyEntry(b.get(address), bi.get(address), c.get(address))])
      .filter(([, entryClass]) => entryClass !== null),
  );
};

// The record's entry list for every decidable entry, each decided by `choose(address, class)`.
const decide = (baseline, builtin, custom, choose) =>
  [...classesOf(baseline, builtin, custom)]
    .filter(([, entryClass]) => Object.hasOwn(ENTRY_DECISIONS_BY_CLASS, entryClass))
    .map(([address, entryClass]) => ({ address, class: entryClass, decision: choose(address, entryClass) }));

const byAddress =
  (choices, fallback = 'keep-custom') =>
  (address) =>
    choices[address] ?? fallback;

const build = ({ baseline = BASELINE, builtin, custom = BASELINE, choose }) =>
  buildRegistryUpdateCandidate({
    entry: ENTRY,
    baselinePayload: baseline,
    builtinPayload: builtin,
    customPayload: custom,
    decisions: decide(baseline, builtin, custom, choose),
  });

// After the Baseline advances to Builtin (spec §8.2): every `take-builtin` entry no longer
// differs, and every `keep-custom` entry is `custom-only`, as is every earlier `custom-only` entry.
const assertAdvancedClasses = ({ baseline = BASELINE, builtin, custom = BASELINE, choose, candidate }, label) => {
  const before = classesOf(baseline, builtin, custom);
  const after = classesOf(builtin, builtin, candidate);
  for (const [address, entryClass] of before) {
    const decided = Object.hasOwn(ENTRY_DECISIONS_BY_CLASS, entryClass) ? choose(address, entryClass) : null;
    const expected =
      decided === 'take-builtin' || entryClass === 'aligned' ? null : decided === 'keep-custom' ? 'custom-only' : entryClass;
    assert.equal(after.get(address) ?? null, expected, `${label}: ${address} was ${entryClass}, decided ${decided}`);
  }
  for (const address of after.keys()) {
    assert.equal(before.has(address), true, `${label}: ${address} differs only after the update`);
  }
};

test('each entry class and decision on a value, a wildcard value map and the advanced classes', () => {
  const builtin = edit(BASELINE, (payload) => {
    payload.title = 'builtin';
    payload.profiles.a = { x: 10 };
    payload.profiles.c = { x: 3 };
    delete payload.profiles.b;
  });
  const custom = edit(BASELINE, (payload) => {
    payload.title = 'custom';
  });
  const cases = {
    'take every Builtin change': [byAddress({}, 'take-builtin'), (payload) => {
      assert.equal(payload.title, 'builtin');
      assert.deepEqual(payload.profiles, { a: { x: 10 }, c: { x: 3 } });
    }],
    'keep every Custom form': [byAddress({}, 'keep-custom'), (payload) => {
      assert.deepEqual(payload, custom);
    }],
  };

  for (const [label, [choose, check]] of Object.entries(cases)) {
    assert.deepEqual(
      Object.fromEntries(classesOf(BASELINE, builtin, custom)),
      {
        'profiles["a"]': 'builtin-changed',
        'profiles["b"]': 'builtin-removed',
        'profiles["c"]': 'builtin-added',
        title: 'both-changed',
      },
      label,
    );
    const { payload } = build({ builtin, custom, choose });
    check(payload);
    assertAdvancedClasses({ builtin, custom, choose, candidate: payload }, label);
  }
});

test('members, a wildcard members map and a members list on a nested path take or keep each member', () => {
  const builtin = edit(BASELINE, (payload) => {
    payload.extensions = ['.ts', '.mjs'];
    payload.tagsByKind = { k1: ['t1', 't2'], k2: ['t3'] };
    payload.nested.signals = ['n1', 'n2'];
  });
  // Custom lacks `nested` entirely, so taking a nested member creates its containers.
  const custom = edit(BASELINE, (payload) => {
    delete payload.nested;
  });
  const choose = byAddress({}, 'take-builtin');
  const { payload } = build({ builtin, custom, choose });
  assert.deepEqual(payload.extensions, ['.ts', '.mjs']);
  assert.deepEqual(payload.tagsByKind, { k1: ['t1', 't2'], k2: ['t3'] });
  // `nested.signals["n1"]` is custom-only (removed in Custom), so it stays removed.
  assert.deepEqual(payload.nested, { signals: ['n2'] });
  assertAdvancedClasses({ builtin, custom, choose, candidate: payload }, 'members');

  const kept = build({ builtin, custom, choose: byAddress({ 'extensions[".js"]': 'keep-custom' }, 'take-builtin') });
  assert.deepEqual(kept.payload.extensions, ['.js', '.ts', '.mjs']);
});

test('keyed records are replaced in place, appended or removed, and kept records keep their Custom form', () => {
  const builtin = edit(BASELINE, (payload) => {
    payload.roles = [
      { role: 'r3', v: 3 },
      { role: 'r1', v: 10 },
    ];
  });
  const custom = edit(BASELINE, (payload) => {
    payload.roles.push({ role: 'mine', v: 0 });
  });
  const choose = byAddress({}, 'take-builtin');
  const { payload } = build({ builtin, custom, choose });
  // `r1` is replaced where Custom has it, `r2` removed, `r3` appended; `mine` (custom-only) stays.
  assert.deepEqual(payload.roles, [
    { role: 'r1', v: 10 },
    { role: 'mine', v: 0 },
    { role: 'r3', v: 3 },
  ]);
  assertAdvancedClasses({ builtin, custom, choose, candidate: payload }, 'records');

  const keepR2 = byAddress({ 'roles[role="r2"]': 'keep-custom' }, 'take-builtin');
  const kept = build({ builtin, custom, choose: keepR2 });
  assert.deepEqual(kept.payload.roles.map((record) => record.role), ['r1', 'r2', 'mine', 'r3']);
  assertAdvancedClasses({ builtin, custom, choose: keepR2, candidate: kept.payload }, 'records, r2 kept');
});

test('an ordered collection takes its order entry together with its records, and an inconsistent order is refused', () => {
  const builtin = edit(BASELINE, (payload) => {
    payload.rules = [{ id: 's2' }, { id: 's3' }, { id: 's1' }];
  });
  assert.deepEqual(Object.fromEntries(classesOf(BASELINE, builtin, BASELINE)), {
    'rules#order': 'builtin-changed',
    'rules[id="s3"]': 'builtin-added',
  });

  const takeAll = byAddress({}, 'take-builtin');
  const taken = build({ builtin, choose: takeAll });
  assert.deepEqual(taken.payload.rules, [{ id: 's2' }, { id: 's3' }, { id: 's1' }]);
  assertAdvancedClasses({ builtin, choose: takeAll, candidate: taken.payload }, 'order taken');

  const keepAll = byAddress({}, 'keep-custom');
  const kept = build({ builtin, choose: keepAll });
  assert.equal(kept.changed, false);
  assertAdvancedClasses({ builtin, choose: keepAll, candidate: kept.payload }, 'order kept');

  for (const [label, choices] of Object.entries({
    'the record taken, the order kept': { 'rules[id="s3"]': 'take-builtin', 'rules#order': 'keep-custom' },
    'the order taken, the record kept absent': { 'rules[id="s3"]': 'keep-custom', 'rules#order': 'take-builtin' },
  })) {
    assert.throws(
      () => build({ builtin, choose: byAddress(choices) }),
      (error) =>
        error instanceof RegistryUpdateCandidateError && error.mismatches.some(({ address }) => address === 'rules#order'),
      label,
    );
  }
});

test('a Custom reordering is kept while Builtin changes a record of the same ordered collection', () => {
  const builtin = edit(BASELINE, (payload) => {
    payload.rules = [{ id: 's1', note: 'new' }, { id: 's2' }];
  });
  const custom = edit(BASELINE, (payload) => {
    payload.rules = [{ id: 's2' }, { id: 's1' }];
  });
  const choose = byAddress({}, 'take-builtin');
  const { payload } = build({ builtin, custom, choose });
  assert.deepEqual(payload.rules, [{ id: 's2' }, { id: 's1', note: 'new' }]);
  assertAdvancedClasses({ builtin, custom, choose, candidate: payload }, 'custom order');
});

test('group-presence entries: a group is added or removed only by its own decision', () => {
  const added = edit(BASELINE, (payload) => {
    payload.rolesByCategory.c2 = [{ role: 'y', v: 1 }];
  });
  const removed = edit(BASELINE, (payload) => {
    delete payload.rolesByCategory.c1;
  });

  const takeAll = byAddress({}, 'take-builtin');
  assert.deepEqual(build({ builtin: added, choose: takeAll }).payload.rolesByCategory, {
    c1: [{ role: 'x', v: 1 }],
    c2: [{ role: 'y', v: 1 }],
  });
  const groupOnly = byAddress({ 'rolesByCategory["c2"]': 'take-builtin' });
  const empty = build({ builtin: added, choose: groupOnly });
  assert.deepEqual(empty.payload.rolesByCategory.c2, []);
  assertAdvancedClasses({ builtin: added, choose: groupOnly, candidate: empty.payload }, 'empty group');

  assert.deepEqual(build({ builtin: removed, choose: takeAll }).payload.rolesByCategory, {});
  assert.deepEqual(build({ builtin: removed, choose: byAddress({}) }).payload, BASELINE);

  // The refusal names the entry that cannot be placed, never a group created on the way.
  for (const [label, builtin, choices, refusedAt] of [
    ['a record added into a group kept absent', added, { 'rolesByCategory["c2"][role="y"]': 'take-builtin' }, ['rolesByCategory["c2"][role="y"]']],
    ['a group removed while its record is kept', removed, { 'rolesByCategory["c1"]': 'take-builtin' }, ['rolesByCategory["c1"][role="x"]']],
  ]) {
    assert.throws(
      () => build({ builtin, choose: byAddress(choices) }),
      (error) =>
        error instanceof RegistryUpdateCandidateError &&
        JSON.stringify(error.mismatches.map(({ address }) => address)) === JSON.stringify(refusedAt),
      label,
    );
  }
});

test('an ordered collection in a wildcard map: the group, its records and its order are decided together', () => {
  const removed = edit(BASELINE, (payload) => {
    delete payload.pipelines.p1;
  });
  assert.deepEqual(Object.fromEntries(classesOf(BASELINE, removed, BASELINE)), {
    'pipelines["p1"]': 'builtin-removed',
    'pipelines["p1"]#order': 'builtin-removed',
    'pipelines["p1"][step="a"]': 'builtin-removed',
    'pipelines["p1"][step="b"]': 'builtin-removed',
  });
  const takeAll = byAddress({}, 'take-builtin');
  assert.deepEqual(build({ builtin: removed, choose: takeAll }).payload.pipelines, {});
  assert.throws(
    () => build({ builtin: removed, choose: byAddress({ 'pipelines["p1"]#order': 'keep-custom' }, 'take-builtin') }),
    RegistryUpdateCandidateError,
  );

  // Records removed but the group kept: its empty list stays with an empty order.
  const recordsOnly = byAddress({ 'pipelines["p1"]': 'keep-custom', 'pipelines["p1"]#order': 'keep-custom' }, 'take-builtin');
  assert.throws(() => build({ builtin: removed, choose: recordsOnly }), RegistryUpdateCandidateError, 'order still lists a, b');

  const added = edit(BASELINE, (payload) => {
    payload.pipelines.p2 = [{ step: 'z' }];
  });
  const addedPayload = build({ builtin: added, choose: takeAll }).payload;
  assert.deepEqual(addedPayload.pipelines.p2, [{ step: 'z' }]);
});

test('a builtin-removed ordered collection on a literal path is removed when every part is taken', () => {
  const builtin = edit(BASELINE, (payload) => {
    delete payload.rules;
  });
  const { payload } = build({ builtin, choose: byAddress({}, 'take-builtin') });
  assert.equal(Object.hasOwn(payload, 'rules'), false);
});

test('a record that does not match the comparison is refused before anything is constructed', () => {
  const builtin = edit(BASELINE, (payload) => {
    payload.title = 'builtin';
    payload.extensions.push('.mjs');
  });
  const decisions = decide(BASELINE, builtin, BASELINE, byAddress({}, 'take-builtin'));
  const cases = {
    'a decidable entry without a decision': decisions.slice(1),
    'an address that is not decidable': [...decisions, { address: 'roles[role="r1"]', class: 'builtin-changed', decision: 'take-builtin' }],
    'a recorded class that differs': decisions.map((entry, index) => (index === 0 ? { ...entry, class: 'both-changed' } : entry)),
    'a decision the class does not accept': decisions.map((entry, index) => (index === 0 ? { ...entry, decision: 'merge-fields' } : entry)),
    'an undecided entry': decisions.map((entry, index) => (index === 0 ? { ...entry, decision: null } : entry)),
    'an address decided twice': [...decisions, decisions[0]],
  };
  for (const [label, entries] of Object.entries(cases)) {
    assert.throws(
      () =>
        buildRegistryUpdateCandidate({
          entry: ENTRY,
          baselinePayload: BASELINE,
          builtinPayload: builtin,
          customPayload: BASELINE,
          decisions: entries,
        }),
      /The decisions do not match the comparison/u,
      label,
    );
  }
});

test('the inputs are never mutated, and an all-keep or aligned-only record leaves the Custom payload unchanged', () => {
  const builtin = deepFreeze(
    edit(BASELINE, (payload) => {
      payload.title = 'builtin';
      payload.roles[0].v = 10;
      payload.rules.reverse();
    }),
  );
  const custom = deepFreeze(edit(BASELINE, (payload) => payload.extensions.push('.custom')));
  const frozenBaseline = deepFreeze(copy(BASELINE));
  const taken = buildRegistryUpdateCandidate({
    entry: ENTRY,
    baselinePayload: frozenBaseline,
    builtinPayload: builtin,
    customPayload: custom,
    decisions: decide(frozenBaseline, builtin, custom, byAddress({}, 'take-builtin')),
  });
  assert.equal(taken.changed, true);

  const kept = build({ builtin, custom, choose: byAddress({}, 'keep-custom') });
  assert.deepEqual(kept, { payload: custom, changed: false });

  // Every Builtin change is aligned: nothing to decide, nothing to change.
  const aligned = build({ builtin, custom: builtin, choose: byAddress({}) });
  assert.deepEqual(aligned, { payload: builtin, changed: false });
});

test('a map key such as __proto__ stays an own data property of the candidate', () => {
  const builtin = JSON.parse(JSON.stringify(BASELINE).replace('"profiles":{', '"profiles":{"__proto__":{"x":9},'));
  const { payload } = build({ builtin, choose: byAddress({}, 'take-builtin') });
  assert.equal(Object.hasOwn(payload.profiles, '__proto__'), true);
  assert.deepEqual(payload.profiles.__proto__, { x: 9 });
  assert.equal(Object.getPrototypeOf(payload.profiles), Object.prototype);
});

test('every Builtin change taken makes the candidate equal Builtin in comparison terms', () => {
  const builtin = edit(BASELINE, (payload) => {
    payload.title = 'b2';
    payload.profiles = { b: { x: 20 }, d: { x: 4 } };
    payload.extensions = ['.mjs'];
    payload.tagsByKind = {};
    payload.nested.signals = [];
    payload.roles = [{ role: 'r9', v: 9 }];
    payload.rules = [{ id: 's9' }, { id: 's1' }];
    payload.rolesByCategory = { c9: [] };
    payload.pipelines = { p9: [{ step: 'q' }] };
  });
  const { payload } = build({ builtin, choose: byAddress({}, 'take-builtin') });
  assert.deepEqual(
    Object.fromEntries(extractComparisonEntries(payload, ENTRY)),
    Object.fromEntries(extractComparisonEntries(builtin, ENTRY)),
  );
});
