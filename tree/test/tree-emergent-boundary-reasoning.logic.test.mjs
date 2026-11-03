// Tree Stage 3 evidence-only reasoning (Tree spec S3.1-S3.10; calculogic-validator#136).
//
// The S3.9 catalogue runs through the real Stage 1 preparers, Stage 2A reasoning and Stage 3 reasoning
// under the fixture experimental policy. Ordinary cases must reach their expected outcomes; E10 must
// still show exactly its recorded known gap; E12 must stay incomplete for exactly its recorded decision.
// When a known gap's cause or a policy-incomplete decision is removed, those checks fail until the case
// is reclassified (S3.9).
import test from 'node:test';
import assert from 'node:assert/strict';
import { EMERGENT_BOUNDARY_CATALOGUE } from './fixtures/emergent-boundary-catalogue/emergent-boundary-catalogue-cases.fixture.mjs';
import { EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY } from './fixtures/emergent-boundary-catalogue/emergent-boundary-experimental-policy.fixture.mjs';
import { buildCatalogueCase, files } from './fixtures/semantic-home-catalogue/semantic-home-catalogue.fixture.mjs';
import { repositoryPackageBridgeSections, repositoryPackageElementsOf } from './fixtures/repository-package/repository-package.fixture.mjs';
import {
  evaluateCoverageInvariance,
  prepareTreeEmergentBoundaryReasoning,
  readConsultedCandidate,
  validateTreeEmergentBoundaryPolicy,
} from '../src/tree-emergent-boundary-reasoning.logic.mjs';
import { NOT_PREPARED_TREE_SEMANTIC_HOME_PARAMETER_SET } from '../src/tree-semantic-home-parameter-set.logic.mjs';

const prefixKey = (prefix) => prefix.join('-');

const withDecision = (id, decision) => ({
  ...EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY,
  decisions: { ...EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY.decisions, [id]: decision },
});

// One catalogue case through Stage 1, Stage 2A and Stage 3; `policy: null` supplies none. A case that
// declares a repository package (E18-E21) carries it as on the default path: Naming's §4.8 section, then
// Tree's intake and its accepted elements (calculogic-validator#159).
const runCase = (entry, { policy = EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY, parameterSet } = {}) => {
  const built = buildCatalogueCase({
    files: entry.tree.files.flatMap(({ dir, root, count, ...options }) => files(dir, root, count, options)),
    parameterSet,
    bridgeSections: repositoryPackageBridgeSections(entry.repositoryPackage),
  });
  const record = prepareTreeEmergentBoundaryReasoning({
    factEvidence: built.factEvidence,
    semanticEvidence: built.semanticEvidence,
    sectionIntake: built.sectionIntake,
    semanticHomeReasoning: built.reasoning,
    policy,
    repositoryPackageElements: repositoryPackageElementsOf(built),
  });
  const directory = record.directories?.find((item) => item.path === entry.directory);
  const candidateAt = (prefix) => directory?.candidates.find((candidate) => prefixKey(candidate.prefix) === prefix);
  return { built, record, directory, candidateAt };
};

const byId = Object.fromEntries(EMERGENT_BOUNDARY_CATALOGUE.cases.map((entry) => [entry.id, entry]));

