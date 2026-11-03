// The Stage 3 evidence catalogue (Tree spec S3.9; calculogic-validator#130).
//
// What these tests verify: the catalogue's integrity against the contract, and the Stage 1 and
// Stage 2 evidence each case's expectation rests on, through the real Stage 1 preparers and Stage 2A
// reasoning (`buildCatalogueCase`).
//
// They also verify the S3.9 evidence-sufficiency record (S3.11 step 3) against the declared catalogue:
// each expected outcome is traced through the S3.6 resolution order over the case's declared files and
// member sets, and the decisive rule, the S3.8 decisions on its path and the case's status must agree
// with the record. This traces declared data; it is not Stage 3 reasoning over prepared evidence.
//
// What they do NOT verify: any Stage 3 outcome of the implemented reasoning. Those run in
// `tree-emergent-boundary-reasoning.logic.test.mjs` (S3.11 step 4), with E10's known gap and E12's
// policy-incomplete behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EMERGENT_BOUNDARY_CATALOGUE } from './fixtures/emergent-boundary-catalogue/emergent-boundary-catalogue-cases.fixture.mjs';
import { COVERAGE_SHARE_TEST_VALUES, EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY, EXPERIMENTAL_TEST_VALUES } from './fixtures/emergent-boundary-catalogue/emergent-boundary-experimental-policy.fixture.mjs';
import { buildCatalogueCase, files } from './fixtures/semantic-home-catalogue/semantic-home-catalogue.fixture.mjs';
import { EMERGENT_BOUNDARY_OUTCOMES } from '../src/tree-emergent-boundary-reasoning.knowledge.mjs';

const SPEC = fs.readFileSync(new URL('../../doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md', import.meta.url), 'utf8');
const section = (start, end) => SPEC.slice(SPEC.indexOf(start), SPEC.indexOf(end));
const S3_6 = section('#### S3.6 Outcomes', '#### S3.7');
const S3_8 = section('#### S3.8 Parameters', '#### S3.9');
const S3_9 = section('#### S3.9 Evidence catalogue', '##### Evidence sufficiency and policy dependency');
const S3_9_RECORD = section('##### Evidence sufficiency and policy dependency', '#### S3.10');
const S3_9_COMPANIONS = section('##### Companion cases', '##### Lexical-evidence companions');
const S3_9_LEXICAL = section('##### Lexical-evidence companions', '#### S3.10');
// Base cases and their S3.9 companions (calculogic-validator#138): every structural and precondition check covers both.
const ALL_CASES = [...EMERGENT_BOUNDARY_CATALOGUE.cases, ...EMERGENT_BOUNDARY_CATALOGUE.companions];

// S3.6: the closed outcome vocabulary and its reasons. `opportunity` reasons are the S3.5 dimensions.
const REASONS_BY_OUTCOME = Object.freeze({
  opportunity: ['concentration', 'lexical-specificity', 'responsibility-diversity', 'separation-value'],
  'insufficient-evidence': [
    'below-minimum-units',
    'low-specificity',
    'corresponding-home-unresolved',
    'responsibility-evidence-insufficient',
    'low-coverage',
    'member-placement-unresolved',
    'internal-boundary-deferred',
    'competing-candidate-unresolved',
    'whole-directory-value-undetermined',
  ],
  'explained-by-existing-structure': [],
  'not-an-opportunity': ['single-responsibility-unit', 'redundant-with'],
});
// S3.4. Under V0 prefix discovery `competing` cannot arise, so no case may record it.
const V0_RELATIONS = ['nested-subgroup', 'redundant', 'disjoint'];
// S3.6 outcome resolution: the order, and the rule each decisive reason belongs to.
// (`competing-candidate-unresolved` has no position under V0.)
const RESOLUTION_ORDER = [
  'existing-structure',
  'coverage',
  'single-responsibility',
  'redundancy',
  'whole-directory',
  'specificity',
  'minimum-units',
  'partial-evidence',
  'opportunity',
];
const RULE_OF_REASON = Object.freeze({
  'corresponding-home-unresolved': 'existing-structure',
  'internal-boundary-deferred': 'existing-structure',
  'low-coverage': 'coverage',
  'single-responsibility-unit': 'single-responsibility',
  'redundant-with': 'redundancy',
  'whole-directory-value-undetermined': 'whole-directory',
  'low-specificity': 'specificity',
  'below-minimum-units': 'minimum-units',
  'member-placement-unresolved': 'partial-evidence',
  'responsibility-evidence-insufficient': 'partial-evidence',
});
const ruleOf = ({ outcome, reasons }) => {
  if (outcome === 'opportunity') return 'opportunity';
  if (outcome === 'explained-by-existing-structure') return 'existing-structure';
  return RULE_OF_REASON[reasons[0]];
};
// S3.8: the provisional decisions under `emergent-boundary-experimental` v1, from the policy fixture
// the reasoning tests run under (bound to the S3.8 table below).
const POLICY_DECISIONS = EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY.decisions;
const EXPERIMENTAL_POLICY = Object.freeze({
  minimumPrimaryUnits: POLICY_DECISIONS['minimum-primary-units'].value,
  // The E14/E15 point (S3.5, contract): at least four supported primary units and at most one in five outside.
  partialEvidencePoint: { supportedPrimaryUnits: 4, outsideShare: 1 / 5 },
});
const UNRESOLVED_DECISIONS = Object.keys(POLICY_DECISIONS).filter((id) => POLICY_DECISIONS[id].status === 'unresolved');
// S3.5 provisional responsibility-class mapping (S3.8); `documentation` is primary in an all-documentation grouping.
const PRIMARY_CATEGORIES = new Set(POLICY_DECISIONS['responsibility-class-mapping'].value.primary);
const SUPPORTING_CATEGORIES = new Set(POLICY_DECISIONS['responsibility-class-mapping'].value.supporting);

// S3.2: a member's declared lineage-expressed tokens, per member where a case gives them.
const lineageOf = (entry, item) => entry.lineageExpression?.[item.semanticName] ?? entry.lineageTokens;

