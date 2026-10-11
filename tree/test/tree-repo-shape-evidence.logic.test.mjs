import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  prepareTreeStructureAdvisorInputs,
  runTreeStructureAdvisor,
} from '../src/tree-structure-advisor.wiring.mjs';
import { getBuiltinTreeRepoShapePolicy } from '../src/registries/tree-repo-shape-policy-registry.logic.mjs';
import { prepareTreeRepoShapeEvidence } from '../src/tree-repo-shape-evidence.logic.mjs';
import { prepareContextualTreeRepoShapePolicy } from '../src/tree-contextual-repo-shape-policy.logic.mjs';

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const DOC_ENGINE_DEPENDENCY = { '@calculogic/doc-engine': 'file:calculogic-doc-engine' };

// A repository shaped like Calculogic_React_App: `src/` plus a `calculogic-doc-engine/` folder. The
// options decide whether the root manifest declares it and whether it has its own manifest.
const withRepository = (run, { declare = true, folderManifest = true, folder = 'calculogic-doc-engine', dependencies } = {}) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-repo-shape-evidence-'));
  const repositoryRoot = path.join(fixtureRoot, 'repo');

  try {
    fs.mkdirSync(path.join(repositoryRoot, 'src'), { recursive: true });
    fs.mkdirSync(path.join(repositoryRoot, folder, 'src'), { recursive: true });
    fs.writeFileSync(path.join(repositoryRoot, 'src', 'app.logic.ts'), 'export {};\n');
    fs.writeFileSync(path.join(repositoryRoot, folder, 'src', 'index.ts'), 'export {};\n');
    writeJson(path.join(repositoryRoot, 'package.json'), {
      name: 'fixture',
      private: true,
      ...(declare ? { dependencies: dependencies ?? { [`@fixture/${folder}`]: `file:${folder}` } } : {}),
    });
    if (folderManifest) {
      writeJson(path.join(repositoryRoot, folder, 'package.json'), { name: `@fixture/${folder}`, private: true });
    }

    return run({ repositoryRoot, fixtureRoot, folder });
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
};

const unexpectedTopLevelFolders = (repositoryRoot) =>
  runTreeStructureAdvisor(repositoryRoot, { scope: 'repo' })
    .findings.filter((finding) => finding.code === 'TREE_UNEXPECTED_TOP_LEVEL_FOLDER')
    .map((finding) => finding.path);

test('calculogic-doc-engine is not a Builtin repo-shape entry', () => {
  assert.equal(getBuiltinTreeRepoShapePolicy().allowedTopLevelDirectories.includes('calculogic-doc-engine'), false);
});

test('a declared local package with its own manifest is allowed, and the evidence is disclosed', () => {
  withRepository(
    ({ repositoryRoot }) => {
      assert.deepEqual(unexpectedTopLevelFolders(repositoryRoot), []);

      const prepared = prepareTreeStructureAdvisorInputs(repositoryRoot, { scope: 'repo' });
      const { treeRepoShapePolicy, treeRepoShapeEvidence } = prepared.preparedDependencies;
      assert.ok(treeRepoShapePolicy.allowedTopLevelDirectories.includes('calculogic-doc-engine'));
      assert.deepEqual(Object.keys(treeRepoShapePolicy).sort(), ['allowedTopLevelDirectories', 'version']);
      assert.deepEqual(treeRepoShapeEvidence, {
        source: 'tree-repo-shape-evidence',
        evidenceRecords: [
          {
            folder: 'calculogic-doc-engine',
            evidenceKind: 'declared-local-package',
            manifestPath: 'calculogic-doc-engine/package.json',
            declarations: [{ field: 'dependencies', key: '@calculogic/doc-engine', value: 'file:calculogic-doc-engine' }],
          },
        ],
      });

      // The allowance is a prepared value; the cached registry policy is never modified.
      assert.equal(getBuiltinTreeRepoShapePolicy().allowedTopLevelDirectories.includes('calculogic-doc-engine'), false);
    },
    { dependencies: DOC_ENGINE_DEPENDENCY },
  );
});

