// Acceptance tests C-1 to C-8 for the first Stage 3 advisory finding (Tree spec S3.13.2-S3.13.8, slice C;
// calculogic-validator#171): advisory eligibility (EL1-EL5) and findings derivation over the prepared
// `treeEmergentBoundaryReasoning` record, and the report's `meta.emergentBoundaryReasoning`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveActiveRegistrySet } from '../../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { runValidatorRunner } from '../../src/core/validator-runner.logic.mjs';
import { prepareRunLinguisticFoundation } from '../../src/core/config/validator-linguistic-profile.logic.mjs';
import { prepareNamingTreeStagingInputs, runNamingValidator } from '../../naming/src/naming-validator.host.mjs';
import { projectNamingTokenLexicalIdentities } from '../../naming/src/naming-token-lexical-identity-projection.logic.mjs';
import { prepareLinguisticFoundation } from '../../linguistic-foundation/src/linguistic-foundation.wiring.mjs';
import {
  EMERGENT_BOUNDARY_ELIGIBILITY_REASONS,
  TREE_EMERGENT_BOUNDARY_OPPORTUNITY_CODE,
  collectEmergentBoundaryOpportunityFindings,
  evaluateEmergentBoundaryEligibility,
} from '../src/contributors/tree-emergent-boundary-opportunity-contributor.logic.mjs';
import { toTreeEmergentBoundaryReasoningReport } from '../src/tree-emergent-boundary-reasoning-report.logic.mjs';
import { getBuiltinTreeEmergentBoundaryPolicy } from '../src/registries/tree-emergent-boundary-policy-loader.logic.mjs';
import { prepareTreeEmergentBoundaryReasoning } from '../src/tree-emergent-boundary-reasoning.logic.mjs';
import { createTreeLexicalRelation, prepareTreeLexicalIdentityIntake } from '../src/tree-lexical-identity-evidence.logic.mjs';
import { prepareTreeStructureAdvisorInputs } from '../src/tree-structure-advisor.wiring.mjs';
import { runTreeStructureAdvisor } from '../src/tree-structure-advisor.logic.mjs';
import { EMERGENT_BOUNDARY_CATALOGUE } from './fixtures/emergent-boundary-catalogue/emergent-boundary-catalogue-cases.fixture.mjs';
import { EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY } from './fixtures/emergent-boundary-catalogue/emergent-boundary-experimental-policy.fixture.mjs';
import { buildCatalogueCase, files } from './fixtures/semantic-home-catalogue/semantic-home-catalogue.fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CODE = TREE_EMERGENT_BOUNDARY_OPPORTUNITY_CODE;
const prefixKey = (prefix) => prefix.join('-');
const english = prepareLinguisticFoundation({ profileSelection: { profileId: 'english' } }).profile;
const adoptedPolicy = getBuiltinTreeEmergentBoundaryPolicy();

// One file named by its N1 tokens, as the catalogue declares them.
const file = (dir, tokens) => ({ dir, root: tokens[0], count: 1, tokens, semanticName: tokens.join('-') });
const specsOf = (entry) => entry.tree.files.flatMap(({ dir, root, count, ...options }) => files(dir, root, count, options));
const caseOf = (id) => [...EMERGENT_BOUNDARY_CATALOGUE.cases, ...EMERGENT_BOUNDARY_CATALOGUE.companions].find((entry) => entry.id === id);

// Synthetic: `cache-store` (5 units) and its nested `cache-store-index` (3 units) both reach a complete
// `opportunity`, so `opportunity-selection` is needed and unresolved (EL5).
const RELATED = [
  ...['alpha', 'beta'].map((rest) => file('lib', ['cache', 'store', rest])),
  ...['one', 'two', 'three'].map((rest) => file('lib', ['cache', 'store', 'index', rest])),
  file('lib', ['schema', 'parse']),
  file('lib', ['report', 'emit']),
];

