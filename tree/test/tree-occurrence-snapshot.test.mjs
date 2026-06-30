import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareTreeOccurrenceSnapshot } from '../src/tree-occurrence-snapshot.logic.mjs';
import { prepareTreeStructureAdvisorInputs } from '../src/tree-structure-advisor.wiring.mjs';

const byResolvedPath = (occurrenceRecords) =>
  Object.fromEntries(occurrenceRecords.map((record) => [record.resolvedPath, record]));

test('tree occurrence snapshot disambiguates repeated names by lineage', () => {
  const snapshot = prepareTreeOccurrenceSnapshot({
    selectedPaths: [
      'src/core/runtime.mjs',
      'naming/src/naming.logic.mjs',
      'tree/src/tree.logic.mjs',
    ],
    targets: [],
    includeRoots: ['.'],
  });

  const recordsByPath = byResolvedPath(snapshot.occurrenceRecords);
  const srcRecords = ['src', 'naming/src', 'tree/src'].map(
    (resolvedPath) => recordsByPath[resolvedPath],
  );

  assert.equal(srcRecords.every((record) => record.actualName === 'src'), true);
  assert.equal(new Set(srcRecords.map((record) => record.occurrenceMarker)).size, 3);
  assert.equal(new Set(srcRecords.map((record) => record.lineageSegments.join('/'))).size, 3);
});

test('tree occurrence snapshot preserves deterministic lineage and depth', () => {
  const snapshot = prepareTreeOccurrenceSnapshot({
    selectedPaths: ['tree/src/registries/tree-structural-homes-registry.logic.mjs'],
    targets: [],
    includeRoots: ['.'],
  });

  const recordsByPath = byResolvedPath(snapshot.occurrenceRecords);

  assert.deepEqual(recordsByPath['tree/src'].lineageSegments, ['tree', 'src']);
  assert.equal(recordsByPath['tree/src'].depth, 1);
  assert.equal(
    recordsByPath['tree/src/registries/tree-structural-homes-registry.logic.mjs'].parentResolvedPath,
    'tree/src/registries',
  );
});

test('tree occurrence snapshot distinguishes folders and files from path structure with uppercase folder markers', () => {
  const snapshot = prepareTreeOccurrenceSnapshot({
    selectedPaths: ['tree/src/tree-structure-advisor.logic.mjs'],
    targets: [],
    includeRoots: ['.'],
  });

  const recordsByPath = byResolvedPath(snapshot.occurrenceRecords);

  assert.equal(recordsByPath['tree/src'].occurrenceType, 'folder');
  assert.equal(
    recordsByPath['tree/src/tree-structure-advisor.logic.mjs'].occurrenceType,
    'file',
  );
  assert.match(recordsByPath['tree/src'].occurrenceMarker, /^[A-Z]+(?:\.[A-Z0-9]+)*$/u);
  assert.match(
    recordsByPath['tree/src/tree-structure-advisor.logic.mjs'].occurrenceMarker,
    /^[A-Z]+(?:\.[A-Z0-9]+)*\.[0-9]+$/u,
  );
});

test('tree occurrence snapshot rebases scoped lineage from targeted subtree roots', () => {
  const snapshot = prepareTreeOccurrenceSnapshot({
    selectedPaths: ['tree/src/tree-structure-advisor.logic.mjs'],
    targets: [{ relPath: 'tree', kind: 'dir' }],
    includeRoots: ['.'],
  });

  const recordsByPath = byResolvedPath(snapshot.occurrenceRecords);
  const scopedRoot = recordsByPath['tree'];
  const nestedSrc = recordsByPath['tree/src'];

  assert.equal(scopedRoot.isScopedRoot, true);
  assert.equal(scopedRoot.isScopeTopOccurrence, true);
  assert.equal(scopedRoot.depth, 0);
  assert.deepEqual(scopedRoot.lineageSegments, ['tree']);
  assert.equal(nestedSrc.scopeRootPath, 'tree');
  assert.deepEqual(nestedSrc.lineageSegments, ['tree', 'src']);
  assert.equal(nestedSrc.depth, 1);
});

test('tree occurrence snapshot file targets rebase from containing folder and avoid file-root lineage', () => {
  const snapshot = prepareTreeOccurrenceSnapshot({
    selectedPaths: ['tree/src/tree-structure-advisor.logic.mjs'],
    targets: [{ relPath: 'tree/src/tree-structure-advisor.logic.mjs', kind: 'file' }],
    includeRoots: ['.'],
  });

  const recordsByPath = byResolvedPath(snapshot.occurrenceRecords);
  const fileRecord = recordsByPath['tree/src/tree-structure-advisor.logic.mjs'];

  assert.deepEqual(snapshot.scopeRoots, ['tree/src']);
  assert.equal(fileRecord.scopeRootPath, 'tree/src');
  assert.equal(fileRecord.isScopedRoot, false);
  assert.deepEqual(fileRecord.lineageSegments, ['tree/src', 'tree-structure-advisor.logic.mjs']);
});

test('tree structure advisor wiring attaches occurrence snapshot with resolved paths', () => {
  const prepared = prepareTreeStructureAdvisorInputs(process.cwd(), {
    scope: 'validator',
    targets: ['tree/src'],
  });

  assert.ok(prepared.occurrenceSnapshot);
  assert.equal(Array.isArray(prepared.occurrenceSnapshot.occurrenceRecords), true);
  assert.equal(
    prepared.occurrenceSnapshot.occurrenceRecords.every(
      (record) => typeof record.resolvedPath === 'string' && record.resolvedPath.length > 0,
    ),
    true,
  );
  assert.equal(prepared.selectedPaths.length > 0, true);
  assert.equal(prepared.targets.includes('tree/src'), true);
});
