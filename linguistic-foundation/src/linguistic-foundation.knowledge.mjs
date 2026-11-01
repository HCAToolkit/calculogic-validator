/**
 * Configuration: cfg-linguisticFoundation
 * Concern File: Knowledge
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-linguisticFoundation.md
 * Responsibility: The foundation's language-agnostic vocabularies (contract §4.1, §5.1, §5.3, §6.1,
 *   §6.2, §7; doc/ValidatorSpecs/linguistic-foundation-shared-contract.spec.md).
 * Invariants: no lexeme, form, entry or other language-specific content; closed lists only.
 */

// [6.1] cfg-linguisticFoundation · Knowledge · "foundation vocabularies"
export const LINGUISTIC_FEATURE_SPACES = Object.freeze({
  number: Object.freeze(['singular', 'plural']),
});

export const LINGUISTIC_SUPPORT_STATUSES = Object.freeze({
  supported: 'supported',
  unsupported: 'unsupported',
  notApplicable: 'not-applicable',
});

export const LEXICAL_RESOLUTION_STATUSES = Object.freeze({
  resolved: 'resolved',
  ambiguous: 'ambiguous',
  unknown: 'unknown',
  profileUnavailable: 'profile-unavailable',
});

export const LEXEME_COMPARISON_RELATIONS = Object.freeze({
  sameLexeme: 'same-lexeme',
  possiblySameLexeme: 'possibly-same-lexeme',
  differentLexemes: 'different-lexemes',
  undetermined: 'undetermined',
});

export const LEXICAL_READING_BASES = Object.freeze({ lexiconEntry: 'lexicon-entry' });

export const LANGUAGE_PROFILE_SELECTION_STATUSES = Object.freeze({
  none: 'none',
  active: 'active',
  invalid: 'invalid',
});

export const LANGUAGE_PROFILE_SELECTION_PROBLEMS = Object.freeze({
  selectionMalformed: 'selection-malformed',
  profileNotRegistered: 'profile-not-registered',
  profileVersionMismatch: 'profile-version-mismatch',
});

// Readable `version` values of a language profile registry file (contract §15.2).
export const LANGUAGE_PROFILE_REGISTRY_VERSIONS = Object.freeze(['1']);
