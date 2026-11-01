// Linguistic Foundation shared contract, test-only reference model (doc/ValidatorSpecs/
// linguistic-foundation-shared-contract.spec.md; calculogic-validator#146). An executable restatement of
// the contract's rules, used only to check that the contract's examples and evidence are consistent.
// It is not an implementation, is not shipped, and is never imported outside `test/`: the runtime, its
// registry, digest and loader belong to the lexicon slice (§11, §12 D4).
import { createHash } from 'node:crypto';
import { FOUNDATION } from './linguistic-foundation-contract-cases.fixture.mjs';

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const featureKey = (features) => Object.keys(features).sort().map((space) => `${space}=${features[space]}`).join(',');
const readingKey = (reading) => `${reading.lexemeId}\u0000${featureKey(reading.features)}`;
const byReading = (left, right) => (readingKey(left) < readingKey(right) ? -1 : readingKey(left) > readingKey(right) ? 1 : 0);

// §4.2, §5.1: every problem of a profile, sorted and without duplicates.
export const validateProfile = (profile) => {
  const problems = new Set();
  if (!KEBAB.test(profile.profileId ?? '')) problems.add('profile-id-not-kebab-case');
  if (typeof profile.profileVersion !== 'string' || profile.profileVersion === '') problems.add('profile-version-missing');
  for (const [space, values] of Object.entries(FOUNDATION.featureSpaces)) {
    const declared = profile.featureSupport?.[space] ?? {};
    if (values.some((value) => !FOUNDATION.supportStatuses.includes(declared[value]))) problems.add('feature-support-incomplete');
    if (Object.keys(declared).some((value) => !values.includes(value))) problems.add('profile-adds-feature-value');
  }
  if (Object.keys(profile.featureSupport ?? {}).some((space) => !Object.hasOwn(FOUNDATION.featureSpaces, space))) problems.add('profile-adds-feature-value');
  const lexemeIds = new Set();
  const forms = new Set();
  for (const entry of profile.entries ?? []) {
    if (!entry.lexemeId?.startsWith(`${profile.profileId}.`)) problems.add('lexeme-id-outside-profile');
    if (lexemeIds.has(entry.lexemeId)) problems.add('lexeme-id-duplicate');
    lexemeIds.add(entry.lexemeId);
    for (const form of entry.forms ?? []) {
      if (typeof form.surface !== 'string' || form.surface === '') problems.add('surface-empty');
      for (const [space, value] of Object.entries(form.features ?? {})) {
        if (!Object.hasOwn(FOUNDATION.featureSpaces, space)) problems.add('feature-space-unknown');
        // §4.2: a value is one of the space's strings; a non-string would coerce to a property key.
        else if (typeof value !== 'string' || !FOUNDATION.featureSpaces[space].includes(value)) problems.add('feature-value-unknown');
        else if (profile.featureSupport?.[space]?.[value] !== 'supported') problems.add('feature-value-unsupported');
      }
      const key = `${form.surface}\u0000${readingKey({ lexemeId: entry.lexemeId, features: form.features ?? {} })}`;
      if (forms.has(key)) problems.add('form-duplicate');
      forms.add(key);
    }
  }
  return [...problems].sort();
};

// §7: a deterministic digest of entries and support. The contract leaves the algorithm to the lexicon
// slice (§12 D4); this one is a test stand-in that only has to be order-independent.
const canonical = (profile) =>
  JSON.stringify({
    profileId: profile.profileId,
    profileVersion: profile.profileVersion,
    featureSupport: Object.keys(profile.featureSupport).sort().map((space) => [space, Object.keys(profile.featureSupport[space]).sort().map((value) => [value, profile.featureSupport[space][value]])]),
    forms: profile.entries
      .flatMap((entry) => entry.forms.map((form) => `${form.surface}\u0000${readingKey({ lexemeId: entry.lexemeId, features: form.features })}`))
      .sort(),
  });
export const lexiconDigestOf = (profile) => createHash('sha256').update(canonical(profile)).digest('hex');

// §4.3, §6.1, §7: the resolution of one surface form. Declared entries only (R1), exact equality (R2),
// the form alone (R3), sorted (R4). `profile` null means no profile is active (§5.3).
export const resolve = (profile, surface) => {
  if (!profile) return { surface, status: 'profile-unavailable', readings: [] };
  const readings = profile.entries
    .flatMap((entry) => entry.forms.filter((form) => form.surface === surface).map((form) => ({ lexemeId: entry.lexemeId, features: { ...form.features }, basis: 'lexicon-entry' })))
    .sort(byReading);
  const lexemes = new Set(readings.map((item) => item.lexemeId));
  const status = readings.length === 0 ? 'unknown' : lexemes.size === 1 ? 'resolved' : 'ambiguous';
  return {
    surface,
    status,
    readings,
    provenance: { profileId: profile.profileId, profileVersion: profile.profileVersion, lexiconDigest: lexiconDigestOf(profile) },
  };
};

// §6.2: the lexeme-comparison relation of two resolutions.
export const compare = (left, right) => {
  const lexical = (resolution) => resolution.status === 'resolved' || resolution.status === 'ambiguous';
  if (!lexical(left) || !lexical(right)) return 'undetermined';
  if (left.provenance.profileId !== right.provenance.profileId || left.provenance.profileVersion !== right.provenance.profileVersion) return 'undetermined';
  const leftIds = new Set(left.readings.map((item) => item.lexemeId));
  const rightIds = new Set(right.readings.map((item) => item.lexemeId));
  const shared = [...leftIds].some((id) => rightIds.has(id));
  if (left.status === 'resolved' && right.status === 'resolved') return shared ? 'same-lexeme' : 'different-lexemes';
  return shared ? 'possibly-same-lexeme' : 'different-lexemes';
};

// §8.2 (Proposed): the bridge record for one token list.
export const bridgeRecordOf = (profile, tokenSource, sourceTokens) => ({
  tokenSource,
  tokens: sourceTokens.map((surface) => {
    const { status, readings } = resolve(profile, surface);
    return { surface, status, readings };
  }),
});

// §8.3 (Proposed): the consumer checks of one record against its accepted source token list.
export const checkBridgeRecord = (profile, record, sourceTokens) => {
  const problems = new Set();
  if (record.tokens.length !== sourceTokens.length) problems.add('token-count-mismatch');
  record.tokens.forEach((entry, position) => {
    if (position < sourceTokens.length && entry.surface !== sourceTokens[position]) problems.add('surface-mismatch');
    const lexemes = new Set(entry.readings.map((item) => item.lexemeId));
    const expected = entry.readings.length === 0 ? 'unknown' : lexemes.size === 1 ? 'resolved' : 'ambiguous';
    if (entry.status !== expected) problems.add('status-readings-disagree');
    if (entry.readings.some((item) => !item.lexemeId.startsWith(`${profile.profileId}.`))) problems.add('lexeme-id-outside-profile');
  });
  return [...problems].sort();
};
