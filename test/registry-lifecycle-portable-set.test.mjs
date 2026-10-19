import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initCustomRegistrySet } from '../src/core/registry-lifecycle/registry-lifecycle-init.logic.mjs';
import {
  checkPortableSet,
  exportPortableSet,
  importPortableSet,
  portableSetPath,
} from '../src/core/registry-lifecycle/registry-lifecycle-portable-set.logic.mjs';
import { buildRegistryLifecycleStatus } from '../src/core/registry-lifecycle/registry-lifecycle-status.logic.mjs';
import { resolveRegistryLifecyclePaths } from '../src/core/registry-lifecycle/registry-lifecycle-state.logic.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryBinPath = path.join(packageRoot, 'bin/calculogic-validator-registry.host.mjs');
const VERSION = '0.0.0-test';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);

// Every entry under `root`, with its bytes or link target, so a test can prove what was written.
const snapshotTree = (root) =>
  fs.existsSync(root)
    ? fs
        .readdirSync(root, { recursive: true })
        .sort()
        .map((relativePath) => {
          const filePath = path.join(root, relativePath);
          const stat = fs.lstatSync(filePath);
          if (stat.isSymbolicLink()) {
            return [relativePath, `link:${fs.readlinkSync(filePath)}`];
          }
          return [relativePath, stat.isFile() ? fs.readFileSync(filePath, 'base64') : null];
        })
    : null;

// Two repositories: `source` with an initialized Custom set, and an empty `receiving` one.
const withRepositories = (run) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-portable-'));
  const repository = (name) => {
    const targetRoot = path.join(fixtureRoot, name);
    fs.mkdirSync(targetRoot);
    fs.writeFileSync(path.join(targetRoot, 'package.json'), `{"name":"${name}","private":true}\n`);
    const paths = resolveRegistryLifecyclePaths({ targetRoot });
    const customFile = (relativePath) => path.join(paths.customRoot, ...relativePath.split('/'));
    return { targetRoot, paths, customFile };
  };
  try {
    const source = repository('source');
    const receiving = repository('receiving');
    initCustomRegistrySet({ targetRoot: source.targetRoot, validatorVersion: VERSION });
    const exportSource = () => exportPortableSet({ targetRoot: source.targetRoot, validatorVersion: VERSION });
    const check = (document) => checkPortableSet({ document, targetRoot: receiving.targetRoot });
    const importInto = (document) => importPortableSet({ document, targetRoot: receiving.targetRoot });
    return run({ fixtureRoot, source, receiving, exportSource, check, importInto });
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
};

// An artifact with one file's text replaced, its hash kept consistent so only the content differs.
const withFile = (artifact, filePath, update) => ({
  ...artifact,
  files: artifact.files.map((file) => {
    if (file.path !== filePath) {
      return file;
    }
    const text = update(file.text);
    return { path: file.path, text, sha256: sha256(Buffer.from(text, 'utf8')) };
  }),
});
const withoutFile = (artifact, filePath) => ({ ...artifact, files: artifact.files.filter((file) => file.path !== filePath) });
const jsonEdit = (update) => (text) => {
  const payload = JSON.parse(text);
  update(payload);
  return `${JSON.stringify(payload, null, 2)}\n`;
};
const problemsOf = (result) => result.problems.map(({ path: filePath, registryId, problem }) => [problem, filePath ?? registryId ?? null]);

test('export is deterministic, lists every layout file with its exact bytes, and writes nothing', () => {
  withRepositories(({ source, exportSource }) => {
    const before = snapshotTree(source.paths.lifecycleRoot);
    const artifact = exportSource();
    assert.deepEqual(Object.keys(artifact), ['kind', 'schemaVersion', 'exportedBy', 'files']);
    assert.equal(artifact.kind, 'calculogic-registry-set');
    assert.equal(artifact.schemaVersion, '1');
    assert.deepEqual(artifact.exportedBy, { validatorVersion: VERSION });

    const paths = artifact.files.map((file) => file.path);
    assert.deepEqual(paths, [...paths].sort());
    assert.ok(paths.includes('registry-set.manifest.json'));
    assert.ok(paths.includes('naming/roles.registry.json'));
    assert.ok(paths.includes('.baseline/naming/roles.registry.json'));
    for (const file of artifact.files) {
      const bytes = fs.readFileSync(source.customFile(file.path));
      assert.equal(file.text, bytes.toString('utf8'), file.path);
      assert.equal(file.sha256, sha256(bytes), file.path);
    }
    assert.deepEqual(exportSource(), artifact);
    assert.deepEqual(snapshotTree(source.paths.lifecycleRoot), before);
  });
});

