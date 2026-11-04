// Naming role-category vocabulary, version 2 (bridge contract §4.4 rule 9, §4.9.1, §6.6; Tree spec S1.3 v2
// acceptance 1-4 and 10; calculogic-validator#162). The declared records and the canonically admissible
// upper bound are checked against the registry files read independently here, for the Builtin set and for
// real Custom sets. Canonical-admission probes run the real Naming classifier and §4.5 projection: they test
// inclusion (soundness), and a separately named check tests equality (precision). The producer emits the
// whole v2 section or none, never v1.
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
import { getSpecialCaseType } from '../src/naming-validator.logic.mjs';
import {
  prepareNamingRuntimeInputs,
  prepareNamingTreeStagingInputs,
  projectNamingOccurrenceBridge,
  runNamingValidator,
} from '../src/naming-validator.wiring.mjs';
import { createNamingOccurrenceBridgePayload } from '../src/naming-occurrence-bridge-payload.logic.mjs';
import {
  NAMING_CATEGORY_ROLE_PERSPECTIVE_REGISTRY_ID,
  NAMING_ROLES_REGISTRY_ID,
  ROLE_CATEGORY_VOCABULARY_SECTION_VERSION,
  deriveNamingAdmissibleRoleCategories,
  deriveNamingRoleCategoryVocabulary,
  isNamingDerivedRoleCategoryVocabulary,
  prepareNamingRoleCategoryVocabulary,
  projectNamingRoleCategoryVocabulary,
} from '../src/naming-role-category-vocabulary.logic.mjs';

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
const byCodeUnit = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const editJson = (filePath, edit) => writeJson(filePath, edit(readJson(filePath)));

// Expected values, read straight from a naming registry root.
// Declared: every perspective role, grouped by its category; categories without roles left out.
const expectedDeclaredOf = (namingRoot) => {
  const { rolesByCategory } = readJson(path.join(namingRoot, 'category-role-perspective.registry.json'));
  return Object.entries(rolesByCategory)
    .filter(([, entries]) => entries.length > 0)
    .map(([category, entries]) => ({ category, roles: entries.map((entry) => entry.role).sort(byCodeUnit) }))
    .sort((left, right) => byCodeUnit(left.category, right.category));
};
// Admissible: the categories of the roles whose registry status is `active`.
const expectedAdmissibleOf = (namingRoot) => {
  const active = new Set(readJson(path.join(namingRoot, 'roles.registry.json')).roles.filter((role) => role.status === 'active').map((role) => role.role));
  const { rolesByCategory } = readJson(path.join(namingRoot, 'category-role-perspective.registry.json'));
  return Object.entries(rolesByCategory)
    .filter(([, entries]) => entries.some((entry) => active.has(entry.role)))
    .map(([category]) => category)
    .sort(byCodeUnit);
};

const withTargetRoot = (run) => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'naming-role-category-vocabulary-'));
  try {
    return run(targetRoot);
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
};

// A real Custom set in `targetRoot`, edited by `edit({ namingRoot })`, then selected.
const withCustomSet = (targetRoot, edit) => {
  initCustomRegistrySet({ targetRoot, validatorVersion: 'test' });
  const namingRoot = path.join(resolveRegistryLifecyclePaths({ targetRoot }).customRoot, 'naming');
  edit({ namingRoot });
  useRegistrySet({ targetRoot, activeSet: 'custom' });
  const registryResolution = resolveActiveRegistrySet({ targetRoot });
  assert.equal(registryResolution.activeSet, 'custom');
  return { namingRoot, registryResolution };
};

