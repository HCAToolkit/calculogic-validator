// Repository package expression, executable contract evidence (Tree slice spec S3.2, S3.9 E18-E21,
// S3.10; bridge contract §4.4 rule 9, §4.8, §6.5; capability inventory §3.11; calculogic-validator#157).
// Contract only, implementation-pending: the runtime has no repository package input, so these tests
// check the declared catalogue outcomes against the test-only reference walk, and that the reference
// without the section is today's runtime (tree-lexical-consumption-contract.test.mjs checks that for
// every case). The implementation slice checks its runtime against the same reference.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EMERGENT_BOUNDARY_CATALOGUE } from './fixtures/emergent-boundary-catalogue/emergent-boundary-catalogue-cases.fixture.mjs';
import { buildCatalogueCase, files } from './fixtures/semantic-home-catalogue/semantic-home-catalogue.fixture.mjs';
import {
  PACKAGE_BASIS,
  PACKAGE_ELEMENTS,
  PACKAGE_SECTION,
  PACKAGE_SECTION_VERSION,
  referenceDiscovery,
  referencePackageIdentity,
  referencePackageIntake,
  referencePackageLabelSection,
  referenceStageThreeExpression,
} from './fixtures/lexical-consumption/tree-lexical-expression-reference.fixture.mjs';
import { interpretNamingFolderLabel } from '../../naming/src/rules/naming-rule-interpret-folder-label.logic.mjs';
import { prepareNamingRuntimeInputs } from '../../naming/src/naming-validator.wiring.mjs';

const read = (relative) => fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const TREE = read('doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md');
const BRIDGE = read('doc/ValidatorSpecs/cross-cutting/naming-bridge-occurrence-identity-contract.spec.md');
const INVENTORY = read('doc/ConventionRoutines/ValidatorSuiteOwnedSharedHelpers-And-Capabilities.md');
const NL = read('doc/ValidatorSpecs/nl-config/cfg-treeStructureAdvisor.md');
const between = (text, start, end) => {
  const from = text.indexOf(start);
  assert.ok(from >= 0, start);
  const to = text.indexOf(end, from + start.length);
  return text.slice(from, to < 0 ? undefined : to);
};
const S3_2 = between(TREE, '#### S3.2 Terms', '#### S3.3');
const PACKAGE_BLOCK = between(S3_2, '**Repository package expression**', '**Provenance.**');
const SECTION_4_8 = between(BRIDGE, '### 4.8 Naming repository-package label section', '## 5. Ownership boundaries');

// Naming's real folder-label interpretation (interpretation spec §13) under the Builtin case rules: the
// operation §4.8 says Naming applies to each declared segment, unchanged.
const { caseRulesRuntime } = prepareNamingRuntimeInputs();
const interpret = (label) => interpretNamingFolderLabel(label, { caseRulesRuntime });
const sectionFor = (manifestName) => referencePackageLabelSection(referencePackageIdentity(manifestName), interpret);
const CALCULOGIC = sectionFor('@calculogic/validator');

const ALL = [...EMERGENT_BOUNDARY_CATALOGUE.cases, ...EMERGENT_BOUNDARY_CATALOGUE.companions];
const PACKAGE_CASES = ALL.filter((entry) => entry.repositoryPackage);
const PENDING = ['E18', 'E19', 'E20'];
const OPPORTUNITIES_AT_9FE8BB1 = [
  ['E18', 'validator-cli'],
  ['E19', 'validator-report'],
  ['E20', 'calculogic-validate'],
  ['E20', 'calculogic-validator'],
];
const fileSpecsOf = (entry) => entry.tree.files.flatMap(({ dir, root, count, ...options }) => files(dir, root, count, options));
const prefixKey = (prefix) => prefix.join('-');
const builtOf = (entry) => buildCatalogueCase({ files: fileSpecsOf(entry) });
const membersOf = (entry, packageSection, built = builtOf(entry)) => referenceStageThreeExpression({ built, lexicalSection: undefined, packageSection }).directories.get(entry.directory).members;
const discoveredOf = (members) => referenceDiscovery(members).map((candidate) => ({ prefix: prefixKey(candidate.prefix), members: candidate.members }));
const byName = (members, semanticName) => members.filter((member) => member.semanticName === semanticName);
const expressedOf = (member) => member.tokens.slice(0, member.length);

