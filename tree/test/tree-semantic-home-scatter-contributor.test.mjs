import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runValidatorRunner } from '../../src/core/validator-runner.logic.mjs';
import { resolveActiveRegistrySet } from '../../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { prepareNamingTreeStagingInputs, runNamingValidator } from '../../naming/src/naming-validator.host.mjs';
import { prepareTreeStructureAdvisorInputs } from '../src/tree-structure-advisor.wiring.mjs';
import { buildCatalogueCase, files } from './fixtures/semantic-home-catalogue/semantic-home-catalogue.fixture.mjs';
import { SEMANTIC_HOME_CATALOGUE } from './fixtures/semantic-home-catalogue/semantic-home-catalogue-cases.fixture.mjs';
import { collectSemanticHomeScatterFindings } from '../src/contributors/tree-semantic-home-scatter-contributor.logic.mjs';
import { getBuiltinTreeSemanticHomeParameterSet } from '../src/registries/tree-semantic-home-parameter-set-loader.logic.mjs';
import { NOT_PREPARED_TREE_SEMANTIC_HOME_PARAMETER_SET } from '../src/tree-semantic-home-parameter-set.logic.mjs';
import { toTreeSemanticHomeReasoningReport } from '../src/tree-semantic-home-reasoning-report.logic.mjs';

// Stage 2B-i `TREE_FAMILY_SCATTERED` (Tree spec S2.12, B1-B8), on real Stage 1 and Stage 2A records.
const scatterOf = (built, validatorDevelopmentRoot = null, sectionIntake = built.sectionIntake) =>
  collectSemanticHomeScatterFindings({
    preparedDependencies: { treeFolderSemanticHomeReasoning: built.reasoning, treeNamingSectionIntake: sectionIntake },
    validatorDevelopmentRoot,
  });
const filesOf = (finding) => finding.details.files.map((file) => file.path);
const homePathsOf = (finding) => finding.details.homes.map((home) => home.folderPath);
const expand = ({ files: specs = [], folders, n2 }) => ({
  files: specs.flatMap(({ dir, root, count, ...options }) => files(dir, root, count, options)),
  ...(folders ? { folders } : {}),
  ...(n2 ? { n2 } : {}),
});
const catalogueCase = (id) => SEMANTIC_HOME_CATALOGUE.cases.find((entry) => entry.id === id);

test('positive evidence only: across the whole catalogue, exactly the home-elsewhere files are reported', () => {
  for (const entry of SEMANTIC_HOME_CATALOGUE.cases) {
    for (const run of [{ name: null, tree: entry.tree }, ...(entry.variants ?? [])]) {
      const built = buildCatalogueCase(expand(run.tree));
      const homeElsewhere = built.reasoning.placements.filter((placement) => placement.state === 'home-elsewhere').map((placement) => placement.path);
      const reported = scatterOf(built).flatMap(filesOf);
      assert.deepEqual(reported.sort(), homeElsewhere.sort(), `${entry.id}${run.name ? `/${run.name}` : ''}`);
    }
  }
});

test('inside-home, no-home and every undetermined placement never emit (C1, C2, C3, C7, C8, C13, C27)', () => {
  for (const id of ['C1', 'C2', 'C3', 'C7', 'C8', 'C13', 'C27']) {
    const built = buildCatalogueCase(expand(catalogueCase(id).tree));
    assert.deepEqual(scatterOf(built), [], id);
  }
  // RR1: a family spread over folders with no eligible home is not scattered from anything.
  const spread = buildCatalogueCase({ files: [...files('src/a', 'build', 1), ...files('src/b', 'build', 1), ...files('src/c', 'build', 1)] });
  assert.equal(spread.reasoning.placements.some((placement) => placement.state === 'home-elsewhere'), false);
  assert.deepEqual(scatterOf(spread), []);
});

