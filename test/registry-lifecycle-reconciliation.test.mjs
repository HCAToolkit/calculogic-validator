import test from 'node:test';
import assert from 'node:assert/strict';
import { REGISTRY_LIFECYCLE_SLICES } from '../src/core/registry-lifecycle/registry-lifecycle-inventory.knowledge.mjs';
import { walkComparisonEntries } from '../src/core/registry-lifecycle/registry-lifecycle-comparison.logic.mjs';
import {
  assertReconciliationDeclaration,
  checkStructuredDecision,
  entryChoices,
} from '../src/core/registry-lifecycle/registry-lifecycle-reconciliation.logic.mjs';

const inventory = REGISTRY_LIFECYCLE_SLICES.flatMap((slice) => slice.inventory);

test('every inventory declares reconciliation capabilities exactly as the audit records them', () => {
  for (const entry of inventory) {
    assertReconciliationDeclaration(entry);
  }
  const declared = inventory.flatMap((entry) =>
    entry.reconciliation.map((declaration) => [
      `${entry.registryId} ${declaration.path}`,
      declaration.mergeFields ?? null,
      declaration.addAlongside ?? false,
    ]),
  );
  // doc/Audits/registry-reconciliation-capabilities.audit.md §3–§6.
  assert.deepEqual(declared, [
    ['naming/agnostic-core-meanings meanings', [['status'], ['definition']], false],
    ['naming/categories categories', [['status'], ['definition']], false],
    ['naming/finding-policy outcomes.*', [['classification', 'code', 'severity'], ['message'], ['ruleRef'], ['suggestedFix']], false],
    [
      'naming/folder-composition-patterns folderCompositionPatterns',
      [
        ['status'],
        ['definition'],
        ['compositionKind', 'confidence', 'folderName', 'qualification', 'semanticQualifier', 'structuralRoleToken', 'tokenOrder'],
      ],
      false,
    ],
    [
      'naming/folder-composition-patterns folderSemanticContextPatterns',
      [['status'], ['definition'], ['confidence', 'folderName', 'qualification', 'semanticContext']],
      false,
    ],
    ['naming/roles roles', [['status'], ['definition'], ['notes']], false],
    ['tree/folder-kinds folderKinds', [['status'], ['definition']], false],
    ['tree/semantic-home-policy semanticHomePolicy', [['status'], ['definition'], ['derivationMeaning', 'guardrails', 'inputLane']], false],
    [
      'tree/semantic-naming-folder-type-relationships semanticNamingFolderTypeRelationships',
      [['status'], ['definition'], ['namingPerspective', 'repoShapeCondition', 'structuralHomeCondition', 'treeFolderType']],
      false,
    ],
    ['tree/structural-home-signal-policy structuralHomeSignalPolicy', [['status'], ['definition'], ['notes'], ['evidenceMeaning', 'signalCategory']], false],
    ['tree/structural-homes structuralHomes', [['status'], ['definition']], false],
    ['tree/structural-role-tokens structuralRoleTokens', [['status'], ['definition'], ['relationshipPerspective', 'structuralRole']], false],
    ['tree/surface-structural-home-perspective structuralHomesBySurface.*', [['rationale'], ['relationshipStatus', 'signalStrength']], false],
    ['suite/scope-profiles profiles.*', [['includeRoots'], ['includeRootFiles']], false],
  ]);
  assert.ok(Object.isFrozen(inventory.find((entry) => entry.registryId === 'naming/roles').reconciliation[0].mergeFields[0]));
});

test('a declaration that does not fit the comparison declaration is a programming error', () => {
  const entry = {
    registryId: 'test/shapes',
    comparison: [
      { kind: 'keyed', path: 'records', key: 'id' },
      { kind: 'keyed', path: 'ordered', key: 'id', ordered: true },
      { kind: 'members', path: 'tags' },
      { kind: 'value', path: 'settings.*' },
    ],
  };
  const declare = (...reconciliation) => () => assertReconciliationDeclaration({ ...entry, reconciliation });

  assert.doesNotThrow(declare({ path: 'records', mergeFields: [['a'], ['b', 'c']], addAlongside: true }, { path: 'settings.*', mergeFields: [['x'], ['y']] }));
  assert.doesNotThrow(declare({ path: 'ordered', mergeFields: [['a'], ['b']] }));
  for (const [label, declaration, pattern] of [
    ['an unknown collection', { path: 'nope', mergeFields: [['a'], ['b']] }, /names no comparison collection/u],
    ['nothing declared', { path: 'records' }, /must declare mergeFields or addAlongside/u],
    ['an unknown field', { path: 'records', mergeFields: [['a'], ['b']], mergeAll: true }, /and nothing else/u],
    ['merge on members', { path: 'tags', mergeFields: [['a'], ['b']] }, /on a keyed or value collection/u],
    ['one group only', { path: 'records', mergeFields: [['a', 'b']] }, /at least two/u],
    ['an empty group', { path: 'records', mergeFields: [['a'], []] }, /non-empty groups/u],
    ['a field in two groups', { path: 'records', mergeFields: [['a'], ['a', 'b']] }, /disjoint/u],
    ['the key field in a group', { path: 'records', mergeFields: [['id'], ['b']] }, /without the key field/u],
    ['alongside on an ordered collection', { path: 'ordered', addAlongside: true }, /unordered keyed collection/u],
    ['alongside on a value collection', { path: 'settings.*', addAlongside: true }, /unordered keyed collection/u],
    ['alongside on members', { path: 'tags', addAlongside: true }, /unordered keyed collection/u],
    ['alongside not true', { path: 'records', addAlongside: false }, /addAlongside is true/u],
  ]) {
    assert.throws(declare(declaration), pattern, label);
  }
  assert.throws(declare({ path: 'records', addAlongside: true }, { path: 'records', mergeFields: [['a'], ['b']] }), /more than once/u);
  assert.throws(() => assertReconciliationDeclaration({ ...entry, reconciliation: {} }), /must be a list/u);
});