test('§3.11 and §4.8 reference: the fact, the producer\'s records and the consumer\'s elements', () => {
  assert.deepEqual(referencePackageIdentity('@calculogic/validator'), { scope: 'calculogic', name: 'validator' });
  assert.deepEqual(referencePackageIdentity('validator'), { scope: null, name: 'validator' });
  for (const unsupported of [undefined, null, 7, '', '@calculogic', '@/validator', '@calculogic/', '@a/b/c', 'a/b', ' validator', 'validator ']) {
    assert.equal(referencePackageIdentity(unsupported), null, `no fact for ${JSON.stringify(unsupported)}`);
  }
  assert.equal(CALCULOGIC.contractVersion, PACKAGE_SECTION_VERSION);
  assert.equal('identityTupleFields' in CALCULOGIC, false, 'a payload-level section carries no identity tuple (§4.4 rule 9)');
  assert.deepEqual(CALCULOGIC.records.map(({ element, segment, parseOutcome, labelTokens }) => ({ element, segment, parseOutcome, labelTokens })), [
    { element: 'scope', segment: 'calculogic', parseOutcome: 'parsed', labelTokens: ['calculogic'] },
    { element: 'name', segment: 'validator', parseOutcome: 'parsed', labelTokens: ['validator'] },
  ]);
  assert.deepEqual(referencePackageIntake(CALCULOGIC).elements.map(({ element, labelTokens }) => [element, labelTokens]), [['scope', ['calculogic']], ['name', ['validator']]]);
  assert.deepEqual(sectionFor('validator').records.map((record) => record.element), ['name'], 'an unscoped identity has only a name record');
  assert.equal(sectionFor('not a name'), undefined, 'no fact, no section');
  assert.deepEqual(sectionFor('@calculogic/health-check').records[1].labelTokens, ['health', 'check'], 'a segment is tokenized as a folder label is');
  const notParsed = sectionFor('@calculogic/Validator');
  assert.equal(notParsed.records[1].parseOutcome, 'not-parsed');
  assert.deepEqual(referencePackageIntake(notParsed).elements.map((element) => element.element), ['scope'], 'a not-parsed segment contributes no element');
});

test('§4.8 consumer cases: envelope and record checks in table order; dropped records contribute nothing', () => {
  const edited = (edit) => edit(structuredClone(CALCULOGIC));
  assert.equal(referencePackageIntake(undefined), null, 'absent: nothing is recorded');
  assert.equal(referencePackageIntake(null).availability, 'section-invalid');
  assert.equal(referencePackageIntake(edited((section) => ({ ...section, contractVersion: 'naming-repository-package-label.v2' }))).availability, 'section-unsupported');
  assert.equal(referencePackageIntake(edited((section) => ({ ...section, identityTupleFields: ['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress'] }))).availability, 'section-invalid');
  assert.equal(referencePackageIntake(edited((section) => ({ ...section, recordCount: 3 }))).availability, 'section-invalid');
  const cases = [
    ['invalid element', (section) => { section.records[0].element = 'version'; return section; }, ['name'], 'invalid-record-shape'],
    ['empty segment', (section) => { section.records[1].segment = ''; return section; }, ['scope'], 'invalid-record-shape'],
    ['mixed field groups', (section) => { section.records[1].notParsedReasons = ['label-empty']; return section; }, ['scope'], 'invalid-record-shape'],
    ['missing parse outcome', (section) => { delete section.records[0].parseOutcome; return section; }, ['name'], 'invalid-record-shape'],
    ['duplicate element', (section) => { section.records[0].element = 'name'; return section; }, [], 'duplicate-element'],
    ['element order', (section) => { section.records.reverse(); return section; }, [], 'element-order'],
  ];
  for (const [label, edit, remaining, problem] of cases) {
    const intake = referencePackageIntake(edited(edit));
    assert.equal(intake.availability, 'available', label);
    assert.deepEqual(intake.elements.map((element) => element.element), remaining, `${label}: elements`);
    assert.ok(intake.rejected.some((entry) => entry.problem === problem), `${label}: ${problem}`);
  }
});

test('S3.9 E18-E21: with the declared package, the reference walk discovers exactly each case\'s candidates and lineage expression', () => {
  assert.deepEqual(PACKAGE_CASES.map((entry) => entry.id), ['E18', 'E19', 'E20', 'E21']);
  for (const entry of PACKAGE_CASES) {
    assert.deepEqual(entry.repositoryPackage, { scope: 'calculogic', name: 'validator' }, entry.id);
    const section = referencePackageLabelSection(entry.repositoryPackage, interpret);
    const members = membersOf(entry, section);
    assert.equal(members.length, entry.directoryMembers, `${entry.id}: members`);
    assert.deepEqual(discoveredOf(members), entry.candidates.map((candidate) => ({ prefix: prefixKey(candidate.prefix), members: [...candidate.members].sort() })).sort((left, right) => left.prefix.localeCompare(right.prefix)), `${entry.id}: candidates`);
    for (const member of members) {
      const expected = entry.lineageExpression?.[member.semanticName] ?? entry.lineageTokens;
      assert.deepEqual(expressedOf(member), expected, `${entry.id} ${member.path}: expressed tokens`);
    }
  }
});

