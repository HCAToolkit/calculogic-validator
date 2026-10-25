import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  SEMANTIC_HOME_PARAMETER_IDS,
  SEMANTIC_HOME_POLICY_INPUT_LANES,
  SEMANTIC_HOME_POLICY_STATUSES,
  assertValidSemanticHomePolicyRegistry,
} from '../src/registries/tree-semantic-home-policy-registry.logic.mjs';
import { validateTreeRegistrySet } from '../src/registries/tree-registry-set.logic.mjs';

const SEMANTIC_HOME_POLICY_REGISTRY_PATH = new URL(
  '../src/registries/_builtin/semantic-home-policy.registry.json',
  import.meta.url,
);

const ALLOWED_INPUT_LANES = new Set(SEMANTIC_HOME_POLICY_INPUT_LANES);
const ALLOWED_STATUSES = new Set(SEMANTIC_HOME_POLICY_STATUSES);

test('semantic-home-policy registry has deterministic shape and boundary coverage', () => {
  const payload = JSON.parse(fs.readFileSync(SEMANTIC_HOME_POLICY_REGISTRY_PATH, 'utf8'));
  assertValidSemanticHomePolicyRegistry(payload);

  assert.equal(typeof payload.version, 'string');
  assert.equal(payload.version.length > 0, true);
  assert.equal(Array.isArray(payload.semanticHomePolicy), true);
  assert.equal(payload.semanticHomePolicy.length > 0, true);

  const seenPolicyIds = new Set();
  const seenInputLanes = new Set();

  payload.semanticHomePolicy.forEach((entry, index) => {
    assert.equal(typeof entry.policyId, 'string', `semanticHomePolicy[${index}].policyId should be a string`);
    assert.equal(entry.policyId.length > 0, true, `semanticHomePolicy[${index}].policyId should not be empty`);
    assert.equal(seenPolicyIds.has(entry.policyId), false, `semanticHomePolicy[${index}].policyId should be unique`);
    seenPolicyIds.add(entry.policyId);

    assert.equal(typeof entry.inputLane, 'string', `semanticHomePolicy[${index}].inputLane should be a string`);
    assert.equal(entry.inputLane.length > 0, true, `semanticHomePolicy[${index}].inputLane should not be empty`);
    assert.equal(
      ALLOWED_INPUT_LANES.has(entry.inputLane),
      true,
      `semanticHomePolicy[${index}].inputLane should be an allowed vocabulary value`,
    );
    seenInputLanes.add(entry.inputLane);

    assert.equal(ALLOWED_STATUSES.has(entry.status), true, `semanticHomePolicy[${index}].status should be allowed`);

    assert.equal(typeof entry.definition, 'string', `semanticHomePolicy[${index}].definition should be a string`);
    assert.equal(entry.definition.length > 0, true, `semanticHomePolicy[${index}].definition should not be empty`);

    assert.equal(
      typeof entry.derivationMeaning,
      'string',
      `semanticHomePolicy[${index}].derivationMeaning should be a string`,
    );
    assert.equal(
      entry.derivationMeaning.length > 0,
      true,
      `semanticHomePolicy[${index}].derivationMeaning should not be empty`,
    );

    assert.equal(typeof entry.guardrails, 'string', `semanticHomePolicy[${index}].guardrails should be a string`);
    assert.equal(entry.guardrails.length > 0, true, `semanticHomePolicy[${index}].guardrails should not be empty`);
  });

  assert.equal(seenInputLanes.has('naming-bridge'), true, 'registry should include naming-bridge evidence lane');
  assert.equal(
    seenInputLanes.has('repo-top-structural-boundary'),
    true,
    'registry should preserve repo-top structural boundary lane',
  );
  assert.equal(
    seenInputLanes.has('structural-home-boundary'),
    true,
    'registry should preserve structural-home boundary lane',
  );
});