// S3.9 companion cases: an implementation-pending companion checks exactly what today's runtime gives,
// so it fails once the runtime implements the amendment and must then be reclassified (#138).
for (const entry of [...EMERGENT_BOUNDARY_CATALOGUE.cases, ...EMERGENT_BOUNDARY_CATALOGUE.companions]) {
  test(`catalogue ${entry.id}: discovery, relations, member sets and outcomes under the experimental policy`, () => {
    const { directory, candidateAt } = runCase(entry);
    // Implementation-pending: the expected candidates follow an amendment the runtime does not implement
    // yet, so today's discovered set and results are checked exactly, as recorded.
    if (entry.implementationPending) {
      const recorded = entry.implementationPending.runtimeProduces;
      assert.deepEqual((directory?.candidates ?? []).map((candidate) => prefixKey(candidate.prefix)).sort(), Object.keys(recorded).sort(), `${entry.id}: today's discovered candidates`);
      for (const [key, result] of Object.entries(recorded)) {
        const { assessment } = candidateAt(key);
        assert.deepEqual({ outcome: assessment.outcome, reasons: assessment.reasons }, result, `${entry.id} ${key}: today's runtime result, exactly as recorded (implementation-pending)`);
      }
      return;
    }
    // A case that discovers nothing (E16): the focus directory has no record, since only directories
    // with candidates are recorded.
    if (entry.candidates.length === 0) {
      assert.equal(directory, undefined, `${entry.id}: no candidate is discovered`);
      return;
    }
    assert.ok(directory, `${entry.id}: the focus directory has candidates`);
    // S3.3: exactly the catalogue's candidates, with their members.
    assert.deepEqual(directory.candidates.map((candidate) => prefixKey(candidate.prefix)).sort(), entry.candidates.map((candidate) => prefixKey(candidate.prefix)).sort());
    for (const expected of entry.candidates) {
      const key = prefixKey(expected.prefix);
      const candidate = candidateAt(key);
      const label = `${entry.id} ${key}`;
      assert.deepEqual([...new Set(candidate.members.map((member) => member.semanticName))].sort(), [...expected.members].sort(), `${label}: members`);
      for (const relation of expected.relations ?? []) {
        const recorded = directory.relations.find((item) => item.candidates.some((ref) => prefixKey(ref.prefix) === key) && item.candidates.some((ref) => prefixKey(ref.prefix) === relation.to));
        assert.equal(recorded?.relation, relation.relation, `${label}: relation to ${relation.to}`);
      }
      const { assessment } = candidate;
      if (expected.memberSets) {
        for (const [set, names] of Object.entries(expected.memberSets)) {
          assert.deepEqual(candidate.members.filter((member) => member.set === set).map((member) => member.semanticName).sort(), [...names].sort(), `${label}: ${set} members`);
        }
      }
      assert.deepEqual(assessment.recommendation, { status: 'not-authorized', reason: 'stage-3-evidence-only' }, `${label}: never an authorized recommendation`);
      if (entry.knownGap?.candidate === key) {
        // A known gap: the rules reach exactly the recorded discrepancy, never the expected outcome.
        assert.equal(assessment.outcome, entry.knownGap.rulesWouldProduce.outcome, `${label}: the known gap is still exactly as recorded`);
        assert.notEqual(assessment.outcome, expected.expected.outcome, `${label}: the discrepancy is real`);
      } else if (entry.policyIncomplete?.candidates.includes(key)) {
        assert.equal(assessment.completion, 'incomplete', `${label}: incomplete under the experimental policy`);
        assert.equal(assessment.outcome, null, `${label}: an incomplete assessment carries no outcome`);
        assert.deepEqual(assessment.unresolvedDecisions, entry.policyIncomplete.unresolvedDecisions, `${label}: incomplete for exactly the recorded decisions`);
      } else {
        assert.equal(assessment.completion, 'complete', `${label}: complete`);
        assert.equal(assessment.outcome, expected.expected.outcome, `${label}: outcome`);
        assert.deepEqual(assessment.reasons, expected.expected.reasons, `${label}: reasons`);
        assert.deepEqual(
          { policyId: assessment.decidedBy.policyId, policyVersion: assessment.decidedBy.policyVersion },
          { policyId: 'emergent-boundary-experimental', policyVersion: '1' },
          `${label}: the policy that produced it`,
        );
      }
    }
  });
}

// S3.2 positional lineage expression (calculogic-validator#144): provenance and grounding.
const declaredLineageOf = (entry, semanticName) => entry.lineageExpression?.[semanticName] ?? entry.lineageTokens;
const prepareTree = ({ files: fileSpecs, folders, n2 } = {}) => {
  const built = buildCatalogueCase({ files: fileSpecs, folders, n2 });
  return prepareTreeEmergentBoundaryReasoning({
    factEvidence: built.factEvidence,
    semanticEvidence: built.semanticEvidence,
    sectionIntake: built.sectionIntake,
    semanticHomeReasoning: built.reasoning,
    policy: EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY,
  });
};
const tokenFile = (dir, tokens) => ({ dir, root: tokens[0], tokens, semanticName: tokens.join('-') });
const prefixesAt = (record, path) => (record.directories.find((item) => item.path === path)?.candidates ?? []).map((candidate) => prefixKey(candidate.prefix)).sort();

