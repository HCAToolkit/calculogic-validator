// Repository package expression, executable contract evidence (Tree slice spec S3.2, S3.9 E18-E21,
// S3.10; bridge contract §4.4 rule 9, §4.8, §6.5; capability inventory §3.11; calculogic-validator#157,
// implemented by #159). The runtime path is the default one: Naming's real §4.8 projection with Naming's
// real folder-label interpreter, Tree's real §4.8 intake, then Stage 3. The test-only reference walk
// (tree-lexical-expression-reference.fixture.mjs) restates the contract independently, and the runtime
// is checked against it everywhere.
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
import { EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY } from './fixtures/emergent-boundary-catalogue/emergent-boundary-experimental-policy.fixture.mjs';
import { interpretPackageSegment, repositoryPackageBridgeSections, repositoryPackageElementsOf } from './fixtures/repository-package/repository-package.fixture.mjs';
import { prepareTreeEmergentBoundaryReasoning } from '../src/tree-emergent-boundary-reasoning.logic.mjs';
import { prepareTreeRepositoryPackageIntake, toTreeRepositoryPackageElements } from '../src/tree-repository-package-evidence.logic.mjs';
import { projectNamingRepositoryPackageLabels } from '../../naming/src/naming-repository-package-label-projection.logic.mjs';
import { toRepositoryPackageIdentity } from '../../src/core/repository-package-identity.logic.mjs';

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
const interpret = interpretPackageSegment;
const sectionFor = (manifestName) => referencePackageLabelSection(referencePackageIdentity(manifestName), interpret);
const CALCULOGIC = sectionFor('@calculogic/validator');
const CALCULOGIC_IDENTITY = { scope: 'calculogic', name: 'validator' };

const ALL = [...EMERGENT_BOUNDARY_CATALOGUE.cases, ...EMERGENT_BOUNDARY_CATALOGUE.companions];
const PACKAGE_CASES = ALL.filter((entry) => entry.repositoryPackage);
const OPPORTUNITIES_AT_9FE8BB1 = [
  ['E18', 'validator-cli'],
  ['E19', 'validator-report'],
  ['E20', 'calculogic-validate'],
  ['E20', 'calculogic-validator'],
];
// What the runtime gave for E18-E20 before calculogic-validator#159 (S3.9, "Before calculogic-validator#159"),
// formerly the cases' `implementationPending.runtimeProduces`; the runtime without package elements still
// gives exactly this.
const OPPORTUNITY = { outcome: 'opportunity', reasons: ['concentration', 'lexical-specificity', 'responsibility-diversity', 'separation-value'] };
const LOW_SPECIFICITY = { outcome: 'insufficient-evidence', reasons: ['low-specificity'] };
const BEFORE_159 = {
  E18: {
    validator: { outcome: 'insufficient-evidence', reasons: ['whole-directory-value-undetermined'] },
    'validator-cli': OPPORTUNITY,
    'validator-report': { outcome: 'insufficient-evidence', reasons: ['below-minimum-units'] },
  },
  E19: {
    validator: LOW_SPECIFICITY,
    'validator-candidate': { outcome: 'insufficient-evidence', reasons: ['below-minimum-units'] },
    'validator-candidate-policy': { outcome: 'not-an-opportunity', reasons: ['single-responsibility-unit'] },
    'validator-report': OPPORTUNITY,
    repository: LOW_SPECIFICITY,
  },
  E20: {
    calculogic: { outcome: 'insufficient-evidence', reasons: ['whole-directory-value-undetermined'] },
    'calculogic-validate': OPPORTUNITY,
    'calculogic-validator': OPPORTUNITY,
  },
};
const fileSpecsOf = (entry) => entry.tree.files.flatMap(({ dir, root, count, ...options }) => files(dir, root, count, options));
const prefixKey = (prefix) => prefix.join('-');
const builtOf = (entry, identity) => buildCatalogueCase({ files: fileSpecsOf(entry), bridgeSections: repositoryPackageBridgeSections(identity) });
const membersOf = (entry, packageSection, built = builtOf(entry)) => referenceStageThreeExpression({ built, lexicalSection: undefined, packageSection }).directories.get(entry.directory).members;
// The runtime, as on the default path: the identity's §4.8 section in the payload, Tree's intake, Stage 3.
const runtimeOf = (entry, identity) => {
  const built = builtOf(entry, identity);
  const record = prepareTreeEmergentBoundaryReasoning({
    factEvidence: built.factEvidence,
    semanticEvidence: built.semanticEvidence,
    sectionIntake: built.sectionIntake,
    semanticHomeReasoning: built.reasoning,
    policy: EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY,
    repositoryPackageElements: repositoryPackageElementsOf(built),
  });
  return { built, record };
};
const runtimeDirectory = (entry, identity) => runtimeOf(entry, identity).record.directories.find((directory) => directory.path === entry.directory);
const runtimeResults = (directory) =>
  Object.fromEntries((directory?.candidates ?? []).map((candidate) => [prefixKey(candidate.prefix), { outcome: candidate.assessment.outcome, reasons: candidate.assessment.reasons }]));
