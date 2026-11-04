// Role-category vocabulary on the wiring path (Tree spec S1.1–S1.3; bridge contract §4.9;
// calculogic-validator#162, evidence-only slice): trust by execution origin, strict run provenance,
// independence of Stage 1A/Stage 1/Stage 2, and behavior preservation in every state.
//
// Behavior preservation: with the intake implemented and Stage 3 unchanged, the Stage 3 record and the Tree
// report are byte-identical to the run without the section, for every state; the bridge payload gains the
// section whenever a vocabulary input exists, and the intake record exists exactly when the section does.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveActiveRegistrySet } from '../../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { prepareNamingTreeStagingInputs, runNamingValidator } from '../../naming/src/naming-validator.host.mjs';
import { NAMING_CATEGORY_ROLE_PERSPECTIVE_REGISTRY_ID } from '../../naming/src/naming-role-category-vocabulary.logic.mjs';
import { prepareTreeStructureAdvisorInputs } from '../src/tree-structure-advisor.wiring.mjs';
import { runTreeStructureAdvisor as runTreeStructureAdvisorRuntime } from '../src/tree-structure-advisor.logic.mjs';
import { toTreeUsableRoleCategoryVocabulary } from '../src/tree-role-category-vocabulary-evidence.logic.mjs';
import { EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY } from './fixtures/emergent-boundary-catalogue/emergent-boundary-experimental-policy.fixture.mjs';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

// A consumer-style target whose files carry role facts in three categories, with a `src` candidate whose
// S3.6 assessment involves the responsibility decision, so the Stage 3 comparison covers that reasoning.
const FILES = [
  ...['ledger-entry', 'ledger-balance', 'ledger-audit', 'ledger-export'].map((name) => `src/ledger/${name}.logic.mjs`),
  ...['ledger-config', 'ledger-tokens'].map((name) => `src/ledger/${name}.knowledge.mjs`),
  'src/ledger/ledger-runtime.wiring.mjs',
  'src/report/report-panel.view.mjs',
  'src/report/report-summary.logic.mjs',
  'src/report/report-table.logic.mjs',
  ...['billing-invoice', 'billing-refund', 'billing-charge', 'billing-ledger'].map((name) => `src/${name}.logic.mjs`),
  'src/billing-runtime.wiring.mjs',
  'src/billing-rules.knowledge.mjs',
  'src/billing-notes.spec.md',
];