// Version "2" parameter section (Tree spec Stage 2 S2.10 RR3, RR5).
const readBuiltin = () => JSON.parse(fs.readFileSync(SEMANTIC_HOME_POLICY_REGISTRY_PATH, 'utf8'));
const V1_FIXTURE_PATH = new URL('./fixtures/registry-migrations/semantic-home-policy.v1.registry.json', import.meta.url);
const withParameter = (payload, parameterId, change) => ({
  ...payload,
  semanticHomeParameters: payload.semanticHomeParameters.map((record) =>
    record.parameterId === parameterId ? change(record) : record,
  ),
});
const withValue = (parameterId, value) => withParameter(readBuiltin(), parameterId, (record) => ({ ...record, value }));

test('the Builtin registry is version 2 and holds exactly the four selected parameter values', () => {
  const payload = readBuiltin();
  assert.equal(payload.version, '2');
  assert.deepEqual(
    payload.semanticHomeParameters.map(({ parameterId, value, catalogueCases }) => ({ parameterId, value, catalogueCases })),
    [
      { parameterId: 'coverage', value: 0.5, catalogueCases: ['C3', 'C18', 'C19'] },
      { parameterId: 'minimum-support', value: 2, catalogueCases: ['C17', 'C20'] },
      { parameterId: 'not-eligible-share', value: 0.25, catalogueCases: ['C21', 'C22', 'C23', 'C25'] },
      { parameterId: 'eligible-share', value: 0.75, catalogueCases: ['C4', 'C6', 'C10', 'C24'] },
    ],
  );
  assert.deepEqual(SEMANTIC_HOME_PARAMETER_IDS, ['coverage', 'minimum-support', 'not-eligible-share', 'eligible-share']);
  for (const record of payload.semanticHomeParameters) {
    assert.match(record.rationale, /Tree spec Stage 2 (S2\.\d+, )*S2\.10[;)]/u, record.parameterId);
  }
});

test('the version 1 lanes are carried into version 2 unchanged', () => {
  const v1 = JSON.parse(fs.readFileSync(V1_FIXTURE_PATH, 'utf8'));
  assert.equal(v1.version, '1');
  assert.deepEqual(readBuiltin().semanticHomePolicy, v1.semanticHomePolicy);
});

test('a version 1 registry without parameters stays valid; with parameters it is invalid', () => {
  const v1 = JSON.parse(fs.readFileSync(V1_FIXTURE_PATH, 'utf8'));
  assert.doesNotThrow(() => assertValidSemanticHomePolicyRegistry(v1));
  assert.throws(
    () => assertValidSemanticHomePolicyRegistry({ ...v1, semanticHomeParameters: readBuiltin().semanticHomeParameters }),
    /version "1" must not carry semanticHomeParameters/u,
  );
});

