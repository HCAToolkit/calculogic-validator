// Producer parity for #45 (PR 2): the Addressing-backed chain (validation input adapter →
// prepareTreeCodebaseAddressedSnapshot → Tree projection) against Tree's private producer
// (prepareTreeStructuralAddressSnapshot), fed identical inputs.
//
// The envelope must be identical everywhere. Records must be identical field for field, except in
// the gated correction classes (D1, D2, D4, and the empty collapsed root of D4), whose differences
// are enumerated exactly. `orderIndex` is new on every record (O2) and is not compared.
// Contracts: doc/ValidatorSpecs/structural-addressing-tree-codebase-validation-input.spec.md and
// doc/ValidatorSpecs/tree-owned/tree-structural-address-probe-contract.spec.md.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { prepareTreeStructuralAddressSnapshot } from '../tree/src/tree-structural-address-snapshot.logic.mjs';
import { prepareTreeAddressedOccurrenceSnapshot } from '../tree/src/tree-addressed-occurrence-snapshot.logic.mjs';
import { prepareTreeCodebaseValidationInput } from '../structural-addressing/src/structural-addressing-tree-codebase-validation-input.logic.mjs';
import { prepareTreeCodebaseAddressedSnapshot } from '../structural-addressing/src/structural-addressing-tree-codebase.logic.mjs';
import { collectSuiteScopedSnapshotInputs } from '../src/core/suite-scoped-snapshot-input.logic.mjs';

const VALIDATOR_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'tree-structure-advisor.wiring';

const preparePrivate = ({ selectedPaths, includeRoots = [], targets = [] }) =>
  prepareTreeStructuralAddressSnapshot({ selectedPaths, includeRoots, targets, scope: { source: SOURCE } });

const prepareAddressingBacked = ({ selectedPaths, includeRoots = [], targets = [] }) => {
  const adapted = prepareTreeCodebaseValidationInput({ selectedPaths, includeRoots, targets });
  return prepareTreeAddressedOccurrenceSnapshot({
    occurrenceRecords: prepareTreeCodebaseAddressedSnapshot(adapted.treeCodebaseInput).occurrenceRecords,
    declaredScopeRoots: adapted.declaredScopeRoots,
    targets,
    selectedPaths,
    source: SOURCE,
  });
};

// Differences keyed by path: `+` only in the Addressing-backed snapshot, `-` only in the private
// one, otherwise the sorted list of differing contract fields.
const diffSnapshots = (privateSnapshot, addressingSnapshot) => {
  const privateByPath = new Map(privateSnapshot.occurrenceRecords.map((record) => [record.resolvedPath, record]));
  const addressingByPath = new Map(addressingSnapshot.occurrenceRecords.map((record) => [record.resolvedPath, record]));
  const differences = {};
  for (const recordPath of [...new Set([...privateByPath.keys(), ...addressingByPath.keys()])].sort()) {
    if (!privateByPath.has(recordPath)) {
      differences[recordPath] = '+';
    } else if (!addressingByPath.has(recordPath)) {
      differences[recordPath] = '-';
    } else {
      const changed = Object.keys(privateByPath.get(recordPath))
        .filter((field) => JSON.stringify(privateByPath.get(recordPath)[field]) !== JSON.stringify(addressingByPath.get(recordPath)[field]))
        .sort();
      if (changed.length > 0) {
        differences[recordPath] = changed;
      }
    }
  }
  return differences;
};

const assertParity = (label, input, expectedDifferences) => {
  const privateSnapshot = preparePrivate(input);
  const addressingSnapshot = prepareAddressingBacked(input);
  assert.deepEqual(
    { scope: addressingSnapshot.scope, scopeRoots: addressingSnapshot.scopeRoots },
    { scope: privateSnapshot.scope, scopeRoots: privateSnapshot.scopeRoots },
    `${label}: envelope`,
  );
  assert.deepEqual(diffSnapshots(privateSnapshot, addressingSnapshot), expectedDifferences, `${label}: records`);
  // Shared records keep the private producer's path order.
  const shared = (records, otherPaths) => records.map((record) => record.resolvedPath).filter((recordPath) => otherPaths.has(recordPath));
  assert.deepEqual(
    shared(addressingSnapshot.occurrenceRecords, new Set(privateSnapshot.occurrenceRecords.map((record) => record.resolvedPath))),
    shared(privateSnapshot.occurrenceRecords, new Set(addressingSnapshot.occurrenceRecords.map((record) => record.resolvedPath))),
    `${label}: order`,
  );
};

