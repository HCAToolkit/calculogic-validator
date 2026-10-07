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
import { prepareTreeStructuralAddressSnapshot } from '../tree/src/tree-structural-address-snapshot.logic.mjs';
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
    const targetAbsolute = path.join(root, targetPath);
    fs.symlinkSync(targetAbsolute, path.join(root, linkPath), fs.statSync(targetAbsolute).isDirectory() ? 'dir' : 'file');
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
};

const treeInputsFor = (repositoryRoot, { scope = 'validator', targets } = {}) =>
  prepareTreeStructureAdvisorInputs(repositoryRoot, { scope, targets, packageRoot: repositoryRoot });

const treeSnapshotFor = (repositoryRoot, options) => treeInputsFor(repositoryRoot, options).structuralAddressSnapshot;

const getTreeInputFor = (repositoryRoot, targets = []) =>
  buildTreeCodebaseInputFromFileSystem({ scope: 'validator', targets, cwd: repositoryRoot, packageRoot: repositoryRoot });

const getTreeSnapshotFor = async (repositoryRoot, targets = []) =>
  prepareTreeCodebaseAddressedSnapshot(await getTreeInputFor(repositoryRoot, targets));

const pruneAddressingNodes = (nodes, keepPath) =>
  nodes
    .filter((node) => keepPath(stripNamespace(node.path)))
    .map((node) => (node.children ? { ...node, children: pruneAddressingNodes(node.children, keepPath) } : node));

// Membership changes shift sibling markers, so occurrences present on both sides can differ only
// because of entries one side alone includes. Re-address both producers over the shared membership
// and return each shared path's normalized pair.
const compareOverSharedMembership = (treeInputs, getTreeInput) => {
  const rawTree = treeInputs.structuralAddressSnapshot;
  const rawAddressing = prepareTreeCodebaseAddressedSnapshot(getTreeInput);
  const treePaths = new Set(rawTree.occurrenceRecords.map((record) => record.resolvedPath));
  const sharedPaths = new Set(
    rawAddressing.occurrenceRecords.map((record) => stripNamespace(record.path)).filter((occurrencePath) => treePaths.has(occurrencePath)),
  );
  const targets = treeInputs.targets ?? [];
  // Rebuild through the same addressed-snapshot wrapper Tree consumers read (addressPath and
  // parentAddressPath), first proving it reproduces the wiring's own snapshot from the wiring's
  // inputs, so normalization cannot bypass the layer under test.
  const rebuildTreeSnapshot = (selectedPaths) =>
    prepareTreeStructuralAddressSnapshot({
      selectedPaths,
      targets,
      includeRoots: targets.length > 0 ? [] : rawTree.scopeRoots,
    });
  assert.deepEqual(
    rebuildTreeSnapshot(treeInputs.selectedPaths).occurrenceRecords,
    rawTree.occurrenceRecords,
    'the wiring snapshot must be reproducible from its own inputs',
  );
  const normalizedTree = rebuildTreeSnapshot(
    treeInputs.selectedPaths.filter((selectedPath) => sharedPaths.has(selectedPath)),
  );
  const normalizedAddressing = prepareTreeCodebaseAddressedSnapshot({
    ...getTreeInput,
    scopeRoots: pruneAddressingNodes(getTreeInput.scopeRoots, (occurrencePath) => occurrencePath === '.' || sharedPaths.has(occurrencePath)),
  });
  const addressingByPath = new Map(normalizedAddressing.occurrenceRecords.map((record) => [stripNamespace(record.path), record]));

  return normalizedTree.occurrenceRecords.map((record) => ({ path: record.resolvedPath, tree: record, addressing: addressingByPath.get(record.resolvedPath) }));
};

