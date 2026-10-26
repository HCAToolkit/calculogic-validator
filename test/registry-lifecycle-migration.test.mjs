import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REGISTRY_LIFECYCLE_SLICES } from '../src/core/registry-lifecycle/registry-lifecycle-inventory.knowledge.mjs';
import { digestRegistryPayload } from '../src/core/registry-lifecycle/registry-lifecycle-canonical-digest.logic.mjs';
import { initCustomRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-init.logic.mjs';
import {
  assertMigrationDeclaration,
  descriptorForPayload,
  migrationPath,
  runMigrationPath,
} from '../src/core/registry-lifecycle/registry-lifecycle-migration.logic.mjs';
import {
  buildRegistryMigrationPlan,
  checkRegistryMigrationPlan,
} from '../src/core/registry-lifecycle/registry-lifecycle-migration-plan.logic.mjs';
import { SLICE_MIGRATION_TRANSFORMS } from '../src/core/registry-lifecycle/registry-lifecycle-slice-migrations.logic.mjs';
import { buildRegistryLifecycleStatus } from '../src/core/registry-lifecycle/registry-lifecycle-status.logic.mjs';
import { resolveRegistryLifecyclePaths } from '../src/core/registry-lifecycle/registry-lifecycle-state.logic.mjs';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

// A synthetic suite registry that changes shape. Version "1" keys items by `name` and has `label`
// and `legacy`; version "2" keys them by `id`, renames `label` to `title`, drops `legacy` and
// requires `status`; version "3" renames `title` to `heading`. The descriptors differ, so a
// version-"1" payload is canonicalized differently under the version-"2" descriptor.
const REGISTRY_ID = 'suite/migrating-thing';
const ITEM = (key) => `items[id=${JSON.stringify(key)}]`;
const V1_DESCRIPTOR = Object.freeze({ setLike: [{ path: 'items', key: 'name' }] });
const V2_DESCRIPTOR = Object.freeze({ setLike: [{ path: 'items', key: 'id' }] });
const defineThing = ({ readableVersions, descriptor, key, migrations = [] }) =>
  Object.freeze({
    registryId: REGISTRY_ID,
    name: 'migrating-thing',
    fileName: 'migrating-thing.registry.json',
    readableVersions,
    descriptor,
    comparison: [{ kind: 'keyed', path: 'items', key }],
    reconciliation: [],
    migrations,
  });
const THING_V1 = defineThing({ readableVersions: ['1'], descriptor: V1_DESCRIPTOR, key: 'name' });
const STEP_1_TO_2 = Object.freeze({ from: '1', to: '2', transform: 'thing-1-to-2', fromDescriptor: V1_DESCRIPTOR });
const STEP_2_TO_3 = Object.freeze({ from: '2', to: '3', transform: 'thing-2-to-3', fromDescriptor: V2_DESCRIPTOR });
const THING_V2 = defineThing({ readableVersions: ['2'], descriptor: V2_DESCRIPTOR, key: 'id', migrations: [STEP_1_TO_2] });
const THING_V3 = defineThing({
  readableVersions: ['3'],
  descriptor: V2_DESCRIPTOR,
  key: 'id',
  migrations: [STEP_1_TO_2, STEP_2_TO_3],
});

// The slice-owned transforms. `status` is required in version "2"; its default is the transform's
// decision, never a Builtin value. Tree keeps its real transforms, so its real inventory declaration
// (semantic-home-policy) stays backed.
const TRANSFORMS = Object.freeze({
  tree: SLICE_MIGRATION_TRANSFORMS.tree,
  suite: Object.freeze({
    'thing-1-to-2': (payload) => ({
      version: '2',
      items: payload.items.map((item) => ({ id: item.name, title: item.label, status: 'active' })),
    }),
    'thing-2-to-3': (payload) => ({
      version: '3',
      items: payload.items.map(({ title, ...rest }) => ({ ...rest, heading: title })),
    }),
  }),
});

// Items listed out of key order, with labels in the opposite order, so the two descriptors sort them
// differently.
const B0 = Object.freeze({
  version: '1',
  items: [
    { name: 'b', label: 'Alpha', legacy: 'y' },
    { name: 'a', label: 'Bravo', legacy: 'x' },
  ],
});
const migrateV1 = (payload) => TRANSFORMS.suite['thing-1-to-2'](payload);
const B0_MIGRATED = migrateV1(B0);

const withSuiteEntry = (slices, entry) =>
  slices.map((slice) =>
    slice.sliceId === 'suite'
      ? { ...slice, inventory: [...slice.inventory.filter((item) => item.registryId !== REGISTRY_ID), entry] }
      : slice,
  );

// A target root whose Custom set was initialized while `suite/migrating-thing` was at version "1"
// (Baseline and Custom equal to B0), with private Builtin roots. `release(entry, builtinPayload)`
// emulates a later release: it writes the new Builtin file and returns the inventory that knows the
// new declaration.
const withMigrationFixture = (run) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-migration-'));
  const targetRoot = path.join(fixtureRoot, 'target');
  fs.mkdirSync(targetRoot);
  const builtinSlices = REGISTRY_LIFECYCLE_SLICES.map((slice) => {
    const builtinRoot = path.join(fixtureRoot, 'builtin', slice.sliceId);
    fs.cpSync(slice.builtinRoot, builtinRoot, { recursive: true });
    return { ...slice, builtinRoot };
  });
  const builtinFile = path.join(fixtureRoot, 'builtin', 'suite', THING_V1.fileName);
  writeJson(builtinFile, B0);

  try {
    initCustomRegistrySet({ targetRoot, validatorVersion: '0.0.0-test', slices: withSuiteEntry(builtinSlices, THING_V1) });
    const paths = resolveRegistryLifecyclePaths({ targetRoot });
    const release = (entry, builtinPayload) => {
      writeJson(builtinFile, builtinPayload);
      return withSuiteEntry(builtinSlices, entry);
    };
    return run({
      targetRoot,
      paths,
      release,
      customFile: path.join(paths.customRoot, 'suite', THING_V1.fileName),
      baselineFile: path.join(paths.baselineRoot, 'suite', THING_V1.fileName),
      plan: (slices, options = {}) =>
        buildRegistryMigrationPlan({ targetRoot, slices, migrationTransforms: TRANSFORMS, ...options }),
      check: (slices, document, options = {}) =>
        checkRegistryMigrationPlan({ document, targetRoot, slices, migrationTransforms: TRANSFORMS, ...options }),
    });
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
};

const recordOf = (plan) => plan.registries.find((record) => record.registryId === REGISTRY_ID);
const accept = (plan) => ({
  ...plan,
  registries: plan.registries.map((record) => ({ ...record, decision: 'accept' })),
});
const problemsOf = (result) => result.problems.map(({ registryId, problem }) => [registryId, problem]);
const snapshotTree = (root) =>
  fs
    .readdirSync(root, { recursive: true })
    .sort()
    .map((relativePath) => {
      const filePath = path.join(root, relativePath);
      return [relativePath, fs.statSync(filePath).isFile() ? fs.readFileSync(filePath, 'base64') : null];
    });

test('the only declared migration is tree/semantic-home-policy 1 → 2, backed by the only slice transform', () => {
  for (const slice of REGISTRY_LIFECYCLE_SLICES) {
    const transforms = SLICE_MIGRATION_TRANSFORMS[slice.sliceId];
    assert.deepEqual(Object.keys(transforms), slice.sliceId === 'tree' ? ['semantic-home-policy-v1-to-v2'] : [], slice.sliceId);
    for (const entry of slice.inventory) {
      assertMigrationDeclaration(entry, transforms);
      assert.ok(Object.isFrozen(entry.migrations), entry.registryId);
      assert.ok(Object.isFrozen(entry.readableVersions), entry.registryId);
      if (entry.registryId === 'tree/semantic-home-policy') {
        assert.deepEqual(
          entry.migrations.map(({ from, to, transform }) => ({ from, to, transform })),
          [{ from: '1', to: '2', transform: 'semantic-home-policy-v1-to-v2' }],
        );
        assert.deepEqual(entry.readableVersions, ['1', '2']);
      } else {
        assert.deepEqual(entry.migrations, [], entry.registryId);
        assert.deepEqual(entry.readableVersions, ['1'], entry.registryId);
      }
    }
  }
});

test('a migration declaration that is ambiguous, cyclic, incomplete or unbacked is a programming error', () => {
  const transforms = { t12: () => ({}), t23: () => ({}), t21: () => ({}), t13: () => ({}) };
  const step = (from, to, transform) => ({ from, to, transform, fromDescriptor: {} });
  const declare = (readableVersions, ...migrations) => () =>
    assertMigrationDeclaration({ registryId: 'test/thing', readableVersions, migrations }, transforms);

  assert.doesNotThrow(declare(['2'], step('1', '2', 't12')));
  assert.doesNotThrow(declare(['3'], step('1', '2', 't12'), step('2', '3', 't23')));
  // A readable version may also be migrated from.
  assert.doesNotThrow(declare(['2', '3'], step('2', '3', 't23')));
  for (const [label, run, pattern] of [
    ['an ambiguous path', declare(['2', '3'], step('1', '2', 't12'), step('1', '3', 't13')), /more than one step leaves version "1"/u],
    ['a cycle', declare(['3'], step('1', '2', 't12'), step('2', '1', 't21')), /form a cycle/u],
    ['a missing intermediate step', declare(['3'], step('1', '2', 't12')), /ends at version "2", which is not readable/u],
    ['a target the engine cannot read', declare(['1'], step('2', '3', 't23')), /ends at version "3", which is not readable/u],
    ['an unknown transform', declare(['2'], step('1', '2', 'nope')), /names transform "nope", which the slice does not provide/u],
    ['an inherited transform name', declare(['2'], step('1', '2', 'toString')), /does not provide/u],
    ['the same version twice', declare(['1'], step('1', '1', 't12')), /two different non-empty version strings/u],
    ['an empty version', declare(['2'], step('', '2', 't12')), /two different non-empty version strings/u],
    ['a padded version', declare(['2'], step(' 1', '2', 't12')), /without surrounding whitespace/u],
    ['a padded target version', declare([' 2'], step('1', ' 2', 't12')), /without surrounding whitespace/u],
    ['a padded transform id', () => assertMigrationDeclaration({ registryId: 'test/thing', readableVersions: ['2'], migrations: [step('1', '2', ' t12 ')] }, { ' t12 ': () => ({}) }), /non-empty transform id without surrounding whitespace/u],
    ['a whitespace-only transform id', () => assertMigrationDeclaration({ registryId: 'test/thing', readableVersions: ['2'], migrations: [step('1', '2', ' ')] }, { ' ': () => ({}) }), /non-empty transform id without surrounding whitespace/u],
    ['no descriptor', declare(['2'], { from: '1', to: '2', transform: 't12', fromDescriptor: null }), /needs the canonical-form descriptor/u],
    ['an unknown field', declare(['2'], { ...step('1', '2', 't12'), defaults: {} }), /and nothing else/u],
    ['a missing field', declare(['2'], { from: '1', to: '2', transform: 't12' }), /and nothing else/u],
  ]) {
    assert.throws(run, pattern, label);
  }
  assert.throws(
    () => assertMigrationDeclaration({ registryId: 'test/thing', readableVersions: ['1'], migrations: {} }, transforms),
    /must be a list/u,
  );
});

test('the plan refuses an invalid declaration in any inventory entry before reading anything', () => {
  withMigrationFixture(({ release, plan, check }) => {
    const slices = release(defineThing({ ...THING_V2, key: 'id', migrations: [STEP_1_TO_2, { ...STEP_1_TO_2, to: '3' }] }), B0_MIGRATED);
    assert.throws(() => plan(slices), /more than one step leaves version "1"/u);
    assert.throws(() => check(slices, { kind: 'x' }), /more than one step leaves version "1"/u);
    // A transform the slice does not provide.
    assert.throws(
      () => plan(release(THING_V2, B0_MIGRATED), { migrationTransforms: { tree: SLICE_MIGRATION_TRANSFORMS.tree } }),
      /names transform "thing-1-to-2", which the slice does not provide/u,
    );
  });
});

test('descriptorForPayload, migrationPath and runMigrationPath follow the declaration only', () => {
  assert.equal(descriptorForPayload(THING_V3, { version: '1' }), V1_DESCRIPTOR);
  assert.equal(descriptorForPayload(THING_V3, { version: '2' }), V2_DESCRIPTOR);
  assert.equal(descriptorForPayload(THING_V3, { version: '3' }), THING_V3.descriptor);
  assert.equal(descriptorForPayload(THING_V3, null), THING_V3.descriptor);

  assert.deepEqual(migrationPath(THING_V3, '1', '3'), [STEP_1_TO_2, STEP_2_TO_3]);
  assert.deepEqual(migrationPath(THING_V3, '1', '2'), [STEP_1_TO_2], 'the path stops at the target version');
  assert.deepEqual(migrationPath(THING_V3, '2', '3'), [STEP_2_TO_3]);
  assert.equal(migrationPath(THING_V3, '0', '3'), null);
  assert.equal(migrationPath(THING_V3, '1', '4'), null);
  assert.equal(migrationPath(THING_V3, '3', '3'), null);

  const run = (transform) => runMigrationPath([STEP_1_TO_2], { 'thing-1-to-2': transform }, B0);
  assert.deepEqual(run(migrateV1), { payload: B0_MIGRATED });
  for (const [label, transform, pattern] of [
    ['a throw', () => { throw new Error('boom'); }, /the transform threw: boom/u],
    ['a mutation of its input', (payload) => { payload.items.push({}); return payload; }, /the transform threw: .*not extensible|read only/u],
    ['a wrong version', (payload) => ({ ...migrateV1(payload), version: '3' }), /returned version "3", not "2"/u],
    ['no version', ({ version, ...rest }) => rest, /returned version null, not "2"/u],
    ['a function', (payload) => ({ ...migrateV1(payload), extra: () => 1 }), /a value of type function at \$\["extra"\]/u],
    ['undefined', (payload) => ({ ...migrateV1(payload), extra: undefined }), /a value of type undefined at \$\["extra"\]/u],
    ['a non-finite number', (payload) => ({ ...migrateV1(payload), extra: [Number.NaN] }), /a non-finite number at \$\["extra"\]\[0\]/u],
    ['a class instance', (payload) => ({ ...migrateV1(payload), extra: new Date(0) }), /a non-plain object/u],
    ['an array', () => [], /did not return an object/u],
  ]) {
    assert.match(run(transform).failure?.detail ?? '', pattern, label);
  }
  const cyclic = {};
  cyclic.self = cyclic;
  assert.match(run(() => ({ version: '2', cyclic })).failure.detail, /a cycle at \$\["cyclic"\]\["self"\]/u);
  assert.equal(B0.items.length, 2, 'the input is never changed');
});

test('a shape-only change leaves no drift: B0′ equals the new Builtin, and the Baseline is migrated, not replaced', () => {
  withMigrationFixture(({ release, plan, check, targetRoot }) => {
    const slices = release(THING_V2, B0_MIGRATED);
    // The old-version copy is verified with its own version's descriptor.
    const statusEntry = buildRegistryLifecycleStatus({ targetRoot, slices }).registries.find((entry) => entry.registryId === REGISTRY_ID);
    assert.equal(statusEntry.baselineMismatch, false);
    assert.equal(statusEntry.customDigest, digestRegistryPayload(B0, V1_DESCRIPTOR));

    const document = plan(slices);
    assert.deepEqual(document.notMigratable, []);
    assert.deepEqual(document.registries.map((record) => record.registryId), [REGISTRY_ID]);
    const record = recordOf(document);
    assert.deepEqual(record, {
      registryId: REGISTRY_ID,
      fromVersion: '1',
      toVersion: '2',
      path: [{ from: '1', to: '2', transform: 'thing-1-to-2' }],
      basedOn: {
        baselineDigest: digestRegistryPayload(B0, V1_DESCRIPTOR),
        builtinDigest: digestRegistryPayload(B0_MIGRATED, V2_DESCRIPTOR),
        customDigest: digestRegistryPayload(B0, V1_DESCRIPTOR),
      },
      result: {
        baselineDigest: digestRegistryPayload(B0_MIGRATED, V2_DESCRIPTOR),
        customDigest: digestRegistryPayload(B0_MIGRATED, V2_DESCRIPTOR),
      },
      preview: { class: 'unchanged', counts: {}, entries: [], baseline: B0_MIGRATED, custom: B0_MIGRATED },
      decision: null,
    });
    assert.equal(record.result.baselineDigest, record.basedOn.builtinDigest, 'no drift after a shape-only change');
    assert.deepEqual(plan(slices), document, 'deterministic');

    assert.deepEqual(check(slices, document), {
      valid: true,
      complete: false,
      problems: [],
      registries: [{ registryId: REGISTRY_ID, fromVersion: '1', toVersion: '2', accepted: false }],
    });
    assert.deepEqual(check(slices, accept(document)), {
      valid: true,
      complete: true,
      problems: [],
      registries: [{ registryId: REGISTRY_ID, fromVersion: '1', toVersion: '2', accepted: true }],
    });
    // The informative parts are ignored.
    assert.equal(check(slices, { ...document, notMigratable: 'ignored', registries: [{ ...record, preview: 7 }] }).valid, true);
    const { preview, ...withoutPreview } = record;
    const { notMigratable, ...withoutNotMigratable } = document;
    assert.equal(check(slices, { ...withoutNotMigratable, registries: [withoutPreview] }).valid, true);
  });
});

test('a Builtin content change that ships with the shape change stays a content change for a later update', () => {
  withMigrationFixture(({ release, plan }) => {
    const b1 = {
      version: '2',
      items: [
        { id: 'a', title: 'Bravo (renamed upstream)', status: 'active' },
        { id: 'b', title: 'Alpha', status: 'active' },
        { id: 'c', title: 'Charlie', status: 'active' },
      ],
    };
    const record = recordOf(plan(release(THING_V2, b1)));
    assert.deepEqual(record.preview.baseline, B0_MIGRATED, 'B0′ comes from the Baseline copy, never from Builtin');
    assert.notEqual(record.result.baselineDigest, record.basedOn.builtinDigest, 'the Baseline does not advance to Builtin');
    assert.equal(record.preview.class, 'differs');
    assert.deepEqual(record.preview.counts, { 'builtin-added': 1, 'builtin-changed': 1 });
    assert.deepEqual(record.preview.entries, [
      {
        address: ITEM('a'),
        class: 'builtin-changed',
        baseline: { id: 'a', title: 'Bravo', status: 'active' },
        builtin: { id: 'a', title: 'Bravo (renamed upstream)', status: 'active' },
        custom: { id: 'a', title: 'Bravo', status: 'active' },
      },
      { address: ITEM('c'), class: 'builtin-added', builtin: { id: 'c', title: 'Charlie', status: 'active' } },
    ]);
  });
});

test('a Custom-only change survives the migration as custom-only; one the shape change removes does not', () => {
  withMigrationFixture(({ release, plan, customFile }) => {
    writeJson(customFile, {
      version: '1',
      items: [
        { name: 'b', label: 'My alpha', legacy: 'y' },
        { name: 'a', label: 'Bravo', legacy: 'my legacy' },
        { name: 'z', label: 'Mine', legacy: '' },
      ],
    });
    const record = recordOf(plan(release(THING_V2, B0_MIGRATED)));
    assert.deepEqual(record.preview.custom, {
      version: '2',
      items: [
        { id: 'b', title: 'My alpha', status: 'active' },
        { id: 'a', title: 'Bravo', status: 'active' },
        { id: 'z', title: 'Mine', status: 'active' },
      ],
    });
    // Renamed and dropped fields: no `name`, `label` or `legacy` remains, and the `legacy` edit on
    // `a` disappears with the field.
    assert.deepEqual(record.preview.entries, [
      { address: ITEM('b'), class: 'custom-only', baseline: { id: 'b', title: 'Alpha', status: 'active' }, builtin: { id: 'b', title: 'Alpha', status: 'active' }, custom: { id: 'b', title: 'My alpha', status: 'active' } },
      { address: ITEM('z'), class: 'custom-only', custom: { id: 'z', title: 'Mine', status: 'active' } },
    ]);
  });
});

test('Builtin and Custom both changed before the transition: the difference stays both-changed', () => {
  withMigrationFixture(({ release, plan, customFile }) => {
    writeJson(customFile, { ...B0, items: [{ name: 'b', label: 'Alpha', legacy: 'y' }, { name: 'a', label: 'Mine', legacy: 'x' }] });
    const b1 = { version: '2', items: [{ id: 'a', title: 'Theirs', status: 'active' }, { id: 'b', title: 'Alpha', status: 'active' }] };
    const record = recordOf(plan(release(THING_V2, b1)));
    assert.deepEqual(record.preview.entries, [
      {
        address: ITEM('a'),
        class: 'both-changed',
        baseline: { id: 'a', title: 'Bravo', status: 'active' },
        builtin: { id: 'a', title: 'Theirs', status: 'active' },
        custom: { id: 'a', title: 'Mine', status: 'active' },
      },
    ]);
  });
});

test('a required new field takes the slice-owned default, never the Builtin value', () => {
  withMigrationFixture(({ release, plan }) => {
    const b1 = { version: '2', items: [{ id: 'a', title: 'Bravo', status: 'deprecated' }, { id: 'b', title: 'Alpha', status: 'active' }] };
    const record = recordOf(plan(release(THING_V2, b1)));
    assert.deepEqual(record.preview.custom.items.map((item) => item.status), ['active', 'active']);
    assert.deepEqual(record.preview.baseline.items.map((item) => item.status), ['active', 'active']);
    assert.deepEqual(record.preview.entries.map((entry) => [entry.address, entry.class, entry.custom.status]), [
      [ITEM('a'), 'builtin-changed', 'active'],
    ]);
  });
});

test('a chain 1 → 2 → 3 runs every step in order, on the Baseline and on Custom', () => {
  withMigrationFixture(({ release, plan, check, customFile }) => {
    writeJson(customFile, { ...B0, items: [...B0.items, { name: 'z', label: 'Mine', legacy: '' }] });
    const b1 = TRANSFORMS.suite['thing-2-to-3'](B0_MIGRATED);
    const slices = release(THING_V3, b1);
    const document = plan(slices);
    const record = recordOf(document);
    assert.deepEqual([record.fromVersion, record.toVersion, record.path], [
      '1',
      '3',
      [
        { from: '1', to: '2', transform: 'thing-1-to-2' },
        { from: '2', to: '3', transform: 'thing-2-to-3' },
      ],
    ]);
    assert.deepEqual(record.preview.baseline, b1);
    assert.deepEqual(record.preview.custom.items.at(-1), { id: 'z', status: 'active', heading: 'Mine' });
    assert.deepEqual(record.preview.entries.map((entry) => [entry.address, entry.class]), [[ITEM('z'), 'custom-only']]);
    assert.equal(check(slices, accept(document)).complete, true);
  });
});

test('a registry without a path, or whose inputs cannot be migrated, is listed as not migratable', () => {
  const cases = [
    ['no step at all', ({ release }) => release({ ...THING_V2, migrations: [] }), 'no-migration-path', /from version "1" to version "2"/u],
    [
      'a missing intermediate step',
      ({ release }) =>
        release(
          defineThing({
            readableVersions: ['2', '4'],
            descriptor: V2_DESCRIPTOR,
            key: 'id',
            migrations: [STEP_1_TO_2, { from: '3', to: '4', transform: 'thing-2-to-3', fromDescriptor: V2_DESCRIPTOR }],
          }),
          { version: '4', items: [] },
        ),
      'no-migration-path',
      /from version "1" to version "4"/u,
    ],
    [
      'a .baseline copy that does not match its manifest digest',
      ({ release, baselineFile }) => {
        writeJson(baselineFile, { ...B0, items: [] });
        return release(THING_V2);
      },
      'baseline-mismatch',
      /does not match its manifest digest/u,
    ],
    ['a missing Custom registry', ({ release, customFile }) => (fs.rmSync(customFile), release(THING_V2)), 'missing', /Absent/u],
    [
      'an unparseable Custom registry',
      ({ release, customFile }) => (fs.writeFileSync(customFile, '{ broken'), release(THING_V2)),
      'invalid',
      /JSON/u,
    ],
    [
      'a Custom registry at another version',
      ({ release, customFile }) => (writeJson(customFile, B0_MIGRATED), release(THING_V2)),
      'custom-version-mismatch',
      /Custom registry is at version "2", the Baseline at "1"/u,
    ],
    [
      'a transform that fails on Custom only',
      ({ release, customFile }) => (writeJson(customFile, { ...B0, items: [...B0.items, { name: 'z' }] }), release(THING_V2)),
      'transform-failed',
      /The Custom input: step "1" → "2" \(transform "thing-1-to-2"\): the transform returned a value of type undefined at \$\["items"\]\[2\]\["title"\]/u,
    ],
    [
      'a migrated payload without valid comparison entries',
      ({ release, customFile }) => (writeJson(customFile, { ...B0, items: [...B0.items, { name: 'a', label: 'Twice' }] }), release(THING_V2)),
      'transform-failed',
      /The migrated Custom payload has no valid comparison entries/u,
    ],
  ];
  for (const [label, arrange, reason, pattern] of cases) {
    withMigrationFixture((fixture) => {
      const slices = arrange({ ...fixture, release: (entry, payload = B0_MIGRATED) => fixture.release(entry, payload) });
      const document = fixture.plan(slices);
      assert.deepEqual(document.registries, [], label);
      assert.deepEqual(document.notMigratable.map((item) => [item.registryId, item.reason]), [[REGISTRY_ID, reason]], label);
      assert.match(document.notMigratable[0].detail, pattern, label);
    });
  }
  // A transform that fails on the Baseline is reported for the Baseline.
  withMigrationFixture(({ release, plan }) => {
    const failing = { ...TRANSFORMS, suite: { ...TRANSFORMS.suite, 'thing-1-to-2': () => { throw new Error('boom'); } } };
    const document = plan(release(THING_V2, B0_MIGRATED), { migrationTransforms: failing });
    assert.match(document.notMigratable[0].detail, /^The Baseline input: .*the transform threw: boom$/u);
  });
});

test('a Baseline copy at a version this release has no descriptor for is unverifiable, not mismatched', () => {
  withMigrationFixture(({ release, targetRoot }) => {
    const status = buildRegistryLifecycleStatus({ targetRoot, slices: release({ ...THING_V2, migrations: [] }, B0_MIGRATED) });
    const statusEntry = status.registries.find((entry) => entry.registryId === REGISTRY_ID);
    assert.equal(statusEntry.baselineMismatch, null);
    assert.equal(statusEntry.classification, 'version-incompatible');
    assert.deepEqual(
      status.customIssues.filter((issue) => issue.registryId === REGISTRY_ID).map((issue) => issue.condition),
      ['version-incompatible'],
    );
  });
});

test('migrate-check: a plan made before a Baseline, Custom, Builtin, path or transform change is stale', () => {
  withMigrationFixture(({ release, plan, check, paths, customFile, baselineFile }) => {
    const slices = release(THING_V2, B0_MIGRATED);
    const document = accept(plan(slices));
    const staleDetail = (result) => {
      assert.deepEqual(problemsOf(result), [[REGISTRY_ID, 'stale']]);
      assert.equal(result.valid, false);
      assert.deepEqual(result.registries, []);
      return result.problems[0].detail;
    };

    // Transforms that produce another result from the same inputs and path.
    const changedTransforms = {
      ...TRANSFORMS,
      suite: { ...TRANSFORMS.suite, 'thing-1-to-2': (payload) => ({ ...migrateV1(payload), items: migrateV1(payload).items.map((item) => ({ ...item, status: 'draft' })) }) },
    };
    assert.match(staleDetail(check(slices, document, { migrationTransforms: changedTransforms })), /: result \(the migration transforms now produce another payload\)/u);

    // The same function under another id is another path.
    const renamed = { ...THING_V2, migrations: [{ ...STEP_1_TO_2, transform: 'thing-1-to-2-renamed' }] };
    const renamedTransforms = { ...TRANSFORMS, suite: { 'thing-1-to-2-renamed': TRANSFORMS.suite['thing-1-to-2'] } };
    assert.equal(staleDetail(check(release(renamed, B0_MIGRATED), document, { migrationTransforms: renamedTransforms })), 'Changed since the plan was made: path.');

    release(THING_V2, { ...B0_MIGRATED, items: [...B0_MIGRATED.items, { id: 'c', title: 'Charlie', status: 'active' }] });
    assert.equal(staleDetail(check(slices, document)), 'Changed since the plan was made: builtin.');
    release(THING_V2, B0_MIGRATED);
    assert.equal(check(slices, document).valid, true);

    writeJson(customFile, { ...B0, items: [B0.items[0]] });
    assert.equal(staleDetail(check(slices, document)), 'Changed since the plan was made: custom.');
    writeJson(customFile, B0);

    // A Baseline that changed consistently (copy and manifest digest), as an earlier update would.
    const changedBaseline = { ...B0, items: [B0.items[1]] };
    writeJson(baselineFile, changedBaseline);
    const manifest = readJson(paths.manifestPath);
    manifest.basedOn.registries[REGISTRY_ID].digest = digestRegistryPayload(changedBaseline, V1_DESCRIPTOR);
    writeJson(paths.manifestPath, manifest);
    assert.equal(staleDetail(check(slices, document)), 'Changed since the plan was made: baseline.');
    writeJson(customFile, { ...B0, items: [B0.items[0]] });
    assert.equal(staleDetail(check(slices, document)), 'Changed since the plan was made: baseline, custom.');
  });
});

test('migrate-check reports malformed, unknown, duplicate, not-migratable and unsupported records, one problem each', () => {
  withMigrationFixture(({ release, plan, check }) => {
    const slices = release(THING_V2, B0_MIGRATED);
    const document = plan(slices);
    const record = recordOf(document);

    for (const malformed of [
      null,
      [],
      { ...document, kind: 'calculogic-registry-update-decisions' },
      { ...document, schemaVersion: '2' },
      { ...document, registries: {} },
      JSON.parse('{"kind":"calculogic-registry-migration-plan","schemaVersion":"1","registries":[],"__proto__":{}}'),
    ]) {
      assert.deepEqual(problemsOf(check(slices, malformed)), [[null, 'malformed']], JSON.stringify(malformed));
    }

    const result = check(slices, {
      ...document,
      registries: [
        { ...record, decision: 'yes' },
        { ...record, decision: 'accept' },
        { registryId: '__proto__' },
        { registryId: 'suite/exit-policy', ...Object.fromEntries(Object.entries(record).filter(([field]) => field !== 'registryId')) },
        { ...record, registryId: 'naming/roles', path: [{ from: '1', to: '2' }] },
        { ...record, registryId: 'naming/categories', extra: true },
        { ...record, registryId: 'tree/folder-kinds', basedOn: { ...record.basedOn, more: null } },
        { ...record, registryId: 'tree/structural-homes', result: { baselineDigest: null, customDigest: 'x' } },
        { registryId: 7 },
      ],
    });
    assert.deepEqual(problemsOf(result), [
      [null, 'malformed'],
      ['__proto__', 'unknown-registry'],
      ['naming/categories', 'malformed'],
      ['naming/roles', 'malformed'],
      ['suite/exit-policy', 'not-migratable'],
      [REGISTRY_ID, 'duplicate-registry'],
      [REGISTRY_ID, 'unsupported-decision'],
      ['tree/folder-kinds', 'malformed'],
      ['tree/structural-homes', 'malformed'],
    ]);
    assert.equal(result.problems.find((item) => item.registryId === 'suite/exit-policy').detail, 'Its current diff class is unchanged; there is nothing to migrate.');
    assert.equal(result.problems.find((item) => item.registryId === 'naming/categories').detail, 'Unexpected field(s): extra.');
    assert.deepEqual(result.registries, []);
    assert.equal(result.complete, false);
  });

  // A record for a registry that has since become unmigratable names the reason.
  withMigrationFixture(({ release, plan, check, customFile }) => {
    const slices = release(THING_V2, B0_MIGRATED);
    const document = plan(slices);
    fs.rmSync(customFile);
    const result = check(slices, document);
    assert.deepEqual(problemsOf(result), [[REGISTRY_ID, 'not-migratable']]);
    assert.equal(result.problems[0].detail, 'It cannot be migrated now (missing): Absent from the Custom set.');
  });
});

test('migrate-plan and migrate-check never read or change the active set and write nothing', () => {
  withMigrationFixture(({ release, plan, check, paths, targetRoot }) => {
    const slices = release(THING_V2, B0_MIGRATED);
    fs.writeFileSync(paths.statePath, '{ not json');
    const before = snapshotTree(path.join(targetRoot, '.calculogic'));

    const document = plan(slices);
    assert.equal(recordOf(document).registryId, REGISTRY_ID);
    assert.equal(check(slices, accept(document)).complete, true);
    assert.equal(Object.hasOwn(document, 'activeSet'), false);
    assert.deepEqual(snapshotTree(path.join(targetRoot, '.calculogic')), before);
  });
});

test('migrate-plan and migrate-check need a Custom set and restrict by registry id like diff', () => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-migration-empty-'));
  try {
    assert.throws(() => buildRegistryMigrationPlan({ targetRoot }), /No Custom registry set exists/u);
    assert.throws(() => checkRegistryMigrationPlan({ document: {}, targetRoot }), /No Custom registry set exists/u);
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }

  withMigrationFixture(({ release, plan }) => {
    const slices = release(THING_V2, B0_MIGRATED);
    assert.deepEqual(plan(slices, { registryIds: ['naming/roles'] }).registries, []);
    assert.deepEqual(recordOf(plan(slices, { registryIds: [REGISTRY_ID] })).registryId, REGISTRY_ID);
    assert.throws(() => plan(slices, { registryIds: ['naming/nope'] }), /Unknown registry id\(s\): naming\/nope\./u);
  });
});
