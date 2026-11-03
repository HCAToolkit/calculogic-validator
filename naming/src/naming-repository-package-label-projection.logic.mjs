/**
 * Configuration: cfg-namingValidator
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-namingValidator.md (§2.13)
 * Responsibility: Projects the payload-level `namingRepositoryPackageLabels` bridge section (bridge
 *   contract §4.4 rule 9, §4.8, §6.5; calculogic-validator#157, #159) from the suite-core repository
 *   package identity fact (capability inventory §3.11).
 * Invariants: each declared segment is interpreted by the folder-label interpreter Naming already
 *   supplies for §4.6, unchanged; Naming reads no manifest and derives no identity; no identity tuple,
 *   `repoRelativePath` or occurrence; records ordered `scope`, then `name`; no fact, no section.
 */

export const REPOSITORY_PACKAGE_LABEL_SECTION_VERSION = 'naming-repository-package-label.v1';
const PRODUCER_ID = 'naming-repository-package-label';
const SOURCE = 'calculogic-validator/naming';
const ELEMENTS = Object.freeze(['scope', 'name']);

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// [2.13] cfg-namingValidator · Primitive · "toDeclaredSegments"
// Concern: Logic · Parent: "projectNamingRepositoryPackageLabels"
// Notes: the fact's segments in element order, or null when the value is not a §3.11 fact (a name,
// and a scope that is null or a segment). The fact is suite core's; Naming does not repair it.
const toDeclaredSegments = (identity) => {
  if (!isPlainObject(identity) || !isNonEmptyString(identity.name)) return null;
  if (identity.scope !== null && identity.scope !== undefined && !isNonEmptyString(identity.scope)) return null;
  return ELEMENTS.filter((element) => isNonEmptyString(identity[element])).map((element) => ({ element, segment: identity[element] }));
};

// [2.13] cfg-namingValidator · Container · "projectNamingRepositoryPackageLabels"
// Concern: Logic · Parent: `createNamingOccurrenceBridgePayload`
// Notes: one record per declared segment, `{ element, segment, ...interpretation }`, where the
// interpretation is the §4.6 parse field group exactly as the interpreter returns it. Returns null
// (section omitted) without a fact or an interpreter.
export const projectNamingRepositoryPackageLabels = ({ repositoryPackageIdentity, interpretFolderLabel } = {}) => {
  if (typeof interpretFolderLabel !== 'function') return null;
  const segments = toDeclaredSegments(repositoryPackageIdentity);
  if (!segments) return null;
  const records = segments.map(({ element, segment }) => ({ element, segment, ...interpretFolderLabel(segment) }));
  return {
    contractVersion: REPOSITORY_PACKAGE_LABEL_SECTION_VERSION,
    producerId: PRODUCER_ID,
    source: SOURCE,
    recordCount: records.length,
    records,
  };
};