const withTarget = (run) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-role-category-vocabulary-'));
  try {
    for (const relativePath of FILES) {
      fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
      fs.writeFileSync(path.join(root, relativePath), 'export {};\n');
    }
    return run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

const STAGE_ONE_KEYS = ['treeNamingSectionIntake', 'treeFolderFactEvidence', 'treeFolderSemanticEvidence', 'treeSemanticHomeParameterSet', 'treeFolderSemanticHomeReasoning'];
const prepare = (root, options) => {
  const prepared = prepareTreeStructureAdvisorInputs(root, { scope: 'repo', emergentBoundaryPolicy: EMERGENT_BOUNDARY_EXPERIMENTAL_POLICY, ...options });
  const deps = prepared.preparedDependencies;
  return {
    deps,
    payload: deps.addressedNamingOccurrenceBridge,
    intake: deps.treeRoleCategoryVocabularyIntake,
    hasIntakeDependency: 'treeRoleCategoryVocabularyIntake' in deps,
    stage3: JSON.stringify(deps.treeEmergentBoundaryReasoning),
    report: JSON.stringify(runTreeStructureAdvisorRuntime(prepared)),
    stageOne: JSON.stringify(STAGE_ONE_KEYS.map((key) => deps[key])),
    lexicalAndPackage: JSON.stringify([deps.treeLexicalIdentityIntake ?? null, deps.treeRepositoryPackageIntake ?? null]),
  };
};
const withoutVocabulary = ({ roleCategoryVocabulary, ...staged }) => staged;
const withoutSection = ({ namingRoleCategoryVocabulary, ...payload }) => payload;
const withProvenance = (registryResolution, entry) => ({
  ...registryResolution,
  registryProvenance: {
    ...registryResolution.registryProvenance,
    naming: { ...registryResolution.registryProvenance.naming, [NAMING_CATEGORY_ROLE_PERSPECTIVE_REGISTRY_ID]: entry },
  },
});

// Every scenario, prepared once per target; each pairs the run with its no-section control on the same route.
const SCENARIOS = withTarget((root) => {
  const registryResolution = resolveActiveRegistrySet({ targetRoot: root });
  const staged = prepareNamingTreeStagingInputs(runNamingValidator(root, { scope: 'repo', registryResolution }), { registryResolution });
  const vocabulary = staged.roleCategoryVocabulary;
  const run = (options) => prepare(root, { registryResolution, ...withoutVocabulary(staged), ...options });
  const treeBuiltControl = run({});
  const treeBuilt = run({ roleCategoryVocabulary: vocabulary });
  // The caller-supplied route: the Tree-built payload itself, `bridgeSource: 'calculogic-validator/naming'`
  // and matching provenance included, supplied as a payload; and the same payload without the section.
  const callerControl = run({ namingOccurrenceBridge: withoutSection(treeBuilt.payload) });
  const callerSupplied = run({ namingOccurrenceBridge: treeBuilt.payload });
  const callerWith = (sectionOverrides) => run({ namingOccurrenceBridge: { ...treeBuilt.payload, namingRoleCategoryVocabulary: { ...treeBuilt.payload.namingRoleCategoryVocabulary, ...sectionOverrides } } });
  const observedCategory = 'architecture-support';
  return {
    vocabulary,
    registryResolution,
    treeBuiltControl,
    treeBuilt,
    callerControl,
    callerSupplied,
    unsupported: callerWith({ contractVersion: 'naming-role-category-vocabulary.v2' }),
    invalid: callerWith({ recordCount: 99 }),
    // Tree-built, with the run's provenance entry differing or missing.
    digestMismatch: run({ roleCategoryVocabulary: vocabulary, registryResolution: withProvenance(registryResolution, { source: 'builtin', digest: 'another-digest' }) }),
    sourceMismatch: run({ roleCategoryVocabulary: { ...vocabulary, registrySource: 'custom' } }),
    // The run's resolution has no entry for the perspective registry; and a direct call with no registry
    // resolution at all (Builtin roots), handed a vocabulary anyway.
    noRunProvenance: run({ roleCategoryVocabulary: vocabulary, registryResolution: withProvenance(registryResolution, undefined) }),
    noResolution: prepare(root, { ...withoutVocabulary(staged), roleCategoryVocabulary: vocabulary }),
    noResolutionControl: prepare(root, withoutVocabulary(staged)),
    // Tree-built, provenance matching, but missing a category this target's accepted §4.5 records carry.
    inconsistent: run({ roleCategoryVocabulary: { ...vocabulary, records: vocabulary.records.filter((record) => record.category !== observedCategory) } }),
    observedCategory,
  };
});

test('the target carries role facts in several categories, and the run has provenance', () => {
  const categories = new Set(
    SCENARIOS.treeBuilt.deps.treeNamingSectionIntake.semanticEvidenceEnrichment.acceptedRecords
      .filter((record) => record.roleFactGroup === 'accepted')
      .map((record) => record.roleCategory),
  );
  assert.deepEqual([...categories].sort(), ['architecture-support', 'concern-core', 'documentation']);
  assert.equal(SCENARIOS.vocabulary.registrySource, 'builtin');
});

test('acceptance 2: Tree-built through the Naming producer, provenance matching, consistent → usable', () => {
  const { treeBuilt, vocabulary } = SCENARIOS;
  assert.equal(treeBuilt.intake.state, 'usable');
  assert.equal(treeBuilt.intake.bridgeOrigin, 'tree-built');
  assert.deepEqual(toTreeUsableRoleCategoryVocabulary(treeBuilt.intake), vocabulary);
  assert.equal(treeBuilt.payload.namingRoleCategoryVocabulary.recordCount, vocabulary.records.length);
});

test('acceptance 1: the caller-supplied branch is untrusted, whatever the payload claims; nothing is available to S3.6', () => {
  const { callerSupplied, treeBuilt, registryResolution } = SCENARIOS;
  const payload = callerSupplied.payload;
  // Well-formed, declared provenance matching the run's, and the payload names Naming as its source.
  assert.equal(payload.bridgeSource, 'calculogic-validator/naming');
  assert.deepEqual(payload.namingRoleCategoryVocabulary, treeBuilt.payload.namingRoleCategoryVocabulary);
  assert.equal(payload.namingRoleCategoryVocabulary.categoryRolePerspectiveDigest, registryResolution.registryProvenance.naming[NAMING_CATEGORY_ROLE_PERSPECTIVE_REGISTRY_ID].digest);
  assert.equal(callerSupplied.intake.state, 'untrusted');
  assert.equal(callerSupplied.intake.bridgeOrigin, 'caller-supplied');
  assert.equal(callerSupplied.intake.vocabulary, null);
  assert.equal(toTreeUsableRoleCategoryVocabulary(callerSupplied.intake), null);
});

test('acceptance 3: no vocabulary input → no section, no intake record, no prepared dependency', () => {
  const { treeBuiltControl, callerControl } = SCENARIOS;
  for (const control of [treeBuiltControl, callerControl]) {
    assert.equal('namingRoleCategoryVocabulary' in control.payload, false);
    assert.equal(control.intake, undefined);
    assert.equal(control.hasIntakeDependency, false);
  }
});

test('acceptance 4, 5, 6, 8 on the wiring path: unsupported, invalid, inconsistent and mismatched', () => {
  const { unsupported, invalid, digestMismatch, sourceMismatch, noRunProvenance, noResolution, inconsistent, observedCategory } = SCENARIOS;
  assert.equal(unsupported.intake.state, 'unsupported');
  assert.equal(invalid.intake.state, 'invalid');
  assert.deepEqual([digestMismatch, sourceMismatch, noRunProvenance, noResolution].map((scenario) => [scenario.intake.state, scenario.intake.diagnostics[0].reason]), [
    ['mismatched', 'digest-mismatch'],
    ['mismatched', 'source-mismatch'],
    ['mismatched', 'run-provenance-unavailable'],
    ['mismatched', 'run-provenance-unavailable'],
  ]);
  assert.equal(inconsistent.intake.state, 'inconsistent');
  assert.deepEqual(inconsistent.intake.diagnostics[0].missingCategories, [observedCategory]);
  for (const scenario of [unsupported, invalid, digestMismatch, sourceMismatch, noRunProvenance, noResolution, inconsistent]) {
    assert.equal(toTreeUsableRoleCategoryVocabulary(scenario.intake), null);
    assert.equal(scenario.hasIntakeDependency, true);
  }
});

test('acceptance 10 and 11: Stage 1A/1/2, the other intakes, Stage 3 and the report are byte-identical in every state', () => {
  const { treeBuiltControl, callerControl, noResolutionControl, treeBuilt, callerSupplied, unsupported, invalid, digestMismatch, sourceMismatch, noRunProvenance, noResolution, inconsistent } = SCENARIOS;
  const byRoute = [
    [treeBuiltControl, { usable: treeBuilt, digestMismatch, sourceMismatch, noRunProvenance, inconsistent }],
    [callerControl, { untrusted: callerSupplied, unsupported, invalid }],
    [noResolutionControl, { noResolution }],
  ];
  for (const [control, scenarios] of byRoute) {
    for (const [name, scenario] of Object.entries(scenarios)) {
      assert.equal(scenario.stageOne, control.stageOne, `${name}: Stage 1A, Stage 1 and Stage 2 (conformance included)`);
      assert.equal(scenario.lexicalAndPackage, control.lexicalAndPackage, `${name}: other intakes`);
      assert.equal(scenario.stage3, control.stage3, `${name}: Stage 3`);
      assert.equal(scenario.report, control.report, `${name}: report`);
      // The §4.5 section is unchanged by the vocabulary.
      assert.deepEqual(scenario.payload.namingSemanticEvidenceEnrichment, control.payload.namingSemanticEvidenceEnrichment, name);
    }
  }
  // The payload differs only by the section.
  assert.deepEqual(withoutSection(treeBuilt.payload), treeBuiltControl.payload);
  // Stage 2 conformance is reported, and Stage 3 has evidence (the comparisons above are not vacuous).
  const conformance = JSON.parse(treeBuilt.report).semanticHomeReasoning.conformance;
  assert.ok(conformance);
  assert.deepEqual(conformance, JSON.parse(treeBuiltControl.report).semanticHomeReasoning.conformance);
  const candidates = treeBuilt.deps.treeEmergentBoundaryReasoning.directories.flatMap((directory) => directory.candidates ?? []);
  assert.ok(candidates.some((candidate) => JSON.stringify(candidate.assessment).includes('responsibility-class-mapping')));
});

test('acceptance 11: Stage 3 reads no vocabulary, and `joiningFileCanLeaveClassUnresolved` is still the fixed `true`', () => {
  const stage3Source = fs.readFileSync(path.join(REPO_ROOT, 'tree/src/tree-emergent-boundary-reasoning.logic.mjs'), 'utf8');
  assert.match(stage3Source, /joiningFileCanLeaveClassUnresolved: true,/u);
  assert.doesNotMatch(stage3Source, /role-category-vocabulary|RoleCategoryVocabulary/u);
});

test('trust comes from the execution branch: the wiring never reads the payload `bridgeSource` for it', () => {
  const wiringSource = fs.readFileSync(path.join(REPO_ROOT, 'tree/src/tree-structure-advisor.wiring.mjs'), 'utf8');
  assert.match(wiringSource, /const bridgeOrigin = namingOccurrenceBridge \? TREE_BRIDGE_ORIGINS\.callerSupplied : TREE_BRIDGE_ORIGINS\.treeBuilt;/u);
  assert.doesNotMatch(wiringSource, /\.bridgeSource\b/u);
});

test('runner transport: the Tree registry hook forwards the staged value unchanged', () => {
  const hookSource = fs.readFileSync(path.join(REPO_ROOT, 'src/core/validator-registry.knowledge.mjs'), 'utf8');
  assert.match(hookSource, /roleCategoryVocabulary: options\.roleCategoryVocabulary,/u);
});
