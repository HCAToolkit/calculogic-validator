import test from 'node:test';
import assert from 'node:assert/strict';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { collectSuiteScopedSnapshotInputs, toReportedScopeExclusions } from '../src/core/suite-scoped-snapshot-input.logic.mjs';
import { collectValidatorCandidatePaths } from '../src/core/validator-candidate-collection.logic.mjs';

test('suite scoped snapshot helper collects scope roots and root files deterministically', async () => {
  const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'suite-scoped-snapshot-docs-'));

  try {
    await fs.mkdir(path.join(fixtureDir, 'doc'), { recursive: true });
    await fs.writeFile(path.join(fixtureDir, 'doc', 'README.md'), '# docs\n', 'utf8');
    await fs.writeFile(path.join(fixtureDir, 'README.md'), '# root\n', 'utf8');

    const snapshot = collectSuiteScopedSnapshotInputs(fixtureDir, { scope: 'docs' });

    assert.equal(snapshot.scope, 'docs');
    assert.deepEqual(snapshot.includeRoots, ['doc', 'docs']);
    assert.deepEqual(snapshot.includeRootFiles, ['README.md']);
    assert.deepEqual(snapshot.inScopePaths, ['doc/README.md', 'README.md']);
    assert.deepEqual(snapshot.selectedPaths, ['doc/README.md', 'README.md']);
    assert.deepEqual(snapshot.targetDescriptors, []);
    assert.equal(snapshot.targets.length, 0);
  } finally {
    await fs.rm(fixtureDir, { recursive: true, force: true });
  }
});

test('suite scoped snapshot helper applies target filtering after scoped collection', async () => {
  const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'suite-scoped-snapshot-targets-'));

  try {
    await fs.mkdir(path.join(fixtureDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(fixtureDir, 'src', 'a.logic.ts'), 'export const a = true\n', 'utf8');
    await fs.writeFile(path.join(fixtureDir, 'src', 'b.logic.ts'), 'export const b = true\n', 'utf8');

    const snapshot = collectSuiteScopedSnapshotInputs(fixtureDir, {
      scope: 'app',
      targets: ['src/a.logic.ts'],
    });

    assert.equal(snapshot.scope, 'app');
    assert.deepEqual(snapshot.selectedPaths, ['src/a.logic.ts']);
    assert.deepEqual(snapshot.targetDescriptors, [
      {
        kind: 'file',
        relPath: 'src/a.logic.ts',
      },
    ]);
    assert.deepEqual(snapshot.targets, ['src/a.logic.ts']);
  } finally {
    await fs.rm(fixtureDir, { recursive: true, force: true });
  }
});

// Scope-root containment (#53): a fixture target with a sibling directory outside it.
const withContainmentFixture = async (run) => {
  const fixtureParent = await fs.mkdtemp(path.join(os.tmpdir(), 'suite-scoped-snapshot-containment-'));
  const targetRoot = path.join(fixtureParent, 'target');
  const outsideRoot = path.join(fixtureParent, 'outside');
  await fs.mkdir(path.join(targetRoot, 'test'), { recursive: true });
  await fs.mkdir(outsideRoot, { recursive: true });
  await fs.writeFile(path.join(targetRoot, 'test', 'inside.test.js'), 'export {};\n', 'utf8');
  await fs.writeFile(path.join(outsideRoot, 'outside.logic.ts'), 'export {};\n', 'utf8');

  try {
    await run({ targetRoot, outsideRoot });
  } finally {
    await fs.rm(fixtureParent, { recursive: true, force: true });
  }
};

test('scope containment: an ordinary scope root is collected and an absent one contributes nothing', async () => {
  await withContainmentFixture(async ({ targetRoot }) => {
    // `app` declares `src` and `test`; `src` is absent here.
    const snapshot = collectSuiteScopedSnapshotInputs(targetRoot, { scope: 'app' });
    assert.deepEqual(snapshot.inScopePaths, ['test/inside.test.js']);
  });
});

test('scope containment: a symlinked scope root that stays inside the target is traversed', async () => {
  await withContainmentFixture(async ({ targetRoot }) => {
    await fs.mkdir(path.join(targetRoot, 'packages', 'app-src'), { recursive: true });
    await fs.writeFile(path.join(targetRoot, 'packages', 'app-src', 'app.logic.ts'), 'export {};\n', 'utf8');
    await fs.symlink(path.join(targetRoot, 'packages', 'app-src'), path.join(targetRoot, 'src'), 'dir');

    const snapshot = collectSuiteScopedSnapshotInputs(targetRoot, { scope: 'app' });
    assert.deepEqual(snapshot.inScopePaths, ['src/app.logic.ts', 'test/inside.test.js']);
  });
});