// Custom edits (Tree spec S1.3 v2 acceptance 2): a category whose only role is deprecated, a deprecated role
// inside an otherwise active category, and an added active role in a new category.
const addRole = ({ namingRoot }, { category, role, status }) => {
  editJson(path.join(namingRoot, 'categories.registry.json'), (registry) => {
    if (!registry.categories.some((entry) => entry.category === category)) registry.categories.push({ category, status: 'active', definition: `Test category ${category}.` });
    return registry;
  });
  editJson(path.join(namingRoot, 'category-role-perspective.registry.json'), (registry) => {
    (registry.rolesByCategory[category] ??= []).push({ role, agnosticCoreMeanings: ['structure'] });
    return registry;
  });
  editJson(path.join(namingRoot, 'roles.registry.json'), (registry) => {
    registry.roles.push({ role, status, definition: `Test role ${role}.` });
    return registry;
  });
};
const setRoleStatus = ({ namingRoot }, role, status) =>
  editJson(path.join(namingRoot, 'roles.registry.json'), (registry) => {
    registry.roles.find((entry) => entry.role === role).status = status;
    return registry;
  });
const CUSTOM_EDITS = (context) => {
  addRole(context, { category: 'legacy-support', role: 'shim', status: 'deprecated' });
  setRoleStatus(context, 'adapter', 'deprecated');
  addRole(context, { category: 'ledger-support', role: 'ledger', status: 'active' });
};

const VALID_INPUT = Object.freeze({
  registrySource: 'builtin',
  categoryRolePerspectiveDigest: 'digest-1',
  rolesDigest: 'digest-2',
  records: [
    { category: 'concern-core', roles: ['logic', 'wiring'] },
    { category: 'deprecated', roles: ['view'] },
    { category: 'documentation', roles: ['spec'] },
  ],
  admissibleCategories: ['concern-core', 'documentation'],
});

test('acceptance 1 (Builtin): declared records are the perspective registry, `deprecated` included; the bound is the categories of active roles', () => {
  const runtime = prepareNamingRuntimeInputs().namingRolesRuntime;
  const declared = deriveNamingRoleCategoryVocabulary(runtime);
  assert.deepEqual(declared, expectedDeclaredOf(NAMING_BUILTIN_REGISTRY_ROOT));
  assert.deepEqual(declared.find((record) => record.category === 'deprecated'), { category: 'deprecated', roles: ['view'] });
  assert.deepEqual(declared.flatMap((record) => record.roles).sort(byCodeUnit), [...runtime.roleMetadata.keys()].sort(byCodeUnit));
  const admissible = deriveNamingAdmissibleRoleCategories(runtime);
  assert.deepEqual(admissible, expectedAdmissibleOf(NAMING_BUILTIN_REGISTRY_ROOT));
  assert.equal(admissible.includes('deprecated'), false);
  assert.deepEqual(admissible, declared.map((record) => record.category).filter((category) => category !== 'deprecated'));
});

test('acceptance 1 (Builtin run): both digests and the source are copied from the run provenance, computing none', () => {
  withTargetRoot((targetRoot) => {
    const registryResolution = resolveActiveRegistrySet({ targetRoot });
    const { naming } = registryResolution.registryProvenance;
    const staged = prepareNamingTreeStagingInputs({}, { registryResolution }).roleCategoryVocabulary;
    assert.deepEqual(staged, {
      registrySource: 'builtin',
      categoryRolePerspectiveDigest: naming[NAMING_CATEGORY_ROLE_PERSPECTIVE_REGISTRY_ID].digest,
      rolesDigest: naming[NAMING_ROLES_REGISTRY_ID].digest,
      records: expectedDeclaredOf(NAMING_BUILTIN_REGISTRY_ROOT),
      admissibleCategories: expectedAdmissibleOf(NAMING_BUILTIN_REGISTRY_ROOT),
    });
    // A different digest in the resolution is copied, not recomputed.
    const altered = {
      ...registryResolution,
      registryProvenance: { ...registryResolution.registryProvenance, naming: { ...naming, [NAMING_ROLES_REGISTRY_ID]: { source: 'builtin', digest: 'copied-as-is' } } },
    };
    assert.equal(prepareNamingTreeStagingInputs({}, { registryResolution: altered }).roleCategoryVocabulary.rolesDigest, 'copied-as-is');
  });
});

