import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REGISTRY_LIFECYCLE_SLICES } from '../src/core/registry-lifecycle/registry-lifecycle-inventory.knowledge.mjs';
import {
  ReferenceDeclarationError,
  assertReferenceDeclarations,
  builtinReferenceInputs,
  resolveRegistryReferences,
} from '../src/core/registry-lifecycle/registry-lifecycle-references.logic.mjs';
import {
  keyedEntryAddress,
  parseComparisonAddress,
  walkComparisonEntries,
} from '../src/core/registry-lifecycle/registry-lifecycle-comparison.logic.mjs';
import { validateSliceRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-slice-validation.logic.mjs';
import { NAMING_REFERENCE_RESOLVER } from '../naming/src/registries/naming-registry-references.logic.mjs';
import * as namingInventory from '../naming/src/registries/naming-registry-inventory.knowledge.mjs';
import * as treeInventory from '../tree/src/registries/tree-registry-inventory.knowledge.mjs';

const EDGE_IDS = [
  'naming/perspective-category',
  'naming/perspective-inherits-from',
  'naming/perspective-meaning',
  'naming/perspective-role-definition',
  'tree/perspective-structural-home',
];

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
const entryOf = (registryId) =>
  REGISTRY_LIFECYCLE_SLICES.flatMap((slice) => slice.inventory).find((entry) => entry.registryId === registryId);

// A copy of every slice's Builtin registries, which a test may change, as the `builtinRoot` of its slices.
const withBuiltinCopy = (run) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-references-'));
  try {
    const slices = REGISTRY_LIFECYCLE_SLICES.map((slice) => {
      const builtinRoot = path.join(fixtureRoot, slice.sliceId);
      fs.cpSync(slice.builtinRoot, builtinRoot, { recursive: true });
      return { ...slice, builtinRoot };
    });
    const fileOf = (registryId) => {
      const [sliceId, name] = registryId.split('/');
      return path.join(fixtureRoot, sliceId, `${name}.registry.json`);
    };
    const change = (registryId, update) => {
      const payload = readJson(fileOf(registryId));
      update(payload);
      writeJson(fileOf(registryId), payload);
    };
    const resolve = () => resolveRegistryReferences({ slices, inputOf: builtinReferenceInputs({ slices }) });
    const validate = (sliceId) => validateSliceRegistrySet(sliceId, path.join(fixtureRoot, sliceId));
    return run({ slices, fileOf, change, resolve, validate });
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
};

const unresolvedOf = (result) =>
  result.edges.flatMap((edge) =>
    (edge.references ?? []).filter((reference) => reference.state === 'unresolved').map((reference) => [edge.edgeId, reference.source, reference.target]),
  );
const edgeOf = (result, edgeId) => result.edges.find((edge) => edge.edgeId === edgeId);

test('the Builtin set: every declared edge available, every reference resolved, and both slices valid', () => {
  assertReferenceDeclarations();
  const result = resolveRegistryReferences({ inputOf: builtinReferenceInputs() });
  assert.deepEqual(result.edges.map((edge) => edge.edgeId), EDGE_IDS);
  for (const edge of result.edges) {
    assert.equal(edge.unavailable, undefined, edge.edgeId);
    assert.ok(edge.references.length > 0, edge.edgeId);
    assert.ok(edge.references.every((reference) => reference.state === 'resolved'), edge.edgeId);
    const order = edge.references.map((reference) => `${reference.source}\u0000${reference.target}`);
    assert.deepEqual(order, [...order].sort(), `${edge.edgeId} references are in ordinal order`);
  }
  assert.deepEqual(validateSliceRegistrySet('naming', entrySliceRoot('naming')), []);
  assert.deepEqual(validateSliceRegistrySet('tree', entrySliceRoot('tree')), []);
  // Deterministic: the same set gives the same result.
  assert.deepEqual(resolveRegistryReferences({ inputOf: builtinReferenceInputs() }), result);
});

function entrySliceRoot(sliceId) {
  return REGISTRY_LIFECYCLE_SLICES.find((slice) => slice.sliceId === sliceId).builtinRoot;
}

test('resolved references carry canonical addresses, including group sources and composite targets', () => {
  const result = resolveRegistryReferences({ inputOf: builtinReferenceInputs() });
  const has = (edgeId, source, target) =>
    assert.ok(
      edgeOf(result, edgeId).references.some((reference) => reference.source === source && reference.target === target && reference.state === 'resolved'),
      `${edgeId}: ${source} -> ${target}`,
    );
  has('naming/perspective-category', 'rolesByCategory["concern-core"]', 'categories[category="concern-core"]');
  has('naming/perspective-role-definition', 'rolesByCategory["concern-style"][role="build-style"]', 'roles[role="build-style"]');
  has('naming/perspective-meaning', 'rolesByCategory["concern-style"][role="build-style"]', 'meanings[meaning="presentation"]');
  has('naming/perspective-inherits-from', 'rolesByCategory["concern-style"][role="build-style"]', 'rolesByCategory["concern-core"][role="build"]');
  has('tree/perspective-structural-home', 'structuralHomesBySurface["assets"][structuralHome="assets"]', 'structuralHomes[structuralHome="assets"]');

  // `build-style` lists `structure` in two meaning lists: one reference.
  const structure = edgeOf(result, 'naming/perspective-meaning').references.filter(
    (reference) => reference.source === 'rolesByCategory["concern-style"][role="build-style"]' && reference.target === 'meanings[meaning="structure"]',
  );
  assert.equal(structure.length, 1);
});

// Conformance (spec §12.11): per edge, an unresolved fixture leaves exactly the expected references
// unresolved and the owning slice's validation rejects it; the Builtin set above is the resolved case.
const UNRESOLVED_CASES = [
  {
    edgeId: 'naming/perspective-category',
    sliceId: 'naming',
    // Naming's role loader reports the undeclared category first.
    failure: /category must be one of/u,
    apply: ({ change }) => change('naming/categories', (payload) => {
      payload.categories = payload.categories.filter((entry) => entry.category !== 'concern-style');
    }),
    expected: () => [['naming/perspective-category', 'rolesByCategory["concern-style"]', 'categories[category="concern-style"]']],
  },
  {
    edgeId: 'naming/perspective-role-definition',
    sliceId: 'naming',
    failure: /no roles entry for category-role-perspective roles build-style/u,
    apply: ({ change }) => change('naming/roles', (payload) => {
      payload.roles = payload.roles.filter((entry) => entry.role !== 'build-style');
    }),
    expected: () => [['naming/perspective-role-definition', 'rolesByCategory["concern-style"][role="build-style"]', 'roles[role="build-style"]']],
  },
  {
    edgeId: 'naming/perspective-meaning',
    sliceId: 'naming',
    failure: /must be a non-empty array of agnostic core meanings/u,
    apply: ({ change }) => change('naming/agnostic-core-meanings', (payload) => {
      payload.meanings = payload.meanings.filter((entry) => entry.meaning !== 'presentation');
    }),
    // Every role that names `presentation`, read from the Builtin resolution.
    expected: (builtin) =>
      edgeOf(builtin, 'naming/perspective-meaning')
        .references.filter((reference) => reference.target === 'meanings[meaning="presentation"]')
        .map((reference) => ['naming/perspective-meaning', reference.source, reference.target]),
  },
  {
    edgeId: 'naming/perspective-inherits-from',
    sliceId: 'naming',
    failure: /inheritsFrom must name a \{ category, role \} present in rolesByCategory/u,
    apply: ({ change }) => change('naming/category-role-perspective', (payload) => {
      payload.rolesByCategory['concern-style'].find((entry) => entry.role === 'build-style').inheritsFrom.role = 'missing-role';
    }),
    expected: () => [['naming/perspective-inherits-from', 'rolesByCategory["concern-style"][role="build-style"]', 'rolesByCategory["concern-core"][role="missing-role"]']],
  },
  {
    edgeId: 'tree/perspective-structural-home',
    sliceId: 'tree',
    failure: /structural homes not declared in structural-homes: assets/u,
    apply: ({ change }) => change('tree/structural-homes', (payload) => {
      payload.structuralHomes = payload.structuralHomes.filter((entry) => entry.structuralHome !== 'assets');
    }),
    expected: (builtin) =>
      edgeOf(builtin, 'tree/perspective-structural-home')
        .references.filter((reference) => reference.target === 'structuralHomes[structuralHome="assets"]')
        .map((reference) => ['tree/perspective-structural-home', reference.source, reference.target]),
  },
];

for (const testCase of UNRESOLVED_CASES) {
  test(`conformance ${testCase.edgeId}: a missing target is unresolved, and the slice's validation rejects the set`, () => {
    withBuiltinCopy((fixture) => {
      const builtin = fixture.resolve();
      assert.deepEqual(unresolvedOf(builtin), []);
      assert.deepEqual(fixture.validate(testCase.sliceId), []);

      testCase.apply(fixture);
      const result = fixture.resolve();
      const expected = testCase.expected(builtin);
      assert.ok(expected.length > 0);
      assert.deepEqual(unresolvedOf(result), expected);
      assert.ok(result.edges.every((edge) => edge.unavailable === undefined));

      const failures = fixture.validate(testCase.sliceId);
      assert.ok(failures.some((failure) => testCase.failure.test(failure.detail)), JSON.stringify(failures));
    });
  });
}

test('an identical repeated source record is one entry, so its references are emitted once', () => {
  withBuiltinCopy(({ change, resolve }) => {
    const before = resolve();
    change('naming/category-role-perspective', (payload) => {
      const roles = payload.rolesByCategory['concern-style'];
      roles.push(structuredClone(roles.find((entry) => entry.role === 'build-style')));
    });
    change('tree/surface-structural-home-perspective', (payload) => {
      const [surface] = Object.keys(payload.structuralHomesBySurface);
      payload.structuralHomesBySurface[surface].push(structuredClone(payload.structuralHomesBySurface[surface][0]));
    });
    assert.deepEqual(resolve(), before);
  });
});

test('an unreadable registry makes its edges unavailable, never unresolved', () => {
  withBuiltinCopy(({ fileOf, change, resolve }) => {
    // An unparseable target: only its edge is unavailable.
    fs.writeFileSync(fileOf('naming/categories'), '{ not json');
    let result = resolve();
    assert.deepEqual(edgeOf(result, 'naming/perspective-category').unavailable.registryId, 'naming/categories');
    assert.equal(edgeOf(result, 'naming/perspective-category').unavailable.condition, 'invalid');
    assert.equal(edgeOf(result, 'naming/perspective-category').references, undefined);
    assert.ok(edgeOf(result, 'naming/perspective-role-definition').references.length > 0);
    assert.deepEqual(unresolvedOf(result), []);

    // A target at a version this engine does not read.
    fs.writeFileSync(fileOf('naming/categories'), fs.readFileSync(path.join(entrySliceRoot('naming'), 'categories.registry.json')));
    change('naming/roles', (payload) => {
      payload.version = '2';
    });
    result = resolve();
    assert.deepEqual(edgeOf(result, 'naming/perspective-role-definition').unavailable, {
      registryId: 'naming/roles',
      condition: 'version-incompatible',
      detail: 'version "2" is not one this engine reads.',
    });
    assert.ok(edgeOf(result, 'naming/perspective-category').references.length > 0);

    // A target its comparison declaration cannot extract (a duplicate key).
    change('naming/roles', (payload) => {
      payload.version = '1';
      payload.roles.push({ ...payload.roles[0], definition: 'A second record with the same key.' });
    });
    result = resolve();
    assert.equal(edgeOf(result, 'naming/perspective-role-definition').unavailable.condition, 'invalid');
    assert.deepEqual(unresolvedOf(result), []);

    // A number outside the finite JSON range parses to Infinity and fails canonicalization.
    fs.writeFileSync(fileOf('naming/roles'), fs.readFileSync(path.join(entrySliceRoot('naming'), 'roles.registry.json'), 'utf8').replace('"version": "1",', '"version": "1", "size": 1e400,'));
    result = resolve();
    assert.equal(edgeOf(result, 'naming/perspective-role-definition').unavailable.condition, 'invalid');
    assert.match(edgeOf(result, 'naming/perspective-role-definition').unavailable.detail, /finite JSON range/u);
    assert.deepEqual(unresolvedOf(result), []);

    // A missing source: every edge it declares is unavailable, naming the source.
    fs.rmSync(fileOf('naming/category-role-perspective'));
    result = resolve();
    for (const edgeId of EDGE_IDS.filter((id) => id.startsWith('naming/'))) {
      assert.deepEqual(edgeOf(result, edgeId).unavailable.registryId, 'naming/category-role-perspective', edgeId);
      assert.equal(edgeOf(result, edgeId).unavailable.condition, 'missing');
    }
    assert.ok(edgeOf(result, 'tree/perspective-structural-home').references.length > 0);
  });
});

// A synthetic slice: `test/source` (`items.*` keyed by `id`, plus a value) refers to `test/target`
// (`things` keyed by `name`).
const syntheticSlice = ({ references, sourcePayload, targetPayload } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-references-synthetic-'));
  writeJson(path.join(root, 'source.registry.json'), sourcePayload ?? { version: '1', items: { a: [{ id: 'x', thing: 't1' }], b: [] }, title: 'T' });
  writeJson(path.join(root, 'target.registry.json'), targetPayload ?? { version: '1', things: [{ name: 't1' }], label: 'L' });
  const entry = (name, comparison, refs = []) => ({
    registryId: `test/${name}`,
    name,
    fileName: `${name}.registry.json`,
    readableVersions: ['1'],
    descriptor: {},
    comparison,
    references: refs,
  });
  return {
    root,
    slices: [
      {
        sliceId: 'test',
        builtinRoot: root,
        inventory: [
          entry('source', [{ kind: 'keyed', path: 'items.*', key: 'id' }, { kind: 'value', path: 'title' }], references ?? [
            { edgeId: 'test/item-thing', to: 'test/target', targetCollection: 'things' },
          ]),
          entry('target', [{ kind: 'keyed', path: 'things', key: 'name' }, { kind: 'value', path: 'label' }]),
        ],
      },
    ],
  };
};
const withSynthetic = (options, run) => {
  const synthetic = syntheticSlice(options);
  try {
    return run({ ...synthetic, inputOf: builtinReferenceInputs({ slices: synthetic.slices }) });
  } finally {
    fs.rmSync(synthetic.root, { recursive: true, force: true });
  }
};
const resolverOf = (output, versions = ['1']) => ({ test: { versions, resolve: () => output } });

test('declaration problems are programming errors', () => {
  const declared = (references, resolvers = resolverOf([])) =>
    withSynthetic({ references }, ({ slices }) => () => assertReferenceDeclarations({ slices, resolvers }));
  const cases = [
    ['not a list', declared({}), /not a list/u],
    ['an unknown field', declared([{ edgeId: 'test/e', to: 'test/target', targetCollection: 'things', note: 'x' }]), /malformed reference declaration/u],
    ['a padded id', declared([{ edgeId: ' test/e', to: 'test/target', targetCollection: 'things' }]), /malformed reference declaration/u],
    ['another slice prefix', declared([{ edgeId: 'naming/e', to: 'test/target', targetCollection: 'things' }]), /<sliceId>\/<name> with slice id test/u],
    ['no name', declared([{ edgeId: 'test/', to: 'test/target', targetCollection: 'things' }]), /<sliceId>\/<name>/u],
    [
      'a duplicate id',
      declared([
        { edgeId: 'test/e', to: 'test/target', targetCollection: 'things' },
        { edgeId: 'test/e', to: 'test/target', targetCollection: 'things' },
      ]),
      /declared more than once/u,
    ],
    ['a target outside the slice', declared([{ edgeId: 'test/e', to: 'naming/roles', targetCollection: 'roles' }]), /not a registry of slice test/u],
    ['a value collection', declared([{ edgeId: 'test/e', to: 'test/target', targetCollection: 'label' }]), /not a keyed collection of test\/target/u],
    ['an undeclared collection', declared([{ edgeId: 'test/e', to: 'test/target', targetCollection: 'nothing' }]), /not a keyed collection/u],
    ['no resolver', declared(undefined, {}), /without a reference resolver/u],
    ['a resolver missing a readable version', declared(undefined, resolverOf([], ['2'])), /does not read version 1 of test\/source/u],
  ];
  for (const [label, run, pattern] of cases) {
    assert.throws(run, (error) => error instanceof ReferenceDeclarationError && pattern.test(error.message), label);
  }

  // The real inventories pass, and an id is unique across slices.
  assertReferenceDeclarations();
  const twice = REGISTRY_LIFECYCLE_SLICES.map((slice) => ({ ...slice }));
  twice.push({ ...twice[0], sliceId: 'naming' });
  assert.throws(() => assertReferenceDeclarations({ slices: twice }), /naming\/perspective-category is declared more than once/u);
});

test('resolver output problems are programming errors', () => {
  const item = (overrides = {}) => ({
    edgeId: 'test/item-thing',
    source: { collection: 'items.*', groups: ['a'], key: 'x' },
    target: { groups: [], key: 't1' },
    ...overrides,
  });
  const cases = [
    ['not a list', {}, /returned no list/u],
    ['another shape', [{ ...item(), extra: true }], /has another shape/u],
    ['an undeclared edge', [item({ edgeId: 'test/other' })], /not declared on the registry/u],
    ['a malformed source', [item({ source: { collection: 'items.*', groups: ['a'], key: 'x', extra: 1 } })], /malformed source or target identity/u],
    ['a malformed target', [item({ target: { groups: [] } })], /malformed source or target identity/u],
    ['a value source', [item({ source: { collection: 'title', groups: [] } })], /does not fit a keyed collection/u],
    ['a missing group', [item({ source: { collection: 'items.*', groups: [], key: 'x' } })], /does not fit a keyed collection/u],
    ['a non-string key', [item({ source: { collection: 'items.*', groups: ['a'], key: 1 } })], /malformed source or target identity/u],
    ['an absent source entry', [item({ source: { collection: 'items.*', groups: ['a'], key: 'nope' } })], /source entry the payload does not have \(items\["a"\]\[id="nope"\]\)/u],
    ['an absent source group', [item({ source: { collection: 'items.*', groups: ['zz'] } })], /source entry the payload does not have/u],
    ['a target with groups', [item({ target: { groups: ['g'], key: 't1' } })], /target identity that does not fit test\/target things/u],
    ['a non-string target key', [item({ target: { groups: [], key: null } })], /malformed source or target identity/u],
    ['an explicit undefined source key', [item({ source: { collection: 'items.*', groups: ['a'], key: undefined } })], /malformed source or target identity/u],
    ['a repeated reference', [item(), item()], /repeats a reference/u],
  ];
  withSynthetic({}, ({ slices, inputOf }) => {
    for (const [label, output, pattern] of cases) {
      assert.throws(
        () => resolveRegistryReferences({ slices, resolvers: resolverOf(output), inputOf }),
        (error) => error instanceof ReferenceDeclarationError && pattern.test(error.message),
        label,
      );
    }

    // Group and record sources, resolved and unresolved targets, in ordinal order.
    const result = resolveRegistryReferences({
      slices,
      inputOf,
      resolvers: resolverOf([
        item({ target: { groups: [], key: 'missing' } }),
        item({ source: { collection: 'items.*', groups: ['b'] } }),
        item(),
      ]),
    });
    assert.deepEqual(result.edges, [
      {
        edgeId: 'test/item-thing',
        from: 'test/source',
        to: 'test/target',
        targetCollection: 'things',
        references: [
          { source: 'items["a"][id="x"]', target: 'things[name="missing"]', state: 'unresolved' },
          { source: 'items["a"][id="x"]', target: 'things[name="t1"]', state: 'resolved' },
          { source: 'items["b"]', target: 'things[name="t1"]', state: 'resolved' },
        ],
      },
    ]);
  });
});

test('a target in a wildcard collection needs a string key: an undefined key never names its group', () => {
  const references = [{ edgeId: 'test/item-item', to: 'test/source', targetCollection: 'items.*' }];
  withSynthetic({ references }, ({ slices, inputOf }) => {
    const output = (target) => [{ edgeId: 'test/item-item', source: { collection: 'items.*', groups: ['a'], key: 'x' }, target }];
    assert.throws(
      () => resolveRegistryReferences({ slices, inputOf, resolvers: resolverOf(output({ groups: ['b'], key: undefined })) }),
      (error) => error instanceof ReferenceDeclarationError && /malformed source or target identity/u.test(error.message),
    );
    const result = resolveRegistryReferences({ slices, inputOf, resolvers: resolverOf(output({ groups: ['a'], key: 'x' })) });
    assert.deepEqual(result.edges[0].references, [{ source: 'items["a"][id="x"]', target: 'items["a"][id="x"]', state: 'resolved' }]);
  });
});

test('a resolver receives only a deep-frozen copy of its source payload', () => {
  withSynthetic({}, ({ slices, inputOf }) => {
    const seen = [];
    const resolvers = {
      test: {
        versions: ['1'],
        resolve: (input) => {
          seen.push(input);
          assert.deepEqual(Object.keys(input).sort(), ['payload', 'registryId']);
          assert.ok(Object.isFrozen(input.payload) && Object.isFrozen(input.payload.items.a[0]));
          assert.throws(() => {
            input.payload.items.a[0].id = 'changed';
          }, TypeError);
          return [];
        },
      },
    };
    const original = inputOf('test/source').payload;
    const sharedInput = () => ({ payload: original });
    resolveRegistryReferences({ slices, resolvers, inputOf: (id) => (id === 'test/source' ? sharedInput() : inputOf(id)) });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].registryId, 'test/source');
    assert.equal(Object.isFrozen(original), false);
  });
});