const withoutFolder = ({ folder, ...rest }) => rest;
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

test('runtime equals reference: for every catalogue case, with and without the declared package, discovery and every recorded member\'s steps', () => {
  for (const entry of ALL) {
    for (const identity of [undefined, CALCULOGIC_IDENTITY]) {
      const { built, record } = runtimeOf(entry, identity);
      const section = built.bridge.namingRepositoryPackageLabels;
      assert.equal(section === undefined, identity === undefined, `${entry.id}: the section exactly when there is a fact`);
      const reference = referenceStageThreeExpression({ built, lexicalSection: undefined, packageSection: section });
      const label = `${entry.id} (${identity ? 'package' : 'no package'})`;
      for (const directory of record.directories ?? []) {
        const members = reference.directories.get(directory.path).members;
        assert.deepEqual(directory.candidates.map((candidate) => prefixKey(candidate.prefix)), referenceDiscovery(members).map((candidate) => prefixKey(candidate.prefix)), `${label} ${directory.path}: candidates`);
        for (const member of directory.candidates.flatMap((candidate) => candidate.members)) {
          const own = members.find((item) => item.path === member.path);
          assert.deepEqual(member.lineageExpression.map(withoutFolder), own.steps, `${label} ${member.path}: steps`);
        }
      }
    }
  }
});

test('S3.9 E18-E21: the runtime discovers exactly each case\'s candidates, outcomes and lineage expression with the declared package', () => {
  assert.deepEqual(PACKAGE_CASES.map((entry) => entry.id), ['E18', 'E19', 'E20', 'E21']);
  for (const entry of PACKAGE_CASES) {
    assert.deepEqual(entry.repositoryPackage, CALCULOGIC_IDENTITY, entry.id);
    assert.equal(entry.implementationPending, undefined, `${entry.id}: an ordinary case`);
    const directory = runtimeDirectory(entry, entry.repositoryPackage);
    assert.deepEqual(
      Object.fromEntries(Object.entries(runtimeResults(directory)).sort(([left], [right]) => left.localeCompare(right))),
      Object.fromEntries(entry.candidates.map((candidate) => [prefixKey(candidate.prefix), candidate.expected]).sort(([left], [right]) => left.localeCompare(right))),
      `${entry.id}: candidates and outcomes`,
    );
    const members = membersOf(entry, referencePackageLabelSection(entry.repositoryPackage, interpret));
    assert.equal(members.length, entry.directoryMembers, `${entry.id}: members`);
    for (const member of directory.candidates.flatMap((candidate) => candidate.members)) {
      const expected = entry.lineageExpression?.[member.semanticName] ?? entry.lineageTokens;
      assert.deepEqual(member.lineageExpression.flatMap((step) => step.tokens), expected, `${entry.id} ${member.path}: expressed tokens`);
    }
  }
});

