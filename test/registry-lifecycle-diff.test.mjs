import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REGISTRY_LIFECYCLE_SLICES } from '../src/core/registry-lifecycle/registry-lifecycle-inventory.knowledge.mjs';
import {
  ComparisonExtractionError,
  classifyEntry,
  extractComparisonEntries,
} from '../src/core/registry-lifecycle/registry-lifecycle-comparison.logic.mjs';
import { buildRegistryLifecycleDiff } from '../src/core/registry-lifecycle/registry-lifecycle-diff.logic.mjs';
import { initCustomRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-init.logic.mjs';
import { resolveRegistryLifecyclePaths } from '../src/core/registry-lifecycle/registry-lifecycle-state.logic.mjs';
import { DIFF_REGISTRY_CLASSES, ENTRY_CLASSES } from '../src/core/registry-lifecycle/registry-lifecycle.contracts.mjs';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};
const updateJson = (filePath, update) => writeJson(filePath, update(readJson(filePath)));

const inventoryEntries = REGISTRY_LIFECYCLE_SLICES.flatMap((slice) =>
  slice.inventory.map((entry) => ({ slice, entry })),
);
const entryOf = (registryId) => inventoryEntries.find(({ entry }) => entry.registryId === registryId).entry;

// A target root with an initialized Custom set and private copies of every Builtin root, so a test
// can change "Builtin" as a later release would.
const withDiffFixture = (run, { extraRegistries = [] } = {}) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-diff-'));
  const targetRoot = path.join(fixtureRoot, 'target');
  fs.mkdirSync(targetRoot);
  const slices = REGISTRY_LIFECYCLE_SLICES.map((slice) => {
    const builtinRoot = path.join(fixtureRoot, 'builtin', slice.sliceId);
    fs.cpSync(slice.builtinRoot, builtinRoot, { recursive: true });
    return { ...slice, builtinRoot };
  });

  try {
    initCustomRegistrySet({ targetRoot, validatorVersion: '0.0.0-test', slices });
    const withExtras = slices.map((slice) => ({
      ...slice,
      inventory: [...slice.inventory, ...extraRegistries.filter((extra) => extra.sliceId === slice.sliceId).map((extra) => extra.entry)],
    }));
    const paths = resolveRegistryLifecyclePaths({ targetRoot });
    const builtinFile = (registryId) => {
      const [sliceId, name] = registryId.split('/');
      return path.join(fixtureRoot, 'builtin', sliceId, `${name}.registry.json`);
    };
    const customFile = (registryId) => {
      const [sliceId, name] = registryId.split('/');
      return path.join(paths.customRoot, sliceId, `${name}.registry.json`);
    };
    const diff = (options = {}) => buildRegistryLifecycleDiff({ targetRoot, slices: withExtras, ...options });
    return run({ targetRoot, paths, slices: withExtras, builtinFile, customFile, diff });
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
};

const registryOf = (result, registryId) => result.registries.find((registry) => registry.registryId === registryId);
const entryClasses = (registry) => Object.fromEntries((registry?.entries ?? []).map((entry) => [entry.address, entry.class]));

// ---- comparison identity declarations ---------------------------------------------------------

test('every inventory registry declares comparison identity that fully covers its Builtin payload', () => {
  assert.equal(inventoryEntries.length, 26);
  for (const { slice, entry } of inventoryEntries) {
    const payload = readJson(path.join(slice.builtinRoot, entry.fileName));
    const entries = extractComparisonEntries(payload, entry);

    assert.ok(entries.size > 0, entry.registryId);
    const addresses = [...entries.keys()];
    assert.deepEqual(addresses, [...addresses].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)), entry.registryId);
  }
});

test('identity is declared separately from canonicalization, including where nothing is set-like', () => {
  const declarations = Object.fromEntries(inventoryEntries.map(({ entry }) => [entry.registryId, entry.comparison]));

  assert.deepEqual(declarations['naming/case-rules'], [{ kind: 'value', path: 'semanticName' }]);
  assert.deepEqual(declarations['naming/finding-policy'], [{ kind: 'value', path: 'outcomes.*' }]);
  assert.deepEqual(declarations['naming/special-cases'], [{ kind: 'value', path: 'specialCases' }]);
  assert.deepEqual(declarations['suite/exit-policy'], [{ kind: 'keyed', path: 'policies', key: 'id', ordered: true }]);
  assert.deepEqual(declarations['naming/missing-role-patterns'], [
    { kind: 'keyed', path: 'missingRolePatterns', key: 'patternId', ordered: true },
  ]);
  assert.deepEqual(declarations['suite/scope-profiles'], [{ kind: 'value', path: 'profiles.*' }]);
});