test('the finding contract: info, outside-not-misplaced message, home identity, claims and per-file evidence (C11)', () => {
  const built = buildCatalogueCase(expand(catalogueCase('C11').tree));
  const [finding] = scatterOf(built);
  assert.deepEqual(
    { code: finding.code, severity: finding.severity, classification: finding.classification, ruleRef: finding.ruleRef },
    {
      code: 'TREE_FAMILY_SCATTERED',
      severity: 'info',
      classification: 'advisory-structure',
      ruleRef: 'calculogic-validator/doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md',
    },
  );
  assert.match(finding.message, /outside/u);
  assert.match(finding.message, /not a misplacement/u);
  assert.deepEqual(Object.keys(finding.details), ['basis', 'homes', 'files', 'fileCount']);
  assert.equal(finding.details.basis, 'semantic-home-placement');
  assert.deepEqual(homePathsOf(finding), ['platform']);
  const [home] = finding.details.homes;
  assert.deepEqual(home.folder, { addressProfileId: 'tree-codebase', addressedSnapshotId: 'catalogue', occurrenceAddress: built.reasoning.candidateOutcomes.find((outcome) => built.pathOfAddress.get(outcome.candidateId.folderAddressPath) === 'platform').candidateId.folderAddressPath });
  assert.deepEqual(home.qualifyingCandidates.map(({ governingChannel, claim }) => ({ governingChannel, claim })), [
    { governingChannel: 'root', claim: { channel: 'root', root: 'platform' } },
  ]);
  assert.equal(finding.details.fileCount, 4);
  assert.deepEqual(filesOf(finding), built.reasoning.placements.filter((placement) => placement.state === 'home-elsewhere').map((placement) => placement.path));
  for (const file of finding.details.files) {
    assert.deepEqual(file.matchedCandidates, [home.qualifyingCandidates[0].candidateId]);
    assert.ok(Array.isArray(file.otherCandidates));
    assert.equal(Object.hasOwn(file, 'pairedHomes'), false);
  }
  assert.equal(finding.path, [...filesOf(finding)].sort()[0]);
});

test('B1: one home per folder; two folders are two homes; subset home sets are separate findings', () => {
  // C12: the shared file matches two folders with the same claim: two homes, one finding.
  const c12 = buildCatalogueCase(expand(catalogueCase('C12').tree));
  const [shared] = scatterOf(c12);
  assert.deepEqual(homePathsOf(shared), ['apps/billing', 'services/billing']);
  assert.deepEqual(filesOf(shared), ['shared/billing-8.logic.mjs']);

  // Label and context candidates on one folder are one home with two qualifying candidates.
  const labelAndContext = buildCatalogueCase({ folders: [{ path: 'tree', context: 'tree' }], files: [...files('tree', 'tree', 5), ...files('other', 'tree', 1)] });
  const [oneHome] = scatterOf(labelAndContext);
  assert.deepEqual(homePathsOf(oneHome), ['tree']);
  assert.deepEqual(oneHome.details.homes[0].qualifyingCandidates.map(({ candidateId }) => candidateId.candidateSource), [
    'naming-folder-label',
    'naming-folder-semantic-context',
  ]);

  // A file matching homes {billing, billing-api} never shares a finding with one matching only {billing}.
  const subset = buildCatalogueCase({
    files: [
      ...files('billing', 'billing', 3),
      ...files('billing-api', 'billing', 3, { tokens: ['billing', 'api', 'x'] }),
      ...files('other', 'billing', 1, { tokens: ['billing', 'api', 'x'] }),
      ...files('other', 'billing', 1, { tokens: ['billing', 'core'] }),
    ],
  });
  const findings = scatterOf(subset);
  assert.deepEqual(findings.map((finding) => [homePathsOf(finding).sort(), filesOf(finding)]), [
    [['billing', 'billing-api'], ['other/billing-6.logic.mjs']],
    [['billing'], ['other/billing-7.logic.mjs']],
  ]);
  // B7: claims stay on their candidates, never merged into one.
  const claims = findings[0].details.homes.flatMap((home) => home.qualifyingCandidates.map(({ claim }) => claim));
  assert.deepEqual(claims.sort((left, right) => left.channel.localeCompare(right.channel)), [
    { channel: 'prefix', tokens: ['billing', 'api'] },
    { channel: 'root', root: 'billing' },
  ]);
  // A file's own matches are exact: the {billing}-only file names one candidate.
  assert.equal(findings[1].details.files[0].matchedCandidates.length, 1);
  // The same with the homes in the other address order: the key is the whole set, never one member of it.
  const reordered = buildCatalogueCase({
    files: [
      ...files('x/billing', 'billing', 3),
      ...files('a/billing-api', 'billing', 3, { tokens: ['billing', 'api', 'x'] }),
      ...files('other', 'billing', 1, { tokens: ['billing', 'api', 'x'] }),
      ...files('other', 'billing', 1, { tokens: ['billing', 'core'] }),
    ],
  });
  assert.deepEqual(scatterOf(reordered).map((finding) => homePathsOf(finding).sort()), [['a/billing-api', 'x/billing'], ['x/billing']]);
});