test('S3.2 provenance: every catalogue member records the declared lineage expression, step by step, and its leading tokens', () => {
  // An implementation-pending case declares the lineage an unimplemented amendment expresses; today's
  // runtime is checked against its recorded result instead (above). There is none at present.
  for (const entry of [...EMERGENT_BOUNDARY_CATALOGUE.cases, ...EMERGENT_BOUNDARY_CATALOGUE.companions].filter((candidateCase) => !candidateCase.implementationPending)) {
    const { directory } = runCase(entry);
    for (const candidate of directory?.candidates ?? []) {
      for (const member of candidate.members) {
        const declared = declaredLineageOf(entry, member.semanticName);
        const label = `${entry.id} ${prefixKey(candidate.prefix)} ${member.semanticName}`;
        assert.deepEqual(member.lineageExpression.flatMap((step) => step.tokens), declared, `${label}: expressed tokens`);
        let position = 0;
        for (const step of member.lineageExpression) {
          assert.deepEqual(step.positions, { start: position, end: position + step.tokens.length }, `${label}: contiguous positions`);
          position = step.positions.end;
        }
        assert.deepEqual(member.leadingTokens, [...declared, ...candidate.prefix], `${label}: leading tokens`);
      }
      const distinct = [...new Set(candidate.members.map((member) => member.leadingTokens.join('\u0000')))].sort();
      assert.deepEqual(candidate.leadingTokens.map((tokens) => tokens.join('\u0000')), distinct, `${entry.id} ${prefixKey(candidate.prefix)}: candidate leading tokens`);
    }
  }
});

test('E17 (S3.2): `naming/` expresses position 0 on its Stage 1 root match, `health/` position 1 on its label; the prefix is `check`', () => {
  const { directory, candidateAt } = runCase(byId.E17);
  assert.deepEqual(directory.candidates.map((candidate) => prefixKey(candidate.prefix)), ['check']);
  const candidate = candidateAt('check');
  assert.deepEqual(candidate.leadingTokens, [['naming', 'health', 'check']]);
  for (const member of candidate.members) {
    assert.deepEqual(
      member.lineageExpression.map(({ folderPath, basis, positions, tokens }) => ({ folderPath, basis, positions, tokens })),
      [
        // A tie with the positional label keeps the Stage 1 basis.
        { folderPath: 'naming', basis: 'stage-1-root', positions: { start: 0, end: 1 }, tokens: ['naming'] },
        { folderPath: 'naming/src/health', basis: 'positional-label', positions: { start: 1, end: 2 }, tokens: ['health'] },
      ],
    );
    assert.equal(typeof member.lineageExpression[1].folder.occurrenceAddress, 'string');
  }
  // `check` is its own evidence-derived identifier: no record carries `health-check` or a migration.
  assert.equal(candidateAt('health-check'), undefined);
  assert.equal('previousPrefix' in candidate || 'identity' in candidate, false);
});

test('S3.2 order and contiguity: a label equal to a later token expresses nothing when no folder expressed the earlier ones', () => {
  // `src/core/cli` and `validator-cli-*`: nothing expresses `validator`, so `cli/` does not continue.
  const record = prepareTree({ files: ['alpha', 'bravo'].map((rest) => tokenFile('src/core/cli', ['validator', 'cli', rest])) });
  assert.deepEqual(prefixesAt(record, 'src/core/cli'), ['validator', 'validator-cli']);
  const candidate = record.directories.find((item) => item.path === 'src/core/cli').candidates[0];
  for (const member of candidate.members) assert.deepEqual(member.lineageExpression, []);
});

test('S3.2: each folder expresses at most once', () => {
  const record = prepareTree({ files: ['alpha', 'bravo'].map((rest) => tokenFile('cli', ['cli', 'cli', 'x', rest])) });
  assert.deepEqual(prefixesAt(record, 'cli'), ['cli', 'cli-x']);
  const member = record.directories.find((item) => item.path === 'cli').candidates[0].members[0];
  assert.deepEqual(member.lineageExpression.map((step) => step.positions), [{ start: 0, end: 1 }]);
});