test('the Naming resolver: one reference per distinct meaning, composite inheritsFrom, non-strings emit nothing', () => {
  const payload = {
    version: '1',
    rolesByCategory: {
      c: [
        { role: 'r', agnosticCoreMeanings: ['m', 'n'], baseMeanings: ['m'], inheritsFrom: { category: 'd', role: 'p' } },
        { role: 7, agnosticCoreMeanings: ['m'] },
        { role: 's', overlayMeanings: [1, 'n'], inheritsFrom: { category: 'd' } },
      ],
      empty: [],
    },
  };
  const references = NAMING_REFERENCE_RESOLVER.resolve({ registryId: 'naming/category-role-perspective', payload });
  const brief = references.map(({ edgeId, source, target }) => [edgeId.split('/')[1], source.groups[0], source.key ?? null, target.groups, target.key]);
  assert.deepEqual(brief, [
    ['perspective-category', 'c', null, [], 'c'],
    ['perspective-role-definition', 'c', 'r', [], 'r'],
    ['perspective-meaning', 'c', 'r', [], 'm'],
    ['perspective-meaning', 'c', 'r', [], 'n'],
    ['perspective-inherits-from', 'c', 'r', ['d'], 'p'],
    ['perspective-role-definition', 'c', 's', [], 's'],
    ['perspective-meaning', 'c', 's', [], 'n'],
    ['perspective-category', 'empty', null, [], 'empty'],
  ]);
  assert.deepEqual(NAMING_REFERENCE_RESOLVER.resolve({ registryId: 'naming/roles', payload: { version: '1', roles: [] } }), []);
});

