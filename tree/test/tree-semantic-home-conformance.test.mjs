import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex, stableStringify } from '../../src/core/validator-report-meta.logic.mjs';
import { walkComparisonEntries } from '../../src/core/registry-lifecycle/registry-lifecycle-comparison.logic.mjs';
import { SEMANTIC_HOME_CATALOGUE } from './fixtures/semantic-home-catalogue/semantic-home-catalogue-cases.fixture.mjs';
import { runSemanticHomeCatalogue } from './fixtures/semantic-home-catalogue/semantic-home-catalogue-runner.fixture.mjs';
import {
  computeTreeSemanticHomeReasoningSourceDigest,
  getBuiltinTreeSemanticHomeParameterSet,
} from '../src/registries/tree-semantic-home-parameter-set-loader.logic.mjs';
import { TREE_REGISTRY_INVENTORY } from '../src/registries/tree-registry-inventory.knowledge.mjs';
import {
  TREE_SEMANTIC_HOME_CONFORMANCE_BINDING as BINDING,
  TREE_SEMANTIC_HOME_REASONING_MODULES,
  TREE_SEMANTIC_HOME_REASONING_VERSIONS,
} from '../src/tree-semantic-home-conformance.knowledge.mjs';
import { digestTreeSemanticHomeReasoningSources, evaluateTreeSemanticHomeConformance } from '../src/tree-semantic-home-conformance.logic.mjs';
import { prepareTreeSemanticHomeParameterSet } from '../src/tree-semantic-home-parameter-set.logic.mjs';

// The Stage 2A-iii conformance binding (Tree spec RR4, S2.11; calculogic-validator#102 K1-K7). This
// file is how the binding is earned: `npm test` fails unless the catalogue passes under the bound
// values and every recorded digest matches the current tree (K1: there is no CI workflow).
const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SPEC = fs.readFileSync(new URL('../../doc/ValidatorSpecs/tree-structure-advisor-validator.spec.md', import.meta.url), 'utf8');
const POLICY = JSON.parse(fs.readFileSync(new URL('../src/registries/_builtin/semantic-home-policy.registry.json', import.meta.url), 'utf8'));
const ENTRY = TREE_REGISTRY_INVENTORY.find((entry) => entry.registryId === 'tree/semantic-home-policy');
const BUILTIN = getBuiltinTreeSemanticHomeParameterSet();

const withValues = (values) => ({
  ...BUILTIN,
  parameters: Object.fromEntries(Object.entries(BUILTIN.parameters).map(([name, parameter]) => [name, { ...parameter, value: values[name] }])),
});
const valuesOf = (set) => Object.fromEntries(Object.entries(set.parameters).map(([name, parameter]) => [name, parameter.value]));
const runBound = () => runSemanticHomeCatalogue({ catalogue: SEMANTIC_HOME_CATALOGUE, parameterSet: withValues(BINDING.values) });
const failingCases = ({ failures }) => [...new Set(failures.map((failure) => failure.slice(0, failure.indexOf(':'))))];

test('the catalogue passes under the bound values, and the bound values are the Builtin registry values', () => {
  assert.deepEqual(runBound().failures, []);
  assert.deepEqual(valuesOf(BUILTIN), BINDING.values);
  assert.deepEqual(Object.keys(BINDING.values), Object.keys(BUILTIN.parameters));
});

test('the declarative catalogue has C1-C30 once each, C30 included, and its identity is the bound one', () => {
  const ids = SEMANTIC_HOME_CATALOGUE.cases.map((entry) => entry.id);
  assert.deepEqual(ids, Array.from({ length: 30 }, (_, index) => `C${index + 1}`));
  for (const entry of SEMANTIC_HOME_CATALOGUE.cases) {
    assert.ok(entry.expected.candidates.length > 0, `${entry.id} states its candidate outcomes`);
  }
  assert.deepEqual([SEMANTIC_HOME_CATALOGUE.id, SEMANTIC_HOME_CATALOGUE.version], [BINDING.catalogue.id, BINDING.catalogue.version]);
});

test('the spec, the declarative table and the binding name the same catalogue version and case ids', () => {
  const identity = /\*\*Catalogue identity\.\*\* Catalogue `([^`]+)`, version `([^`]+)`/u.exec(SPEC);
  assert.ok(identity, 'S2.11 states the catalogue identity');
  assert.deepEqual([identity[1], identity[2]], [SEMANTIC_HOME_CATALOGUE.id, SEMANTIC_HOME_CATALOGUE.version]);
  const specCaseIds = [...SPEC.matchAll(/^\| (C\d+) /gmu)].map((match) => match[1]);
  assert.deepEqual(specCaseIds, SEMANTIC_HOME_CATALOGUE.cases.map((entry) => entry.id));
});