test('export and import round trip byte for byte, including bytes no JSON tool would keep', () => {
  withRepositories(({ source, receiving, exportSource, importInto }) => {
    // A byte order mark, CRLF line endings and unusual spacing: kept exactly, never normalized.
    const odd = `﻿{\r\n  "version":   "1",\r\n  "categories": ${JSON.stringify(readJson(source.customFile('naming/categories.registry.json')).categories)}\r\n}`;
    fs.writeFileSync(source.customFile('naming/categories.registry.json'), odd);

    const result = importInto(exportSource());
    assert.equal(result.installed, true);
    assert.equal(result.activated, false);
    assert.deepEqual(snapshotTree(receiving.paths.customRoot), snapshotTree(source.paths.customRoot));
    assert.equal(fs.readFileSync(receiving.customFile('naming/categories.registry.json'), 'utf8'), odd);
    // The installed set is the source set: `status` reports the same registries.
    assert.deepEqual(
      buildRegistryLifecycleStatus({ targetRoot: receiving.targetRoot }).registries,
      buildRegistryLifecycleStatus({ targetRoot: source.targetRoot }).registries,
    );
  });
});

test('import-check is read-only, describes the set as status will, and does not depend on the active set', () => {
  withRepositories(({ source, receiving, exportSource, check }) => {
    const artifact = exportSource();
    fs.mkdirSync(receiving.paths.lifecycleRoot, { recursive: true });
    writeJson(receiving.paths.statePath, { schemaVersion: '1', activeSet: 'builtin' });
    const before = snapshotTree(receiving.paths.lifecycleRoot);
    const temporaryBefore = fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('calculogic-registry-import-'));

    const result = check(artifact);
    assert.deepEqual([result.valid, result.problems, result.environment], [true, [], []]);
    const sourceStatus = buildRegistryLifecycleStatus({ targetRoot: source.targetRoot });
    assert.deepEqual(result.status.registries, sourceStatus.registries);
    assert.deepEqual(result.status.customIssues, sourceStatus.customIssues);
    assert.equal(result.status.activeSet, undefined);
    assert.deepEqual(snapshotTree(receiving.paths.lifecycleRoot), before);
    assert.deepEqual(
      fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('calculogic-registry-import-')),
      temporaryBefore,
      'the temporary copy is removed',
    );
  });
});

test('artifact problems block: shape, schema, paths, duplicates and integrity', () => {
  withRepositories(({ exportSource, check, importInto, receiving }) => {
    const artifact = exportSource();
    const manifest = artifact.files.find((file) => file.path === 'registry-set.manifest.json');
    const cases = [
      ['not an object', [], [['malformed', null]]],
      ['another kind', { ...artifact, kind: 'other' }, [['malformed', null]]],
      ['an unknown field', { ...artifact, extra: true }, [['malformed', null]]],
      ['another schema', { ...artifact, schemaVersion: '2' }, [['unsupported-schema', null]]],
      ['no exporter version', { ...artifact, exportedBy: { validatorVersion: ' ' } }, [['malformed', null]]],
      ['a malformed file record', { ...artifact, files: [{ ...manifest, sha256: 'ABC' }] }, [['malformed', 'registry-set.manifest.json']]],
      ['files not a list', { ...artifact, files: {} }, [['malformed', null]]],
    ];
    for (const [label, document, expected] of cases) {
      assert.deepEqual(problemsOf(check(document)), expected, label);
    }

    const extra = (filePath) => ({ ...artifact, files: [...artifact.files, { path: filePath, text: '{}', sha256: sha256(Buffer.from('{}')) }] });
    for (const filePath of [
      '../outside.registry.json',
      'naming/../../outside.registry.json',
      '/etc/passwd',
      'naming/notes.md',
      'unknown-slice/roles.registry.json',
      'naming/Roles.registry.json',
      '.baseline/registry-set.manifest.json',
      'naming/sub/roles.registry.json',
      '.lifecycle-transaction/journal.json',
    ]) {
      assert.deepEqual(problemsOf(check(extra(filePath))), [['unexpected-path', filePath]], filePath);
    }
    assert.deepEqual(problemsOf(check({ ...artifact, files: [...artifact.files, manifest] })), [['unexpected-path', 'registry-set.manifest.json']]);

    const tampered = { ...artifact, files: artifact.files.map((file) => (file.path === 'naming/roles.registry.json' ? { ...file, text: `${file.text} ` } : file)) };
    assert.deepEqual(problemsOf(check(tampered)), [['integrity', 'naming/roles.registry.json']]);

    // A refused artifact installs nothing.
    const refused = importInto(tampered);
    assert.equal(refused.installed, false);
    assert.equal(fs.existsSync(receiving.paths.customRoot), false);
  });
});