// ---- extraction ---------------------------------------------------------------------------------

test('extraction addresses every kind deterministically and ignores formatting and set-like order', () => {
  const roles = entryOf('naming/roles');
  const payload = { version: '1', roles: [{ role: 'b', status: 'active', definition: 'B' }, { role: 'a', status: 'active', definition: 'A' }] };
  const reordered = { roles: [...payload.roles].reverse(), version: '1' };

  assert.deepEqual([...extractComparisonEntries(payload, roles).keys()], ['roles[role="a"]', 'roles[role="b"]']);
  assert.deepEqual([...extractComparisonEntries(payload, roles)], [...extractComparisonEntries(reordered, roles)]);

  const perspective = entryOf('naming/category-role-perspective');
  const perspectiveEntries = extractComparisonEntries(
    { version: '1', rolesByCategory: { 'concern-core': [{ role: 'logic', agnosticCoreMeanings: ['behavior'] }], 'build-system': [] } },
    perspective,
  );
  assert.deepEqual([...perspectiveEntries.keys()], [
    'rolesByCategory["build-system"]',
    'rolesByCategory["concern-core"]',
    'rolesByCategory["concern-core"][role="logic"]',
  ]);

  const missingRolePatterns = entryOf('naming/missing-role-patterns');
  const ordered = extractComparisonEntries(
    {
      version: '1',
      missingRolePatterns: [
        { patternId: 'second', dotSegments: 2, semanticSegmentIndex: 0, extensionSegmentIndexes: [1] },
        { patternId: 'first', dotSegments: 3, semanticSegmentIndex: 0, extensionSegmentIndexes: [2, 1] },
      ],
    },
    missingRolePatterns,
  );
  assert.deepEqual(ordered.get('missingRolePatterns#order'), ['second', 'first']);
  assert.deepEqual(ordered.get('missingRolePatterns[patternId="first"]').extensionSegmentIndexes, [1, 2]);

  const walkExclusions = extractComparisonEntries(
    { version: '2', excludedDirectories: ['b', 'a'], skipDotDirectories: true },
    entryOf('naming/walk-exclusions'),
  );
  assert.deepEqual([...walkExclusions.keys()], ['excludedDirectories["a"]', 'excludedDirectories["b"]', 'skipDotDirectories']);
});

test('extraction refuses an uncovered field, a duplicate key and a malformed collection', () => {
  const roles = entryOf('naming/roles');
  assert.throws(
    () => extractComparisonEntries({ version: '1', roles: [], extra: true }, roles),
    (error) => error instanceof ComparisonExtractionError && /"extra" is not covered/u.test(error.message),
  );
  assert.throws(
    () => extractComparisonEntries({ version: '1', roles: [{ role: 'a' }, { role: 'a', status: 'x' }] }, roles),
    (error) => error instanceof ComparisonExtractionError && /occurs twice/u.test(error.message),
  );
  assert.throws(
    () => extractComparisonEntries({ version: '1', roles: { role: 'a' } }, roles),
    (error) => error instanceof ComparisonExtractionError && /must be an array/u.test(error.message),
  );
  assert.throws(
    () => extractComparisonEntries({ version: '1' }, { ...roles, comparison: [{ kind: 'keyed', path: '*.x', key: 'k' }] }),
    /malformed comparison collection/u,
  );
  assert.throws(
    () =>
      extractComparisonEntries(
        { version: '1', a: [] },
        { ...roles, descriptor: {}, comparison: [{ kind: 'members', path: 'a' }, { kind: 'value', path: 'a' }] },
      ),
    /covered by more than one/u,
  );
});

test('classifyEntry follows the three-way table of spec §8.2', () => {
  const cases = [
    [1, 1, 1, null],
    [undefined, undefined, undefined, null],
    [undefined, 1, undefined, ENTRY_CLASSES.builtinAdded],
    [1, 2, 1, ENTRY_CLASSES.builtinChanged],
    [1, undefined, 1, ENTRY_CLASSES.builtinRemoved],
    [1, 1, 2, ENTRY_CLASSES.customOnly],
    [undefined, undefined, 1, ENTRY_CLASSES.customOnly],
    [1, 1, undefined, ENTRY_CLASSES.customOnly],
    [1, 2, 2, ENTRY_CLASSES.aligned],
    [1, undefined, undefined, ENTRY_CLASSES.aligned],
    [undefined, 1, 1, ENTRY_CLASSES.aligned],
    [1, 2, 3, ENTRY_CLASSES.bothChanged],
    [1, undefined, 2, ENTRY_CLASSES.bothChanged],
    [undefined, 1, 2, ENTRY_CLASSES.bothChanged],
  ];

  for (const [baseline, builtin, custom, expected] of cases) {
    assert.equal(classifyEntry(baseline, builtin, custom), expected, JSON.stringify([baseline, builtin, custom]));
  }
  // Values compare by canonical content, not identity or key order.
  assert.equal(classifyEntry({ a: 1, b: 2 }, { b: 2, a: 1 }, { a: 1, b: 2 }), null);
});

