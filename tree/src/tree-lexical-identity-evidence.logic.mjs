/**
 * Configuration: cfg-treeStructureAdvisor
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-treeStructureAdvisor.md (§2.4, lexical-identity consumption)
 * Responsibility: Tree's one lexical-identity evidence module (Tree slice spec S1.1-S1.3; bridge contract
 *   §4.7; Linguistic Foundation shared contract §8.5, §9; calculogic-validator#153): the intake of the
 *   Naming `namingTokenLexicalIdentities` section into `treeLexicalIdentityIntake`, and the one Tree-facing
 *   relation between a lineage folder's label token and a member's token.
 * Invariants: the only foundation imports are `compareLexicalResolutions` and `isFoundationFeatureMap`;
 *   never resolves a form, loads a profile, builds a lexical record or transforms a token; outside
 *   `treeNamingSectionIntake` and every Stage 1/Stage 2 module; an absent section gives no record; record
 *   problems drop only their record, in the bridge §4.7 table order; diagnostics are lexical-only and
 *   never findings.
 */
import { compareLexicalResolutions, isFoundationFeatureMap } from '../../linguistic-foundation/src/linguistic-foundation-resolution.logic.mjs';

const SOURCE_ID = 'tree-lexical-identity-evidence';
const SECTION_KEY = 'namingTokenLexicalIdentities';
const SECTION_VERSION = 'naming-token-lexical-identity.v1';
const DIAGNOSTIC_SECTION = 'naming-token-lexical-identity';
const IDENTITY_TUPLE_FIELDS = Object.freeze(['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress']);
const TOKEN_SOURCES = Object.freeze({ semanticTokens: 'semantic-tokens', labelTokens: 'label-tokens' });
const ENTRY_STATUSES = Object.freeze(['resolved', 'ambiguous', 'unknown']);
const READING_BASIS = 'lexicon-entry';
const UNDETERMINED = 'undetermined';

export const TREE_LEXICAL_IDENTITY_AVAILABILITY = Object.freeze({
  available: 'available',
  sectionUnsupported: 'section-unsupported',
  sectionInvalid: 'section-invalid',
});
// Bridge contract §4.7 consumer identity rules, in table order.
export const TREE_LEXICAL_IDENTITY_REJECTION_REASONS = Object.freeze({
  invalidIdentity: 'invalid-identity',
  duplicateIdentity: 'duplicate-identity',
  namespaceMismatch: 'namespace-mismatch',
  invalidRecordShape: 'invalid-record-shape',
  unmatchedRecord: 'unmatched-record',
  tokenCountMismatch: 'token-count-mismatch',
  surfaceMismatch: 'surface-mismatch',
  statusReadingsDisagree: 'status-readings-disagree',
  lexemeOutsideProfile: 'lexeme-outside-profile',
});
const REASONS = TREE_LEXICAL_IDENTITY_REJECTION_REASONS;
const AVAILABILITY = TREE_LEXICAL_IDENTITY_AVAILABILITY;

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const toTupleKey = (record) => IDENTITY_TUPLE_FIELDS.map((field) => record[field]).join('\u0000');
const tupleOf = (record) => Object.fromEntries(IDENTITY_TUPLE_FIELDS.map((field) => [field, record[field]]));
const compareTupleKeys = (left, right) => toTupleKey(left).localeCompare(toTupleKey(right));

// [2.4] cfg-treeStructureAdvisor · Primitive · "hasRecordShape"
// Concern: Logic · Parent: "prepareTreeLexicalIdentityIntake"
// Notes: the §6.4 shape of one record (bridge §4.7 "invalid record shape"), checked before alignment.
const hasRecordShape = (record) =>
  Object.values(TOKEN_SOURCES).includes(record.tokenSource) &&
  Array.isArray(record.tokens) &&
  record.tokens.length > 0 &&
  record.tokens.every(
    (entry) =>
      isPlainObject(entry) &&
      isNonEmptyString(entry.surface) &&
      ENTRY_STATUSES.includes(entry.status) &&
      Array.isArray(entry.readings) &&
      entry.readings.every(
        (reading) => isPlainObject(reading) && isNonEmptyString(reading.lexemeId) && reading.basis === READING_BASIS && isFoundationFeatureMap(reading.features),
      ),
  );