test('acceptance 2 (Custom sets): deprecated-only category declared not admissible; a deprecated role keeps its active category admissible; an added active role is admissible', () => {
  withTargetRoot((targetRoot) => {
    const { namingRoot, registryResolution } = withCustomSet(targetRoot, CUSTOM_EDITS);
    const { naming } = registryResolution.registryProvenance;
    const staged = prepareNamingTreeStagingInputs({}, { registryResolution }).roleCategoryVocabulary;
    assert.equal(staged.registrySource, 'custom');
    assert.equal(staged.rolesDigest, naming[NAMING_ROLES_REGISTRY_ID].digest);
    assert.equal(staged.categoryRolePerspectiveDigest, naming[NAMING_CATEGORY_ROLE_PERSPECTIVE_REGISTRY_ID].digest);
    assert.deepEqual(staged.records, expectedDeclaredOf(namingRoot));
    assert.deepEqual(staged.admissibleCategories, expectedAdmissibleOf(namingRoot));
    const declaredCategories = staged.records.map((record) => record.category);
    // Declared, not admissible: a category whose only role is deprecated.
    assert.ok(declaredCategories.includes('legacy-support'));
    assert.equal(staged.admissibleCategories.includes('legacy-support'), false);
    // `adapter` is deprecated, yet `integration-adapter` keeps active roles and stays admissible.
    assert.equal(prepareNamingRuntimeInputs({ registryResolution }).namingRolesRuntime.activeRoles.has('adapter'), false);
    assert.ok(staged.admissibleCategories.includes('integration-adapter'));
    // An added active role's new category is admissible.
    assert.ok(staged.admissibleCategories.includes('ledger-support'));
    assert.ok(staged.admissibleCategories.every((category) => declaredCategories.includes(category)));
  });
});

test('no run provenance for either registry, or disagreeing sources: no staged value (never a vocabulary without provenance)', () => {
  const entry = (digest) => ({ source: 'builtin', digest });
  const at = (naming) => ({ registryResolution: { registryProvenance: { naming } } });
  assert.equal(prepareNamingRoleCategoryVocabulary({}), null);
  assert.equal(prepareNamingRoleCategoryVocabulary(at({})), null);
  assert.equal(prepareNamingRoleCategoryVocabulary(at({ [NAMING_CATEGORY_ROLE_PERSPECTIVE_REGISTRY_ID]: entry('a') })), null);
  assert.equal(prepareNamingRoleCategoryVocabulary(at({ [NAMING_ROLES_REGISTRY_ID]: entry('b') })), null);
  assert.equal(prepareNamingRoleCategoryVocabulary(at({ [NAMING_CATEGORY_ROLE_PERSPECTIVE_REGISTRY_ID]: entry(''), [NAMING_ROLES_REGISTRY_ID]: entry('b') })), null);
  assert.equal(prepareNamingRoleCategoryVocabulary(at({ [NAMING_CATEGORY_ROLE_PERSPECTIVE_REGISTRY_ID]: entry('a'), [NAMING_ROLES_REGISTRY_ID]: { source: 'custom', digest: 'b' } })), null);
  assert.equal('roleCategoryVocabulary' in prepareNamingTreeStagingInputs({}, {}), false);
  assert.equal('roleCategoryVocabulary' in prepareNamingTreeStagingInputs({}, { registryResolution: { activeSet: 'builtin', registryRoots: {} } }), false);
});

// Canonical-admission probes (Tree spec S1.3 v2 acceptance 4). One probe per role in the resolved runtime, with
// a multi-token semantic name and the first reportable extension the run's special-case rules do not match.
// The run is the real Naming classifier; the §4.5 records are the real staging projection.
const runCanonicalProbes = (targetRoot, registryResolution) => {
  const runtime = prepareNamingRuntimeInputs({ registryResolution });
  const probeDir = path.join(targetRoot, 'probes');
  fs.mkdirSync(probeDir, { recursive: true });
  const probes = [...runtime.namingRolesRuntime.roleMetadata.keys()].sort(byCodeUnit).map((role) => {
    const extension = [...runtime.reportableExtensions].sort(byCodeUnit).find((ext) => !getSpecialCaseType(`probes/probe-file.${role}${ext}`, runtime.specialCaseRulesRuntime));
    return { role, extension, relativePath: `probes/probe-file.${role}${extension}`, active: runtime.namingRolesRuntime.activeRoles.has(role) };
  });
  for (const probe of probes) {
    assert.ok(probe.extension, `${probe.role}: some reportable extension is not a special case`);
    fs.writeFileSync(path.join(targetRoot, probe.relativePath), 'probe\n');
  }
  const run = runNamingValidator(targetRoot, { scope: 'repo', targets: ['probes'], registryResolution });
  const staged = prepareNamingTreeStagingInputs(run, { registryResolution });
  const factByPath = new Map(staged.namingSemanticEvidenceEnrichment.records.map((record) => [record.repoRelativePath ?? record.path, record]));
  return { probes, factByPath, vocabulary: staged.roleCategoryVocabulary, findings: run.findings };
};