const ADDRESS_FIELDS = ['addressPath', 'markerSegments', 'occurrenceMarker'];
const ADDRESS_AND_PARENT = ['addressPath', 'markerSegments', 'occurrenceMarker', 'parentAddressPath'];

test('parity: identical wherever no correction class applies', () => {
  const identical = [
    ['include roots', { selectedPaths: ['src/a.mjs', 'src/sub/b.mjs', 'test/t.mjs'], includeRoots: ['src', 'test'] }],
    ['whole repository', { selectedPaths: ['README.md', 'src/a.mjs', 'src/deep/b.mjs', 'tree/src/x.mjs'], includeRoots: ['.'] }],
    ['embedded root', { selectedPaths: ['calculogic-validator/README.md', 'calculogic-validator/src/a.mjs'], includeRoots: ['calculogic-validator'] }],
    ['system top-level-entry fallback', { selectedPaths: ['package.json', 'tsconfig.json'] }],
    ['repository-root file target', { selectedPaths: ['README.md'], targets: [{ relPath: 'README.md', kind: 'file' }] }],
    ['--scope=repo --target .', { selectedPaths: ['README.md', 'src/a.mjs'], includeRoots: ['.'], targets: [{ relPath: '.', kind: 'dir' }] }],
    ['excluded directory target', { selectedPaths: [], targets: [{ relPath: 'dist', kind: 'dir' }] }],
    ['more than 26 sibling folders', { selectedPaths: Array.from({ length: 30 }, (_, index) => `src/f${String(index).padStart(2, '0')}/a.mjs`), includeRoots: ['src'] }],
    ['case and punctuation variants', { selectedPaths: ['src/B.mjs', 'src/a.mjs', 'src/a-b.mjs', 'src/a_b.mjs', 'src/A/x.mjs'], includeRoots: ['src'] }],
  ];
  for (const [label, input] of identical) {
    assertParity(label, input, {});
  }
});

test('parity, D1: a root file outside every declared root corrects four contract fields', () => {
  const expected = { 'README.md': ['depth', 'isScopeTopOccurrence', 'lineageSegments', 'scopeRootPath'] };
  assertParity('docs scope', { selectedPaths: ['README.md', 'doc/g.md'], includeRoots: ['doc', 'docs'] }, expected);
  assertParity(
    '--scope=docs --target .',
    { selectedPaths: ['README.md', 'doc/g.md'], includeRoots: ['doc', 'docs'], targets: [{ relPath: '.', kind: 'dir' }] },
    expected,
  );
});

test('parity, D2: phantom ancestors disappear, and a folder scope root shifts only when a phantom sorted before it', () => {
  // `tree` sorts after `src`: the phantom goes, nothing else changes.
  assertParity('directory target, phantom after', { selectedPaths: ['tree/src/x.mjs'], targets: [{ relPath: 'tree/src', kind: 'dir' }] }, { tree: '-' });
  assertParity('nested file target, phantom after', { selectedPaths: ['tree/src/x.mjs'], targets: [{ relPath: 'tree/src/x.mjs', kind: 'file' }] }, { tree: '-' });
  assertParity('root file and directory targets', { selectedPaths: ['README.md', 'tree/src/x.mjs'], targets: ['README.md', 'tree/src'] }, { tree: '-' });
  // `tree` sorts before `zz`: the root and everything under it shift from B to A.
  assertParity('directory target, phantom before', { selectedPaths: ['tree/zz/x.mjs'], targets: [{ relPath: 'tree/zz', kind: 'dir' }] }, {
    tree: '-',
    'tree/zz': ADDRESS_FIELDS,
    'tree/zz/x.mjs': ADDRESS_AND_PARENT,
  });
  assertParity('nested file target, phantom before', { selectedPaths: ['tree/zz/index.mjs'], targets: [{ relPath: 'tree/zz/index.mjs', kind: 'file' }] }, {
    tree: '-',
    'tree/zz': ADDRESS_FIELDS,
    'tree/zz/index.mjs': ADDRESS_AND_PARENT,
  });
  assertParity('two targets', { selectedPaths: ['tree/src/x.mjs', 'naming/src/n.mjs'], targets: ['tree/src', 'naming/src'] }, {
    naming: '-',
    'naming/src': ADDRESS_FIELDS,
    'naming/src/n.mjs': ADDRESS_AND_PARENT,
    tree: '-',
    'tree/src': ADDRESS_FIELDS,
    'tree/src/x.mjs': ADDRESS_AND_PARENT,
  });
});

