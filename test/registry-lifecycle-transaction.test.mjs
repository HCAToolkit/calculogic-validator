import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveRegistryLifecyclePaths } from '../src/core/registry-lifecycle/registry-lifecycle-state.logic.mjs';
import {
  LIFECYCLE_TRANSACTION_SIMULATED_CRASH,
  recoverLifecycleTransaction,
  runLifecycleTransaction,
} from '../src/core/registry-lifecycle/registry-lifecycle-transaction.logic.mjs';
import { LIFECYCLE_TRANSACTION_DIRNAME } from '../src/core/registry-lifecycle/registry-lifecycle.contracts.mjs';

const withLifecycleRoot = (run) => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-transaction-'));
  try {
    const paths = resolveRegistryLifecyclePaths({ targetRoot });
    fs.mkdirSync(paths.customRoot, { recursive: true });
    return run({ targetRoot, paths, transactionRoot: path.join(paths.lifecycleRoot, LIFECYCLE_TRANSACTION_DIRNAME) });
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
};

const failAt = (boundary, { crash = false } = {}) => (step) => {
  if (step === boundary) {
    throw Object.assign(new Error(`at ${step}`), crash ? { [LIFECYCLE_TRANSACTION_SIMULATED_CRASH]: true } : {});
  }
};

test('directories a transaction creates are created on commit and removed on rollback', () => {
  withLifecycleRoot(({ paths, transactionRoot }) => {
    const nested = path.join(paths.customRoot, 'new-slice', 'deeper', 'file.json');
    const commit = path.join(paths.customRoot, 'commit.json');
    fs.writeFileSync(commit, 'old');
    const writes = [
      { targetPath: nested, contents: 'nested' },
      { targetPath: commit, contents: 'new' },
    ];

    assert.throws(() => runLifecycleTransaction({ paths, writes, onStep: failAt('step-1:backed-up') }), /at step-1:backed-up/u);
    assert.equal(fs.existsSync(path.join(paths.customRoot, 'new-slice')), false);
    assert.equal(fs.readFileSync(commit, 'utf8'), 'old');
    assert.equal(fs.existsSync(transactionRoot), false);

    runLifecycleTransaction({ paths, writes });
    assert.equal(fs.readFileSync(nested, 'utf8'), 'nested');
    assert.equal(fs.readFileSync(commit, 'utf8'), 'new');
    assert.equal(fs.existsSync(transactionRoot), false);
  });
});

test('recovery rolls back an uncommitted transaction and keeps a committed one', () => {
  withLifecycleRoot(({ paths, transactionRoot }) => {
    const first = path.join(paths.customRoot, 'first.json');
    const commit = path.join(paths.customRoot, 'commit.json');
    fs.writeFileSync(first, 'first-old');
    fs.writeFileSync(commit, 'commit-old');
    const writes = [
      { targetPath: first, contents: 'first-new' },
      { targetPath: commit, contents: 'commit-new' },
    ];

    assert.equal(recoverLifecycleTransaction(paths), null);

    assert.throws(() => runLifecycleTransaction({ paths, writes, onStep: failAt('step-0:applied', { crash: true }) }));
    assert.equal(fs.readFileSync(first, 'utf8'), 'first-new');
    assert.throws(() => runLifecycleTransaction({ paths, writes }), /interrupted lifecycle transaction exists/u);
    assert.deepEqual(recoverLifecycleTransaction(paths), { outcome: 'rolled-back' });
    assert.equal(fs.readFileSync(first, 'utf8'), 'first-old');
    assert.equal(fs.readFileSync(commit, 'utf8'), 'commit-old');
    assert.equal(fs.existsSync(transactionRoot), false);

    assert.throws(() => runLifecycleTransaction({ paths, writes, onStep: failAt('committed', { crash: true }) }));
    assert.deepEqual(recoverLifecycleTransaction(paths), { outcome: 'committed' });
    assert.equal(fs.readFileSync(first, 'utf8'), 'first-new');
    assert.equal(fs.readFileSync(commit, 'utf8'), 'commit-new');
    assert.equal(fs.existsSync(transactionRoot), false);
  });
});

test('an ordinary error after the commit point is not a failure', () => {
  withLifecycleRoot(({ paths, transactionRoot }) => {
    const commit = path.join(paths.customRoot, 'commit.json');
    runLifecycleTransaction({ paths, writes: [{ targetPath: commit, contents: 'new' }], onStep: failAt('committed') });
    assert.equal(fs.readFileSync(commit, 'utf8'), 'new');
    assert.equal(fs.existsSync(transactionRoot), true, 'left for recovery');
    assert.deepEqual(recoverLifecycleTransaction(paths), { outcome: 'committed' });
  });
});

test('a target that resolves outside the validation target is refused before anything is written', () => {
  withLifecycleRoot(({ paths, transactionRoot }) => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-transaction-outside-'));
    try {
      fs.symlinkSync(outside, path.join(paths.customRoot, 'escape'));
      assert.throws(
        () =>
          runLifecycleTransaction({
            paths,
            writes: [{ targetPath: path.join(paths.customRoot, 'escape', 'file.json'), contents: 'x' }],
          }),
        /resolves outside the validation target/u,
      );
      assert.deepEqual(fs.readdirSync(outside), []);
      assert.equal(fs.existsSync(transactionRoot), false);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

test('a journal naming a path outside the lifecycle root is refused, and nothing is touched', () => {
  withLifecycleRoot(({ paths, transactionRoot }) => {
    fs.mkdirSync(transactionRoot);
    fs.writeFileSync(
      path.join(transactionRoot, 'journal.json'),
      JSON.stringify({
        schemaVersion: '1',
        steps: [{ target: '../../outside.json', existed: false }],
        createdDirectories: [],
        commitSha256: '0'.repeat(64),
      }),
    );
    assert.throws(() => recoverLifecycleTransaction(paths), /outside the lifecycle root/u);
    assert.equal(fs.existsSync(path.join(transactionRoot, 'journal.json')), true);
  });
});