for (const [label, setUp] of [
  ['Builtin', (targetRoot) => ({ registryResolution: resolveActiveRegistrySet({ targetRoot }) })],
  ['Custom', (targetRoot) => withCustomSet(targetRoot, CUSTOM_EDITS)],
]) {
  test(`acceptance 4 (${label}, soundness): every probe is non-vacuous, and every category reaching §4.5 is in the bound`, () => {
    withTargetRoot((targetRoot) => {
      const { registryResolution } = setUp(targetRoot);
      const { probes, factByPath, vocabulary, findings } = runCanonicalProbes(targetRoot, registryResolution);
      assert.equal(findings.some((finding) => finding.code === 'NAMING_ALLOWED_SPECIAL_CASE'), false);
      // Non-vacuity: an eligible probe must reach §4.5, or the inclusion check below would prove nothing.
      for (const probe of probes.filter((item) => item.active)) assert.ok(factByPath.has(probe.relativePath), `${probe.role}: the probe produces a §4.5 role fact`);
      // Inclusion (soundness): every category the canonical path admitted is in the bound.
      const admitted = new Set([...factByPath.values()].map((record) => record.roleCategory));
      for (const category of admitted) assert.ok(vocabulary.admissibleCategories.includes(category), `${category}: admitted, so it must be in admissibleCategories`);
      // Inactive roles produce no role fact (the current structural dependency).
      for (const probe of probes.filter((item) => !item.active)) assert.equal(factByPath.has(probe.relativePath), false, `${probe.role}: inactive, no §4.5 role fact`);
    });
  });

  test(`acceptance 4 (${label}, precision check, not a soundness property): the probed categories equal the bound`, () => {
    withTargetRoot((targetRoot) => {
      const { registryResolution } = setUp(targetRoot);
      const { factByPath, vocabulary } = runCanonicalProbes(targetRoot, registryResolution);
      assert.deepEqual([...new Set([...factByPath.values()].map((record) => record.roleCategory))].sort(byCodeUnit), vocabulary.admissibleCategories);
    });
  });
}

test('acceptance 3: a Custom finding-policy labelling the deprecated-role outcome `canonical` changes neither the bound nor §4.5', () => {
  withTargetRoot((targetRoot) => {
    const { registryResolution } = withCustomSet(targetRoot, ({ namingRoot }) => {
      editJson(path.join(namingRoot, 'finding-policy.registry.json'), (registry) => {
        registry.outcomes['deprecated-role'].classification = 'canonical';
        return registry;
      });
    });
    fs.mkdirSync(path.join(targetRoot, 'src'), { recursive: true });
    for (const file of ['report-panel.view.mjs', 'report-table.logic.mjs']) fs.writeFileSync(path.join(targetRoot, 'src', file), 'x\n');
    const run = runNamingValidator(targetRoot, { scope: 'repo', registryResolution });
    // The relabel takes effect on the finding, which is the point of the case.
    assert.equal(run.findings.find((finding) => finding.path === 'src/report-panel.view.mjs').classification, 'canonical');
    const staged = prepareNamingTreeStagingInputs(run, { registryResolution });
    assert.deepEqual(staged.roleCategoryVocabulary.admissibleCategories, expectedAdmissibleOf(NAMING_BUILTIN_REGISTRY_ROOT));
    const categories = staged.namingSemanticEvidenceEnrichment.records.map((record) => record.roleCategory);
    assert.deepEqual(categories, ['concern-core']);
    assert.ok(categories.every((category) => staged.roleCategoryVocabulary.admissibleCategories.includes(category)));
  });
});

