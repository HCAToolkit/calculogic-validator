// Linguistic Foundation shared contract, executable evidence (doc/ValidatorSpecs/
// linguistic-foundation-shared-contract.spec.md; calculogic-validator#146). Data only, test-only, not
// shipped. Nothing here is lexicon content: `english-sample` is an illustrative profile that exercises
// the contract (§6.3), and the real `english` profile is the lexicon slice's (§11). The reference model
// that reads this data is `linguistic-foundation-reference-model.fixture.mjs`; both are checked against
// the contract's tables in `test/linguistic-foundation-contract.test.mjs`.

// §4.1, §5.1, §6.1, §6.2, §7: the foundation's language-agnostic vocabularies. No lexeme, form or entry.
export const FOUNDATION = Object.freeze({
  featureSpaces: Object.freeze({ number: Object.freeze(['singular', 'plural']) }),
  supportStatuses: Object.freeze(['supported', 'unsupported', 'not-applicable']),
  resolutionStatuses: Object.freeze(['resolved', 'ambiguous', 'unknown', 'profile-unavailable']),
  comparisonRelations: Object.freeze(['same-lexeme', 'possibly-same-lexeme', 'different-lexemes', 'undetermined']),
  readingBases: Object.freeze(['lexicon-entry']),
});

const SINGULAR = Object.freeze({ number: 'singular' });
const PLURAL = Object.freeze({ number: 'plural' });
const pair = (singular, plural) => ({
  lexemeId: `english-sample.${singular}`,
  forms: [
    { surface: singular, features: SINGULAR },
    { surface: plural, features: PLURAL },
  ],
});

// §10, measured at 98e54e2 (`repo` scope): s-final Naming tokens whose singular also occurs.
export const MEASURED_NUMBER_PAIRS = Object.freeze([
  ['args', 'arg'], ['candidates', 'candidate'], ['cases', 'case'], ['contributors', 'contributor'], ['decisions', 'decision'],
  ['docs', 'doc'], ['homes', 'home'], ['kinds', 'kind'], ['migrations', 'migration'], ['paths', 'path'],
  ['policies', 'policy'], ['profiles', 'profile'], ['references', 'reference'], ['registries', 'registry'],
  ['relationships', 'relationship'], ['roots', 'root'], ['rules', 'rule'], ['scopes', 'scope'], ['signals', 'signal'],
  ['surfaces', 'surface'], ['targets', 'target'],
]);
// §10: measured tokens a final-`s` strip would turn into an invented word or a false singular.
export const MEASURED_STRIP_TRAPS = Object.freeze(['address', 'cross', 'readiness', 'status']);

// Illustrative sample profile (§6.3). Every measured pair is declared, plus the contrast forms §6.3 uses.
// `docs` and `diagnostics` carry a second, featureless lexeme; `series` is one lexeme in both numbers;
// `cross` and `readiness` are deliberately undeclared.
export const SAMPLE_PROFILE = Object.freeze({
  profileId: 'english-sample',
  profileVersion: '0',
  featureSupport: { number: { singular: 'supported', plural: 'supported' } },
  entries: [
    ...MEASURED_NUMBER_PAIRS.map(([plural, singular]) => pair(singular, plural)),
    { lexemeId: 'english-sample.docs', forms: [{ surface: 'docs', features: {} }] },
    pair('diagnostic', 'diagnostics'),
    { lexemeId: 'english-sample.diagnostics', forms: [{ surface: 'diagnostics', features: {} }] },
    pair('status', 'statuses'),
    pair('address', 'addresses'),
    { lexemeId: 'english-sample.series', forms: [{ surface: 'series', features: SINGULAR }, { surface: 'series', features: PLURAL }] },
  ],
});

// §5.1: a profile for a language without grammatical number.
export const NUMBERLESS_PROFILE = Object.freeze({
  profileId: 'numberless-sample',
  profileVersion: '0',
  featureSupport: { number: { singular: 'not-applicable', plural: 'not-applicable' } },
  entries: [{ lexemeId: 'numberless-sample.rule', forms: [{ surface: 'rule', features: {} }] }],
});

