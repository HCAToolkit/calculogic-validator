import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TREE_BRIDGE_DOMAIN_RESOLVER } from '../src/registries/tree-registry-bridge-domains.logic.mjs';
import { prepareTreeSemanticNamingFolderTypeRelationshipEvidence } from '../src/tree-semantic-naming-folder-type-relationship.logic.mjs';

// Tree's interpretable domain for the structural-role-token bridge (lifecycle spec §9.4) is exactly the
// set of tokens the semantic-naming folder-type relationship resolves, for any token registry: it
// shares the relationship's selection, so a reported domain is the domain that runs.
const BRIDGE_ID = 'naming/folder-composition-structural-role-token';
const PERSPECTIVE = 'semantic-qualified-structural-container';
const NOT_REGISTERED = 'structural-token-not-registered-for-this-perspective';
const TOKEN_POOL = ['src', 'lib', 'old', 'other', 'norole', 'dup'];

const token = (value, overrides = {}) => ({
  token: value,
  status: 'active',
  structuralRole: 'implementation-container',
  relationshipPerspective: PERSPECTIVE,
  definition: 'A token.',
  ...overrides,
});

const REGISTRIES = {
  builtinLike: [token('src')],
  mixed: [
    token('src'),
    token('old', { status: 'deprecated' }),
    token('other', { relationshipPerspective: 'another-perspective' }),
    token('norole', { structuralRole: '' }),
  ],
  // The first entry per token decides, as in the relationship lookup.
  duplicate: [token('dup', { status: 'deprecated' }), token('dup')],
  empty: [],
};

// Interprets one Naming composition observation per pooled token and reports which tokens the
// relationship resolved (any interpretation but "not registered").
const interpretedTokens = (structuralRoleTokens) => {
  const addressedOccurrenceRecords = TOKEN_POOL.map((value, index) => ({
    addressPath: `A${index}`,
    parentAddressPath: null,
    path: `tree-${value}`,
    name: `tree-${value}`,
    occurrenceType: 'folder',
  }));
  const namingSemanticEvidenceRecords = TOKEN_POOL.map((value) => ({
    path: `tree-${value}`,
    occurrenceType: 'folder',
    semanticEvidenceKind: 'folder-semantic-structural-composition',
    folderCompositionKind: PERSPECTIVE,
    semanticQualifier: 'tree',
    structuralRoleToken: value,
  }));
  const { relationshipRecords } = prepareTreeSemanticNamingFolderTypeRelationshipEvidence({
    addressedOccurrenceRecords,
    namingSemanticEvidenceRecords,
    treeStructuralHomeEvidence: { evidenceRecords: [] },
    treeRepoShapePolicy: { allowedTopLevelDirectories: [] },
    relationshipsRegistry: { semanticNamingFolderTypeRelationships: [] },
    structuralRoleTokensRegistry: { structuralRoleTokens },
  });
  assert.equal(relationshipRecords.length, TOKEN_POOL.length);
  return new Set(
    relationshipRecords.filter((record) => record.relationshipInterpretation !== NOT_REGISTERED).map((record) => record.structuralRoleToken),
  );
};

const resolve = (structuralRoleTokens, perspective = PERSPECTIVE) =>
  TREE_BRIDGE_DOMAIN_RESOLVER.resolveInterpretable({
    bridgeId: BRIDGE_ID,
    perspective,
    registryId: 'tree/structural-role-tokens',
    payload: { version: '1', structuralRoleTokens },
  });

test('the interpretable domain equals the tokens the relationship resolves, for every token registry', () => {
  for (const [label, structuralRoleTokens] of Object.entries(REGISTRIES)) {
    assert.deepEqual(new Set(resolve(structuralRoleTokens).map((item) => item.value)), interpretedTokens(structuralRoleTokens), label);
  }
  assert.deepEqual(resolve(REGISTRIES.mixed), [{ value: 'src' }]);
  assert.deepEqual(resolve(REGISTRIES.duplicate), [{ value: 'dup' }]);
});

test('the perspective selects the entries, as the declaration names it', () => {
  assert.deepEqual(resolve(REGISTRIES.mixed, 'another-perspective'), [{ value: 'other' }]);
});

test('an unknown bridge is a programming error', () => {
  assert.throws(
    () => TREE_BRIDGE_DOMAIN_RESOLVER.resolveInterpretable({ bridgeId: 'naming/none', perspective: PERSPECTIVE, payload: {} }),
    /no interpretable domain for bridge "naming\/none"/u,
  );
});
