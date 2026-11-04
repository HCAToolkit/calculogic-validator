// Tree role-category vocabulary intake, version 2 (Tree spec S1.1–S1.3 v2; bridge contract §4.9.1, §6.6;
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

const PERSPECTIVE_PROVENANCE = Object.freeze({ source: 'builtin', digest: 'digest-1' });
const ROLES_PROVENANCE = Object.freeze({ source: 'builtin', digest: 'digest-2' });
// Declared records include `deprecated`; the admissible bound does not (as for Builtin).
const RECORDS = Object.freeze([
  { category: 'concern-core', roles: ['logic', 'wiring'] },
  { category: 'deprecated', roles: ['view'] },
  { category: 'documentation', roles: ['spec'] },
]);
const section = (overrides = {}) => ({
  contractVersion: 'naming-role-category-vocabulary.v2',
  producerId: 'naming-role-category-vocabulary',
  source: 'calculogic-validator/naming',
  registrySource: 'builtin',
  categoryRolePerspectiveDigest: 'digest-1',
  rolesDigest: 'digest-2',
  recordCount: RECORDS.length,
  records: RECORDS.map((record) => ({ ...record, roles: [...record.roles] })),
  admissibleCategories: ['concern-core', 'documentation'],
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
// Explicit `undefined` values are kept (no destructuring defaults): an absent section, origin or provenance
// entry are cases under test.
const intakeOf = (options = {}) => {
  const vocabularySection = 'vocabularySection' in options ? options.vocabularySection : section();
  const bridgeOrigin = 'bridgeOrigin' in options ? options.bridgeOrigin : 'tree-built';
  const vocabularyOrigin = 'vocabularyOrigin' in options ? options.vocabularyOrigin : 'naming-derived';
  const perspective = 'perspective' in options ? options.perspective : PERSPECTIVE_PROVENANCE;
  const roles = 'roles' in options ? options.roles : ROLES_PROVENANCE;
  const { observed = ['concern-core'], payloadExtras = {} } = options;
  return prepareTreeRoleCategoryVocabularyIntake({
    namingOccurrenceBridge: { bridgeSource: 'calculogic-validator/naming', ...payloadExtras, ...(vocabularySection === undefined ? {} : { namingRoleCategoryVocabulary: vocabularySection }) },
    bridgeOrigin,
    vocabularyOrigin,
    runCategoryRolePerspectiveProvenance: perspective,
    runRolesProvenance: roles,
    sectionIntake: sectionIntakeWith(observed),
  });
};
const diagnosticOf = (intake) => {
  assert.equal(intake.diagnostics.length, 1);
  return intake.diagnostics[0];
};

test('v2 positive (module): Tree-built, Naming-derived, valid, both digests matching, consistent → usable; the view carries both sets', () => {
  const intake = intakeOf();
  assert.equal(intake.state, STATES.usable);
  assert.deepEqual(intake.diagnostics, []);
  assert.deepEqual(toTreeUsableRoleCategoryVocabulary(intake), {
    registrySource: 'builtin',
    categoryRolePerspectiveDigest: 'digest-1',
    rolesDigest: 'digest-2',
    records: section().records,
    admissibleCategories: ['concern-core', 'documentation'],
  });
});

test('acceptance 6 (module): unavailable versus empty — an empty bound is usable with `[]`; no section is absent; v1 is unsupported', () => {
  // Empty: valid evidence that no category is admissible (here, nothing observed either).
  const empty = intakeOf({ vocabularySection: section({ admissibleCategories: [] }), observed: [] });
  assert.equal(empty.state, STATES.usable);
  assert.deepEqual(toTreeUsableRoleCategoryVocabulary(empty).admissibleCategories, []);
  assert.notEqual(toTreeUsableRoleCategoryVocabulary(empty), null);
  // Unavailable: no section (absent) and a v1 section (unsupported); neither is read as empty or as declared.
  assert.equal(intakeOf({ vocabularySection: undefined }), null);
  assert.equal(prepareTreeRoleCategoryVocabularyIntake({ namingOccurrenceBridge: null, bridgeOrigin: 'tree-built' }), null);
  assert.equal(toTreeUsableRoleCategoryVocabulary(null), null);
  const { rolesDigest, admissibleCategories, ...v1Shape } = section();
  const v1 = intakeOf({ vocabularySection: { ...v1Shape, contractVersion: 'naming-role-category-vocabulary.v1' } });
  assert.equal(v1.state, STATES.unsupported);
  assert.equal(diagnosticOf(v1).reason, REASONS.unsupportedVersion);
  assert.equal(toTreeUsableRoleCategoryVocabulary(v1), null);
});

test('another contract version → unsupported, checked first (before validity and origin)', () => {
  for (const contractVersion of ['naming-role-category-vocabulary.v1', 'naming-role-category-vocabulary.v3']) {
    const intake = intakeOf({ vocabularySection: section({ contractVersion, records: 'broken' }), bridgeOrigin: 'caller-supplied' });
    assert.equal(intake.state, STATES.unsupported, contractVersion);
    assert.equal(diagnosticOf(intake).reason, REASONS.unsupportedVersion);
    assert.equal(toTreeUsableRoleCategoryVocabulary(intake), null);
  }
});

test('acceptance 5: every envelope, record and bound defect makes the whole section invalid, never a partial vocabulary', () => {
  const records = section().records;
  const cases = [
    ['missing perspective digest', section({ categoryRolePerspectiveDigest: undefined }), REASONS.invalidEnvelope],
    ['missing rolesDigest', section({ rolesDigest: undefined }), REASONS.invalidEnvelope],
    ['empty rolesDigest', section({ rolesDigest: '' }), REASONS.invalidEnvelope],
    ['missing admissibleCategories', (({ admissibleCategories, ...rest }) => rest)(section()), REASONS.invalidEnvelope],
    ['undefined admissibleCategories', section({ admissibleCategories: undefined }), REASONS.invalidAdmissibleBound],
    ['unknown registrySource', section({ registrySource: 'elsewhere' }), REASONS.invalidEnvelope],
    ['identity tuple fields present', section({ identityTupleFields: ['addressProfileId'] }), REASONS.invalidEnvelope],
    ['records not an array', section({ records: {} }), REASONS.invalidEnvelope],
    ['recordCount not an integer', section({ recordCount: '3' }), REASONS.invalidEnvelope],
    ['section not an object', null, REASONS.invalidEnvelope],
    ['empty category', section({ records: [{ category: '', roles: ['logic'] }, ...records.slice(1)] }), REASONS.invalidRecord],
    ['empty roles', section({ records: [{ category: 'concern-core', roles: [] }, ...records.slice(1)] }), REASONS.invalidRecord],
    ['unsorted roles', section({ records: [{ category: 'concern-core', roles: ['wiring', 'logic'] }, ...records.slice(1)] }), REASONS.invalidRecord],
    ['record with an identity field', section({ records: [{ ...records[0], occurrenceAddress: 'x' }, ...records.slice(1)] }), REASONS.invalidRecord],
    ['duplicate category', section({ records: [records[0], records[0], records[2]] }), REASONS.unsortedOrDuplicateCategory],
    ['count mismatch', section({ recordCount: 9 }), REASONS.recordCountMismatch],
    ['bound not an array', section({ admissibleCategories: 'concern-core' }), REASONS.invalidAdmissibleBound],
    ['unsorted bound', section({ admissibleCategories: ['documentation', 'concern-core'] }), REASONS.invalidAdmissibleBound],
    ['duplicate in bound', section({ admissibleCategories: ['concern-core', 'concern-core'] }), REASONS.invalidAdmissibleBound],
    ['non-string in bound', section({ admissibleCategories: [7] }), REASONS.invalidAdmissibleBound],
    ['empty string in bound', section({ admissibleCategories: [''] }), REASONS.invalidAdmissibleBound],
    ['bound category without a record', section({ admissibleCategories: ['concern-core', 'unknown'] }), REASONS.invalidAdmissibleBound],
  ];
  for (const [name, vocabularySection, reason] of cases) {
    const intake = intakeOf({ vocabularySection });
    assert.equal(intake.state, STATES.invalid, name);
    assert.equal(diagnosticOf(intake).reason, reason, name);
    assert.equal(intake.vocabulary, null, name);
    assert.equal(toTreeUsableRoleCategoryVocabulary(intake), null, name);
  }
});

test('acceptance 8 (module): caller-supplied with everything matching and `bridgeSource` claiming Naming → untrusted', () => {
  const intake = intakeOf({ bridgeOrigin: 'caller-supplied' });
  assert.equal(intake.state, STATES.untrusted);
  assert.equal(diagnosticOf(intake).reason, REASONS.callerSupplied);
  assert.equal(toTreeUsableRoleCategoryVocabulary(intake), null);
  for (const bridgeOrigin of [undefined, null, 'calculogic-validator/naming', 'Tree-Built']) {
    assert.equal(intakeOf({ bridgeOrigin, payloadExtras: { bridgeSource: 'tree-built' } }).state, STATES.untrusted, String(bridgeOrigin));
  }
});

test('acceptance 8 (module): a Tree-built payload whose vocabulary is not Naming-derived → untrusted, before provenance and consistency', () => {
  for (const vocabularyOrigin of ['caller-supplied', undefined, null, 'naming', 'tree-built']) {
    const intake = intakeOf({ vocabularyOrigin });
    assert.equal(intake.state, STATES.untrusted, String(vocabularyOrigin));
    assert.equal(diagnosticOf(intake).reason, REASONS.vocabularyNotNamingDerived);
    assert.equal(toTreeUsableRoleCategoryVocabulary(intake), null);
  }
  assert.equal(diagnosticOf(intakeOf({ bridgeOrigin: 'caller-supplied', vocabularyOrigin: 'naming-derived' })).reason, REASONS.callerSupplied);
});

test('invalid is decided before origin: a broken caller-supplied section is invalid, not untrusted', () => {
  assert.equal(intakeOf({ bridgeOrigin: 'caller-supplied', vocabularySection: section({ admissibleCategories: ['zzz'] }) }).state, STATES.invalid);
});

test('acceptance 7 (module): either run provenance entry unavailable, a source differing, either digest differing → mismatched', () => {
  const cases = [
    [{ perspective: null }, REASONS.runProvenanceUnavailable],
    [{ roles: null }, REASONS.runProvenanceUnavailable],
    [{ roles: { source: 'builtin', digest: '' } }, REASONS.runProvenanceUnavailable],
    [{ perspective: { source: 'custom', digest: 'digest-1' } }, REASONS.sourceMismatch],
    [{ roles: { source: 'custom', digest: 'digest-2' } }, REASONS.sourceMismatch],
    [{ perspective: { source: 'builtin', digest: 'other' } }, REASONS.digestMismatch],
    [{ roles: { source: 'builtin', digest: 'other' } }, REASONS.rolesDigestMismatch],
  ];
  for (const [options, reason] of cases) {
    const intake = intakeOf(options);
    assert.equal(intake.state, STATES.mismatched, reason);
    assert.equal(diagnosticOf(intake).reason, reason);
    assert.equal(toTreeUsableRoleCategoryVocabulary(intake), null);
  }
});

test('acceptance 9 (module): an accepted §4.5 category outside the admissible bound → inconsistent, even when declared', () => {
  const intake = intakeOf({ observed: ['concern-core', 'integration-adapter', 'deprecated', 'integration-adapter'] });
  assert.equal(intake.state, STATES.inconsistent);
  assert.deepEqual(diagnosticOf(intake), {
    section: 'naming-role-category-vocabulary',
    state: STATES.inconsistent,
    reason: REASONS.observedCategoryMissing,
    missingCategories: ['deprecated', 'integration-adapter'],
  });
  // `deprecated` alone: declared in the records but not admissible, so still inconsistent.
  assert.deepEqual(diagnosticOf(intakeOf({ observed: ['deprecated'] })).missingCategories, ['deprecated']);
  assert.equal(toTreeUsableRoleCategoryVocabulary(intake), null);
});

test('documented limit: a missing category no accepted record carries is not detected by consistency', () => {
  const intake = intakeOf({ observed: ['concern-core', 'documentation'] });
  assert.equal(intake.state, STATES.usable);
  assert.equal(toTreeUsableRoleCategoryVocabulary(intake).admissibleCategories.includes('integration-adapter'), false);
});

test('the intake record carries only its own fields, and the payload is never mutated', () => {
  const payload = { namingRoleCategoryVocabulary: section() };
  const before = JSON.stringify(payload);
  const intake = prepareTreeRoleCategoryVocabularyIntake({
    namingOccurrenceBridge: payload,
    bridgeOrigin: 'tree-built',
    vocabularyOrigin: 'naming-derived',
    runCategoryRolePerspectiveProvenance: PERSPECTIVE_PROVENANCE,
    runRolesProvenance: ROLES_PROVENANCE,
    sectionIntake: sectionIntakeWith([]),
  });
  assert.deepEqual(Object.keys(intake), ['source', 'state', 'bridgeOrigin', 'vocabularyOrigin', 'vocabulary', 'diagnostics']);
  intake.vocabulary.records[0].roles.push('x');
  intake.vocabulary.admissibleCategories.push('x');
  assert.equal(JSON.stringify(payload), before);
});

test('acceptance 13: the Tree intake imports nothing from Naming, and reads no role status or admission rule', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const imports = [...source.matchAll(/^import[^;]*from\s+'([^']+)'/gmu)].map((match) => match[1]);
  assert.deepEqual(imports, ['./tree-naming-section-intake.logic.mjs']);
  assert.ok(imports.every((specifier) => !specifier.includes('naming/src/registries/') && !specifier.includes('/naming/')));
  for (const forbidden of ['roleStatus', 'activeRoles', 'deprecated', 'classification']) {
    assert.equal(source.includes(forbidden), false, `${forbidden}: not read by the intake`);
  }
});