test('negative controls: without the declaration or the folder manifest the folder stays unexpected', () => {
  withRepository(({ repositoryRoot }) => {
    assert.deepEqual(unexpectedTopLevelFolders(repositoryRoot), ['calculogic-doc-engine']);
    const prepared = prepareTreeStructureAdvisorInputs(repositoryRoot, { scope: 'repo' });
    assert.deepEqual(prepared.preparedDependencies.treeRepoShapeEvidence.evidenceRecords, []);
  }, { declare: false });

  withRepository(
    ({ repositoryRoot }) => assert.deepEqual(unexpectedTopLevelFolders(repositoryRoot), ['calculogic-doc-engine']),
    { folderManifest: false, dependencies: DOC_ENGINE_DEPENDENCY },
  );

  // A nested declaration does not qualify its top-level parent.
  withRepository(
    ({ repositoryRoot }) => assert.deepEqual(unexpectedTopLevelFolders(repositoryRoot), ['calculogic-doc-engine']),
    { dependencies: { '@calculogic/doc-engine': 'file:calculogic-doc-engine/src' } },
  );
});

test('an escaping folder manifest is never read and never qualifies the folder', () => {
  withRepository(
    ({ repositoryRoot, fixtureRoot }) => {
      writeJson(path.join(fixtureRoot, 'outside', 'package.json'), { name: 'outside' });
      fs.symlinkSync(path.join(fixtureRoot, 'outside', 'package.json'), path.join(repositoryRoot, 'calculogic-doc-engine', 'package.json'));

      assert.deepEqual(unexpectedTopLevelFolders(repositoryRoot), ['calculogic-doc-engine']);
    },
    { folderManifest: false, dependencies: DOC_ENGINE_DEPENDENCY },
  );
});

test('the rule has no special case: any declared local package folder is allowed the same way', () => {
  withRepository(
    ({ repositoryRoot }) => {
      assert.deepEqual(unexpectedTopLevelFolders(repositoryRoot), []);
      const prepared = prepareTreeStructureAdvisorInputs(repositoryRoot, { scope: 'repo' });
      assert.deepEqual(prepared.preparedDependencies.treeRepoShapeEvidence.evidenceRecords.map((record) => record.folder), ['engine-kit']);
    },
    { folder: 'engine-kit' },
  );

  withRepository(({ repositoryRoot }) => assert.deepEqual(unexpectedTopLevelFolders(repositoryRoot), ['engine-kit']), {
    folder: 'engine-kit',
    declare: false,
  });
});

test('prepared repo-shape evidence keeps each declaration and rejects a malformed input', () => {
  const evidence = prepareTreeRepoShapeEvidence({
    localPackageEvidence: [
      { folder: 'kit', manifestPath: 'kit/package.json', declarations: [{ field: 'workspaces', value: 'kit' }] },
    ],
  });

  assert.deepEqual(evidence.evidenceRecords, [
    { folder: 'kit', evidenceKind: 'declared-local-package', manifestPath: 'kit/package.json', declarations: [{ field: 'workspaces', value: 'kit' }] },
  ]);
  assert.ok(Object.isFrozen(evidence.evidenceRecords[0].declarations[0]));
  assert.deepEqual(prepareTreeRepoShapeEvidence().evidenceRecords, []);
  assert.throws(() => prepareTreeRepoShapeEvidence({ localPackageEvidence: {} }), /localPackageEvidence\[\]/u);
});

test('the effective policy orders evidence folders ordinally, independent of the host locale', () => {
  const repoShapeEvidence = prepareTreeRepoShapeEvidence({
    localPackageEvidence: ['äpkg', 'Zeta', 'zeta'].map((folder) => ({
      folder,
      manifestPath: `${folder}/package.json`,
      declarations: [{ field: 'workspaces', value: folder }],
    })),
  });
  const { allowedTopLevelDirectories } = prepareContextualTreeRepoShapePolicy({
    registryPolicy: { version: '1', allowedTopLevelDirectories: ['src', 'bin'] },
    validatorDevelopmentRoot: null,
    repoShapeEvidence,
  });

  // Code-unit order: uppercase before lowercase, and `ä` (U+00E4) after every ASCII letter.
  assert.deepEqual(allowedTopLevelDirectories, ['Zeta', 'bin', 'src', 'zeta', 'äpkg']);
});
