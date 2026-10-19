import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initCustomRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-init.logic.mjs';
import { builtinReferenceInputs, resolveRegistryReferences } from '../src/core/registry-lifecycle/registry-lifecycle-references.logic.mjs';
import { validateSliceRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-slice-validation.logic.mjs';
import { resolveRegistryLifecyclePaths } from '../src/core/registry-lifecycle/registry-lifecycle-state.logic.mjs';
import { RegistryTraceUsageError, buildRegistryTrace } from '../src/core/registry-lifecycle/registry-lifecycle-trace.logic.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryBinPath = path.join(packageRoot, 'bin/calculogic-validator-registry.host.mjs');

const PERSPECTIVE = 'naming/category-role-perspective';
const BUILD_STYLE = 'rolesByCategory["concern-style"][role="build-style"]';
const CONCERN_STYLE = 'categories[category="concern-style"]';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);

// Every file under `root`, with its bytes or link target, so a test can prove nothing was written.
const snapshotTree = (root) =>
  fs
    .readdirSync(root, { recursive: true })
    .sort()
    .map((relativePath) => {
      const filePath = path.join(root, relativePath);
      const stat = fs.lstatSync(filePath);
      if (stat.isSymbolicLink()) {
        return [relativePath, `link:${fs.readlinkSync(filePath)}`];
      }
      return [relativePath, stat.isFile() ? fs.readFileSync(filePath, 'base64') : null];
    });

// A target repository with an initialized Custom set copied from Builtin.
const withCustomSet = (run) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-trace-'));
  const targetRoot = path.join(fixtureRoot, 'target');
  fs.mkdirSync(targetRoot);
  fs.writeFileSync(path.join(targetRoot, 'package.json'), '{"name":"fixture","private":true}\n');
  try {
    initCustomRegistrySet({ targetRoot, validatorVersion: '0.0.0-test' });
    const paths = resolveRegistryLifecyclePaths({ targetRoot });
    const customFile = (registryId) => {
      const [sliceId, name] = registryId.split('/');
      return path.join(paths.customRoot, sliceId, `${name}.registry.json`);
    };
    const change = (registryId, update) => {
      const payload = readJson(customFile(registryId));
      update(payload);
      writeJson(customFile(registryId), payload);
    };
    const trace = (set, registryId, address) => buildRegistryTrace({ set, registryId, address, targetRoot });
    return run({ fixtureRoot, targetRoot, paths, customFile, change, trace });
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
};

const edgeOf = (output, edgeId) => output.edges.find((edge) => edge.edgeId === edgeId);

test('the whole Builtin set: every edge with counts, drawn from the reference resolution', () => {
  const output = buildRegistryTrace({ set: 'builtin' });
  const { edges } = resolveRegistryReferences({ inputOf: builtinReferenceInputs() });
  assert.equal(output.command, 'trace');
  assert.equal(output.set, 'builtin');
  assert.equal(output.interruptedTransaction, false);
  assert.deepEqual(
    output.edges.map(({ counts, ...edge }) => edge),
    edges,
  );
  for (const edge of output.edges) {
    assert.deepEqual(edge.counts, { resolved: edge.references.length, unresolved: 0 }, edge.edgeId);
  }
  assert.deepEqual(buildRegistryTrace({ set: 'builtin' }), output);
});

test('the whole Custom set traces the Custom files, and a fresh Custom set matches Builtin', () => {
  withCustomSet(({ trace, change }) => {
    const output = trace('custom');
    assert.equal(output.set, 'custom');
    assert.equal(output.interruptedTransaction, false);
    assert.deepEqual(output.edges, buildRegistryTrace({ set: 'builtin' }).edges);

    // An edit to Custom shows only in the Custom trace.
    change('naming/categories', (payload) => {
      payload.categories = payload.categories.filter((entry) => entry.category !== 'concern-style');
    });
    assert.deepEqual(edgeOf(trace('custom'), 'naming/perspective-category').counts, { resolved: 9, unresolved: 1 });
    assert.deepEqual(edgeOf(buildRegistryTrace({ set: 'builtin' }), 'naming/perspective-category').counts, { resolved: 10, unresolved: 0 });
  });
});