// §4.2, §5.1: invalid profiles, each with the one problem the reference model must report.
export const INVALID_PROFILES = Object.freeze([
  {
    problem: 'profile-id-not-kebab-case',
    change: (profile) => ({ ...profile, profileId: 'English', entries: profile.entries.map((entry) => ({ ...entry, lexemeId: entry.lexemeId.replace(/^english-sample\./u, 'English.') })) }),
  },
  { problem: 'profile-version-missing', change: (profile) => ({ ...profile, profileVersion: '' }) },
  { problem: 'lexeme-id-outside-profile', change: (profile) => ({ ...profile, entries: [...profile.entries, { lexemeId: 'english.rule', forms: [{ surface: 'rulez', features: {} }] }] }) },
  { problem: 'lexeme-id-duplicate', change: (profile) => ({ ...profile, entries: [...profile.entries, { lexemeId: 'english-sample.rule', forms: [{ surface: 'rulez', features: {} }] }] }) },
  { problem: 'surface-empty', change: (profile) => ({ ...profile, entries: [...profile.entries, { lexemeId: 'english-sample.empty', forms: [{ surface: '', features: {} }] }] }) },
  { problem: 'form-duplicate', change: (profile) => ({ ...profile, entries: profile.entries.map((entry) => (entry.lexemeId === 'english-sample.rule' ? { ...entry, forms: [...entry.forms, entry.forms[0]] } : entry)) }) },
  { problem: 'feature-space-unknown', change: (profile) => ({ ...profile, entries: [...profile.entries, { lexemeId: 'english-sample.go', forms: [{ surface: 'went', features: { tense: 'past' } }] }] }) },
  { problem: 'feature-value-unknown', change: (profile) => ({ ...profile, entries: [...profile.entries, { lexemeId: 'english-sample.array', forms: [{ surface: 'arrays', features: { number: ['plural'] } }] }] }) },
  { problem: 'feature-value-unsupported', change: (profile) => ({ ...profile, featureSupport: { number: { singular: 'supported', plural: 'unsupported' } } }) },
  {
    problem: 'feature-support-incomplete',
    // Plural forms are removed too, so the only fault is the undeclared `plural` value.
    change: (profile) => ({
      ...profile,
      featureSupport: { number: { singular: 'supported' } },
      entries: profile.entries.map((entry) => ({ ...entry, forms: entry.forms.filter((form) => form.features.number !== 'plural') })),
    }),
  },
  { problem: 'profile-adds-feature-value', change: (profile) => ({ ...profile, featureSupport: { number: { singular: 'supported', plural: 'supported', dual: 'supported' } } }) },
]);

// §8.2 (Proposed): the bridge record shape, for the E10 member `naming-rule-check-*` file tokens and the
// `naming/src/rules` folder label, under the sample profile. Written out by hand: the test checks the
// reference model reproduces it and that the §8.3 consumer checks accept it.
const reading = (lexemeId, features) => ({ lexemeId, features, basis: 'lexicon-entry' });
export const BRIDGE_EXAMPLES = Object.freeze([
  {
    tokenSource: 'semantic-tokens',
    sourceTokens: ['naming', 'rule', 'check', 'alpha'],
    record: {
      tokenSource: 'semantic-tokens',
      tokens: [
        { surface: 'naming', status: 'unknown', readings: [] },
        { surface: 'rule', status: 'resolved', readings: [reading('english-sample.rule', SINGULAR)] },
        { surface: 'check', status: 'unknown', readings: [] },
        { surface: 'alpha', status: 'unknown', readings: [] },
      ],
    },
  },
  {
    tokenSource: 'label-tokens',
    sourceTokens: ['rules'],
    record: { tokenSource: 'label-tokens', tokens: [{ surface: 'rules', status: 'resolved', readings: [reading('english-sample.rule', PLURAL)] }] },
  },
]);

// §8.3 (Proposed): invalid records, each with the one consumer problem it must produce.
export const INVALID_BRIDGE_RECORDS = Object.freeze([
  { problem: 'token-count-mismatch', change: (record) => ({ ...record, tokens: record.tokens.slice(0, -1) }) },
  { problem: 'surface-mismatch', change: (record) => ({ ...record, tokens: record.tokens.map((entry, index) => (index === 1 ? { ...entry, surface: 'rules' } : entry)) }) },
  { problem: 'status-readings-disagree', change: (record) => ({ ...record, tokens: record.tokens.map((entry, index) => (index === 0 ? { ...entry, status: 'resolved' } : entry)) }) },
  {
    problem: 'lexeme-id-outside-profile',
    change: (record) => ({ ...record, tokens: record.tokens.map((entry, index) => (index === 1 ? { ...entry, readings: [reading('english.rule', SINGULAR)] } : entry)) }),
  },
]);
