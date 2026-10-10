export const NAMING_VALIDATOR_CONTRACTS_VERSION = '0.1.6';

// Decision outcomes the Naming runtime emits; the finding-policy registry must map each one.
export const NAMING_DECISION_OUTCOME_IDS = Object.freeze({
  ALLOWED_SPECIAL_CASE: 'allowed-special-case',
  DEPRECATED_ROLE: 'deprecated-role',
  UNKNOWN_ROLE: 'unknown-role',
  BAD_SEMANTIC_CASE: 'bad-semantic-case',
  CANONICAL: 'canonical',
  ROLE_HYPHEN_AMBIGUITY: 'role-hyphen-ambiguity',
  MISSING_ROLE: 'missing-role',
  LEGACY_EXCEPTION: 'legacy-exception',
});

// Finding severities of the suite report schema (ValidatorReportSchema-V0_1 §7).
export const NAMING_FINDING_SEVERITIES = Object.freeze(['info', 'warn']);

// Semantic-name styles the case-rules runtime can compile.
// Secondary summary families a summary-buckets registry can enable. The family-evidence counts
// (familyRootCounts, familySubgroupCounts, semanticFamilyCounts) are always reported.
export const NAMING_CONFIGURABLE_SECONDARY_BUCKET_FAMILIES = Object.freeze({
  CODE_COUNTS: 'codeCounts',
  SPECIAL_CASE_TYPE_COUNTS: 'specialCaseTypeCounts',
  WARNING_ROLE_STATUS_COUNTS: 'warningRoleStatusCounts',
  WARNING_ROLE_CATEGORY_COUNTS: 'warningRoleCategoryCounts',
});

// Folder-composition kinds the folder-composition projection interprets.
export const NAMING_FOLDER_COMPOSITION_KINDS = Object.freeze({
  SEMANTIC_QUALIFIED_STRUCTURAL_CONTAINER: 'semantic-qualified-structural-container',
});

export const NAMING_SUPPORTED_SEMANTIC_NAME_STYLES = Object.freeze(['kebab-case']);

// Stable finding classifications (NamingValidatorSpec "Classification Outputs").
export const NAMING_FINDING_CLASSIFICATIONS = Object.freeze([
  'canonical',
  'allowed-special-case',
  'legacy-exception',
  'invalid-ambiguous',
]);
