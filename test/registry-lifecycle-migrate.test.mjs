import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REGISTRY_LIFECYCLE_SLICES } from '../src/core/registry-lifecycle/registry-lifecycle-inventory.knowledge.mjs';
import { digestRegistryPayload } from '../src/core/registry-lifecycle/registry-lifecycle-canonical-digest.logic.mjs';
import { initCustomRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-init.logic.mjs';
import { applyRegistryMigrationPlan } from '../src/core/registry-lifecycle/registry-lifecycle-migrate.logic.mjs';
import { buildRegistryMigrationPlan } from '../src/core/registry-lifecycle/registry-lifecycle-migration-plan.logic.mjs';
import { buildRegistryLifecycleDiff } from '../src/core/registry-lifecycle/registry-lifecycle-diff.logic.mjs';
import { buildRegistryUpdateDecisionsTemplate } from '../src/core/registry-lifecycle/registry-lifecycle-decisions.logic.mjs';
import { applyRegistryUpdateDecisions } from '../src/core/registry-lifecycle/registry-lifecycle-update.logic.mjs';
import { buildRegistryLifecycleStatus } from '../src/core/registry-lifecycle/registry-lifecycle-status.logic.mjs';
import { validateSliceRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-slice-validation.logic.mjs';
import { LIFECYCLE_TRANSACTION_SIMULATED_CRASH } from '../src/core/registry-lifecycle/registry-lifecycle-transaction.logic.mjs';
import {
  readRegistrySetManifest,
  resolveRegistryLifecyclePaths,
} from '../src/core/registry-lifecycle/registry-lifecycle-state.logic.mjs';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};
const serialize = (payload) => `${JSON.stringify(payload, null, 2)}\n`;

// Synthetic registries that change shape, as in test/registry-lifecycle-migration.test.mjs: version
// "1" keys items by `name` with `label` and `legacy`; version "2" keys them by `id`, renames `label`
// to `title`, drops `legacy` and requires `status` (default "active"); version "3" renames `title`
// to `heading`.
const V1_DESCRIPTOR = Object.freeze({ setLike: [{ path: 'items', key: 'name' }] });
const V2_DESCRIPTOR = Object.freeze({ setLike: [{ path: 'items', key: 'id' }] });
const STEP_1_TO_2 = Object.freeze({ from: '1', to: '2', transform: 'thing-1-to-2', fromDescriptor: V1_DESCRIPTOR });
const STEP_2_TO_3 = Object.freeze({ from: '2', to: '3', transform: 'thing-2-to-3', fromDescriptor: V2_DESCRIPTOR });
const VERSIONS = Object.freeze({
  1: { readableVersions: ['1'], descriptor: V1_DESCRIPTOR, key: 'name', migrations: [] },
  2: { readableVersions: ['2'], descriptor: V2_DESCRIPTOR, key: 'id', migrations: [STEP_1_TO_2] },
  3: { readableVersions: ['3'], descriptor: V2_DESCRIPTOR, key: 'id', migrations: [STEP_1_TO_2, STEP_2_TO_3] },
});
const defineThing = (registryId, version) => {
  const { readableVersions, descriptor, key, migrations } = VERSIONS[version];
  const name = registryId.split('/')[1];
  return Object.freeze({
    registryId,
    name,
    fileName: `${name}.registry.json`,
    readableVersions,
    descriptor,
    comparison: [{ kind: 'keyed', path: 'items', key }],
    reconciliation: [],
    migrations,
  });
};

const migrate1to2 = (payload) => ({
  version: '2',
  items: payload.items.map((item) => ({ id: item.name, title: item.label, status: 'active' })),
});
const migrate2to3 = (payload) => ({ version: '3', items: payload.items.map(({ title, ...rest }) => ({ ...rest, heading: title })) });
const SLICE_TRANSFORMS = Object.freeze({ 'thing-1-to-2': migrate1to2, 'thing-2-to-3': migrate2to3 });
const TRANSFORMS = Object.freeze({ suite: SLICE_TRANSFORMS, tree: SLICE_TRANSFORMS });

const B0 = Object.freeze({
  version: '1',
  items: [
    { name: 'b', label: 'Alpha', legacy: 'y' },
    { name: 'a', label: 'Bravo', legacy: 'x' },
  ],
});
const B0_V2 = migrate1to2(B0);
const B0_V3 = migrate2to3(B0_V2);
const SHAPE_ONLY = Object.freeze({ 1: B0, 2: B0_V2, 3: B0_V3 });

const THING_A = 'suite/thing-a';
const THING_B = 'suite/thing-b';
const THING_T = 'tree/thing-t';
const ALL_THINGS = [THING_A, THING_B, THING_T];
const sliceOf = (registryId) => registryId.split('/')[0];
const ITEM = (key) => `items[id=${JSON.stringify(key)}]`;

// Delegates to the real slice validation, and adds one synthetic rule: the two suite things must be
// at the same version, as two registries that reference each other would be.
const pairedValidation = (sliceId, root) => {
  const failures = [...validateSliceRegistrySet(sliceId, root)];
  if (sliceId === 'suite') {
    const versionOf = (name) => {
      const filePath = path.join(root, `${name}.registry.json`);
      return fs.existsSync(filePath) ? readJson(filePath).version : null;
    };
    if (versionOf('thing-a') !== versionOf('thing-b')) {
      failures.push({ registryId: THING_B, detail: 'thing-a and thing-b must be at one version.' });
    }
  }
  return failures;
};

// A target root initialized while every thing was at version "1" (Baseline and Custom equal to
// B0), with private Builtin roots. `release(versions, builtins)` emulates a later release: it
// writes each thing's new Builtin file (shape-only by default) and returns the inventory that
// declares the new versions.
const withMigrateFixture = (run) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-migrate-'));
  const targetRoot = path.join(fixtureRoot, 'target');
  fs.mkdirSync(targetRoot);
  const builtinSlices = REGISTRY_LIFECYCLE_SLICES.map((slice) => {
    const builtinRoot = path.join(fixtureRoot, 'builtin', slice.sliceId);
    fs.cpSync(slice.builtinRoot, builtinRoot, { recursive: true });
    return { ...slice, builtinRoot };
  });
  const builtinFile = (registryId) => path.join(fixtureRoot, 'builtin', sliceOf(registryId), `${registryId.split('/')[1]}.registry.json`);
  const slicesAt = (versions) =>
    builtinSlices.map((slice) => ({
      ...slice,
      inventory: [
        ...slice.inventory,
        ...ALL_THINGS.filter((registryId) => sliceOf(registryId) === slice.sliceId).map((registryId) =>
          defineThing(registryId, versions[registryId] ?? '1'),
        ),
      ],
    }));
  for (const registryId of ALL_THINGS) {
    writeJson(builtinFile(registryId), B0);
  }

  try {
    initCustomRegistrySet({ targetRoot, validatorVersion: '0.0.0-test', slices: slicesAt({}) });
    const paths = resolveRegistryLifecyclePaths({ targetRoot });
    const fileIn = (root) => (registryId) => path.join(root, sliceOf(registryId), `${registryId.split('/')[1]}.registry.json`);
    const release = (versions, builtins = {}) => {
      for (const [registryId, version] of Object.entries(versions)) {
        writeJson(builtinFile(registryId), builtins[registryId] ?? SHAPE_ONLY[version]);
      }
      return slicesAt(versions);
    };
    return run({
      targetRoot,
      paths,
      release,
      builtinFile,
      customFile: fileIn(paths.customRoot),
      baselineFile: fileIn(paths.baselineRoot),
      plan: (slices, options = {}) => buildRegistryMigrationPlan({ targetRoot, slices, migrationTransforms: TRANSFORMS, ...options }),
      migrate: (slices, document, options = {}) =>
        applyRegistryMigrationPlan({
          loadDocument: () => structuredClone(document),
          targetRoot,
          slices,
          migrationTransforms: TRANSFORMS,
          validateSlice: pairedValidation,
          ...options,
        }),
      status: (slices) => buildRegistryLifecycleStatus({ targetRoot, slices }),
      diff: (slices) => buildRegistryLifecycleDiff({ targetRoot, slices }),
      template: (slices) => buildRegistryUpdateDecisionsTemplate({ targetRoot, slices }),
      update: (slices, document, options = {}) =>
        applyRegistryUpdateDecisions({ loadDocument: () => document, targetRoot, slices, validatorVersion: '0.0.1-test', ...options }),
    });
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
};

const accept = (document, registryIds = document.registries.map((record) => record.registryId)) => ({
  ...document,
  registries: document.registries.map((record) => (registryIds.includes(record.registryId) ? { ...record, decision: 'accept' } : record)),
});
const registryOf = (output, registryId) => output.registries.find((registry) => registry.registryId === registryId);
const snapshotTree = (root) =>
  fs
    .readdirSync(root, { recursive: true })
    .sort()
    .map((relativePath) => {
      const filePath = path.join(root, relativePath);
      return [relativePath, fs.statSync(filePath).isFile() ? fs.readFileSync(filePath, 'base64') : null];
    });
const injectAt = (boundary) => (step) => {
  if (step === boundary) {
    throw new Error(`injected at ${boundary}`);
  }
};

test('an accepted migration writes B0′, C0′ and the manifest entry together, and diff then sees an ordinary registry', () => {
  withMigrateFixture(({ release, plan, migrate, paths, baselineFile, customFile, status, diff }) => {
    const slices = release({ [THING_T]: '2' });
    const document = accept(plan(slices));
    assert.equal(registryOf(diff(slices), THING_T).class, 'version-changed');
    const otherFilesBefore = snapshotTree(paths.lifecycleRoot).filter(([relativePath]) => !relativePath.includes('thing-t') && !relativePath.endsWith('manifest.json'));
    const manifestBefore = readJson(paths.manifestPath);

    // The preview is informative: the written payloads are computed again, never copied from it.
    const tampered = structuredClone(document);
    tampered.registries[0].preview = { baseline: { forged: true }, custom: { forged: true } };
    assert.deepEqual(migrate(slices, tampered), { applied: [THING_T], skipped: [] });

    assert.equal(fs.readFileSync(baselineFile(THING_T), 'utf8'), serialize(B0_V2));
    assert.equal(fs.readFileSync(customFile(THING_T), 'utf8'), serialize(B0_V2));
    const manifest = readJson(paths.manifestPath);
    assert.deepEqual(manifest.basedOn.registries[THING_T], {
      validatorVersion: '0.0.0-test',
      version: '2',
      digest: digestRegistryPayload(B0_V2, V2_DESCRIPTOR),
      migration: { fromVersion: '1', fromDigest: manifestBefore.basedOn.registries[THING_T].digest, path: ['thing-1-to-2'] },
    });
    assert.deepEqual(
      { ...manifest, basedOn: { registries: { ...manifest.basedOn.registries, [THING_T]: null } } },
      { ...manifestBefore, basedOn: { registries: { ...manifestBefore.basedOn.registries, [THING_T]: null } } },
      'no other manifest entry or field changes',
    );
    assert.deepEqual(
      snapshotTree(paths.lifecycleRoot).filter(([relativePath]) => !relativePath.includes('thing-t') && !relativePath.endsWith('manifest.json')),
      otherFilesBefore,
    );

    // Shape-only: no drift, nothing left to migrate, the provenance does not affect classification.
    assert.equal(registryOf(diff(slices), THING_T).class, 'unchanged');
    assert.deepEqual(
      [registryOf(status(slices), THING_T).classification, registryOf(status(slices), THING_T).baselineMismatch],
      ['unchanged', false],
    );
    assert.deepEqual(plan(slices).registries, []);
    assert.deepEqual(
      migrate(slices, document).problems.map((item) => [item.registryId, item.problem]),
      [[THING_T, 'not-migratable']],
      'an applied plan is not applied twice',
    );
  });
});

test('after a migration, Builtin content changes stay offered, Custom-only and both-changed entries keep their class', () => {
  withMigrateFixture(({ release, plan, migrate, baselineFile, customFile, diff, template }) => {
    writeJson(customFile(THING_T), {
      version: '1',
      items: [
        { name: 'b', label: 'Mine', legacy: 'y' },
        { name: 'a', label: 'Mine too', legacy: 'x' },
        { name: 'z', label: 'Only mine', legacy: '' },
      ],
    });
    const b1 = {
      version: '2',
      items: [
        { id: 'a', title: 'Theirs', status: 'active' },
        { id: 'b', title: 'Alpha', status: 'active' },
        { id: 'c', title: 'Charlie', status: 'active' },
      ],
    };
    const slices = release({ [THING_T]: '2' }, { [THING_T]: b1 });
    assert.deepEqual(migrate(slices, accept(plan(slices))).applied, [THING_T]);

    assert.deepEqual(readJson(baselineFile(THING_T)), B0_V2, 'B0′ comes from the Baseline copy, never from Builtin');
    const registry = registryOf(diff(slices), THING_T);
    assert.equal(registry.class, 'differs');
    assert.deepEqual(
      registry.entries.map((entry) => [entry.address, entry.class]),
      [
        [ITEM('a'), 'both-changed'],
        [ITEM('b'), 'custom-only'],
        [ITEM('c'), 'builtin-added'],
        [ITEM('z'), 'custom-only'],
      ],
    );
    assert.deepEqual(
      registryOf(template(slices), THING_T).entries.map((entry) => [entry.address, entry.class, entry.decision]),
      [
        [ITEM('a'), 'both-changed', null],
        [ITEM('c'), 'builtin-added', null],
      ],
    );
    assert.deepEqual(readJson(customFile(THING_T)).items.find((item) => item.id === 'z'), { id: 'z', title: 'Only mine', status: 'active' });
  });
});

test('a later update reconciles the migrated registry and drops the migration provenance', () => {
  withMigrateFixture(({ release, plan, migrate, paths, template, update, diff, builtinFile, customFile }) => {
    const b1 = { ...B0_V2, items: [...B0_V2.items, { id: 'c', title: 'Charlie', status: 'active' }] };
    const slices = release({ [THING_T]: '2' }, { [THING_T]: b1 });
    migrate(slices, accept(plan(slices)));
    assert.ok(readJson(paths.manifestPath).basedOn.registries[THING_T].migration);

    const decisions = template(slices);
    for (const entry of registryOf(decisions, THING_T).entries) {
      entry.decision = 'take-builtin';
    }
    const result = update(slices, { ...decisions, registries: [registryOf(decisions, THING_T)] });
    assert.deepEqual(result.applied, [THING_T]);
    assert.deepEqual(readJson(paths.manifestPath).basedOn.registries[THING_T], {
      validatorVersion: '0.0.1-test',
      version: '2',
      digest: digestRegistryPayload(b1, V2_DESCRIPTOR),
    });
    assert.deepEqual(readJson(customFile(THING_T)), b1);
    assert.equal(fs.readFileSync(builtinFile(THING_T), 'utf8'), fs.readFileSync(path.join(paths.baselineRoot, 'tree', 'thing-t.registry.json'), 'utf8'));
    assert.equal(registryOf(diff(slices), THING_T).class, 'unchanged');
  });
});

test('a repeated migration appends its path to the original provenance', () => {
  withMigrateFixture(({ release, plan, migrate, paths, baselineFile, customFile, diff }) => {
    const originalDigest = readJson(paths.manifestPath).basedOn.registries[THING_T].digest;
    const atTwo = release({ [THING_T]: '2' });
    migrate(atTwo, accept(plan(atTwo)));

    const atThree = release({ [THING_T]: '3' });
    const record = plan(atThree).registries[0];
    assert.deepEqual([record.fromVersion, record.toVersion, record.path.map((step) => step.transform)], ['2', '3', ['thing-2-to-3']]);
    assert.deepEqual(migrate(atThree, accept(plan(atThree))).applied, [THING_T]);
    assert.deepEqual(readJson(paths.manifestPath).basedOn.registries[THING_T], {
      validatorVersion: '0.0.0-test',
      version: '3',
      digest: digestRegistryPayload(B0_V3, V2_DESCRIPTOR),
      migration: { fromVersion: '1', fromDigest: originalDigest, path: ['thing-1-to-2', 'thing-2-to-3'] },
    });
    assert.deepEqual([readJson(baselineFile(THING_T)), readJson(customFile(THING_T))], [B0_V3, B0_V3]);
    assert.equal(registryOf(diff(atThree), THING_T).class, 'unchanged');
  });
});

test('several accepted migrations of one slice validate together and commit in one transaction', () => {
  withMigrateFixture(({ release, plan, migrate, baselineFile, customFile }) => {
    const slices = release({ [THING_A]: '2', [THING_B]: '2' });
    let transactions = 0;
    const result = migrate(slices, accept(plan(slices)), { onTransactionStep: (step) => (transactions += step === 'staged' ? 1 : 0) });
    assert.deepEqual(result, { applied: [THING_A, THING_B], skipped: [] });
    assert.equal(transactions, 1);
    for (const registryId of [THING_A, THING_B]) {
      assert.deepEqual([readJson(baselineFile(registryId)), readJson(customFile(registryId))], [B0_V2, B0_V2]);
    }
  });
});

test('an accepted migration valid only together with an undecided one is refused for the slice, and the partner is never pulled in', () => {
  withMigrateFixture(({ release, plan, migrate, paths }) => {
    const slices = release({ [THING_A]: '2', [THING_B]: '2' });
    const before = snapshotTree(paths.lifecycleRoot);
    const result = migrate(slices, accept(plan(slices), [THING_A]));
    assert.deepEqual(result.applied, []);
    assert.deepEqual(result.skipped, [{ registryId: THING_B, reason: 'undecided' }]);
    assert.deepEqual([result.failed.sliceId, result.failed.registryIds], ['suite', [THING_A]]);
    assert.match(result.failed.detail, /suite registry-set validation fails with the migrated registries \(suite\/thing-a\): suite\/thing-b: thing-a and thing-b must be at one version\./u);
    assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);
  });
});

