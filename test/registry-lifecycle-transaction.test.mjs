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

test('an existing symlink at a target is backed up and restored as a link, and a directory is refused', () => {
  withLifecycleRoot(({ paths, transactionRoot }) => {
    const linkTarget = path.join(paths.customRoot, 'real.json');
    fs.writeFileSync(linkTarget, 'real');
    const link = path.join(paths.customRoot, 'link.json');
    fs.symlinkSync(linkTarget, link);
    const commit = path.join(paths.customRoot, 'commit.json');
    fs.writeFileSync(commit, 'old');
    const writes = [
      { targetPath: link, contents: 'replacement' },
      { targetPath: commit, contents: 'new' },
    ];

    assert.throws(() => runLifecycleTransaction({ paths, writes, onStep: failAt('step-1:backed-up') }));
    assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
    assert.equal(fs.readlinkSync(link), linkTarget);
    assert.equal(fs.readFileSync(linkTarget, 'utf8'), 'real');

    assert.throws(() => runLifecycleTransaction({ paths, writes, onStep: failAt('step-0:applied', { crash: true }) }));
    assert.deepEqual(recoverLifecycleTransaction(paths), { outcome: 'rolled-back' });
    assert.equal(fs.readlinkSync(link), linkTarget);
    assert.equal(fs.readFileSync(linkTarget, 'utf8'), 'real');

    const directoryTarget = path.join(paths.customRoot, 'a-directory');
    fs.mkdirSync(directoryTarget);
    assert.throws(
      () => runLifecycleTransaction({ paths, writes: [{ targetPath: directoryTarget, contents: 'x' }] }),
      /is a directory/u,
    );
    assert.equal(fs.existsSync(transactionRoot), false);
  });
});

test('a relative symlink target, which dangles once moved to the backup, is still restored', () => {
  withLifecycleRoot(({ paths }) => {
    fs.writeFileSync(path.join(paths.customRoot, 'real.json'), 'real');
    const link = path.join(paths.customRoot, 'link.json');
    fs.symlinkSync('real.json', link);
    const commit = path.join(paths.customRoot, 'commit.json');
    fs.writeFileSync(commit, 'old');
    const writes = [
      { targetPath: link, contents: 'replacement' },
      { targetPath: commit, contents: 'new' },
    ];

    assert.throws(() => runLifecycleTransaction({ paths, writes, onStep: failAt('step-1:backed-up') }));
    assert.equal(fs.readlinkSync(link), 'real.json');

    assert.throws(() => runLifecycleTransaction({ paths, writes, onStep: failAt('step-1:backed-up', { crash: true }) }));
    assert.deepEqual(recoverLifecycleTransaction(paths), { outcome: 'rolled-back' });
    assert.equal(fs.readlinkSync(link), 'real.json');
    assert.equal(fs.readFileSync(link, 'utf8'), 'real');
    assert.equal(fs.readFileSync(commit, 'utf8'), 'old');
  });
});

