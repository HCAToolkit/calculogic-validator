// Selection evidence cases SE-1 to SE-4 (Tree spec S3.13.9; calculogic-validator#175, slice S3). Each case
// runs through the real Stage 1 preparers, Stage 2A and Stage 3 reasoning. The test checks the recorded
// structural evidence only; the cases' domain interpretation is never checked against reasoning. The
// hypothetical strategies are computed by a test-only reference and compared; none is adopted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EMERGENT_BOUNDARY_CATALOGUE } from './fixtures/emergent-boundary-catalogue/emergent-boundary-catalogue-cases.fixture.mjs';
import { EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY } from './fixtures/emergent-boundary-catalogue/emergent-boundary-experimental-policy.fixture.mjs';
import { innerOnly, nestingLevels, outerOnly, relatedOpportunitiesOf, remainderBased, remainderUnits } from './fixtures/emergent-boundary-catalogue/emergent-boundary-selection-strategies-reference.fixture.mjs';
import { buildCatalogueCase, files } from './fixtures/semantic-home-catalogue/semantic-home-catalogue.fixture.mjs';
import { prepareTreeEmergentBoundaryReasoning } from '../src/tree-emergent-boundary-reasoning.logic.mjs';
import { getBuiltinTreeEmergentBoundaryPolicy } from '../src/registries/tree-emergent-boundary-policy-loader.logic.mjs';
import { createTreeLexicalRelation, prepareTreeLexicalIdentityIntake } from '../src/tree-lexical-identity-evidence.logic.mjs';
import { evaluateEmergentBoundaryEligibility, collectEmergentBoundaryOpportunityFindings } from '../src/contributors/tree-emergent-boundary-opportunity-contributor.logic.mjs';
import { projectNamingTokenLexicalIdentities } from '../../naming/src/naming-token-lexical-identity-projection.logic.mjs';
import { prepareLinguisticFoundation } from '../../linguistic-foundation/src/linguistic-foundation.wiring.mjs';

const CASES = EMERGENT_BOUNDARY_CATALOGUE.selectionCases;
const prefixKey = (prefix) => prefix.join('-');
const english = prepareLinguisticFoundation({ profileSelection: { profileId: 'english' } }).profile;
const TREE = fs.readFileSync(new URL('../../doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md', import.meta.url), 'utf8');

// One case through Stage 1, Stage 2A and Stage 3, under the adopted policy unless `policy` overrides it;
// `profile` adds the lexical-identity section as Naming's producer projects it.
const runCase = (entry, { policy, profile } = {}) => {
  const built = buildCatalogueCase({
    files: entry.tree.files.flatMap(({ dir, root, count, ...options }) => files(dir, root, count, options)),
    ...(profile
      ? {
          bridgeSections: ({ n1, n2Records }) => ({
            namingTokenLexicalIdentities: projectNamingTokenLexicalIdentities({ semanticEvidenceEnrichmentSection: { records: n1 }, folderLabelObservationSection: { records: n2Records }, lexicalProfile: profile }),
          }),
        }
      : {}),
  });
  const intake = prepareTreeLexicalIdentityIntake({ namingOccurrenceBridge: built.bridge, sectionIntake: built.sectionIntake });
  const record = prepareTreeEmergentBoundaryReasoning({
    factEvidence: built.factEvidence,
    semanticEvidence: built.semanticEvidence,
    sectionIntake: built.sectionIntake,
    semanticHomeReasoning: built.reasoning,
    adoptedPolicy: getBuiltinTreeEmergentBoundaryPolicy(),
    ...(policy ? { policy } : {}),
    lexicalRelation: createTreeLexicalRelation(intake),
    lexicalProfile: intake?.lexicalProfile ?? null,
  });
  const directory = record.directories.find((item) => item.path === entry.directory);
  return { record, directory, candidateAt: (key) => directory.candidates.find((candidate) => prefixKey(candidate.prefix) === key) };
};