test('scope containment: a scope root escaping the target is rejected before traversal', async () => {
  await withContainmentFixture(async ({ targetRoot, outsideRoot }) => {
    await fs.symlink(outsideRoot, path.join(targetRoot, 'src'), 'dir');

    assert.throws(
      () => collectSuiteScopedSnapshotInputs(targetRoot, { scope: 'app' }),
      /Scope root escapes repository root: src/u,
    );
  });
});

test('scope containment: a dangling scope root is rejected before traversal', async () => {
  await withContainmentFixture(async ({ targetRoot }) => {
    await fs.symlink(path.join(targetRoot, 'missing-dir'), path.join(targetRoot, 'src'), 'dir');

    assert.throws(
      () => collectSuiteScopedSnapshotInputs(targetRoot, { scope: 'app' }),
      /Scope root cannot be resolved \(dangling or unreadable symlink\): src/u,
    );
  });
});

test('scope containment: escaping or dangling root files are rejected; an internal one is collected', async () => {
  await withContainmentFixture(async ({ targetRoot, outsideRoot }) => {
    await fs.writeFile(path.join(outsideRoot, 'package.json'), '{}\n', 'utf8');
    await fs.symlink(path.join(outsideRoot, 'package.json'), path.join(targetRoot, 'package.json'));
    assert.throws(
      () => collectSuiteScopedSnapshotInputs(targetRoot, { scope: 'system' }),
      /Scope root file escapes repository root: package\.json/u,
    );

    await fs.rm(path.join(targetRoot, 'package.json'));
    await fs.symlink(path.join(targetRoot, 'missing.json'), path.join(targetRoot, 'package.json'));
    assert.throws(
      () => collectSuiteScopedSnapshotInputs(targetRoot, { scope: 'system' }),
      /Scope root file cannot be resolved \(dangling or unreadable symlink\): package\.json/u,
    );

    await fs.rm(path.join(targetRoot, 'package.json'));
    await fs.mkdir(path.join(targetRoot, 'config'), { recursive: true });
    await fs.writeFile(path.join(targetRoot, 'config', 'package.json'), '{}\n', 'utf8');
    await fs.symlink(path.join(targetRoot, 'config', 'package.json'), path.join(targetRoot, 'package.json'));
    assert.deepEqual(collectSuiteScopedSnapshotInputs(targetRoot, { scope: 'system' }).inScopePaths, ['package.json']);
  });
});

test('scope containment: an entry that cannot be inspected is a scope error, not an absent one', async () => {
  await withContainmentFixture(async ({ targetRoot }) => {
    // Root bypasses permission bits, so the EACCES a non-root user would hit is simulated.
    const originalLstat = fsSync.lstatSync;
    fsSync.lstatSync = (candidatePath, ...rest) => {
      if (String(candidatePath).endsWith(`${path.sep}src`)) {
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
      }

      return originalLstat(candidatePath, ...rest);
    };

    try {
      assert.throws(
        () => collectSuiteScopedSnapshotInputs(targetRoot, { scope: 'app' }),
        /Scope root cannot be accessed \(EACCES\): src/u,
      );
    } finally {
      fsSync.lstatSync = originalLstat;
    }
  });
});