test('one entry: direct, reverse and one-step potential impact', () => {
  withCustomSet(({ trace }) => {
    const record = trace('custom', PERSPECTIVE, BUILD_STYLE);
    assert.deepEqual(record.entry, { registryId: PERSPECTIVE, address: BUILD_STYLE, present: true });
    assert.deepEqual(
      record.direct.map(({ edgeId, target, state }) => [edgeId, target.registryId, target.address, state]),
      [
        ['naming/perspective-meaning', 'naming/agnostic-core-meanings', 'meanings[meaning="presentation"]', 'resolved'],
        ['naming/perspective-meaning', 'naming/agnostic-core-meanings', 'meanings[meaning="structure"]', 'resolved'],
        // Ordinal: `rolesByCategory…` sorts before `roles[…`.
        ['naming/perspective-inherits-from', PERSPECTIVE, 'rolesByCategory["concern-core"][role="build"]', 'resolved'],
        ['naming/perspective-role-definition', 'naming/roles', 'roles[role="build-style"]', 'resolved'],
      ],
    );
    assert.deepEqual(record.reverse, []);
    assert.deepEqual(record.impact, []);
    assert.deepEqual(record.unavailable, []);

    // The inherited role: its reverse view and direct dependents.
    const build = trace('custom', PERSPECTIVE, 'rolesByCategory["concern-core"][role="build"]');
    assert.deepEqual(build.reverse, [
      { edgeId: 'naming/perspective-inherits-from', source: { registryId: PERSPECTIVE, address: BUILD_STYLE }, state: 'resolved' },
    ]);
    assert.deepEqual(build.impact, [{ registryId: PERSPECTIVE, address: BUILD_STYLE }]);

    // A group address is a source too.
    const group = trace('custom', PERSPECTIVE, 'rolesByCategory["concern-style"]');
    assert.deepEqual(group.direct, [
      { edgeId: 'naming/perspective-category', target: { registryId: 'naming/categories', address: CONCERN_STYLE }, state: 'resolved' },
    ]);

    // A target with several dependents: each source once, in ordinal order.
    const presentation = trace('custom', 'naming/agnostic-core-meanings', 'meanings[meaning="presentation"]');
    const sources = presentation.impact.map((source) => source.address);
    assert.ok(sources.length > 1);
    assert.deepEqual(sources, [...new Set(sources)].sort());
    assert.ok(presentation.reverse.every((reference) => reference.edgeId === 'naming/perspective-meaning'));
  });
});

test('an invalid but readable Custom set is traced, and a missing target is traced in reverse', () => {
  withCustomSet(({ trace, change, paths }) => {
    change('naming/categories', (payload) => {
      payload.categories = payload.categories.filter((entry) => entry.category !== 'concern-style');
    });
    assert.ok(validateSliceRegistrySet('naming', path.join(paths.customRoot, 'naming')).length > 0, 'Naming rejects the set');

    const missing = trace('custom', 'naming/categories', CONCERN_STYLE);
    assert.deepEqual(missing.entry, { registryId: 'naming/categories', address: CONCERN_STYLE, present: false });
    assert.deepEqual(missing.direct, []);
    assert.deepEqual(missing.reverse, [
      { edgeId: 'naming/perspective-category', source: { registryId: PERSPECTIVE, address: 'rolesByCategory["concern-style"]' }, state: 'unresolved' },
    ]);
    assert.deepEqual(missing.impact, [{ registryId: PERSPECTIVE, address: 'rolesByCategory["concern-style"]' }]);

    // An address no reference names is accepted and simply has no references.
    const unnamed = trace('custom', 'naming/categories', 'categories[category="never-declared"]');
    assert.deepEqual([unnamed.entry.present, unnamed.direct, unnamed.reverse, unnamed.impact], [false, [], [], []]);
  });
});

