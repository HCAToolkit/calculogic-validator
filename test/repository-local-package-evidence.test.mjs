import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectDeclaredLocalPackageEvidence } from '../src/core/repository-local-package-evidence.logic.mjs';

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

// A validation target with a root manifest and optional local package folders, each with a manifest.
const withTarget = (run, { rootManifest, packageFolders = [] } = {}) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'local-package-evidence-'));
  const targetRoot = path.join(fixtureRoot, 'target');
  fs.mkdirSync(targetRoot);

  try {
    if (rootManifest !== undefined) {
      writeJson(path.join(targetRoot, 'package.json'), rootManifest);
    }
    for (const folder of packageFolders) {
      writeJson(path.join(targetRoot, folder, 'package.json'), { name: `@fixture/${folder}` });
    }
    return run({ targetRoot, outsideRoot: fixtureRoot });
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
};

const foldersOf = (targetRoot) => collectDeclaredLocalPackageEvidence(targetRoot).map((record) => record.folder);

test('a root file: dependency on a top-level folder with its own manifest is evidence', () => {
  withTarget(
    ({ targetRoot }) => {
      assert.deepEqual(collectDeclaredLocalPackageEvidence(targetRoot), [
        {
          folder: 'calculogic-doc-engine',
          manifestPath: 'calculogic-doc-engine/package.json',
          declarations: [{ field: 'dependencies', key: '@calculogic/doc-engine', value: 'file:calculogic-doc-engine' }],
        },
      ]);
    },
    {
      rootManifest: { dependencies: { '@calculogic/doc-engine': 'file:calculogic-doc-engine' } },
      packageFolders: ['calculogic-doc-engine'],
    },
  );
});

test('every supported declaration form qualifies, and declarations are collected and sorted per folder', () => {
  withTarget(
    ({ targetRoot }) => {
      const evidence = collectDeclaredLocalPackageEvidence(targetRoot);
      assert.deepEqual(evidence.map((record) => record.folder), ['beta', 'delta', 'epsilon', 'gamma', 'kit']);
      assert.deepEqual(evidence.find((record) => record.folder === 'kit').declarations, [
        { field: 'dependencies', key: 'kit', value: 'file:./kit/' },
        { field: 'devDependencies', key: 'kit-dev', value: 'link:kit' },
        { field: 'workspaces', value: 'kit' },
      ]);
    },
    {
      rootManifest: {
        dependencies: { kit: 'file:./kit/' },
        devDependencies: { 'kit-dev': 'link:kit' },
        optionalDependencies: { beta: 'file:beta' },
        peerDependencies: { gamma: 'link:./gamma' },
        workspaces: ['kit', './delta/', 'epsilon'],
      },
      packageFolders: ['beta', 'delta', 'epsilon', 'gamma', 'kit'],
    },
  );

  withTarget(({ targetRoot }) => assert.deepEqual(foldersOf(targetRoot), ['engine']), {
    rootManifest: { workspaces: { packages: ['engine'] } },
    packageFolders: ['engine'],
  });
});