test('the three digests recompute to the recorded binding', () => {
  assert.equal(sha256Hex(stableStringify(SEMANTIC_HOME_CATALOGUE)), BINDING.catalogue.digest, 'catalogue digest: a case or expectation changed');
  assert.equal(sha256Hex(stableStringify(runBound().results)), BINDING.reasoning.resultsDigest, 'results digest: the reasoning behaviour changed');
  assert.equal(computeTreeSemanticHomeReasoningSourceDigest({ packageRoot: PACKAGE_ROOT }), BINDING.reasoning.sourceDigest, 'source digest: a bound module changed');
});

test('the results digest covers every case and variant, keyed by case id and occurrence identity', () => {
  const { results } = runBound();
  assert.deepEqual(
    results.map(({ caseId, variant }) => (variant ? `${caseId}/${variant}` : caseId)),
    [...SEMANTIC_HOME_CATALOGUE.cases.flatMap((entry) => [entry.id, ...(entry.variants ?? []).map((variant) => `${entry.id}/${variant.name}`)])],
  );
  for (const result of results) {
    assert.ok(result.candidates.every((candidate) => candidate.folderAddressPath && candidate.outcome && candidate.reason));
    assert.ok(result.placements.every((placement) => placement.occurrenceAddress && placement.state && Number.isInteger(placement.decidedAtStep)));
  }
});

test('the bound module list is exactly the local import closure of the Stage 2 coordinator and the Stage 1 preparers', () => {
  const roots = [
    'tree/src/tree-folder-semantic-home-reasoning.logic.mjs',
    'tree/src/tree-naming-section-intake.logic.mjs',
    'tree/src/tree-folder-fact-evidence.logic.mjs',
    'tree/src/tree-folder-candidates.logic.mjs',
    'tree/src/tree-folder-semantic-evidence.logic.mjs',
  ];
  const closure = new Set();
  const queue = [...roots];
  while (queue.length > 0) {
    const modulePath = queue.shift();
    if (closure.has(modulePath)) continue;
    closure.add(modulePath);
    const text = fs.readFileSync(path.join(PACKAGE_ROOT, modulePath), 'utf8');
    for (const [, specifier] of text.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s+'([^']+)'/gu)) {
      if (specifier.startsWith('.')) queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(modulePath), specifier)));
    }
  }
  assert.deepEqual([...TREE_SEMANTIC_HOME_REASONING_MODULES], [...closure].sort());
});

test('K3: the reasoning version history is append-only consistent, and its last entry is the bound one', () => {
  const versions = TREE_SEMANTIC_HOME_REASONING_VERSIONS.map((entry) => entry.version);
  assert.deepEqual(versions, versions.map((_, index) => String(index + 1)));
  assert.equal(new Set(TREE_SEMANTIC_HOME_REASONING_VERSIONS.map((entry) => entry.resultsDigest)).size, versions.length);
  assert.deepEqual(TREE_SEMANTIC_HOME_REASONING_VERSIONS.at(-1), { version: BINDING.reasoning.version, resultsDigest: BINDING.reasoning.resultsDigest });
});