test('slice validation gates the migrated Custom image, never the migrated Baseline', () => {
  // A slice rule that rejects any item "a".
  const rejectA = (sliceId, root) => {
    const filePath = path.join(root, 'thing-t.registry.json');
    return sliceId === 'tree' && fs.existsSync(filePath) && readJson(filePath).items.some((item) => (item.id ?? item.name) === 'a')
      ? [{ registryId: THING_T, detail: 'item "a" is not allowed.' }]
      : [];
  };
  withMigrateFixture(({ release, plan, migrate, paths, customFile, baselineFile }) => {
    // Custom dropped "a"; the Baseline, and so B0′, still has it.
    writeJson(customFile(THING_T), { ...B0, items: [B0.items[0]] });
    const slices = release({ [THING_T]: '2' });
    assert.deepEqual(migrate(slices, accept(plan(slices)), { validateSlice: rejectA }).applied, [THING_T]);
    assert.deepEqual(readJson(baselineFile(THING_T)), B0_V2);
    assert.ok(readJson(paths.manifestPath).basedOn.registries[THING_T].migration);
  });
  withMigrateFixture(({ release, plan, migrate, paths }) => {
    // The Custom file keeps "a": the migrated Custom set would be invalid. The current one already
    // fails the same way, so a rule that rejects C0′ only is needed to show the refusal.
    const rejectMigratedA = (sliceId, root) =>
      rejectA(sliceId, root).filter(() => readJson(path.join(root, 'thing-t.registry.json')).version === '2');
    const slices = release({ [THING_T]: '2' });
    const before = snapshotTree(paths.lifecycleRoot);
    let staged = false;
    const result = migrate(slices, accept(plan(slices)), {
      validateSlice: rejectMigratedA,
      onTransactionStep: (step) => (staged ||= step === 'staged'),
    });
    assert.deepEqual([result.applied, result.failed.registryIds], [[], [THING_T]]);
    assert.match(result.failed.detail, /tree\/thing-t: item "a" is not allowed\./u);
    assert.equal(staged, false, 'refused before the transaction is staged');
    assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);
  });
});