test('scope containment: --target selects paths under an internal symlinked root and in a symlinked checkout', async () => {
  await withContainmentFixture(async ({ targetRoot }) => {
    await fs.mkdir(path.join(targetRoot, 'packages', 'app-src'), { recursive: true });
    await fs.writeFile(path.join(targetRoot, 'packages', 'app-src', 'app.logic.ts'), 'export {};\n', 'utf8');
    await fs.symlink(path.join(targetRoot, 'packages', 'app-src'), path.join(targetRoot, 'src'), 'dir');

    // Targets resolve to real paths; collected paths must match them in the same form.
    // Target descriptors take the selected paths' spelling, so consumers relating the two (Tree's
    // structural addressing) never see a physical `packages/app-src` beside `src/...` paths.
    const expectations = [
      ['src/app.logic.ts', { kind: 'file', relPath: 'src/app.logic.ts' }],
      ['src', { kind: 'dir', relPath: 'src' }],
      ['packages/app-src', { kind: 'dir', relPath: 'src' }],
      ['packages/app-src/app.logic.ts', { kind: 'file', relPath: 'src/app.logic.ts' }],
    ];
    for (const [target, descriptor] of expectations) {
      const snapshot = collectSuiteScopedSnapshotInputs(targetRoot, { scope: 'app', targets: [target] });
      assert.deepEqual(snapshot.selectedPaths, ['src/app.logic.ts'], `target ${target}`);
      assert.deepEqual(snapshot.targetDescriptors, [descriptor], `target ${target}`);
      assert.deepEqual(snapshot.targets, [descriptor.relPath], `target ${target}`);
    }

    const rootSnapshot = collectSuiteScopedSnapshotInputs(targetRoot, { scope: 'app', targets: ['.'] });
    assert.deepEqual(rootSnapshot.targetDescriptors, [{ kind: 'dir', relPath: '.' }]);

    // A target that contains the symlinked root's real directory without being reached through it is
    // described by the symlinked root, the shortest lexical ancestor that resolves inside it.
    const containingSnapshot = collectSuiteScopedSnapshotInputs(targetRoot, { scope: 'app', targets: ['packages'] });
    assert.deepEqual(containingSnapshot.selectedPaths, ['src/app.logic.ts']);
    assert.deepEqual(containingSnapshot.targetDescriptors, [{ kind: 'dir', relPath: 'src' }]);

    const checkoutLink = path.join(path.dirname(targetRoot), 'checkout-link');
    await fs.symlink(targetRoot, checkoutLink, 'dir');
    const linkedSnapshot = collectSuiteScopedSnapshotInputs(checkoutLink, { scope: 'app', targets: ['test/inside.test.js'] });
    assert.deepEqual(linkedSnapshot.selectedPaths, ['test/inside.test.js']);
    assert.deepEqual(linkedSnapshot.targets, ['test/inside.test.js']);
  });
});

test('scope containment: a target matched only through a renamed file symlink is described by that file', async () => {
  await withContainmentFixture(async ({ targetRoot }) => {
    await fs.mkdir(path.join(targetRoot, 'packages', 'private'), { recursive: true });
    await fs.mkdir(path.join(targetRoot, 'src'), { recursive: true });
    await fs.writeFile(path.join(targetRoot, 'packages', 'private', 'actual.logic.ts'), 'export {};\n', 'utf8');
    await fs.symlink(
      path.join(targetRoot, 'packages', 'private', 'actual.logic.ts'),
      path.join(targetRoot, 'src', 'alias.logic.ts'),
    );

    const snapshot = collectSuiteScopedSnapshotInputs(targetRoot, { scope: 'app', targets: ['packages/private'] });
    assert.deepEqual(snapshot.selectedPaths, ['src/alias.logic.ts']);
    assert.deepEqual(snapshot.targetDescriptors, [{ kind: 'file', relPath: 'src/alias.logic.ts' }]);
  });
});

test('scope containment: an absent nested entry under a dangling or escaping symlink is not treated as absent', async () => {
  await withContainmentFixture(async ({ targetRoot, outsideRoot }) => {
    // A suite registry root whose `app` profile declares a nested root below `alias`.
    const suiteRoot = path.join(path.dirname(targetRoot), 'suite-registries');
    await fs.mkdir(suiteRoot, { recursive: true });
    for (const fileName of await fs.readdir(new URL('../src/registries/_builtin/', import.meta.url))) {
      await fs.copyFile(new URL(`../src/registries/_builtin/${fileName}`, import.meta.url), path.join(suiteRoot, fileName));
    }
    const profilesPath = path.join(suiteRoot, 'scope-profiles.registry.json');
    const profiles = JSON.parse(await fs.readFile(profilesPath, 'utf8'));
    profiles.profiles.app.includeRoots = ['alias/missing', 'test'];
    await fs.writeFile(profilesPath, JSON.stringify(profiles), 'utf8');
    const collect = () => collectSuiteScopedSnapshotInputs(targetRoot, { scope: 'app', registryRoots: { suite: suiteRoot } });

    await fs.symlink(path.join(targetRoot, 'gone'), path.join(targetRoot, 'alias'), 'dir');
    assert.throws(collect, /Scope root cannot be resolved \(dangling or unreadable symlink\): alias\/missing/u);

    await fs.rm(path.join(targetRoot, 'alias'));
    await fs.symlink(outsideRoot, path.join(targetRoot, 'alias'), 'dir');
    assert.throws(collect, /Scope root escapes repository root: alias\/missing/u);

    // A genuinely absent entry under a contained parent still contributes nothing.
    await fs.rm(path.join(targetRoot, 'alias'));
    await fs.mkdir(path.join(targetRoot, 'alias'));
    assert.deepEqual(collect().inScopePaths, ['test/inside.test.js']);
  });
});

