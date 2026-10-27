import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NAMING_BRIDGE_DOMAIN_RESOLVER } from '../src/registries/naming-registry-bridge-domains.logic.mjs';
import { projectNamingFolderCompositionBridge } from '../src/naming-folder-composition-projection.logic.mjs';

// Naming's emitted domain for the structural-role-token bridge (lifecycle spec §9.4) is exactly the set
// of tokens the folder-composition projection emits, for any pattern set: it shares the projection's
// selection, so a reported domain is the domain that runs.
const BRIDGE_ID = 'naming/folder-composition-structural-role-token';
const PERSPECTIVE = 'semantic-qualified-structural-container';

const pattern = (patternId, folderName, structuralRoleToken, overrides = {}) => ({
  patternId,
  status: 'active',
  compositionKind: PERSPECTIVE,
  semanticQualifier: 'tree',
  structuralRoleToken,
  tokenOrder: ['semantic-qualifier', 'structural-role-token'],
  folderName,
  ...overrides,
});

const PATTERN_SETS = {
  builtinLike: [pattern('src.v1', 'naming-src', 'src')],
  mixed: [
    pattern('lib', 'tree-lib', 'lib'),
    pattern('deprecated', 'tree-old', 'old', { status: 'deprecated' }),
    pattern('other-kind', 'tree-kind', 'kind', { compositionKind: 'another-kind' }),
    pattern('no-qualifier', 'tree-nq', 'nq', { semanticQualifier: '' }),
    pattern('no-token', 'tree-nt', ''),
    pattern('no-folder', '', 'nf'),
  ],
  // A later pattern for the same folder name never emits: the projection keeps the first one, even when
  // that one cannot emit.
  shadowed: [
    pattern('first', 'tree-x', 'first'),
    pattern('second', 'tree-x', 'second'),
    pattern('blank-first', 'tree-y', ''),
    pattern('blank-second', 'tree-y', 'hidden'),
  ],
  sharedValue: [pattern('a', 'tree-a', 'lib'), pattern('b', 'tree-b', 'lib')],
  empty: [],
};

const projectedTokens = (patterns) => {
  const folderNames = [...new Set(patterns.map((candidate) => candidate.folderName).filter(Boolean))];
  const { observations } = projectNamingFolderCompositionBridge({
    folderOccurrenceRecords: folderNames.map((name) => ({ path: name, name, occurrenceType: 'folder' })),
    folderCompositionPatternsRegistry: { folderCompositionPatterns: patterns },
  });
  return new Set(
    observations
      .filter((observation) => observation.semanticEvidenceKind === 'folder-semantic-structural-composition')
      .map((observation) => observation.structuralRoleToken),
  );
};

const resolve = (patterns, perspective = PERSPECTIVE) =>
  NAMING_BRIDGE_DOMAIN_RESOLVER.resolveEmitted({
    bridgeId: BRIDGE_ID,
    perspective,
    registryId: 'naming/folder-composition-patterns',
    payload: { version: '1', folderCompositionPatterns: patterns, folderSemanticContextPatterns: [] },
  });

test('the emitted domain equals the tokens the projection emits, for every pattern set', () => {
  for (const [label, patterns] of Object.entries(PATTERN_SETS)) {
    assert.deepEqual(new Set(resolve(patterns).map((item) => item.value)), projectedTokens(patterns), label);
  }
  assert.deepEqual(resolve(PATTERN_SETS.mixed).map((item) => item.value), ['lib']);
  assert.deepEqual(resolve(PATTERN_SETS.shadowed).map((item) => item.value), ['first']);
});

test('each emitted value names the pattern that emits it, and a value emitted twice is named twice', () => {
  assert.deepEqual(resolve(PATTERN_SETS.sharedValue), [
    { value: 'lib', source: { collection: 'folderCompositionPatterns', groups: [], key: 'a' } },
    { value: 'lib', source: { collection: 'folderCompositionPatterns', groups: [], key: 'b' } },
  ]);
});

test('an unknown bridge or perspective is a programming error', () => {
  assert.throws(() => resolve(PATTERN_SETS.builtinLike, 'another-perspective'), /no structural-role tokens for perspective "another-perspective"/u);
  assert.throws(
    () => NAMING_BRIDGE_DOMAIN_RESOLVER.resolveEmitted({ bridgeId: 'naming/none', perspective: PERSPECTIVE, payload: {} }),
    /no emitted domain for bridge "naming\/none"/u,
  );
});