test('a failure at any step of a slice transaction migrates none of its registries', () => {
  // Two Baseline copies, two Custom files and the manifest, all pre-existing (spec §4.6).
  const boundaries = [
    'staged',
    'journaled',
    'directories-created',
    ...[0, 1, 2, 3].flatMap((index) => [`step-${index}:backed-up`, `step-${index}:applied`]),
    'step-4:backed-up',
  ];
  for (const boundary of boundaries) {
    withMigrateFixture(({ release, plan, migrate, paths }) => {
      const slices = release({ [THING_A]: '2', [THING_B]: '2' });
      const document = accept(plan(slices));
      const before = snapshotTree(paths.lifecycleRoot);
      const result = migrate(slices, document, { onTransactionStep: injectAt(boundary) });
      assert.deepEqual(result.applied, [], boundary);
      assert.deepEqual(result.failed, { sliceId: 'suite', registryIds: [THING_A, THING_B], detail: `injected at ${boundary}` }, boundary);
      assert.deepEqual(snapshotTree(paths.lifecycleRoot), before, boundary);
    });
  }
});

test('the manifest is written last: a crash after both payloads leaves the old entry, and the next run recovers and applies', () => {
  withMigrateFixture(({ release, plan, migrate, paths, status }) => {
    const slices = release({ [THING_T]: '2' });
    const document = accept(plan(slices));
    const entryBefore = readJson(paths.manifestPath).basedOn.registries[THING_T];
    const crash = (step) => {
      if (step === 'step-1:applied') {
        throw Object.assign(new Error('crash'), { [LIFECYCLE_TRANSACTION_SIMULATED_CRASH]: true });
      }
    };
    assert.throws(() => migrate(slices, document, { onTransactionStep: crash }), /crash/u);
    assert.deepEqual(readJson(paths.manifestPath).basedOn.registries[THING_T], entryBefore);
    assert.notEqual(registryOf(status(slices), THING_T).classification, 'unchanged');

    const rerun = migrate(slices, document);
    assert.deepEqual(rerun, { recovered: { outcome: 'rolled-back' }, applied: [THING_T], skipped: [] });
    assert.equal(registryOf(status(slices), THING_T).classification, 'unchanged');
  });
});