// Nested-entry membership (#56): below a scope root, only positively established contained regular
// files are candidates; every other entry is excluded with one reason and never traversed.
const tryMakeFifo = (fifoPath) => {
  try {
    execFileSync('mkfifo', [fifoPath]);
    return true;
  } catch {
    return false;
  }
};

const withNestedEntriesFixture = async (run) => {
  await withContainmentFixture(async ({ targetRoot, outsideRoot }) => {
    const src = path.join(targetRoot, 'src');
    await fs.mkdir(path.join(targetRoot, 'lib', 'nested'), { recursive: true });
    await fs.mkdir(src, { recursive: true });
    await fs.writeFile(path.join(src, 'regular.logic.ts'), 'export {};\n', 'utf8');
    await fs.writeFile(path.join(targetRoot, 'lib', 'nested', 'behind-link.logic.ts'), 'export {};\n', 'utf8');
    await fs.symlink('regular.logic.ts', path.join(src, 'internal-file.logic.ts'));
    await fs.symlink(path.join(outsideRoot, 'outside.logic.ts'), path.join(src, 'escaping-file.logic.ts'));
    await fs.symlink('missing.logic.ts', path.join(src, 'dangling.logic.ts'));
    await fs.symlink('chain-b.logic.ts', path.join(src, 'chain-a.logic.ts'));
    await fs.symlink('chain-a.logic.ts', path.join(src, 'chain-b.logic.ts'));
    await fs.symlink(path.join(targetRoot, 'lib', 'nested'), path.join(src, 'internal-dir'), 'dir');
    await fs.symlink(outsideRoot, path.join(src, 'escaping-dir'), 'dir');
    await fs.symlink('.', path.join(src, 'loop'), 'dir');
    await run({ targetRoot, outsideRoot, src });
  });
};

test('nested membership: contained file symlinks are members; every other nested link is excluded with one reason', async () => {
  await withNestedEntriesFixture(async ({ targetRoot }) => {
    const snapshot = collectSuiteScopedSnapshotInputs(targetRoot, { scope: 'app' });

    assert.deepEqual(snapshot.inScopePaths, [
      'src/internal-file.logic.ts',
      'src/regular.logic.ts',
      'test/inside.test.js',
    ]);
    // Directory links are never followed: nothing behind `internal-dir` or `loop` is collected.
    assert.deepEqual(
      snapshot.scopeExclusions.map(({ path: exclusionPath, reason }) => [exclusionPath, reason]),
      [
        ['src/chain-a.logic.ts', 'unresolvable-symlink'],
        ['src/chain-b.logic.ts', 'unresolvable-symlink'],
        ['src/dangling.logic.ts', 'unresolvable-symlink'],
        ['src/escaping-dir', 'escaping-symlink'],
        ['src/escaping-file.logic.ts', 'escaping-symlink'],
        ['src/internal-dir', 'directory-symlink'],
        ['src/loop', 'directory-symlink'],
      ],
    );
    // The inspection error is kept for diagnosis; it is not part of the reported form.
    const causes = Object.fromEntries(snapshot.scopeExclusions.filter((entry) => entry.cause).map((entry) => [entry.path, entry.cause]));
    assert.deepEqual(causes, { 'src/chain-a.logic.ts': 'ELOOP', 'src/chain-b.logic.ts': 'ELOOP', 'src/dangling.logic.ts': 'ENOENT' });
    assert.deepEqual(toReportedScopeExclusions(snapshot.scopeExclusions)[0], { path: 'src/chain-a.logic.ts', reason: 'unresolvable-symlink' });
  });
});

