// Tree registry migration transforms (lifecycle spec §8.3; Tree spec Stage 2 S2.10 RR6).
// Each transform is a pure function from a payload at its step's `from` version to one at its `to`
// version, named by a step of the Tree registry inventory. It reads no file and never sees Builtin:
// a value it adds comes from its own constants, never from the current Builtin registry.

// The S2.10 selected values, with the rationale and catalogue cases recorded for each. The version-2
// Builtin `semanticHomeParameters` hold the same records; a test keeps the two equal (RR6).
const SEMANTIC_HOME_PARAMETERS_V2 = Object.freeze([
  {
    parameterId: 'coverage',
    value: 0.5,
    rationale:
      "At least half of a candidate's decision members must have usable comparison evidence. Placed between structural-addressing (0.45, intended undetermined) and naming (0.61, intended to pass) by intended outcomes, not by a repository optimum (Tree spec Stage 2 S2.10; calculogic-validator#102 D4, D7).",
    catalogueCases: ['C3', 'C18', 'C19'],
  },
  {
    parameterId: 'minimum-support',
    value: 2,
    rationale:
      'Two distinct supporting occurrences make the smallest observable grouping; one matching file is a relationship, not yet a grouping. Synthetic evidence only: no repository candidate has one to three matches (Tree spec Stage 2 S2.10; calculogic-validator#102 D5, D7).',
    catalogueCases: ['C17', 'C20'],
  },
  {
    parameterId: 'not-eligible-share',
    value: 0.25,
    rationale:
      'Symmetric with eligible-share, leaving an explicitly undecided middle band; also the significance bar for the alternative root reading of a compound label. Synthetic evidence only (Tree spec Stage 2 S2.3, S2.10; calculogic-validator#102 D1, D6, D7).',
    catalogueCases: ['C21', 'C22', 'C23', 'C25'],
  },
  {
    parameterId: 'eligible-share',
    value: 0.75,
    rationale:
      'Symmetric support-share band (not-eligible-share = 1 - eligible-share) with an undecided middle. Symmetry is a policy choice, not a mathematical necessity; the full catalogue supports it (Tree spec Stage 2 S2.10; calculogic-validator#102 D6, D7).',
    catalogueCases: ['C4', 'C6', 'C10', 'C24'],
  },
]);

// Version "1" → "2": keeps the descriptive lanes as they are, including a consumer's edits, and adds
// the parameter section.
const migrateSemanticHomePolicyV1ToV2 = (payload) => ({
  version: '2',
  semanticHomePolicy: payload.semanticHomePolicy,
  semanticHomeParameters: SEMANTIC_HOME_PARAMETERS_V2.map((record) => ({
    ...record,
    catalogueCases: [...record.catalogueCases],
  })),
});

export const TREE_REGISTRY_MIGRATION_TRANSFORMS = Object.freeze({
  'semantic-home-policy-v1-to-v2': migrateSemanticHomePolicyV1ToV2,
});
