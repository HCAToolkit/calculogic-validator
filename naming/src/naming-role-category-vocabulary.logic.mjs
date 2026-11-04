/**
 * Configuration: cfg-namingValidator
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-namingValidator.md (§2.14)
 * Responsibility: The run's declared role-category vocabulary, its canonically admissible upper bound, and
 *   the payload-level `namingRoleCategoryVocabulary` bridge section, version 2 (bridge contract §4.4 rule 9,
 *   §4.9, §4.9.1, §6.6; calculogic-validator#162).
 * Invariants: the one place the vocabulary is derived, from the resolved roles runtime only (every role,
 *   whatever its status); provenance is copied from the run's suite-provided registry provenance, never
 *   computed here; no provenance, no vocabulary; the section is emitted whole or omitted, never partial;
 *   no identity tuple, `repoRelativePath` or occurrence; categories and roles sorted by code unit. A staged
 *   value is deeply frozen and bound to the registry resolution object it was derived from, so a consumer can
 *   tell a Naming-derived vocabulary from one built or edited elsewhere (Tree spec S1.1, S1.2 check 3).
 *   The admissible bound is derived from `activeRoles`, the eligibility source canonical admission reads
 *   (§4.9.1, structural dependency); a change to how canonical admission depends on roles reopens §4.9.
 */
import { NAMING_REGISTRY_SLICE_ID } from './registries/naming-registry-inventory.knowledge.mjs';
import { resolveNamingRegistryInputs, toNamingRegistryInputsOptions } from './registries/registry-state.logic.mjs';
import { toNamingRolesRuntime } from './naming-runtime-converters.logic.mjs';

// Version 2 replaces version 1 in emission (§4.9.1); v1 stays documented in the contract.
export const ROLE_CATEGORY_VOCABULARY_SECTION_VERSION = 'naming-role-category-vocabulary.v2';
// The registries whose suite-provided provenance the section carries (registry lifecycle spec §11.2):
// categories and roles come from the perspective, role statuses (and so the bound) from `naming/roles`.
export const NAMING_CATEGORY_ROLE_PERSPECTIVE_REGISTRY_ID = 'naming/category-role-perspective';
export const NAMING_ROLES_REGISTRY_ID = 'naming/roles';
const PRODUCER_ID = 'naming-role-category-vocabulary';
const SOURCE = 'calculogic-validator/naming';
const REGISTRY_SOURCES = new Set(['builtin', 'custom', 'candidate']);

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const compareCodeUnits = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const isStrictlyAscending = (values) => values.every((value, index) => index === 0 || values[index - 1] < value);

// Each staged value this module derived, mapped to the registry resolution object it was derived from.
// Module-private: no other code can add an entry, so membership is the derivation's own record.
const derivedFromResolution = new WeakMap();
const deepFreezeVocabulary = (vocabulary) =>
  Object.freeze({
    ...vocabulary,
    records: Object.freeze(vocabulary.records.map(({ category, roles }) => Object.freeze({ category, roles: Object.freeze([...roles]) }))),
    admissibleCategories: Object.freeze([...vocabulary.admissibleCategories]),
  });
const isProvenanceEntry = (entry) => isPlainObject(entry) && isNonEmptyString(entry.source) && isNonEmptyString(entry.digest);

// [2.14] cfg-namingValidator · Container · "deriveNamingRoleCategoryVocabulary"
// Concern: Logic · Parent: "prepareNamingRoleCategoryVocabulary"
// Notes: every role in `roleMetadata` (the runtime keeps one entry per role; `toNamingRolesRuntime`),
// active or deprecated, under the category the runtime records for it. That is the domain of a §4.5
// `roleCategory` in the run, since every role-fact group is read from the same runtime. A category with
// no role is not producible and has no record.
export const deriveNamingRoleCategoryVocabulary = (namingRolesRuntime) => {
  const rolesByCategory = new Map();
  for (const entry of namingRolesRuntime?.roleMetadata?.values() ?? []) {
    if (!isNonEmptyString(entry?.role) || !isNonEmptyString(entry?.category)) {
      throw new Error('Role-category vocabulary: every runtime role must carry a non-empty role and category.');
    }
    if (!rolesByCategory.has(entry.category)) rolesByCategory.set(entry.category, new Set());
    rolesByCategory.get(entry.category).add(entry.role);
  }
  return [...rolesByCategory.keys()]
    .sort(compareCodeUnits)
    .map((category) => ({ category, roles: [...rolesByCategory.get(category)].sort(compareCodeUnits) }));
};

// [2.14] cfg-namingValidator · Container · "deriveNamingAdmissibleRoleCategories"
// Concern: Logic · Parent: "prepareNamingRoleCategoryVocabulary"
// Notes: the canonically admissible upper bound (§4.9.1): the categories of the roles in the runtime's
// `activeRoles`, which is the set canonical admission checks a role against
// (`isUnknownOrInactiveRole(role, roleMetadata, runtime.activeRoles)`). The other admission conditions depend
// only on the filename and can only exclude a file, so the bound is sound without inspecting files. Sorted.
export const deriveNamingAdmissibleRoleCategories = (namingRolesRuntime) => {
  const activeRoles = namingRolesRuntime?.activeRoles ?? new Set();
  const categories = new Set();
  for (const entry of namingRolesRuntime?.roleMetadata?.values() ?? []) {
    if (activeRoles.has(entry?.role) && isNonEmptyString(entry?.category)) categories.add(entry.category);
  }
  return [...categories].sort(compareCodeUnits);
};