// ---- diff -----------------------------------------------------------------------------------------

test('a fresh Custom set is unchanged everywhere, and diff writes nothing', () => {
  withDiffFixture(({ paths, diff }) => {
    const snapshot = () =>
      fs
        .readdirSync(paths.lifecycleRoot, { recursive: true })
        .sort()
        .map((relativePath) => {
          const filePath = path.join(paths.lifecycleRoot, relativePath);
          return [relativePath, fs.statSync(filePath).isFile() ? fs.readFileSync(filePath, 'base64') : null];
        });
    const before = snapshot();

    const result = diff();
    assert.equal(result.customExists, true);
    assert.deepEqual(result.counts, { registries: { unchanged: 26 }, entries: {} });
    assert.ok(result.registries.every((registry) => registry.class === 'unchanged' && registry.entries === undefined));
    assert.deepEqual(snapshot(), before);
    assert.deepEqual(diff(), result, 'deterministic');
  });
});

test('every entry class is reported with its three values', () => {
  withDiffFixture(({ builtinFile, customFile, diff }) => {
    // naming/roles: Builtin adds, changes and removes roles; Custom changes one only it touches.
    const roleById = (payload, role) => payload.roles.find((entry) => entry.role === role);
    const builtinRoles = readJson(builtinFile('naming/roles'));
    const [first, second, third, fourth, fifth] = builtinRoles.roles.map((entry) => entry.role);
    updateJson(builtinFile('naming/roles'), (payload) => ({
      ...payload,
      roles: [
        ...payload.roles
          .filter((entry) => entry.role !== third)
          .map((entry) =>
            entry.role === first
              ? { ...entry, definition: 'Builtin wording.' }
              : entry.role === fourth || entry.role === fifth
                ? { ...entry, definition: 'Shared wording.' }
                : entry,
          ),
        { role: 'zz-new-role', status: 'active', definition: 'Added by Builtin.' },
      ],
    }));
    updateJson(customFile('naming/roles'), (payload) => ({
      ...payload,
      roles: payload.roles.map((entry) =>
        entry.role === second
          ? { ...entry, definition: 'Custom wording.' }
          : entry.role === fourth
            ? { ...entry, definition: 'Shared wording.' }
            : entry.role === fifth
              ? { ...entry, definition: 'Other Custom wording.' }
              : entry,
      ),
    }));

    const roles = registryOf(diff({ registryIds: ['naming/roles'] }), 'naming/roles');
    assert.equal(roles.class, 'differs');
    assert.deepEqual(entryClasses(roles), {
      [`roles[role="${first}"]`]: 'builtin-changed',
      [`roles[role="${second}"]`]: 'custom-only',
      [`roles[role="${third}"]`]: 'builtin-removed',
      [`roles[role="${fourth}"]`]: 'aligned',
      [`roles[role="${fifth}"]`]: 'both-changed',
      'roles[role="zz-new-role"]': 'builtin-added',
    });
    assert.deepEqual(roles.counts, {
      aligned: 1,
      'both-changed': 1,
      'builtin-added': 1,
      'builtin-changed': 1,
      'builtin-removed': 1,
      'custom-only': 1,
    });

    const fifthEntry = roles.entries.find((entry) => entry.address === `roles[role="${fifth}"]`);
    assert.deepEqual(fifthEntry.baseline, roleById(builtinRoles, fifth));
    assert.equal(fifthEntry.builtin.definition, 'Shared wording.');
    assert.equal(fifthEntry.custom.definition, 'Other Custom wording.');
    const addedEntry = roles.entries.find((entry) => entry.address === 'roles[role="zz-new-role"]');
    assert.deepEqual(Object.keys(addedEntry).sort(), ['address', 'builtin', 'class']);
  });
});