test('the four opportunities measured at 9fe8bb1, individually: before calculogic-validator#159 (no package elements) and after', () => {
  const after = {
    'E18 validator-cli': 'not discovered: `cli/` continues at position 1 after the declared name',
    'E19 validator-report': 'report',
    'E20 calculogic-validate': 'validate',
    'E20 calculogic-validator': 'not discovered: the scope and the name express both tokens',
  };
  for (const [id, results] of Object.entries(BEFORE_159)) {
    const entry = ALL.find((item) => item.id === id);
    assert.deepEqual(runtimeResults(runtimeDirectory(entry, undefined)), results, `${id}: without package elements the runtime gives exactly the pre-#159 results`);
  }
  for (const [id, prefix] of OPPORTUNITIES_AT_9FE8BB1) {
    const entry = ALL.find((item) => item.id === id);
    const before = runtimeDirectory(entry, undefined);
    const withPackage = runtimeDirectory(entry, entry.repositoryPackage);
    const original = before.candidates.find((candidate) => prefixKey(candidate.prefix) === prefix);
    assert.equal(original.assessment.outcome, 'opportunity', `${id} ${prefix}: an opportunity before`);
    assert.equal(withPackage.candidates.some((candidate) => prefixKey(candidate.prefix) === prefix), false, `${id} ${prefix}: not discovered after`);
    const expected = after[`${id} ${prefix}`];
    if (expected.startsWith('not discovered')) continue;
    const reDerived = withPackage.candidates.find((candidate) => prefixKey(candidate.prefix) === expected);
    assert.ok(reDerived, `${id}: ${expected} is discovered after`);
    assert.deepEqual(reDerived.members.map((member) => member.path).sort(), original.members.map((member) => member.path).sort(), `${id}: ${expected} carries the same member files as ${prefix}`);
    assert.equal(reDerived.assessment.outcome, 'insufficient-evidence', `${id} ${expected}: assessed without the inflated specificity`);
  }
});

// With the package declared, a member that leads with a package token elsewhere in a case's tree may
// gain an expressed token without changing any declared candidate: E2's `validator-config` in
// `doc/specs`, and E8's `validator-tree-*` in the undeclared `doc/specs/tree-owned`, whose undeclared
// `validator` and `validator-tree` become `tree`. Only the declared directory is the case's claim.
test('positive regression: every other case\'s declared candidates and outcomes, E1 (`semantic-home`) included, are unchanged by the declared package', () => {
  const others = ALL.filter((entry) => !entry.repositoryPackage);
  assert.ok(others.some((entry) => entry.id === 'E1'));
  for (const entry of others) {
    assert.deepEqual(runtimeResults(runtimeDirectory(entry, CALCULOGIC_IDENTITY)), runtimeResults(runtimeDirectory(entry, undefined)), `${entry.id} ${entry.directory}`);
  }
  const e1 = runtimeDirectory(ALL.find((entry) => entry.id === 'E1'), CALCULOGIC_IDENTITY);
  assert.equal(e1.candidates.find((candidate) => prefixKey(candidate.prefix) === 'semantic-home').assessment.outcome, 'opportunity');
  assert.equal(e1.candidates.flatMap((candidate) => candidate.members).some((member) => member.lineageExpression.some((step) => step.basis === PACKAGE_BASIS)), false, 'E1: no member expresses a package element');
});

