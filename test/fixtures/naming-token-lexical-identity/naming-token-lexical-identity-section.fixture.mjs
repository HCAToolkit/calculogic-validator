// Naming token lexical-identity section, executable contract evidence (bridge contract §4.7, §6.4;
// validator config spec §10; Linguistic Foundation shared contract §8, §15.4; calculogic-validator#150).
// Test-only and not shipped. `buildReferenceSection` and `checkReferenceSection` restate the contract so
// its examples can be checked; they are not the Naming producer or a Tree consumer, which belong to the
// implementation slice. Lexical resolution here is the real foundation runtime, called the way the
// contract says the producer will call it: `resolveSurfaceForm` on each supplied token, nothing else.
import { resolveSurfaceForm } from '../../../linguistic-foundation/src/linguistic-foundation-resolution.logic.mjs';

export const SECTION_NAME = 'namingTokenLexicalIdentities';
export const SECTION_VERSION = 'naming-token-lexical-identity.v1';
export const PRODUCER_ID = 'naming-token-lexical-identity';
const TUPLE = ['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress'];
const tupleOf = (record) => Object.fromEntries(TUPLE.map((field) => [field, record[field]]));
const keyOf = (record) => TUPLE.map((field) => record[field]).join('\u0000');
const byTuple = (left, right) => (keyOf(left) < keyOf(right) ? -1 : keyOf(left) > keyOf(right) ? 1 : 0);

// §6.4: the fields the section carries, in table order.
export const SECTION_FIELDS = Object.freeze([
  'lexicalProfile', 'tokenSource', 'tokens', 'tokens[].surface', 'tokens[].status', 'tokens[].readings',
  'tokens[].readings[].lexemeId', 'tokens[].readings[].features', 'tokens[].readings[].basis',
]);
export const ENTRY_STATUSES = Object.freeze(['resolved', 'ambiguous', 'unknown']);

// §4.7 consumer identity rules: problem codes, in the table's order, with the table's meanings.
export const CONSUMER_PROBLEMS = Object.freeze([
  ['invalid-identity', 'invalid identity'],
  ['duplicate-identity', 'duplicate identity; every record carrying that tuple is dropped'],
  ['namespace-mismatch', 'namespace mismatch'],
  ['unmatched-record', 'unmatched record'],
  ['token-count-mismatch', 'token-count mismatch'],
  ['surface-mismatch', 'surface mismatch'],
  ['status-readings-disagree', 'status-readings disagreement'],
  ['lexeme-outside-profile', 'lexeme outside the profile'],
]);

const entryOf = (profile, surface) => {
  const { status, readings } = resolveSurfaceForm(profile, surface);
  return { surface, status, readings: readings.map(({ lexemeId, features, basis }) => ({ lexemeId, features: { ...features }, basis })) };
};

// §4.7 producer rules. `n1Records`: §4.5 records; `n2Records`: §4.6 records; `profile`: the active runtime
// profile or null. Returns the section, or null when it is omitted.
export const buildReferenceSection = ({ n1Records, n2Records, profile }) => {
  if (!profile) return null;
  const records = [
    ...n1Records.filter((record) => Array.isArray(record.semanticTokens)).map((record) => ({ record, tokenSource: 'semantic-tokens', tokens: record.semanticTokens })),
    ...n2Records.filter((record) => record.parseOutcome === 'parsed').map((record) => ({ record, tokenSource: 'label-tokens', tokens: record.labelTokens })),
  ]
    .map(({ record, tokenSource, tokens }) => ({ ...tupleOf(record), tokenSource, tokens: tokens.map((surface) => entryOf(profile, surface)) }))
    .sort(byTuple);
  if (records.length === 0) return null;
  return {
    contractVersion: SECTION_VERSION,
    producerId: PRODUCER_ID,
    source: 'calculogic-validator/naming',
    identityTupleFields: [...TUPLE],
    lexicalProfile: { profileId: profile.profileId, profileVersion: profile.profileVersion, lexiconDigest: profile.lexiconDigest },
    recordCount: records.length,
    records,
  };
};

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