test('S3.2: a folder whose label is not parsed expresses nothing', () => {
  const entry = byId.E17;
  const fileSpecs = entry.tree.files.flatMap(({ dir, root, count, ...options }) => files(dir, root, count, options));
  const parsed = prepareTree({ files: fileSpecs });
  const rejected = prepareTree({ files: fileSpecs, n2: { rejected: 'naming/src/health' } });
  assert.deepEqual(prefixesAt(parsed, 'naming/src/health'), ['check']);
  assert.deepEqual(prefixesAt(rejected, 'naming/src/health'), ['health', 'health-check']);
});

test('S3.2: only the relevant lineage takes part; folders above the first terminating folder express nothing', () => {
  const fileSpecs = ['alpha', 'bravo'].map((rest) => tokenFile('outer/pkg/inner', ['outer', 'pkg', 'inner', rest]));
  const open = prepareTree({ files: fileSpecs });
  const terminated = prepareTree({ files: fileSpecs, folders: [{ path: 'outer/pkg', packageRoot: 'pkg' }] });
  assert.deepEqual(prefixesAt(open, 'outer/pkg/inner'), []);
  assert.deepEqual(prefixesAt(terminated, 'outer/pkg/inner'), ['outer', 'outer-pkg', 'outer-pkg-inner']);
});

test('E8: the explained candidate names its home; E2: the corresponding undetermined folder blocks the grouping', () => {
  const e8 = runCase(byId.E8);
  const home = e8.candidateAt('tree').assessment.home;
  assert.equal(e8.built.pathOfAddress.get(home.folderAddressPath), 'tree');
  assert.equal(e8.candidateAt('tree-known-roots').existingStructure.broaderSupportedHomes.length, 1, 'tree/ is recorded as broader, not decisive');
  const e2 = runCase(byId.E2);
  const blocking = e2.candidateAt('structural-addressing').existingStructure.correspondingUndeterminedCandidates;
  assert.deepEqual(blocking.map((candidateId) => e2.built.pathOfAddress.get(candidateId.folderAddressPath)), ['structural-addressing']);
});

test('a corresponding undetermined folder blocks the grouping even when its members are inside a home (S3.5)', () => {
  // `alpha/` is eligible, so the `alpha/src` members are inside-home; the empty `alpha-beta-gamma/`
  // folder is undetermined and matches them, with a claim equal to their leading tokens.
  const file = (dir, tokens) => ({ dir, root: tokens[0], count: 1, tokens, semanticName: tokens.join('-') });
  const built = buildCatalogueCase({
    files: [
      ...['one', 'two', 'three', 'four'].map((rest) => file('alpha', ['alpha', rest])),
      ...['x', 'y', 'z'].map((rest) => file('alpha/src', ['alpha', 'beta', 'gamma', rest])),
      file('alpha/src', ['alpha', 'delta', 'item']),
      file('alpha/src', ['alpha', 'epsilon', 'item']),
    ].flatMap(({ dir, root, count, ...options }) => files(dir, root, count, options)),
    folders: [{ path: 'alpha-beta-gamma' }],
  });
  const record = prepareTreeEmergentBoundaryReasoning({
    factEvidence: built.factEvidence,
    semanticEvidence: built.semanticEvidence,
    sectionIntake: built.sectionIntake,
    semanticHomeReasoning: built.reasoning,
    policy: EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY,
  });
  const candidate = record.directories.find((directory) => directory.path === 'alpha/src').candidates.find((item) => prefixKey(item.prefix) === 'beta-gamma');
  assert.ok(candidate.members.every((member) => member.set === 'supported'));
  assert.deepEqual(candidate.existingStructure.correspondingUndeterminedCandidates.map((candidateId) => built.pathOfAddress.get(candidateId.folderAddressPath)), ['alpha-beta-gamma']);
  assert.equal(candidate.assessment.outcome, 'insufficient-evidence');
  assert.deepEqual(candidate.assessment.reasons, ['corresponding-home-unresolved']);
});

