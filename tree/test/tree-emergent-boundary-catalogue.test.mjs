// The Stage 3 evidence catalogue (Tree spec S3.9; calculogic-validator#130).
//
// What these tests verify: the catalogue's integrity against the contract, and the Stage 1 and
// Stage 2 evidence each case's expectation rests on, through the real Stage 1 preparers and Stage 2A
// reasoning (`buildCatalogueCase`).
//
// What they do NOT verify: any Stage 3 outcome. Stage 3 reasoning is not implemented (S3.11 step 4);
// each case's `expected` outcome is data, recorded for that step, and is never asserted here. E10's
// known-gap behaviour is likewise checked only once the reasoning exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EMERGENT_BOUNDARY_CATALOGUE } from './fixtures/emergent-boundary-catalogue/emergent-boundary-catalogue-cases.fixture.mjs';
import { buildCatalogueCase, files } from './fixtures/semantic-home-catalogue/semantic-home-catalogue.fixture.mjs';

const SPEC = fs.readFileSync(new URL('../../doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md', import.meta.url), 'utf8');
const S3_9 = SPEC.slice(SPEC.indexOf('#### S3.9 Evidence catalogue'), SPEC.indexOf('#### S3.10'));

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
