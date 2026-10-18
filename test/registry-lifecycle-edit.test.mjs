import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REGISTRY_LIFECYCLE_SLICES } from '../src/core/registry-lifecycle/registry-lifecycle-inventory.knowledge.mjs';
import { initCustomRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-init.logic.mjs';
import {
  parseComparisonAddress,
  walkComparisonEntries,
} from '../src/core/registry-lifecycle/registry-lifecycle-comparison.logic.mjs';
import {
  applyRegistryEditDocument,
  checkRegistryEditDocument,
} from '../src/core/registry-lifecycle/registry-lifecycle-edit.logic.mjs';
import { buildRegistryLifecycleDiff } from '../src/core/registry-lifecycle/registry-lifecycle-diff.logic.mjs';
import { buildRegistryLifecycleStatus } from '../src/core/registry-lifecycle/registry-lifecycle-status.logic.mjs';
import { resolveActiveRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { useRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-use.logic.mjs';
import { validateSliceRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-slice-validation.logic.mjs';
import { LIFECYCLE_TRANSACTION_SIMULATED_CRASH } from '../src/core/registry-lifecycle/registry-lifecycle-transaction.logic.mjs';
import { resolveRegistryLifecyclePaths } from '../src/core/registry-lifecycle/registry-lifecycle-state.logic.mjs';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

// Synthetic registries with every comparison kind and address form: keyed records, an ordered keyed
// collection, members, a value map, a plain value path, and an ordered keyed map of groups. The
// suite slice's own validation ignores them; tests that need slice rules pass `validateSlice`.
const defineThing = (registryId) => {
  const name = registryId.split('/')[1];
  return Object.freeze({
    registryId,
    name,
    fileName: `${name}.registry.json`,
    readableVersions: ['1'],
    descriptor: { setLike: [{ path: 'tags' }] },
    comparison: [
      { kind: 'keyed', path: 'records', key: 'id' },
      { kind: 'keyed', path: 'ordered', key: 'id', ordered: true },
      { kind: 'members', path: 'tags' },
      { kind: 'value', path: 'settings.*' },
      { kind: 'value', path: 'title' },
      { kind: 'keyed', path: 'groups.*', key: 'id', ordered: true },
    ],
    reconciliation: [],
    migrations: [],
  });
};
const THING_A = 'suite/edit-thing-a';
const THING_B = 'suite/edit-thing-b';
const THING_T = 'tree/edit-thing-t';
const THINGS = [THING_A, THING_B, THING_T];
const sliceOf = (registryId) => registryId.split('/')[0];
const PAYLOAD = Object.freeze({
  version: '1',
  records: [{ id: 'r1', label: 'One' }, { id: 'r2', label: 'Two' }],
  ordered: [{ id: 'p' }, { id: 'q' }],
  tags: ['x', 'y'],
  settings: { s1: { on: true }, s2: 2 },
  title: 'T',
  groups: { g1: [{ id: 'k1' }, { id: 'k2' }] },
});

// A target root with a Custom set initialized from private Builtin roots that include the things.
const withEditFixture = (run) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-edit-'));
  const targetRoot = path.join(fixtureRoot, 'target');
  fs.mkdirSync(targetRoot);
  const fileFor = (root) => (registryId) => path.join(root, sliceOf(registryId), `${registryId.split('/')[1]}.registry.json`);
  const slices = REGISTRY_LIFECYCLE_SLICES.map((slice) => {
    const builtinRoot = path.join(fixtureRoot, 'builtin', slice.sliceId);
    fs.cpSync(slice.builtinRoot, builtinRoot, { recursive: true });
    return {
      ...slice,
      builtinRoot,
      inventory: [...slice.inventory, ...THINGS.filter((registryId) => sliceOf(registryId) === slice.sliceId).map(defineThing)],
    };
  });
  const builtinFile = fileFor(path.join(fixtureRoot, 'builtin'));
  for (const registryId of THINGS) {
    writeJson(builtinFile(registryId), PAYLOAD);
  }

  try {
    initCustomRegistrySet({ targetRoot, validatorVersion: '0.0.0-test', slices });
    const paths = resolveRegistryLifecyclePaths({ targetRoot });
    const status = () => buildRegistryLifecycleStatus({ targetRoot, slices });
    const digestOf = (registryId) => status().registries.find((entry) => entry.registryId === registryId).customDigest;
    return run({
      targetRoot,
      paths,
      slices,
      builtinFile,
      customFile: fileFor(paths.customRoot),
      baselineFile: fileFor(paths.baselineRoot),
      status,
      digestOf,
      diff: () => buildRegistryLifecycleDiff({ targetRoot, slices }),
      document: (records) => ({
        kind: 'calculogic-registry-edit',
        schemaVersion: '1',
        registries: Object.entries(records).map(([registryId, operations]) => ({
          registryId,
          basedOn: { customDigest: digestOf(registryId) },
          operations,
        })),
      }),
      check: (document, options = {}) => checkRegistryEditDocument({ document, targetRoot, slices, ...options }),
      edit: (document, options = {}) =>
        applyRegistryEditDocument({ loadDocument: () => structuredClone(document), targetRoot, slices, ...options }),
    });
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
};

const snapshotTree = (root) =>
  fs
    .readdirSync(root, { recursive: true })
    .sort()
    .map((relativePath) => {
      const filePath = path.join(root, relativePath);
      return [relativePath, fs.statSync(filePath).isFile() ? fs.readFileSync(filePath, 'base64') : null];
    });
const problemsOf = (result) => result.problems.map(({ registryId, address, problem }) => [registryId, address ?? null, problem]);
const registryOf = (output, registryId) => output.registries.find((registry) => registry.registryId === registryId);
const R = (key) => `records[id=${JSON.stringify(key)}]`;

test('parseComparisonAddress names exactly the site walkComparisonEntries gives, for every entry of every current registry', () => {
  let count = 0;
  for (const slice of REGISTRY_LIFECYCLE_SLICES) {
    for (const entry of slice.inventory) {
      const payload = readJson(path.join(slice.builtinRoot, entry.fileName));
      for (const { address, site } of walkComparisonEntries(payload, entry)) {
        assert.deepEqual(parseComparisonAddress(address, entry), site, address);
        count += 1;
      }
    }
  }
  assert.ok(count > 100);
  const thing = defineThing(THING_A);
  for (const [label, address] of [
    ['single quotes', "records[id='r1']"],
    ['unterminated', 'records[id="r1"'],
    ['another collection name', 'recordsX[id="r1"]'],
    ['a value with a member suffix', 'title["x"]'],
    ['an object member', 'tags[{}]'],
    ['a null key', 'records[id=null]'],
    ['the wrong key field', 'records[key="r1"]'],
    ['an order of an unordered collection', 'records#order'],
    ['a wildcard map without its property', 'settings'],
    ['a non-canonical escape', 'records[id="\\u0072"]'],
    ['not a string', 7],
  ]) {
    assert.equal(parseComparisonAddress(address, thing), null, label);
  }
  assert.deepEqual(parseComparisonAddress('groups["new"]', thing), { kind: 'group', container: ['groups', 'new'], collectionPath: 'groups.*' });
  assert.deepEqual(parseComparisonAddress('records[id=7]', thing), {
    kind: 'record',
    container: ['records'],
    keyField: 'id',
    key: 7,
    grouped: false,
    collectionPath: 'records',
  });
});

test('every operation and address form applies, writing only the edited Custom file; diff classifies the result', () => {
  withEditFixture(({ document, check, edit, paths, customFile, diff, status }) => {
    const doc = document({
      [THING_A]: [
        { op: 'change', address: R('r1'), value: { id: 'r1', label: 'One, edited' } },
        { op: 'add', address: R('r3'), value: { id: 'r3', label: 'Three' } },
        { op: 'remove', address: R('r2') },
        { op: 'add', address: 'ordered[id="r"]', value: { id: 'r' } },
        { op: 'remove', address: 'ordered[id="q"]' },
        { op: 'change', address: 'ordered#order', value: ['r', 'p'] },
        { op: 'add', address: 'tags["z"]' },
        { op: 'remove', address: 'tags["x"]' },
        { op: 'add', address: 'settings["s3"]', value: [1, 2] },
        { op: 'change', address: 'settings["s1"]', value: { on: false } },
        { op: 'remove', address: 'settings["s2"]' },
        { op: 'change', address: 'title', value: 'New title' },
        { op: 'add', address: 'groups["g2"]' },
        { op: 'add', address: 'groups["g2"][id="n1"]', value: { id: 'n1' } },
        { op: 'change', address: 'groups["g2"]#order', value: ['n1'] },
        { op: 'remove', address: 'groups["g1"][id="k1"]' },
        { op: 'change', address: 'groups["g1"]#order', value: ['k2'] },
      ].reverse(),
    });
    assert.deepEqual(check(doc), { valid: true, problems: [], registries: [{ registryId: THING_A, operations: 17 }] });

    const before = snapshotTree(paths.lifecycleRoot).filter(([relativePath]) => !relativePath.endsWith(path.join('suite', 'edit-thing-a.registry.json')) || relativePath.includes('.baseline'));
    let transactions = 0;
    assert.deepEqual(edit(doc, { onTransactionStep: (step) => (transactions += step === 'staged' ? 1 : 0) }), { applied: [THING_A] });
    assert.equal(transactions, 1);
    assert.deepEqual(readJson(customFile(THING_A)), {
      version: '1',
      records: [{ id: 'r1', label: 'One, edited' }, { id: 'r3', label: 'Three' }],
      ordered: [{ id: 'r' }, { id: 'p' }],
      tags: ['y', 'z'],
      settings: { s1: { on: false }, s3: [1, 2] },
      title: 'New title',
      groups: { g1: [{ id: 'k2' }], g2: [{ id: 'n1' }] },
    });
    // Nothing else changed: no Baseline copy, no manifest entry, no other Custom file, no state.
    assert.deepEqual(
      snapshotTree(paths.lifecycleRoot).filter(([relativePath]) => !relativePath.endsWith(path.join('suite', 'edit-thing-a.registry.json')) || relativePath.includes('.baseline')),
      before,
    );
    assert.equal(registryOf(diff(), THING_A).class, 'differs');
    assert.ok(registryOf(diff(), THING_A).entries.every((entry) => entry.class === 'custom-only'));
    assert.equal(registryOf(status(), THING_A).classification, 'custom-modified');
  });
});

test('diff, not the edit, classifies edited entries: aligned with a Builtin change, and no difference once the Baseline value is restored', () => {
  withEditFixture(({ document, edit, builtinFile, diff }) => {
    writeJson(builtinFile(THING_A), { ...PAYLOAD, title: 'Upstream title' });
    assert.deepEqual(registryOf(diff(), THING_A).entries.map((entry) => [entry.address, entry.class]), [['title', 'builtin-changed']]);
    assert.deepEqual(edit(document({ [THING_A]: [{ op: 'change', address: 'title', value: 'Upstream title' }] })).applied, [THING_A]);
    assert.deepEqual(registryOf(diff(), THING_A).entries.map((entry) => [entry.address, entry.class]), [['title', 'aligned']]);

    assert.deepEqual(edit(document({ [THING_B]: [{ op: 'remove', address: 'tags["x"]' }] })).applied, [THING_B]);
    assert.equal(registryOf(diff(), THING_B).class, 'differs');
    assert.deepEqual(edit(document({ [THING_B]: [{ op: 'add', address: 'tags["x"]' }] })).applied, [THING_B]);
    assert.equal(registryOf(diff(), THING_B).class, 'unchanged');
  });
});

test('operation problems: invalid addresses, unsupported operations, duplicates, preconditions and values, each refused before writing', () => {
  withEditFixture(({ document, check, edit, paths }) => {
    const doc = document({
      [THING_A]: [
        { op: 'remove', address: 'nope' },
        { op: 'change', address: 'tags["x"]' },
        { op: 'add', address: 'ordered#order', value: [] },
        { op: 'remove', address: R('r1') },
        { op: 'change', address: R('r1'), value: { id: 'r1', label: 'x' } },
        { op: 'remove', address: R('missing') },
        { op: 'add', address: R('r2'), value: { id: 'r2' } },
        { op: 'add', address: R('r9'), value: { id: 'other' } },
        { op: 'add', address: 'settings["s9"]' },
        { op: 'remove', address: 'title', value: 'x' },
        { op: 'add', address: 'tags["new"]', value: 'new' },
        { op: 'change', address: 'ordered#order', value: 'p,q' },
        { op: 'change', address: 'groups["g1"]#order', value: ['k1', 'k2'] },
      ],
    });
    const before = snapshotTree(paths.lifecycleRoot);
    const result = check(doc);
    assert.equal(result.valid, false);
    assert.deepEqual(problemsOf(result), [
      [THING_A, 'groups["g1"]#order', 'invalid-value'],
      [THING_A, 'nope', 'invalid-address'],
      [THING_A, 'ordered#order', 'duplicate-address'],
      [THING_A, 'ordered#order', 'duplicate-address'],
      [THING_A, R('missing'), 'absent-entry'],
      [THING_A, R('r1'), 'duplicate-address'],
      [THING_A, R('r1'), 'duplicate-address'],
      [THING_A, R('r2'), 'present-entry'],
      [THING_A, R('r9'), 'invalid-value'],
      [THING_A, 'settings["s9"]', 'invalid-value'],
      [THING_A, 'tags["new"]', 'invalid-value'],
      [THING_A, 'tags["x"]', 'unsupported-operation'],
      [THING_A, 'title', 'invalid-value'],
    ]);
    assert.deepEqual(result.registries, []);
    assert.deepEqual(edit(doc).applied, []);
    assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);

    // A no-op change of a record or value is found from canonical values.
    assert.deepEqual(problemsOf(check(document({ [THING_A]: [{ op: 'change', address: 'settings["s1"]', value: { on: true } }] }))), [
      [THING_A, 'settings["s1"]', 'invalid-value'],
    ]);
    // A group add counts its implied order entry as present for a change in the same record; a
    // change of an order entry no group brings is absent.
    assert.deepEqual(problemsOf(check(document({ [THING_A]: [{ op: 'change', address: 'groups["g9"]#order', value: [] }] }))), [
      [THING_A, 'groups["g9"]#order', 'absent-entry'],
    ]);
  });
});

test('ordered collections and groups: nothing is implied, and implied order entries are part of the exact image', () => {
  withEditFixture(({ document, check }) => {
    const codes = (operations) => problemsOf(check(document({ [THING_A]: operations })));
    // A record added to, or removed from, an ordered collection needs an explicit order change.
    assert.deepEqual(codes([{ op: 'add', address: 'ordered[id="r"]', value: { id: 'r' } }]), [[THING_A, 'ordered#order', 'inconsistent-operations']]);
    assert.deepEqual(codes([{ op: 'remove', address: 'ordered[id="p"]' }]), [[THING_A, 'ordered#order', 'inconsistent-operations']]);
    assert.deepEqual(codes([{ op: 'change', address: 'ordered#order', value: ['q', 'p', 'z'] }]), [[THING_A, 'ordered#order', 'inconsistent-operations']]);
    assert.deepEqual(codes([{ op: 'change', address: 'ordered#order', value: ['q', 'p'] }]), []);
    // A group add brings its empty order entry; records in it need their order.
    assert.deepEqual(codes([{ op: 'add', address: 'groups["g2"]' }]), []);
    assert.deepEqual(codes([{ op: 'add', address: 'groups["g2"]' }, { op: 'add', address: 'groups["g2"][id="n"]', value: { id: 'n' } }]), [
      [THING_A, 'groups["g2"]#order', 'inconsistent-operations'],
    ]);
    // A record never creates its group.
    assert.deepEqual(codes([{ op: 'add', address: 'groups["g9"][id="n"]', value: { id: 'n' } }]), [[THING_A, 'groups["g9"][id="n"]', 'inconsistent-operations']]);
    // Removing a group never removes its records; removing them too works.
    assert.deepEqual(codes([{ op: 'remove', address: 'groups["g1"]' }]), [
      [THING_A, 'groups["g1"][id="k1"]', 'inconsistent-operations'],
      [THING_A, 'groups["g1"][id="k2"]', 'inconsistent-operations'],
    ]);
    assert.deepEqual(
      codes([
        { op: 'remove', address: 'groups["g1"]' },
        { op: 'remove', address: 'groups["g1"][id="k1"]' },
        { op: 'remove', address: 'groups["g1"][id="k2"]' },
      ]),
      [],
    );
    // An order entry taken away with its group cannot also be operated.
    assert.deepEqual(
      codes([
        { op: 'remove', address: 'groups["g1"]' },
        { op: 'remove', address: 'groups["g1"][id="k1"]' },
        { op: 'remove', address: 'groups["g1"][id="k2"]' },
        { op: 'change', address: 'groups["g1"]#order', value: [] },
      ]),
      [[THING_A, 'groups["g1"]#order', 'inconsistent-operations']],
    );
  });
});

test('record problems: malformed shapes, unknown and duplicate registries, not editable and stale', () => {
  withEditFixture(({ document, check, customFile, slices, targetRoot }) => {
    for (const malformed of [
      null,
      { kind: 'calculogic-registry-update-decisions', schemaVersion: '1', registries: [] },
      { kind: 'calculogic-registry-edit', schemaVersion: '2', registries: [] },
      JSON.parse('{"kind":"calculogic-registry-edit","schemaVersion":"1","registries":[],"__proto__":{}}'),
    ]) {
      assert.deepEqual(problemsOf(check(malformed)), [[null, null, 'malformed']], JSON.stringify(malformed));
    }

    const valid = document({ [THING_A]: [{ op: 'change', address: 'title', value: 'x' }] }).registries[0];
    const result = check({
      kind: 'calculogic-registry-edit',
      schemaVersion: '1',
      registries: [
        valid,
        valid,
        { registryId: '__proto__', basedOn: valid.basedOn, operations: valid.operations },
        { ...valid, registryId: THING_B, operations: [] },
        { ...valid, registryId: THING_T, operations: [{ op: 'rename', address: 'title' }] },
        { ...valid, registryId: 'naming/roles', extra: 1 },
        { ...valid, registryId: 'naming/categories', operations: [{ op: 'remove', address: 'x', note: 'y' }] },
        { ...valid, registryId: 'naming/case-rules', basedOn: { customDigest: 'wrong' } },
        { registryId: 7 },
      ],
    });
    assert.deepEqual(problemsOf(result), [
      [null, null, 'malformed'],
      ['__proto__', null, 'unknown-registry'],
      ['naming/case-rules', null, 'stale'],
      ['naming/categories', null, 'malformed'],
      ['naming/roles', null, 'malformed'],
      [THING_A, null, 'duplicate-registry'],
      [THING_B, null, 'malformed'],
      [THING_T, null, 'malformed'],
    ]);

    // Not editable: absent, unreadable, or at a version this engine does not read.
    const notEditable = (alter) => {
      const doc = document({ [THING_B]: [{ op: 'change', address: 'title', value: 'x' }] });
      alter();
      const outcome = checkRegistryEditDocument({ document: doc, targetRoot, slices });
      fs.writeFileSync(customFile(THING_B), `${JSON.stringify(PAYLOAD, null, 2)}\n`);
      return [problemsOf(outcome), outcome.problems[0].detail];
    };
    const [absentCodes, absentDetail] = notEditable(() => fs.rmSync(customFile(THING_B)));
    assert.deepEqual(absentCodes, [[THING_B, null, 'not-editable']]);
    assert.match(absentDetail, /^Absent from the Custom set/u);
    assert.match(notEditable(() => fs.writeFileSync(customFile(THING_B), '{ broken'))[1], /cannot be read/u);
    assert.match(notEditable(() => writeJson(customFile(THING_B), { ...PAYLOAD, version: '2' }))[1], /version "2", which this engine does not read/u);
    assert.match(notEditable(() => writeJson(customFile(THING_B), { ...PAYLOAD, unknown: 1 }))[1], /no valid comparison entries/u);
  });
});

// The suite things must agree on their titles, as two registries that reference each other would.
const pairedTitles = (sliceId, root) => {
  const failures = [...validateSliceRegistrySet(sliceId, root)];
  const titleOf = (name) => {
    const filePath = path.join(root, `${name}.registry.json`);
    return fs.existsSync(filePath) ? readJson(filePath).title : null;
  };
  if (sliceId === 'suite' && titleOf('edit-thing-a') !== titleOf('edit-thing-b')) {
    failures.push({ registryId: THING_B, detail: 'the two things must share a title.' });
  }
  return failures;
};

test('the final Custom slice image is validated once: edits valid only together apply together, one alone is invalid-result', () => {
  withEditFixture(({ document, check, edit, customFile, paths }) => {
    const alone = document({ [THING_A]: [{ op: 'change', address: 'title', value: 'Shared' }] });
    const result = check(alone, { validateSlice: pairedTitles });
    assert.deepEqual(problemsOf(result), [[THING_B, null, 'invalid-result']]);
    assert.equal(result.problems[0].detail, 'the two things must share a title.');
    const before = snapshotTree(paths.lifecycleRoot);
    assert.deepEqual(edit(alone, { validateSlice: pairedTitles }).applied, []);
    assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);

    const together = document({
      [THING_A]: [{ op: 'change', address: 'title', value: 'Shared' }],
      [THING_B]: [{ op: 'change', address: 'title', value: 'Shared' }],
    });
    let transactions = 0;
    assert.deepEqual(
      edit(together, { validateSlice: pairedTitles, onTransactionStep: (step) => (transactions += step === 'staged' ? 1 : 0) }),
      { applied: [THING_A, THING_B] },
    );
    assert.equal(transactions, 1);
    assert.deepEqual([readJson(customFile(THING_A)).title, readJson(customFile(THING_B)).title], ['Shared', 'Shared']);
  });
});

test('a slice with a refused record is not validated or summarized, even for its other records', () => {
  withEditFixture(({ document, check }) => {
    const result = check(
      document({
        [THING_A]: [{ op: 'change', address: 'title', value: 'Fine on its own' }],
        [THING_B]: [{ op: 'remove', address: 'nope' }],
      }),
      { validateSlice: pairedTitles },
    );
    assert.deepEqual(problemsOf(result), [[THING_B, 'nope', 'invalid-address']]);
    assert.deepEqual(result.registries, []);
  });
});

test('a real slice rule refuses an edit: naming/roles rejects a status outside its vocabulary', () => {
  withEditFixture(({ document, check }) => {
    const role = readJson(path.join(REGISTRY_LIFECYCLE_SLICES[0].builtinRoot, 'roles.registry.json')).roles[0];
    const address = `roles[role=${JSON.stringify(role.role)}]`;
    assert.equal(check(document({ 'naming/roles': [{ op: 'change', address, value: { ...role, definition: 'Edited.' } }] })).valid, true);
    const refused = check(document({ 'naming/roles': [{ op: 'change', address, value: { ...role, status: 'not-a-status' } }] }));
    assert.equal(refused.valid, false);
    assert.ok(refused.problems.every((item) => item.problem === 'invalid-result'));
    assert.ok(refused.problems.some((item) => item.registryId === 'naming/roles'));
  });
});

test('a failure at any step of a slice transaction edits none of its registries', () => {
  const boundaries = ['staged', 'journaled', 'directories-created', 'step-0:backed-up', 'step-0:applied', 'step-1:backed-up'];
  for (const boundary of boundaries) {
    withEditFixture(({ document, edit, paths }) => {
      const doc = document({
        [THING_A]: [{ op: 'change', address: 'title', value: 'A' }],
        [THING_B]: [{ op: 'change', address: 'title', value: 'B' }],
      });
      const before = snapshotTree(paths.lifecycleRoot);
      const result = edit(doc, {
        onTransactionStep: (step) => {
          if (step === boundary) {
            throw new Error(`injected at ${boundary}`);
          }
        },
      });
      assert.deepEqual(result, { applied: [], failed: { sliceId: 'suite', registryIds: [THING_A, THING_B], detail: `injected at ${boundary}` } }, boundary);
      assert.deepEqual(snapshotTree(paths.lifecycleRoot), before, boundary);
    });
  }
});

test('across slices, a committed slice stays edited when a later slice fails; a later slice changed mid-run is refused as stale', () => {
  withEditFixture(({ document, edit, customFile }) => {
    const doc = document({
      [THING_A]: [{ op: 'change', address: 'title', value: 'A' }],
      [THING_T]: [{ op: 'change', address: 'title', value: 'T2' }],
    });
    let transactions = 0;
    const result = edit(doc, {
      onTransactionStep: (step) => {
        transactions += step === 'staged' ? 1 : 0;
        if (transactions === 2 && step === 'step-0:backed-up') {
          throw new Error('injected in the tree slice');
        }
      },
    });
    assert.deepEqual(result, { applied: [THING_A], failed: { sliceId: 'tree', registryIds: [THING_T], detail: 'injected in the tree slice' } });
    assert.deepEqual([readJson(customFile(THING_A)).title, readJson(customFile(THING_T)).title], ['A', 'T']);
  });

  withEditFixture(({ document, edit, customFile }) => {
    const doc = document({
      [THING_A]: [{ op: 'change', address: 'title', value: 'A' }],
      [THING_T]: [{ op: 'change', address: 'title', value: 'T2' }],
    });
    const result = edit(doc, {
      onTransactionStep: (step) => step === 'committed' && writeJson(customFile(THING_T), { ...PAYLOAD, title: 'Changed meanwhile' }),
    });
    assert.deepEqual(result.applied, [THING_A]);
    assert.equal(result.failed.sliceId, 'tree');
    assert.match(result.failed.detail, /tree\/edit-thing-t: the Custom file no longer has the digest the edit document was made against/u);
    assert.equal(readJson(customFile(THING_T)).title, 'Changed meanwhile');
  });
});

test('interrupted-transaction: reported while a transaction is pending, blocks active Custom, never recovered by reads, cleared by the next writing command', () => {
  withEditFixture(({ document, edit, check, paths, slices, targetRoot, customFile, status }) => {
    const doc = document({
      [THING_A]: [{ op: 'change', address: 'title', value: 'A' }],
      [THING_B]: [{ op: 'change', address: 'title', value: 'B' }],
    });
    // Activate Custom first, then crash an edit after its first Custom file is written.
    useRegistrySet({ targetRoot, activeSet: 'custom', slices });
    const crash = (step) => {
      if (step === 'step-0:applied') {
        throw Object.assign(new Error('crash'), { [LIFECYCLE_TRANSACTION_SIMULATED_CRASH]: true });
      }
    };
    assert.throws(() => edit(doc, { onTransactionStep: crash }), /crash/u);
    assert.equal(readJson(customFile(THING_A)).title, 'A', 'the half-applied state no manifest entry exposes');
    assert.equal(readJson(customFile(THING_B)).title, 'T');

    const issue = status().customIssues.find((item) => item.condition === 'interrupted-transaction');
    assert.equal(issue.registryId, null);
    assert.match(issue.detail, /Recovery is required/u);
    assert.doesNotMatch(issue.detail, /corrupt/u);

    // An active-Custom run is blocked, naming the condition.
    assert.throws(() => resolveActiveRegistrySet({ targetRoot, slices }), (error) =>
      error.conditions.some((condition) => condition.condition === 'interrupted-transaction'),
    );
    // Reads never recover: status, resolution and edit-check leave the transaction in place.
    assert.equal(check(doc).valid, false);
    const transactionRoot = path.join(paths.lifecycleRoot, '.lifecycle-transaction');
    assert.equal(fs.existsSync(transactionRoot), true);

    // Builtin stays usable and reports the condition; activation of Custom refuses.
    useRegistrySet({ targetRoot, activeSet: 'builtin', slices });
    const builtinRun = resolveActiveRegistrySet({ targetRoot, slices });
    assert.equal(builtinRun.activeSet, 'builtin');
    assert.ok(builtinRun.registrySet.customIssues.some((item) => item.condition === 'interrupted-transaction'));
    assert.throws(() => useRegistrySet({ targetRoot, activeSet: 'custom', slices }), /interrupted-transaction/u);
    assert.equal(fs.existsSync(transactionRoot), true);

    // The next writing command recovers first, then applies the same, still current, document.
    const rerun = edit(doc);
    assert.deepEqual(rerun, { recovered: { outcome: 'rolled-back' }, applied: [THING_A, THING_B] });
    assert.equal(fs.existsSync(transactionRoot), false);
    assert.equal(status().customIssues.some((item) => item.condition === 'interrupted-transaction'), false);
    assert.deepEqual(useRegistrySet({ targetRoot, activeSet: 'custom', slices }).activeSet, 'custom');
  });
});

test('edit-check and edit never read or change the active set', () => {
  for (const state of ['{ not json', '{"schemaVersion":"1","activeSet":"custom"}\n']) {
    withEditFixture(({ document, check, edit, paths }) => {
      const doc = document({ [THING_A]: [{ op: 'change', address: 'title', value: 'A' }] });
      fs.writeFileSync(paths.statePath, state);
      assert.equal(check(doc).valid, true);
      assert.deepEqual(edit(doc).applied, [THING_A]);
      assert.equal(fs.readFileSync(paths.statePath, 'utf8'), state);
    });
  }
});

test('edit-check and edit need a Custom set', () => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-edit-empty-'));
  try {
    assert.throws(() => checkRegistryEditDocument({ document: {}, targetRoot }), /No Custom registry set exists/u);
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
});
