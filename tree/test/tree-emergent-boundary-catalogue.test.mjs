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
// What they do NOT verify: any Stage 3 outcome. Stage 3 reasoning is not implemented (S3.11 step 4);
// each case's `expected` outcome is data, recorded for that step, and is never asserted here. E10's
// known-gap and E12's policy-incomplete behaviour are likewise checked only once the reasoning exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EMERGENT_BOUNDARY_CATALOGUE } from './fixtures/emergent-boundary-catalogue/emergent-boundary-catalogue-cases.fixture.mjs';
import { buildCatalogueCase, files } from './fixtures/semantic-home-catalogue/semantic-home-catalogue.fixture.mjs';

const SPEC = fs.readFileSync(new URL('../../doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md', import.meta.url), 'utf8');
const section = (start, end) => SPEC.slice(SPEC.indexOf(start), SPEC.indexOf(end));
const S3_6 = section('#### S3.6 Outcomes', '#### S3.7');
const S3_8 = section('#### S3.8 Parameters', '#### S3.9');
const S3_9 = section('#### S3.9 Evidence catalogue', '##### Evidence sufficiency and policy dependency');
const S3_9_RECORD = section('##### Evidence sufficiency and policy dependency', '#### S3.10');

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
// S3.8: the provisional decisions and their values under `emergent-boundary-experimental` v1.
const EXPERIMENTAL_POLICY = Object.freeze({
  minimumPrimaryUnits: 3,
  // The E14/E15 point (S3.5): at least four supported primary units and at most one in five outside.
  partialEvidencePoint: { supportedPrimaryUnits: 4, outsideShare: 1 / 5 },
});
const UNRESOLVED_DECISIONS = ['coverage-share', 'opportunity-selection'];
// S3.5 provisional responsibility-class mapping (S3.8); `documentation` is primary in an all-documentation grouping.
const PRIMARY_CATEGORIES = new Set(['concern-core', 'architecture-support', 'surface-system', 'data-model', 'indexing-registry']);
const SUPPORTING_CATEGORIES = new Set(['quality-support']);

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
  assert.deepEqual(specIds, Array.from({ length: 15 }, (_, index) => `E${index + 1}`));
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
  for (const entry of EMERGENT_BOUNDARY_CATALOGUE.cases) {
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
  for (const entry of EMERGENT_BOUNDARY_CATALOGUE.cases) {
    const inDirectory = expandFiles(entry.tree).filter((item) => item.dir === entry.directory && Array.isArray(item.tokens));
    if (entry.directoryMembers !== undefined) {
      // S3.2: a member is a file occurrence with an evaluated identity, so occurrences are counted, not names.
      assert.equal(inDirectory.length, entry.directoryMembers, `${entry.id}: the focus directory has the member occurrences S3.9 states`);
    }
    const prefixes = entry.candidates.map((candidate) => prefixKey(candidate.prefix));
    assert.equal(new Set(prefixes).size, prefixes.length, `${entry.id}: one candidate per prefix`);
    for (const candidate of entry.candidates) {
      const label = `${entry.id} ${prefixKey(candidate.prefix)}`;
      const leading = [...entry.lineageTokens, ...candidate.prefix];
      const carriers = inDirectory.filter((item) => leading.every((token, index) => item.tokens[index] === token));
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
  for (const entry of EMERGENT_BOUNDARY_CATALOGUE.cases.filter((candidateCase) => candidateCase.lineageTokens.length > 0)) {
    const allMembers = new Set(entry.candidates.flatMap((candidate) => candidate.members));
    const covering = (entry.preconditions.rootComparisons ?? []).some(
      (comparison) => comparison.result === 'match' && [...allMembers].every((name) => comparison.names.includes(name)),
    );
    assert.ok(covering, `${entry.id}: a root-match precondition covers every member`);
  }
});

test('integrity: the policy-incomplete marker is on exactly the cases S3.9 names, for unresolved decisions only', () => {
  const specCases = [...S3_9.matchAll(/^\| (E\d+) \|.*\*\*Policy-incomplete case:\*\*/gmu)].map((match) => match[1]);
  const tableCases = EMERGENT_BOUNDARY_CATALOGUE.cases.filter((entry) => entry.policyIncomplete).map((entry) => entry.id);
  assert.deepEqual(tableCases, specCases);
  assert.deepEqual(tableCases, ['E12']);
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
  assert.equal(rows['minimum-primary-units'], String(EXPERIMENTAL_POLICY.minimumPrimaryUnits));
  assert.equal(rows['separation-value-limit'], '`whole-directory-only`');
  for (const decision of UNRESOLVED_DECISIONS) assert.equal(rows[decision], 'unresolved', `${decision} is unresolved`);
});

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
  if (inDirectory.length > memberFiles.length) {
    dependsOn.add('coverage-share');
    return result(null);
  }
  dependsOn.add('responsibility-class-mapping');
  const allDocumentation = supported.every((item) => item.roleCategory === 'documentation');
  const classOf = (item) => {
    const category = item.roleCategory ?? 'concern-core';
    if (PRIMARY_CATEGORIES.has(category) || (category === 'documentation' && allDocumentation)) return 'primary';
    if (SUPPORTING_CATEGORIES.has(category)) return 'supporting';
    // A mixed grouping's documentation, or no category: no catalogue case reaches it.
    throw new Error(`${entry.id} ${prefixKey(candidate.prefix)}: unresolved responsibility class for ${item.semanticName}`);
  };
  const primaryUnits = new Set(supported.filter((item) => classOf(item) === 'primary').map((item) => item.semanticName)).size;
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
  for (const entry of EMERGENT_BOUNDARY_CATALOGUE.cases) {
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

for (const entry of EMERGENT_BOUNDARY_CATALOGUE.cases) {
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
