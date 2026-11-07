/**
 * Configuration: cfg-treeStructureAdvisor
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-treeStructureAdvisor.md (§2.4)
 * Responsibility: qualify addressed Naming evidence for legacy consumers and diagnose incompatibility.
 * Invariants: no identity derivation, path checks, mutation, supplementation or policy activation.
 */
const SOURCE = 'tree-addressing-compatibility-intake';
const FIELDS = ['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress'];
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isString = (value) => typeof value === 'string' && value.length > 0;
const tupleOf = (value) => isObject(value) && FIELDS.every((field) => isString(value[field]))
  ? Object.fromEntries(FIELDS.map((field) => [field, value[field]])) : null;
const keyOf = (tuple) => JSON.stringify(FIELDS.map((field) => tuple[field]));
const sameNamespace = (left, right) =>
  left.addressProfileId === right.addressProfileId && left.addressedSnapshotId === right.addressedSnapshotId;
const hasNamespace = (value) => isObject(value) && isString(value.addressProfileId) && isString(value.addressedSnapshotId);
const diagnostic = (section, reason, identityTuple = null) => ({ source: SOURCE, section, reason, identityTuple });

// [2.4] cfg-treeStructureAdvisor · Primitive · "prepareTreeNamingStagingCompatibility"
// Concern: Logic · Parent: Tree-built bridge construction
// Notes: ordinary path-keyed staging needs no identity; only explicit addressed framing is withheld.
export const prepareTreeNamingStagingCompatibility = (staged = {}) => {
  const diagnostics = [];
  const safe = Object.fromEntries(['namingSemanticFamilyBridge', 'namingSemanticEvidenceEnrichment'].map((field) => {
    const value = staged[field];
    if (isObject(value) && (Object.hasOwn(value, 'bridgeContractVersion') || Object.hasOwn(value, 'namingOccurrenceBridge'))) {
      diagnostics.push(diagnostic(field, 'addressed-payload-in-staging'));
      return [field, undefined];
    }
    return [field, value];
  }));
  return { ...safe, diagnostics };
};

// [2.4] cfg-treeStructureAdvisor · Container · "prepareTreeAddressingCompatibilityIntake"
// Concern: Logic · Parent: Tree Naming evidence consumption
// Notes: modern intake keeps the original payload and its precedence; this view never uses B2 rejections.
export const prepareTreeAddressingCompatibilityIntake = ({ payload, addressedNamespace, occurrenceRecords = [] } = {}) => {
  if (!hasNamespace(addressedNamespace)) throw new Error('Tree compatibility requires the actual addressed namespace.');
  const diagnostics = [];
  const occurrenceKeys = new Set(occurrenceRecords.flatMap((record) => {
    const occurrenceAddress = [record?.occurrenceAddress, record?.address, record?.addressPath].find(isString);
    return occurrenceAddress ? [keyOf({ ...addressedNamespace, occurrenceAddress })] : [];
  }));
  const envelopeReason = !hasNamespace(payload) ? 'invalid-addressing-identity'
    : !sameNamespace(payload, addressedNamespace) ? 'incompatible-addressing-namespace' : null;
  if (envelopeReason) diagnostics.push(diagnostic('naming-occurrence-bridge', envelopeReason));
  const qualify = (records, section) => (Array.isArray(records) ? records : []).filter((record) => {
    if (envelopeReason) return false;
    const tuple = tupleOf(record);
    const reason = !tuple ? 'invalid-addressing-identity'
      : !sameNamespace(tuple, payload) || !sameNamespace(tuple, addressedNamespace) ? 'incompatible-addressing-namespace'
        : !occurrenceKeys.has(keyOf(tuple)) ? 'unmatched-addressing-identity' : null;
    if (reason) diagnostics.push(diagnostic(section, reason, tuple));
    return !reason;
  });
  const observations = qualify(payload?.observations, 'naming-occurrence-bridge');
  for (const [key, section] of [
    ['namingSemanticEvidenceEnrichment', 'naming-semantic-evidence-enrichment'],
    ['namingFolderLabelObservations', 'naming-folder-label-observation'],
    ['namingTokenLexicalIdentities', 'naming-token-lexical-identity'],
  ]) qualify(payload?.[key]?.records, section);
  qualify(payload?.occurrenceContextEnrichment?.enrichedObservations, 'naming-occurrence-context-enrichment');
  diagnostics.sort((left, right) => left.section.localeCompare(right.section) ||
    (left.identityTuple ? keyOf(left.identityTuple) : '').localeCompare(right.identityTuple ? keyOf(right.identityTuple) : '') ||
    left.reason.localeCompare(right.reason));
  return { observations, diagnostics };
};
