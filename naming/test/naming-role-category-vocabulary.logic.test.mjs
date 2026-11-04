// Naming role-category vocabulary (bridge contract §4.4 rule 9, §4.9, §6.6; Tree spec S1.3 acceptance 9;
// calculogic-validator#162). The derivation is checked against the registry files read independently here,
// for the Builtin set and for a real Custom set that adds a category and roles (one deprecated); the
// producer emits the whole section or none.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveActiveRegistrySet } from '../../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { resolveRegistryLifecyclePaths } from '../../src/core/registry-lifecycle/registry-lifecycle-state.logic.mjs';
import { initCustomRegistrySet } from '../../src/core/registry-lifecycle/registry-lifecycle-init.logic.mjs';
import { useRegistrySet } from '../../src/core/registry-lifecycle/registry-lifecycle-use.logic.mjs';
import { NAMING_BUILTIN_REGISTRY_ROOT } from '../src/registries/naming-registry-inventory.knowledge.mjs';
import { prepareNamingRuntimeInputs, prepareNamingTreeStagingInputs, projectNamingOccurrenceBridge } from '../src/naming-validator.wiring.mjs';
import { createNamingOccurrenceBridgePayload } from '../src/naming-occurrence-bridge-payload.logic.mjs';
import {
  NAMING_CATEGORY_ROLE_PERSPECTIVE_REGISTRY_ID,
  ROLE_CATEGORY_VOCABULARY_SECTION_VERSION,
  deriveNamingRoleCategoryVocabulary,
  isNamingDerivedRoleCategoryVocabulary,
  prepareNamingRoleCategoryVocabulary,
  projectNamingRoleCategoryVocabulary,
} from '../src/naming-role-category-vocabulary.logic.mjs';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
const byCodeUnit = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

// The expected vocabulary, read straight from a naming registry root: every perspective role, grouped by
// its category (a role listed under no category has none), categories without roles left out.
const expectedVocabularyOf = (namingRoot) => {
  const { rolesByCategory } = readJson(path.join(namingRoot, 'category-role-perspective.registry.json'));
  return Object.entries(rolesByCategory)
    .filter(([, entries]) => entries.length > 0)
    .map(([category, entries]) => ({ category, roles: entries.map((entry) => entry.role).sort(byCodeUnit) }))
    .sort((left, right) => byCodeUnit(left.category, right.category));
};

const withTargetRoot = (run) => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'naming-role-category-vocabulary-'));
  try {
    return run(targetRoot);
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
};

const VALID_INPUT = Object.freeze({
  registrySource: 'builtin',
  categoryRolePerspectiveDigest: 'digest-1',
  records: [
    { category: 'concern-core', roles: ['logic', 'wiring'] },
    { category: 'documentation', roles: ['spec'] },
  ],
});

test('Builtin: the derivation is exactly the perspective registry, deprecated roles included', () => {
  const runtime = prepareNamingRuntimeInputs().namingRolesRuntime;
  const derived = deriveNamingRoleCategoryVocabulary(runtime);
  assert.deepEqual(derived, expectedVocabularyOf(NAMING_BUILTIN_REGISTRY_ROOT));
  assert.deepEqual(derived.find((record) => record.category === 'deprecated'), { category: 'deprecated', roles: ['view'] });
  assert.equal(runtime.activeRoles.has('view'), false);
  // Every role the runtime holds appears exactly once.
  assert.deepEqual(derived.flatMap((record) => record.roles).sort(byCodeUnit), [...runtime.roleMetadata.keys()].sort(byCodeUnit));
});