test('nested membership: a FIFO is a non-regular entry and is never opened', async (t) => {
  await withContainmentFixture(async ({ targetRoot }) => {
    await fs.mkdir(path.join(targetRoot, 'src'), { recursive: true });
    if (!tryMakeFifo(path.join(targetRoot, 'src', 'pipe.logic.ts'))) {
      t.skip('mkfifo is not available in this environment.');
      return;
    }
    await fs.symlink('pipe.logic.ts', path.join(targetRoot, 'src', 'pipe-link.logic.ts'));

    const snapshot = collectSuiteScopedSnapshotInputs(targetRoot, { scope: 'app' });
    assert.deepEqual(snapshot.inScopePaths, ['test/inside.test.js']);
    assert.deepEqual(snapshot.scopeExclusions, [
      { path: 'src/pipe-link.logic.ts', reason: 'non-regular-entry' },
      { path: 'src/pipe.logic.ts', reason: 'non-regular-entry' },
    ]);
  });
});

test('nested membership: a link under a walk-excluded or dot directory name is skipped like that directory, unless it is a contained regular file', async () => {
  await withContainmentFixture(async ({ targetRoot, outsideRoot }) => {
    const src = path.join(targetRoot, 'src');
    await fs.mkdir(path.join(targetRoot, 'shared-modules'), { recursive: true });
    await fs.mkdir(src, { recursive: true });
    await fs.writeFile(path.join(src, 'regular.logic.ts'), 'export {};\n', 'utf8');
    await fs.symlink(path.join(targetRoot, 'shared-modules'), path.join(src, 'node_modules'), 'dir');
    await fs.symlink(outsideRoot, path.join(src, '.cache'), 'dir');
    await fs.symlink('regular.logic.ts', path.join(src, '.dot-file.logic.ts'));

    const snapshot = collectSuiteScopedSnapshotInputs(targetRoot, {
      scope: 'app',
      walkExcludedDirectories: new Set(['node_modules']),
    });
    assert.deepEqual(snapshot.inScopePaths, ['src/.dot-file.logic.ts', 'src/regular.logic.ts', 'test/inside.test.js']);
    assert.deepEqual(snapshot.scopeExclusions, []);
  });
});

test('nested membership: exclusions under an explicit internal symlinked scope root are spelled through that root', async () => {
  await withContainmentFixture(async ({ targetRoot }) => {
    const appSrc = path.join(targetRoot, 'packages', 'app-src');
    await fs.mkdir(appSrc, { recursive: true });
    await fs.writeFile(path.join(appSrc, 'app.logic.ts'), 'export {};\n', 'utf8');
    await fs.symlink('missing.logic.ts', path.join(appSrc, 'dangling.logic.ts'));
    await fs.symlink(appSrc, path.join(targetRoot, 'src'), 'dir');

    const snapshot = collectSuiteScopedSnapshotInputs(targetRoot, { scope: 'app' });
    assert.deepEqual(snapshot.inScopePaths, ['src/app.logic.ts', 'test/inside.test.js']);
    assert.deepEqual(toReportedScopeExclusions(snapshot.scopeExclusions), [{ path: 'src/dangling.logic.ts', reason: 'unresolvable-symlink' }]);
  });
});

test('nested membership: exclusion records follow the same target interpretation as selected paths', async () => {
  await withNestedEntriesFixture(async ({ targetRoot }) => {
    const exclusionsFor = (targets) =>
      collectSuiteScopedSnapshotInputs(targetRoot, { scope: 'app', targets }).scopeExclusions.map((entry) => entry.path);

    assert.equal(exclusionsFor(['src']).length, 7);
    assert.deepEqual(exclusionsFor(['test']), []);
    // A file target selects only its own location, and a contained file link target resolves to its file.
    assert.deepEqual(exclusionsFor(['src/regular.logic.ts']), []);
    assert.deepEqual(exclusionsFor(['src/internal-file.logic.ts']), []);
    // An explicit escaping target still fails rather than becoming an exclusion record.
    assert.throws(() => exclusionsFor(['src/escaping-file.logic.ts']), /Target path escapes repository root/u);
  });
});

test('nested membership: Naming candidate policy reports exclusions only where the entry would have been a candidate', async () => {
  await withNestedEntriesFixture(async ({ targetRoot }) => {
    const collection = collectValidatorCandidatePaths(targetRoot, {
      scope: 'app',
      candidatePolicy: { candidateExtensions: ['.ts', '.js'], candidateRootFiles: [] },
    });
    // Extensionless directory links are not Naming candidates, so they are not Naming exclusions.
    assert.deepEqual(
      collection.scopeExclusions.map((entry) => entry.path),
      ['src/chain-a.logic.ts', 'src/chain-b.logic.ts', 'src/dangling.logic.ts', 'src/escaping-file.logic.ts'],
    );
  });
});
