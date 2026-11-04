// Tree role-category vocabulary intake (Tree spec S1.1–S1.3; bridge contract §4.9, §6.6;
// calculogic-validator#162): the ordered checks and the states, at the module level. Wiring-level trust,
// independence and behavior preservation are in `tree-role-category-vocabulary.wiring.test.mjs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TREE_ROLE_CATEGORY_VOCABULARY_REASONS as REASONS,
  TREE_ROLE_CATEGORY_VOCABULARY_STATES as STATES,
  prepareTreeRoleCategoryVocabularyIntake,
  toTreeUsableRoleCategoryVocabulary,
} from '../src/tree-role-category-vocabulary-evidence.logic.mjs';

const MODULE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/tree-role-category-vocabulary-evidence.logic.mjs');

const RUN_PROVENANCE = Object.freeze({ source: 'builtin', digest: 'digest-1' });
const section = (overrides = {}) => ({
  contractVersion: 'naming-role-category-vocabulary.v1',
  producerId: 'naming-role-category-vocabulary',
  source: 'calculogic-validator/naming',
  registrySource: 'builtin',
  categoryRolePerspectiveDigest: 'digest-1',
  recordCount: 2,
  records: [
    { category: 'concern-core', roles: ['logic', 'wiring'] },
    { category: 'documentation', roles: ['spec'] },
  ],
  ...overrides,
});
const sectionIntakeWith = (categories) => ({
  semanticEvidenceEnrichment: {
    acceptedRecords: [
      ...categories.map((roleCategory, index) => ({ occurrenceAddress: `a${index}`, roleFactGroup: 'accepted', role: `r${index}`, roleCategory, roleStatus: 'active' })),
      // Group states other than `accepted` are not observed evidence.
      { occurrenceAddress: 'omitted', roleFactGroup: 'omitted' },
      { occurrenceAddress: 'invalid', roleFactGroup: 'invalid' },
    ],
  },
});
// Explicit `undefined` values are kept (no destructuring defaults): an absent section and an absent origin
// are cases under test.
const intakeOf = (options = {}) => {
  const vocabularySection = 'vocabularySection' in options ? options.vocabularySection : section();
  const bridgeOrigin = 'bridgeOrigin' in options ? options.bridgeOrigin : 'tree-built';
  const { runProvenance = RUN_PROVENANCE, observed = ['concern-core'], payloadExtras = {} } = options;
  return prepareTreeRoleCategoryVocabularyIntake({
    namingOccurrenceBridge: { bridgeSource: 'calculogic-validator/naming', ...payloadExtras, ...(vocabularySection === undefined ? {} : { namingRoleCategoryVocabulary: vocabularySection }) },
    bridgeOrigin,
    runCategoryRolePerspectiveProvenance: runProvenance,
    sectionIntake: sectionIntakeWith(observed),
  });
};
const diagnosticOf = (intake) => {
  assert.equal(intake.diagnostics.length, 1);
  return intake.diagnostics[0];
};

test('acceptance 2 (module): Tree-built, valid, provenance matching, consistent → usable, with the vocabulary', () => {
  const intake = intakeOf();
  assert.equal(intake.state, STATES.usable);
  assert.deepEqual(intake.diagnostics, []);
  assert.deepEqual(toTreeUsableRoleCategoryVocabulary(intake), {
    registrySource: 'builtin',
    categoryRolePerspectiveDigest: 'digest-1',
    records: section().records,
  });
});

test('acceptance 3 (module): no section → no record (absent); a non-object payload too', () => {
  assert.equal(intakeOf({ vocabularySection: undefined }), null);
  assert.equal(prepareTreeRoleCategoryVocabularyIntake({ namingOccurrenceBridge: null, bridgeOrigin: 'tree-built' }), null);
  assert.equal(toTreeUsableRoleCategoryVocabulary(null), null);
});

test('acceptance 4: another contract version → unsupported, checked first', () => {
  const intake = intakeOf({ vocabularySection: section({ contractVersion: 'naming-role-category-vocabulary.v2', records: 'broken' }), bridgeOrigin: 'caller-supplied' });
  assert.equal(intake.state, STATES.unsupported);
  assert.equal(diagnosticOf(intake).reason, REASONS.unsupportedVersion);
  assert.equal(toTreeUsableRoleCategoryVocabulary(intake), null);
});

test('acceptance 5: every envelope and record defect makes the whole section invalid, never a partial vocabulary', () => {
  const cases = [
    ['missing provenance field', section({ categoryRolePerspectiveDigest: undefined }), REASONS.invalidEnvelope],
    ['empty digest', section({ categoryRolePerspectiveDigest: '' }), REASONS.invalidEnvelope],
    ['missing registrySource', section({ registrySource: undefined }), REASONS.invalidEnvelope],
    ['unknown registrySource', section({ registrySource: 'elsewhere' }), REASONS.invalidEnvelope],
    ['identity tuple fields present', section({ identityTupleFields: ['addressProfileId'] }), REASONS.invalidEnvelope],
    ['records not an array', section({ records: {} }), REASONS.invalidEnvelope],
    ['recordCount not an integer', section({ recordCount: '2' }), REASONS.invalidEnvelope],
    ['section not an object', null, REASONS.invalidEnvelope],
    ['empty category', section({ records: [{ category: '', roles: ['logic'] }, section().records[1]] }), REASONS.invalidRecord],
    ['empty roles', section({ records: [{ category: 'concern-core', roles: [] }, section().records[1]] }), REASONS.invalidRecord],
    ['unsorted roles', section({ records: [{ category: 'concern-core', roles: ['wiring', 'logic'] }, section().records[1]] }), REASONS.invalidRecord],
    ['duplicate roles', section({ records: [{ category: 'concern-core', roles: ['logic', 'logic'] }, section().records[1]] }), REASONS.invalidRecord],
    ['record with an identity field', section({ records: [{ ...section().records[0], occurrenceAddress: 'x' }, section().records[1]] }), REASONS.invalidRecord],
    ['duplicate category', section({ records: [section().records[0], section().records[0]] }), REASONS.unsortedOrDuplicateCategory],
    ['unsorted categories', section({ records: [...section().records].reverse() }), REASONS.unsortedOrDuplicateCategory],
    ['count mismatch', section({ recordCount: 3 }), REASONS.recordCountMismatch],
  ];
  for (const [name, vocabularySection, reason] of cases) {
    const intake = intakeOf({ vocabularySection });
    assert.equal(intake.state, STATES.invalid, name);
    assert.equal(diagnosticOf(intake).reason, reason, name);
    assert.equal(intake.vocabulary, null, name);
    assert.equal(toTreeUsableRoleCategoryVocabulary(intake), null, name);
  }
});