test('an unavailable registry: presence unknown, no views made up, and the unavailable edges listed', () => {
  withCustomSet(({ trace, customFile }) => {
    fs.writeFileSync(customFile('naming/categories'), '{ not json');

    const unknown = trace('custom', 'naming/categories', CONCERN_STYLE);
    assert.equal(unknown.entry.present, null);
    assert.equal(unknown.entry.unavailable.condition, 'invalid');
    assert.deepEqual([unknown.direct, unknown.reverse, unknown.impact], [null, null, null]);
    assert.deepEqual(
      unknown.unavailable.map(({ edgeId, from, to, registryId, condition }) => [edgeId, from, to, registryId, condition]),
      [['naming/perspective-category', PERSPECTIVE, 'naming/categories', 'naming/categories', 'invalid']],
    );

    // The perspective stays traceable: the unavailable edge is listed, never reported as unresolved.
    const record = trace('custom', PERSPECTIVE, 'rolesByCategory["concern-style"]');
    assert.equal(record.entry.present, true);
    assert.deepEqual(record.direct, []);
    assert.deepEqual(record.unavailable.map((edge) => edge.edgeId), ['naming/perspective-category']);

    // An absent Custom file is `missing`, and its entries' presence is unknown too.
    fs.rmSync(customFile('naming/roles'));
    const absent = trace('custom', 'naming/roles', 'roles[role="build-style"]');
    assert.deepEqual([absent.entry.present, absent.entry.unavailable.condition], [null, 'missing']);
  });
});

test('a Custom file resolving outside the validation target is never read: its edges are unavailable', () => {
  withCustomSet(({ fixtureRoot, trace, customFile }) => {
    const outside = path.join(fixtureRoot, 'outside.registry.json');
    fs.copyFileSync(customFile('naming/categories'), outside);
    fs.rmSync(customFile('naming/categories'));
    fs.symlinkSync(outside, customFile('naming/categories'));

    const output = trace('custom');
    const edge = edgeOf(output, 'naming/perspective-category');
    assert.equal(edge.unavailable.condition, 'invalid');
    assert.match(edge.unavailable.detail, /outside the validation target/u);
    assert.equal(edge.references, undefined);
    assert.equal(trace('custom', 'naming/categories', CONCERN_STYLE).entry.present, null);
  });
});

test('a pending transaction: traced and reported, never recovered; Builtin is never intermediate', () => {
  withCustomSet(({ trace, paths, targetRoot }) => {
    const transactionRoot = path.join(paths.lifecycleRoot, '.lifecycle-transaction');
    fs.mkdirSync(transactionRoot);
    fs.writeFileSync(path.join(transactionRoot, 'marker'), 'left by an interrupted command\n');
    const before = snapshotTree(paths.lifecycleRoot);

    const output = trace('custom');
    assert.equal(output.interruptedTransaction, true);
    assert.ok(output.edges.every((edge) => edge.counts));
    assert.equal(trace('custom', PERSPECTIVE, BUILD_STYLE).interruptedTransaction, true);
    assert.equal(buildRegistryTrace({ set: 'builtin', targetRoot }).interruptedTransaction, false);
    assert.deepEqual(snapshotTree(paths.lifecycleRoot), before, 'the transaction and every file are left as they were');
  });
});

test('trace never reads or changes the active set, and writes nothing', () => {
  for (const state of ['{ not json', '{"schemaVersion":"1","activeSet":"custom"}\n', '{"schemaVersion":"1","activeSet":"builtin"}\n']) {
    withCustomSet(({ trace, paths }) => {
      fs.writeFileSync(paths.statePath, state);
      const before = snapshotTree(paths.lifecycleRoot);
      assert.equal(trace('custom').set, 'custom');
      assert.equal(trace('builtin').set, 'builtin');
      trace('custom', PERSPECTIVE, BUILD_STYLE);
      assert.deepEqual(snapshotTree(paths.lifecycleRoot), before);
    });
  }
});