test('Builtin run: the staged value copies source and digest from the run provenance, computing neither', () => {
  withTargetRoot((targetRoot) => {
    const registryResolution = resolveActiveRegistrySet({ targetRoot });
    const provenance = registryResolution.registryProvenance.naming[NAMING_CATEGORY_ROLE_PERSPECTIVE_REGISTRY_ID];
    const staged = prepareNamingTreeStagingInputs({}, { registryResolution }).roleCategoryVocabulary;
    assert.deepEqual(staged, {
      registrySource: 'builtin',
      categoryRolePerspectiveDigest: provenance.digest,
      records: expectedVocabularyOf(NAMING_BUILTIN_REGISTRY_ROOT),
    });
    // A different digest in the resolution is copied, not recomputed.
    const altered = { ...registryResolution, registryProvenance: { ...registryResolution.registryProvenance, naming: { ...registryResolution.registryProvenance.naming, [NAMING_CATEGORY_ROLE_PERSPECTIVE_REGISTRY_ID]: { source: 'builtin', digest: 'copied-as-is' } } } };
    assert.equal(prepareNamingTreeStagingInputs({}, { registryResolution: altered }).roleCategoryVocabulary.categoryRolePerspectiveDigest, 'copied-as-is');
  });
});

test('Custom set adding a category and roles (one deprecated): derived from the resolved Custom runtime, with Custom provenance', () => {
  withTargetRoot((targetRoot) => {
    initCustomRegistrySet({ targetRoot, validatorVersion: 'test' });
    const namingRoot = path.join(resolveRegistryLifecyclePaths({ targetRoot }).customRoot, 'naming');
    const categoriesPath = path.join(namingRoot, 'categories.registry.json');
    const perspectivePath = path.join(namingRoot, 'category-role-perspective.registry.json');
    const rolesPath = path.join(namingRoot, 'roles.registry.json');
    const categories = readJson(categoriesPath);
    categories.categories.push({ category: 'ledger-support', status: 'active', definition: 'Test category for ledger roles.' });
    writeJson(categoriesPath, categories);
    const perspective = readJson(perspectivePath);
    perspective.rolesByCategory['ledger-support'] = [
      { role: 'ledger', agnosticCoreMeanings: ['structure'] },
      { role: 'journal', agnosticCoreMeanings: ['structure'] },
    ];
    writeJson(perspectivePath, perspective);
    const roles = readJson(rolesPath);
    roles.roles.push({ role: 'ledger', status: 'active', definition: 'Test ledger role.' });
    roles.roles.push({ role: 'journal', status: 'deprecated', definition: 'Test deprecated journal role.' });
    writeJson(rolesPath, roles);
    useRegistrySet({ targetRoot, activeSet: 'custom' });

    const registryResolution = resolveActiveRegistrySet({ targetRoot });
    assert.equal(registryResolution.activeSet, 'custom');
    const provenance = registryResolution.registryProvenance.naming[NAMING_CATEGORY_ROLE_PERSPECTIVE_REGISTRY_ID];
    const staged = prepareNamingTreeStagingInputs({}, { registryResolution }).roleCategoryVocabulary;
    assert.equal(staged.registrySource, 'custom');
    assert.equal(staged.categoryRolePerspectiveDigest, provenance.digest);
    assert.equal(provenance.source, 'custom');
    assert.deepEqual(staged.records, expectedVocabularyOf(namingRoot));
    assert.deepEqual(staged.records.find((record) => record.category === 'ledger-support'), { category: 'ledger-support', roles: ['journal', 'ledger'] });
    // The Builtin vocabulary is a strict subset: nothing falls back to Builtin, nothing is dropped.
    const builtinCategories = expectedVocabularyOf(NAMING_BUILTIN_REGISTRY_ROOT).map((record) => record.category);
    assert.deepEqual(staged.records.map((record) => record.category).filter((category) => category !== 'ledger-support'), builtinCategories);
    const customRuntime = prepareNamingRuntimeInputs({ registryResolution }).namingRolesRuntime;
    assert.equal(customRuntime.roleMetadata.get('journal').status, 'deprecated');
  });
});