// Stage 3 as Tree wiring composes it: the lexical intake from the same payload as Stage 1A, then the
// reasoning under the adopted policy, or under `override` when given. `edit` may alter the section.
const recordOf = (fileSpecs, { profile = english, override, adopted = adoptedPolicy, edit } = {}) => {
  const built = buildCatalogueCase({
    files: fileSpecs,
    ...(profile
      ? {
          bridgeSections: ({ n1, n2Records }) => {
            const projected = projectNamingTokenLexicalIdentities({ semanticEvidenceEnrichmentSection: { records: n1 }, folderLabelObservationSection: { records: n2Records }, lexicalProfile: profile });
            return { namingTokenLexicalIdentities: edit ? edit(projected) : projected };
          },
        }
      : {}),
  });
  const intake = prepareTreeLexicalIdentityIntake({ namingOccurrenceBridge: built.bridge, sectionIntake: built.sectionIntake });
  return prepareTreeEmergentBoundaryReasoning({
    factEvidence: built.factEvidence,
    semanticEvidence: built.semanticEvidence,
    sectionIntake: built.sectionIntake,
    semanticHomeReasoning: built.reasoning,
    ...(adopted ? { adoptedPolicy: adopted } : {}),
    ...(override ? { policy: override } : {}),
    lexicalRelation: createTreeLexicalRelation(intake),
    lexicalProfile: intake?.lexicalProfile ?? null,
  });
};
const findingsOf = (record) => collectEmergentBoundaryOpportunityFindings({ preparedDependencies: { treeEmergentBoundaryReasoning: record } });
const candidateOf = (record, directoryPath, prefix) =>
  record.directories.find((directory) => directory.path === directoryPath).candidates.find((candidate) => prefixKey(candidate.prefix) === prefix);

const E1 = recordOf(specsOf(caseOf('E1')));

test('the baseline: catalogue case E1 under the adopted policy and English yields exactly its one opportunity, with the contracted finding', () => {
  const findings = findingsOf(E1);
  assert.equal(findings.length, 1);
  const [finding] = findings;
  const candidate = candidateOf(E1, 'tree/src', 'semantic-home');
  const directory = E1.directories.find((entry) => entry.path === 'tree/src');
  assert.deepEqual(
    { code: finding.code, severity: finding.severity, path: finding.path, classification: finding.classification },
    { code: CODE, severity: 'info', path: 'tree/src', classification: 'advisory-structure' },
  );
  assert.match(finding.message, /Advisory only, not a misplacement\.$/u);
  assert.deepEqual(Object.keys(finding.details), ['basis', 'directory', 'candidate', 'members', 'evidence', 'decidedBy', 'policy', 'lexicalProfile', 'relatedCandidates']);
  assert.equal(finding.details.basis, 'emergent-boundary-opportunity');
  assert.deepEqual(finding.details.directory, { identity: directory.directory, path: 'tree/src' });
  assert.deepEqual(finding.details.candidate, { discoveryMethod: 'prefix-v0', prefix: ['semantic', 'home'], leadingTokens: candidate.leadingTokens });
  // The supported set only, sorted by occurrence address.
  const supported = candidate.members.filter((member) => member.set === 'supported');
  assert.equal(finding.details.members.length, supported.length);
  assert.deepEqual(finding.details.members.map((member) => member.path).sort(), supported.map((member) => member.path).sort());
  const addresses = finding.details.members.map((member) => member.occurrence.occurrenceAddress);
  assert.deepEqual(addresses, [...addresses].sort((left, right) => left.localeCompare(right)));
  for (const member of finding.details.members) assert.deepEqual(Object.keys(member), ['occurrence', 'path', 'semanticName', 'roleCategory']);
  assert.deepEqual(finding.details.evidence, {
    primaryUnitCount: candidate.assessment.evidence.primaryUnitCount,
    supportingMemberFileCount: candidate.assessment.evidence.supportingMemberFileCount,
    memberFileCount: candidate.members.length,
    directoryFileCount: candidate.evidence.evidenceQuality.directoryFileCount,
    directoryMemberCount: candidate.evidence.evidenceQuality.directoryMemberCount,
    unrecognizedFileCount: candidate.evidence.evidenceQuality.nonMemberFileCount,
  });
  assert.equal(finding.details.evidence.primaryUnitCount, 8);
  assert.deepEqual(finding.details.decidedBy, candidate.assessment.decidedBy);
  assert.deepEqual(finding.details.policy, { policyId: 'emergent-boundary', policyVersion: '1', registry: E1.assessment.policyRegistry });
  assert.deepEqual(finding.details.lexicalProfile, E1.lexicalIdentity.lexicalProfile);
  // No relation of `semantic-home` reaches a complete opportunity (EL5); each is listed with its partner's state.
  for (const related of finding.details.relatedCandidates) {
    assert.notEqual(related.relation, 'disjoint');
    assert.ok(!(related.completion === 'complete' && related.outcome === 'opportunity'), prefixKey(related.prefix));
  }
  // No folder name, move or proposal.
  for (const key of ['folderName', 'proposedFolder', 'moves', 'recommendation']) assert.equal(key in finding.details, false, key);
});