test('a malformed manifest or an untrusted merge base blocks', () => {
  withRepositories(({ exportSource, check }) => {
    const artifact = exportSource();
    assert.deepEqual(problemsOf(check(withoutFile(artifact, 'registry-set.manifest.json'))), [['manifest-malformed', null]]);
    assert.deepEqual(problemsOf(check(withFile(artifact, 'registry-set.manifest.json', () => '{ not json'))), [['manifest-malformed', null]]);

    // A Baseline copy that does not match its manifest digest, or is missing.
    const changedBaseline = withFile(artifact, '.baseline/naming/roles.registry.json', jsonEdit((payload) => {
      payload.roles = payload.roles.slice(1);
    }));
    assert.deepEqual(problemsOf(check(changedBaseline)), [['baseline-mismatch', 'naming/roles']]);
    assert.deepEqual(problemsOf(check(withoutFile(artifact, '.baseline/naming/roles.registry.json'))), [['baseline-mismatch', 'naming/roles']]);

    // A Baseline at a version this release cannot describe: unverifiable, so it blocks too.
    const unverifiable = withFile(artifact, 'registry-set.manifest.json', jsonEdit((manifest) => {
      manifest.basedOn.registries['naming/roles'].version = '9';
    }));
    assert.deepEqual(problemsOf(check(unverifiable)), [['baseline-unverifiable', 'naming/roles']]);

    // Details never name the temporary copy.
    const detail = JSON.stringify(check(withoutFile(artifact, 'registry-set.manifest.json')));
    assert.doesNotMatch(detail, /calculogic-registry-import-/u);
  });
});

test('an invalid, incomplete or older set imports, and status reports it; nothing is activated', () => {
  withRepositories(({ exportSource, check, importInto, receiving }) => {
    let artifact = exportSource();
    // Slice validation fails: a perspective category no categories registry declares.
    artifact = withFile(artifact, 'naming/categories.registry.json', jsonEdit((payload) => {
      payload.categories = payload.categories.filter((entry) => entry.category !== 'concern-style');
    }));
    // A registry an older release did not have.
    artifact = withoutFile(withoutFile(artifact, 'tree/structural-homes.registry.json'), '.baseline/tree/structural-homes.registry.json');
    artifact = withFile(artifact, 'registry-set.manifest.json', jsonEdit((manifest) => {
      delete manifest.basedOn.registries['tree/structural-homes'];
    }));
    // A registry at a version this release does not read.
    artifact = withFile(artifact, 'suite/exit-policy.registry.json', jsonEdit((payload) => {
      payload.version = '2';
    }));
    // A registry no current inventory knows: an orphan, with a manifest entry whose Baseline this
    // release cannot verify. An orphan's merge base is never used, so that does not block.
    artifact = { ...artifact, files: [...artifact.files, { path: 'naming/retired-thing.registry.json', text: '{"version":"1"}\n', sha256: sha256(Buffer.from('{"version":"1"}\n')) }].sort((left, right) => (left.path < right.path ? -1 : 1)) };
    artifact = withFile(artifact, 'registry-set.manifest.json', jsonEdit((manifest) => {
      manifest.basedOn.registries['naming/retired-thing'] = { validatorVersion: VERSION, version: '1', digest: '0'.repeat(64) };
    }));

    const result = check(artifact);
    assert.deepEqual(result.problems, []);
    assert.equal(result.valid, true);
    const classes = Object.fromEntries(result.status.registries.map((entry) => [entry.registryId, entry.classification]));
    assert.equal(classes['naming/category-role-perspective'], 'invalid');
    assert.equal(classes['tree/structural-homes'], 'missing');
    assert.equal(classes['suite/exit-policy'], 'version-incompatible');
    assert.equal(classes['naming/retired-thing'], 'orphan');
    assert.deepEqual(result.status.orphanRegistries, ['naming/retired-thing']);

    const imported = importInto(artifact);
    assert.deepEqual([imported.installed, imported.activated], [true, false]);
    assert.deepEqual(imported.status, result.status);
    assert.equal(fs.existsSync(receiving.paths.statePath), false, 'registry-state.json is never written');
    assert.equal(buildRegistryLifecycleStatus({ targetRoot: receiving.targetRoot }).activeSet, 'builtin');
  });
});

