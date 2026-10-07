// Comparison of Tree's private addressed snapshot with the shared Structural Addressing output
// (Refs #40). Comparison only: no runtime behavior changes. Each test pins one classified finding
// from doc/Audits/tree-structural-addressing-comparison.audit.md. The Addressing -> Tree migration is
// expected to flip the "defect" and "differs" expectations here deliberately.
//
// Two layers are compared:
//   A. Algorithm parity: both implementations address the same occurrence set.
//   B. Production inputs: Tree wiring's snapshot vs the get-tree host's filesystem snapshot.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { prepareTreeStructureAdvisorInputs } from '../tree/src/tree-structure-advisor.wiring.mjs';
import { prepareTreeOccurrenceSnapshot } from '../tree/src/tree-occurrence-snapshot.logic.mjs';
import { prepareTreeCodebaseAddressedSnapshot } from '../structural-addressing/src/structural-addressing-tree-codebase.logic.mjs';
import { buildTreeCodebaseInputFromFileSystem } from '../scripts/addressing-get-tree.host.mjs';

const VALIDATOR_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_NAMESPACE = 'calculogic-validator';

// --- Comparison helpers -----------------------------------------------------------------------

// Builds the Structural Addressing node tree for a set of repository-relative paths, rooted at the
// given scope roots. Folders are implied by file paths, mirroring Tree's occurrence derivation.
const toAddressingScopeRoots = (filePaths, scopeRootPaths) => {
  const nodesByPath = new Map();
  const folderNode = (folderPath) => {
    if (!nodesByPath.has(folderPath)) {
      nodesByPath.set(folderPath, {
        name: path.posix.basename(folderPath),
        path: folderPath,
        occurrenceType: 'folder',
        children: [],
      });
    }
    return nodesByPath.get(folderPath);
  };

  const scopeRoots = scopeRootPaths.map((scopeRootPath) => folderNode(scopeRootPath));
  for (const filePath of filePaths) {
    const scopeRootPath = scopeRootPaths.find((rootPath) => filePath.startsWith(`${rootPath}/`));
    const segments = filePath.slice(scopeRootPath.length + 1).split('/');
    let parent = nodesByPath.get(scopeRootPath);
    for (let index = 0; index < segments.length - 1; index += 1) {
      const child = folderNode(`${parent.path}/${segments[index]}`);
      if (!parent.children.includes(child)) {
        parent.children.push(child);
      }
      parent = child;
    }
    parent.children.push({ name: path.posix.basename(filePath), path: filePath, occurrenceType: 'file' });
  }

  return scopeRoots;
};

const byPath = (records, pathKey) => new Map(records.map((record) => [record[pathKey], record]));

const stripNamespace = (namespacedPath) =>
  namespacedPath === SOURCE_NAMESPACE ? '.' : namespacedPath.replace(new RegExp(`^${SOURCE_NAMESPACE}/`, 'u'), '');

const createStandaloneFixture = (t, files, { emptyDirectories = [], symlinks = [] } = {}) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tree-addressing-comparison-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [relativePath, content] of Object.entries({
    'package.json': `${JSON.stringify({ name: '@calculogic/validator' })}\n`,
    ...files,
  })) {
    fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(root, relativePath), content);
  }
  for (const directory of emptyDirectories) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
  }
  for (const [linkPath, targetPath] of symlinks) {
    fs.symlinkSync(path.join(root, targetPath), path.join(root, linkPath), 'dir');
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
};

const treeSnapshotFor = (repositoryRoot, { scope = 'validator', targets } = {}) =>
  prepareTreeStructureAdvisorInputs(repositoryRoot, { scope, targets, packageRoot: repositoryRoot }).structuralAddressSnapshot;

const getTreeSnapshotFor = async (repositoryRoot, targets = []) =>
  prepareTreeCodebaseAddressedSnapshot(
    await buildTreeCodebaseInputFromFileSystem({ scope: 'validator', targets, cwd: repositoryRoot, packageRoot: repositoryRoot }),
  );

// --- Layer A: algorithm parity on the same occurrence set -------------------------------------

