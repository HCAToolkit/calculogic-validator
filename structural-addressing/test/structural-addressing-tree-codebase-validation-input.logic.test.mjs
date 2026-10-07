import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTreeCodebaseValidationInput } from '../src/structural-addressing-tree-codebase-validation-input.logic.mjs';
import { prepareTreeCodebaseAddressedSnapshot } from '../src/structural-addressing-tree-codebase.logic.mjs';

// Refs #45. Contract: doc/ValidatorSpecs/structural-addressing-tree-codebase-validation-input.spec.md.

const flattenNodes = (nodes, parentPath = null, rows = []) => {
  for (const node of nodes) {
    rows.push({ path: node.path, occurrenceType: node.occurrenceType, parentPath });
    if (node.children) {
      flattenNodes(node.children, node.path, rows);
    }
  }
  return rows;
};

const nodeRowsOf = (input) =>
  flattenNodes(prepareTreeCodebaseValidationInput(input).treeCodebaseInput.scopeRoots).sort((left, right) =>
    left.path.localeCompare(right.path),
  );

test('declared roots: normalized targets win, a nested file target becomes its containing folder, a root file target becomes .', () => {
  const { declaredScopeRoots } = prepareTreeCodebaseValidationInput({
    selectedPaths: ['tree/src/x.mjs', 'naming/src/index.mjs', 'README.md'],
    includeRoots: ['src'],
    targets: [{ relPath: 'tree/src/', kind: 'dir' }, 'naming/src/index.mjs', { relPath: './README.md', kind: 'file' }],
  });
  assert.deepEqual(declaredScopeRoots, ['.', 'naming/src', 'tree/src']);
});

test('declared roots: an untyped target is a directory when a selected path lies below it, a file when it is itself selected', () => {
  assert.deepEqual(
    prepareTreeCodebaseValidationInput({ selectedPaths: ['tree/src/x.mjs'], targets: ['tree/src'] }).declaredScopeRoots,
    ['tree/src'],
  );
  assert.deepEqual(
    prepareTreeCodebaseValidationInput({ selectedPaths: ['tree/src/x.mjs'], targets: ['tree/src/x.mjs'] }).declaredScopeRoots,
    ['tree/src'],
  );
  // Neither below nor selected (an excluded directory target): a directory.
  assert.deepEqual(prepareTreeCodebaseValidationInput({ selectedPaths: [], targets: ['dist'] }).declaredScopeRoots, ['dist']);
});

test('declared roots: a --target . run has no normalized targets and falls through to the include roots', () => {
  const dotTarget = [{ relPath: '.', kind: 'dir' }];
  assert.deepEqual(
    prepareTreeCodebaseValidationInput({ selectedPaths: ['README.md', 'doc/g.md'], includeRoots: ['doc', 'docs'], targets: dotTarget })
      .declaredScopeRoots,
    ['doc', 'docs'],
  );
  assert.deepEqual(
    prepareTreeCodebaseValidationInput({ selectedPaths: ['src/a.mjs'], includeRoots: ['.'], targets: dotTarget }).declaredScopeRoots,
    ['.'],
  );
});

test('declared roots: with neither targets nor include roots, each top-level entry is its own root (system profile)', () => {
  const result = prepareTreeCodebaseValidationInput({ selectedPaths: ['package.json', 'tsconfig.json'], includeRoots: [] });
  assert.deepEqual(result.declaredScopeRoots, ['package.json', 'tsconfig.json']);
  // Fallback roots keep their actual type: root-level file nodes, addressed from the repository root.
  assert.deepEqual(nodeRowsOf({ selectedPaths: ['package.json', 'tsconfig.json'], includeRoots: [] }), [
    { path: 'package.json', occurrenceType: 'file', parentPath: null },
    { path: 'tsconfig.json', occurrenceType: 'file', parentPath: null },
  ]);
  assert.deepEqual(result.effectiveAddressingRoots, ['.']);
});

test('overlapping roots: every declared root is kept while the effective roots are collapsed (D4)', () => {
  for (const input of [
    { selectedPaths: ['tree/x.mjs', 'tree/src/y.mjs'], targets: ['tree', 'tree/src'] },
    // Neither file target contains the other; their containing folders tree and tree/sub nest.
    { selectedPaths: ['tree/a.mjs', 'tree/sub/b.mjs'], targets: ['tree/a.mjs', 'tree/sub/b.mjs'] },
  ]) {
    const result = prepareTreeCodebaseValidationInput(input);
    assert.equal(result.declaredScopeRoots.length, 2, JSON.stringify(input.targets));
    assert.deepEqual(result.effectiveAddressingRoots, ['tree'], JSON.stringify(input.targets));
    assert.deepEqual(result.treeCodebaseInput.scopeRoots.map((node) => node.path), ['tree']);
  }
});