test('B7: undecisive candidates stay visible as otherCandidates (C28)', () => {
  const built = buildCatalogueCase(expand(catalogueCase('C28').tree));
  const [finding] = scatterOf(built);
  assert.deepEqual(filesOf(finding), ['docs/tree-15.logic.mjs']);
  assert.deepEqual(
    finding.details.files[0].otherCandidates.map(({ outcome, reason, relation, location }) => ({ outcome, reason, relation, location })),
    [{ outcome: 'undetermined', reason: 'claim-unresolved', relation: 'possible-root-reading', location: 'elsewhere' }],
  );
});

const pairingTree = (extra = []) => ({
  files: [
    ...files('tree', 'tree', 3),
    ...files('tree/tree-foo', 'tree', 3, { tokens: ['tree', 'foo', 'x'] }),
    ...files('src/widget', 'widget', 3),
    ...extra,
  ],
});

test('B2 (R2): a document is exempt only when paired with every home, under a validator development root', () => {
  // A `tree` document matches the top-level home `tree` and the nested home `tree/tree-foo`; both lie in
  // the owned area `tree` that its root names, so it is exempt (R2; a claim-equality rule would refuse the nested one).
  const paired = buildCatalogueCase(pairingTree(files('doc/specs', 'tree', 1, { tokens: ['tree', 'foo', 'y'] })));
  const pairedPlacement = paired.reasoning.placements.find((placement) => placement.path.startsWith('doc/'));
  assert.equal(pairedPlacement.state, 'home-elsewhere');
  assert.deepEqual(paired.pathsOf(pairedPlacement.elsewhereHomes).sort(), ['tree', 'tree/tree-foo']);
  assert.deepEqual(scatterOf(paired, '.'), []);
  // Installed consumers: nothing is paired.
  assert.deepEqual(scatterOf(paired, null).flatMap(filesOf), ['doc/specs/tree-9.logic.mjs']);

  // A document whose root names a different area than its home's (the suite-document shape) is reported.
  const unrelated = buildCatalogueCase(pairingTree(files('doc/specs', 'widget', 1)));
  assert.deepEqual(scatterOf(unrelated, '.').flatMap(filesOf), ['doc/specs/widget-9.logic.mjs']);

  // Paired with one home but not the other: reported, with the paired home listed.
  const partial = buildCatalogueCase({
    files: [...files('tree', 'tree', 3), ...files('src/tree', 'tree', 3), ...files('doc/specs', 'tree', 1)],
  });
  const [finding] = scatterOf(partial, '.');
  assert.deepEqual(homePathsOf(finding).sort(), ['src/tree', 'tree']);
  const treeHome = finding.details.homes.find((home) => home.folderPath === 'tree').folder;
  assert.deepEqual(finding.details.files[0].pairedHomes, [treeHome]);

  // A home inside `doc/` is documentation, not owned runtime: a document beside it is reported.
  // (`doc` itself is not a home: its direct files are foreign.)
  const docHome = buildCatalogueCase({
    files: [
      ...files('doc', 'other', 20),
      ...files('doc/doc-notes', 'doc', 3, { tokens: ['doc', 'notes', 'x'] }),
      ...files('doc/specs', 'doc', 1, { tokens: ['doc', 'notes', 'y'] }),
    ],
  });
  const docPlacement = docHome.reasoning.placements.find((placement) => placement.path.startsWith('doc/specs/'));
  assert.equal(docPlacement.state, 'home-elsewhere');
  assert.deepEqual(docHome.pathsOf(docPlacement.elsewhereHomes), ['doc/doc-notes']);
  assert.deepEqual(scatterOf(docHome, '.').flatMap(filesOf), ['doc/specs/doc-23.logic.mjs']);

  // A file outside `doc/` is never paired.
  const script = buildCatalogueCase(pairingTree(files('scripts', 'tree', 1)));
  assert.deepEqual(scatterOf(script, '.').flatMap(filesOf), ['scripts/tree-9.logic.mjs']);
});