test('S3.9 E18-E20 are implementation-pending: without the section the reference is today\'s runtime, and `runtimeProduces` names what it discovers', () => {
  assert.deepEqual(ALL.filter((entry) => entry.implementationPending?.runtimeProduces && entry.repositoryPackage).map((entry) => entry.id), PENDING);
  for (const id of PENDING) {
    const entry = ALL.find((item) => item.id === id);
    const plain = discoveredOf(membersOf(entry, undefined)).map((candidate) => candidate.prefix);
    for (const prefix of Object.keys(entry.implementationPending.runtimeProduces)) assert.ok(plain.includes(prefix), `${id}: today's runtime discovers ${prefix}`);
  }
});

test('the four opportunities measured at 9fe8bb1, individually: each is gone or re-derived with the declared package', () => {
  const after = {
    'E18 validator-cli': 'not discovered: `cli/` continues at position 1 after the declared name',
    'E19 validator-report': 'report',
    'E20 calculogic-validate': 'validate',
    'E20 calculogic-validator': 'not discovered: the scope and the name express both tokens',
  };
  for (const [id, prefix] of OPPORTUNITIES_AT_9FE8BB1) {
    const entry = ALL.find((item) => item.id === id);
    assert.deepEqual(entry.implementationPending.runtimeProduces[prefix].outcome, 'opportunity', `${id} ${prefix}: an opportunity today`);
    const before = discoveredOf(membersOf(entry, undefined));
    const withPackage = discoveredOf(membersOf(entry, referencePackageLabelSection(entry.repositoryPackage, interpret)));
    assert.ok(before.some((candidate) => candidate.prefix === prefix), `${id} ${prefix}: discovered without the package`);
    assert.equal(withPackage.some((candidate) => candidate.prefix === prefix), false, `${id} ${prefix}: not discovered with the package`);
    const expected = after[`${id} ${prefix}`];
    if (expected.startsWith('not discovered')) continue;
    const reDerived = entry.candidates.find((candidate) => prefixKey(candidate.prefix) === expected);
    const original = before.find((candidate) => candidate.prefix === prefix);
    assert.ok(reDerived, `${id}: ${expected} is a declared candidate`);
    assert.deepEqual([...reDerived.members].sort(), original.members, `${id}: ${expected} carries the same members as ${prefix}`);
    assert.equal(reDerived.expected.outcome, 'insufficient-evidence', `${id} ${expected}: assessed without the inflated specificity`);
  }
});

// With the package declared, a member that leads with a package token elsewhere in a case's tree may
// gain an expressed token without changing any declared candidate: E2's `validator-config` in
// `doc/specs`, and E8's `validator-tree-*` in the undeclared `doc/specs/tree-owned`, whose undeclared
// `validator` and `validator-tree` become `tree`. Only the declared directory is the case's claim.
test('positive regression: every other case\'s declared candidates, E1 (`semantic-home`) included, are unchanged by the declared package', () => {
  const others = ALL.filter((entry) => !entry.repositoryPackage);
  assert.ok(others.some((entry) => entry.id === 'E1'));
  for (const entry of others) {
    const built = builtOf(entry);
    assert.deepEqual(discoveredOf(membersOf(entry, CALCULOGIC, built)), discoveredOf(membersOf(entry, undefined, built)), `${entry.id} ${entry.directory}`);
  }
  const e1 = ALL.find((entry) => entry.id === 'E1');
  const e1Members = membersOf(e1, CALCULOGIC);
  assert.ok(discoveredOf(e1Members).some((candidate) => candidate.prefix === 'semantic-home'));
  assert.equal(e1Members.some((member) => member.steps.some((step) => step.basis === PACKAGE_BASIS)), false, 'E1: no member expresses a package element');
});