test('C-1: negating any one of EL1-EL5 alone yields no finding', () => {
  const negations = {
    'EL1 (experimental override)': recordOf(specsOf(caseOf('E1')), { override: EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY }),
    'EL1 (no policy)': recordOf(specsOf(caseOf('E1')), { adopted: null }),
    'EL2 (no profile)': recordOf(specsOf(caseOf('E1')), { profile: null }),
  };
  const mutate = (change) => {
    const record = structuredClone(E1);
    change(candidateOf(record, 'tree/src', 'semantic-home').assessment);
    return record;
  };
  negations['EL3 (incomplete)'] = mutate((assessment) => { assessment.completion = 'incomplete'; });
  negations['EL4 (other outcome)'] = mutate((assessment) => { assessment.outcome = 'insufficient-evidence'; });
  negations['EL5 (related opportunity)'] = mutate((assessment) => {
    assessment.selection = { status: 'unresolved', decision: 'opportunity-selection', relatedOpportunities: [{ prefix: ['semantic'] }] };
  });
  for (const [label, record] of Object.entries(negations)) assert.deepEqual(findingsOf(record), [], label);

  // The run conditions are named; the candidate conditions are counted.
  const reasonOf = (record) => toTreeEmergentBoundaryReasoningReport(record).reason;
  assert.equal(reasonOf(negations['EL1 (experimental override)']), EMERGENT_BOUNDARY_ELIGIBILITY_REASONS.policyNotAdopted);
  assert.equal(reasonOf(negations['EL1 (no policy)']), EMERGENT_BOUNDARY_ELIGIBILITY_REASONS.policyNotAdopted);
  assert.equal(reasonOf(negations['EL2 (no profile)']), EMERGENT_BOUNDARY_ELIGIBILITY_REASONS.languageProfileInactive);
  const base = evaluateEmergentBoundaryEligibility(E1).counts;
  const countsOf = (label) => evaluateEmergentBoundaryEligibility(negations[label]).counts;
  assert.deepEqual(countsOf('EL3 (incomplete)'), { eligible: 0, notEligible: { ...base.notEligible, incomplete: base.notEligible.incomplete + 1 } });
  assert.deepEqual(countsOf('EL4 (other outcome)'), { eligible: 0, notEligible: { ...base.notEligible, otherOutcome: base.notEligible.otherOutcome + 1 } });
  assert.deepEqual(countsOf('EL5 (related opportunity)'), { eligible: 0, notEligible: { ...base.notEligible, relatedOpportunity: base.notEligible.relatedOpportunity + 1 } });
});

test('C-1: real evidence for EL3 and EL5: incomplete candidates and a related pair of complete opportunities yield nothing', () => {
  const related = recordOf(RELATED);
  const pair = ['cache-store', 'cache-store-index'].map((prefix) => candidateOf(related, 'lib', prefix).assessment);
  for (const assessment of pair) {
    assert.deepEqual([assessment.completion, assessment.outcome, assessment.selection.status], ['complete', 'opportunity', 'unresolved']);
  }
  assert.deepEqual(findingsOf(related), []);
  assert.deepEqual(evaluateEmergentBoundaryEligibility(related).counts, { eligible: 0, notEligible: { incomplete: 0, relatedOpportunity: 2, otherOutcome: 1 } });

  // E8: its one complete opportunity is reported; its four incomplete candidates are counted, never reported.
  const e8 = recordOf(specsOf(caseOf('E8')));
  assert.deepEqual(evaluateEmergentBoundaryEligibility(e8).counts, { eligible: 1, notEligible: { incomplete: 4, relatedOpportunity: 0, otherOutcome: 2 } });
  assert.deepEqual(findingsOf(e8).map((finding) => `${finding.path} :: ${prefixKey(finding.details.candidate.prefix)}`), ['doc/specs :: tree-known-roots']);
});