test('acceptance 10 (producer): the v2 envelope, payload-level (no identity tuple), records and bound as staged', () => {
  assert.equal(ROLE_CATEGORY_VOCABULARY_SECTION_VERSION, 'naming-role-category-vocabulary.v2');
  assert.deepEqual(projectNamingRoleCategoryVocabulary({ roleCategoryVocabulary: VALID_INPUT }), {
    contractVersion: 'naming-role-category-vocabulary.v2',
    producerId: 'naming-role-category-vocabulary',
    source: 'calculogic-validator/naming',
    registrySource: 'builtin',
    categoryRolePerspectiveDigest: 'digest-1',
    rolesDigest: 'digest-2',
    recordCount: 3,
    records: VALID_INPUT.records,
    admissibleCategories: ['concern-core', 'documentation'],
  });
  // A valid empty bound is emitted as such.
  assert.deepEqual(projectNamingRoleCategoryVocabulary({ roleCategoryVocabulary: { ...VALID_INPUT, admissibleCategories: [] } }).admissibleCategories, []);
});

test('acceptance 10 (producer completeness): an input that is not a complete, well-formed v2 vocabulary gives no section, never a partial one', () => {
  const variants = {
    missingDigest: { ...VALID_INPUT, categoryRolePerspectiveDigest: undefined },
    missingRolesDigest: { ...VALID_INPUT, rolesDigest: undefined },
    emptyRolesDigest: { ...VALID_INPUT, rolesDigest: '' },
    missingBound: { ...VALID_INPUT, admissibleCategories: undefined },
    unsortedBound: { ...VALID_INPUT, admissibleCategories: ['documentation', 'concern-core'] },
    duplicateBound: { ...VALID_INPUT, admissibleCategories: ['concern-core', 'concern-core'] },
    emptyStringBound: { ...VALID_INPUT, admissibleCategories: [''] },
    nonStringBound: { ...VALID_INPUT, admissibleCategories: [7] },
    boundOutsideRecords: { ...VALID_INPUT, admissibleCategories: ['concern-core', 'unknown'] },
    unknownSource: { ...VALID_INPUT, registrySource: 'other' },
    emptyCategory: { ...VALID_INPUT, records: [{ category: '', roles: ['logic'] }], admissibleCategories: [] },
    emptyRoles: { ...VALID_INPUT, records: [{ category: 'concern-core', roles: [] }], admissibleCategories: [] },
    unsortedRoles: { ...VALID_INPUT, records: [{ category: 'concern-core', roles: ['wiring', 'logic'] }], admissibleCategories: [] },
    duplicateCategory: { ...VALID_INPUT, records: [{ category: 'a', roles: ['x'] }, { category: 'a', roles: ['y'] }], admissibleCategories: [] },
    unsortedCategories: { ...VALID_INPUT, records: [...VALID_INPUT.records].reverse() },
    extraRecordField: { ...VALID_INPUT, records: [{ category: 'concern-core', roles: ['logic'], status: 'active' }], admissibleCategories: [] },
    v1Shape: { registrySource: 'builtin', categoryRolePerspectiveDigest: 'digest-1', records: VALID_INPUT.records },
    notObject: 'vocabulary',
  };
  for (const [name, roleCategoryVocabulary] of Object.entries(variants)) {
    assert.equal(projectNamingRoleCategoryVocabulary({ roleCategoryVocabulary }), null, name);
    assert.equal('namingRoleCategoryVocabulary' in createNamingOccurrenceBridgePayload({ roleCategoryVocabulary }), false, name);
  }
  assert.equal(projectNamingRoleCategoryVocabulary({}), null);
});

