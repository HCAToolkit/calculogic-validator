// Naming token lexical-identity projection (bridge contract §4.7, §6.4; Linguistic Foundation shared
// contract §8.5; calculogic-validator#150). Naming presents, for the tokens it already supplies in the
// §4.5 semantic-evidence enrichment section and the §4.6 folder-label section, the Linguistic
// Foundation's resolution of each token under the run's active profile. Its only lexical operation is
// `resolveSurfaceForm` on each token, exactly as supplied: Naming applies no lexical rule, chooses no
// reading and owns no lexeme identity.
import { resolveSurfaceForm } from '../../linguistic-foundation/src/linguistic-foundation-resolution.logic.mjs';

export const TOKEN_LEXICAL_IDENTITY_SECTION_VERSION = 'naming-token-lexical-identity.v1';
const PRODUCER_ID = 'naming-token-lexical-identity';
const SOURCE = 'calculogic-validator/naming';
const IDENTITY_TUPLE_FIELDS = ['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress'];

const compareIdentityTuples = (left, right) =>
  left.addressProfileId.localeCompare(right.addressProfileId) ||
  left.addressedSnapshotId.localeCompare(right.addressedSnapshotId) ||
  left.occurrenceAddress.localeCompare(right.occurrenceAddress);

const toEntry = (lexicalProfile, surface) => {
  const { status, readings } = resolveSurfaceForm(lexicalProfile, surface);
  return {
    surface,
    status,
    readings: readings.map(({ lexemeId, features, basis }) => ({ lexemeId, features: { ...features }, basis })),
  };
};

const toRecord = (lexicalProfile, sourceRecord, tokenSource, tokens) => ({
  ...Object.fromEntries(IDENTITY_TUPLE_FIELDS.map((field) => [field, sourceRecord[field]])),
  ...(sourceRecord.repoRelativePath !== undefined ? { repoRelativePath: sourceRecord.repoRelativePath } : {}),
  tokenSource,
  tokens: tokens.map((surface) => toEntry(lexicalProfile, surface)),
});

// `semanticEvidenceEnrichmentSection` and `folderLabelObservationSection` are the sections the bridge
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