// E1 maps a standalone whole-scope Tree record onto get-tree's namespaced record: the address and
// parent gain the `A` namespace root, and depth grows by one.
const assertMapsByE1 = (treeRecord, addressingRecord, label) => {
  assert.ok(addressingRecord, `missing get-tree counterpart: ${label}`);
  assert.equal(addressingRecord.addressPath, `A.${treeRecord.addressPath}`, label);
  assert.equal(
    addressingRecord.parentAddressPath,
    treeRecord.parentAddressPath === null ? 'A' : `A.${treeRecord.parentAddressPath}`,
    label,
  );
  assert.equal(addressingRecord.depth, treeRecord.depth + 1, label);
  assert.equal(addressingRecord.occurrenceType, treeRecord.occurrenceType, label);
};

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

test('comparison A, D2 rule: sibling targets keep their addresses when the phantom ancestor sorts after them', () => {
  // D2 shifts a target only when a phantom ancestor sorts before it among the root siblings. Here
  // `tree` sorts after `a` and `b`, so only the phantom itself takes an extra marker.
  const filePaths = ['tree/a/x.logic.mjs', 'tree/b/y.logic.mjs'];
  const tree = prepareTreeOccurrenceSnapshot({ selectedPaths: filePaths, targets: ['tree/a', 'tree/b'] });
  const addressing = prepareTreeCodebaseAddressedSnapshot({ scopeRoots: toAddressingScopeRoots(filePaths, ['tree/a', 'tree/b']) });
  const rootsOf = (records, pathKey, addressKey, parentKey) =>
    records.filter((record) => record[parentKey] === null).map((record) => [record[pathKey], record[addressKey]]);

  assert.deepEqual(rootsOf(tree.occurrenceRecords, 'resolvedPath', 'occurrenceMarker', 'parentResolvedPath'), [
    ['tree', 'C'],
    ['tree/a', 'A'],
    ['tree/b', 'B'],
  ]);
  assert.deepEqual(rootsOf(addressing.occurrenceRecords, 'path', 'addressPath', 'parentAddressPath'), [
    ['tree/a', 'A'],
    ['tree/b', 'B'],
  ]);
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
    assertMapsByE1(record, addressingByPath.get(record.resolvedPath), record.resolvedPath);
  }
});

test('comparison B: the embedded validator root is a real occurrence on both sides, so E1 does not apply', async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tree-addressing-comparison-embedded-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [relativePath, content] of Object.entries({
    'package.json': `${JSON.stringify({ name: 'consumer-app' })}\n`,
    'src/app.mjs': 'x\n',
    'calculogic-validator/package.json': `${JSON.stringify({ name: '@calculogic/validator' })}\n`,
    'calculogic-validator/src/a.logic.mjs': 'x\n',
    'calculogic-validator/tree/src/b.logic.mjs': 'x\n',
  })) {
    fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(root, relativePath), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  const packageRoot = path.join(root, 'calculogic-validator');

  const tree = prepareTreeStructureAdvisorInputs(root, { scope: 'validator', packageRoot }).structuralAddressSnapshot;
  const addressing = prepareTreeCodebaseAddressedSnapshot(
    await buildTreeCodebaseInputFromFileSystem({ scope: 'validator', targets: [], cwd: root, packageRoot }),
  );
  const toRows = (records, pathOf) => records.map((record) => [pathOf(record), record.addressPath, record.parentAddressPath, record.depth]);

  // In embedded development the validator scope root is the real folder `calculogic-validator`, which
  // both producers emit as occurrence `A` with the same descendants. Only the standalone `.` root
  // differs (E1).
  assert.deepEqual(toRows(tree.occurrenceRecords, (record) => record.resolvedPath)[0], ['calculogic-validator', 'A', null, 0]);
  assert.deepEqual(
    toRows(addressing.occurrenceRecords, (record) => record.path).sort(),
    toRows(tree.occurrenceRecords, (record) => record.resolvedPath).sort(),
  );
});