test('acceptance 10 (producer paths): v2 on the payload and direct paths, added last, never v1, nothing else changes', () => {
  const namespace = { addressProfileId: 'p', addressedSnapshotId: 's', occurrenceRecords: [] };
  const without = createNamingOccurrenceBridgePayload({ addressedOccurrenceNamespace: namespace });
  const withSection = createNamingOccurrenceBridgePayload({ addressedOccurrenceNamespace: namespace, roleCategoryVocabulary: VALID_INPUT });
  const { namingRoleCategoryVocabulary, ...rest } = withSection;
  assert.deepEqual(rest, without);
  assert.equal(namingRoleCategoryVocabulary.contractVersion, 'naming-role-category-vocabulary.v2');
  assert.equal('identityTupleFields' in namingRoleCategoryVocabulary, false);
  assert.ok(namingRoleCategoryVocabulary.records.every((record) => Object.keys(record).join() === 'category,roles'));
  assert.equal(JSON.stringify(withSection).includes('naming-role-category-vocabulary.v1'), false);
  // Independent of the addressed namespace, and the same section on the direct path.
  assert.ok(createNamingOccurrenceBridgePayload({ roleCategoryVocabulary: VALID_INPUT }).namingRoleCategoryVocabulary);
  assert.deepEqual(projectNamingOccurrenceBridge({}, { addressedOccurrenceNamespace: namespace, roleCategoryVocabulary: VALID_INPUT }).namingRoleCategoryVocabulary, namingRoleCategoryVocabulary);
});

test('origin: only the exact staged value, for the exact resolution object, is Naming-derived; it is deeply frozen, bound included', () => {
  withTargetRoot((targetRoot) => {
    const registryResolution = resolveActiveRegistrySet({ targetRoot });
    const vocabulary = prepareNamingTreeStagingInputs({}, { registryResolution }).roleCategoryVocabulary;
    assert.equal(isNamingDerivedRoleCategoryVocabulary(vocabulary, registryResolution), true);
    assert.equal(isNamingDerivedRoleCategoryVocabulary(vocabulary, { ...registryResolution }), false);
    assert.equal(isNamingDerivedRoleCategoryVocabulary(vocabulary, resolveActiveRegistrySet({ targetRoot })), false);
    assert.equal(isNamingDerivedRoleCategoryVocabulary(structuredClone(vocabulary), registryResolution), false);
    assert.equal(isNamingDerivedRoleCategoryVocabulary({ ...vocabulary, admissibleCategories: ['concern-core'] }, registryResolution), false);
    assert.equal(isNamingDerivedRoleCategoryVocabulary(VALID_INPUT, registryResolution), false);
    assert.equal(isNamingDerivedRoleCategoryVocabulary(vocabulary, undefined), false);
    assert.equal(isNamingDerivedRoleCategoryVocabulary(undefined, registryResolution), false);
    assert.ok(Object.isFrozen(vocabulary) && Object.isFrozen(vocabulary.records) && Object.isFrozen(vocabulary.admissibleCategories));
    assert.ok(vocabulary.records.every((record) => Object.isFrozen(record) && Object.isFrozen(record.roles)));
    assert.throws(() => { vocabulary.admissibleCategories.pop(); }, TypeError);
    assert.equal(projectNamingRoleCategoryVocabulary({ roleCategoryVocabulary: vocabulary }).recordCount, vocabulary.records.length);
  });
});

test('regression (review of 3db95b8): the factory takes no caller runtime; a truncated one shapes neither set', () => {
  withTargetRoot((targetRoot) => {
    const registryResolution = resolveActiveRegistrySet({ targetRoot });
    const runtime = prepareNamingRuntimeInputs({ registryResolution }).namingRolesRuntime;
    const truncated = { ...runtime, roleMetadata: new Map([...runtime.roleMetadata].filter(([, entry]) => entry.category !== 'integration-adapter')) };
    const vocabulary = prepareNamingRoleCategoryVocabulary({ registryResolution, namingRolesRuntime: truncated });
    assert.deepEqual(vocabulary.records, expectedDeclaredOf(NAMING_BUILTIN_REGISTRY_ROOT));
    assert.deepEqual(vocabulary.admissibleCategories, expectedAdmissibleOf(NAMING_BUILTIN_REGISTRY_ROOT));
    assert.ok(vocabulary.admissibleCategories.includes('integration-adapter'));
    assert.equal(deriveNamingAdmissibleRoleCategories(truncated).includes('integration-adapter'), false);
  });
});