test('E10 (S3.5 undetermined ancestors): every member stays supported, with the undetermined ancestor kept as context', () => {
  const { built, candidateAt } = runCase(byId.E10);
  for (const member of candidateAt('rule-check').members) {
    assert.equal(member.set, 'supported');
    assert.deepEqual(member.notes.map((note) => note.note), ['related-folder-undetermined']);
    assert.deepEqual(member.notes[0].candidateIds.map((candidateId) => built.pathOfAddress.get(candidateId.folderAddressPath)), ['naming']);
  }
});

test('E14, E15: the one conflicting or unresolved member carries its explanation and stays on the record', () => {
  const e14 = runCase(byId.E14).candidateAt('semantic-home');
  const conflicting = e14.members.find((member) => member.set === 'conflicting');
  assert.equal(conflicting.explanation.reason, 'home-elsewhere-different-claim');
  assert.deepEqual(conflicting.explanation.homes[0].claim, ['semantic', 'home', 'strength']);
  assert.deepEqual(e14.assessment.evidence.partialEvidence, { outsideMemberFileCount: 1, withinCataloguePoint: true });
  const e15 = runCase(byId.E15).candidateAt('semantic-home');
  const unresolved = e15.members.find((member) => member.set === 'unresolved');
  // S3.5 claim-relative uncertainty: the undetermined folder's claim is different, so it is a possible other destination.
  assert.equal(unresolved.explanation.reason, 'possible-other-destination');
  assert.deepEqual(unresolved.explanation.candidateIds.map((candidateId) => runCase(byId.E15).built.pathOfAddress.get(candidateId.folderAddressPath)), ['semantic-home-strength']);
  assert.deepEqual(unresolved.uncertainty.map((entry) => [entry.relation, entry.reading, entry.claim]), [['match', 'possible-other-destination', ['semantic', 'home', 'strength']]]);
});

test('S3.5 provenance: established and possible correspondence, broader context, other destinations and missing comparisons stay distinct', () => {
  const leading = ['naming', 'rule', 'check'];
  const read = (relation, governingClaim, rootClaim) => readConsultedCandidate({ relation, governingClaim, rootClaim, leading }).reading;
  assert.equal(read('match', ['naming', 'rule', 'check'], ['naming']), 'established-correspondence');
  assert.equal(read('possible-root-reading', ['naming', 'owned'], ['naming']), 'broader-context');
  assert.equal(readConsultedCandidate({ relation: 'possible-root-reading', governingClaim: ['tree', 'owned'], rootClaim: ['tree'], leading: ['tree'] }).reading, 'possible-correspondence');
  assert.equal(read('match', ['naming', 'other'], ['naming']), 'possible-other-destination');
  assert.equal(read('possible-unevaluated', ['naming', 'rule', 'check'], ['naming']), 'missing-comparison');

  // In the catalogue: E2's corresponding undetermined folder is established; E8 `tree`'s `tree-owned/` is possible;
  // E10.1's `naming-owned/` is broader context, kept on each member.
  const e2 = runCase(byId.E2).candidateAt('structural-addressing');
  assert.equal(e2.existingStructure.correspondingUndeterminedCandidates.length, 1);
  assert.equal(e2.members[0].explanation.reason, 'corresponding-candidate-undetermined');
  const e8 = runCase(byId.E8);
  assert.deepEqual(e8.candidateAt('tree').existingStructure.possiblyCorrespondingCandidates.map((candidateId) => e8.built.pathOfAddress.get(candidateId.folderAddressPath)), ['doc/specs/tree-owned']);
  assert.equal(e8.candidateAt('tree').assessment.outcome, 'explained-by-existing-structure', 'an established home elsewhere is decided first');
  const companion = EMERGENT_BOUNDARY_CATALOGUE.companions.find((entry) => entry.id === 'E10.1');
  const e101 = runCase(companion);
  for (const member of e101.candidateAt('rule-check').members) {
    assert.equal(member.set, 'supported');
    assert.deepEqual(
      member.uncertainty.map((entry) => [e101.built.pathOfAddress.get(entry.candidateId.folderAddressPath), entry.relation, entry.reading]).sort(),
      [['doc/specs/naming-owned', 'possible-root-reading', 'broader-context'], ['naming', 'match', 'broader-context']],
    );
  }
});

