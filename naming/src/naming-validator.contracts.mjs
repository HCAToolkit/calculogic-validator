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
export const NAMING_SUPPORTED_SEMANTIC_NAME_STYLES = Object.freeze(['kebab-case']);