test('an empty collapsed root stays, nested under its effective root with its intermediate folders', () => {
  assert.deepEqual(nodeRowsOf({ selectedPaths: ['tree/a.mjs'], targets: ['tree', 'tree/empty'] }), [
    { path: 'tree', occurrenceType: 'folder', parentPath: null },
    { path: 'tree/a.mjs', occurrenceType: 'file', parentPath: 'tree' },
    { path: 'tree/empty', occurrenceType: 'folder', parentPath: 'tree' },
  ]);
  assert.deepEqual(nodeRowsOf({ selectedPaths: ['tree/a.mjs'], targets: ['tree', 'tree/x/empty'] }), [
    { path: 'tree', occurrenceType: 'folder', parentPath: null },
    { path: 'tree/a.mjs', occurrenceType: 'file', parentPath: 'tree' },
    { path: 'tree/x', occurrenceType: 'folder', parentPath: 'tree' },
    { path: 'tree/x/empty', occurrenceType: 'folder', parentPath: 'tree/x' },
  ]);
});

test('effective roots are root nodes with no ancestors above them (no D2 phantom), even with no selected files (I3)', () => {
  assert.deepEqual(nodeRowsOf({ selectedPaths: ['tree/zz/x.mjs'], targets: [{ relPath: 'tree/zz', kind: 'dir' }] }), [
    { path: 'tree/zz', occurrenceType: 'folder', parentPath: null },
    { path: 'tree/zz/x.mjs', occurrenceType: 'file', parentPath: 'tree/zz' },
  ]);
  assert.deepEqual(nodeRowsOf({ selectedPaths: [], targets: [{ relPath: 'dist', kind: 'dir' }] }), [
    { path: 'dist', occurrenceType: 'folder', parentPath: null },
  ]);
});

test('paths under no folder root are addressed from the repository root, and . never absorbs a root', () => {
  // A docs-profile root file beside its include roots (D1 correction).
  assert.deepEqual(nodeRowsOf({ selectedPaths: ['README.md', 'doc/g.md'], includeRoots: ['doc', 'docs'] }), [
    { path: 'doc', occurrenceType: 'folder', parentPath: null },
    { path: 'doc/g.md', occurrenceType: 'file', parentPath: 'doc' },
    { path: 'docs', occurrenceType: 'folder', parentPath: null },
    { path: 'README.md', occurrenceType: 'file', parentPath: null },
  ]);
  // A repository-root file target next to a folder target: tree/src stays its own root.
  const mixed = prepareTreeCodebaseValidationInput({ selectedPaths: ['README.md', 'tree/src/x.mjs'], targets: ['README.md', 'tree/src'] });
  assert.deepEqual(mixed.declaredScopeRoots, ['.', 'tree/src']);
  assert.deepEqual(mixed.effectiveAddressingRoots, ['.', 'tree/src']);
  assert.deepEqual(mixed.treeCodebaseInput.scopeRoots.map((node) => node.path).sort(), ['README.md', 'tree/src']);
  // The whole repository: top-level entries are root nodes, and no `.` node exists.
  const whole = nodeRowsOf({ selectedPaths: ['README.md', 'src/a.mjs'], includeRoots: ['.'] });
  assert.equal(whole.some((row) => row.path === '.'), false);
  assert.deepEqual(whole.filter((row) => row.parentPath === null).map((row) => row.path), ['README.md', 'src']);
});

test('membership: the file nodes are exactly the normalized selected paths, each with one identity', () => {
  const selectedPaths = ['./src/a.mjs', 'src\\sub\\b.mjs', 'src/a.mjs', 'test/t.mjs', '.github/ci.yml', 'dist'];
  const rows = nodeRowsOf({ selectedPaths, includeRoots: ['.'] });
  assert.deepEqual(
    rows.filter((row) => row.occurrenceType === 'file').map((row) => row.path),
    ['.github/ci.yml', 'dist', 'src/a.mjs', 'src/sub/b.mjs', 'test/t.mjs'],
  );
  assert.equal(new Set(rows.map((row) => row.path)).size, rows.length);
});

test('the node tree is valid tree-codebase input and the adapter is deterministic', () => {
  const input = { selectedPaths: ['tree/src/x.mjs', 'tree/top.mjs', 'naming/src/n.mjs'], targets: ['tree', 'tree/src', 'naming/src'] };
  const first = prepareTreeCodebaseValidationInput(input);
  assert.deepEqual(prepareTreeCodebaseValidationInput(input), first);
  const addressed = prepareTreeCodebaseAddressedSnapshot(first.treeCodebaseInput);
  assert.equal(new Set(addressed.occurrenceRecords.map((record) => record.path)).size, addressed.occurrenceRecords.length);
  assert.deepEqual(
    addressed.occurrenceRecords.filter((record) => record.parentAddressPath === null).map((record) => record.path),
    ['naming/src', 'tree'],
  );
});