// The tree's files in the order `buildCatalogueCase` builds them, each with its path and N1 tokens.
const expandFiles = (tree) => {
  const expanded = tree.files.flatMap(({ dir, root, count, ...options }) => files(dir, root, count, options));
  return expanded.map((entry, index) => ({
    ...entry,
    path: entry.dir ? `${entry.dir}/${entry.root}-${index}.logic.mjs` : `${entry.root}-${index}.logic.mjs`,
    semanticName: entry.semanticName ?? `${entry.root}-item`,
  }));
};
const prefixKey = (prefix) => prefix.join('-');

test('integrity: the table names the S3.9 catalogue, version and cases, in order', () => {
  assert.match(S3_9, /Catalogue `emergent-boundary-catalogue`, version `1`\./u);
  assert.equal(EMERGENT_BOUNDARY_CATALOGUE.id, 'emergent-boundary-catalogue');
  assert.equal(EMERGENT_BOUNDARY_CATALOGUE.version, '1');
  const specIds = [...S3_9.matchAll(/^\| (E\d+) \|/gmu)].map((match) => match[1]);
  assert.deepEqual([...S3_9_RECORD.matchAll(/^\| (E\d+) \|/gmu)].map((match) => match[1]), specIds, 'the sufficiency record has one row per case');
  assert.deepEqual(specIds, Array.from({ length: EMERGENT_BOUNDARY_CATALOGUE.cases.length }, (_, index) => `E${index + 1}`));
  assert.deepEqual(
    EMERGENT_BOUNDARY_CATALOGUE.cases.map((entry) => entry.id),
    specIds,
  );
});

test('integrity: the known-gap marker is on exactly the case S3.9 names, with both outcomes and the cause', () => {
  const specKnownGaps = [...S3_9.matchAll(/^\| (E\d+) \|.*Known discrepancy \(known-gap case\)/gmu)].map((match) => match[1]);
  const tableKnownGaps = EMERGENT_BOUNDARY_CATALOGUE.cases.filter((entry) => entry.knownGap).map((entry) => entry.id);
  assert.deepEqual(tableKnownGaps, specKnownGaps);
  assert.deepEqual(tableKnownGaps, ['E10']);
  for (const entry of EMERGENT_BOUNDARY_CATALOGUE.cases.filter((candidateCase) => candidateCase.knownGap)) {
    const gap = entry.knownGap;
    const candidate = entry.candidates.find((item) => prefixKey(item.prefix) === gap.candidate);
    assert.ok(candidate, `${entry.id}: the known gap names a candidate of the case`);
    // The expected outcome is what correct reasoning concludes, never the rules' result.
    assert.deepEqual(gap.expected, candidate.expected, `${entry.id}: the candidate keeps the correct expected outcome`);
    assert.notEqual(gap.rulesWouldProduce.outcome, gap.expected.outcome, `${entry.id}: a known gap records a real discrepancy`);
    assert.ok(gap.cause.length > 0, `${entry.id}: the cause is recorded`);
  }
});

test('integrity: every expected outcome and reason comes from the S3.6 vocabulary', () => {
  for (const entry of ALL_CASES) {
    for (const candidate of entry.candidates) {
      const label = `${entry.id} ${prefixKey(candidate.prefix)}`;
      const { outcome, reasons, home } = candidate.expected;
      assert.ok(Object.hasOwn(REASONS_BY_OUTCOME, outcome), `${label}: outcome ${outcome}`);
      for (const reason of reasons) assert.ok(REASONS_BY_OUTCOME[outcome].includes(reason), `${label}: reason ${reason} for ${outcome}`);
      if (outcome === 'explained-by-existing-structure') assert.ok(home, `${label}: an explained candidate names its home`);
      else assert.ok(reasons.length > 0, `${label}: the outcome carries a reason`);
    }
  }
});

test('integrity: candidates are the focus directory\'s files carrying the prefix, with at least two files', () => {
  for (const entry of ALL_CASES) {
    const inDirectory = expandFiles(entry.tree).filter((item) => item.dir === entry.directory && Array.isArray(item.tokens));
    if (entry.directoryMembers !== undefined) {
      // S3.2: a member is a file occurrence with an evaluated identity, so occurrences are counted, not names.
      assert.equal(inDirectory.length, entry.directoryMembers, `${entry.id}: the focus directory has the member occurrences S3.9 states`);
    }
    const prefixes = entry.candidates.map((candidate) => prefixKey(candidate.prefix));
    assert.equal(new Set(prefixes).size, prefixes.length, `${entry.id}: one candidate per prefix`);
    for (const candidate of entry.candidates) {
      const label = `${entry.id} ${prefixKey(candidate.prefix)}`;
      // A member's leading tokens: its own lineage-expressed tokens (S3.2), then the prefix.
      const carriers = inDirectory.filter((item) => [...lineageOf(entry, item), ...candidate.prefix].every((token, index) => item.tokens[index] === token));
      assert.deepEqual(
        [...new Set(carriers.map((item) => item.semanticName))].sort(),
        [...candidate.members].sort(),
        `${label}: members are exactly the directory's files whose tokens begin with the lineage tokens and the prefix`,
      );
      assert.ok(carriers.length >= 2, `${label}: S3.3 needs at least two member files`);
      if (candidate.memberSets) {
        const { supported, conflicting, unresolved } = candidate.memberSets;
        assert.deepEqual([...supported, ...conflicting, ...unresolved].sort(), [...candidate.members].sort(), `${label}: the member sets partition the members`);
      }
      for (const relation of candidate.relations ?? []) {
        assert.ok(prefixes.includes(relation.to), `${label}: relation to ${relation.to} names a candidate of the case`);
        assert.ok(V0_RELATIONS.includes(relation.relation), `${label}: relation ${relation.relation} is reachable under V0`);
      }
    }
  }
});