test('comparison B: a single target is addressed identically when its phantom ancestor sorts after it', async (t) => {
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
    assert.equal(addressingByPath.get(record.resolvedPath).parentAddressPath, record.parentAddressPath, record.resolvedPath);
    assert.equal(addressingByPath.get(record.resolvedPath).depth, record.depth, record.resolvedPath);
  }
  // The only difference is defect D2's phantom ancestor (`tree`, which sorts after `src`).
  assert.deepEqual(
    tree.occurrenceRecords.filter((record) => !addressingByPath.has(record.resolvedPath)).map((record) => record.resolvedPath),
    ['tree'],
  );
});

test('comparison B, known Tree defect D2: a single target shifts when its phantom ancestor sorts first', async (t) => {
  const root = createStandaloneFixture(t, {
    'tree/zz/a.logic.mjs': 'x\n',
    'tree/zz/sub/b.logic.mjs': 'x\n',
  });
  const treeByPath = byPath(treeSnapshotFor(root, { targets: ['tree/zz'] }).occurrenceRecords, 'resolvedPath');
  const addressingByPath = new Map(
    (await getTreeSnapshotFor(root, ['tree/zz'])).occurrenceRecords.map((record) => [stripNamespace(record.path), record]),
  );

  // Root siblings sort by basename: the phantom `tree` takes `A`, so the target becomes `B` in Tree
  // while Structural Addressing roots the target at `A`. Every address under the target shifts.
  assert.equal(treeByPath.get('tree').addressPath, 'A');
  assert.equal(treeByPath.get('tree/zz').addressPath, 'B');
  assert.equal(addressingByPath.get('tree/zz').addressPath, 'A');
  assert.equal(treeByPath.get('tree/zz/sub/b.logic.mjs').addressPath, 'B.A.1');
  assert.equal(addressingByPath.get('tree/zz/sub/b.logic.mjs').addressPath, 'A.A.1');
});

test('comparison B, intentional difference I3: an explicitly targeted excluded directory is empty in Tree but walked by get-tree', async (t) => {
  const root = createStandaloneFixture(t, {
    'dist/out.js': 'x\n',
    'dist/sub/b.js': 'x\n',
    'src/a.logic.mjs': 'x\n',
  });
  const treeInputs = treeInputsFor(root, { targets: ['dist'] });
  const addressing = await getTreeSnapshotFor(root, ['dist']);

  // Tree's suite collection skips `dist` before target filtering, so no file is selected and only the
  // target root occurrence remains. get-tree applies its exclusions only to children of a walked
  // folder, so an explicitly targeted `dist` is walked in full.
  assert.deepEqual(treeInputs.selectedPaths, []);
  assert.deepEqual(
    treeInputs.structuralAddressSnapshot.occurrenceRecords.map((record) => [record.resolvedPath, record.addressPath]),
    [['dist', 'A']],
  );
  assert.deepEqual(
    addressing.occurrenceRecords.map((record) => [stripNamespace(record.path), record.addressPath]),
    [
      ['dist', 'A'],
      ['dist/out.js', 'A.1'],
      ['dist/sub', 'A.A'],
      ['dist/sub/b.js', 'A.A.1'],
    ],
  );
});

test('comparison B, intentional difference I4: a nested file target is rooted at its containing folder in Tree but at the file in get-tree', async (t) => {
  const root = createStandaloneFixture(t, {
    'src/index.mjs': 'x\n',
    'src/other.mjs': 'x\n',
  });
  const tree = treeSnapshotFor(root, { targets: ['src/index.mjs'] });
  const addressing = await getTreeSnapshotFor(root, ['src/index.mjs']);

  // Tree scopes a file target to its containing folder: the folder is the scope root occurrence and
  // the file is addressed beneath it. Only the target file is selected, so `src/other.mjs` is absent.
  assert.deepEqual(
    tree.occurrenceRecords.map((record) => [record.resolvedPath, record.addressPath, record.depth]),
    [
      ['src', 'A', 0],
      ['src/index.mjs', 'A.1', 1],
    ],
  );
  // get-tree roots the file itself, so the file is the only occurrence, addressed `1` at depth 0.
  assert.deepEqual(
    addressing.occurrenceRecords.map((record) => [stripNamespace(record.path), record.addressPath, record.depth]),
    [['src/index.mjs', '1', 0]],
  );
});