for (const entry of CASES) {
  test(`${entry.id} (${entry.scenario}): candidates, members, relations, outcomes and unresolved selection, under the adopted and the experimental policy`, () => {
    for (const policy of [undefined, EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY]) {
      const { directory, candidateAt } = runCase(entry, { policy });
      const label = `${entry.id} ${policy ? 'experimental' : 'adopted'}`;
      assert.deepEqual(directory.candidates.map((candidate) => prefixKey(candidate.prefix)).sort(), entry.candidates.map((candidate) => prefixKey(candidate.prefix)).sort(), `${label}: candidates`);
      for (const expected of entry.candidates) {
        const key = prefixKey(expected.prefix);
        const candidate = candidateAt(key);
        const { assessment } = candidate;
        assert.deepEqual([...new Set(candidate.members.map((member) => member.semanticName))].sort(), [...expected.members].sort(), `${label} ${key}: members`);
        assert.ok(candidate.members.every((member) => member.set === 'supported'), `${label} ${key}: every member supported`);
        for (const relation of expected.relations) {
          const recorded = directory.relations.find((item) => item.candidates.some((ref) => prefixKey(ref.prefix) === key) && item.candidates.some((ref) => prefixKey(ref.prefix) === relation.to));
          assert.equal(recorded?.relation, relation.relation, `${label} ${key}: relation to ${relation.to}`);
        }
        assert.equal(assessment.completion, 'complete', `${label} ${key}: complete`);
        assert.deepEqual({ outcome: assessment.outcome, reasons: assessment.reasons }, expected.expected, `${label} ${key}: outcome`);
        if (expected.relatedOpportunities) {
          assert.deepEqual(assessment.selection.status, 'unresolved', `${label} ${key}: selection unresolved`);
          assert.equal(assessment.selection.decision, 'opportunity-selection');
          assert.deepEqual(assessment.selection.relatedOpportunities.map((ref) => prefixKey(ref.prefix)).sort(), [...expected.relatedOpportunities].sort(), `${label} ${key}: related opportunities`);
        } else {
          assert.equal(assessment.selection, undefined, `${label} ${key}: no selection without an opportunity`);
        }
      }
      // No unrecognized file, so coverage is complete and plays no part.
      assert.equal(directory.fileCount, directory.memberCount, `${label}: every file recognized`);
    }
  });

  test(`${entry.id}: the recorded structure, and what each hypothetical strategy would select`, () => {
    const { directory, candidateAt } = runCase(entry);
    const { structure } = entry;
    assert.equal(nestingLevels(directory), structure.levels);
    assert.deepEqual(outerOnly(directory), [structure.outer]);
    assert.deepEqual(relatedOpportunitiesOf(directory).map((candidate) => prefixKey(candidate.prefix)).sort(), [structure.outer, ...structure.nested].sort());
    for (const [key, units] of Object.entries(structure.primaryUnits)) assert.equal(candidateAt(key).assessment.evidence.primaryUnitCount, units, `${entry.id} ${key}: primary units`);
    if (structure.levels === 2) {
      assert.equal(remainderUnits(directory, structure.outer), structure.remainderUnits);
    } else {
      for (const [key, units] of Object.entries(structure.remainderUnitsByLevel)) {
        // Per step: the level's units outside the next level down, as a two-level remainder would read them.
        const next = structure.nested.find((nested) => nested.startsWith(`${key}-`) && nested.split('-').length === key.split('-').length + 1);
        const outside = [...new Set(candidateAt(key).members.map((member) => member.semanticName))].filter((unit) => !candidateAt(next).members.some((member) => member.semanticName === unit));
        assert.equal(outside.length, units, `${entry.id} ${key}: remainder over ${next}`);
      }
    }
    assert.deepEqual(outerOnly(directory), entry.strategies.outerOnly, `${entry.id}: outer-only`);
    assert.deepEqual(innerOnly(directory), entry.strategies.innerOnly, `${entry.id}: inner-only`);
    const remainder = remainderBased(directory);
    if (entry.strategies.remainderBased.defined === false) assert.deepEqual(remainder, { defined: false }, `${entry.id}: remainder-based is undefined`);
    else assert.deepEqual(remainder, entry.strategies.remainderBased, `${entry.id}: remainder-based`);
  });
}