// Foundation contract §6.1: the status its readings imply.
const statusOfReadings = (readings) => {
  if (readings.length === 0) return 'unknown';
  return new Set(readings.map((reading) => reading.lexemeId)).size === 1 ? 'resolved' : 'ambiguous';
};

// [2.4] cfg-treeStructureAdvisor · Primitive · "alignmentReasonOf"
// Concern: Logic · Parent: "prepareTreeLexicalIdentityIntake"
// Notes: the first alignment case, in table order, against the accepted source token list.
const alignmentReasonOf = (record, sourceTokens, profileId) => {
  if (!sourceTokens) return REASONS.unmatchedRecord;
  if (record.tokens.length !== sourceTokens.length) return REASONS.tokenCountMismatch;
  if (record.tokens.some((entry, position) => entry.surface !== sourceTokens[position])) return REASONS.surfaceMismatch;
  if (record.tokens.some((entry) => entry.status !== statusOfReadings(entry.readings))) return REASONS.statusReadingsDisagree;
  if (record.tokens.some((entry) => entry.readings.some((reading) => !reading.lexemeId.startsWith(`${profileId}.`)))) return REASONS.lexemeOutsideProfile;
  return null;
};

// Envelope (§4.4 rules 2-4 and 6, as Stage 1A checks the other sections, plus a valid `lexicalProfile`).
const envelopeStateOf = (section) => {
  if (!isPlainObject(section)) return AVAILABILITY.sectionInvalid;
  if (section.contractVersion !== SECTION_VERSION) return AVAILABILITY.sectionUnsupported;
  const hasExactTupleFields =
    Array.isArray(section.identityTupleFields) &&
    section.identityTupleFields.length === IDENTITY_TUPLE_FIELDS.length &&
    section.identityTupleFields.every((field, index) => field === IDENTITY_TUPLE_FIELDS[index]);
  const profile = section.lexicalProfile;
  const hasProfile = isPlainObject(profile) && ['profileId', 'profileVersion', 'lexiconDigest'].every((field) => isNonEmptyString(profile[field]));
  if (!hasExactTupleFields || !Array.isArray(section.records) || section.recordCount !== section.records.length || !hasProfile) return AVAILABILITY.sectionInvalid;
  return AVAILABILITY.available;
};