// [2.14] cfg-namingValidator · Container · "prepareNamingRoleCategoryVocabulary"
// Concern: Logic · Parent: Naming Tree staging (`prepareNamingTreeStagingInputs`)
// Notes: the opaque staged value `{ registrySource, categoryRolePerspectiveDigest, rolesDigest, records,
// admissibleCategories }`, with the provenance fields copied from the run's provenance entries for
// `naming/category-role-perspective` and `naming/roles` (§4.9.1). Returns null when either entry is missing or
// the two disagree on the run's source: Naming never supplies provenance of its own. The declared records and
// the admissible bound come from one resolved roles runtime, in one value. The roles
// runtime is resolved here, from `registryResolution` alone (the same loader and converter as the run's
// runtime inputs), never taken from the caller: the value is then deeply frozen and recorded against that
// resolution (see `isNamingDerivedRoleCategoryVocabulary`), so nothing but the resolution decides its content.
export const prepareNamingRoleCategoryVocabulary = ({ registryResolution } = {}) => {
  const sliceProvenance = registryResolution?.registryProvenance?.[NAMING_REGISTRY_SLICE_ID];
  const perspective = sliceProvenance?.[NAMING_CATEGORY_ROLE_PERSPECTIVE_REGISTRY_ID];
  const roles = sliceProvenance?.[NAMING_ROLES_REGISTRY_ID];
  if (!isProvenanceEntry(perspective) || !isProvenanceEntry(roles) || perspective.source !== roles.source) return null;
  const namingRolesRuntime = toNamingRolesRuntime(resolveNamingRegistryInputs(toNamingRegistryInputsOptions(registryResolution)).roles);
  const vocabulary = deepFreezeVocabulary({
    registrySource: perspective.source,
    categoryRolePerspectiveDigest: perspective.digest,
    rolesDigest: roles.digest,
    records: deriveNamingRoleCategoryVocabulary(namingRolesRuntime),
    admissibleCategories: deriveNamingAdmissibleRoleCategories(namingRolesRuntime),
  });
  derivedFromResolution.set(vocabulary, registryResolution);
  return vocabulary;
};

// [2.14] cfg-namingValidator · Primitive · "isNamingDerivedRoleCategoryVocabulary"
// Concern: Logic · Parent: Tree wiring (vocabulary origin, Tree spec S1.1)
// Notes: true only for the exact value `prepareNamingRoleCategoryVocabulary` returned for this exact
// `registryResolution` object. A copy, an edited or hand-built value, or one staged under another resolution
// is not Naming-derived for the run. It reads no registry and returns no vocabulary content.
export const isNamingDerivedRoleCategoryVocabulary = (value, registryResolution) =>
  value !== null &&
  typeof value === 'object' &&
  registryResolution !== null &&
  typeof registryResolution === 'object' &&
  derivedFromResolution.get(value) === registryResolution;

// [2.14] cfg-namingValidator · Primitive · "isCompleteVocabularyInput"
// Concern: Logic · Parent: "projectNamingRoleCategoryVocabulary"
// Notes: the §6.6 shapes (v2), as the staged value carries them: a known source, both digests, records with
// only `category` and `roles` (categories unique and sorted, roles non-empty, unique and sorted), and an
// admissible bound that is sorted, duplicate-free and names only record categories. An empty bound is valid.
const isAdmissibleBound = (bound, records) => {
  if (!Array.isArray(bound) || !bound.every(isNonEmptyString) || !isStrictlyAscending(bound)) return false;
  const declared = new Set(records.map((record) => record.category));
  return bound.every((category) => declared.has(category));
};
const isCompleteVocabularyInput = (input) =>
  isPlainObject(input) &&
  REGISTRY_SOURCES.has(input.registrySource) &&
  isNonEmptyString(input.categoryRolePerspectiveDigest) &&
  isNonEmptyString(input.rolesDigest) &&
  Array.isArray(input.records) &&
  input.records.every(
    (record) =>
      isPlainObject(record) &&
      Object.keys(record).every((key) => key === 'category' || key === 'roles') &&
      isNonEmptyString(record.category) &&
      Array.isArray(record.roles) &&
      record.roles.length > 0 &&
      record.roles.every(isNonEmptyString) &&
      isStrictlyAscending(record.roles),
  ) &&
  isStrictlyAscending(input.records.map((record) => record.category)) &&
  isAdmissibleBound(input.admissibleCategories, input.records);

// [2.14] cfg-namingValidator · Container · "projectNamingRoleCategoryVocabulary"
// Concern: Logic · Parent: `createNamingOccurrenceBridgePayload`
// Notes: the §4.9.1 (v2) section from the staged value, or null (section omitted) with no input or with an
// input that is not a complete, well-formed vocabulary. Independent of the addressed namespace. Never v1.
export const projectNamingRoleCategoryVocabulary = ({ roleCategoryVocabulary } = {}) => {
  if (!isCompleteVocabularyInput(roleCategoryVocabulary)) return null;
  const records = roleCategoryVocabulary.records.map(({ category, roles }) => ({ category, roles: [...roles] }));
  return {
    contractVersion: ROLE_CATEGORY_VOCABULARY_SECTION_VERSION,
    producerId: PRODUCER_ID,
    source: SOURCE,
    registrySource: roleCategoryVocabulary.registrySource,
    categoryRolePerspectiveDigest: roleCategoryVocabulary.categoryRolePerspectiveDigest,
    rolesDigest: roleCategoryVocabulary.rolesDigest,
    recordCount: records.length,
    records,
    admissibleCategories: [...roleCategoryVocabulary.admissibleCategories],
  };
};
