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
import { prepareTreeEmergentBoundaryReasoning, validateTreeEmergentBoundaryPolicy } from '../src/tree-emergent-boundary-reasoning.logic.mjs';
import { NOT_PREPARED_TREE_SEMANTIC_HOME_PARAMETER_SET } from '../src/tree-semantic-home-parameter-set.logic.mjs';

const prefixKey = (prefix) => prefix.join('-');

const withDecision = (id, decision) => ({
  ...EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY,
  decisions: { ...EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY.decisions, [id]: decision },
});

// One catalogue case through Stage 1, Stage 2A and Stage 3; `policy: null` supplies none.
const runCase = (entry, { policy = EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY, parameterSet } = {}) => {
  const built = buildCatalogueCase({ files: entry.tree.files.flatMap(({ dir, root, count, ...options }) => files(dir, root, count, options)), parameterSet });
  const record = prepareTreeEmergentBoundaryReasoning({
    factEvidence: built.factEvidence,
    semanticEvidence: built.semanticEvidence,
    sectionIntake: built.sectionIntake,
    semanticHomeReasoning: built.reasoning,
    policy,
  });
  const directory = record.directories?.find((item) => item.path === entry.directory);
  const candidateAt = (prefix) => directory?.candidates.find((candidate) => prefixKey(candidate.prefix) === prefix);
  return { built, record, directory, candidateAt };
};

const byId = Object.fromEntries(EMERGENT_BOUNDARY_CATALOGUE.cases.map((entry) => [entry.id, entry]));

for (const entry of EMERGENT_BOUNDARY_CATALOGUE.cases) {
  test(`catalogue ${entry.id}: discovery, relations, member sets and outcomes under the experimental policy`, () => {
    const { directory, candidateAt } = runCase(entry);
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
      if (expected.memberSets) {
        for (const [set, names] of Object.entries(expected.memberSets)) {
          assert.deepEqual(candidate.members.filter((member) => member.set === set).map((member) => member.semanticName).sort(), [...names].sort(), `${label}: ${set} members`);
        }
      }

      const { assessment } = candidate;
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

test('E8: the explained candidate names its home; E2: the corresponding undetermined folder blocks the grouping', () => {
  const e8 = runCase(byId.E8);
  const home = e8.candidateAt('tree').assessment.home;
  assert.equal(e8.built.pathOfAddress.get(home.folderAddressPath), 'tree');
  assert.equal(e8.candidateAt('tree-known-roots').existingStructure.broaderSupportedHomes.length, 1, 'tree/ is recorded as broader, not decisive');
  const e2 = runCase(byId.E2);
  const blocking = e2.candidateAt('structural-addressing').existingStructure.correspondingUndeterminedCandidates;
  assert.deepEqual(blocking.map((candidateId) => e2.built.pathOfAddress.get(candidateId.folderAddressPath)), ['structural-addressing']);
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
  assert.deepEqual(unresolved.explanation, { reason: 'placement-undetermined', placementReason: 'home-elsewhere-undetermined' });
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