// §4.7 consumer identity rules over accepted source records. Returns `{ section, records }`: a section
// problem, or each record's problems (sorted; empty when the record is accepted).
export const checkReferenceSection = (section, { namespace, acceptedN1, acceptedN2 }) => {
  const profile = section?.lexicalProfile;
  const envelopeOk =
    section?.contractVersion === SECTION_VERSION &&
    Array.isArray(section.records) &&
    section.recordCount === section.records.length &&
    JSON.stringify(section.identityTupleFields) === JSON.stringify(TUPLE) &&
    profile && ['profileId', 'profileVersion', 'lexiconDigest'].every((field) => isNonEmptyString(profile[field]));
  if (!envelopeOk) return { section: 'malformed-section', records: [] };
  const sources = {
    'semantic-tokens': new Map(acceptedN1.filter((record) => Array.isArray(record.semanticTokens)).map((record) => [keyOf(record), record.semanticTokens])),
    'label-tokens': new Map(acceptedN2.filter((record) => record.parseOutcome === 'parsed').map((record) => [keyOf(record), record.labelTokens])),
  };
  const counts = new Map();
  for (const record of section.records) counts.set(keyOf(record), (counts.get(keyOf(record)) ?? 0) + 1);
  const records = section.records.map((record) => {
    const problems = new Set();
    if (!TUPLE.every((field) => isNonEmptyString(record[field]))) problems.add('invalid-identity');
    else if (counts.get(keyOf(record)) > 1) problems.add('duplicate-identity');
    else if (record.addressProfileId !== namespace.addressProfileId || record.addressedSnapshotId !== namespace.addressedSnapshotId) problems.add('namespace-mismatch');
    else {
      const sourceTokens = sources[record.tokenSource]?.get(keyOf(record));
      if (!sourceTokens) problems.add('unmatched-record');
      else {
        if (record.tokens.length !== sourceTokens.length) problems.add('token-count-mismatch');
        record.tokens.forEach((entry, position) => {
          if (position < sourceTokens.length && entry.surface !== sourceTokens[position]) problems.add('surface-mismatch');
          const lexemes = new Set(entry.readings.map((reading) => reading.lexemeId));
          const expected = entry.readings.length === 0 ? 'unknown' : lexemes.size === 1 ? 'resolved' : 'ambiguous';
          if (entry.status !== expected) problems.add('status-readings-disagree');
          if (entry.readings.some((reading) => !reading.lexemeId.startsWith(`${profile.profileId}.`))) problems.add('lexeme-outside-profile');
        });
      }
    }
    return { key: keyOf(record), problems: [...problems].sort() };
  });
  return { section: null, records };
};

// Validator config spec §10.4: each situation, the config's `linguisticProfile` value, the stage that
// decides it, the run outcome and the problem. Situations are the table's, in order.
export const SELECTION_CASES = Object.freeze([
  { situation: 'No `linguisticProfile`', value: undefined, stage: null, outcome: 'continue', problem: null, active: null },
  { situation: 'Malformed `linguisticProfile` (stage 1)', value: { profileId: '' }, stage: 'schema', outcome: 'stop', problem: 'malformed', active: null },
  { situation: 'Well-formed, unregistered profile (stage 2)', value: { profileId: 'french' }, stage: 'resolution', outcome: 'stop', problem: 'profile-not-registered', active: null },
  { situation: 'Well-formed, version mismatch (stage 2)', value: { profileId: 'english', profileVersion: '2' }, stage: 'resolution', outcome: 'stop', problem: 'profile-version-mismatch', active: null },
  { situation: 'Valid, registered profile', value: { profileId: 'english', profileVersion: '1' }, stage: 'resolution', outcome: 'continue', problem: null, active: 'english' },
  { situation: 'Profile active, a token resolves `unknown`', value: { profileId: 'english' }, stage: 'resolution', outcome: 'continue', problem: null, active: 'english', unknownToken: 'status' },
]);

// Stage 1 malformed shapes (§10.4): each must stop before any profile is resolved.
export const MALFORMED_SELECTIONS = Object.freeze([
  'english', ['english'], null, {}, { profileId: '' }, { profileId: 1 }, { profileId: 'english', profileVersion: '' },
  { profileId: 'english', profileVersion: 1 }, { profileId: 'english', locale: 'en' },
]);