test('integrity: a case with lineage tokens shows them expressed by a lineage folder (a root match)', () => {
  for (const entry of ALL_CASES.filter((candidateCase) => candidateCase.lineageTokens.length > 0)) {
    const allMembers = new Set(entry.candidates.flatMap((candidate) => candidate.members));
    const covering = (entry.preconditions.rootComparisons ?? []).some(
      (comparison) => comparison.result === 'match' && [...allMembers].every((name) => comparison.names.includes(name)),
    );
    assert.ok(covering, `${entry.id}: a root-match precondition covers every member`);
  }
});

test('integrity: every member\'s declared lineage-expressed tokens are a leading part of its own tokens (S3.2)', () => {
  for (const entry of ALL_CASES) {
    for (const item of expandFiles(entry.tree).filter((member) => member.dir === entry.directory && Array.isArray(member.tokens))) {
      const lineage = lineageOf(entry, item);
      assert.deepEqual(item.tokens.slice(0, lineage.length), lineage, `${entry.id} ${item.semanticName}: declared lineage ${lineage.join('-')}`);
    }
  }
});

test('integrity: S3.2 positional cases discover exactly their declared candidates over the declared lineage expression', () => {
  // Discovery recomputed from the declared per-member lineage (S3.3): every residual prefix carried by at
  // least two member files, and nothing else.
  for (const entry of ALL_CASES.filter((candidateCase) => candidateCase.lineageExpression || candidateCase.preconditions?.positionalLabels)) {
    const members = expandFiles(entry.tree).filter((item) => item.dir === entry.directory && Array.isArray(item.tokens));
    const counts = new Map();
    for (const item of members) {
      const residual = item.tokens.slice(lineageOf(entry, item).length);
      for (let length = 1; length <= residual.length; length += 1) counts.set(prefixKey(residual.slice(0, length)), (counts.get(prefixKey(residual.slice(0, length))) ?? 0) + 1);
    }
    const discovered = [...counts].filter(([, count]) => count >= 2).map(([key]) => key).sort();
    assert.deepEqual(discovered, entry.candidates.map((candidate) => prefixKey(candidate.prefix)).sort(), `${entry.id}: discovery over the declared lineage expression`);
  }
});

test('integrity: the implementation-pending marker is on exactly the cases S3.9 names, with a recorded runtime result', () => {
  const specCases = [...S3_9.matchAll(/^\| (E\d+) \|.*\*\*Implementation-pending:\*\*/gmu)].map((match) => match[1]);
  assert.deepEqual(EMERGENT_BOUNDARY_CATALOGUE.cases.filter((entry) => entry.implementationPending).map((entry) => entry.id), specCases);
  // E16 and E17 were reclassified when calculogic-validator#144 implemented S3.2, and E18-E20 when
  // calculogic-validator#159 implemented repository package expression. No base case is pending.
  assert.deepEqual(specCases, []);
  for (const entry of EMERGENT_BOUNDARY_CATALOGUE.cases.filter((candidateCase) => candidateCase.implementationPending)) {
    assert.ok(Object.keys(entry.implementationPending.runtimeProduces).length > 0, `${entry.id}: today's runtime result is recorded`);
  }
});

test('integrity: outcomes at tested values cover exactly the declared tested values, for the case\'s unresolved decisions and candidates', () => {
  // One declaration: the test-only list beside the experimental policy, never a copy here.
  assert.deepEqual(EXPERIMENTAL_TEST_VALUES, { 'coverage-share': COVERAGE_SHARE_TEST_VALUES });
  assert.ok(Object.isFrozen(COVERAGE_SHARE_TEST_VALUES), 'the declaration is immutable');
  assert.equal(EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY.decisions['coverage-share'].status, 'unresolved', 'declaring tested values adopts none');
  assert.match(S3_9, /`COVERAGE_SHARE_TEST_VALUES`: 0\.1, 0\.25, 0\.5 for `coverage-share`/u, 'S3.9 cites the declaration');
  assert.deepEqual([...COVERAGE_SHARE_TEST_VALUES], [0.1, 0.25, 0.5]);
  const withRecord = EMERGENT_BOUNDARY_CATALOGUE.cases.filter((entry) => entry.policyIncomplete?.outcomesAtTestedValues);
  assert.deepEqual(withRecord.map((entry) => entry.id), ['E22']);
  for (const entry of withRecord) {
    const { candidates, unresolvedDecisions, outcomesAtTestedValues } = entry.policyIncomplete;
    for (const [decision, entries] of Object.entries(outcomesAtTestedValues)) {
      assert.ok(unresolvedDecisions.includes(decision), `${entry.id}: ${decision} is one of the case's unresolved decisions`);
      assert.ok(EXPERIMENTAL_TEST_VALUES[decision], `${entry.id}: ${decision} has declared tested values`);
      assert.deepEqual(entries.map((item) => item.value), [...EXPERIMENTAL_TEST_VALUES[decision]], `${entry.id} ${decision}: every declared value, in order, and no other`);
      for (const { value, outcomes } of entries) {
        assert.deepEqual(Object.keys(outcomes).sort(), [...candidates].sort(), `${entry.id} ${decision}=${value}: one outcome per policy-incomplete candidate`);
        for (const outcome of Object.values(outcomes)) assert.ok(Object.values(EMERGENT_BOUNDARY_OUTCOMES).includes(outcome.outcome) && Array.isArray(outcome.reasons), `${entry.id} ${decision}=${value}: an outcome with reasons`);
      }
    }
    assert.ok(Object.keys(outcomesAtTestedValues).length > 0);
  }
  // The record is evidence, never the expected outcome: E22's expectations stay E8.1's.
  const e22 = EMERGENT_BOUNDARY_CATALOGUE.cases.find((entry) => entry.id === 'E22');
  for (const prefix of e22.policyIncomplete.candidates) {
    assert.deepEqual(e22.candidates.find((candidate) => prefixKey(candidate.prefix) === prefix).expected, { outcome: 'insufficient-evidence', reasons: ['low-coverage'] }, `E22 ${prefix}: expected as E8.1`);
  }
});