test('negative: a package token anywhere but the reached position, after a folder, partial, out of order, unparsed or absent expresses nothing', () => {
  const tree = (specs) => ({ tree: { files: specs }, directory: specs[0].dir });
  const file = (dir, tokens) => ({ dir, root: tokens[0], count: 1, tokens, semanticName: tokens.join('-') });
  // Expressed tokens per member, from the runtime (every member of a tree with candidates is recorded
  // through some candidate here) and the reference, which must agree.
  const expressedFor = (entry, identity) => {
    const { built, record } = runtimeOf(entry, identity);
    const fromRuntime = Object.fromEntries(
      (record.directories.find((directory) => directory.path === entry.directory)?.candidates ?? []).flatMap((candidate) => candidate.members).map((member) => [member.semanticName, member.lineageExpression.flatMap((step) => step.tokens)]),
    );
    const fromReference = Object.fromEntries(
      referenceStageThreeExpression({ built, lexicalSection: undefined, packageSection: built.bridge.namingRepositoryPackageLabels }).directories.get(entry.directory).members
        .filter((member) => member.semanticName in fromRuntime)
        .map((member) => [member.semanticName, expressedOf(member)]),
    );
    assert.deepEqual(fromRuntime, fromReference, 'runtime equals reference');
    return fromRuntime;
  };

  // E21: after a folder-expressed token.
  const e21 = ALL.find((entry) => entry.id === 'E21');
  assert.deepEqual(runtimeOf(e21, CALCULOGIC_IDENTITY).record, runtimeOf(e21, undefined).record, 'E21: the Stage 3 record is identical with and without the package');

  // Later positions, with no folder expressing anything.
  const later = tree([file('lib', ['alpha', 'validator', 'one']), file('lib', ['alpha', 'validator', 'two']), file('lib', ['beta', 'calculogic', 'validator']), file('lib', ['beta', 'calculogic', 'other'])]);
  assert.deepEqual(expressedFor(later, CALCULOGIC_IDENTITY), { 'alpha-validator-one': [], 'alpha-validator-two': [], 'beta-calculogic-validator': [], 'beta-calculogic-other': [] });
  assert.deepEqual(runtimeOf(later, CALCULOGIC_IDENTITY).record, runtimeOf(later, undefined).record, 'later positions: identical records');

  // Each element once, in order: a name before the scope expresses the name only.
  const reversed = tree([file('lib', ['validator', 'calculogic', 'one']), file('lib', ['validator', 'calculogic', 'two']), file('lib', ['calculogic', 'calculogic', 'one']), file('lib', ['calculogic', 'calculogic', 'two'])]);
  assert.deepEqual(expressedFor(reversed, CALCULOGIC_IDENTITY), {
    'validator-calculogic-one': ['validator'],
    'validator-calculogic-two': ['validator'],
    'calculogic-calculogic-one': ['calculogic'],
    'calculogic-calculogic-two': ['calculogic'],
  });

  // A partial label never expresses: a two-token name needs both tokens.
  const partial = tree([
    file('lib', ['health', 'probe', 'one']),
    file('lib', ['health', 'probe', 'two']),
    file('lib', ['health', 'check', 'probe', 'one']),
    file('lib', ['health', 'check', 'probe', 'two']),
  ]);
  assert.deepEqual(expressedFor(partial, toRepositoryPackageIdentity('@calculogic/health-check')), {
    'health-probe-one': [],
    'health-probe-two': [],
    'health-check-probe-one': ['health', 'check'],
    'health-check-probe-two': ['health', 'check'],
  });

  // Unparsed segments and an absent fact change nothing: the record is identical to the one without.
  const plain = runtimeOf(later, undefined).record;
  for (const identity of [toRepositoryPackageIdentity('@Calculogic/Validator'), toRepositoryPackageIdentity('not a name'), undefined]) {
    assert.deepEqual(runtimeOf(later, identity).record, plain, JSON.stringify(identity));
  }

  // Steps record the element and segment, never a folder or occurrence, on the `repository-package` basis.
  const e18 = runtimeDirectory(ALL.find((entry) => entry.id === 'E18'), CALCULOGIC_IDENTITY);
  const runner = e18.candidates.flatMap((candidate) => candidate.members).find((member) => member.semanticName === 'validator-cli-runner');
  if (runner) assert.deepEqual(runner.lineageExpression[0], { element: 'name', segment: 'validator', basis: PACKAGE_BASIS, positions: { start: 0, end: 1 }, tokens: ['validator'] });
  for (const step of e18.candidates.flatMap((candidate) => candidate.members).flatMap((member) => member.lineageExpression).filter((item) => item.basis === PACKAGE_BASIS)) {
    assert.deepEqual(Object.keys(step).sort(), ['basis', 'element', 'positions', 'segment', 'tokens'], 'a package step names no folder, folder path or identity tuple');
  }
});

