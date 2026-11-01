/**
 * Configuration: cfg-namingValidator
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-namingValidator.md (§2.12)
 * Responsibility: Projects the `namingTokenLexicalIdentities` bridge section (bridge contract §4.7,
 *   §6.4; Linguistic Foundation shared contract §8.5; calculogic-validator#150) from the tokens Naming
 *   already supplies in the §4.5 semantic-evidence and §4.6 folder-label sections.
 * Invariants: the only lexical operation is `resolveSurfaceForm` on each token exactly as supplied;
 *   Naming applies no lexical rule, chooses no reading and owns no lexeme identity; no active profile
 *   or no eligible record omits the section; records sort by identity tuple.
 */
import { resolveSurfaceForm } from '../../linguistic-foundation/src/linguistic-foundation-resolution.logic.mjs';

export const TOKEN_LEXICAL_IDENTITY_SECTION_VERSION = 'naming-token-lexical-identity.v1';
const PRODUCER_ID = 'naming-token-lexical-identity';
const SOURCE = 'calculogic-validator/naming';
const IDENTITY_TUPLE_FIELDS = ['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress'];

// [2.12] cfg-namingValidator · Primitive · "compareIdentityTuples"
// Concern: Logic · Parent: "projectNamingTokenLexicalIdentities"
// Notes: deterministic record order by the bridge identity tuple.
const compareIdentityTuples = (left, right) =>
  left.addressProfileId.localeCompare(right.addressProfileId) ||
  left.addressedSnapshotId.localeCompare(right.addressedSnapshotId) ||
  left.occurrenceAddress.localeCompare(right.occurrenceAddress);

// [2.12] cfg-namingValidator · Primitive · "toEntry"
// Concern: Logic · Parent: "projectNamingTokenLexicalIdentities"
// Notes: one token entry, exactly the foundation's resolution of the supplied surface.
const toEntry = (lexicalProfile, surface) => {
  const { status, readings } = resolveSurfaceForm(lexicalProfile, surface);
  return {
    surface,
    status,
    readings: readings.map(({ lexemeId, features, basis }) => ({ lexemeId, features: { ...features }, basis })),
  };
};

// [2.12] cfg-namingValidator · Primitive · "toRecord"
// Concern: Logic · Parent: "projectNamingTokenLexicalIdentities"
// Notes: one record per eligible source record, aligned token by token.
const toRecord = (lexicalProfile, sourceRecord, tokenSource, tokens) => ({
  ...Object.fromEntries(IDENTITY_TUPLE_FIELDS.map((field) => [field, sourceRecord[field]])),
  ...(sourceRecord.repoRelativePath !== undefined ? { repoRelativePath: sourceRecord.repoRelativePath } : {}),
  tokenSource,
  tokens: tokens.map((surface) => toEntry(lexicalProfile, surface)),
});

// [2.12] cfg-namingValidator · Container · "projectNamingTokenLexicalIdentities"
// Concern: Logic · Parent: "createNamingOccurrenceBridgePayload"
// Notes: `semanticEvidenceEnrichmentSection` and `folderLabelObservationSection` are the sections the bridge
// payload producer has just built (either may be null); `lexicalProfile` is the run's active runtime
// profile, or null. Returns the section, or null when it is omitted (§4.7 producer rules).
export const projectNamingTokenLexicalIdentities = ({ semanticEvidenceEnrichmentSection, folderLabelObservationSection, lexicalProfile } = {}) => {
  if (!lexicalProfile) return null;
  const fileRecords = (semanticEvidenceEnrichmentSection?.records ?? [])
    .filter((record) => Array.isArray(record.semanticTokens) && record.semanticTokens.length > 0)
    .map((record) => toRecord(lexicalProfile, record, 'semantic-tokens', record.semanticTokens));
  const folderRecords = (folderLabelObservationSection?.records ?? [])
    .filter((record) => record.parseOutcome === 'parsed' && Array.isArray(record.labelTokens) && record.labelTokens.length > 0)
    .map((record) => toRecord(lexicalProfile, record, 'label-tokens', record.labelTokens));
  const records = [...fileRecords, ...folderRecords].sort(compareIdentityTuples);
  if (records.length === 0) return null;
  return {
    contractVersion: TOKEN_LEXICAL_IDENTITY_SECTION_VERSION,
    producerId: PRODUCER_ID,
    source: SOURCE,
    identityTupleFields: [...IDENTITY_TUPLE_FIELDS],
    lexicalProfile: {
      profileId: lexicalProfile.profileId,
      profileVersion: lexicalProfile.profileVersion,
      lexiconDigest: lexicalProfile.lexiconDigest,
    },
    recordCount: records.length,
    records,
  };
};