test('negative: a package token anywhere but the reached position, after a folder, partial, out of order, unparsed or absent expresses nothing', () => {
  const tree = (specs) => ({ tree: { files: specs }, directory: specs[0].dir });
  const file = (dir, tokens) => ({ dir, root: tokens[0], count: 1, tokens, semanticName: tokens.join('-') });
  const expressedFor = (entry, section) => Object.fromEntries(membersOf(entry, section).map((member) => [member.semanticName, expressedOf(member)]));

  // E21: after a folder-expressed token.
  const e21 = ALL.find((entry) => entry.id === 'E21');
  assert.deepEqual(membersOf(e21, CALCULOGIC), membersOf(e21, undefined), 'E21: identical with and without the package');

  // Later positions, with no folder expressing anything.
  const later = tree([file('lib', ['alpha', 'validator', 'one']), file('lib', ['alpha', 'validator', 'two']), file('lib', ['beta', 'calculogic', 'validator'])]);
  assert.deepEqual(expressedFor(later, CALCULOGIC), { 'alpha-validator-one': [], 'alpha-validator-two': [], 'beta-calculogic-validator': [] });

  // Each element once, in order: a name before the scope expresses the name only.
  const reversed = tree([file('lib', ['validator', 'calculogic', 'one']), file('lib', ['calculogic', 'calculogic', 'two'])]);
  assert.deepEqual(expressedFor(reversed, CALCULOGIC), { 'validator-calculogic-one': ['validator'], 'calculogic-calculogic-two': ['calculogic'] });

  // A partial label never expresses: a two-token name needs both tokens.
  const partial = tree([file('lib', ['health', 'probe']), file('lib', ['health', 'check', 'probe'])]);
  assert.deepEqual(expressedFor(partial, sectionFor('@calculogic/health-check')), { 'health-probe': [], 'health-check-probe': ['health', 'check'] });

  // Unparsed segments and an absent fact change nothing.
  const plain = membersOf(later, undefined);
  for (const section of [sectionFor('@Calculogic/Validator'), sectionFor('not a name'), undefined]) assert.deepEqual(membersOf(later, section), plain);

  // Steps record the element and segment, never a folder, on the `repository-package` basis.
  const [step] = byName(membersOf(ALL.find((entry) => entry.id === 'E18'), CALCULOGIC), 'validator-cli-runner')[0].steps;
  assert.deepEqual(step, { element: 'name', segment: 'validator', basis: PACKAGE_BASIS, positions: { start: 0, end: 1 }, tokens: ['validator'] });
});

test('contract text: Tree S3.2, S3.9, S3.10, the bridge §4.4 rule 9 and §4.8, the capability inventory §3.11 and the NL note', () => {
  assert.match(TREE, /The S3\.2 repository package expression of calculogic-validator#157 is Contract only, implementation-pending\./u);
  assert.match(PACKAGE_BLOCK, /\*\*outermost\*\* lineage elements/u);
  assert.match(PACKAGE_BLOCK, /\*\*exactly, in full and in order\*\*\. A partial label never expresses\./u);
  assert.match(PACKAGE_BLOCK, new RegExp(`The basis is \`${PACKAGE_BASIS}\``, 'u'));
  assert.match(PACKAGE_BLOCK, /never applies after a lineage folder, or at any position other than the one the walk has reached/u);
  assert.match(PACKAGE_BLOCK, /Recognising a concept is not expressing it\./u);
  assert.match(PACKAGE_BLOCK, /the walk is exactly as before this amendment/u);
  assert.match(PACKAGE_BLOCK, /\*\*Implementation acceptance\*\*/u);
  for (const [id, prefix] of OPPORTUNITIES_AT_9FE8BB1) assert.ok(PACKAGE_BLOCK.includes(`\`${prefix}\``), `${id} ${prefix} named in the acceptance criteria`);
  assert.match(PACKAGE_BLOCK, /byte-identical/u);
  assert.match(TREE, /\| Unexpressed repository concept \(calculogic-validator#156, #157\) \|/u);
  assert.match(BRIDGE, /9\. \*\*Payload-level sections\*\* \(calculogic-validator#157\)\./u);
  assert.match(SECTION_4_8, new RegExp(`\\*\\*Section name:\\*\\* \`${PACKAGE_SECTION}\``, 'u'));
  assert.match(SECTION_4_8, new RegExp(`\\*\\*Contract version:\\*\\* \`${PACKAGE_SECTION_VERSION}\``, 'u'));
  assert.match(SECTION_4_8, /\*\*implementation-pending\*\*/u);
  assert.match(SECTION_4_8, /Structural Addressing is unchanged: the repository root stays a non-occurrence\./u);
  assert.deepEqual([...SECTION_4_8.matchAll(/`(scope|name)`/gu)].slice(0, 2).map((match) => match[1]), PACKAGE_ELEMENTS);
  assert.match(BRIDGE, /### 6\.5 Naming repository-package label fields \(§4\.8\)/u);
  assert.match(INVENTORY, /### 3\.11 Entry: suite-core repository package identity \(Contract, implementation-pending\)/u);
  assert.match(NL, /S3\.2 repository package expression \(calculogic-validator#157; Contract, implementation-pending\)/u);
});