test('§4.8 runtime intake equals the reference intake for every consumer case, and only accepted parsed records become elements', () => {
  const edited = (edit) => edit(structuredClone(CALCULOGIC));
  const runtimeIntake = (section) => prepareTreeRepositoryPackageIntake({ namingOccurrenceBridge: section === undefined ? {} : { namingRepositoryPackageLabels: section } });
  const sections = [
    undefined,
    null,
    CALCULOGIC,
    sectionFor('validator'),
    sectionFor('@calculogic/Validator'),
    sectionFor('@Calculogic/Validator'),
    edited((section) => ({ ...section, contractVersion: 'naming-repository-package-label.v2' })),
    edited((section) => ({ ...section, identityTupleFields: ['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress'] })),
    edited((section) => ({ ...section, recordCount: 3 })),
    edited((section) => { section.records[0].element = 'version'; return section; }),
    edited((section) => { section.records[1].segment = ''; return section; }),
    edited((section) => { section.records[1].notParsedReasons = ['label-empty']; return section; }),
    edited((section) => { delete section.records[0].parseOutcome; return section; }),
    edited((section) => { section.records[0].element = 'name'; return section; }),
    edited((section) => { section.records.reverse(); return section; }),
    edited((section) => { section.records[1].labelRoot = 'other'; return section; }),
    // Mixed-validity duplicates: the duplicate case (row 2) precedes the segment and parse-field cases, so
    // a malformed record still makes its element a duplicate and both records are dropped.
    edited((section) => ({ ...section, recordCount: 3, records: [...section.records, { ...section.records[1], segment: '' }] })),
    edited((section) => ({ ...section, recordCount: 3, records: [...section.records, { element: 'name', segment: 'other', parseOutcome: 'bogus' }] })),
    edited((section) => ({ ...section, recordCount: 3, records: [{ ...section.records[0], labelTokens: [] }, ...section.records] })),
  ];
  for (const section of sections) {
    const reference = referencePackageIntake(section);
    const intake = runtimeIntake(section);
    const label = JSON.stringify(section)?.slice(0, 120);
    if (reference === null) {
      assert.equal(intake, null, `${label}: absent, nothing recorded`);
      continue;
    }
    assert.equal(intake.availability, reference.availability, `${label}: availability`);
    assert.deepEqual(toTreeRepositoryPackageElements(intake), reference.elements, `${label}: elements`);
    assert.deepEqual([...new Set(intake.rejectedRecords.map((record) => record.reason))].sort(), [...new Set(reference.rejected.map((record) => record.problem))].sort(), `${label}: rejection reasons`);
    assert.ok(intake.diagnostics.every((diagnostic) => diagnostic.section === 'naming-repository-package-label' && !('identityTuple' in diagnostic)), `${label}: diagnostics name the section and no occurrence`);
  }
  // A valid record with a malformed duplicate of its element is dropped with it: no `name` element.
  const mixedDuplicate = runtimeIntake(edited((section) => ({ ...section, recordCount: 3, records: [...section.records, { ...section.records[1], segment: '' }] })));
  assert.deepEqual(toTreeRepositoryPackageElements(mixedDuplicate).map((element) => element.element), ['scope']);
  assert.deepEqual(mixedDuplicate.rejectedRecords.map((record) => record.reason), ['duplicate-element', 'duplicate-element']);
  // A partly invalid section still contributes its accepted element.
  const partlyInvalid = runtimeIntake(edited((section) => { section.records[1].segment = ''; return section; }));
  assert.equal(partlyInvalid.rejectedRecords.length, 1);
  assert.deepEqual(toTreeRepositoryPackageElements(partlyInvalid), [{ element: 'scope', segment: 'calculogic', labelTokens: ['calculogic'] }]);
  // The real producer and the reference producer agree.
  for (const name of ['@calculogic/validator', 'validator', '@calculogic/Validator', '@acme/widget-kit']) {
    assert.deepEqual(projectNamingRepositoryPackageLabels({ repositoryPackageIdentity: toRepositoryPackageIdentity(name), interpretFolderLabel: interpret }), sectionFor(name), name);
    assert.deepEqual(toRepositoryPackageIdentity(name), referencePackageIdentity(name), name);
  }
});