test('across slices, a committed slice stays migrated when a later slice fails', () => {
  withMigrateFixture(({ release, plan, migrate, paths, customFile }) => {
    const slices = release({ [THING_A]: '2', [THING_B]: '2', [THING_T]: '2' });
    const treeBefore = snapshotTree(paths.lifecycleRoot).filter(([relativePath]) => relativePath.includes('thing-t'));
    let transactions = 0;
    const result = migrate(slices, accept(plan(slices)), {
      onTransactionStep: (step) => {
        transactions += step === 'staged' ? 1 : 0;
        if (transactions === 2 && step === 'step-1:applied') {
          throw new Error('injected in the tree slice');
        }
      },
    });
    assert.deepEqual(result.applied, [THING_A, THING_B]);
    assert.deepEqual(result.failed, { sliceId: 'tree', registryIds: [THING_T], detail: 'injected in the tree slice' });
    assert.deepEqual(readJson(customFile(THING_A)), B0_V2);
    assert.equal(readJson(paths.manifestPath).basedOn.registries[THING_A].version, '2');
    assert.equal(readJson(paths.manifestPath).basedOn.registries[THING_T].version, '1');
    assert.deepEqual(snapshotTree(paths.lifecycleRoot).filter(([relativePath]) => relativePath.includes('thing-t')), treeBefore);
  });
});

