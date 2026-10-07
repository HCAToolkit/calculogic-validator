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