test('C-2: exclusion erases nothing: the record is deep-equal before and after eligibility, derivation and the report summary', () => {
  for (const [label, record] of [['E1', E1], ['E8', recordOf(specsOf(caseOf('E8')))], ['related', recordOf(RELATED)], ['no profile', recordOf(RELATED, { profile: null })]]) {
    const before = structuredClone(record);
    findingsOf(record);
    toTreeEmergentBoundaryReasoningReport(record);
    evaluateEmergentBoundaryEligibility(record);
    assert.deepEqual(record, before, label);
  }
  // The excluded candidates keep every recorded field: the incomplete ones their unresolved decisions,
  // the related pair its outcomes, relation and unresolved selection.
  const e8 = recordOf(specsOf(caseOf('E8')));
  findingsOf(e8);
  const incomplete = e8.directories.flatMap((directory) => directory.candidates).filter((candidate) => candidate.assessment.completion === 'incomplete');
  assert.equal(incomplete.length, 4);
  for (const candidate of incomplete) {
    assert.ok(candidate.assessment.unresolvedDecisions.length > 0, prefixKey(candidate.prefix));
    assert.ok('blockedAt' in candidate.assessment, prefixKey(candidate.prefix));
  }
  const related = recordOf(RELATED);
  findingsOf(related);
  const lib = related.directories.find((directory) => directory.path === 'lib');
  assert.ok(lib.relations.some((relation) => relation.relation === 'nested-subgroup' && relation.candidates.map((ref) => prefixKey(ref.prefix)).join(' ') === 'cache-store cache-store-index'));
  assert.deepEqual(candidateOf(related, 'lib', 'cache-store').assessment.selection, { status: 'unresolved', decision: 'opportunity-selection', relatedOpportunities: [{ prefix: ['cache', 'store', 'index'] }] });
  // A frozen record derives the same findings: derivation writes nothing.
  const deepFreeze = (value) => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const item of Object.values(value)) deepFreeze(item);
    }
    return value;
  };
  assert.deepEqual(findingsOf(deepFreeze(structuredClone(E1))), findingsOf(E1));
});

test('C-3: D-T2: no profile, or a requested profile whose section is unavailable, yields no Stage 3 finding', () => {
  const plain = recordOf(specsOf(caseOf('E1')), { profile: null });
  assert.equal('lexicalIdentity' in plain, false);
  assert.equal(candidateOf(plain, 'tree/src', 'semantic-home').assessment.outcome, 'opportunity', 'the assessment is prepared as usual');
  assert.deepEqual(findingsOf(plain), []);
  for (const [label, edit] of [
    ['unsupported', (section) => ({ ...section, contractVersion: '999' })],
    ['invalid', () => []],
  ]) {
    const record = recordOf(specsOf(caseOf('E1')), { edit });
    assert.equal('lexicalIdentity' in record, false, label);
    assert.deepEqual(findingsOf(record), [], label);
    assert.deepEqual(toTreeEmergentBoundaryReasoningReport(record), {
      status: 'not-evaluated',
      reason: 'language-profile-inactive',
      policySource: 'adopted',
      policy: { policyId: 'emergent-boundary', policyVersion: '1', registry: record.assessment.policyRegistry },
      lexicalProfileActive: false,
      governedCodes: [CODE],
    }, label);
  }
});

test('C-4: an experimental override yields no finding, even with a profile', () => {
  const record = recordOf(specsOf(caseOf('E1')), { override: EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY });
  assert.equal(record.assessment.policySource, 'experimental-override');
  assert.ok(record.lexicalIdentity, 'the profile is active');
  assert.equal(candidateOf(record, 'tree/src', 'semantic-home').assessment.outcome, 'opportunity');
  assert.deepEqual(findingsOf(record), []);
  const report = toTreeEmergentBoundaryReasoningReport(record);
  assert.deepEqual([report.status, report.reason, report.policySource, report.lexicalProfileActive, 'eligibility' in report], ['not-evaluated', 'policy-not-adopted', 'experimental-override', true, false]);
  assert.deepEqual(report.policy, { policyId: 'emergent-boundary-experimental', policyVersion: EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY.policyVersion });
});