test('a plan that went stale is refused before anything is written', () => {
  const cases = [
    ['Builtin', ({ builtinFile }) => writeJson(builtinFile(THING_T), { ...B0_V2, items: [] }), /builtin/u],
    ['Custom', ({ customFile }) => writeJson(customFile(THING_T), { ...B0, items: [] }), /custom/u],
    [
      'the Baseline (copy and manifest changed consistently)',
      ({ baselineFile, paths }) => {
        const changed = { ...B0, items: [B0.items[0]] };
        writeJson(baselineFile(THING_T), changed);
        const manifest = readJson(paths.manifestPath);
        manifest.basedOn.registries[THING_T].digest = digestRegistryPayload(changed, V1_DESCRIPTOR);
        writeJson(paths.manifestPath, manifest);
      },
      /baseline/u,
    ],
  ];
  for (const [label, alter, pattern] of cases) {
    withMigrateFixture((fixture) => {
      const slices = fixture.release({ [THING_T]: '2' });
      const document = accept(fixture.plan(slices));
      alter(fixture);
      const before = snapshotTree(fixture.paths.lifecycleRoot);
      const result = fixture.migrate(slices, document);
      assert.deepEqual(result.problems.map((item) => item.problem), ['stale'], label);
      assert.match(result.problems[0].detail, pattern, label);
      assert.deepEqual(result.applied, [], label);
      assert.deepEqual(snapshotTree(fixture.paths.lifecycleRoot), before, label);
    });
  }

  withMigrateFixture(({ release, plan, migrate, paths }) => {
    const slices = release({ [THING_T]: '2' });
    const document = accept(plan(slices));
    const before = snapshotTree(paths.lifecycleRoot);
    // Another declared path, and transforms that now produce another result.
    const renamed = slices.map((slice) => ({
      ...slice,
      inventory: slice.inventory.map((entry) =>
        entry.registryId === THING_T ? { ...entry, migrations: [{ ...STEP_1_TO_2, transform: 'thing-1-to-2-renamed' }] } : entry,
      ),
    }));
    const renamedTransforms = { ...TRANSFORMS, tree: { ...SLICE_TRANSFORMS, 'thing-1-to-2-renamed': migrate1to2 } };
    assert.match(migrate(renamed, document, { migrationTransforms: renamedTransforms }).problems[0].detail, /: path\./u);
    const drafted = { ...TRANSFORMS, tree: { ...SLICE_TRANSFORMS, 'thing-1-to-2': (payload) => ({ ...migrate1to2(payload), items: [] }) } };
    assert.match(migrate(slices, document, { migrationTransforms: drafted }).problems[0].detail, /: result/u);
    assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);
  });
});