test('no run provenance for the perspective registry: no staged value (never a vocabulary without provenance)', () => {
  assert.equal(prepareNamingRoleCategoryVocabulary({}), null);
  assert.equal(prepareNamingRoleCategoryVocabulary({ registryResolution: { registryProvenance: { naming: {} } } }), null);
  assert.equal(prepareNamingRoleCategoryVocabulary({ registryResolution: { registryProvenance: { naming: { [NAMING_CATEGORY_ROLE_PERSPECTIVE_REGISTRY_ID]: { source: 'builtin', digest: '' } } } } }), null);
  assert.equal('roleCategoryVocabulary' in prepareNamingTreeStagingInputs({}, {}), false);
  assert.equal('roleCategoryVocabulary' in prepareNamingTreeStagingInputs({}, { registryResolution: { activeSet: 'builtin', registryRoots: {} } }), false);
});

test('section: the §4.9 envelope, payload-level (no identity tuple), records as staged', () => {
  assert.deepEqual(projectNamingRoleCategoryVocabulary({ roleCategoryVocabulary: VALID_INPUT }), {
    contractVersion: ROLE_CATEGORY_VOCABULARY_SECTION_VERSION,
    producerId: 'naming-role-category-vocabulary',
    source: 'calculogic-validator/naming',
    registrySource: 'builtin',
    categoryRolePerspectiveDigest: 'digest-1',
    recordCount: 2,
    records: VALID_INPUT.records,
  });
});

test('producer completeness: an input that is not a complete, well-formed vocabulary gives no section, never a partial one', () => {
  const variants = {
    missingDigest: { ...VALID_INPUT, categoryRolePerspectiveDigest: undefined },
    unknownSource: { ...VALID_INPUT, registrySource: 'other' },
    emptyCategory: { ...VALID_INPUT, records: [{ category: '', roles: ['logic'] }] },
    emptyRoles: { ...VALID_INPUT, records: [{ category: 'concern-core', roles: [] }] },
    unsortedRoles: { ...VALID_INPUT, records: [{ category: 'concern-core', roles: ['wiring', 'logic'] }] },
    duplicateRoles: { ...VALID_INPUT, records: [{ category: 'concern-core', roles: ['logic', 'logic'] }] },
    duplicateCategory: { ...VALID_INPUT, records: [{ category: 'a', roles: ['x'] }, { category: 'a', roles: ['y'] }] },
    unsortedCategories: { ...VALID_INPUT, records: [...VALID_INPUT.records].reverse() },
    extraRecordField: { ...VALID_INPUT, records: [{ category: 'concern-core', roles: ['logic'], status: 'active' }] },
    recordsNotArray: { ...VALID_INPUT, records: {} },
    notObject: 'vocabulary',
  };
  for (const [name, roleCategoryVocabulary] of Object.entries(variants)) {
    assert.equal(projectNamingRoleCategoryVocabulary({ roleCategoryVocabulary }), null, name);
    assert.equal('namingRoleCategoryVocabulary' in createNamingOccurrenceBridgePayload({ roleCategoryVocabulary }), false, name);
  }
  assert.equal(projectNamingRoleCategoryVocabulary({}), null);
});

test('payload: the section is added last and changes nothing else; the direct path accepts the same value', () => {
  const namespace = { addressProfileId: 'p', addressedSnapshotId: 's', occurrenceRecords: [] };
  const without = createNamingOccurrenceBridgePayload({ addressedOccurrenceNamespace: namespace });
  const withSection = createNamingOccurrenceBridgePayload({ addressedOccurrenceNamespace: namespace, roleCategoryVocabulary: VALID_INPUT });
  const { namingRoleCategoryVocabulary, ...rest } = withSection;
  assert.deepEqual(rest, without);
  assert.equal(namingRoleCategoryVocabulary.recordCount, 2);
  assert.equal('identityTupleFields' in namingRoleCategoryVocabulary, false);
  assert.ok(namingRoleCategoryVocabulary.records.every((record) => Object.keys(record).join() === 'category,roles'));
  // Independent of the addressed namespace (an invalid one still carries it).
  assert.ok(createNamingOccurrenceBridgePayload({ roleCategoryVocabulary: VALID_INPUT }).namingRoleCategoryVocabulary);
  assert.deepEqual(projectNamingOccurrenceBridge({}, { addressedOccurrenceNamespace: namespace, roleCategoryVocabulary: VALID_INPUT }).namingRoleCategoryVocabulary, namingRoleCategoryVocabulary);
});