// S3.13.4: the known-gap cases that block findings: a known gap that holds under an active profile, whose
// lexical companion is a known gap too, or that has no lexical companion.
const knownGapsBlockingFindings = (catalogue) => {
  const all = [...catalogue.cases, ...catalogue.companions, ...catalogue.lexicalCompanions];
  return all
    .filter((entry) => entry.knownGap)
    .filter((entry) => {
      if (entry.lexicalProfile) return true;
      const companion = all.find((item) => item.lexicalCompanionOf === entry.id);
      return !companion || Boolean(companion.knownGap);
    })
    .map((entry) => entry.id);
};

test('C-5: known-gap guard: no catalogue known-gap case holds under an active profile', () => {
  const all = [...EMERGENT_BOUNDARY_CATALOGUE.cases, ...EMERGENT_BOUNDARY_CATALOGUE.companions];
  assert.deepEqual(all.filter((entry) => entry.knownGap).map((entry) => entry.id), ['E10', 'E10.1'], 'E10 and E10.1 stay known-gap cases');
  assert.deepEqual(knownGapsBlockingFindings(EMERGENT_BOUNDARY_CATALOGUE), []);
  // Adding one fails the check: a known gap under the profile, or a known gap without a lexical companion.
  const extended = (extra) => ({ ...EMERGENT_BOUNDARY_CATALOGUE, ...extra });
  const gapUnderProfile = { ...EMERGENT_BOUNDARY_CATALOGUE.lexicalCompanions[0], knownGap: { ...caseOf('E10').knownGap } };
  assert.deepEqual(knownGapsBlockingFindings(extended({ lexicalCompanions: [gapUnderProfile, ...EMERGENT_BOUNDARY_CATALOGUE.lexicalCompanions.slice(1)] })), ['E10', 'E10-L']);
  const gapWithoutCompanion = { ...caseOf('E1'), id: 'E99', knownGap: { ...caseOf('E10').knownGap } };
  assert.deepEqual(knownGapsBlockingFindings(extended({ cases: [...EMERGENT_BOUNDARY_CATALOGUE.cases, gapWithoutCompanion] })), ['E99']);
});

// One real run of this repository, Naming staged once, with and without the English profile.
const registryResolution = resolveActiveRegistrySet({ targetRoot: ROOT });
const foundation = prepareRunLinguisticFoundation({ version: '0.1', linguisticProfile: { profileId: 'english' } });
const runnerReport = (linguisticFoundation) => runValidatorRunner(ROOT, { validators: ['tree-structure-advisor'], scope: 'repo', ...(linguisticFoundation ? { linguisticFoundation } : {}) });
const treeEntryOf = (report) => report.validators.find((entry) => entry.id === 'tree-structure-advisor');

test('C-6: this repository at `repo` scope: English adds exactly the `tree/src` `semantic-home` finding; without a profile none; every other finding is unchanged', () => {
  const [without, withEnglish] = [treeEntryOf(runnerReport(null)), treeEntryOf(runnerReport(foundation))];
  const stageThree = (entry) => entry.findings.filter((finding) => finding.code === CODE);
  const others = (entry) => entry.findings.filter((finding) => finding.code !== CODE);
  assert.deepEqual(stageThree(without), []);
  assert.deepEqual(others(withEnglish), others(without));
  const [finding] = stageThree(withEnglish);
  assert.equal(stageThree(withEnglish).length, 1);
  assert.deepEqual([finding.path, prefixKey(finding.details.candidate.prefix), finding.severity], ['tree/src', 'semantic-home', 'info']);
  assert.equal(finding.details.members.length, 9);
  assert.equal(finding.details.evidence.primaryUnitCount, 8);
  assert.equal(finding.details.policy.registry.source, 'builtin');
  // The entry counts it under its classification and code; every other count is unchanged.
  assert.deepEqual(withEnglish.counts, { ...without.counts, 'advisory-structure': without.counts['advisory-structure'] + 1 });
  assert.deepEqual(withEnglish.codeCounts, { ...without.codeCounts, [CODE]: 1 });

  assert.deepEqual(without.meta.emergentBoundaryReasoning, {
    status: 'not-evaluated',
    reason: 'language-profile-inactive',
    policySource: 'adopted',
    policy: { policyId: 'emergent-boundary', policyVersion: '1', registry: finding.details.policy.registry },
    lexicalProfileActive: false,
    governedCodes: [CODE],
  });
  const summary = withEnglish.meta.emergentBoundaryReasoning;
  assert.deepEqual([summary.status, summary.policySource, summary.lexicalProfileActive, summary.eligibility.eligible], ['evaluated', 'adopted', true, 1]);
  assert.equal('reason' in summary, false);
  assert.deepEqual(Object.keys(summary.eligibility.notEligible), ['incomplete', 'relatedOpportunity', 'otherOutcome']);
});