test('acceptance 1 (module): caller-supplied with everything matching and `bridgeSource` claiming Naming → untrusted', () => {
  const intake = intakeOf({ bridgeOrigin: 'caller-supplied' });
  assert.equal(intake.state, STATES.untrusted);
  assert.equal(diagnosticOf(intake).reason, REASONS.callerSupplied);
  assert.equal(toTreeUsableRoleCategoryVocabulary(intake), null);
  // Any origin other than exactly `tree-built` is untrusted, whatever the payload says about itself.
  for (const bridgeOrigin of [undefined, null, 'calculogic-validator/naming', 'Tree-Built']) {
    assert.equal(intakeOf({ bridgeOrigin, payloadExtras: { bridgeSource: 'tree-built' } }).state, STATES.untrusted, String(bridgeOrigin));
  }
});

test('invalid is decided before origin: a broken caller-supplied section is invalid, not untrusted', () => {
  assert.equal(intakeOf({ bridgeOrigin: 'caller-supplied', vocabularySection: section({ recordCount: 9 }) }).state, STATES.invalid);
});

test('acceptance 8 (module): run provenance unavailable, source differs, digest differs → mismatched', () => {
  const cases = [
    [null, REASONS.runProvenanceUnavailable],
    [{}, REASONS.runProvenanceUnavailable],
    [{ source: 'builtin', digest: '' }, REASONS.runProvenanceUnavailable],
    [{ source: 'custom', digest: 'digest-1' }, REASONS.sourceMismatch],
    [{ source: 'builtin', digest: 'digest-2' }, REASONS.digestMismatch],
  ];
  for (const [runProvenance, reason] of cases) {
    const intake = intakeOf({ runProvenance });
    assert.equal(intake.state, STATES.mismatched, reason);
    assert.equal(diagnosticOf(intake).reason, reason);
    assert.equal(toTreeUsableRoleCategoryVocabulary(intake), null);
  }
});

test('acceptance 6: an accepted §4.5 category missing from a Tree-built vocabulary → inconsistent, naming it', () => {
  const intake = intakeOf({ observed: ['concern-core', 'integration-adapter', 'deprecated', 'integration-adapter'] });
  assert.equal(intake.state, STATES.inconsistent);
  assert.deepEqual(diagnosticOf(intake), {
    section: 'naming-role-category-vocabulary',
    state: STATES.inconsistent,
    reason: REASONS.observedCategoryMissing,
    missingCategories: ['deprecated', 'integration-adapter'],
  });
  assert.equal(toTreeUsableRoleCategoryVocabulary(intake), null);
});

test('acceptance 7 (documented limit): a missing category no accepted record carries is not detected', () => {
  // The vocabulary lacks `integration-adapter`, but no accepted record uses it: consistency cannot see it,
  // so the state is `usable`. Trust here rests on the producer path (S1.2 check 3), not on this check.
  const intake = intakeOf({ observed: ['concern-core', 'documentation'] });
  assert.equal(intake.state, STATES.usable);
  assert.equal(toTreeUsableRoleCategoryVocabulary(intake).records.some((record) => record.category === 'integration-adapter'), false);
});

test('the intake record carries only its own fields, and the payload is never mutated', () => {
  const payload = { namingRoleCategoryVocabulary: section() };
  const before = JSON.stringify(payload);
  const intake = prepareTreeRoleCategoryVocabularyIntake({ namingOccurrenceBridge: payload, bridgeOrigin: 'tree-built', runCategoryRolePerspectiveProvenance: RUN_PROVENANCE, sectionIntake: sectionIntakeWith([]) });
  assert.deepEqual(Object.keys(intake), ['source', 'state', 'bridgeOrigin', 'vocabulary', 'diagnostics']);
  assert.equal(JSON.stringify(payload), before);
  intake.vocabulary.records[0].roles.push('x');
  assert.equal(JSON.stringify(payload), before);
});

test('acceptance 12: the Tree intake module imports nothing from Naming registries (or any Naming module)', () => {
  const imports = [...fs.readFileSync(MODULE_PATH, 'utf8').matchAll(/^import[^;]*from\s+'([^']+)'/gmu)].map((match) => match[1]);
  assert.deepEqual(imports, ['./tree-naming-section-intake.logic.mjs']);
  assert.ok(imports.every((specifier) => !specifier.includes('naming/src/registries/') && !specifier.includes('/naming/')));
});