test('origin: only the exact staged value, for the exact resolution object, is Naming-derived; it is deeply frozen', () => {
  withTargetRoot((targetRoot) => {
    const registryResolution = resolveActiveRegistrySet({ targetRoot });
    const vocabulary = prepareNamingTreeStagingInputs({}, { registryResolution }).roleCategoryVocabulary;
    assert.equal(isNamingDerivedRoleCategoryVocabulary(vocabulary, registryResolution), true);
    // Another resolution object, even with the same content; a copy; a hand-built value; missing arguments.
    assert.equal(isNamingDerivedRoleCategoryVocabulary(vocabulary, { ...registryResolution }), false);
    assert.equal(isNamingDerivedRoleCategoryVocabulary(vocabulary, resolveActiveRegistrySet({ targetRoot })), false);
    assert.equal(isNamingDerivedRoleCategoryVocabulary(structuredClone(vocabulary), registryResolution), false);
    assert.equal(isNamingDerivedRoleCategoryVocabulary({ ...vocabulary }, registryResolution), false);
    assert.equal(isNamingDerivedRoleCategoryVocabulary(VALID_INPUT, registryResolution), false);
    assert.equal(isNamingDerivedRoleCategoryVocabulary(vocabulary, undefined), false);
    assert.equal(isNamingDerivedRoleCategoryVocabulary(undefined, registryResolution), false);
    assert.ok(Object.isFrozen(vocabulary) && Object.isFrozen(vocabulary.records));
    assert.ok(vocabulary.records.every((record) => Object.isFrozen(record) && Object.isFrozen(record.roles)));
    // The frozen value still projects to the same section.
    assert.equal(projectNamingRoleCategoryVocabulary({ roleCategoryVocabulary: vocabulary }).recordCount, vocabulary.records.length);
  });
});

test('regression (review of 3db95b8): the branded factory takes no caller runtime; a truncated one cannot shape a trusted value', () => {
  withTargetRoot((targetRoot) => {
    const registryResolution = resolveActiveRegistrySet({ targetRoot });
    const runtime = prepareNamingRuntimeInputs({ registryResolution }).namingRolesRuntime;
    const truncated = {
      ...runtime,
      roleMetadata: new Map([...runtime.roleMetadata].filter(([, entry]) => entry.category !== 'integration-adapter')),
    };
    // A runtime argument is not part of the factory's input: the content comes from the resolution alone.
    const vocabulary = prepareNamingRoleCategoryVocabulary({ registryResolution, namingRolesRuntime: truncated });
    assert.deepEqual(vocabulary.records, expectedVocabularyOf(NAMING_BUILTIN_REGISTRY_ROOT));
    assert.ok(vocabulary.records.some((record) => record.category === 'integration-adapter'));
    assert.equal(isNamingDerivedRoleCategoryVocabulary(vocabulary, registryResolution), true);
    // The pure derivation over a truncated runtime is incomplete, and it is never Naming-derived for the run.
    const fromTruncated = deriveNamingRoleCategoryVocabulary(truncated);
    assert.equal(fromTruncated.some((record) => record.category === 'integration-adapter'), false);
    assert.equal(isNamingDerivedRoleCategoryVocabulary(fromTruncated, registryResolution), false);
    assert.equal(isNamingDerivedRoleCategoryVocabulary({ ...vocabulary, records: fromTruncated }, registryResolution), false);
  });
});