test('B2 (R2) under an embedded validator development root', () => {
  const root = 'calculogic-validator';
  const built = buildCatalogueCase({
    files: [...files(`${root}/tree`, 'tree', 3), ...files(`${root}/doc/specs`, 'tree', 1), ...files('doc/specs', 'tree', 1)],
  });
  // The embedded document is paired; a document outside the development root is not.
  assert.deepEqual(scatterOf(built, root).flatMap(filesOf), ['doc/specs/tree-4.logic.mjs']);
});

test('B4, B5: only evaluated reasoning governs; conformance does not', () => {
  const tree = expand(catalogueCase('C11').tree);
  const builtin = getBuiltinTreeSemanticHomeParameterSet();
  const unchecked = { ...builtin, conformance: 'not-checked' };
  delete unchecked.conformanceBinding;
  assert.equal(scatterOf(buildCatalogueCase({ ...tree, parameterSet: unchecked })).length, 1);

  const unavailable = {
    registry: { ...builtin.registry, source: 'custom', version: '1' },
    availability: 'configuration-unavailable',
    reason: 'parameter-set-absent',
    conformance: 'not-checked',
  };
  for (const parameterSet of [unavailable, NOT_PREPARED_TREE_SEMANTIC_HOME_PARAMETER_SET]) {
    const built = buildCatalogueCase({ ...tree, parameterSet });
    assert.notEqual(built.reasoning.status, 'evaluated');
    assert.deepEqual(scatterOf(built), [], parameterSet.availability);
  }
  assert.deepEqual(collectSemanticHomeScatterFindings({ preparedDependencies: {} }), []);
  assert.deepEqual(collectSemanticHomeScatterFindings(), []);
});

test('B6: the report summary keeps status, reason, conformance and provenance apart', () => {
  const tree = expand(catalogueCase('C1').tree);
  const builtin = getBuiltinTreeSemanticHomeParameterSet();
  assert.deepEqual(toTreeSemanticHomeReasoningReport(buildCatalogueCase(tree).reasoning), {
    status: 'evaluated',
    conformance: 'passed',
    conformanceBinding: structuredClone(builtin.conformanceBinding),
    registry: { ...builtin.registry },
    governedCodes: ['TREE_FAMILY_SCATTERED'],
  });

  const unchecked = { ...builtin, conformance: 'not-checked' };
  delete unchecked.conformanceBinding;
  assert.deepEqual(toTreeSemanticHomeReasoningReport(buildCatalogueCase({ ...tree, parameterSet: unchecked }).reasoning), {
    status: 'evaluated',
    conformance: 'not-checked',
    registry: { ...builtin.registry },
    governedCodes: ['TREE_FAMILY_SCATTERED'],
  });

  const unavailable = { registry: { ...builtin.registry, version: '1' }, availability: 'configuration-unavailable', reason: 'parameter-set-absent', conformance: 'not-checked' };
  assert.deepEqual(toTreeSemanticHomeReasoningReport(buildCatalogueCase({ ...tree, parameterSet: unavailable }).reasoning), {
    status: 'configuration-unavailable',
    reason: 'parameter-set-absent',
    conformance: 'not-checked',
    registry: { ...builtin.registry, version: '1' },
    governedCodes: ['TREE_FAMILY_SCATTERED'],
  });

  // Not prepared: no registry was read, so none is reported; absence never reads as Builtin.
  assert.deepEqual(toTreeSemanticHomeReasoningReport(buildCatalogueCase({ ...tree, parameterSet: NOT_PREPARED_TREE_SEMANTIC_HOME_PARAMETER_SET }).reasoning), {
    status: 'not-prepared',
    reason: 'registry-resolution-absent',
    conformance: 'not-checked',
    governedCodes: ['TREE_FAMILY_SCATTERED'],
  });
  assert.equal(toTreeSemanticHomeReasoningReport(undefined), null);
});

