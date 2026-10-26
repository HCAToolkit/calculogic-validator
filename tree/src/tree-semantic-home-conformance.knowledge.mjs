// Tree Semantic Home conformance binding (Tree slice spec RR4, S2.11; calculogic-validator#102 K3, K6, K7).
// The one recorded binding of the four Builtin values to the catalogue identity and the reasoning
// implementation, the bound reasoning modules, and the append-only reasoning version history. Data
// only: `npm test` recomputes every digest here and fails until they match the current tree.

// K2: the bound reasoning modules, package-relative. A test checks that this list equals the local
// import closure of the Stage 2 coordinator and the Stage 1 preparers it consumes.
export const TREE_SEMANTIC_HOME_REASONING_MODULES = Object.freeze([
  'tree/src/tree-folder-candidates.logic.mjs',
  'tree/src/tree-folder-fact-evidence.logic.mjs',
  'tree/src/tree-folder-semantic-evidence.logic.mjs',
  'tree/src/tree-folder-semantic-home-reasoning.logic.mjs',
  'tree/src/tree-naming-section-intake.logic.mjs',
  'tree/src/tree-semantic-home-attribution.logic.mjs',
  'tree/src/tree-semantic-home-eligibility.logic.mjs',
  'tree/src/tree-semantic-home-placement.logic.mjs',
  'tree/src/tree-semantic-home-reasoning.knowledge.mjs',
  'tree/src/tree-semantic-home-strength-profile.logic.mjs',
]);

// K3: append-only. A new results digest needs a new version; a source change with unchanged results
// keeps the version. The last entry is the bound one.
export const TREE_SEMANTIC_HOME_REASONING_VERSIONS = Object.freeze([
  Object.freeze({ version: '1', resultsDigest: '0cef43a3072fc166a7e58a044ed7df643f70a151439eb865dddeb7c9cf2fe1f7' }),
]);

// K6, K7: only the four values are bound; rationale and provenance are not.
export const TREE_SEMANTIC_HOME_CONFORMANCE_BINDING = Object.freeze({
  values: Object.freeze({ P_COVERAGE: 0.5, P_MIN_SUPPORT: 2, P_NOT_ELIGIBLE_SHARE: 0.25, P_ELIGIBLE_SHARE: 0.75 }),
  catalogue: Object.freeze({ id: 'semantic-home-catalogue', version: '2', digest: '2cda09d270c0c8dc1f21bed4fceff90730124be45ea9b0f3c62fed05ca41ce19' }),
  reasoning: Object.freeze({
    version: '1',
    sourceDigest: 'c1c200ae70c400c35a372072f9474e23768dd5b7e38e9f52dcf93b45b33fc4d6',
    resultsDigest: '0cef43a3072fc166a7e58a044ed7df643f70a151439eb865dddeb7c9cf2fe1f7',
  }),
});