test('unsupported forms never qualify and are never reinterpreted', () => {
  const unsupportedDependencySpecs = [
    'file:packages/engine', // nested path
    'file:../engine', // outside the target
    'file:/abs/engine', // absolute
    'file:engine/../engine', // not a single segment
    'file:.', // the root itself
    'file:', // empty
    'file:engine//', // more than one trailing slash
    'file:eng*', // glob
    'workspace:engine', // another protocol
    'npm:engine@1.0.0',
    'git+https://example.invalid/engine.git',
    '1.0.0',
    'FILE:engine', // protocols are matched exactly
    ' file:engine', // no surrounding whitespace
  ];

  for (const spec of unsupportedDependencySpecs) {
    withTarget(({ targetRoot }) => assert.deepEqual(foldersOf(targetRoot), [], spec), {
      rootManifest: { dependencies: { engine: spec } },
      // Folders named like the glob exist, so only the declaration rule can reject them.
      packageFolders: ['engine', 'eng*', 'packages/engine'],
    });
  }

  for (const workspaces of [['packages/*'], ['packages/engine'], ['eng?ne'], ['!engine'], ['../engine'], { nohoist: ['engine'] }, 'engine', [42]]) {
    withTarget(({ targetRoot }) => assert.deepEqual(foldersOf(targetRoot), [], JSON.stringify(workspaces)), {
      rootManifest: { workspaces },
      packageFolders: ['engine', 'packages/engine', 'eng?ne', '!engine'],
    });
  }

  // Padded references never qualify, even when a directory with the padded name exists.
  for (const [rootManifest, label] of [
    [{ dependencies: { engine: 'file:engine ' } }, 'trailing space in a dependency spec'],
    [{ dependencies: { engine: 'file: engine' } }, 'space inside a dependency spec'],
    [{ dependencies: { engine: 'file:./ engine/' } }, 'padded folder after ./'],
    [{ workspaces: ['engine '] }, 'trailing space in a workspace entry'],
    [{ workspaces: [' engine'] }, 'leading space in a workspace entry'],
  ]) {
    withTarget(({ targetRoot }) => assert.deepEqual(foldersOf(targetRoot), [], label), {
      rootManifest,
      packageFolders: ['engine ', ' engine'],
    });
  }

  // Sections that are not objects, and values that are not strings, are ignored.
  withTarget(({ targetRoot }) => assert.deepEqual(foldersOf(targetRoot), []), {
    rootManifest: { dependencies: ['file:engine'], devDependencies: { engine: { path: 'file:engine' } } },
    packageFolders: ['engine'],
  });

  // External workspace formats are not read.
  withTarget(
    ({ targetRoot }) => {
      fs.writeFileSync(path.join(targetRoot, 'pnpm-workspace.yaml'), 'packages:\n  - engine\n');
      assert.deepEqual(foldersOf(targetRoot), []);
    },
    { rootManifest: {}, packageFolders: ['engine'] },
  );
});

test('both sides are required: an undeclared folder with a manifest and a declaration without one give nothing', () => {
  withTarget(({ targetRoot }) => assert.deepEqual(foldersOf(targetRoot), []), {
    rootManifest: { name: 'root' },
    packageFolders: ['calculogic-doc-engine'],
  });

  withTarget(
    ({ targetRoot }) => {
      fs.mkdirSync(path.join(targetRoot, 'calculogic-doc-engine'));
      assert.deepEqual(foldersOf(targetRoot), [], 'folder without a manifest');

      fs.writeFileSync(path.join(targetRoot, 'calculogic-doc-engine', 'package.json'), '{ broken');
      assert.deepEqual(foldersOf(targetRoot), [], 'unparseable manifest');

      fs.writeFileSync(path.join(targetRoot, 'calculogic-doc-engine', 'package.json'), '[]');
      assert.deepEqual(foldersOf(targetRoot), [], 'manifest that is not an object');

      fs.rmSync(path.join(targetRoot, 'calculogic-doc-engine'), { recursive: true });
      fs.writeFileSync(path.join(targetRoot, 'calculogic-doc-engine'), 'not a folder');
      assert.deepEqual(foldersOf(targetRoot), [], 'a file, not a folder');
    },
    { rootManifest: { dependencies: { '@calculogic/doc-engine': 'file:calculogic-doc-engine' } } },
  );
});

test('a missing, malformed or non-object root manifest gives no evidence', () => {
  withTarget(({ targetRoot }) => assert.deepEqual(foldersOf(targetRoot), []), { packageFolders: ['engine'] });
  withTarget(({ targetRoot }) => assert.deepEqual(foldersOf(targetRoot), []), {
    rootManifest: ['file:engine'],
    packageFolders: ['engine'],
  });
  withTarget(
    ({ targetRoot }) => {
      fs.writeFileSync(path.join(targetRoot, 'package.json'), '{ broken');
      assert.deepEqual(foldersOf(targetRoot), []);
    },
    { packageFolders: ['engine'] },
  );
});