test('the receiving repository refuses: an existing set, a pending transaction, Custom selected', () => {
  withRepositories(({ exportSource, check, importInto, receiving }) => {
    const artifact = exportSource();
    const conditionsOf = (result) => result.environment.map((item) => item.condition);

    // Custom selected without a set: importing would activate it without `use custom`.
    fs.mkdirSync(receiving.paths.lifecycleRoot, { recursive: true });
    writeJson(receiving.paths.statePath, { schemaVersion: '1', activeSet: 'custom' });
    assert.deepEqual(conditionsOf(check(artifact)), ['custom-selected']);
    assert.equal(check(artifact).valid, true, 'the artifact itself is importable');
    let before = snapshotTree(receiving.paths.lifecycleRoot);
    assert.deepEqual(importInto(artifact).environment.map((item) => item.condition), ['custom-selected']);
    assert.deepEqual(snapshotTree(receiving.paths.lifecycleRoot), before);
    writeJson(receiving.paths.statePath, { schemaVersion: '1', activeSet: 'builtin' });

    // A pending transaction.
    const transactionRoot = path.join(receiving.paths.lifecycleRoot, '.lifecycle-transaction');
    fs.mkdirSync(transactionRoot);
    assert.deepEqual(conditionsOf(check(artifact)), ['transaction-pending']);
    before = snapshotTree(receiving.paths.lifecycleRoot);
    assert.equal(importInto(artifact).installed, false);
    assert.deepEqual(snapshotTree(receiving.paths.lifecycleRoot), before);
    fs.rmSync(transactionRoot, { recursive: true });

    // An existing set is never replaced.
    assert.equal(importInto(artifact).installed, true);
    const installed = snapshotTree(receiving.paths.customRoot);
    const refused = importInto(withFile(artifact, 'naming/roles.registry.json', (text) => text));
    assert.deepEqual([refused.installed, refused.environment.map((item) => item.condition)], [false, ['custom-set-exists']]);
    assert.deepEqual(snapshotTree(receiving.paths.customRoot), installed);
  });
});

test('a failed install leaves no Custom set and no staging directory', () => {
  withRepositories(({ exportSource, importInto, receiving }) => {
    const artifact = exportSource();
    // Fail the third file written into the staging directory inside the lifecycle root (the check's
    // temporary copy, outside the repository, is not counted).
    fs.mkdirSync(receiving.paths.lifecycleRoot, { recursive: true });
    const originalWrite = fs.writeFileSync;
    let stagedWrites = 0;
    fs.writeFileSync = (...args) => {
      if (String(args[0]).startsWith(receiving.paths.lifecycleRoot)) {
        stagedWrites += 1;
        if (stagedWrites === 3) {
          throw new Error('disk full');
        }
      }
      return originalWrite(...args);
    };
    try {
      assert.throws(() => importInto(artifact), /disk full/u);
    } finally {
      fs.writeFileSync = originalWrite;
    }
    assert.equal(stagedWrites, 3, 'the failure happened while staging');
    assert.equal(fs.existsSync(receiving.paths.customRoot), false);
    assert.deepEqual(fs.readdirSync(receiving.paths.lifecycleRoot), []);
  });
});