test('integrity: E22 is an independent measured base case related to E8, which, E8.1 and E12 are unchanged by it', () => {
  const byId = Object.fromEntries([...EMERGENT_BOUNDARY_CATALOGUE.cases, ...EMERGENT_BOUNDARY_CATALOGUE.companions].map((entry) => [entry.id, entry]));
  assert.equal(byId.E22.relatedTo, 'E8');
  assert.equal(byId.E22.companionOf, undefined, 'not a companion');
  assert.equal(byId.E8.policyIncomplete, undefined);
  assert.equal(byId['E8.1'].policyIncomplete.outcomesAtTestedValues, undefined, 'E8.1 keeps its record');
  assert.equal(byId.E12.policyIncomplete.outcomesAtTestedValues, undefined, 'E12 keeps its record');
  // The measured subgroup: five of E8's eight `tree-known-roots` specs share `retirement`, which E8 replaces
  // with distinct fourth tokens on purpose; E22 keeps them, so it cannot extend E8 unchanged.
  const knownRootsOf = (entry) => expandFiles(entry.tree).filter((item) => item.dir === 'doc/specs' && item.tokens?.slice(0, 3).join('-') === 'tree-known-roots');
  assert.equal(knownRootsOf(byId.E22).filter((item) => item.tokens[3] === 'retirement').length, 5);
  assert.equal(knownRootsOf(byId.E8).filter((item) => item.tokens[3] === 'retirement').length, 0);
});

test('integrity: the policy-incomplete marker is on exactly the cases S3.9 names, for unresolved decisions only', () => {
  const specCases = [...S3_9.matchAll(/^\| (E\d+) \|.*\*\*Policy-incomplete case:\*\*/gmu)].map((match) => match[1]);
  const tableCases = EMERGENT_BOUNDARY_CATALOGUE.cases.filter((entry) => entry.policyIncomplete).map((entry) => entry.id);
  assert.deepEqual(tableCases, specCases);
  assert.deepEqual(tableCases, ['E12', 'E22']);
  for (const entry of EMERGENT_BOUNDARY_CATALOGUE.cases.filter((candidateCase) => candidateCase.policyIncomplete)) {
    const { candidates, unresolvedDecisions, cause } = entry.policyIncomplete;
    assert.ok(!entry.knownGap, `${entry.id}: a policy-incomplete case is not a known gap`);
    for (const prefix of candidates) assert.ok(entry.candidates.some((item) => prefixKey(item.prefix) === prefix), `${entry.id}: ${prefix} is a candidate`);
    for (const decision of unresolvedDecisions) assert.ok(UNRESOLVED_DECISIONS.includes(decision), `${entry.id}: ${decision} is unresolved in the experimental policy`);
    assert.ok(cause.length > 0, `${entry.id}: the cause is recorded`);
  }
});

test('integrity: S3.6 states the resolution order, and S3.8 the experimental policy\'s decisions', () => {
  assert.deepEqual([...S3_6.matchAll(/^\d+\. \*\*`([a-z-]+)`\*\*/gmu)].map((match) => match[1]), RESOLUTION_ORDER);
  assert.match(S3_8, /under `emergent-boundary-experimental`, version `1`/u);
  const rows = Object.fromEntries([...S3_8.matchAll(/^\| `([a-z-]+)` \| ([^|]+) \|/gmu)].map((match) => [match[1], match[2].trim()]));
  assert.deepEqual(Object.keys(rows), [
    'minimum-primary-units',
    'one-word-prefix',
    'responsibility-class-mapping',
    'separation-value-limit',
    'coverage-share',
    'partial-evidence-aggregation',
    'opportunity-selection',
  ]);
  assert.deepEqual(Object.keys(POLICY_DECISIONS), Object.keys(rows), 'the policy fixture states every S3.8 decision');
  assert.equal(rows['minimum-primary-units'], String(EXPERIMENTAL_POLICY.minimumPrimaryUnits));
  assert.match(rows['one-word-prefix'], /^no allowance/u);
  assert.equal(POLICY_DECISIONS['one-word-prefix'].value, 'no-allowance');
  assert.equal(rows['separation-value-limit'], `\`${POLICY_DECISIONS['separation-value-limit'].value}\``);
  assert.deepEqual(UNRESOLVED_DECISIONS, ['coverage-share', 'partial-evidence-aggregation', 'opportunity-selection']);
  // `partial-evidence-aggregation` is unresolved beyond the S3.5 point; the others plainly so.
  for (const decision of UNRESOLVED_DECISIONS) assert.match(rows[decision], /^unresolved/u, `${decision} is unresolved`);
});

// S3.6 coverage: conclusion invariance under admissible completions. Walks the resolution order from
// single responsibility, applying each rule's invariance condition with `k` unrecognized files, up to the
// rule that decides under current evidence, and returns the rules whose application could vary.
// (Existing structure precedes coverage and is invariant, so it is never reached here.)
const invarianceVariantRules = ({ candidate, primaryUnits: P, supported, candidateFiles, memberFiles, unrecognized: k }) => {
  const n = candidateFiles.length;
  const O = n - supported.length;
  const minimum = EXPERIMENTAL_POLICY.minimumPrimaryUnits;
  // v1 leaves documentation in a mixed grouping unresolved, so some joining category always can.
  const joinerCanLeaveClassUnresolved = POLICY_DECISIONS['responsibility-class-mapping'].value.documentation === 'primary-in-documentation-grouping';
  const variant = [];
  const steps = [
    { rule: 'single-responsibility', varies: !(P >= 2 && !joinerCanLeaveClassUnresolved), applies: P === 1 },
    { rule: 'redundancy', varies: (candidate.relations ?? []).some((relation) => relation.relation === 'redundant'), applies: (candidate.relations ?? []).some((relation) => relation.relation === 'redundant') },
    { rule: 'whole-directory', varies: supported.length === memberFiles.length, applies: supported.length === memberFiles.length },
    { rule: 'specificity', varies: false, applies: candidate.prefix.length === 1 },
    { rule: 'minimum-units', varies: !(P >= minimum || P + k < minimum), applies: P < minimum },
    {
      rule: 'partial-evidence',
      // Every completion passes, or (only with a member already outside) every completion fails.
      varies: !((P >= 4 && 5 * (O + k) <= n + k) || (O > 0 && (P + k < 4 || 5 * O > n + k))),
      applies: false,
    },
  ];
  for (const step of steps) {
    if (step.varies) variant.push(step.rule);
    if (step.applies) break;
  }
  return variant;
};