test('sensitivity: a changed value or expectation makes named cases fail', () => {
  const nudged = (name, value) => runSemanticHomeCatalogue({ catalogue: SEMANTIC_HOME_CATALOGUE, parameterSet: withValues({ ...BINDING.values, [name]: value }) });
  assert.deepEqual(failingCases(nudged('P_MIN_SUPPORT', 1)), ['C17']);
  assert.deepEqual(failingCases(nudged('P_MIN_SUPPORT', 3)), ['C20']);
  assert.deepEqual(failingCases(nudged('P_COVERAGE', 0.9)), ['C18', 'C29']);
  assert.deepEqual(failingCases(nudged('P_NOT_ELIGIBLE_SHARE', 0.2)), ['C22']);
  assert.deepEqual(failingCases(nudged('P_ELIGIBLE_SHARE', 0.8)), ['C24']);

  // A changed expectation fails the run and the catalogue digest.
  const edited = structuredClone(SEMANTIC_HOME_CATALOGUE);
  edited.cases[0].expected.candidates[0].outcome = 'undetermined';
  assert.deepEqual(failingCases(runSemanticHomeCatalogue({ catalogue: edited, parameterSet: withValues(BINDING.values) })), ['C1']);
  assert.notEqual(sha256Hex(stableStringify(edited)), BINDING.catalogue.digest);
  // Every compared field counts: a candidate reason, a placement reason and a nearest home.
  const single = (caseIndex, update) => {
    const copy = structuredClone(SEMANTIC_HOME_CATALOGUE.cases[caseIndex]);
    update(copy.expected);
    return failingCases(runSemanticHomeCatalogue({ catalogue: { ...SEMANTIC_HOME_CATALOGUE, cases: [copy] }, parameterSet: withValues(BINDING.values) }));
  };
  assert.deepEqual(single(1, (expected) => { expected.candidates[0].reason = 'mixed-evidence'; }), ['C2']);
  assert.deepEqual(single(2, (expected) => { expected.placements[0].reason = 'home-on-lineage-undetermined'; }), ['C3']);
  assert.deepEqual(single(5, (expected) => { expected.placements[1].nearest = 'app/pricing'; }), ['C6']);
  assert.deepEqual(single(1, (expected) => { expected.candidates = [{ folder: 'src', none: true }]; }), ['C2']);
  // An expectation for a file that does not exist selects nothing and fails.
  edited.cases[0].expected = { candidates: [], placements: [{ file: 'pricing/absent.logic.mjs', state: 'inside-home' }] };
  assert.deepEqual(runSemanticHomeCatalogue({ catalogue: { ...edited, cases: [edited.cases[0]] }, parameterSet: withValues(BINDING.values) }).failures, [
    'C1: placement pricing/absent.logic.mjs: no file selected',
  ]);
});

test('run time: passed needs the exact bound values and the bound source digest; anything else is not-checked', () => {
  const digest = BINDING.reasoning.sourceDigest;
  const passed = evaluateTreeSemanticHomeConformance({ values: { ...BINDING.values }, reasoningSourceDigest: digest });
  assert.deepEqual(passed, {
    conformance: 'passed',
    conformanceBinding: {
      catalogue: { id: BINDING.catalogue.id, version: BINDING.catalogue.version, digest: BINDING.catalogue.digest },
      reasoning: { version: BINDING.reasoning.version, sourceDigest: digest },
    },
  });
  assert.ok(Object.isFrozen(passed.conformanceBinding.reasoning));

  const notChecked = { conformance: 'not-checked' };
  const { P_ELIGIBLE_SHARE, ...threeValues } = BINDING.values;
  for (const [label, values, reasoningSourceDigest] of [
    // P_COVERAGE 0.4 still passes the catalogue (above): only the separate checking facility may say so.
    ['a value the catalogue also accepts', { ...BINDING.values, P_COVERAGE: 0.4 }, digest],
    ['a value of another type', { ...BINDING.values, P_MIN_SUPPORT: '2' }, digest],
    ['a missing value', threeValues, digest],
    ['an extra value', { ...BINDING.values, P_EXTRA: 1 }, digest],
    ['no values', null, digest],
    ['no installed digest', { ...BINDING.values }, null],
    ['another installed digest', { ...BINDING.values }, 'f'.repeat(64)],
  ]) {
    assert.deepEqual(evaluateTreeSemanticHomeConformance({ values, reasoningSourceDigest }), notChecked, label);
  }
});

// A comparison over the Builtin payload's real addresses, every entry in the given state.
const comparisonOf = (payload, baselineComparison) => ({
  registryId: ENTRY.registryId,
  source: 'custom',
  entries: walkComparisonEntries(payload, ENTRY).map(({ address }) => ({
    address,
    baselineComparison,
    ...(baselineComparison === 'unverifiable' ? { reason: 'baseline-unavailable' } : {}),
  })),
});
const convert = ({ payload = POLICY, source = 'custom', baselineComparison = 'matches', reasoningSourceDigest = BINDING.reasoning.sourceDigest }) =>
  prepareTreeSemanticHomeParameterSet({
    payload,
    registry: { registryId: ENTRY.registryId, version: payload.version, source, digest: 'a'.repeat(64) },
    comparison: comparisonOf(payload, baselineComparison),
    reasoningSourceDigest,
  });