test('containment applies before any manifest is read', () => {
  const declaringEngine = { dependencies: { engine: 'file:engine' } };

  // An escaping folder, an escaping nested manifest and a dangling nested manifest never qualify.
  withTarget(
    ({ targetRoot, outsideRoot }) => {
      writeJson(path.join(outsideRoot, 'engine', 'package.json'), { name: 'outside' });
      fs.symlinkSync(path.join(outsideRoot, 'engine'), path.join(targetRoot, 'engine'), 'dir');
      assert.deepEqual(foldersOf(targetRoot), [], 'escaping folder');

      fs.rmSync(path.join(targetRoot, 'engine'));
      fs.mkdirSync(path.join(targetRoot, 'engine'));
      fs.symlinkSync(path.join(outsideRoot, 'engine', 'package.json'), path.join(targetRoot, 'engine', 'package.json'));
      assert.deepEqual(foldersOf(targetRoot), [], 'escaping nested manifest');

      fs.rmSync(path.join(targetRoot, 'engine', 'package.json'));
      fs.symlinkSync(path.join(targetRoot, 'missing.json'), path.join(targetRoot, 'engine', 'package.json'));
      assert.deepEqual(foldersOf(targetRoot), [], 'dangling nested manifest');
    },
    { rootManifest: declaringEngine },
  );

  // An escaping root manifest is not read.
  withTarget(
    ({ targetRoot, outsideRoot }) => {
      writeJson(path.join(outsideRoot, 'package.json'), declaringEngine);
      fs.symlinkSync(path.join(outsideRoot, 'package.json'), path.join(targetRoot, 'package.json'));
      assert.deepEqual(foldersOf(targetRoot), []);
    },
    { packageFolders: ['engine'] },
  );

  // A folder that is an internal symlink stays inside the target, so it qualifies.
  withTarget(
    ({ targetRoot }) => {
      fs.symlinkSync(path.join(targetRoot, 'packages', 'engine'), path.join(targetRoot, 'engine'), 'dir');
      assert.deepEqual(foldersOf(targetRoot), ['engine']);
    },
    { rootManifest: declaringEngine, packageFolders: ['packages/engine'] },
  );
});

// Simulates a case-insensitive filesystem (default macOS and Windows): every path lookup ignores
// case, while directory listings keep each entry's real spelling.
const withCaseInsensitivePaths = (targetRoot, run) => {
  const realEntryPath = (candidatePath) => {
    const relativePath = path.relative(targetRoot, candidatePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath) || relativePath === '') {
      return candidatePath;
    }

    let resolved = targetRoot;
    for (const segment of relativePath.split(path.sep)) {
      const entries = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory() ? fs.readdirSync(resolved) : [];
      resolved = path.join(resolved, entries.find((entry) => entry.toLowerCase() === segment.toLowerCase()) ?? segment);
    }
    return resolved;
  };
  const originals = { statSync: fs.statSync, readFileSync: fs.readFileSync, realpathSync: fs.realpathSync };
  fs.statSync = (candidatePath, ...rest) => originals.statSync(realEntryPath(candidatePath), ...rest);
  fs.readFileSync = (candidatePath, ...rest) =>
    originals.readFileSync(typeof candidatePath === 'string' ? realEntryPath(candidatePath) : candidatePath, ...rest);
  fs.realpathSync = Object.assign((candidatePath, ...rest) => originals.realpathSync(realEntryPath(candidatePath), ...rest), {
    native: originals.realpathSync.native,
  });

  try {
    return run();
  } finally {
    Object.assign(fs, originals);
  }
};

test('on a case-insensitive filesystem only the exact folder and manifest spelling qualify', () => {
  withTarget(
    ({ targetRoot }) => {
      withCaseInsensitivePaths(targetRoot, () => {
        // The simulated lookup does resolve the other spelling, so only the spelling rule rejects it.
        assert.equal(fs.statSync(path.join(targetRoot, 'Engine')).isDirectory(), true);
        assert.deepEqual(foldersOf(targetRoot), [], 'file:Engine for engine/');
      });
    },
    { rootManifest: { dependencies: { engine: 'file:Engine' } }, packageFolders: ['engine'] },
  );

  withTarget(
    ({ targetRoot }) => {
      fs.renameSync(path.join(targetRoot, 'engine', 'package.json'), path.join(targetRoot, 'engine', 'Package.json'));
      withCaseInsensitivePaths(targetRoot, () => assert.deepEqual(foldersOf(targetRoot), [], 'Package.json'));
    },
    { rootManifest: { dependencies: { engine: 'file:engine' } }, packageFolders: ['engine'] },
  );

  withTarget(
    ({ targetRoot }) => withCaseInsensitivePaths(targetRoot, () => assert.deepEqual(foldersOf(targetRoot), ['engine'])),
    { rootManifest: { dependencies: { engine: 'file:engine' } }, packageFolders: ['engine'] },
  );
});
