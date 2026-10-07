import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareTreeAddressedOccurrenceSnapshot } from '../src/tree-addressed-occurrence-snapshot.logic.mjs';
import { prepareTreeCodebaseValidationInput } from '../../structural-addressing/src/structural-addressing-tree-codebase-validation-input.logic.mjs';
import { prepareTreeCodebaseAddressedSnapshot } from '../../structural-addressing/src/structural-addressing-tree-codebase.logic.mjs';

// Refs #45. Contract: doc/ValidatorSpecs/tree-owned/tree-structural-address-probe-contract.spec.md,
// "Addressing-backed projection".

const project = ({ selectedPaths = [], includeRoots = [], targets = [], source = 'test' }) => {
  const adapted = prepareTreeCodebaseValidationInput({ selectedPaths, includeRoots, targets });
  return prepareTreeAddressedOccurrenceSnapshot({
    occurrenceRecords: prepareTreeCodebaseAddressedSnapshot(adapted.treeCodebaseInput).occurrenceRecords,
    declaredScopeRoots: adapted.declaredScopeRoots,
    targets,
    selectedPaths,
    source,
  });
};

const byPath = (snapshot) => new Map(snapshot.occurrenceRecords.map((record) => [record.resolvedPath, record]));

test('projection emits the neutral evidence envelope with every contract field and no Tree policy fields', () => {
  const snapshot = project({ selectedPaths: ['src/a.mjs'], includeRoots: ['src'] });
  assert.deepEqual(Object.keys(snapshot).sort(), ['occurrenceRecords', 'scope', 'scopeRoots']);
  assert.deepEqual(Object.keys(snapshot.scope).sort(), ['scopeRootPath', 'source', 'targetKind']);
  assert.deepEqual(Object.keys(snapshot.occurrenceRecords[0]).sort(), [
    'actualName', 'addressPath', 'depth', 'isScopeTopOccurrence', 'isScopedRoot', 'lineageSegments', 'markerSegments', 'name',
    'occurrenceMarker', 'occurrenceType', 'orderIndex', 'parentAddressPath', 'parentResolvedPath', 'path', 'resolvedPath', 'scopeRootPath',
  ]);
});

test('records map Structural Addressing fields onto the probe-contract concepts', () => {
  const records = byPath(project({ selectedPaths: ['src/a.mjs', 'src/sub/b.mjs'], includeRoots: ['src'] }));
  assert.deepEqual(records.get('src/sub/b.mjs'), {
    resolvedPath: 'src/sub/b.mjs',
    actualName: 'b.mjs',
    occurrenceType: 'file',
    parentResolvedPath: 'src/sub',
    depth: 2,
    scopeRootPath: 'src',
    lineageSegments: ['src', 'sub', 'b.mjs'],
    markerSegments: ['A', 'A', '1'],
    occurrenceMarker: 'A.A.1',
    isScopedRoot: false,
    isScopeTopOccurrence: false,
    path: 'src/sub/b.mjs',
    name: 'b.mjs',
    addressPath: 'A.A.1',
    parentAddressPath: 'A.A',
    orderIndex: 3,
  });
  assert.deepEqual(
    [records.get('src').isScopedRoot, records.get('src').isScopeTopOccurrence, records.get('src').parentResolvedPath],
    [true, true, null],
  );
});

test('scope binding is the deepest declared root, so a collapsed inner root keeps its own binding', () => {
  const records = byPath(project({ selectedPaths: ['tree/x.mjs', 'tree/src/y.mjs'], targets: ['tree', 'tree/src'] }));
  assert.deepEqual(
    ['tree', 'tree/src', 'tree/src/y.mjs'].map((recordPath) => {
      const { scopeRootPath, isScopedRoot, isScopeTopOccurrence, lineageSegments, parentResolvedPath } = records.get(recordPath);
      return [recordPath, scopeRootPath, isScopedRoot, isScopeTopOccurrence, lineageSegments, parentResolvedPath];
    }),
    [
      ['tree', 'tree', true, true, ['tree'], null],
      ['tree/src', 'tree/src', true, true, ['tree/src'], 'tree'],
      ['tree/src/y.mjs', 'tree/src', false, false, ['tree/src', 'y.mjs'], 'tree/src'],
    ],
  );
});