// [2.4] cfg-treeStructureAdvisor · Container · "prepareTreeLexicalIdentityIntake"
// Concern: Logic · Parent: Tree wiring
// Notes: `namingOccurrenceBridge` is the payload Stage 1A reads; `sectionIntake` is its accepted N1 and N2
// records; the namespace is the payload's own (§4.7 namespace mismatch), never derived from accepted records.
// Returns `null` when the payload carries no section (absent: nothing is recorded, S1.3).
export const prepareTreeLexicalIdentityIntake = ({ namingOccurrenceBridge, sectionIntake } = {}) => {
  const payload = isPlainObject(namingOccurrenceBridge) ? namingOccurrenceBridge : null;
  if (!payload || payload[SECTION_KEY] === undefined) return null;
  const section = payload[SECTION_KEY];
  const availability = envelopeStateOf(section);
  if (availability !== AVAILABILITY.available) {
    return Object.freeze({
      source: SOURCE_ID,
      availability,
      acceptedRecords: [],
      rejectedRecords: [],
      diagnostics: [{ section: DIAGNOSTIC_SECTION, reason: availability, identityTuple: null }],
    });
  }

  const namespace = { addressProfileId: payload.addressProfileId, addressedSnapshotId: payload.addressedSnapshotId };
  const lexicalProfile = { profileId: section.lexicalProfile.profileId, profileVersion: section.lexicalProfile.profileVersion, lexiconDigest: section.lexicalProfile.lexiconDigest };
  const sources = {
    [TOKEN_SOURCES.semanticTokens]: new Map(
      (sectionIntake?.semanticEvidenceEnrichment?.acceptedRecords ?? []).filter((record) => Array.isArray(record.semanticTokens)).map((record) => [toTupleKey(record), record.semanticTokens]),
    ),
    [TOKEN_SOURCES.labelTokens]: new Map(
      (sectionIntake?.folderLabelObservations?.acceptedRecords ?? []).filter((record) => record.parseOutcome === 'parsed').map((record) => [toTupleKey(record), record.labelTokens]),
    ),
  };
  const hasIdentity = (record) => isPlainObject(record) && IDENTITY_TUPLE_FIELDS.every((field) => isNonEmptyString(record[field]));
  const counts = new Map();
  for (const record of section.records) if (hasIdentity(record)) counts.set(toTupleKey(record), (counts.get(toTupleKey(record)) ?? 0) + 1);

  const acceptedRecords = [];
  const rejectedRecords = [];
  for (const record of section.records) {
    if (!hasIdentity(record)) {
      rejectedRecords.push({ identityTuple: null, reason: REASONS.invalidIdentity });
      continue;
    }
    const identityTuple = tupleOf(record);
    const reason =
      counts.get(toTupleKey(record)) > 1
        ? REASONS.duplicateIdentity
        : record.addressProfileId !== namespace.addressProfileId || record.addressedSnapshotId !== namespace.addressedSnapshotId
          ? REASONS.namespaceMismatch
          : !hasRecordShape(record)
            ? REASONS.invalidRecordShape
            : alignmentReasonOf(record, sources[record.tokenSource].get(toTupleKey(record)), lexicalProfile.profileId);
    if (reason) {
      rejectedRecords.push({ identityTuple, reason });
      continue;
    }
    acceptedRecords.push({
      ...identityTuple,
      tokenSource: record.tokenSource,
      tokens: record.tokens.map((entry) => ({
        surface: entry.surface,
        status: entry.status,
        readings: entry.readings.map((reading) => ({ lexemeId: reading.lexemeId, features: { ...reading.features }, basis: reading.basis })),
      })),
    });
  }
  const compareRejected = (left, right) =>
    (left.identityTuple ? toTupleKey(left.identityTuple) : '').localeCompare(right.identityTuple ? toTupleKey(right.identityTuple) : '') || left.reason.localeCompare(right.reason);
  const sortedRejected = rejectedRecords.sort(compareRejected);
  return Object.freeze({
    source: SOURCE_ID,
    availability,
    lexicalProfile,
    acceptedRecords: acceptedRecords.sort(compareTupleKeys),
    rejectedRecords: sortedRejected,
    diagnostics: sortedRejected.map(({ identityTuple, reason }) => ({ section: DIAGNOSTIC_SECTION, reason, identityTuple })),
  });
};

// [2.4] cfg-treeStructureAdvisor · Container · "createTreeLexicalRelation"
// Concern: Logic · Parent: Stage 3 positional lineage expression (S3.2)
// Notes: the one Tree-facing operation, only for an `available` intake (otherwise `null`): the foundation
// relation (contract §6.2) between a lineage folder's label token and a member's token at one position,
// with the lexeme identifiers both share. An occurrence without an accepted record is `undetermined`.
export const createTreeLexicalRelation = (intake) => {
  if (intake?.availability !== AVAILABILITY.available) return null;
  const recordsByKey = new Map(intake.acceptedRecords.map((record) => [toTupleKey(record), record]));
  const provenance = intake.lexicalProfile;
  return ({ folder, labelIndex, member, memberIndex }) => {
    const label = recordsByKey.get(toTupleKey(folder));
    const token = recordsByKey.get(toTupleKey(member));
    const left = label?.tokenSource === TOKEN_SOURCES.labelTokens ? label.tokens[labelIndex] : undefined;
    const right = token?.tokenSource === TOKEN_SOURCES.semanticTokens ? token.tokens[memberIndex] : undefined;
    if (!left || !right) return { relation: UNDETERMINED, lexemeIds: [] };
    const relation = compareLexicalResolutions({ ...left, provenance }, { ...right, provenance });
    const rightIds = new Set(right.readings.map((reading) => reading.lexemeId));
    const lexemeIds = [...new Set(left.readings.map((reading) => reading.lexemeId).filter((lexemeId) => rightIds.has(lexemeId)))].sort();
    return { relation, lexemeIds };
  };
};