// The S3.6 resolution path of one candidate over its declared files and member sets: the decisive rule
// and the S3.8 decisions on the path (S3.9 record). `existing-structure` rests on Stage 2 evidence the
// preconditions check, so it is taken from the expectation. `incomplete` means an unresolved decision
// is needed before any rule applies.
const tracePath = (entry, candidate) => {
  const inDirectory = expandFiles(entry.tree).filter((item) => item.dir === entry.directory);
  const memberFiles = inDirectory.filter((item) => Array.isArray(item.tokens));
  const candidateFiles = memberFiles.filter((item) => candidate.members.includes(item.semanticName));
  const supportedNames = candidate.memberSets?.supported ?? candidate.members;
  const supported = memberFiles.filter((item) => supportedNames.includes(item.semanticName));
  const dependsOn = new Set();
  const result = (rule) => ({ rule, incomplete: rule === null, dependsOn: [...dependsOn].sort() });

  if (ruleOf(candidate.expected) === 'existing-structure') return result('existing-structure');
  const allDocumentation = supported.every((item) => item.roleCategory === 'documentation');
  const classOf = (item) => {
    const category = item.roleCategory ?? 'concern-core';
    if (PRIMARY_CATEGORIES.has(category) || (category === 'documentation' && allDocumentation)) return 'primary';
    if (SUPPORTING_CATEGORIES.has(category)) return 'supporting';
    // A mixed grouping's documentation, or no category: no catalogue case reaches it.
    throw new Error(`${entry.id} ${prefixKey(candidate.prefix)}: unresolved responsibility class for ${item.semanticName}`);
  };
  const primaryUnits = new Set(supported.filter((item) => classOf(item) === 'primary').map((item) => item.semanticName)).size;
  const unrecognized = inDirectory.length - memberFiles.length;
  if (unrecognized > 0) {
    const variantRules = invarianceVariantRules({ candidate, primaryUnits, supported, candidateFiles, memberFiles, unrecognized });
    if (variantRules.length > 0) {
      dependsOn.add('coverage-share');
      return { ...result(null), variantRules };
    }
  }
  dependsOn.add('responsibility-class-mapping');
  if (primaryUnits === 1) return result('single-responsibility');
  if ((candidate.relations ?? []).some((relation) => relation.relation === 'redundant')) return result('redundancy');
  if (supported.length === memberFiles.length) return result('whole-directory');
  if (candidate.prefix.length === 1) {
    dependsOn.add('one-word-prefix');
    return result('specificity');
  }
  dependsOn.add('minimum-primary-units');
  if (primaryUnits < EXPERIMENTAL_POLICY.minimumPrimaryUnits) return result('minimum-units');
  const outside = candidateFiles.length - supported.length;
  if (outside > 0) {
    dependsOn.add('partial-evidence-aggregation');
    const point = EXPERIMENTAL_POLICY.partialEvidencePoint;
    if (primaryUnits < point.supportedPrimaryUnits || outside / candidateFiles.length > point.outsideShare) return result(null);
  }
  dependsOn.add('separation-value-limit');
  return result('opportunity');
};

test('integrity: a redundant relation names the more specific candidate with the same members', () => {
  for (const entry of ALL_CASES) {
    for (const candidate of entry.candidates) {
      for (const relation of (candidate.relations ?? []).filter((item) => item.relation === 'redundant')) {
        const other = entry.candidates.find((item) => prefixKey(item.prefix) === relation.to);
        const label = `${entry.id} ${prefixKey(candidate.prefix)}`;
        assert.ok(other.prefix.length > candidate.prefix.length && candidate.prefix.every((token, index) => other.prefix[index] === token), `${label}: ${relation.to} extends it`);
        assert.deepEqual([...other.members].sort(), [...candidate.members].sort(), `${label}: same members as ${relation.to}`);
      }
    }
  }
});

test('integrity: companion cases match the S3.9 companion table, each extending its base case', () => {
  const rows = [...S3_9_COMPANIONS.matchAll(/^\| (E\d+\.\d+) \| (E\d+) \|(.*)$/gmu)].map((match) => ({ id: match[1], base: match[2], text: match[3] }));
  assert.deepEqual(
    EMERGENT_BOUNDARY_CATALOGUE.companions.map((entry) => [entry.id, entry.companionOf]),
    rows.map((row) => [row.id, row.base]),
  );
  for (const entry of EMERGENT_BOUNDARY_CATALOGUE.companions) {
    const row = rows.find((item) => item.id === entry.id);
    const base = EMERGENT_BOUNDARY_CATALOGUE.cases.find((item) => item.id === entry.companionOf);
    // The companion adds the measured condition to its base case's tree; the base case is not rewritten.
    assert.deepEqual(entry.tree.files.slice(0, base.tree.files.length), base.tree.files, `${entry.id}: extends ${base.id}'s tree`);
    assert.ok(entry.tree.files.length > base.tree.files.length, `${entry.id}: adds a condition`);
    assert.deepEqual(entry.candidates.map((candidate) => prefixKey(candidate.prefix)), base.candidates.map((candidate) => prefixKey(candidate.prefix)), `${entry.id}: the base case's candidates`);
    assert.equal(Boolean(entry.knownGap), row.text.includes('Known discrepancy (known-gap case)'), `${entry.id}: known-gap marker`);
    assert.equal(Boolean(entry.policyIncomplete), row.text.includes('**Policy-incomplete case:**'), `${entry.id}: policy-incomplete marker`);
    assert.equal(Boolean(entry.implementationPending), row.text.includes('**Implementation-pending:**'), `${entry.id}: implementation-pending marker`);
    for (const prefix of Object.keys(entry.implementationPending?.runtimeProduces ?? {})) {
      assert.ok(entry.candidates.some((candidate) => prefixKey(candidate.prefix) === prefix), `${entry.id}: ${prefix} is a candidate`);
    }
  }
});