test('export refuses what is not a portable set, and never reads through an escaping path', () => {
  withRepositories(({ fixtureRoot, source, exportSource }) => {
    const refused = (pattern) => assert.throws(exportSource, pattern);

    fs.writeFileSync(source.customFile('naming/notes.md'), 'notes\n');
    refused(/naming\/notes\.md is not part of the Custom set layout/u);
    fs.rmSync(source.customFile('naming/notes.md'));

    fs.writeFileSync(source.customFile('naming/roles.registry.json'), Buffer.from([0x7b, 0xff, 0x7d]));
    refused(/naming\/roles\.registry\.json is not valid UTF-8/u);
    fs.copyFileSync(source.customFile('.baseline/naming/roles.registry.json'), source.customFile('naming/roles.registry.json'));

    const outside = path.join(fixtureRoot, 'outside.registry.json');
    fs.copyFileSync(source.customFile('naming/categories.registry.json'), outside);
    fs.rmSync(source.customFile('naming/categories.registry.json'));
    fs.symlinkSync(outside, source.customFile('naming/categories.registry.json'));
    refused(/naming\/categories\.registry\.json resolves outside the validation target/u);
    fs.rmSync(source.customFile('naming/categories.registry.json'));
    fs.copyFileSync(outside, source.customFile('naming/categories.registry.json'));

    // A symlink that stays inside the target is read, and arrives as a regular file.
    fs.rmSync(source.customFile('naming/categories.registry.json'));
    fs.symlinkSync(source.customFile('.baseline/naming/categories.registry.json'), source.customFile('naming/categories.registry.json'));
    assert.ok(exportSource().files.some((file) => file.path === 'naming/categories.registry.json'));

    fs.mkdirSync(path.join(source.paths.lifecycleRoot, '.lifecycle-transaction'));
    refused(/interrupted lifecycle transaction is pending/u);
    fs.rmSync(path.join(source.paths.lifecycleRoot, '.lifecycle-transaction'), { recursive: true });

    fs.rmSync(source.paths.customRoot, { recursive: true });
    refused(/No Custom registry set exists/u);
  });
});

test('the path allow-list', () => {
  const slices = new Set(['naming', 'tree', 'suite']);
  for (const accepted of ['registry-set.manifest.json', 'naming/roles.registry.json', '.baseline/tree/folder-kinds.registry.json', 'suite/exit-policy.registry.json']) {
    assert.equal(portableSetPath(accepted, slices), true, accepted);
  }
  for (const refused of ['naming', '.baseline/naming', 'naming/roles.json', 'naming/-roles.registry.json', 'naming/roles--x.registry.json', 'naming\\roles.registry.json', '.baseline/.baseline/naming/roles.registry.json', 'naming/./roles.registry.json', '']) {
    assert.equal(portableSetPath(refused, slices), false, refused);
  }
});

test('the CLI: export, import-check and import', () => {
  withRepositories(({ fixtureRoot, source, receiving }) => {
    const run = (cwd, args) => spawnSync(process.execPath, ['--experimental-strip-types', registryBinPath, ...args], { cwd, encoding: 'utf8' });
    const exported = run(source.targetRoot, ['export']);
    assert.equal(exported.status, 0, exported.stderr);
    const artifactPath = path.join(fixtureRoot, 'set.json');
    fs.writeFileSync(artifactPath, exported.stdout);
    assert.deepEqual(JSON.parse(exported.stdout).files.map((file) => file.path), exportPortableSet({ targetRoot: source.targetRoot, validatorVersion: VERSION }).files.map((file) => file.path));

    const checked = run(receiving.targetRoot, ['import-check', artifactPath]);
    assert.equal(checked.status, 0, checked.stderr);
    assert.equal(JSON.parse(checked.stdout).valid, true);

    const imported = run(receiving.targetRoot, ['import', artifactPath]);
    assert.equal(imported.status, 0, imported.stderr);
    assert.deepEqual(Object.keys(JSON.parse(imported.stdout)), ['command', 'installed', 'activated', 'status']);

    // Now the set exists: the check reports it and import refuses, both with exit 1.
    assert.equal(run(receiving.targetRoot, ['import-check', artifactPath]).status, 1);
    const again = run(receiving.targetRoot, ['import', artifactPath]);
    assert.equal(again.status, 1);
    assert.equal(JSON.parse(again.stdout).installed, false);

    assert.equal(run(receiving.targetRoot, ['import-check']).status, 1);
    assert.equal(run(receiving.targetRoot, ['export', 'extra']).status, 1);
    const unreadable = run(receiving.targetRoot, ['import-check', path.join(fixtureRoot, 'missing.json')]);
    assert.equal(unreadable.status, 1);
    assert.match(unreadable.stderr, /Cannot read/u);
    fs.rmSync(source.paths.customRoot, { recursive: true });
    const noSet = run(source.targetRoot, ['export']);
    assert.equal(noSet.status, 1);
    assert.match(noSet.stderr, /No Custom registry set exists/u);
  });
});