test('recovery refuses a transaction or backup directory replaced by a symlink, and moves nothing', () => {
  withLifecycleRoot(({ paths, transactionRoot }) => {
    const first = path.join(paths.customRoot, 'first.json');
    const commit = path.join(paths.customRoot, 'commit.json');
    fs.writeFileSync(first, 'first-old');
    fs.writeFileSync(commit, 'commit-old');
    const writes = [
      { targetPath: first, contents: 'first-new' },
      { targetPath: commit, contents: 'commit-new' },
    ];
    assert.throws(() => runLifecycleTransaction({ paths, writes, onStep: failAt('step-0:applied', { crash: true }) }));

    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-transaction-backup-'));
    try {
      fs.writeFileSync(path.join(outside, '0'), 'outside');
      const backupRoot = path.join(transactionRoot, 'backup');
      fs.renameSync(backupRoot, `${backupRoot}.moved`);
      fs.symlinkSync(outside, backupRoot);
      assert.throws(() => recoverLifecycleTransaction(paths), /not an ordinary directory/u);
      assert.equal(fs.readFileSync(path.join(outside, '0'), 'utf8'), 'outside');
      assert.equal(fs.readFileSync(first, 'utf8'), 'first-new', 'nothing was rolled back');

      // An in-target symlink is refused too: only the transaction's own directory is trusted.
      fs.rmSync(backupRoot);
      fs.symlinkSync(`${backupRoot}.moved`, backupRoot);
      assert.throws(() => recoverLifecycleTransaction(paths), /not an ordinary directory/u);

      fs.rmSync(backupRoot);
      fs.renameSync(`${backupRoot}.moved`, backupRoot);
      assert.deepEqual(recoverLifecycleTransaction(paths), { outcome: 'rolled-back' });
      assert.equal(fs.readFileSync(first, 'utf8'), 'first-old');
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

test('a target whose existing parent is not a directory is refused before staging', () => {
  withLifecycleRoot(({ paths, transactionRoot }) => {
    fs.writeFileSync(path.join(paths.customRoot, '.baseline'), 'a file, not a directory');
    assert.throws(
      () =>
        runLifecycleTransaction({
          paths,
          writes: [
            { targetPath: path.join(paths.customRoot, '.baseline', 'naming', 'x.registry.json'), contents: 'x' },
            { targetPath: path.join(paths.customRoot, 'commit.json'), contents: 'new' },
          ],
        }),
      /parent is not a directory/u,
    );
    assert.equal(fs.existsSync(transactionRoot), false);
    assert.equal(fs.existsSync(path.join(paths.customRoot, 'commit.json')), false);
  });
});

test('a journal replaced by a symlink is refused, never followed or taken for no journal', () => {
  withLifecycleRoot(({ paths, transactionRoot }) => {
    const first = path.join(paths.customRoot, 'first.json');
    const commit = path.join(paths.customRoot, 'commit.json');
    fs.writeFileSync(first, 'first-old');
    fs.writeFileSync(commit, 'commit-old');
    const writes = [
      { targetPath: first, contents: 'first-new' },
      { targetPath: commit, contents: 'commit-new' },
    ];
    assert.throws(() => runLifecycleTransaction({ paths, writes, onStep: failAt('step-0:applied', { crash: true }) }));

    const journalPath = path.join(transactionRoot, 'journal.json');
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-transaction-journal-'));
    try {
      fs.renameSync(journalPath, path.join(outside, 'journal.json'));
      for (const linkTarget of [path.join(outside, 'journal.json'), path.join(outside, 'missing.json')]) {
        fs.symlinkSync(linkTarget, journalPath);
        assert.throws(() => recoverLifecycleTransaction(paths), /journal is not an ordinary file/u);
        assert.equal(fs.existsSync(transactionRoot), true, 'the evidence is kept');
        assert.equal(fs.readFileSync(first, 'utf8'), 'first-new', 'nothing was rolled back');
        fs.rmSync(journalPath);
      }

      fs.renameSync(path.join(outside, 'journal.json'), journalPath);
      assert.deepEqual(recoverLifecycleTransaction(paths), { outcome: 'rolled-back' });
      assert.equal(fs.readFileSync(first, 'utf8'), 'first-old');
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

test('a journaled transaction whose backup directory is gone is refused, and its evidence kept', () => {
  withLifecycleRoot(({ paths, transactionRoot }) => {
    const first = path.join(paths.customRoot, 'first.json');
    const commit = path.join(paths.customRoot, 'commit.json');
    fs.writeFileSync(first, 'first-old');
    fs.writeFileSync(commit, 'commit-old');
    const writes = [
      { targetPath: first, contents: 'first-new' },
      { targetPath: commit, contents: 'commit-new' },
    ];
    assert.throws(() => runLifecycleTransaction({ paths, writes, onStep: failAt('step-0:applied', { crash: true }) }));
    fs.rmSync(path.join(transactionRoot, 'backup'), { recursive: true });

    assert.throws(() => recoverLifecycleTransaction(paths), /not an ordinary directory/u);
    assert.equal(fs.existsSync(path.join(transactionRoot, 'journal.json')), true, 'the evidence is kept');
    assert.equal(fs.readFileSync(first, 'utf8'), 'first-new', 'nothing was rolled back');
    assert.equal(fs.readFileSync(commit, 'utf8'), 'commit-old');
  });
});

test('a step whose backup entry is gone after it was applied is refused, never reported as rolled back', () => {
  withLifecycleRoot(({ paths, transactionRoot }) => {
    const first = path.join(paths.customRoot, 'first.json');
    const commit = path.join(paths.customRoot, 'commit.json');
    fs.writeFileSync(first, 'first-old');
    fs.writeFileSync(commit, 'commit-old');
    const writes = [
      { targetPath: first, contents: 'first-new' },
      { targetPath: commit, contents: 'commit-new' },
    ];

    // Not yet applied: the backup is legitimately absent while the staged copy remains.
    assert.throws(() => runLifecycleTransaction({ paths, writes, onStep: failAt('journaled', { crash: true }) }));
    assert.deepEqual(recoverLifecycleTransaction(paths), { outcome: 'rolled-back' });
    assert.equal(fs.readFileSync(first, 'utf8'), 'first-old');

    assert.throws(() => runLifecycleTransaction({ paths, writes, onStep: failAt('step-0:applied', { crash: true }) }));
    fs.rmSync(path.join(transactionRoot, 'backup', '0'));
    assert.throws(() => recoverLifecycleTransaction(paths), /step for custom\/first\.json is in a state its commit cannot produce/u);
    assert.equal(fs.existsSync(path.join(transactionRoot, 'journal.json')), true, 'the evidence is kept');
    assert.equal(fs.readFileSync(first, 'utf8'), 'first-new', 'nothing was rolled back');
    assert.equal(fs.readFileSync(commit, 'utf8'), 'commit-old');
  });
});

test('a step whose backup entry is gone after it was backed up, but before it was applied, is refused', () => {
  withLifecycleRoot(({ paths, transactionRoot }) => {
    const first = path.join(paths.customRoot, 'first.json');
    const commit = path.join(paths.customRoot, 'commit.json');
    fs.writeFileSync(first, 'first-old');
    fs.writeFileSync(commit, 'commit-old');
    const writes = [
      { targetPath: first, contents: 'first-new' },
      { targetPath: commit, contents: 'commit-new' },
    ];

    assert.throws(() => runLifecycleTransaction({ paths, writes, onStep: failAt('step-0:backed-up', { crash: true }) }));
    assert.equal(fs.existsSync(first), false, 'the original is in the backup at this point');
    fs.rmSync(path.join(transactionRoot, 'backup', '0'));

    assert.throws(() => recoverLifecycleTransaction(paths), /step for custom\/first\.json is in a state its commit cannot produce/u);
    assert.equal(fs.existsSync(path.join(transactionRoot, 'journal.json')), true, 'the evidence is kept');
    assert.equal(fs.readFileSync(commit, 'utf8'), 'commit-old');
  });
});

test('a cleanup that deletes the journal and then fails never makes a committed transaction read as uncommitted', () => {
  withLifecycleRoot(({ paths, transactionRoot }) => {
    const first = path.join(paths.customRoot, 'first.json');
    const commit = path.join(paths.customRoot, 'commit.json');
    fs.writeFileSync(first, 'first-old');
    fs.writeFileSync(commit, 'commit-old');

    // The first recursive removal deletes any journal under it, then fails, as a partial
    // recursive deletion would.
    const originalRmSync = fs.rmSync;
    let failed = false;
    fs.rmSync = (target, options) => {
      if (!failed && options?.recursive) {
        failed = true;
        for (const relativePath of fs.readdirSync(target, { recursive: true })) {
          if (path.basename(relativePath) === 'journal.json') {
            fs.unlinkSync(path.join(target, relativePath));
          }
        }
        throw new Error('partial removal');
      }
      return originalRmSync(target, options);
    };
    try {
      runLifecycleTransaction({
        paths,
        writes: [
          { targetPath: first, contents: 'first-new' },
          { targetPath: commit, contents: 'commit-new' },
        ],
      });
    } finally {
      fs.rmSync = originalRmSync;
    }

    assert.equal(failed, true);
    assert.equal(fs.existsSync(transactionRoot), false, 'the transaction left the view of recovery atomically');
    assert.equal(recoverLifecycleTransaction(paths), null);
    assert.deepEqual(
      fs.readdirSync(paths.lifecycleRoot).filter((name) => name.startsWith('.lifecycle-transaction')),
      [],
      'the retired copy is swept by recovery',
    );
    assert.equal(fs.readFileSync(first, 'utf8'), 'first-new');
    assert.equal(fs.readFileSync(commit, 'utf8'), 'commit-new');
  });
});

test('recovery refuses a transaction directory with any entry the transaction did not write', () => {
  const alterations = {
    'a backup entry replaced by a directory': (transactionRoot) => {
      fs.rmSync(path.join(transactionRoot, 'backup', '0'));
      fs.mkdirSync(path.join(transactionRoot, 'backup', '0'));
    },
    'a staged entry replaced by a directory': (transactionRoot) => {
      fs.mkdirSync(path.join(transactionRoot, 'staged', '1x'));
    },
    'a backup entry for a step that did not replace anything': (transactionRoot) => {
      fs.writeFileSync(path.join(transactionRoot, 'backup', '1'), 'injected');
    },
    'an unexpected top-level entry': (transactionRoot) => {
      fs.writeFileSync(path.join(transactionRoot, 'extra'), 'injected');
    },
    'a missing staged directory': (transactionRoot) => {
      fs.rmSync(path.join(transactionRoot, 'staged'), { recursive: true });
    },
  };

  for (const [label, alter] of Object.entries(alterations)) {
    withLifecycleRoot(({ paths, transactionRoot }) => {
      const first = path.join(paths.customRoot, 'first.json');
      const commit = path.join(paths.customRoot, 'commit.json');
      fs.writeFileSync(first, 'first-old');
      const writes = [
        { targetPath: first, contents: 'first-new' },
        { targetPath: commit, contents: 'commit-new' },
      ];
      assert.throws(() => runLifecycleTransaction({ paths, writes, onStep: failAt('step-0:backed-up', { crash: true }) }), label);
      alter(transactionRoot);

      assert.throws(() => recoverLifecycleTransaction(paths), /was altered|not an ordinary directory/u, label);
      assert.equal(fs.existsSync(path.join(transactionRoot, 'journal.json')), true, label);
      assert.equal(fs.existsSync(first), false, `${label}: nothing was moved onto the target`);
      assert.equal(fs.existsSync(commit), false, label);
    });
  }
});

test('an altered transaction directory is refused even when the commit point was installed', () => {
  withLifecycleRoot(({ paths, transactionRoot }) => {
    const commit = path.join(paths.customRoot, 'commit.json');
    assert.throws(() =>
      runLifecycleTransaction({ paths, writes: [{ targetPath: commit, contents: 'new' }], onStep: failAt('committed', { crash: true }) }),
    );
    fs.writeFileSync(path.join(transactionRoot, 'extra'), 'injected');

    assert.throws(() => recoverLifecycleTransaction(paths), /was altered/u);
    assert.equal(fs.existsSync(path.join(transactionRoot, 'journal.json')), true, 'the evidence is kept');

    fs.rmSync(path.join(transactionRoot, 'extra'));
    assert.deepEqual(recoverLifecycleTransaction(paths), { outcome: 'committed' });
    assert.equal(fs.readFileSync(commit, 'utf8'), 'new');
  });
});

test('a committed transaction that lost a backup entry is refused, never retired as committed', () => {
  withLifecycleRoot(({ paths, transactionRoot }) => {
    const first = path.join(paths.customRoot, 'first.json');
    const commit = path.join(paths.customRoot, 'commit.json');
    fs.writeFileSync(first, 'first-old');
    fs.writeFileSync(commit, 'commit-old');
    const writes = [
      { targetPath: first, contents: 'first-new' },
      { targetPath: commit, contents: 'commit-new' },
    ];
    assert.throws(() => runLifecycleTransaction({ paths, writes, onStep: failAt('committed', { crash: true }) }));
    const backup = path.join(transactionRoot, 'backup', '0');
    const kept = fs.readFileSync(backup);
    fs.rmSync(backup);

    assert.throws(() => recoverLifecycleTransaction(paths), /does not match a committed transaction/u);
    assert.equal(fs.existsSync(path.join(transactionRoot, 'journal.json')), true, 'the evidence is kept');

    fs.writeFileSync(backup, kept);
    assert.deepEqual(recoverLifecycleTransaction(paths), { outcome: 'committed' });
  });
});

test('a step creating a new entry is refused when its staged copy is lost or an entry appeared at its target', () => {
  const alterations = {
    'the staged copy of an unapplied new target is lost': ({ transactionRoot }) => {
      fs.rmSync(path.join(transactionRoot, 'staged', '0'));
    },
    'an unrelated file appeared at an unapplied new target': ({ paths }) => {
      fs.writeFileSync(path.join(paths.customRoot, 'new.json'), 'unrelated');
    },
  };

  for (const [label, alter] of Object.entries(alterations)) {
    withLifecycleRoot(({ paths, transactionRoot }) => {
      const created = path.join(paths.customRoot, 'new.json');
      const commit = path.join(paths.customRoot, 'commit.json');
      fs.writeFileSync(commit, 'commit-old');
      const writes = [
        { targetPath: created, contents: 'created' },
        { targetPath: commit, contents: 'commit-new' },
      ];
      assert.throws(() => runLifecycleTransaction({ paths, writes, onStep: failAt('journaled', { crash: true }) }), label);
      const before = fs.existsSync(created) ? fs.readFileSync(created, 'utf8') : null;
      alter({ paths, transactionRoot });
      const altered = fs.existsSync(created) ? fs.readFileSync(created, 'utf8') : null;

      assert.throws(() => recoverLifecycleTransaction(paths), /state its commit cannot produce/u, label);
      assert.equal(fs.existsSync(path.join(transactionRoot, 'journal.json')), true, label);
      assert.equal(fs.existsSync(created) ? fs.readFileSync(created, 'utf8') : null, altered, `${label}: the target is untouched`);
      assert.equal(before, null, label);
    });
  }
});

test('the sweep removes only directories it retired, and leaves anything else with the same prefix', () => {
  withLifecycleRoot(({ paths }) => {
    const foreignFile = path.join(paths.lifecycleRoot, '.lifecycle-transaction-retired-notes.txt');
    const foreignDirectory = path.join(paths.lifecycleRoot, '.lifecycle-transaction-retired-abc123');
    const ownRetired = path.join(paths.lifecycleRoot, '.lifecycle-transaction-retired-Zz9Zz9');
    fs.writeFileSync(foreignFile, 'keep');
    fs.mkdirSync(foreignDirectory);
    fs.writeFileSync(path.join(foreignDirectory, 'user-data.json'), 'keep');
    fs.mkdirSync(path.join(ownRetired, '.lifecycle-transaction', 'staged'), { recursive: true });

    assert.equal(recoverLifecycleTransaction(paths), null);
    assert.equal(fs.readFileSync(foreignFile, 'utf8'), 'keep');
    assert.equal(fs.readFileSync(path.join(foreignDirectory, 'user-data.json'), 'utf8'), 'keep');
    assert.equal(fs.existsSync(ownRetired), false);
  });
});

test('a rollback interrupted part-way is resumed by the next recovery', () => {
  for (const interruption of ['rollback-step-2:done', 'rollback-step-1:done', 'rollback-step-0:done']) {
    withLifecycleRoot(({ paths, transactionRoot }) => {
      const replaced = path.join(paths.customRoot, 'replaced.json');
      const created = path.join(paths.customRoot, 'created.json');
      const commit = path.join(paths.customRoot, 'commit.json');
      fs.writeFileSync(replaced, 'replaced-old');
      fs.writeFileSync(commit, 'commit-old');
      const writes = [
        { targetPath: replaced, contents: 'replaced-new' },
        { targetPath: created, contents: 'created-new' },
        { targetPath: commit, contents: 'commit-new' },
      ];
      // A failure at the commit point's backup starts a rollback, which then stops part-way.
      const onStep = (step) => {
        if (step === 'step-2:backed-up') {
          throw new Error('fail before commit');
        }
        if (step === interruption) {
          throw Object.assign(new Error('crash during rollback'), { [LIFECYCLE_TRANSACTION_SIMULATED_CRASH]: true });
        }
      };
      assert.throws(() => runLifecycleTransaction({ paths, writes, onStep }), /crash during rollback/u, interruption);
      assert.equal(fs.existsSync(path.join(transactionRoot, 'journal.json')), true, interruption);

      assert.deepEqual(recoverLifecycleTransaction(paths), { outcome: 'rolled-back' }, interruption);
      assert.equal(fs.readFileSync(replaced, 'utf8'), 'replaced-old', interruption);
      assert.equal(fs.existsSync(created), false, interruption);
      assert.equal(fs.readFileSync(commit, 'utf8'), 'commit-old', interruption);
      assert.equal(fs.existsSync(transactionRoot), false, interruption);
    });
  }
});

// Every entry under the lifecycle root except transaction evidence, with its bytes (links as their
// target text), so "back to the pre-command state" is checked byte for byte.
const snapshotWithoutTransaction = (lifecycleRoot) =>
  fs
    .readdirSync(lifecycleRoot, { recursive: true })
    .filter((relativePath) => !relativePath.split(path.sep)[0].startsWith('.lifecycle-transaction'))
    .sort()
    .map((relativePath) => {
      const entryPath = path.join(lifecycleRoot, relativePath);
      const stats = fs.lstatSync(entryPath);
      return [
        relativePath,
        stats.isSymbolicLink() ? `link:${fs.readlinkSync(entryPath)}` : stats.isFile() ? fs.readFileSync(entryPath, 'base64') : 'dir',
      ];
    });

// A replacing step, a creating step (in a new directory) and the commit point. A failure at the
// commit point's backup starts a rollback that undoes them in reverse.
const withRollbackFixture = (run) =>
  withLifecycleRoot(({ paths, transactionRoot }) => {
    const replaced = path.join(paths.customRoot, 'replaced.json');
    const created = path.join(paths.customRoot, 'new-dir', 'created.json');
    const commit = path.join(paths.customRoot, 'commit.json');
    fs.writeFileSync(replaced, 'replaced-old');
    fs.writeFileSync(commit, 'commit-old');
    const before = snapshotWithoutTransaction(paths.lifecycleRoot);
    const writes = [
      { targetPath: replaced, contents: 'replaced-new' },
      { targetPath: created, contents: 'created-new' },
      { targetPath: commit, contents: 'commit-new' },
    ];
    return run({ paths, transactionRoot, writes, before, replaced, created, commit });
  });

const failBeforeCommitThen = (interrupt) => (step) => {
  if (step === 'step-2:backed-up') {
    throw new Error('fail before commit');
  }
  interrupt?.(step);
};

test('recovery resumes a rollback that failed during retirement, and the tree matches the pre-command bytes', () => {
  withRollbackFixture(({ paths, transactionRoot, writes, before }) => {
    const originalRenameSync = fs.renameSync;
    fs.renameSync = (source, destination) => {
      if (source === transactionRoot) {
        throw new Error('retirement rename failed');
      }
      return originalRenameSync(source, destination);
    };
    try {
      assert.throws(
        () => runLifecycleTransaction({ paths, writes, onStep: failBeforeCommitThen() }),
        /rollback failed too \(retirement rename failed\)/u,
      );
    } finally {
      fs.renameSync = originalRenameSync;
    }

    // Every step was undone, so all three are marked and in their undone state.
    assert.deepEqual(fs.readdirSync(path.join(transactionRoot, 'rolling-back')).sort(), ['0', '1', '2']);
    assert.deepEqual(recoverLifecycleTransaction(paths), { outcome: 'rolled-back' });
    assert.deepEqual(snapshotWithoutTransaction(paths.lifecycleRoot), before);
    assert.equal(fs.existsSync(transactionRoot), false);
  });
});

test('repeated recoveries after repeated rollback failures converge to the pre-command bytes', () => {
  withRollbackFixture(({ paths, transactionRoot, writes, before, created }) => {
    // The first rollback stops right after restoring the commit point (one replacing step).
    const crashAfter = (target) => (step) => {
      if (step === target) {
        throw Object.assign(new Error('crash during rollback'), { [LIFECYCLE_TRANSACTION_SIMULATED_CRASH]: true });
      }
    };
    assert.throws(() => runLifecycleTransaction({ paths, writes, onStep: failBeforeCommitThen(crashAfter('rollback-step-2:done')) }));
    assert.deepEqual(fs.readdirSync(path.join(transactionRoot, 'rolling-back')), ['2']);

    // The next recovery's rollback fails while removing the created target.
    const originalRmSync = fs.rmSync;
    fs.rmSync = (target, options) => {
      if (target === created) {
        throw new Error('removal failed');
      }
      return originalRmSync(target, options);
    };
    try {
      assert.throws(() => recoverLifecycleTransaction(paths), /removal failed/u);
    } finally {
      fs.rmSync = originalRmSync;
    }
    assert.equal(fs.existsSync(path.join(transactionRoot, 'journal.json')), true, 'the evidence is kept');

    // A further recovery resumes and finishes.
    assert.deepEqual(recoverLifecycleTransaction(paths), { outcome: 'rolled-back' });
    assert.deepEqual(snapshotWithoutTransaction(paths.lifecycleRoot), before);
    assert.equal(recoverLifecycleTransaction(paths), null, 'nothing is left to recover');
  });
});

test('each partial rollback state (replacing restored, created removed, several, all) resumes to the pre-command bytes', () => {
  const interruptions = {
    'one replacing step restored': 'rollback-step-2:done',
    'one created target removed as well': 'rollback-step-1:done',
    'every step undone before retirement': 'rollback-step-0:done',
  };
  for (const [label, interruption] of Object.entries(interruptions)) {
    withRollbackFixture(({ paths, transactionRoot, writes, before }) => {
      const crash = (step) => {
        if (step === interruption) {
          throw Object.assign(new Error('crash during rollback'), { [LIFECYCLE_TRANSACTION_SIMULATED_CRASH]: true });
        }
      };
      assert.throws(() => runLifecycleTransaction({ paths, writes, onStep: failBeforeCommitThen(crash) }), label);
      assert.equal(fs.existsSync(path.join(transactionRoot, 'journal.json')), true, label);

      assert.deepEqual(recoverLifecycleTransaction(paths), { outcome: 'rolled-back' }, label);
      assert.deepEqual(snapshotWithoutTransaction(paths.lifecycleRoot), before, label);
    });
  }
});
