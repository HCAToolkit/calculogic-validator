import test from 'node:test';
import assert from 'node:assert/strict';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { collectSuiteScopedSnapshotInputs } from '../src/core/suite-scoped-snapshot-input.logic.mjs';

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
