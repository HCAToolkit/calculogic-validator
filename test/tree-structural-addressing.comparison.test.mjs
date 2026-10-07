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
import util from 'node:util';
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

const createStandaloneFixture = (t, files, { emptyDirectories = [] } = {}) => {
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
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
};

// Creates `[linkPath, targetPath]` symlinks inside a fixture; false where the platform refuses
// symlink creation (for example Windows without the privilege), so only symlink coverage skips.
const tryCreateFixtureSymlinks = (root, symlinks) => {
  try {
    for (const [linkPath, targetPath] of symlinks) {
      const targetAbsolute = path.join(root, targetPath);
      fs.symlinkSync(targetAbsolute, path.join(root, linkPath), fs.statSync(targetAbsolute).isDirectory() ? 'dir' : 'file');
    }
    return true;
  } catch {
    return false;
  }
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

// get-tree's exclusion list, read from its source so this classifier cannot drift from the walker.
const GET_TREE_EXCLUDED_NAMES = new Set(
  JSON.parse(
    fs
      .readFileSync(path.join(VALIDATOR_ROOT, 'scripts', 'addressing-get-tree.host.mjs'), 'utf8')
      .match(/const EXCLUDED_WALK_NAMES = new Set\((\[[^\]]*\])\);/u)[1]
      .replaceAll("'", '"'),
  ),
);