test('comparison B: a repository-root file target is addressed identically by both', async (t) => {
  const root = createStandaloneFixture(t, {
    'README.md': 'x\n',
    'src/a.logic.mjs': 'x\n',
  });
  const toRows = (records, pathOf) => records.map((record) => [pathOf(record), record.addressPath, record.depth, record.parentAddressPath]);

  // Tree's containing scope for a root file is `.`, which emits no occurrence, so both producers emit
  // only the file at `1`, depth 0, with no parent. I4 applies to files below the root only.
  assert.deepEqual(toRows(treeSnapshotFor(root, { targets: ['README.md'] }).occurrenceRecords, (record) => record.resolvedPath), [
    ['README.md', '1', 0, null],
  ]);
  assert.deepEqual(toRows((await getTreeSnapshotFor(root, ['README.md'])).occurrenceRecords, (record) => stripNamespace(record.path)), [
    ['README.md', '1', 0, null],
  ]);
});

test('comparison B, known defect D4: overlapping targets get one detached identity in Tree and two in get-tree', async (t) => {
  const root = createStandaloneFixture(t, {
    'tree/top.logic.mjs': 'x\n',
    'tree/src/a.logic.mjs': 'x\n',
    'tree/src/sub/b.logic.mjs': 'x\n',
  });
  const targets = ['tree', 'tree/src'];
  const tree = treeSnapshotFor(root, { targets });
  const treeByPath = byPath(tree.occurrenceRecords, 'resolvedPath');
  const addressing = await getTreeSnapshotFor(root, targets);

  // Tree: union semantics, each path once, but the inner target is detached from the outer one and
  // becomes its own root instead of a child of `tree`.
  assert.equal(treeByPath.size, tree.occurrenceRecords.length);
  assert.deepEqual(
    [treeByPath.get('tree/src').addressPath, treeByPath.get('tree/src').parentAddressPath, treeByPath.get('tree').addressPath],
    ['A', null, 'B'],
  );

  // get-tree: walks both roots, so every inner path appears twice with two identities.
  const addressesByPath = new Map();
  for (const record of addressing.occurrenceRecords) {
    const occurrencePath = stripNamespace(record.path);
    addressesByPath.set(occurrencePath, [...(addressesByPath.get(occurrencePath) ?? []), record.addressPath]);
  }
  assert.deepEqual(addressesByPath.get('tree/src'), ['A', 'B.A']);
  assert.deepEqual(addressesByPath.get('tree/src/sub/b.logic.mjs'), ['A.A.1', 'B.A.A.1']);
  assert.equal(addressesByPath.get('tree/top.logic.mjs').length, 1);
});

