import test from 'node:test';
import assert from 'node:assert/strict';
import { REGISTRY_LIFECYCLE_SLICES } from '../src/core/registry-lifecycle/registry-lifecycle-inventory.knowledge.mjs';
import { keyedEntryAddress } from '../src/core/registry-lifecycle/registry-lifecycle-comparison.logic.mjs';
import {
  BridgeDeclarationError,
  assertBridgeDeclarations,
  builtinBridgeSides,
  resolveBridgeCompatibility,
} from '../src/core/registry-lifecycle/registry-lifecycle-bridge-compatibility.logic.mjs';

// Suite mechanics of bridge compatibility (lifecycle spec §9.4) over synthetic slices: what suite core
// checks and compares, without any slice's registry knowledge.
const emitterEntry = (overrides = {}) => ({
  registryId: 'alpha/things',
  readableVersions: ['1'],
  comparison: [{ kind: 'keyed', path: 'things', key: 'id' }],
  bridges: [{ bridgeId: 'alpha/thing-kind', perspective: 'kinds', consumer: 'beta/kinds' }],
  interprets: [],
  ...overrides,
});
const consumerEntry = (overrides = {}) => ({
  registryId: 'beta/kinds',
  readableVersions: ['1'],
  comparison: [{ kind: 'keyed', path: 'kinds', key: 'kind' }],
  bridges: [],
  interprets: [{ bridgeId: 'alpha/thing-kind' }],
  ...overrides,
});
const slicesOf = (emitter = emitterEntry(), consumer = consumerEntry(), extraAlpha = []) => [
  { sliceId: 'alpha', inventory: [emitter, ...extraAlpha] },
  { sliceId: 'beta', inventory: [consumer] },
];
const thingAddress = (id) => keyedEntryAddress(emitterEntry(), { collection: 'things', groups: [], key: id });

// Emits each thing's `kind`; interprets each kind record. Records what it was given.
const resolversOf = ({ emitted, interpretable, calls = [] } = {}) => ({
  alpha: {
    versions: ['1'],
    resolveEmitted: (input) => {
      calls.push(['emitted', input]);
      return emitted ?? input.payload.things.map((thing) => ({ value: thing.kind, source: { collection: 'things', groups: [], key: thing.id } }));
    },
  },
  beta: {
    versions: ['1'],
    resolveInterpretable: (input) => {
      calls.push(['interpretable', input]);
      return interpretable ?? input.payload.kinds.map((record) => ({ value: record.kind }));
    },
  },
});

const sidesOf = ({ things, kinds, unavailable = {} }) => (entry) => {
  if (unavailable[entry.registryId]) {
    return { unavailable: { registryId: entry.registryId, ...unavailable[entry.registryId] } };
  }
  return entry.registryId === 'alpha/things'
    ? { payload: { version: '1', things }, entries: new Set(things.map((thing) => thingAddress(thing.id))) }
    : { payload: { version: '1', kinds }, entries: new Set() };
};

const compare = ({ things, kinds, unavailable, slices = slicesOf(), resolvers = resolversOf() }) =>
  resolveBridgeCompatibility({ set: 'custom', sideOf: sidesOf({ things, kinds, unavailable }), slices, resolvers });

test('the Builtin set is gap-free: every declared bridge is compatible', () => {
  const result = resolveBridgeCompatibility({ set: 'builtin', sideOf: builtinBridgeSides() });
  assert.ok(result.bridges.length > 0);
  for (const bridge of result.bridges) {
    assert.equal(bridge.state, 'compatible', bridge.bridgeId);
    assert.deepEqual(bridge.uninterpretable, []);
  }
  assert.deepEqual(assertBridgeDeclarations().map(({ bridge }) => bridge.bridgeId), result.bridges.map((bridge) => bridge.bridgeId));
  assert.equal(REGISTRY_LIFECYCLE_SLICES.length, 3);
});