test('split-family guardrail: flags on a reported file are carried, never dropped', () => {
  const built = buildCatalogueCase(expand(catalogueCase('C11').tree));
  const target = built.reasoning.placements.find((placement) => placement.state === 'home-elsewhere');
  const sectionIntake = structuredClone(built.sectionIntake);
  const record = sectionIntake.bridgeObservations.acceptedRecords.find((entry) => entry.occurrenceAddress === target.file.occurrenceAddress);
  record.observation.splitFamilyFlags = ['split-family-heuristic'];
  const [finding] = scatterOf(built, null, sectionIntake);
  const file = finding.details.files.find((entry) => entry.path === target.path);
  assert.deepEqual(file.splitFamilyFlags, ['split-family-heuristic']);
  assert.equal(finding.details.files.filter((entry) => Object.hasOwn(entry, 'splitFamilyFlags')).length, 1);
});

test('deterministic, and the prepared records are only read', () => {
  const built = buildCatalogueCase(expand(catalogueCase('C12').tree));
  const before = JSON.stringify([built.reasoning, built.sectionIntake]);
  const first = scatterOf(built);
  assert.deepEqual(scatterOf(built), first);
  assert.equal(JSON.stringify([built.reasoning, built.sectionIntake]), before);
  assert.throws(
    () =>
      collectSemanticHomeScatterFindings({
        preparedDependencies: {
          treeFolderSemanticHomeReasoning: { ...built.reasoning, semanticEvidenceSource: { candidates: [] } },
          treeNamingSectionIntake: built.sectionIntake,
        },
      }),
    /No Stage 1 candidate/u,
  );
});

test('end to end: staged Naming evidence, meta.semanticHomeReasoning, and no conflicting lanes destination (S2.12)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-semantic-home-scatter-'));
  try {
    for (const relativePath of [
      'src/widget/widget-keyed.knowledge.ts',
      'src/widget/widget-keyed.results.ts',
      'src/shared/build/widget-keyed.build.tsx',
      'src/shared/logic/widget-keyed.logic.ts',
      'src/shared/knowledge/widget-keyed.knowledge.ts',
    ]) {
      fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
      fs.writeFileSync(path.join(root, relativePath), 'export {};\n');
    }
    const [entry] = runValidatorRunner(root, { validators: ['tree-structure-advisor'], scope: 'repo' }).validators;
    assert.equal(entry.meta.semanticHomeReasoning.status, 'evaluated');
    assert.equal(entry.meta.semanticHomeReasoning.conformance, 'passed');
    assert.deepEqual(entry.meta.semanticHomeReasoning.governedCodes, ['TREE_FAMILY_SCATTERED']);

    const scatter = entry.findings.find((finding) => finding.code === 'TREE_FAMILY_SCATTERED');
    assert.deepEqual(filesOf(scatter).sort(), [
      'src/shared/build/widget-keyed.build.tsx',
      'src/shared/knowledge/widget-keyed.knowledge.ts',
      'src/shared/logic/widget-keyed.logic.ts',
    ]);
    assert.equal(scatter.details.basis, 'semantic-home-placement');
    assert.deepEqual(homePathsOf(scatter), ['src/widget']);
    // Stage 2B-iv: the lanes code, which suggested `src/shared/widget-keyed` for these same files while the
    // eligible home is `src/widget`, is retired; the files carry only the home-based reading.
    assert.equal(entry.findings.some((finding) => finding.code === 'TREE_SHARED_FAMILY_SCATTERED_ACROSS_LANES'), false);
    assert.deepEqual(entry.findings.map((finding) => finding.code), ['TREE_FAMILY_SCATTERED']);

    // Every reported file is home-elsewhere: no undetermined placement contributes.
    const registryResolution = resolveActiveRegistrySet({ targetRoot: root });
    const staged = prepareNamingTreeStagingInputs(runNamingValidator(root, { scope: 'repo', registryResolution }), { registryResolution });
    const prepared = prepareTreeStructureAdvisorInputs(root, { scope: 'repo', registryResolution, ...staged });
    const placementByPath = new Map(prepared.preparedDependencies.treeFolderSemanticHomeReasoning.placements.map((placement) => [placement.path, placement]));
    assert.ok(filesOf(scatter).every((filePath) => placementByPath.get(filePath).state === 'home-elsewhere'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