test('comparison B: membership rules differ between Tree input collection and the get-tree walk', async (t) => {
  const root = createStandaloneFixture(
    t,
    {
      'src/a.logic.mjs': 'x\n',
      '.github/workflows/ci.yml': 'x\n',
      '.hidden-file': 'x\n',
      'build/out.js': 'x\n',
      'src/build/nested.js': 'x\n',
      // A `.git` file, as in a submodule or a Git worktree checkout.
      'vendored/.git': 'gitdir: ../.git/modules/vendored\n',
      'vendored/lib.js': 'x\n',
      'dist/out.js': 'x\n',
      'coverage/lcov.info': 'x\n',
      'node_modules/pkg/index.js': 'x\n',
    },
    { emptyDirectories: ['empty/nested'], symlinks: [['src-link', 'src'], ['src/a-link.logic.mjs', 'src/a.logic.mjs']] },
  );
  const treeInputs = treeInputsFor(root);
  const getTreeInput = await getTreeInputFor(root);
  const treeByPath = byPath(treeInputs.structuralAddressSnapshot.occurrenceRecords, 'resolvedPath');
  const addressingByPath = new Map(
    prepareTreeCodebaseAddressedSnapshot(getTreeInput).occurrenceRecords.map((record) => [stripNamespace(record.path), record]),
  );
  const addressingPaths = new Set(addressingByPath.keys());

  assert.deepEqual(
    [...addressingPaths].filter((occurrencePath) => !treeByPath.has(occurrencePath)).sort(),
    // namespace root; dot directories (Tree skips them); empty folders (Tree derives folders from files)
    ['.', '.github', '.github/workflows', '.github/workflows/ci.yml', 'empty', 'empty/nested'],
  );
  assert.deepEqual(
    [...treeByPath.keys()].filter((occurrencePath) => !addressingPaths.has(occurrencePath)).sort(),
    // get-tree excludes `build` folders at any depth, Tree excludes none; get-tree excludes any entry
    // named `.git` while the suite walk excludes only a `.git` directory, so a `.git` file is a Tree
    // file occurrence; a directory symlink is skipped by get-tree but collected by the suite walk as a
    // non-directory entry, so Tree records it as a file occurrence; a symlink to a regular file is
    // likewise collected by the suite walk and skipped by get-tree.
    ['build', 'build/out.js', 'src-link', 'src/a-link.logic.mjs', 'src/build', 'src/build/nested.js', 'vendored/.git'],
  );
  assert.equal(treeByPath.get('src-link').occurrenceType, 'file');
  for (const excluded of ['dist', 'coverage', 'node_modules']) {
    assert.equal(treeByPath.has(excluded) || addressingPaths.has(excluded), false, excluded);
  }

  // Membership differences also shift shared occurrences: `.github`, `empty` (get-tree only) and
  // `build` (Tree only) take root folder markers, so `src` is `B` in Tree but `A.C`, not `A.B`, in get-tree.
  assert.equal(treeByPath.get('src').addressPath, 'B');
  assert.equal(addressingByPath.get('src').addressPath, 'A.C');

  // Re-addressed over the shared membership, every shared occurrence maps by E1 again: the shift is
  // fully explained by I1-I3 and D3.
  for (const { path: occurrencePath, tree, addressing } of compareOverSharedMembership(treeInputs, getTreeInput)) {
    assertMapsByE1(tree, addressing, occurrencePath);
  }
});

test('comparison B: every difference on this repository is a classified one', async () => {
  // Real-repository check: Tree's validator-scope snapshot against get-tree on this checkout. Shared
  // occurrences must map by the namespace-root prefix after membership normalization; any unshared
  // occurrence must fall into a classified membership category.
  const treeInputs = treeInputsFor(VALIDATOR_ROOT);
  const getTreeInput = await getTreeInputFor(VALIDATOR_ROOT);
  const tree = treeInputs.structuralAddressSnapshot;
  const addressing = prepareTreeCodebaseAddressedSnapshot(getTreeInput);
  const addressingByPath = new Map(addressing.occurrenceRecords.map((record) => [stripNamespace(record.path), record]));
  const treeByPath = byPath(tree.occurrenceRecords, 'resolvedPath');
  const isDotPath = (occurrencePath) => occurrencePath.split('/').some((segment) => segment.startsWith('.') && segment.length > 1);
  const isEmptyFolder = (record) =>
    record.occurrenceType === 'folder' &&
    !addressing.occurrenceRecords.some((candidate) => candidate.parentAddressPath === record.addressPath);

  // Shared occurrences map by E1 once both sides are re-addressed over the shared membership.
  for (const { path: occurrencePath, tree: treeRecord, addressing: counterpart } of compareOverSharedMembership(treeInputs, getTreeInput)) {
    assertMapsByE1(treeRecord, counterpart, occurrencePath);
  }
  for (const record of tree.occurrenceRecords) {
    if (addressingByPath.has(record.resolvedPath)) {
      continue;
    }
    assert.ok(
      record.resolvedPath.split('/').some((segment) => segment === 'build' || segment === '.git') ||
        fs.lstatSync(path.join(VALIDATOR_ROOT, record.resolvedPath)).isSymbolicLink(),
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