test('S3.6 coverage: E8.1 records its variant rules and decisions, and invariance is bounded over several unrecognized files', () => {
  const companion = EMERGENT_BOUNDARY_CATALOGUE.companions.find((entry) => entry.id === 'E8.1');
  const { candidateAt } = runCase(companion);
  assert.deepEqual(candidateAt('tree-known-roots').assessment.evidence.coverage, {
    unrecognizedFileCount: 1, invariant: false, variantRules: ['single-responsibility'], decisionsInvolved: ['responsibility-class-mapping'],
  });
  assert.deepEqual(candidateAt('tree-known').assessment.evidence.coverage.variantRules, ['single-responsibility', 'redundancy']);
  assert.equal(candidateAt('tree').assessment.evidence.coverage, undefined, 'existing structure decides before coverage');

  // The bound itself, with a mapping that could classify every joining file (not the experimental policy's).
  const closed = (overrides) =>
    evaluateCoverageInvariance({
      unrecognizedFileCount: 1, primaryUnitCount: 5, memberFileCount: 5, outsideMemberFileCount: 0, redundant: false,
      coversWholeDirectory: false, prefixLength: 2, minimumPrimaryUnits: 3, joiningFileCanLeaveClassUnresolved: false, ...overrides,
    });
  assert.deepEqual(closed({}), { invariant: true, variantRules: [], decisionsInvolved: [] }, 'one file: within the S3.5 point either way');
  assert.deepEqual(closed({ unrecognizedFileCount: 2 }), { invariant: false, variantRules: ['partial-evidence'], decisionsInvolved: ['partial-evidence-aggregation'] }, 'two files could both join unresolved');
  assert.deepEqual(closed({ primaryUnitCount: 1 }).variantRules, ['single-responsibility'], 'a joining file could be a second unit');
  assert.deepEqual(closed({ primaryUnitCount: 2, memberFileCount: 2 }).variantRules, ['minimum-units'], 'a joining file could reach the minimum');
  assert.deepEqual(closed({ primaryUnitCount: 2, memberFileCount: 2, unrecognizedFileCount: 0 }).invariant, true);
  assert.deepEqual(closed({ prefixLength: 1 }).invariant, true, 'decided by specificity in every completion');
  assert.deepEqual(closed({ redundant: true }).variantRules, ['redundancy']);
  assert.deepEqual(closed({ coversWholeDirectory: true }).variantRules, ['whole-directory']);
  // O > 0 and even the best completion misses the point: fails alike, so invariant (and still incomplete).
  assert.deepEqual(closed({ primaryUnitCount: 3, memberFileCount: 9, outsideMemberFileCount: 6, minimumPrimaryUnits: 3 }).invariant, true);
  // O = 0 and too few units for the point: the all-absent completion passes, a joining unresolved file fails.
  assert.deepEqual(closed({ primaryUnitCount: 3, memberFileCount: 3 }).variantRules, ['partial-evidence']);
  assert.deepEqual(closed({ joiningFileCanLeaveClassUnresolved: true }).decisionsInvolved, ['responsibility-class-mapping']);
});

test('the safeguard: missing evidence only withholds a conclusion the rules reach, never grants one', () => {
  // E8's `tree-known-roots` is an opportunity on full coverage; with one unrecognized file (E8.1) the same
  // rules are withheld, because invariance cannot be shown. Invariance never decides an outcome itself.
  const companion = EMERGENT_BOUNDARY_CATALOGUE.companions.find((entry) => entry.id === 'E8.1');
  assert.equal(runCase(byId.E8).candidateAt('tree-known-roots').assessment.outcome, 'opportunity');
  for (const prefix of ['tree-known-roots', 'tree-known']) {
    const { assessment } = runCase(companion).candidateAt(prefix);
    assert.equal(assessment.completion, 'incomplete');
    assert.equal(assessment.outcome, null);
    assert.deepEqual(assessment.unresolvedDecisions, ['coverage-share']);
  }
});

test('a policy-incomplete case is re-evaluated once a policy supplies its decision (S3.9)', () => {
  // A probe of the mechanism, not a proposed value: with `coverage-share` resolved, E12 completes, so the
  // policy-incomplete check above would fail until the case is reclassified.
  const { candidateAt } = runCase(byId.E12, { policy: withDecision('coverage-share', { status: 'resolved', value: 0.5 }) });
  for (const prefix of byId.E12.policyIncomplete.candidates) {
    assert.equal(candidateAt(prefix).assessment.completion, 'complete');
    assert.deepEqual(candidateAt(prefix).assessment.reasons, ['low-coverage']);
    assert.equal(candidateAt(prefix).assessment.decidedBy.decision, 'coverage-share');
  }
});