// Classifies every occurrence present on only one side by the documented membership rules and
// returns the ones no rule explains:
//   Tree-only:     a path segment get-tree excludes by name, of any type and at any depth (I3,
//                  including `build` folders and `.git` or excluded-name files), or a symlink (D3);
//   get-tree-only: inside or itself a dot directory (I1), or a folder with no file descendant
//                  outside a dot directory (I2, including folders whose files all sit under a
//                  dot directory that I1 skips).
const listUnclassifiedMembershipDifferences = (repositoryRoot, treeSnapshot, addressingSnapshot) => {
  const addressingByPath = new Map(addressingSnapshot.occurrenceRecords.map((record) => [stripNamespace(record.path), record]));
  const treePaths = new Set(treeSnapshot.occurrenceRecords.map((record) => record.resolvedPath));
  const isInDotDirectory = (occurrencePath, record) => {
    const segments = occurrencePath.split('/');
    const directorySegments = record.occurrenceType === 'folder' ? segments : segments.slice(0, -1);
    return directorySegments.some((segment) => segment.startsWith('.') && segment !== '.');
  };
  const hasNoTreeVisibleFileDescendants = (record) =>
    record.occurrenceType === 'folder' &&
    !addressingSnapshot.occurrenceRecords.some(
      (candidate) =>
        candidate.occurrenceType === 'file' &&
        candidate.addressPath.startsWith(`${record.addressPath}.`) &&
        !isInDotDirectory(stripNamespace(candidate.path), candidate),
    );

  const treeOnly = treeSnapshot.occurrenceRecords
    .map((record) => record.resolvedPath)
    .filter((occurrencePath) => !addressingByPath.has(occurrencePath))
    .filter(
      (occurrencePath) =>
        !occurrencePath.split('/').some((segment) => GET_TREE_EXCLUDED_NAMES.has(segment)) &&
        !fs.lstatSync(path.join(repositoryRoot, occurrencePath)).isSymbolicLink(),
    );
  const getTreeOnly = [...addressingByPath]
    .filter(([occurrencePath]) => occurrencePath !== '.' && !treePaths.has(occurrencePath))
    .filter(([occurrencePath, record]) => !isInDotDirectory(occurrencePath, record) && !hasNoTreeVisibleFileDescendants(record))
    .map(([occurrencePath]) => occurrencePath);

  return { treeOnly, getTreeOnly };
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

// Maps a Structural Addressing record onto the concepts tree-structural-address-probe-contract.spec.md
// preserves, so the migration can keep them without the private snapshot fields.
// `declaredScopeRootPaths` are the scope roots that are occurrences themselves (include roots,
// directory targets, the containing folder of a nested file target, an embedded root). A root ancestor that is not one of them sits directly under
// the omitted standalone `.` scope root (§5.3), so it binds to `.`.
const toProbeContractConcepts = (record, addressingByAddress, declaredScopeRootPaths) => {
  let root = record;
  while (root.parentAddressPath !== null) {
    root = addressingByAddress.get(root.parentAddressPath);
  }
  const scopeRootPath = declaredScopeRootPaths.has(root.path) ? root.path : '.';
  let lineageSegments;
  if (scopeRootPath === '.') {
    lineageSegments = record.path.split('/');
  } else if (record.path === scopeRootPath) {
    lineageSegments = [scopeRootPath];
  } else {
    lineageSegments = [scopeRootPath, ...record.path.slice(scopeRootPath.length + 1).split('/')];
  }

  return {
    occurrenceMarker: record.addressPath,
    markerSegments: record.addressPath.split('.'),
    parentResolvedPath: record.parentAddressPath === null ? null : addressingByAddress.get(record.parentAddressPath).path,
    scopeRootPath,
    lineageSegments,
    isScopedRoot: record.path === scopeRootPath,
    isScopeTopOccurrence: lineageSegments.length === 1,
    depth: record.depth,
  };
};

test('comparison A: the probe contract\'s occurrence concepts are deterministically mappable from Structural Addressing records', () => {
  // Without a declared scope root, the adapter roots the top-level occurrences directly (no `.` node).
  const withoutScopeRootOccurrence = (filePaths) =>
    toAddressingScopeRoots(filePaths.map((filePath) => `__root__/${filePath}`), ['__root__'])[0].children.map(function strip(node) {
      return {
        ...node,
        path: node.path.slice('__root__/'.length),
        ...(node.children ? { children: node.children.map(strip) } : {}),
      };
    });
  const cases = [
    { label: 'include roots', filePaths: ['src/a/x.logic.mjs', 'src/a/b/y.logic.mjs', 'src/z.logic.mjs', 'test/a/x.test.mjs'], roots: ['src', 'test'], options: { includeRoots: ['src', 'test'] } },
    { label: 'nested directory target', filePaths: ['tree/src/a.logic.mjs', 'tree/src/sub/b.logic.mjs'], roots: ['tree/src'], options: { targets: ['tree/src'] } },
    // The adapter roots a nested file target at its containing folder (I4); that folder is its
    // effective scope root, so it must be declared like a directory target.
    { label: 'nested file target', filePaths: ['tree/src/index.mjs'], roots: ['tree/src'], options: { targets: ['tree/src/index.mjs'] } },
    { label: 'standalone whole scope', filePaths: ['README.md', 'src/a.logic.mjs', 'src/sub/b.logic.mjs'], roots: [], options: { includeRoots: ['.'] } },
    { label: 'repository-root file target', filePaths: ['README.md'], roots: [], options: { targets: ['README.md'] } },
  ];
  for (const { label, filePaths, roots, options } of cases) {
    const tree = prepareTreeOccurrenceSnapshot({ selectedPaths: filePaths, ...options });
    const addressing = prepareTreeCodebaseAddressedSnapshot({
      scopeRoots: roots.length > 0 ? toAddressingScopeRoots(filePaths, roots) : withoutScopeRootOccurrence(filePaths),
    });
    const declaredScopeRootPaths = new Set(roots);
    assert.equal(addressing.occurrenceRecords.length > 0, true, label);
    const addressingByPath = byPath(addressing.occurrenceRecords, 'path');
    const addressingByAddress = new Map(addressing.occurrenceRecords.map((record) => [record.addressPath, record]));

    // Phantom ancestors (D2) have no Structural Addressing counterpart and are excluded here.
    for (const record of tree.occurrenceRecords.filter((candidate) => addressingByPath.has(candidate.resolvedPath))) {
      assert.deepEqual(
        toProbeContractConcepts(addressingByPath.get(record.resolvedPath), addressingByAddress, declaredScopeRootPaths),
        {
          occurrenceMarker: record.occurrenceMarker,
          markerSegments: record.markerSegments,
          parentResolvedPath: record.parentResolvedPath,
          scopeRootPath: record.scopeRootPath,
          lineageSegments: record.lineageSegments,
          isScopedRoot: record.isScopedRoot,
          isScopeTopOccurrence: record.isScopeTopOccurrence,
          depth: record.depth,
        },
        `${label}: ${record.resolvedPath}`,
      );
    }
  }
});

test('comparison A: the probe contract\'s snapshot envelope is input-derived and not the Structural Addressing envelope', () => {
  // The probe contract also preserves the envelope: `scope: { scopeRootPath, targetKind, source }` and
  // a string `scopeRoots` list. Every envelope value comes from the inputs (scope roots, targets,
  // selected paths, source), never from the occurrence records, so an adapter can emit it verbatim.
  const cases = [
    { label: 'include roots', input: { selectedPaths: ['src/a.mjs', 'test/b.mjs'], includeRoots: ['src', 'test'] }, scopeRoots: ['src', 'test'], scopeRootPath: 'src', targetKind: 'mixed' },
    { label: 'standalone whole scope', input: { selectedPaths: ['README.md', 'src/a.mjs'], includeRoots: ['.'] }, scopeRoots: ['.'], scopeRootPath: '.', targetKind: 'mixed' },
    { label: 'nested directory target', input: { selectedPaths: ['tree/src/a.mjs'], targets: ['tree/src'] }, scopeRoots: ['tree/src'], scopeRootPath: 'tree/src', targetKind: 'dir' },
    { label: 'nested file target', input: { selectedPaths: ['tree/src/index.mjs'], targets: ['tree/src/index.mjs'] }, scopeRoots: ['tree/src'], scopeRootPath: 'tree/src', targetKind: 'file' },
    { label: 'repository-root file target', input: { selectedPaths: ['README.md'], targets: ['README.md'] }, scopeRoots: ['.'], scopeRootPath: '.', targetKind: 'file' },
    { label: 'overlapping targets', input: { selectedPaths: ['tree/src/x.mjs'], targets: ['tree', 'tree/src'] }, scopeRoots: ['tree', 'tree/src'], scopeRootPath: 'tree', targetKind: 'mixed' },
  ];
  for (const { label, input, scopeRoots, scopeRootPath, targetKind } of cases) {
    const envelopeOf = ({ occurrenceRecords, ...envelope }) => envelope;
    const snapshot = prepareTreeStructuralAddressSnapshot({ ...input, scope: { source: 'tree-structure-advisor.wiring' } });
    assert.deepEqual(
      envelopeOf(snapshot),
      { scope: { scopeRootPath, targetKind, source: 'tree-structure-advisor.wiring' }, scopeRoots },
      label,
    );
    // Same envelope with no occurrence records at all: it does not depend on them.
    const recordless = prepareTreeStructuralAddressSnapshot({
      ...input,
      occurrenceSnapshot: { scopeRoots: snapshot.scopeRoots, occurrenceRecords: [] },
      scope: { source: 'tree-structure-advisor.wiring' },
    });
    assert.deepEqual(envelopeOf(recordless), envelopeOf(snapshot), label);
  }

  // Structural Addressing's envelope is a different shape: a string-or-null `scope`, node-object
  // `scopeRoots`, and profile metadata. Its roots are collapsed (D4) and omit the `.` root (§5.3),
  // so mapping them back would lose `tree/src` from overlapping targets and the `.` binding.
  const addressing = prepareTreeCodebaseAddressedSnapshot({ scopeRoots: toAddressingScopeRoots(['tree/src/x.mjs'], ['tree']) });
  assert.equal(addressing.scope, null);
  assert.deepEqual(Object.keys(addressing).sort(), [
    'domainPrefix', 'occurrenceRecords', 'profileId', 'scope', 'scopeRoots', 'snapshotOutputId', 'sourceNamespace', 'target',
  ]);
  assert.deepEqual(addressing.scopeRoots.map((node) => node.path), ['tree']);
  assert.equal(typeof addressing.scopeRoots[0], 'object');
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

  // The probe-contract mapping binds the root file to `.`. Every contract-visible field that changes
  // is enumerated here, so a migration gates all of them, not depth alone.
  const addressing = prepareTreeCodebaseAddressedSnapshot({
    scopeRoots: [...toAddressingScopeRoots(['doc/guide.md'], ['doc']), { name: 'README.md', path: 'README.md', occurrenceType: 'file' }],
  });
  const addressingByAddress = new Map(addressing.occurrenceRecords.map((record) => [record.addressPath, record]));
  const mapped = toProbeContractConcepts(
    addressing.occurrenceRecords.find((record) => record.path === 'README.md'),
    addressingByAddress,
    new Set(['doc', 'docs']),
  );
  const changedFields = Object.keys(mapped).filter((field) => !util.isDeepStrictEqual(mapped[field], readme[field]));
  assert.deepEqual(changedFields, ['scopeRootPath', 'lineageSegments', 'isScopeTopOccurrence', 'depth']);
  assert.deepEqual(
    { scopeRootPath: mapped.scopeRootPath, lineageSegments: mapped.lineageSegments, isScopeTopOccurrence: mapped.isScopeTopOccurrence, depth: mapped.depth },
    { scopeRootPath: '.', lineageSegments: ['README.md'], isScopeTopOccurrence: true, depth: 0 },
  );
  // Today's values for the same fields: `doc`, ['doc', 'ME.md'], false, 1.
  assert.equal(readme.isScopeTopOccurrence, false);
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

test('comparison A, D2 rule: a nested file target shifts with its containing folder when a phantom sorts before that folder', () => {
  // Tree roots a nested file target at its containing folder (I4), so that folder is a folder scope
  // root and D2 applies to it like a directory target: the target file moves with it.
  const cases = [
    { target: 'tree/zz/index.mjs', tree: [['tree', 'A'], ['tree/zz', 'B'], ['tree/zz/index.mjs', 'B.1']], addressing: [['tree/zz', 'A'], ['tree/zz/index.mjs', 'A.1']] },
    { target: 'tree/src/index.mjs', tree: [['tree', 'B'], ['tree/src', 'A'], ['tree/src/index.mjs', 'A.1']], addressing: [['tree/src', 'A'], ['tree/src/index.mjs', 'A.1']] },
  ];
  for (const { target, tree, addressing } of cases) {
    const containingFolder = path.posix.dirname(target);
    const treeSnapshot = prepareTreeOccurrenceSnapshot({ selectedPaths: [target], targets: [target] });
    const addressingSnapshot = prepareTreeCodebaseAddressedSnapshot({ scopeRoots: toAddressingScopeRoots([target], [containingFolder]) });
    assert.deepEqual(treeSnapshot.occurrenceRecords.map((record) => [record.resolvedPath, record.occurrenceMarker]).sort(), tree, target);
    assert.deepEqual(addressingSnapshot.occurrenceRecords.map((record) => [record.path, record.addressPath]).sort(), addressing, target);
  }
});

test('comparison A, D2 rule: a phantom folder never shifts a root file target, which uses the file marker lane', () => {
  // Folders take letter markers and files take number markers, counted separately. A phantom
  // ancestor is always a folder, so it can shift only folder targets, never a root file target.
  const rootsOf = (records, pathKey, addressKey, parentKey) =>
    records.filter((record) => record[parentKey] === null).map((record) => [record[pathKey], record[addressKey]]).sort();
  const cases = [
    // `tree` sorts before `zzz.md`, yet the file keeps `1`; the folder target is unchanged too.
    { targets: ['tree/src', 'zzz.md'], filePaths: ['tree/src/a.logic.mjs', 'zzz.md'], tree: [['tree', 'B'], ['tree/src', 'A'], ['zzz.md', '1']], addressing: [['tree/src', 'A'], ['zzz.md', '1']] },
    // `tree` sorts before `zz`, so the folder target shifts while `aaa.md` keeps `1`.
    { targets: ['tree/zz', 'aaa.md'], filePaths: ['tree/zz/a.logic.mjs', 'aaa.md'], tree: [['aaa.md', '1'], ['tree', 'A'], ['tree/zz', 'B']], addressing: [['aaa.md', '1'], ['tree/zz', 'A']] },
  ];
  for (const { targets, filePaths, tree, addressing } of cases) {
    const [folderTarget, fileTarget] = targets;
    const treeSnapshot = prepareTreeOccurrenceSnapshot({ selectedPaths: filePaths, targets });
    const addressingSnapshot = prepareTreeCodebaseAddressedSnapshot({
      scopeRoots: [
        ...toAddressingScopeRoots(filePaths.filter((filePath) => filePath !== fileTarget), [folderTarget]),
        { name: fileTarget, path: fileTarget, occurrenceType: 'file' },
      ],
    });
    assert.deepEqual(rootsOf(treeSnapshot.occurrenceRecords, 'resolvedPath', 'occurrenceMarker', 'parentResolvedPath'), tree, targets.join(' + '));
    assert.deepEqual(rootsOf(addressingSnapshot.occurrenceRecords, 'path', 'addressPath', 'parentAddressPath'), addressing, targets.join(' + '));
  }
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

test('comparison B: an explicitly targeted build folder is walked in full and addressed identically by both', async (t) => {
  const root = createStandaloneFixture(t, {
    'build/out.js': 'x\n',
    'build/sub/b.js': 'x\n',
    'src/a.logic.mjs': 'x\n',
  });
  const toRows = (records, pathOf) => records.map((record) => [pathOf(record), record.addressPath, record.parentAddressPath, record.depth]);

  // get-tree excludes `build` only as a child of a walked folder; a `build` target is the walked root.
  // Tree does not exclude `build` at all. Both therefore emit the full subtree with the same identities.
  const expected = [
    ['build', 'A', null, 0],
    ['build/out.js', 'A.1', 'A', 1],
    ['build/sub', 'A.A', 'A', 1],
    ['build/sub/b.js', 'A.A.1', 'A.A', 2],
  ];
  assert.deepEqual(toRows(treeSnapshotFor(root, { targets: ['build'] }).occurrenceRecords, (record) => record.resolvedPath).sort(), expected);
  assert.deepEqual(
    toRows((await getTreeSnapshotFor(root, ['build'])).occurrenceRecords, (record) => stripNamespace(record.path)).sort(),
    expected,
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

test('comparison B, I3 before I4: a file target beneath an excluded directory selects no file in Tree', async (t) => {
  const root = createStandaloneFixture(t, {
    'dist/out.js': 'x\n',
    'src/a.logic.mjs': 'x\n',
  });
  const treeInputs = treeInputsFor(root, { targets: ['dist/out.js'] });
  const addressing = await getTreeSnapshotFor(root, ['dist/out.js']);

  // Suite collection skips `dist` before target filtering, so the file target selects nothing and
  // only its containing-folder root remains: I3 membership applies before I4 rooting. get-tree roots
  // the targeted file itself, so a file Tree does not validate appears in its output.
  assert.deepEqual(treeInputs.selectedPaths, []);
  assert.deepEqual(
    treeInputs.structuralAddressSnapshot.occurrenceRecords.map((record) => [record.resolvedPath, record.addressPath]),
    [['dist', 'A']],
  );
  assert.deepEqual(
    addressing.occurrenceRecords.map((record) => [stripNamespace(record.path), record.addressPath, record.depth]),
    [['dist/out.js', '1', 0]],
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
      // A visible folder whose only files sit under a dot directory: Tree never derives it.
      'examples/.fixtures/case.json': 'x\n',
      'build/out.js': 'x\n',
      'src/build/nested.js': 'x\n',
      // A regular file whose name get-tree excludes (the suite walk excludes only such directories).
      'src/dist': 'x\n',
      // A `.git` file, as in a submodule or a Git worktree checkout.
      'vendored/.git': 'gitdir: ../.git/modules/vendored\n',
      'vendored/lib.js': 'x\n',
      'dist/out.js': 'x\n',
      'coverage/lcov.info': 'x\n',
      'node_modules/pkg/index.js': 'x\n',
    },
    { emptyDirectories: ['empty/nested'] },
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
    // namespace root; dot directories (Tree skips them); empty folders and folders whose files all sit
    // under a dot directory (Tree derives folders from the files it collects)
    [
      '.',
      '.github',
      '.github/workflows',
      '.github/workflows/ci.yml',
      'empty',
      'empty/nested',
      'examples',
      'examples/.fixtures',
      'examples/.fixtures/case.json',
    ],
  );
  assert.deepEqual(
    [...treeByPath.keys()].filter((occurrencePath) => !addressingPaths.has(occurrencePath)).sort(),
    // get-tree excludes `build` folders at any depth, Tree excludes none; get-tree excludes any entry
    // named `.git` while the suite walk excludes only a `.git` directory, so a `.git` file is a Tree
    // file occurrence. Symlinks (D3) are covered by their own test.
    ['build', 'build/out.js', 'src/build', 'src/build/nested.js', 'src/dist', 'vendored/.git'],
  );
  for (const excluded of ['dist', 'coverage', 'node_modules']) {
    assert.equal(treeByPath.has(excluded) || addressingPaths.has(excluded), false, excluded);
  }

  // The classifier the live-repository test relies on explains every one of these differences.
  assert.deepEqual(
    listUnclassifiedMembershipDifferences(
      root,
      treeInputs.structuralAddressSnapshot,
      prepareTreeCodebaseAddressedSnapshot(getTreeInput),
    ),
    { treeOnly: [], getTreeOnly: [] },
  );

  // Membership differences also shift shared occurrences: `.github`, `empty`, `examples` (get-tree
  // only) and `build` (Tree only) take root folder markers, so `src` is `B` in Tree but `A.D`, not
  // `A.B`, in get-tree.
  assert.equal(treeByPath.get('src').addressPath, 'B');
  assert.equal(addressingByPath.get('src').addressPath, 'A.D');

  // Re-addressed over the shared membership, every shared occurrence maps by E1 again: the shift is
  // fully explained by I1-I3.
  for (const { path: occurrencePath, tree, addressing } of compareOverSharedMembership(treeInputs, getTreeInput)) {
    assertMapsByE1(tree, addressing, occurrencePath);
  }
});

test('comparison B, defect candidate D3: symlinks to directories and files are Tree file occurrences skipped by get-tree', async (t) => {
  const root = createStandaloneFixture(t, { 'src/a.logic.mjs': 'x\n' });
  if (!tryCreateFixtureSymlinks(root, [['src-link', 'src'], ['src/a-link.logic.mjs', 'src/a.logic.mjs']])) {
    t.skip('Symlink creation not supported in this environment.');
    return;
  }
  const treeInputs = treeInputsFor(root);
  const addressing = prepareTreeCodebaseAddressedSnapshot(await getTreeInputFor(root));
  const treeByPath = byPath(treeInputs.structuralAddressSnapshot.occurrenceRecords, 'resolvedPath');
  const addressingPaths = new Set(addressing.occurrenceRecords.map((record) => stripNamespace(record.path)));

  // The suite walk collects every non-directory entry, so a directory symlink becomes a file occurrence
  // (without its contents) and a file symlink is collected too; get-tree skips both.
  assert.deepEqual(
    [...treeByPath.keys()].filter((occurrencePath) => !addressingPaths.has(occurrencePath)).sort(),
    ['src-link', 'src/a-link.logic.mjs'],
  );
  assert.equal(treeByPath.get('src-link').occurrenceType, 'file');
  assert.deepEqual(
    listUnclassifiedMembershipDifferences(root, treeInputs.structuralAddressSnapshot, addressing),
    { treeOnly: [], getTreeOnly: [] },
  );
});

test('comparison B, intentional difference I5: the join namespace IDs differ even where every address agrees', async () => {
  // This repository produces Naming observations, so the joined payload is non-empty.
  const treeBridge = treeInputsFor(VALIDATOR_ROOT).preparedDependencies.addressedNamingOccurrenceBridge;
  const addressing = await getTreeSnapshotFor(VALIDATOR_ROOT);

  // Naming -> Tree joins key on addressProfileId + addressedSnapshotId + occurrenceAddress. Tree wiring
  // stamps its own namespace IDs on the payload and on every observation, while Structural Addressing
  // exposes a different profile id and an output id that the identity contract does not yet treat
  // as an addressedSnapshotId. Switching producers without a namespace decision would change every
  // join identity even when every address is stable.
  assert.deepEqual(
    [treeBridge.addressProfileId, treeBridge.addressedSnapshotId],
    ['tree-structure-advisor-address-profile', 'tree-structure-advisor-current-snapshot'],
  );
  assert.ok(treeBridge.observations.length > 0, 'expected Naming observations to join');
  for (const observation of treeBridge.observations) {
    assert.deepEqual(
      [observation.addressProfileId, observation.addressedSnapshotId],
      ['tree-structure-advisor-address-profile', 'tree-structure-advisor-current-snapshot'],
    );
  }
  assert.deepEqual([addressing.profileId, addressing.snapshotOutputId], ['tree-codebase', 'addressedTreeSnapshot']);
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

  // Shared occurrences map by E1 once both sides are re-addressed over the shared membership.
  for (const { path: occurrencePath, tree: treeRecord, addressing: counterpart } of compareOverSharedMembership(treeInputs, getTreeInput)) {
    assertMapsByE1(treeRecord, counterpart, occurrencePath);
  }
  assert.deepEqual(listUnclassifiedMembershipDifferences(VALIDATOR_ROOT, tree, addressing), { treeOnly: [], getTreeOnly: [] });
});