test('keyedEntryAddress writes the addresses the comparison walk writes', () => {
  const perspective = entryOf('naming/category-role-perspective');
  const payload = readJson(path.join(entrySliceRoot('naming'), perspective.fileName));
  for (const { address, site } of walkComparisonEntries(payload, perspective)) {
    const identity = site.kind === 'group'
      ? { collection: site.collectionPath, groups: [site.container.at(-1)] }
      : { collection: site.collectionPath, groups: [site.container.at(-1)], key: site.key };
    assert.equal(keyedEntryAddress(perspective, identity), address);
  }
  const categories = entryOf('naming/categories');
  assert.equal(keyedEntryAddress(categories, { collection: 'categories', groups: [], key: 'a"b' }), 'categories[category="a\\"b"]');
  assert.ok(parseComparisonAddress(keyedEntryAddress(categories, { collection: 'categories', groups: [], key: 'a"b' }), categories));
  for (const identity of [
    { collection: 'categories', groups: [] },
    { collection: 'categories', groups: ['x'], key: 'k' },
    { collection: 'rolesByCategory', groups: [], key: 'k' },
    { collection: 'categories', groups: [], key: 1 },
    { collection: 'categories', groups: 'x', key: 'k' },
  ]) {
    assert.equal(keyedEntryAddress(categories, identity), null, JSON.stringify(identity));
  }
});

test('the informative edge lists are gone: the declarations are the one description', () => {
  assert.equal(Object.keys(namingInventory).some((name) => name.includes('REFERENCE_EDGES')), false);
  assert.equal(Object.keys(treeInventory).some((name) => name.includes('REFERENCE_EDGES')), false);
  const declared = REGISTRY_LIFECYCLE_SLICES.flatMap((slice) => slice.inventory.flatMap((entry) => entry.references.map((edge) => edge.edgeId)));
  assert.deepEqual(declared.sort(), EDGE_IDS);
});