test('S3.6: evidence is evaluated before resolution, so an early decisive rule hides none of it', () => {
  // Coverage decides (resolved) or blocks (unresolved) E12 before the responsibility rules are reached.
  for (const policy of [EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY, withDecision('coverage-share', { status: 'resolved', value: 0.5 })]) {
    const { evidence } = runCase(byId.E12, { policy }).candidateAt('widget-panel').assessment;
    assert.deepEqual(evidence, {
      primaryUnitCount: 3,
      supportingMemberFileCount: 0,
      coverage: { unrecognizedFileCount: 9, invariant: false, variantRules: ['single-responsibility', 'whole-directory'], decisionsInvolved: ['responsibility-class-mapping'] },
    });
  }
  // E2 `structural-addressing` is decided by existing structure; its unresolved members are still counted.
  const { evidence } = runCase(byId.E2).candidateAt('structural-addressing').assessment;
  assert.deepEqual(evidence, { primaryUnitCount: 0, supportingMemberFileCount: 0, partialEvidence: { outsideMemberFileCount: 3, withinCataloguePoint: false } });
  // With the mapping unresolved, the record says so instead of omitting the counts silently.
  const unmapped = runCase(byId.E1, { policy: withDecision('responsibility-class-mapping', { status: 'unresolved' }) }).candidateAt('semantic-home').assessment;
  assert.deepEqual(unmapped.evidence, { responsibilityClasses: { unresolvedDecision: 'responsibility-class-mapping' } });
  assert.deepEqual(unmapped.unresolvedDecisions, ['responsibility-class-mapping']);
});

test('D2: under a policy leaving the separation limit unresolved, every expected opportunity is incomplete, E10\'s known gap included', () => {
  const policy = withDecision('separation-value-limit', { status: 'unresolved' });
  for (const entry of EMERGENT_BOUNDARY_CATALOGUE.cases) {
    const { candidateAt } = runCase(entry, { policy });
    const opportunities = entry.candidates.filter((candidate) => candidate.expected.outcome === 'opportunity').map((candidate) => prefixKey(candidate.prefix));
    if (entry.knownGap) opportunities.push(entry.knownGap.candidate);
    for (const prefix of opportunities) {
      assert.equal(candidateAt(prefix).assessment.completion, 'incomplete', `${entry.id} ${prefix}`);
      assert.deepEqual(candidateAt(prefix).assessment.unresolvedDecisions, ['separation-value-limit'], `${entry.id} ${prefix}`);
    }
  }
});

test('an unresolved decision off a candidate\'s path never blocks its outcome', () => {
  // E9 is decided by `whole-directory`, before specificity and minimum units.
  const policy = withDecision('minimum-primary-units', { status: 'unresolved' });
  const { candidateAt } = runCase(byId.E9, { policy });
  assert.equal(candidateAt('date').assessment.outcome, 'insufficient-evidence');
  assert.deepEqual(candidateAt('date').assessment.reasons, ['whole-directory-value-undetermined']);
});