test('S3.6 invariance bound: E8.1 and E12 vary for the recorded rules, and the rejected three-completion shortcut would not', () => {
  const byId = Object.fromEntries(ALL_CASES.map((entry) => [entry.id, entry]));
  const traced = (id, prefix) => tracePath(byId[id], byId[id].candidates.find((candidate) => prefixKey(candidate.prefix) === prefix));
  // E8.1: a joining file could make either documentation grouping mixed; for `tree-known` it could also break redundancy.
  assert.deepEqual(traced('E8.1', 'tree-known-roots').variantRules, ['single-responsibility']);
  assert.deepEqual(traced('E8.1', 'tree-known').variantRules, ['single-responsibility', 'redundancy']);
  assert.deepEqual(traced('E12', 'widget-panel').variantRules, ['single-responsibility', 'whole-directory']);
  // The shortcut (absent; joining as unresolved with its partners; joining alone) would call `tree-known-roots`
  // invariant: with one unresolved joiner it is still 8 units and 1 file in 9, within the S3.5 point.
  const [P, n, k] = [8, 8, 1];
  const shortcutCompletionsPass = [0, k].every((joiners) => P >= 4 && 5 * joiners <= n + joiners);
  assert.equal(shortcutCompletionsPass, true);
});

test('sufficiency record: every expected outcome follows the S3.6 resolution order, with the recorded rules, decisions and status', () => {
  const recordRows = Object.fromEntries(
    [...S3_9_RECORD.matchAll(/^\| (E\d+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/gmu)].map((match) => [
      match[1],
      { status: match[2].trim(), rules: match[3].trim(), decisions: [...match[4].matchAll(/`([a-z-]+)`/gu)].map((item) => item[1]).sort() },
    ]),
  );
  for (const entry of EMERGENT_BOUNDARY_CATALOGUE.cases) {
    const decisions = new Set();
    const rules = new Set();
    for (const candidate of entry.candidates) {
      const label = `${entry.id} ${prefixKey(candidate.prefix)}`;
      const traced = tracePath(entry, candidate);
      traced.dependsOn.forEach((decision) => decisions.add(decision));
      const expectedRule = ruleOf(candidate.expected);
      assert.ok(RESOLUTION_ORDER.includes(expectedRule), `${label}: the expected reason belongs to a rule`);
      if (entry.knownGap?.candidate === prefixKey(candidate.prefix)) {
        // A known gap: the rules reach what the gap records, never the expected outcome.
        assert.equal(traced.rule, ruleOf(entry.knownGap.rulesWouldProduce), `${label}: the rules reach the recorded discrepancy`);
        assert.notEqual(traced.rule, expectedRule, `${label}: the discrepancy is real`);
        rules.add(traced.rule);
      } else if (entry.policyIncomplete?.candidates.includes(prefixKey(candidate.prefix))) {
        assert.ok(traced.incomplete, `${label}: the assessment is incomplete`);
        assert.deepEqual(traced.dependsOn, [...entry.policyIncomplete.unresolvedDecisions].sort(), `${label}: incomplete for exactly the recorded decisions`);
        // The expected outcome's rule is the one the missing decision blocks.
        assert.equal(expectedRule, 'coverage', `${label}: the blocked rule is the expected one`);
      } else {
        assert.ok(!traced.incomplete, `${label}: the assessment completes under the experimental policy`);
        assert.equal(traced.rule, expectedRule, `${label}: the resolution order reaches the expected outcome`);
      }
      rules.add(expectedRule);
    }
    const row = recordRows[entry.id];
    assert.ok(row, `${entry.id}: a sufficiency record row`);
    const status = entry.knownGap ? 'evaluable, known gap' : entry.policyIncomplete ? 'policy-incomplete' : 'evaluable';
    assert.equal(row.status, status, `${entry.id}: status`);
    assert.deepEqual(row.decisions, [...decisions].sort(), `${entry.id}: the decisions on the candidates' paths`);
    const reference = row.rules.match(/^as (E\d+)$/u);
    const rulesText = reference ? recordRows[reference[1]].rules : row.rules;
    for (const rule of rules) assert.ok(rulesText.includes(`\`${rule}\``), `${entry.id}: the record names rule ${rule}`);
    for (const candidate of entry.candidates) assert.ok(rulesText.includes(`\`${prefixKey(candidate.prefix)}\``), `${entry.id}: the record names ${prefixKey(candidate.prefix)}`);
  }
});

test('sufficiency record, companion cases: the recorded rules, decisions and status follow the amended S3.5 and S3.6', () => {
  const recordRows = Object.fromEntries(
    [...S3_9_COMPANIONS.matchAll(/^\| (E\d+\.\d+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/gmu)]
      .filter((match) => !/^E\d+$/u.test(match[2].trim()))
      .map((match) => [match[1], { status: match[2].trim(), rules: match[3].trim(), decisions: [...match[4].matchAll(/`([a-z-]+)`/gu)].map((item) => item[1]).sort() }]),
  );
  for (const entry of EMERGENT_BOUNDARY_CATALOGUE.companions) {
    const decisions = new Set();
    const row = recordRows[entry.id];
    assert.ok(row, `${entry.id}: a record row`);
    for (const candidate of entry.candidates) {
      const label = `${entry.id} ${prefixKey(candidate.prefix)}`;
      const traced = tracePath(entry, candidate);
      traced.dependsOn.forEach((decision) => decisions.add(decision));
      if (entry.knownGap?.candidate === prefixKey(candidate.prefix)) {
        assert.equal(traced.rule, ruleOf(entry.knownGap.rulesWouldProduce), `${label}: the amended rules reach the recorded discrepancy`);
      } else if (entry.policyIncomplete?.candidates.includes(prefixKey(candidate.prefix))) {
        assert.ok(traced.incomplete, `${label}: incomplete`);
        assert.deepEqual(traced.dependsOn, entry.policyIncomplete.unresolvedDecisions, `${label}: for exactly the recorded decisions`);
      } else {
        assert.equal(traced.rule, ruleOf(candidate.expected), `${label}: the amended rules reach the expected outcome`);
      }
      assert.ok(row.rules.includes(`\`${prefixKey(candidate.prefix)}\``), `${label}: named in the record`);
    }
    const status = entry.knownGap ? 'evaluable, known gap' : entry.policyIncomplete ? 'policy-incomplete' : 'evaluable';
    assert.equal(row.status, status, `${entry.id}: status`);
    assert.deepEqual(row.decisions, [...decisions].sort(), `${entry.id}: decisions`);
  }
});

// Stage 1 and Stage 2 preconditions, through the real implementation.
const checkPreconditions = (entry) => {
  const expanded = expandFiles(entry.tree);
  const built = buildCatalogueCase({ files: expanded.map(({ path, ...spec }) => spec) });
  // Names select files in the focus directory only: a semantic name can recur elsewhere in the tree.
  const pathsOf = (selectedNames) =>
    expanded.filter((item) => item.dir === entry.directory && selectedNames.includes(item.semanticName)).map((item) => item.path);
  const folderOf = (candidateId) => built.pathOfAddress.get(candidateId.folderAddressPath);
  const failures = [];
  const fail = (message) => failures.push(`${entry.id}: ${message}`);
  const preconditions = entry.preconditions;

  for (const expected of preconditions.candidates ?? []) {
    const outcome = built.outcomeAt(expected.folder);
    if (!outcome) {
      fail(`candidate ${expected.folder}: none`);
      continue;
    }
    if (outcome.outcome !== expected.outcome || outcome.reasons[0] !== expected.reason) {
      fail(`candidate ${expected.folder}: expected ${expected.outcome}/${expected.reason}, got ${outcome.outcome}/${outcome.reasons[0]}`);
    }
    if (expected.governingChannel && outcome.governingChannel !== expected.governingChannel) {
      fail(`candidate ${expected.folder}: governing channel ${outcome.governingChannel}`);
    }
  }

  for (const expected of preconditions.placements ?? []) {
    const paths = expected.unobservedIn
      ? expanded.filter((item) => item.dir === expected.unobservedIn && item.noObservation).map((item) => item.path)
      : pathsOf(expected.names);
    if (paths.length === 0) fail('placement precondition selects no file');
    for (const filePath of paths) {
      const placement = built.reasoning.placements.find((record) => record.path === filePath);
      if (!placement) {
        fail(`${filePath}: no placement`);
        continue;
      }
      if (placement.state !== expected.state) fail(`${filePath}: state ${placement.state}, expected ${expected.state}`);
      if (expected.reason && placement.reason !== expected.reason) fail(`${filePath}: reason ${placement.reason}, expected ${expected.reason}`);
      if (expected.nearest && (placement.nearestHome ? folderOf(placement.nearestHome) : null) !== expected.nearest) {
        fail(`${filePath}: nearest home ${placement.nearestHome && folderOf(placement.nearestHome)}`);
      }
      if (expected.elsewhere) {
        const homes = [...new Set(placement.elsewhereHomes.map(folderOf))].sort();
        if (JSON.stringify(homes) !== JSON.stringify([...expected.elsewhere].sort())) fail(`${filePath}: elsewhere homes ${homes.join(', ')}`);
      }
      for (const consulted of expected.consulted ?? []) {
        const found = placement.consultedCandidates.some((record) => folderOf(record.candidateId) === consulted.folder && record.relation === consulted.relation);
        if (!found) fail(`${filePath}: ${consulted.folder} not consulted as ${consulted.relation}`);
      }
    }
  }

  for (const expected of preconditions.rootComparisons ?? []) {
    for (const filePath of pathsOf(expected.names)) {
      const relationship = built.semanticEvidence.memberRelationships.find(
        (record) => record.path === filePath && record.candidateId.candidateSource === 'naming-folder-label' && folderOf(record.candidateId) === expected.folder,
      );
      if (!relationship) fail(`${filePath}: no Stage 1 relationship with ${expected.folder}`);
      else if (relationship.channels.root.result !== expected.result) {
        fail(`${filePath}: root comparison with ${expected.folder} is ${relationship.channels.root.result}, expected ${expected.result}`);
      }
    }
  }

  // S3.2 positional expression: the folder's Naming label tokens equal the members' tokens at a position,
  // and the declared lineage expression of those members ends right after them.
  for (const expected of preconditions.positionalLabels ?? []) {
    const candidate = built.semanticEvidence.candidates.find((record) => record.path === expected.folder && record.candidateId.candidateSource === 'naming-folder-label');
    if (JSON.stringify(candidate?.labelTokens) !== JSON.stringify(expected.tokens)) fail(`${expected.folder}: label tokens ${JSON.stringify(candidate?.labelTokens)}`);
    const members = expanded.filter((item) => item.dir === entry.directory && expected.names.includes(item.semanticName));
    if (members.length === 0) fail(`${expected.folder}: no member selected`);
    for (const item of members) {
      if (!expected.tokens.every((token, index) => item.tokens[expected.position + index] === token)) fail(`${item.path}: tokens at ${expected.position} are not the label`);
      if (lineageOf(entry, item).length !== expected.position + expected.tokens.length) fail(`${item.path}: declared lineage expression does not end after the label`);
    }
  }

  // A lexical gap: the folder's Naming label tokens differ from the token its members carry.
  for (const expected of preconditions.labelTokens ?? []) {
    const candidate = built.semanticEvidence.candidates.find((record) => record.path === expected.folder && record.candidateId.candidateSource === 'naming-folder-label');
    if (JSON.stringify(candidate?.labelTokens) !== JSON.stringify(expected.tokens)) fail(`${expected.folder}: label tokens ${JSON.stringify(candidate?.labelTokens)}`);
    const members = expanded.filter((item) => item.dir === entry.directory && expected.names.includes(item.semanticName));
    if (members.length === 0 || !members.every((item) => item.tokens.includes(expected.memberToken) && !item.tokens.some((token) => expected.tokens.includes(token)))) {
      fail(`${expected.folder}: members do not carry \`${expected.memberToken}\` without the label's tokens`);
    }
  }

  for (const filePath of pathsOf(preconditions.ambiguous ?? [])) {
    const relationship = built.semanticEvidence.memberRelationships.find((record) => record.path === filePath && record.channels.root.result === 'match');
    if (relationship?.channels.root.ambiguity !== 'ambiguous') fail(`${filePath}: not carried as ambiguous evidence`);
  }
  return { failures, built };
};

for (const entry of ALL_CASES) {
  test(`preconditions (Stage 1 and Stage 2 only, no Stage 3 outcome): ${entry.id}`, () => {
    const { failures } = checkPreconditions(entry);
    assert.deepEqual(failures, []);
  });
}

test('preconditions: E13\'s flagged evidence leaves every Stage 2 outcome and placement equal to E1\'s', () => {
  const byId = Object.fromEntries(EMERGENT_BOUNDARY_CATALOGUE.cases.map((entry) => [entry.id, entry]));
  const project = (built) => ({
    candidates: built.reasoning.candidateOutcomes.map((outcome) => [built.pathOfAddress.get(outcome.candidateId.folderAddressPath), outcome.outcome, outcome.reasons[0]]),
    placements: built.reasoning.placements.map((placement) => [placement.path, placement.state, placement.reason ?? null]),
  });
  assert.deepEqual(project(checkPreconditions(byId.E13).built), project(checkPreconditions(byId.E1).built));
});

// S3.9 lexical-evidence companions (calculogic-validator#153): an active language profile is the one added
// condition. The amended S3.2 walk that reaches each declared lineage expression is checked in
// tree-lexical-consumption-contract.test.mjs; here the declared data is checked like any other case:
// discovery over the declared lineage, the S3.6 resolution path to the expected outcome, the sufficiency
// record, and the Stage 1 and Stage 2 preconditions, which the condition must leave unchanged (S1.1).
const LEXICAL_COMPANIONS = EMERGENT_BOUNDARY_CATALOGUE.lexicalCompanions;

test('lexical companions: discovery over the declared lineage expression gives exactly the declared candidates', () => {
  for (const entry of LEXICAL_COMPANIONS) {
    const members = expandFiles(entry.tree).filter((item) => item.dir === entry.directory && Array.isArray(item.tokens));
    const counts = new Map();
    for (const item of members) {
      const lineage = lineageOf(entry, item);
      assert.deepEqual(item.tokens.slice(0, lineage.length), lineage, `${entry.id} ${item.semanticName}: declared lineage is a leading part`);
      const residual = item.tokens.slice(lineage.length);
      for (let length = 1; length <= residual.length; length += 1) counts.set(prefixKey(residual.slice(0, length)), (counts.get(prefixKey(residual.slice(0, length))) ?? 0) + 1);
    }
    const discovered = [...counts].filter(([, count]) => count >= 2).map(([key]) => key).sort();
    assert.deepEqual(discovered, entry.candidates.map((candidate) => prefixKey(candidate.prefix)).sort(), `${entry.id}: discovery`);
    for (const candidate of entry.candidates) {
      const carriers = members.filter((item) => [...lineageOf(entry, item), ...candidate.prefix].every((token, index) => item.tokens[index] === token));
      assert.deepEqual([...new Set(carriers.map((item) => item.semanticName))].sort(), [...candidate.members].sort(), `${entry.id} ${prefixKey(candidate.prefix)}: members`);
      const { outcome, reasons } = candidate.expected;
      assert.ok(Object.hasOwn(REASONS_BY_OUTCOME, outcome) && reasons.every((reason) => REASONS_BY_OUTCOME[outcome].includes(reason)), `${entry.id}: S3.6 vocabulary`);
    }
  }
});

test('lexical companions: sufficiency record, each expected outcome followed through the S3.6 resolution order', () => {
  const recordRows = Object.fromEntries(
    [...S3_9_LEXICAL.matchAll(/^\| (E[\d.]+-L) \| (evaluable[^|]*) \| ([^|]+) \| ([^|]+) \|/gmu)].map((match) => [
      match[1],
      { status: match[2].trim(), rules: match[3].trim(), decisions: [...match[4].matchAll(/`([a-z-]+)`/gu)].map((item) => item[1]).sort() },
    ]),
  );
  assert.deepEqual(Object.keys(recordRows), LEXICAL_COMPANIONS.map((entry) => entry.id));
  for (const entry of LEXICAL_COMPANIONS) {
    const decisions = new Set();
    for (const candidate of entry.candidates) {
      const traced = tracePath(entry, candidate);
      traced.dependsOn.forEach((decision) => decisions.add(decision));
      assert.ok(!traced.incomplete, `${entry.id} ${prefixKey(candidate.prefix)}: complete`);
      assert.equal(traced.rule, ruleOf(candidate.expected), `${entry.id} ${prefixKey(candidate.prefix)}: the resolution order reaches the expected outcome`);
      assert.ok(recordRows[entry.id].rules.includes(`\`${prefixKey(candidate.prefix)}\`: \`${traced.rule}\``), `${entry.id}: the record names the rule`);
    }
    assert.equal(recordRows[entry.id].status, 'evaluable', `${entry.id}: status`);
    assert.deepEqual(recordRows[entry.id].decisions, [...decisions].sort(), `${entry.id}: decisions`);
  }
});

for (const entry of LEXICAL_COMPANIONS) {
  test(`preconditions (Stage 1 and Stage 2: the case keeps its base preconditions; their equality with the section in the payload is checked in tree-lexical-consumption-contract.test.mjs): ${entry.id}`, () => {
    assert.deepEqual(checkPreconditions(entry).failures, []);
  });
}