test('inputs or transform results that change after the check are refused when the slice is prepared', () => {
  withMigrateFixture(({ release, plan, migrate, paths, customFile }) => {
    const slices = release({ [THING_A]: '2', [THING_B]: '2', [THING_T]: '2' });
    const document = accept(plan(slices));
    // The tree transform behaves differently once the suite slice has committed.
    let drifted = false;
    const transforms = {
      ...TRANSFORMS,
      tree: { ...SLICE_TRANSFORMS, 'thing-1-to-2': (payload) => (drifted ? { ...migrate1to2(payload), items: [] } : migrate1to2(payload)) },
    };
    const treeBefore = snapshotTree(paths.lifecycleRoot).filter(([relativePath]) => relativePath.includes('thing-t'));
    const result = migrate(slices, document, {
      migrationTransforms: transforms,
      onTransactionStep: (step) => (drifted ||= step === 'committed'),
    });
    assert.deepEqual(result.applied, [THING_A, THING_B]);
    assert.equal(result.failed.sliceId, 'tree');
    assert.match(result.failed.detail, /tree\/thing-t: the migrated Baseline payload does not have the digest the migration plan accepted/u);
    assert.deepEqual(snapshotTree(paths.lifecycleRoot).filter(([relativePath]) => relativePath.includes('thing-t')), treeBefore);

    // A Custom file changed after the check is refused the same way.
    writeJson(customFile(THING_T), { ...B0, items: [] });
    const freshSlices = slices;
    const second = migrate(freshSlices, document, {
      migrationTransforms: TRANSFORMS,
      onTransactionStep: () => {},
    });
    assert.deepEqual(second.problems.map((item) => [item.registryId, item.problem]), [
      [THING_A, 'not-migratable'],
      [THING_B, 'not-migratable'],
      [THING_T, 'stale'],
    ]);
  });
});