test('comparison A: both implementations assign identical address, parent, depth and type for the same nested input', () => {
  // Nested folders, repeated names in different branches, files and folders as siblings, case and
  // punctuation variants, and more than 26 sibling folders (two-letter markers).
  const filePaths = [
    'src/a/x.logic.mjs',
    'src/a/b/x.logic.mjs',
    'src/a-b/x.logic.mjs',
    'src/A/y.logic.mjs',
    'src/index.mjs',
    'src/z.logic.mjs',
    ...Array.from({ length: 28 }, (_, index) => `src/many/f${String(index).padStart(2, '0')}/leaf.mjs`),
    'test/a/x.test.mjs',
  ];
  const tree = prepareTreeOccurrenceSnapshot({ selectedPaths: filePaths, includeRoots: ['src', 'test'] });
  const addressing = prepareTreeCodebaseAddressedSnapshot({ scopeRoots: toAddressingScopeRoots(filePaths, ['src', 'test']) });
  const addressingByPath = byPath(addressing.occurrenceRecords, 'path');
  const addressingPathByAddress = new Map(addressing.occurrenceRecords.map((record) => [record.addressPath, record.path]));

  assert.equal(tree.occurrenceRecords.length, addressing.occurrenceRecords.length);
  for (const record of tree.occurrenceRecords) {
    const counterpart = addressingByPath.get(record.resolvedPath);
    assert.ok(counterpart, record.resolvedPath);
    assert.equal(counterpart.addressPath, record.occurrenceMarker, record.resolvedPath);
    assert.equal(counterpart.depth, record.depth, record.resolvedPath);
    assert.equal(counterpart.occurrenceType, record.occurrenceType, record.resolvedPath);
    assert.equal(
      counterpart.parentAddressPath === null ? null : addressingPathByAddress.get(counterpart.parentAddressPath),
      record.parentResolvedPath,
      record.resolvedPath,
    );
  }
  assert.equal(addressingByPath.get('src/many/f27').addressPath.endsWith('.AB'), true);
});