// One synthetic registry: a merge- and alongside-declaring keyed collection, an undeclared one, and
// a merge-declaring value map.
const ENTRY = Object.freeze({
  registryId: 'test/registry',
  descriptor: {},
  comparison: [
    { kind: 'keyed', path: 'records', key: 'id' },
    { kind: 'keyed', path: 'plain', key: 'id' },
    { kind: 'value', path: 'settings.*' },
    { kind: 'members', path: 'tags' },
  ],
  reconciliation: [
    { path: 'records', mergeFields: [['label'], ['match', 'target']], addAlongside: true },
    { path: 'settings.*', mergeFields: [['x'], ['y']] },
  ],
});
const siteOf = (payload, address) => walkComparisonEntries(payload, ENTRY).find((walked) => walked.address === address).site;
const PAYLOAD = Object.freeze({
  version: '1',
  records: [{ id: 'r1', label: 'L', match: 'm', target: 't' }],
  plain: [{ id: 'p1', label: 'L', other: 'o' }],
  settings: { s: { x: 1, y: 2 } },
  tags: ['a'],
});

test('entryChoices lists the class decisions, plus each structured decision the entry can take', () => {
  const recordSite = siteOf(PAYLOAD, 'records[id="r1"]');
  const both = { entry: ENTRY, entryClass: 'both-changed', site: recordSite };
  assert.deepEqual(entryChoices({ ...both, builtin: { id: 'r1', label: 'B', match: 'mb', target: 't' }, custom: PAYLOAD.records[0] }), [
    'keep-custom',
    'take-builtin',
    { kind: 'merge-fields', fieldGroups: [['label'], ['match', 'target']] },
    { kind: 'add-alongside' },
  ]);
  // One differing group: a merge would equal take-builtin.
  assert.deepEqual(
    entryChoices({ ...both, builtin: { ...PAYLOAD.records[0], label: 'B' }, custom: PAYLOAD.records[0] }),
    ['keep-custom', 'take-builtin', { kind: 'add-alongside' }],
  );
  assert.deepEqual(entryChoices({ ...both, entryClass: 'builtin-added', builtin: PAYLOAD.records[0] }), ['keep-custom', 'take-builtin']);
  assert.deepEqual(
    entryChoices({
      entry: ENTRY,
      entryClass: 'builtin-changed',
      site: siteOf(PAYLOAD, 'plain[id="p1"]'),
      builtin: { id: 'p1', label: 'B', other: 'x' },
      custom: PAYLOAD.plain[0],
    }),
    ['keep-custom', 'take-builtin'],
    'an undeclared collection',
  );
  assert.deepEqual(
    entryChoices({ entry: ENTRY, entryClass: 'both-changed', site: siteOf(PAYLOAD, 'settings["s"]'), builtin: { x: 9, y: 9 }, custom: { x: 1, y: 2 } }),
    ['keep-custom', 'take-builtin', { kind: 'merge-fields', fieldGroups: [['x'], ['y']] }],
    'an object value merges but never gains a second form',
  );
  assert.deepEqual(
    entryChoices({ entry: ENTRY, entryClass: 'both-changed', site: siteOf(PAYLOAD, 'settings["s"]'), builtin: 3, custom: { x: 1, y: 2 } }),
    ['keep-custom', 'take-builtin'],
    'a value that is not an object on both sides',
  );
});

test('checkStructuredDecision: a value entry merges, never gains a second form, and needs objects on both sides', () => {
  const site = siteOf(PAYLOAD, 'settings["s"]');
  const check = (decision, builtin = { x: 9, y: 9 }) =>
    checkStructuredDecision({
      entry: ENTRY,
      entryClass: 'both-changed',
      site,
      builtin,
      custom: { x: 1, y: 2 },
      decision,
      keysInCollection: new Set(),
      alongsideKeys: new Map(),
    });
  assert.equal(check({ kind: 'merge-fields', takeBuiltin: ['x'] }), null);
  assert.equal(check({ kind: 'add-alongside', key: 'k' }).problem, 'unsupported-decision');
  assert.deepEqual(check({ kind: 'merge-fields', takeBuiltin: ['x'] }, 3), {
    problem: 'invalid-decision',
    detail: 'The merge-fields decision does not fit the entry: both the Builtin and the Custom form must be objects.',
  });
  // A field absent from one side still belongs to its group, and a group can differ by absence.
  assert.equal(check({ kind: 'merge-fields', takeBuiltin: ['y'] }, { x: 9 }), null);
});