test('SE-1 and SE-2: the recorded fields differ only in counts, so no fixed direction follows both interpretations', () => {
  const signatureOf = (entry) => {
    const { directory } = runCase(entry);
    const opportunities = relatedOpportunitiesOf(directory);
    return {
      relations: directory.relations.map((relation) => relation.relation).sort(),
      opportunities: opportunities
        .map((candidate) => ({
          prefixLength: candidate.prefix.length,
          completion: candidate.assessment.completion,
          outcome: candidate.assessment.outcome,
          reasons: candidate.assessment.reasons,
          categories: [...new Set(candidate.members.map((member) => member.roleCategory))],
          supporting: candidate.assessment.evidence.supportingMemberFileCount,
          unrecognized: candidate.evidence.evidenceQuality.nonMemberFileCount,
          coversWholeDirectory: candidate.evidence.separation.coversWholeDirectory,
        }))
        .sort((left, right) => left.prefixLength - right.prefixLength),
    };
  };
  const [se1, se2] = ['SE-1', 'SE-2'].map((id) => CASES.find((entry) => entry.id === id));
  assert.deepEqual(signatureOf(se1), signatureOf(se2), 'apart from counts, the two records are alike');
  assert.notDeepEqual(se1.interpretation.preferred, se2.interpretation.preferred, 'the interpretations differ');
  // Outer-only and inner-only each pick the same direction in both, so each contradicts one interpretation.
  for (const strategy of ['outerOnly', 'innerOnly']) {
    const agrees = [se1, se2].map((entry) => JSON.stringify(entry.strategies[strategy]) === JSON.stringify(entry.interpretation.preferred));
    assert.deepEqual(agrees.sort(), [false, true], strategy);
  }
  // Only the remainder separates them, and only for a threshold that is itself undecided: above 2, at most 5.
  assert.deepEqual([se1.structure.remainderUnits, se2.structure.remainderUnits], [2, 5]);
});

test('no case lets recorded fields alone determine a preferred boundary, and SE-3 and SE-4 carry no preferred reading', () => {
  for (const entry of CASES) assert.equal(entry.evidenceDetermines, false, entry.id);
  assert.deepEqual(CASES.filter((entry) => entry.interpretation.preferred === null).map((entry) => entry.id), ['SE-3', 'SE-4']);
  for (const entry of CASES) assert.ok(entry.interpretation.statement.length > 0, `${entry.id}: the interpretation is stated`);
});

test('EL5 holds for every case: with an active profile and the adopted policy, related opportunities are counted, never reported', () => {
  for (const entry of CASES) {
    const { record, directory } = runCase(entry, { profile: english });
    assert.ok(record.lexicalIdentity, `${entry.id}: the profile is active`);
    const opportunities = relatedOpportunitiesOf(directory).length;
    assert.deepEqual(evaluateEmergentBoundaryEligibility(record).counts, { eligible: 0, notEligible: { incomplete: 0, relatedOpportunity: opportunities, otherOutcome: 1 } }, entry.id);
    assert.deepEqual(collectEmergentBoundaryOpportunityFindings({ preparedDependencies: { treeEmergentBoundaryReasoning: record } }), [], entry.id);
  }
});

test('the selection cases stay apart from the S3.9 catalogue, and S3.13.9 records each one', () => {
  assert.deepEqual(CASES.map((entry) => entry.id), ['SE-1', 'SE-2', 'SE-3', 'SE-4']);
  assert.deepEqual(CASES.map((entry) => entry.scenario), ['inner-preferred', 'outer-preferred', 'two-coherent-subgroups', 'three-level-chain']);
  const s3_9 = [...EMERGENT_BOUNDARY_CATALOGUE.cases, ...EMERGENT_BOUNDARY_CATALOGUE.companions, ...EMERGENT_BOUNDARY_CATALOGUE.lexicalCompanions];
  assert.equal(s3_9.some((entry) => /^SE-/u.test(entry.id)), false);
  const from = TREE.indexOf('**Catalogue cases (calculogic-validator#175, slice S3).**');
  assert.ok(from >= 0, 'the evidence matrix exists');
  const matrix = TREE.slice(from, TREE.indexOf('\n\n', TREE.indexOf('| SE-4', from)));
  for (const entry of CASES) {
    const row = matrix.split('\n').find((line) => line.startsWith(`| ${entry.id} `));
    assert.ok(row, `${entry.id}: a matrix row`);
    const remainder = entry.structure.remainderUnits ?? Object.values(entry.structure.remainderUnitsByLevel).join(' and ');
    assert.ok(row.includes(`remainder ${remainder}`), `${entry.id}: the row states the remainder`);
  }
});