test('gaps are emitted values the consumer lacks, each with every emitting entry, in ordinal order', () => {
  const result = compare({
    things: [
      { id: 'b', kind: 'zeta' },
      { id: 'a', kind: 'zeta' },
      { id: 'c', kind: 'eta' },
      { id: 'd', kind: 'known' },
    ],
    kinds: [{ kind: 'known' }, { kind: 'never-emitted' }],
  });
  assert.deepEqual(result, {
    set: 'custom',
    bridges: [
      {
        bridgeId: 'alpha/thing-kind',
        perspective: 'kinds',
        emitter: { sliceId: 'alpha', registryId: 'alpha/things' },
        consumer: { sliceId: 'beta', registryId: 'beta/kinds' },
        state: 'gaps',
        uninterpretable: [
          { value: 'eta', emittedBy: [thingAddress('c')] },
          { value: 'zeta', emittedBy: [thingAddress('a'), thingAddress('b')] },
        ],
      },
    ],
  });
  assert.equal(compare({ things: [{ id: 'a', kind: 'known' }], kinds: [{ kind: 'known' }] }).bridges[0].state, 'compatible');
  // Nothing emitted is compatible: an available empty domain is a fact, unlike an unavailable one.
  assert.equal(compare({ things: [], kinds: [] }).bridges[0].state, 'compatible');
});

test('an unavailable side is reported with its condition, emitter first; no resolver runs and no partial domain is published', () => {
  const calls = [];
  const resolvers = resolversOf({ calls });
  const result = compare({
    things: [{ id: 'a', kind: 'zeta' }],
    kinds: [],
    resolvers,
    unavailable: {
      'beta/kinds': { condition: 'invalid', detail: 'bad kinds' },
      'alpha/things': { condition: 'missing', detail: 'Absent from the Custom set.' },
    },
  });
  assert.deepEqual(result.bridges[0].state, 'unavailable');
  assert.deepEqual(result.bridges[0].unavailable, [
    { side: 'emitter', registryId: 'alpha/things', condition: 'missing', detail: 'Absent from the Custom set.' },
    { side: 'consumer', registryId: 'beta/kinds', condition: 'invalid', detail: 'bad kinds' },
  ]);
  assert.equal(Object.hasOwn(result.bridges[0], 'uninterpretable'), false);
  assert.deepEqual(calls, []);

  const oneSide = compare({ things: [{ id: 'a', kind: 'zeta' }], kinds: [], resolvers, unavailable: { 'beta/kinds': { condition: 'invalid', detail: 'x' } } });
  assert.deepEqual(oneSide.bridges[0].unavailable.map(({ side }) => side), ['consumer']);
  assert.deepEqual(calls, [], 'the available side is not resolved either');
});

test('resolvers receive a deep-frozen copy of their own payload, the bridge id and the perspective, and nothing else', () => {
  const calls = [];
  compare({ things: [{ id: 'a', kind: 'zeta' }], kinds: [{ kind: 'zeta' }], resolvers: resolversOf({ calls }) });
  assert.deepEqual(calls.map(([kind, input]) => [kind, Object.keys(input).sort()]), [
    ['emitted', ['bridgeId', 'payload', 'perspective', 'registryId']],
    ['interpretable', ['bridgeId', 'payload', 'perspective', 'registryId']],
  ]);
  for (const [, input] of calls) {
    assert.equal(input.bridgeId, 'alpha/thing-kind');
    assert.equal(input.perspective, 'kinds');
    assert.ok(Object.isFrozen(input.payload));
    assert.ok(Object.values(input.payload).every((value) => typeof value !== 'object' || Object.isFrozen(value)));
  }
});