test('C-7: determinism: two runs are identical, and findings follow path, code, then prefix, whatever the record order', () => {
  assert.equal(JSON.stringify(treeEntryOf(runnerReport(foundation))), JSON.stringify(treeEntryOf(runnerReport(foundation))));
  // Two eligible candidates in one directory and one in another.
  const specs = [
    ...['alpha', 'beta', 'gamma'].map((rest) => file('lib', ['schema', 'parse', rest])),
    ...['alpha', 'beta', 'gamma'].map((rest) => file('lib', ['cache', 'store', rest])),
    file('lib', ['report', 'emit']),
    file('lib', ['path', 'join']),
    ...['alpha', 'beta', 'gamma'].map((rest) => file('app', ['view', 'model', rest])),
    file('app', ['main', 'entry']),
    file('app', ['route', 'table']),
  ];
  const record = recordOf(specs);
  const reversed = structuredClone(record);
  reversed.directories.reverse();
  for (const directory of reversed.directories) directory.candidates.reverse();
  const order = (findings) => findings.map((finding) => `${finding.path} :: ${prefixKey(finding.details.candidate.prefix)}`);
  const prepared = (value) => ({ preparedDependencies: { treeEmergentBoundaryReasoning: value } });
  // The Tree runtime sorts by path, then code (stable); the contributor emits each directory's findings by prefix.
  const sortByPathThenCode = (left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code);
  const expected = ['app :: view-model', 'lib :: cache-store', 'lib :: schema-parse'];
  assert.deepEqual(order(collectEmergentBoundaryOpportunityFindings(prepared(record)).sort(sortByPathThenCode)), expected);
  assert.deepEqual(order(collectEmergentBoundaryOpportunityFindings(prepared(reversed)).sort(sortByPathThenCode)), expected);
});

test('C-8: ownership: the contributor reads only the prepared record, computes no assessment, and is attached by its own wiring', () => {
  const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
  const importsOf = (source) => [...source.matchAll(/from '([^']+)'/gu)].map((match) => match[1]);
  const contributor = read('tree/src/contributors/tree-emergent-boundary-opportunity-contributor.logic.mjs');
  assert.deepEqual(importsOf(contributor), ['../tree-emergent-boundary-reasoning.knowledge.mjs'], 'vocabulary only: no reasoning, policy, loader or file-system module');
  for (const name of ['prepareTreeEmergentBoundaryReasoning', 'adoptedPolicy', 'decisions', 'minimum-primary-units', 'readFileSync']) {
    assert.equal(contributor.includes(name), false, name);
  }
  assert.deepEqual(importsOf(read('tree/src/contributors/tree-emergent-boundary-opportunity-contributor.wiring.mjs')), ['./tree-emergent-boundary-opportunity-contributor.logic.mjs']);
  assert.deepEqual(importsOf(read('tree/src/tree-emergent-boundary-reasoning-report.logic.mjs')), ['./contributors/tree-emergent-boundary-opportunity-contributor.logic.mjs']);
  assert.ok(read('tree/src/tree-structure-advisor-contributors-assembly.wiring.mjs').includes('attachTreeEmergentBoundaryOpportunityContributor()'));

  // At run level the record is identical with and without the contributor: running Tree changes nothing in it.
  const staged = prepareNamingTreeStagingInputs(runNamingValidator(ROOT, { scope: 'repo', registryResolution }), { registryResolution, linguisticFoundation: foundation });
  const prepared = prepareTreeStructureAdvisorInputs(ROOT, { scope: 'repo', registryResolution, ...staged });
  const before = structuredClone(prepared.preparedDependencies.treeEmergentBoundaryReasoning);
  const result = runTreeStructureAdvisor(prepared);
  assert.deepEqual(prepared.preparedDependencies.treeEmergentBoundaryReasoning, before);
  assert.equal(result.findings.filter((finding) => finding.code === CODE).length, 1);
});