test('a path under no declared root binds to ., and top-level-entry fallback roots keep isScopedRoot', () => {
  const docs = byPath(project({ selectedPaths: ['README.md', 'doc/g.md'], includeRoots: ['doc', 'docs'] })).get('README.md');
  assert.deepEqual(
    [docs.scopeRootPath, docs.lineageSegments, docs.isScopedRoot, docs.isScopeTopOccurrence, docs.depth],
    ['.', ['README.md'], false, true, 0],
  );
  const system = byPath(project({ selectedPaths: ['package.json', 'tsconfig.json'] })).get('package.json');
  assert.deepEqual(
    [system.scopeRootPath, system.isScopedRoot, system.isScopeTopOccurrence, system.occurrenceType],
    ['package.json', true, true, 'file'],
  );
});

test('envelope: scopeRoots are the declared roots, and scopeRootPath is the first of them or .', () => {
  const overlap = project({ selectedPaths: ['tree/x.mjs', 'tree/src/y.mjs'], targets: ['tree', 'tree/src'], source: 'tree-structure-advisor.wiring' });
  assert.deepEqual(overlap.scopeRoots, ['tree', 'tree/src']);
  assert.deepEqual(overlap.scope, { scopeRootPath: 'tree', targetKind: 'mixed', source: 'tree-structure-advisor.wiring' });
  assert.equal(project({ selectedPaths: [] }).scope.scopeRootPath, '.');
});

test('envelope targetKind keeps descriptor-kind precedence over the . case', () => {
  const targetKindOf = (targets, selectedPaths = ['a.mjs', 'src/b.mjs']) => project({ selectedPaths, includeRoots: ['.'], targets }).scope.targetKind;
  assert.equal(targetKindOf([{ relPath: '.', kind: 'dir' }]), 'dir');
  assert.equal(targetKindOf(['.']), 'mixed');
  assert.equal(targetKindOf([{ relPath: '.', kind: null }]), 'mixed');
  assert.equal(targetKindOf(['src']), 'dir');
  assert.equal(targetKindOf(['a.mjs']), 'file');
  assert.equal(targetKindOf(['src', 'a.mjs']), 'mixed');
  assert.equal(targetKindOf([]), 'mixed');
});

test('records keep Tree path order and carry the traversal order as orderIndex', () => {
  const snapshot = project({ selectedPaths: ['src/z.mjs', 'src/a/b.mjs', 'src/m.mjs'], includeRoots: ['src'] });
  const paths = snapshot.occurrenceRecords.map((record) => record.resolvedPath);
  assert.deepEqual(paths, [...paths].sort((left, right) => left.localeCompare(right)));
  assert.deepEqual(
    [...snapshot.occurrenceRecords].sort((left, right) => left.orderIndex - right.orderIndex).map((record) => record.resolvedPath),
    ['src', 'src/a', 'src/a/b.mjs', 'src/m.mjs', 'src/z.mjs'],
  );
});

// Contract coverage carried over from the retired private producers' unit tests (Refs #49), now
// asserted against the production chain.

test('repeated names are disambiguated by lineage and address', () => {
  const records = byPath(project({
    selectedPaths: ['calculogic-validator/src/core/runtime.mjs', 'calculogic-validator/naming/src/naming.logic.mjs', 'tree/src/tree.logic.mjs'],
    includeRoots: ['calculogic-validator'],
  }));
  const srcRecords = ['calculogic-validator/src', 'calculogic-validator/naming/src', 'tree/src'].map((recordPath) => records.get(recordPath));
  assert.equal(srcRecords.every((record) => record.actualName === 'src'), true);
  assert.equal(new Set(srcRecords.map((record) => record.occurrenceMarker)).size, 3);
  assert.equal(new Set(srcRecords.map((record) => record.lineageSegments.join('/'))).size, 3);
});