test('declaration problems are programming errors', () => {
  const cases = [
    ['a malformed bridge', slicesOf(emitterEntry({ bridges: [{ bridgeId: 'alpha/thing-kind', consumer: 'beta/kinds' }] })), /malformed bridge declaration/u],
    ['a padded perspective', slicesOf(emitterEntry({ bridges: [{ bridgeId: 'alpha/thing-kind', perspective: ' kinds', consumer: 'beta/kinds' }] })), /malformed bridge declaration/u],
    ['another slice prefix', slicesOf(emitterEntry({ bridges: [{ bridgeId: 'beta/thing-kind', perspective: 'kinds', consumer: 'beta/kinds' }] })), /<sliceId>\/<name>/u],
    [
      'a duplicate id',
      slicesOf(emitterEntry(), consumerEntry(), [emitterEntry({ registryId: 'alpha/others' })]),
      /declared more than once/u,
    ],
    ['an unknown consumer', slicesOf(emitterEntry({ bridges: [{ bridgeId: 'alpha/thing-kind', perspective: 'kinds', consumer: 'beta/nope' }] })), /not a current inventory registry/u],
    [
      'a same-slice consumer',
      slicesOf(emitterEntry({ bridges: [{ bridgeId: 'alpha/thing-kind', perspective: 'kinds', consumer: 'alpha/others' }] }), consumerEntry({ interprets: [] }), [
        { registryId: 'alpha/others', readableVersions: ['1'], comparison: [], interprets: [{ bridgeId: 'alpha/thing-kind' }] },
      ]),
      /consumer of its own slice/u,
    ],
    ['no interpretation', slicesOf(emitterEntry(), consumerEntry({ interprets: [] })), /interpreted exactly once.*0 times/u],
    ['two interpretations', slicesOf(emitterEntry(), consumerEntry({ interprets: [{ bridgeId: 'alpha/thing-kind' }, { bridgeId: 'alpha/thing-kind' }] })), /2 times/u],
    ['an interpretation of no bridge', slicesOf(emitterEntry(), consumerEntry({ interprets: [{ bridgeId: 'alpha/thing-kind' }, { bridgeId: 'alpha/none' }] })), /no registry declares as a bridge/u],
    ['a malformed interpretation', slicesOf(emitterEntry(), consumerEntry({ interprets: [{ bridgeId: 'alpha/thing-kind', extra: 1 }] })), /malformed interpretation/u],
  ];
  for (const [label, slices, pattern] of cases) {
    assert.throws(() => assertBridgeDeclarations({ slices, resolvers: resolversOf() }), (error) => error instanceof BridgeDeclarationError && pattern.test(error.message), label);
  }
  // An interpretation on a registry that is not the bridge's consumer.
  const wrongHome = [
    { sliceId: 'alpha', inventory: [emitterEntry()] },
    { sliceId: 'beta', inventory: [consumerEntry(), consumerEntry({ registryId: 'beta/others', interprets: [{ bridgeId: 'alpha/thing-kind' }] })] },
  ];
  assert.throws(() => assertBridgeDeclarations({ slices: wrongHome, resolvers: resolversOf() }), /whose consumer is beta\/kinds/u);

  // Resolvers must exist and cover every readable version.
  const { alpha, beta } = resolversOf();
  assert.throws(() => assertBridgeDeclarations({ slices: slicesOf(), resolvers: { beta } }), /alpha emits a bridge without a bridge-domain resolver providing resolveEmitted/u);
  assert.throws(() => assertBridgeDeclarations({ slices: slicesOf(), resolvers: { alpha, beta: { versions: ['1'] } } }), /beta interprets a bridge without a bridge-domain resolver providing resolveInterpretable/u);
  assert.throws(() => assertBridgeDeclarations({ slices: slicesOf(emitterEntry({ readableVersions: ['1', '2'] })), resolvers: { alpha, beta } }), /does not read version 2 of alpha\/things/u);
  assert.throws(() => assertBridgeDeclarations({ slices: slicesOf(emitterEntry(), consumerEntry({ readableVersions: ['2'] })), resolvers: { alpha, beta } }), /does not read version 2 of beta\/kinds/u);
});

test('resolver output problems are programming errors', () => {
  const things = [{ id: 'a', kind: 'zeta' }];
  const kinds = [{ kind: 'zeta' }];
  const source = { collection: 'things', groups: [], key: 'a' };
  const cases = [
    ['emitted not a list', { emitted: {} }, /no list of emitted values/u],
    ['emitted item shape', { emitted: [{ value: 'zeta' }] }, /item of another shape/u],
    ['emitted padded value', { emitted: [{ value: ' zeta', source }] }, /item of another shape/u],
    ['emitted source shape', { emitted: [{ value: 'zeta', source: { collection: 'things', key: 'a' } }] }, /malformed source identity/u],
    ['emitted source collection', { emitted: [{ value: 'zeta', source: { collection: 'others', groups: [], key: 'a' } }] }, /does not fit a keyed collection/u],
    ['emitted absent entry', { emitted: [{ value: 'zeta', source: { ...source, key: 'nope' } }] }, /source entry the payload does not have/u],
    ['emitted repeat', { emitted: [{ value: 'zeta', source }, { value: 'zeta', source }] }, /repeats an item/u],
    ['interpretable not a list', { interpretable: {} }, /no list of interpretable values/u],
    ['interpretable repeat', { interpretable: [{ value: 'zeta' }, { value: 'zeta' }] }, /malformed or repeated/u],
    ['interpretable shape', { interpretable: [{ value: 'zeta', extra: true }] }, /malformed or repeated/u],
  ];
  for (const [label, output, pattern] of cases) {
    assert.throws(() => compare({ things, kinds, resolvers: resolversOf(output) }), (error) => error instanceof BridgeDeclarationError && pattern.test(error.message), label);
  }
});