test('selection: a lone opportunity needs none; related opportunities are all kept, with the selection unresolved', () => {
  assert.deepEqual(runCase(byId.E1).candidateAt('semantic-home').assessment.selection, { status: 'not-needed' });
  // `alpha-beta` (three units) nested in `alpha` (six units), among unrelated siblings.
  const entry = {
    tree: {
      files: [
        ...['one', 'two', 'three'].map((rest) => ({ dir: 'lib', root: 'alpha', count: 1, tokens: ['alpha', 'beta', rest], semanticName: `alpha-beta-${rest}` })),
        ...['four', 'five', 'six'].map((rest) => ({ dir: 'lib', root: 'alpha', count: 1, tokens: ['alpha', 'gamma', rest], semanticName: `alpha-gamma-${rest}` })),
        ...['cache', 'schema'].map((root) => ({ dir: 'lib', root, count: 1, tokens: [root, 'item'] })),
      ],
    },
    directory: 'lib',
  };
  const { candidateAt } = runCase(entry);
  assert.equal(candidateAt('alpha-beta').assessment.outcome, 'opportunity');
  assert.equal(candidateAt('alpha-gamma').assessment.outcome, 'opportunity');
  // `alpha` is one-word, so the two opportunities are disjoint from each other and unrelated to an opportunity.
  assert.deepEqual(candidateAt('alpha-beta').assessment.selection, { status: 'not-needed' });

  const nested = {
    tree: {
      files: [
        ...['one', 'two', 'three'].map((rest) => ({ dir: 'lib', root: 'alpha', count: 1, tokens: ['alpha', 'beta', 'delta', rest], semanticName: `alpha-beta-delta-${rest}` })),
        ...['four', 'five', 'six'].map((rest) => ({ dir: 'lib', root: 'alpha', count: 1, tokens: ['alpha', 'beta', rest], semanticName: `alpha-beta-${rest}` })),
        ...['cache', 'schema'].map((root) => ({ dir: 'lib', root, count: 1, tokens: [root, 'item'] })),
      ],
    },
    directory: 'lib',
  };
  const related = runCase(nested);
  assert.equal(related.candidateAt('alpha-beta').assessment.outcome, 'opportunity');
  assert.equal(related.candidateAt('alpha-beta-delta').assessment.outcome, 'opportunity');
  assert.deepEqual(related.candidateAt('alpha-beta').assessment.selection, {
    status: 'unresolved',
    decision: 'opportunity-selection',
    relatedOpportunities: [{ prefix: ['alpha', 'beta', 'delta'] }],
  });
});

test('without a policy: discovery, relations and member sets are prepared, and no outcome is', () => {
  const { record, directory } = runCase(byId.E1, { policy: null });
  assert.deepEqual(record.preparation, { status: 'prepared' });
  assert.deepEqual(record.assessment, { status: 'configuration-unavailable', reason: 'experimental-policy-absent', policy: null });
  assert.equal(record.evidenceOnly, true);
  assert.ok(directory.candidates.length > 0 && directory.relations.length > 0);
  assert.ok(directory.candidates.every((candidate) => candidate.assessment === undefined && candidate.memberSets.supported.length > 0));
});

test('an invalid policy is reported and produces no outcome', () => {
  const unsupported = withDecision('opportunity-selection', { status: 'resolved', value: 'first' });
  const { record, directory } = runCase(byId.E1, { policy: unsupported });
  assert.equal(record.assessment.status, 'configuration-unavailable');
  assert.equal(record.assessment.reason, 'experimental-policy-invalid');
  assert.deepEqual(record.assessment.problems, ['decision-value:opportunity-selection']);
  assert.ok(directory.candidates.every((candidate) => candidate.assessment === undefined));

  assert.deepEqual(validateTreeEmergentBoundaryPolicy(EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY), { valid: true, problems: [] });
  assert.deepEqual(validateTreeEmergentBoundaryPolicy({ ...EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY, policyStatus: 'adopted' }).problems, ['policy-status']);
  const { 'coverage-share': _omitted, ...missing } = EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY.decisions;
  assert.deepEqual(validateTreeEmergentBoundaryPolicy({ ...EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY, decisions: missing }).problems, ['decision:coverage-share']);
});

test('without evaluated Stage 2 reasoning nothing is prepared', () => {
  const { record } = runCase(byId.E1, { parameterSet: NOT_PREPARED_TREE_SEMANTIC_HOME_PARAMETER_SET });
  assert.deepEqual(record.preparation, { status: 'not-prepared', reason: 'semantic-home-reasoning-not-evaluated' });
  assert.equal(record.directories, undefined);
});

test('the record is frozen, deterministic, and holds a copy of the policy it used', () => {
  const first = runCase(byId.E8).record;
  const second = runCase(byId.E8).record;
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.directories[0].candidates[0]));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(first.assessment.policy, JSON.parse(JSON.stringify(EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY)));
  assert.notEqual(first.assessment.policy.decisions, EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY.decisions);
  assert.deepEqual(first.discoveryLimits, ['singular-plural-relationship', 'relationships-away-from-leading-tokens']);
});