test('a manifest entry changed after the check is refused when its slice is prepared', () => {
  withMigrateFixture(({ release, plan, migrate, paths }) => {
    const slices = release({ [THING_A]: '2', [THING_B]: '2', [THING_T]: '2' });
    // During the suite slice's commit, the tree thing's manifest entry changes its version, which no
    // file digest covers.
    let changed = false;
    const result = migrate(slices, accept(plan(slices)), {
      onTransactionStep: (step) => {
        if (step === 'committed' && !changed) {
          changed = true;
          const manifest = readJson(paths.manifestPath);
          manifest.basedOn.registries[THING_T].version = '0';
          writeJson(paths.manifestPath, manifest);
        }
      },
    });
    assert.deepEqual(result.applied, [THING_A, THING_B]);
    assert.equal(result.failed.sliceId, 'tree');
    assert.match(result.failed.detail, /tree\/thing-t: the manifest Baseline entry is not the one the migration plan was made against/u);
    assert.equal(readJson(paths.manifestPath).basedOn.registries[THING_T].version, '0');
  });
});

test('only "accept" selects a record: undecided records are skipped and nothing is written for them', () => {
  withMigrateFixture(({ release, plan, migrate, paths }) => {
    const slices = release({ [THING_T]: '2' });
    const before = snapshotTree(paths.lifecycleRoot);
    assert.deepEqual(migrate(slices, plan(slices)), { applied: [], skipped: [{ registryId: THING_T, reason: 'undecided' }] });
    assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);
  });
});

test('the manifest reader accepts exactly the migration provenance shape', () => {
  withMigrateFixture(({ paths, release, plan, migrate }) => {
    const manifest = readJson(paths.manifestPath);
    const entry = manifest.basedOn.registries[THING_T];
    const provenance = { fromVersion: '1', fromDigest: entry.digest, path: ['thing-1-to-2'] };
    const readWith = (migration) => {
      writeJson(paths.manifestPath, { ...manifest, basedOn: { registries: { ...manifest.basedOn.registries, [THING_T]: { ...entry, migration } } } });
      return readRegistrySetManifest(paths);
    };
    assert.ok(readWith(provenance).manifest);
    for (const [label, migration] of [
      ['not an object', 'thing-1-to-2'],
      ['an unknown field', { ...provenance, note: 'x' }],
      ['a missing field', { fromVersion: '1', fromDigest: entry.digest }],
      ['an empty version', { ...provenance, fromVersion: '' }],
      ['a padded version', { ...provenance, fromVersion: ' 1' }],
      ['an uppercase digest', { ...provenance, fromDigest: entry.digest.toUpperCase() }],
      ['a short digest', { ...provenance, fromDigest: 'abc' }],
      ['an empty path', { ...provenance, path: [] }],
      ['a path that is not a list', { ...provenance, path: 'thing-1-to-2' }],
      ['an empty transform id', { ...provenance, path: [''] }],
      ['a non-string transform id', { ...provenance, path: [7] }],
      ['null', null],
    ]) {
      assert.match(readWith(migration).manifestError ?? '', new RegExp(`invalid basedOn entries for ${THING_T}`, 'u'), label);
    }

    // A malformed provenance makes the manifest untrusted, so migrate refuses before writing.
    writeJson(paths.manifestPath, manifest);
    const slices = release({ [THING_T]: '2' });
    const document = accept(plan(slices));
    readWith({ ...provenance, path: [] });
    const before = snapshotTree(paths.lifecycleRoot);
    const result = migrate(slices, document);
    assert.deepEqual(result.problems.map((item) => [item.registryId, item.problem]), [[THING_T, 'not-migratable']]);
    assert.match(result.problems[0].detail, /diff class is not-comparable/u);
    assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);
  });
});