test('order, membership and group presence differences are addressed', () => {
  withDiffFixture(({ customFile, diff }) => {
    updateJson(customFile('naming/missing-role-patterns'), (payload) => ({
      ...payload,
      missingRolePatterns: [...payload.missingRolePatterns].reverse(),
    }));
    updateJson(customFile('naming/reportable-extensions'), (payload) => ({
      ...payload,
      reportableExtensions: [...payload.reportableExtensions, '.py'],
    }));
    const categories = readJson(customFile('naming/categories')).categories.map((entry) => entry.category);
    const perspective = readJson(customFile('naming/category-role-perspective'));
    const unusedCategory = categories.find((category) => !Object.hasOwn(perspective.rolesByCategory, category));
    updateJson(customFile('naming/category-role-perspective'), (payload) => ({
      ...payload,
      rolesByCategory: { ...payload.rolesByCategory, [unusedCategory]: [] },
    }));

    const result = diff();
    assert.deepEqual(entryClasses(registryOf(result, 'naming/missing-role-patterns')), {
      'missingRolePatterns#order': 'custom-only',
    });
    assert.deepEqual(entryClasses(registryOf(result, 'naming/reportable-extensions')), {
      'reportableExtensions[".py"]': 'custom-only',
    });
    assert.deepEqual(entryClasses(registryOf(result, 'naming/category-role-perspective')), {
      [`rolesByCategory[${JSON.stringify(unusedCategory)}]`]: 'custom-only',
    });
  });
});

test('a registry added by a later Builtin is registry-added with its entries as builtin-added', () => {
  const newRegistry = {
    sliceId: 'naming',
    entry: Object.freeze({
      registryId: 'naming/new-thing',
      name: 'new-thing',
      fileName: 'new-thing.registry.json',
      readableVersions: ['1'],
      descriptor: { setLike: [{ path: 'items' }] },
      comparison: [{ kind: 'members', path: 'items' }],
    }),
  };

  withDiffFixture(
    ({ builtinFile, diff }) => {
      writeJson(builtinFile('naming/new-thing'), { version: '1', items: ['b', 'a'] });
      const added = registryOf(diff(), 'naming/new-thing');

      assert.equal(added.class, 'registry-added');
      assert.deepEqual(added.entries, [
        { address: 'items["a"]', class: 'builtin-added', builtin: 'a' },
        { address: 'items["b"]', class: 'builtin-added', builtin: 'b' },
      ]);
    },
    { extraRegistries: [newRegistry] },
  );
});

test('version-changed, not-comparable and orphan registries are not compared', () => {
  withDiffFixture(({ paths, builtinFile, customFile, diff }) => {
    updateJson(builtinFile('tree/folder-kinds'), (payload) => ({ ...payload, version: '2' }));
    updateJson(path.join(paths.baselineRoot, 'tree', 'structural-homes.registry.json'), (payload) => ({ ...payload, tampered: true }));
    fs.writeFileSync(customFile('naming/roles'), '{ broken');
    fs.rmSync(customFile('naming/case-rules'));
    writeJson(path.join(paths.customRoot, 'tree', 'retired-thing.registry.json'), { version: '1' });

    const result = diff();
    assert.deepEqual(registryOf(result, 'tree/folder-kinds'), {
      registryId: 'tree/folder-kinds',
      class: 'version-changed',
      detail: { baselineVersion: '1', builtinVersion: '2' },
    });
    assert.deepEqual(registryOf(result, 'tree/structural-homes'), {
      registryId: 'tree/structural-homes',
      class: 'not-comparable',
      reason: 'baseline-mismatch',
    });
    assert.equal(registryOf(result, 'naming/roles').class, 'not-comparable');
    assert.equal(registryOf(result, 'naming/roles').reason, 'invalid');
    assert.equal(registryOf(result, 'naming/case-rules').reason, 'missing');
    assert.deepEqual(registryOf(result, 'tree/retired-thing'), { registryId: 'tree/retired-thing', class: 'orphan' });
    assert.ok(result.registries.every((registry) => DIFF_REGISTRY_CLASSES.includes(registry.class)));
  });
});

test('a malformed manifest leaves no trusted Baseline for any registry', () => {
  withDiffFixture(({ paths, diff }) => {
    fs.writeFileSync(paths.manifestPath, '{ broken');
    const result = diff();

    assert.match(result.manifestError, /unreadable/u);
    assert.deepEqual(result.counts.registries, { 'not-comparable': 26 });
    assert.ok(result.registries.every((registry) => registry.reason === 'baseline-unavailable'));
  });
});

test('diff can be restricted to registry ids and rejects an unknown id', () => {
  withDiffFixture(({ diff }) => {
    assert.deepEqual(
      diff({ registryIds: ['suite/exit-policy', 'naming/roles'] }).registries.map((registry) => registry.registryId),
      ['naming/roles', 'suite/exit-policy'],
    );
    assert.throws(() => diff({ registryIds: ['naming/nope'] }), /Unknown registry id\(s\): naming\/nope\./u);
  });
});

test('without a Custom set diff reports only the set-level facts', () => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-diff-empty-'));
  try {
    assert.deepEqual(buildRegistryLifecycleDiff({ targetRoot }), {
      activeSet: 'builtin',
      customExists: false,
      counts: {},
      registries: [],
    });
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
});