test('lineage, depth and parent paths are deterministic below an include root', () => {
  const records = byPath(project({ selectedPaths: ['tree/src/registries/tree-structural-homes-registry.logic.mjs'], includeRoots: ['tree'] }));
  assert.deepEqual(records.get('tree/src').lineageSegments, ['tree', 'src']);
  assert.equal(records.get('tree/src').depth, 1);
  assert.equal(records.get('tree/src/registries/tree-structural-homes-registry.logic.mjs').parentResolvedPath, 'tree/src/registries');
});

test('folder and file markers follow the address grammar: letters for folders, numbers for files', () => {
  const records = byPath(project({
    selectedPaths: ['root/folder-a/file-a-1.txt', 'root/folder-a/file-a-2.txt', 'root/folder-b/sub-a/file-b-1.txt', 'root/folder-b/sub-b/file-b-2.txt', 'root/folder-b/sub-b/file-b-3.txt'],
    includeRoots: ['root'],
  }));
  assert.deepEqual(
    [...records.values()].map((record) => [record.resolvedPath, record.occurrenceType, record.occurrenceMarker]),
    [
      ['root', 'folder', 'A'],
      ['root/folder-a', 'folder', 'A.A'],
      ['root/folder-a/file-a-1.txt', 'file', 'A.A.1'],
      ['root/folder-a/file-a-2.txt', 'file', 'A.A.2'],
      ['root/folder-b', 'folder', 'A.B'],
      ['root/folder-b/sub-a', 'folder', 'A.B.A'],
      ['root/folder-b/sub-a/file-b-1.txt', 'file', 'A.B.A.1'],
      ['root/folder-b/sub-b', 'folder', 'A.B.B'],
      ['root/folder-b/sub-b/file-b-2.txt', 'file', 'A.B.B.1'],
      ['root/folder-b/sub-b/file-b-3.txt', 'file', 'A.B.B.2'],
    ],
  );
  assert.deepEqual(records.get('root/folder-b/sub-b/file-b-3.txt').markerSegments, ['A', 'B', 'B', '2']);
});

test('a directory target is the scoped root, and lineage rebases from it', () => {
  const records = byPath(project({ selectedPaths: ['tree/src/tree-structure-advisor.logic.mjs'], includeRoots: ['tree'], targets: [{ relPath: 'tree', kind: 'dir' }] }));
  const scopedRoot = records.get('tree');
  assert.deepEqual(
    [scopedRoot.isScopedRoot, scopedRoot.isScopeTopOccurrence, scopedRoot.depth, scopedRoot.lineageSegments],
    [true, true, 0, ['tree']],
  );
  assert.deepEqual([records.get('tree/src').scopeRootPath, records.get('tree/src').lineageSegments, records.get('tree/src').depth], ['tree', ['tree', 'src'], 1]);
});

test('a nested file target rebases from its containing folder and avoids file-root lineage', () => {
  const snapshot = project({
    selectedPaths: ['tree/src/tree-structure-advisor.logic.mjs'],
    includeRoots: ['calculogic-validator'],
    targets: [{ relPath: 'tree/src/tree-structure-advisor.logic.mjs', kind: 'file' }],
  });
  const fileRecord = byPath(snapshot).get('tree/src/tree-structure-advisor.logic.mjs');
  assert.deepEqual(snapshot.scopeRoots, ['tree/src']);
  assert.deepEqual([fileRecord.scopeRootPath, fileRecord.isScopedRoot, fileRecord.lineageSegments], ['tree/src', false, ['tree/src', 'tree-structure-advisor.logic.mjs']]);
});

test('records carry no Tree policy or report fields', () => {
  const [record] = project({ selectedPaths: ['src/a.mjs'], includeRoots: ['src'] }).occurrenceRecords;
  for (const policyField of ['code', 'severity', 'placementConfidence', 'folderKind', 'structuralHome', 'semanticHome']) {
    assert.equal(Object.hasOwn(record, policyField), false, policyField);
  }
});