test('version 2 parameter validation enforces every S2.5 constraint', () => {
  const builtin = readBuiltin();
  assert.doesNotThrow(() => assertValidSemanticHomePolicyRegistry(builtin));
  const { semanticHomeParameters, ...withoutSection } = builtin;
  const cases = [
    ['version 2 without the section', withoutSection, /semanticHomeParameters must be a non-empty array/u],
    ['coverage 0', withValue('coverage', 0), /coverage must be greater than 0 and at most 1/u],
    ['coverage above 1', withValue('coverage', 1.01), /coverage must be greater than 0 and at most 1/u],
    ['minimum support 0', withValue('minimum-support', 0), /minimum-support must be an integer of at least 1/u],
    ['fractional minimum support', withValue('minimum-support', 1.5), /minimum-support must be an integer of at least 1/u],
    ['negative share', withValue('not-eligible-share', -0.1), /not-eligible-share must be between 0 and 1 inclusive/u],
    ['share above 1', withValue('eligible-share', 1.1), /eligible-share must be between 0 and 1 inclusive/u],
    ['equal shares', withValue('not-eligible-share', 0.75), /not-eligible-share must be less than eligible-share/u],
    ['inverted shares', withValue('not-eligible-share', 0.8), /not-eligible-share must be less than eligible-share/u],
    ['a non-number value', withValue('coverage', '0.5'), /value must be a number/u],
    ['a missing value', withParameter(builtin, 'coverage', ({ value, ...rest }) => rest), /value must be a number/u],
    ['NaN coverage', withValue('coverage', Number.NaN), /coverage must be greater than 0 and at most 1/u],
    ['infinite minimum support', withValue('minimum-support', Number.POSITIVE_INFINITY), /minimum-support must be an integer of at least 1/u],
    ['NaN share', withValue('not-eligible-share', Number.NaN), /not-eligible-share must be between 0 and 1 inclusive/u],
    ['infinite share', withValue('eligible-share', Number.POSITIVE_INFINITY), /eligible-share must be between 0 and 1 inclusive/u],
    ['an empty rationale', withParameter(builtin, 'coverage', (record) => ({ ...record, rationale: '' })), /rationale must be a non-empty string/u],
    ['no catalogue cases', withParameter(builtin, 'coverage', (record) => ({ ...record, catalogueCases: [] })), /catalogueCases must be/u],
    ['a malformed case id', withParameter(builtin, 'coverage', (record) => ({ ...record, catalogueCases: ['C03'] })), /catalogueCases must be/u],
    ['a repeated case id', withParameter(builtin, 'coverage', (record) => ({ ...record, catalogueCases: ['C3', 'C3'] })), /catalogueCases must be/u],
    ['an extra record field', withParameter(builtin, 'coverage', (record) => ({ ...record, weight: 1 })), /weight/u],
    ['an unknown parameter', withParameter(builtin, 'coverage', (record) => ({ ...record, parameterId: 'ambiguity-weight' })), /parameterId must be one of/u],
    ['a missing parameter', { ...builtin, semanticHomeParameters: semanticHomeParameters.slice(1) }, /missing coverage/u],
    ['a repeated parameter', { ...builtin, semanticHomeParameters: [...semanticHomeParameters, semanticHomeParameters[0]] }, /parameterId/u],
    ['an unreadable version', { ...builtin, version: '3' }, /version "3" is not readable; readable versions: 1, 2/u],
    ['a numeric version', { ...builtin, version: 2 }, /version 2 is not readable/u],
  ];
  for (const [label, payload, pattern] of cases) {
    assert.throws(() => assertValidSemanticHomePolicyRegistry(payload), pattern, label);
  }
});

test('Tree registry-set validation applies the root fields of each readable version', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-home-policy-root-'));
  try {
    fs.cpSync(new URL('../src/registries/_builtin/', import.meta.url), root, { recursive: true });
    const file = path.join(root, 'semantic-home-policy.registry.json');
    const failuresFor = (payload) => {
      fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
      return validateTreeRegistrySet(root).filter((failure) => failure.registryId === 'tree/semantic-home-policy');
    };
    const v1 = JSON.parse(fs.readFileSync(V1_FIXTURE_PATH, 'utf8'));
    assert.deepEqual(failuresFor(readBuiltin()), []);
    assert.deepEqual(failuresFor(v1), []);
    assert.match(failuresFor({ ...readBuiltin(), extra: [] })[0].detail, /extra/u);
    assert.match(failuresFor({ ...v1, extra: [] })[0].detail, /extra/u);
    assert.match(failuresFor({ ...v1, semanticHomeParameters: readBuiltin().semanticHomeParameters })[0].detail, /semanticHomeParameters/u);
    assert.match(failuresFor({ ...readBuiltin(), version: '3' })[0].detail, /version "3" is not readable/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('version 2 parameter validation accepts every inclusive boundary', () => {
  const builtin = readBuiltin();
  const set = (values) =>
    ({ ...builtin, semanticHomeParameters: builtin.semanticHomeParameters.map((record) => ({ ...record, value: values[record.parameterId] ?? record.value })) });
  for (const [label, values] of [
    ['coverage at 1', { coverage: 1 }],
    ['minimum support at 1', { 'minimum-support': 1 }],
    ['not-eligible share at 0', { 'not-eligible-share': 0 }],
    ['eligible share at 1', { 'eligible-share': 1 }],
    ['shares just apart', { 'not-eligible-share': 0.5, 'eligible-share': 0.5000001 }],
  ]) {
    assert.doesNotThrow(() => assertValidSemanticHomePolicyRegistry(set(values)), label);
  }
});