test('migrate never reads or changes the active set', () => {
  for (const state of ['{ not json', '{"schemaVersion":"1","activeSet":"custom"}\n']) {
    withMigrateFixture(({ release, plan, migrate, paths }) => {
      fs.writeFileSync(paths.statePath, state);
      const slices = release({ [THING_T]: '2' });
      assert.deepEqual(migrate(slices, accept(plan(slices))).applied, [THING_T]);
      assert.equal(fs.readFileSync(paths.statePath, 'utf8'), state);
    });
  }
});

test('a Baseline copy that matches its manifest digest but not its manifest version is never migrated', () => {
  withMigrateFixture(({ release, plan, migrate, paths, baselineFile }) => {
    // Version-"1" shaped content labelled "2", with the manifest digest repaired to match it. The
    // transform does not look at the input version, so only the version check stops it.
    const mislabelled = { version: '2', items: [{ name: 'b', label: 'Alpha' }] };
    writeJson(baselineFile(THING_T), mislabelled);
    const manifest = readJson(paths.manifestPath);
    manifest.basedOn.registries[THING_T].digest = digestRegistryPayload(mislabelled, V2_DESCRIPTOR);
    writeJson(paths.manifestPath, manifest);
    const slices = release({ [THING_T]: '2' });

    const document = plan(slices);
    assert.deepEqual(document.registries, []);
    assert.deepEqual(document.notMigratable, [
      { registryId: THING_T, reason: 'baseline-mismatch', detail: 'The .baseline copy is at version "2", its manifest entry at "1".' },
    ]);

    // A plan made for it before the copy changed is refused, and nothing is written.
    const before = snapshotTree(paths.lifecycleRoot);
    const forged = {
      kind: 'calculogic-registry-migration-plan',
      schemaVersion: '1',
      registries: [
        {
          registryId: THING_T,
          fromVersion: '1',
          toVersion: '2',
          path: [{ from: '1', to: '2', transform: 'thing-1-to-2' }],
          basedOn: { baselineDigest: manifest.basedOn.registries[THING_T].digest, builtinDigest: 'x', customDigest: 'y' },
          result: { baselineDigest: 'x', customDigest: 'y' },
          decision: 'accept',
        },
      ],
    };
    assert.deepEqual(migrate(slices, forged).problems.map((item) => [item.registryId, item.problem]), [[THING_T, 'not-migratable']]);
    assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);
  });
});

test('a transform id or version that could not be written as manifest provenance is refused before anything is written', () => {
  for (const [label, step, transforms] of [
    ['a padded transform id', { ...STEP_1_TO_2, transform: ' thing-1-to-2 ' }, { ' thing-1-to-2 ': migrate1to2 }],
    ['a whitespace-only transform id', { ...STEP_1_TO_2, transform: ' ' }, { ' ': migrate1to2 }],
  ]) {
    withMigrateFixture(({ release, migrate, paths }) => {
      const released = release({ [THING_T]: '2' });
      const slices = released.map((slice) => ({
        ...slice,
        inventory: slice.inventory.map((entry) => (entry.registryId === THING_T ? { ...entry, migrations: [step] } : entry)),
      }));
      const before = snapshotTree(paths.lifecycleRoot);
      const plan = { kind: 'calculogic-registry-migration-plan', schemaVersion: '1', registries: [] };
      assert.throws(
        () => migrate(slices, plan, { migrationTransforms: { ...TRANSFORMS, tree: transforms } }),
        /non-empty transform id without surrounding whitespace/u,
        label,
      );
      assert.deepEqual(snapshotTree(paths.lifecycleRoot), before, label);
    });
  }
});