test('comparison A: record order differs (Tree sorts full paths; Addressing is pre-order with explicit orderIndex)', () => {
  const filePaths = ['doc/a/x.md', 'doc/a-b/x.md', 'doc/A/y.md'];
  const tree = prepareTreeOccurrenceSnapshot({ selectedPaths: filePaths, includeRoots: ['doc'] });
  const addressing = prepareTreeCodebaseAddressedSnapshot({ scopeRoots: toAddressingScopeRoots(filePaths, ['doc']) });

  // Same identity for every occurrence...
  const addressingByPath = byPath(addressing.occurrenceRecords, 'path');
  for (const record of tree.occurrenceRecords) {
    assert.equal(addressingByPath.get(record.resolvedPath).addressPath, record.occurrenceMarker);
  }
  // ...but a different array order, and only Addressing carries orderIndex.
  assert.deepEqual(
    tree.occurrenceRecords.map((record) => record.resolvedPath),
    ['doc', 'doc/a', 'doc/A', 'doc/a-b', 'doc/a-b/x.md', 'doc/a/x.md', 'doc/A/y.md'],
  );
  assert.deepEqual(
    addressing.occurrenceRecords.map((record) => record.path),
    ['doc', 'doc/a', 'doc/a/x.md', 'doc/A', 'doc/A/y.md', 'doc/a-b', 'doc/a-b/x.md'],
  );
  assert.deepEqual(addressing.occurrenceRecords.map((record) => record.orderIndex), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(Object.hasOwn(tree.occurrenceRecords[0], 'orderIndex'), false);
});

test('comparison A, known Tree defect D1: a root file outside every scope root gets a corrupt lineage and depth', () => {
  // The docs scope profile includes `README.md` beside the `doc`/`docs` scope roots.
  const tree = prepareTreeOccurrenceSnapshot({ selectedPaths: ['README.md', 'doc/guide.md'], includeRoots: ['doc', 'docs'] });
  const readme = tree.occurrenceRecords.find((record) => record.resolvedPath === 'README.md');

  assert.equal(readme.occurrenceMarker, '1');
  assert.equal(readme.parentResolvedPath, null);
  // Defect: the record is attributed to the first scope root and its lineage is sliced from an
  // unrelated path. Structural Addressing would place it at depth 0 with lineage ['README.md'].
  assert.equal(readme.scopeRootPath, 'doc');
  assert.deepEqual(readme.lineageSegments, ['doc', 'ME.md']);
  assert.equal(readme.depth, 1);
});

test('comparison A, known Tree defect D2: ancestors above a nested target become orphan root occurrences', () => {
  const filePaths = ['tree/src/a.logic.mjs', 'naming/src/b.logic.mjs'];
  const tree = prepareTreeOccurrenceSnapshot({ selectedPaths: filePaths, targets: ['tree/src', 'naming/src'] });
  const treeByPath = byPath(tree.occurrenceRecords, 'resolvedPath');

  // Defect: `naming` and `tree` are not inside any target scope, yet they are emitted as root
  // occurrences that are not parents of the targets, take root markers, and carry the lineage of an
  // unrelated scope root.
  assert.deepEqual(
    tree.occurrenceRecords.filter((record) => record.parentResolvedPath === null).map((record) => [record.resolvedPath, record.occurrenceMarker]),
    [
      ['naming', 'A'],
      ['naming/src', 'B'],
      ['tree', 'D'],
      ['tree/src', 'C'],
    ],
  );
  assert.equal(treeByPath.get('tree').isScopedRoot, false);
  assert.deepEqual(treeByPath.get('tree').lineageSegments, ['naming/src']);

  // Structural Addressing roots each target directly, so target addresses do not depend on
  // phantom ancestors.
  const addressing = prepareTreeCodebaseAddressedSnapshot({
    scopeRoots: toAddressingScopeRoots(filePaths, ['naming/src', 'tree/src']),
  });
  assert.deepEqual(
    addressing.occurrenceRecords.filter((record) => record.parentAddressPath === null).map((record) => [record.path, record.addressPath]),
    [
      ['naming/src', 'A'],
      ['tree/src', 'B'],
    ],
  );
});

// --- Layer B: production inputs (Tree wiring vs get-tree host) --------------------------------

test('comparison B: a whole-scope get-tree run adds a namespace root occurrence; other addresses map by prefix', async (t) => {
  const root = createStandaloneFixture(t, {
    'README.md': 'x\n',
    'src/a.logic.mjs': 'x\n',
    'src/deep/b.logic.mjs': 'x\n',
  });
  const tree = treeSnapshotFor(root);
  const addressing = await getTreeSnapshotFor(root);
  const addressingByPath = new Map(addressing.occurrenceRecords.map((record) => [stripNamespace(record.path), record]));

  // Equivalent representation: get-tree emits the scope root itself as occurrence `A` and paths carry
  // the `calculogic-validator` source namespace; Tree emits no scope-root occurrence for `.`.
  assert.deepEqual(
    [addressingByPath.get('.').addressPath, addressingByPath.get('.').depth, addressingByPath.get('.').path],
    ['A', 0, SOURCE_NAMESPACE],
  );
  assert.equal(tree.occurrenceRecords.some((record) => record.resolvedPath === '.'), false);
  for (const record of tree.occurrenceRecords) {
    const counterpart = addressingByPath.get(record.resolvedPath);
    assert.equal(counterpart.addressPath, `A.${record.addressPath}`, record.resolvedPath);
    assert.equal(counterpart.depth, record.depth + 1, record.resolvedPath);
  }
});

test('comparison B: a single target is addressed identically by both', async (t) => {
  const root = createStandaloneFixture(t, {
    'tree/src/a.logic.mjs': 'x\n',
    'tree/src/sub/b.logic.mjs': 'x\n',
    'tree/test/a.test.mjs': 'x\n',
  });
  const tree = treeSnapshotFor(root, { targets: ['tree/src'] });
  const addressing = await getTreeSnapshotFor(root, ['tree/src']);
  const addressingByPath = new Map(addressing.occurrenceRecords.map((record) => [stripNamespace(record.path), record]));

  const shared = tree.occurrenceRecords.filter((record) => addressingByPath.has(record.resolvedPath));
  for (const record of shared) {
    assert.equal(addressingByPath.get(record.resolvedPath).addressPath, record.addressPath, record.resolvedPath);
    assert.equal(addressingByPath.get(record.resolvedPath).depth, record.depth, record.resolvedPath);
  }
  // The only difference is defect D2's phantom ancestor.
  assert.deepEqual(
    tree.occurrenceRecords.filter((record) => !addressingByPath.has(record.resolvedPath)).map((record) => record.resolvedPath),
    ['tree'],
  );
});

test('comparison B: membership rules differ between Tree input collection and the get-tree walk', async (t) => {
  const root = createStandaloneFixture(
    t,
    {
      'src/a.logic.mjs': 'x\n',
      '.github/workflows/ci.yml': 'x\n',
      '.hidden-file': 'x\n',
      'build/out.js': 'x\n',
      'dist/out.js': 'x\n',
      'coverage/lcov.info': 'x\n',
      'node_modules/pkg/index.js': 'x\n',
    },
    { emptyDirectories: ['empty/nested'], symlinks: [['src-link', 'src']] },
  );
  const treeByPath = byPath(treeSnapshotFor(root).occurrenceRecords, 'resolvedPath');
  const addressingPaths = new Set((await getTreeSnapshotFor(root)).occurrenceRecords.map((record) => stripNamespace(record.path)));

  assert.deepEqual(
    [...addressingPaths].filter((occurrencePath) => !treeByPath.has(occurrencePath)).sort(),
    // namespace root; dot directories (Tree skips them); empty folders (Tree derives folders from files)
    ['.', '.github', '.github/workflows', '.github/workflows/ci.yml', 'empty', 'empty/nested'],
  );
  assert.deepEqual(
    [...treeByPath.keys()].filter((occurrencePath) => !addressingPaths.has(occurrencePath)).sort(),
    // `build/` is excluded only by get-tree; a directory symlink is skipped by get-tree but collected
    // by the suite walk as a non-directory entry, so Tree records it as a file occurrence.
    ['build', 'build/out.js', 'src-link'],
  );
  assert.equal(treeByPath.get('src-link').occurrenceType, 'file');
  for (const excluded of ['dist', 'coverage', 'node_modules']) {
    assert.equal(treeByPath.has(excluded) || addressingPaths.has(excluded), false, excluded);
  }
});

test('comparison B: every difference on this repository is a classified one', async () => {
  // Real-repository check: Tree's validator-scope snapshot against get-tree on this checkout. Shared
  // occurrences must map by the namespace-root prefix; any unshared occurrence must fall into a
  // classified membership category.
  const tree = treeSnapshotFor(VALIDATOR_ROOT);
  const addressing = await getTreeSnapshotFor(VALIDATOR_ROOT);
  const addressingByPath = new Map(addressing.occurrenceRecords.map((record) => [stripNamespace(record.path), record]));
  const treeByPath = byPath(tree.occurrenceRecords, 'resolvedPath');
  const isDotPath = (occurrencePath) => occurrencePath.split('/').some((segment) => segment.startsWith('.') && segment.length > 1);
  const isEmptyFolder = (record) =>
    record.occurrenceType === 'folder' &&
    !addressing.occurrenceRecords.some((candidate) => candidate.parentAddressPath === record.addressPath);

  for (const record of tree.occurrenceRecords) {
    const counterpart = addressingByPath.get(record.resolvedPath);
    if (counterpart) {
      assert.equal(counterpart.addressPath, `A.${record.addressPath}`, record.resolvedPath);
      continue;
    }
    assert.ok(
      record.resolvedPath === 'build' || record.resolvedPath.startsWith('build/') || fs.lstatSync(path.join(VALIDATOR_ROOT, record.resolvedPath)).isSymbolicLink(),
      `unclassified Tree-only occurrence: ${record.resolvedPath}`,
    );
  }
  for (const [occurrencePath, record] of addressingByPath) {
    if (treeByPath.has(occurrencePath) || occurrencePath === '.') {
      continue;
    }
    assert.ok(
      isDotPath(occurrencePath) || isEmptyFolder(record),
      `unclassified get-tree-only occurrence: ${occurrencePath}`,
    );
  }
});