const withRecord = (parameterId, update) => {
  const payload = structuredClone(POLICY);
  update(payload.semanticHomeParameters.find((record) => record.parameterId === parameterId));
  return payload;
};

test('K6, K7: conformance is independent of source, origin, comparison and rationale, and never repairs provenance', () => {
  const rows = [
    ['Builtin', { source: 'builtin', baselineComparison: 'not-applicable' }, 'passed', 'builtin'],
    ['Custom, identical', { baselineComparison: 'matches' }, 'passed', 'baseline'],
    ['Custom, rationale edited', { payload: withRecord('coverage', (record) => { record.rationale += ' Edited.'; }), baselineComparison: 'differs' }, 'passed', 'override'],
    ['candidate, Baseline unverifiable', { source: 'candidate', baselineComparison: 'unverifiable' }, 'passed', 'unverified'],
    ['Custom, Baseline absent', { baselineComparison: 'absent' }, 'passed', 'override'],
    ['Custom, value changed', { payload: withRecord('coverage', (record) => { record.value = 0.6; }), baselineComparison: 'differs' }, 'not-checked', 'override'],
    ['Builtin, installed modules unreadable', { source: 'builtin', baselineComparison: 'not-applicable', reasoningSourceDigest: null }, 'not-checked', 'builtin'],
  ];
  for (const [label, input, conformance, origin] of rows) {
    const set = convert(input);
    assert.equal(set.conformance, conformance, label);
    assert.equal(Object.hasOwn(set, 'conformanceBinding'), conformance === 'passed', label);
    // Provenance is reported as resolved, whatever the conformance.
    assert.ok(Object.values(set.parameters).every((parameter) => parameter.origin === origin), label);
    if (input.baselineComparison === 'unverifiable') {
      assert.ok(Object.values(set.parameters).every((parameter) => parameter.baselineComparisonReason === 'baseline-unavailable'), label);
    }
  }

  // An unavailable set is never checked, even with the bound digest.
  const { semanticHomeParameters, ...legacy } = { ...POLICY, version: '1' };
  assert.deepEqual(convert({ payload: legacy }).conformance, 'not-checked');
  assert.equal(Object.hasOwn(convert({ payload: legacy }), 'conformanceBinding'), false);
});

test('K2: the installed digest fails closed on a missing, unreadable or changed module, and ignores line endings', () => {
  const copyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-semantic-home-conformance-'));
  try {
    for (const modulePath of TREE_SEMANTIC_HOME_REASONING_MODULES) {
      fs.mkdirSync(path.dirname(path.join(copyRoot, modulePath)), { recursive: true });
      fs.copyFileSync(path.join(PACKAGE_ROOT, modulePath), path.join(copyRoot, modulePath));
    }
    const digestOfCopy = () => computeTreeSemanticHomeReasoningSourceDigest({ packageRoot: copyRoot });
    assert.equal(digestOfCopy(), BINDING.reasoning.sourceDigest);

    const target = path.join(copyRoot, TREE_SEMANTIC_HOME_REASONING_MODULES[6]);
    const original = fs.readFileSync(target, 'utf8');
    fs.writeFileSync(target, original.replace(/\n/gu, '\r\n'));
    assert.equal(digestOfCopy(), BINDING.reasoning.sourceDigest, 'CRLF line endings');

    fs.writeFileSync(target, `${original}// tampered\n`);
    const tampered = digestOfCopy();
    assert.notEqual(tampered, BINDING.reasoning.sourceDigest);
    assert.equal(convert({ source: 'builtin', baselineComparison: 'not-applicable', reasoningSourceDigest: tampered }).conformance, 'not-checked');

    fs.rmSync(target);
    assert.equal(digestOfCopy(), null, 'missing module');
    fs.mkdirSync(target);
    assert.equal(digestOfCopy(), null, 'unreadable module');
  } finally {
    fs.rmSync(copyRoot, { recursive: true, force: true });
  }

  // Path framing: the same texts under other paths, or split differently, digest differently.
  assert.notEqual(digestTreeSemanticHomeReasoningSources([{ path: 'a', text: 'xy' }]), digestTreeSemanticHomeReasoningSources([{ path: 'b', text: 'xy' }]));
  assert.notEqual(
    digestTreeSemanticHomeReasoningSources([{ path: 'a', text: 'x' }, { path: 'b', text: 'y' }]),
    digestTreeSemanticHomeReasoningSources([{ path: 'a', text: 'xy' }, { path: 'b', text: '' }]),
  );
});
