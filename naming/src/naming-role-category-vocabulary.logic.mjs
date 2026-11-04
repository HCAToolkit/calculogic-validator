/**
 * Configuration: cfg-namingValidator
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-namingValidator.md (§2.14)
 * Responsibility: The run's producible role-category vocabulary and the payload-level
 *   `namingRoleCategoryVocabulary` bridge section (bridge contract §4.4 rule 9, §4.9, §6.6;
 *   calculogic-validator#162).
 * Invariants: the one place the vocabulary is derived, from the resolved roles runtime only (every role,
 *   whatever its status); provenance is copied from the run's suite-provided registry provenance, never
 *   computed here; no provenance, no vocabulary; the section is emitted whole or omitted, never partial;
 *   no identity tuple, `repoRelativePath` or occurrence; categories and roles sorted by code unit.
 */
import { NAMING_REGISTRY_SLICE_ID } from './registries/naming-registry-inventory.knowledge.mjs';

export const ROLE_CATEGORY_VOCABULARY_SECTION_VERSION = 'naming-role-category-vocabulary.v1';
// The registry whose suite-provided provenance the section carries (registry lifecycle spec §11.2).
export const NAMING_CATEGORY_ROLE_PERSPECTIVE_REGISTRY_ID = 'naming/category-role-perspective';
const PRODUCER_ID = 'naming-role-category-vocabulary';
const SOURCE = 'calculogic-validator/naming';
const REGISTRY_SOURCES = new Set(['builtin', 'custom', 'candidate']);

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const compareCodeUnits = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const isStrictlyAscending = (values) => values.every((value, index) => index === 0 || values[index - 1] < value);

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

// [2.14] cfg-namingValidator · Container · "prepareNamingRoleCategoryVocabulary"
// Concern: Logic · Parent: Naming Tree staging (`prepareNamingTreeStagingInputs`)
// Notes: the opaque staged value `{ registrySource, categoryRolePerspectiveDigest, records }`, with both
// provenance fields copied from the run's provenance entry for `naming/category-role-perspective`. Returns
// null when the resolution carries no such entry: Naming never supplies provenance of its own.
export const prepareNamingRoleCategoryVocabulary = ({ namingRolesRuntime, registryResolution } = {}) => {
  const provenance = registryResolution?.registryProvenance?.[NAMING_REGISTRY_SLICE_ID]?.[NAMING_CATEGORY_ROLE_PERSPECTIVE_REGISTRY_ID];
  if (!isPlainObject(provenance) || !isNonEmptyString(provenance.source) || !isNonEmptyString(provenance.digest)) return null;
  return {
    registrySource: provenance.source,
    categoryRolePerspectiveDigest: provenance.digest,
    records: deriveNamingRoleCategoryVocabulary(namingRolesRuntime),
  };
};

// [2.14] cfg-namingValidator · Primitive · "isCompleteVocabularyInput"
// Concern: Logic · Parent: "projectNamingRoleCategoryVocabulary"
// Notes: the §6.6 shapes, as the staged value carries them: a known source, a digest, and records with
// only `category` and `roles`, categories unique and sorted, roles non-empty, unique and sorted.
const isCompleteVocabularyInput = (input) =>
  isPlainObject(input) &&
  REGISTRY_SOURCES.has(input.registrySource) &&
  isNonEmptyString(input.categoryRolePerspectiveDigest) &&
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
  isStrictlyAscending(input.records.map((record) => record.category));

// [2.14] cfg-namingValidator · Container · "projectNamingRoleCategoryVocabulary"
// Concern: Logic · Parent: `createNamingOccurrenceBridgePayload`
// Notes: the §4.9 section from the staged value, or null (section omitted) with no input or with an input
// that is not a complete, well-formed vocabulary. Independent of the addressed namespace.
export const projectNamingRoleCategoryVocabulary = ({ roleCategoryVocabulary } = {}) => {
  if (!isCompleteVocabularyInput(roleCategoryVocabulary)) return null;
  const records = roleCategoryVocabulary.records.map(({ category, roles }) => ({ category, roles: [...roles] }));
  return {
    contractVersion: ROLE_CATEGORY_VOCABULARY_SECTION_VERSION,
    producerId: PRODUCER_ID,
    source: SOURCE,
    registrySource: roleCategoryVocabulary.registrySource,
    categoryRolePerspectiveDigest: roleCategoryVocabulary.categoryRolePerspectiveDigest,
    recordCount: records.length,
    records,
  };
};