test('contract text: Tree S1-S3, the bridge §4.4 rule 9 and §4.8, the capability inventory §3.11 and the NL, as current', () => {
  assert.match(TREE, /The S3\.2 repository package expression of calculogic-validator#157 is implemented by calculogic-validator#159\./u);
  assert.match(PACKAGE_BLOCK, /\(Contract, calculogic-validator#157; Current, calculogic-validator#159; S3\.9 cases E18–E21\)/u);
  assert.match(PACKAGE_BLOCK, /\*\*outermost\*\* lineage elements/u);
  assert.match(PACKAGE_BLOCK, /\*\*exactly, in full and in order\*\*\. A partial label never expresses\./u);
  assert.match(PACKAGE_BLOCK, new RegExp(`The basis is \`${PACKAGE_BASIS}\``, 'u'));
  assert.match(PACKAGE_BLOCK, /never applies after a lineage folder, or at any position other than the one the walk has reached/u);
  assert.match(PACKAGE_BLOCK, /Recognising a concept is not expressing it\./u);
  assert.match(PACKAGE_BLOCK, /\*\*Implementation acceptance\*\* \(met by calculogic-validator#159/u);
  for (const [id, prefix] of OPPORTUNITIES_AT_9FE8BB1) assert.ok(PACKAGE_BLOCK.includes(`\`${prefix}\``), `${id} ${prefix} named in the acceptance criteria`);
  assert.match(between(TREE, '#### S1.1', '#### S1.2'), /\*\*Repository-package label section \(Current, calculogic-validator#159; bridge contract §4\.8\)\.\*\*/u);
  assert.match(between(TREE, '#### S1.3 Evidence availability', '#### S1.4'), /byte-identical whenever \*\*no package element is accepted\*\*/u);
  assert.match(between(TREE, '#### S3.7 Output', '#### S3.8'), /\*\*Repository package steps \(Current, calculogic-validator#159\)\.\*\*/u);
  for (const id of ['E18', 'E19', 'E20']) {
    const row = between(TREE, `| ${id} | `, '\n');
    assert.doesNotMatch(row, /\*\*Implementation-pending:\*\*/u, `${id}: an ordinary case`);
    assert.match(row, /\*\*Before calculogic-validator#159\*\* the runtime gave /u, `${id}: the pre-#159 results recorded`);
  }
  assert.match(TREE, /\| Unexpressed repository concept \(calculogic-validator#156, #157\) \|/u);
  assert.match(BRIDGE, /9\. \*\*Payload-level sections\*\* \(calculogic-validator#157\)\./u);
  assert.match(SECTION_4_8, new RegExp(`\\*\\*Section name:\\*\\* \`${PACKAGE_SECTION}\``, 'u'));
  assert.match(SECTION_4_8, new RegExp(`\\*\\*Contract version:\\*\\* \`${PACKAGE_SECTION_VERSION}\``, 'u'));
  assert.match(SECTION_4_8, /\*\*Current since calculogic-validator#159:\*\*/u);
  assert.match(SECTION_4_8, /Structural Addressing is unchanged: the repository root stays a non-occurrence\./u);
  assert.deepEqual([...SECTION_4_8.matchAll(/`(scope|name)`/gu)].slice(0, 2).map((match) => match[1]), PACKAGE_ELEMENTS);
  assert.match(BRIDGE, /### 6\.5 Naming repository-package label fields \(§4\.8\)/u);
  assert.match(INVENTORY, /### 3\.11 Entry: suite-core repository package identity\n\n- \*\*Status:\*\* contract-approved by calculogic-validator#157; current since calculogic-validator#159\./u);
  assert.match(NL, /- Repository package expression \(Tree spec S1\.1–S1\.3, S3\.2, S3\.7; bridge contract §4\.8; capability inventory §3\.11; calculogic-validator#157, #159\):/u);
});