test('usage and lifecycle errors', () => {
  const usage = (options, pattern) =>
    assert.throws(() => buildRegistryTrace(options), (error) => error instanceof RegistryTraceUsageError && pattern.test(error.message));
  usage({}, /needs --set builtin or --set custom/u);
  usage({ set: 'active' }, /needs --set builtin or --set custom/u);
  usage({ set: 'builtin', registryId: 'naming/nothing', address: 'x' }, /Unknown registry id: naming\/nothing/u);
  usage({ set: 'builtin', registryId: 'naming/categories', address: 'categories[name="x"]' }, /not an address the comparison declaration of naming\/categories can produce/u);
  usage({ set: 'builtin', registryId: 'naming/categories', address: 'categories' }, /not an address/u);
  usage({ set: 'builtin', registryId: 'naming/categories' }, /not an address/u);

  // No Custom set; a lifecycle root resolving outside the target.
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-trace-empty-'));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-trace-outside-'));
  try {
    fs.writeFileSync(path.join(targetRoot, 'package.json'), '{"name":"fixture","private":true}\n');
    assert.throws(() => buildRegistryTrace({ set: 'custom', targetRoot }), /No Custom registry set exists/u);
    assert.equal(buildRegistryTrace({ set: 'builtin', targetRoot }).set, 'builtin');
    fs.symlinkSync(outsideRoot, path.join(targetRoot, '.calculogic'));
    assert.throws(() => buildRegistryTrace({ set: 'custom', targetRoot }), /resolves outside the validation target/u);
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test('the CLI: trace prints JSON and exits 0; usage and lifecycle errors exit 1 on stderr', () => {
  withCustomSet(({ targetRoot, change }) => {
    change('naming/categories', (payload) => {
      payload.categories = payload.categories.filter((entry) => entry.category !== 'concern-style');
    });
    const run = (args) => spawnSync(process.execPath, ['--experimental-strip-types', registryBinPath, ...args], { cwd: targetRoot, encoding: 'utf8' });

    const whole = run(['trace', '--set', 'custom']);
    assert.equal(whole.status, 0, whole.stderr);
    assert.deepEqual(JSON.parse(whole.stdout), buildRegistryTrace({ set: 'custom', targetRoot }));

    const entry = run(['trace', '--set', 'custom', 'naming/categories', CONCERN_STYLE]);
    assert.equal(entry.status, 0, entry.stderr);
    assert.equal(JSON.parse(entry.stdout).reverse[0].state, 'unresolved');

    for (const args of [
      ['trace'],
      ['trace', 'builtin'],
      ['trace', '--set'],
      ['trace', '--set', 'active'],
      ['trace', '--set', 'builtin', 'naming/categories'],
      ['trace', '--set', 'builtin', 'naming/categories', 'categories', 'extra'],
      ['trace', '--set', 'builtin', 'naming/nothing', 'x'],
    ]) {
      const result = run(args);
      assert.equal(result.status, 1, args.join(' '));
      assert.equal(result.stdout, '', args.join(' '));
      assert.match(result.stderr, /Usage: calculogic-validator-registry/u, args.join(' '));
    }

    fs.rmSync(path.join(targetRoot, '.calculogic'), { recursive: true });
    const noSet = run(['trace', '--set', 'custom']);
    assert.equal(noSet.status, 1);
    assert.match(noSet.stderr, /No Custom registry set exists/u);
    assert.equal(run(['trace', '--set', 'builtin']).status, 0);
  });
});

test('potential impact lists each dependent once, even when it names the target through two edges', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-trace-synthetic-'));
  try {
    writeJson(path.join(root, 'source.registry.json'), { version: '1', items: [{ id: 'x' }] });
    writeJson(path.join(root, 'target.registry.json'), { version: '1', things: [{ name: 't1' }] });
    const entry = (name, comparison, references = []) => ({
      registryId: `test/${name}`,
      name,
      fileName: `${name}.registry.json`,
      readableVersions: ['1'],
      descriptor: {},
      comparison,
      references,
    });
    const slices = [
      {
        sliceId: 'test',
        builtinRoot: root,
        inventory: [
          entry('source', [{ kind: 'keyed', path: 'items', key: 'id' }], [
            { edgeId: 'test/b-edge', to: 'test/target', targetCollection: 'things' },
            { edgeId: 'test/a-edge', to: 'test/target', targetCollection: 'things' },
          ]),
          entry('target', [{ kind: 'keyed', path: 'things', key: 'name' }]),
        ],
      },
    ];
    const reference = (edgeId) => ({ edgeId, source: { collection: 'items', groups: [], key: 'x' }, target: { groups: [], key: 't1' } });
    const resolvers = { test: { versions: ['1'], resolve: () => [reference('test/b-edge'), reference('test/a-edge')] } };
    const output = buildRegistryTrace({ set: 'builtin', registryId: 'test/target', address: 'things[name="t1"]', slices, resolvers });
    assert.deepEqual(output.reverse.map((item) => item.edgeId), ['test/a-edge', 'test/b-edge']);
    assert.deepEqual(output.impact, [{ registryId: 'test/source', address: 'items[id="x"]' }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