test('parity, D4: collapsed roots change only address, parent and depth; scope binding, lineage and both flags are preserved', () => {
  const innerRoot = [...ADDRESS_AND_PARENT, 'depth', 'parentResolvedPath'].sort();
  const underInner = [...ADDRESS_AND_PARENT, 'depth'].sort();
  assertParity('overlapping directory targets', { selectedPaths: ['tree/x.mjs', 'tree/src/y.mjs'], targets: ['tree', 'tree/src'] }, {
    tree: ADDRESS_FIELDS,
    'tree/src': innerRoot,
    'tree/src/y.mjs': underInner,
    'tree/x.mjs': ADDRESS_AND_PARENT,
  });
  assertParity('file targets with nesting containing folders', { selectedPaths: ['tree/a.mjs', 'tree/sub/b.mjs'], targets: ['tree/a.mjs', 'tree/sub/b.mjs'] }, {
    tree: ADDRESS_FIELDS,
    'tree/a.mjs': ADDRESS_AND_PARENT,
    'tree/sub': innerRoot,
    'tree/sub/b.mjs': underInner,
  });
  assertParity('empty collapsed root', { selectedPaths: ['tree/a.mjs'], targets: ['tree', 'tree/empty'] }, {
    tree: ADDRESS_FIELDS,
    'tree/a.mjs': ADDRESS_AND_PARENT,
    'tree/empty': innerRoot,
  });
  // Nesting tree/x/empty needs the intermediate tree/x, a new occurrence gated with D4.
  assertParity('deep empty collapsed root', { selectedPaths: ['tree/a.mjs'], targets: ['tree', 'tree/x/empty'] }, {
    tree: ADDRESS_FIELDS,
    'tree/a.mjs': ADDRESS_AND_PARENT,
    'tree/x': '+',
    'tree/x/empty': innerRoot,
  });
});

test('parity on this repository: every scope matches except the D1 root file of the docs scope', () => {
  const walkExcludedDirectories = new Set(['.git', '.next', '.reports', '.turbo', '.yarn', 'coverage', 'dist', 'node_modules']);
  for (const [scope, targets, expected] of [
    ['repo', undefined, {}],
    ['validator', undefined, {}],
    ['app', undefined, {}],
    ['system', undefined, {}],
    ['docs', undefined, { 'README.md': ['depth', 'isScopeTopOccurrence', 'lineageSegments', 'scopeRootPath'] }],
    ['validator', ['tree/src'], { tree: '-' }],
  ]) {
    const inputs = collectSuiteScopedSnapshotInputs(VALIDATOR_ROOT, {
      scope,
      targets,
      walkExcludedDirectories,
      skipDotDirectories: true,
      packageRoot: VALIDATOR_ROOT,
    });
    const input = {
      selectedPaths: inputs.selectedPaths,
      includeRoots: inputs.includeRoots,
      targets: inputs.targetDescriptors ?? inputs.targets ?? [],
    };
    assert.ok(input.selectedPaths.length > 0 || scope === 'system', `${scope}: expected selected paths`);
    assertParity(`${scope}${targets ? ` --target ${targets.join(',')}` : ''}`, input, expected);
  }
});
