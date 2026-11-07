/**
 * Configuration: cfg-treeStructureAdvisor
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-treeStructureAdvisor.md (§2.4)
 * Responsibility: qualify addressed Naming evidence for legacy consumers and diagnose incompatibility.
 * Invariants: no identity derivation, path checks, mutation, supplementation or policy activation.
 */
const SOURCE = 'tree-addressing-compatibility-intake';
const FIELDS = ['addressProfileId', 'addressedSnapshotId', 'occurrenceAddress'];
const NAMESPACE_FIELDS = FIELDS.slice(0, 2);
const SECTIONS = [
  ['namingSemanticEvidenceEnrichment', 'records', 'naming-semantic-evidence-enrichment'],
  ['namingFolderLabelObservations', 'records', 'naming-folder-label-observation'],
  ['namingTokenLexicalIdentities', 'records', 'naming-token-lexical-identity'],
  ['occurrenceContextEnrichment', 'enrichedObservations', 'naming-occurrence-context-enrichment'],
];
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isString = (value) => typeof value === 'string' && value.length > 0;
const hasOwnStrings = (value, fields) => isObject(value) && fields.every((field) => Object.hasOwn(value, field) && isString(value[field]));
const tupleOf = (value) => hasOwnStrings(value, FIELDS)
  ? Object.fromEntries(FIELDS.map((field) => [field, value[field]])) : null;
const keyOf = (tuple) => JSON.stringify(FIELDS.map((field) => tuple[field]));
const sameNamespace = (left, right) =>
  left.addressProfileId === right.addressProfileId && left.addressedSnapshotId === right.addressedSnapshotId;
const hasNamespace = (value) => hasOwnStrings(value, NAMESPACE_FIELDS);
const diagnostic = (section, reason, identityTuple = null) => ({ source: SOURCE, section, reason, identityTuple });

const hasAddressedFraming = (value) => {
  if (!isObject(value)) return false;
  if (Object.hasOwn(value, 'bridgeContractVersion') || Object.hasOwn(value, 'namingOccurrenceBridge')) return true;
  const namespaces = NAMESPACE_FIELDS.filter((field) => Object.hasOwn(value, field)).length;
  return namespaces > 0 && ['observations', 'records'].some((field) =>
    Object.hasOwn(value, field) && Array.isArray(value[field]) && (
      (namespaces === 2 && value[field].length === 0) || value[field].some((record) => isObject(record) && (
        FIELDS.every((key) => Object.hasOwn(record, key)) ||
        (namespaces === 2 && FIELDS.some((key) => Object.hasOwn(record, key)))
      ))
    ));
};

// Identity-only consumer views preserve prototypes and descriptors, including B2 path ownership.
// Shadow inherited identities rather than changing the original input or conformance-bound intake.
const withValues = (value, values) => Object.create(Object.getPrototypeOf(value), {
  ...Object.getOwnPropertyDescriptors(value),
  ...Object.fromEntries(Object.entries(values).map(([field, entry]) => [field, {
    value: entry, enumerable: true, configurable: true, writable: true,
  }])),
});
const ownIdentityView = (value, fields) => {
  if (!isObject(value)) return value;
  const inherited = fields.filter((field) => !Object.hasOwn(value, field) && field in value);
  return inherited.length ? withValues(value, Object.fromEntries(inherited.map((field) => [field, undefined]))) : value;
};
const recordView = (value, field) => {
  if (!isObject(value) || !Array.isArray(value[field])) return value;
  const records = value[field].map((record) => ownIdentityView(record, FIELDS));
  return records.some((record, index) => record !== value[field][index]) ? withValues(value, { [field]: records }) : value;
};
const addressedPayloadView = (payload) => {
  let view = recordView(ownIdentityView(payload, NAMESPACE_FIELDS), 'observations');
  if (!isObject(view)) return view;
  for (const [key, recordsKey] of SECTIONS) {
    const section = recordView(view[key], recordsKey);
    if (section !== view[key]) view = withValues(view, { [key]: section });
  }
  return view;
};

// [2.4] cfg-treeStructureAdvisor · Primitive · "prepareTreeNamingStagingCompatibility"
// Concern: Logic · Parent: Tree-built bridge construction
// Notes: ordinary path-keyed staging needs no identity; only explicit addressed framing is withheld.
export const prepareTreeNamingStagingCompatibility = (staged = {}) => {
  const diagnostics = [];
  const safe = Object.fromEntries(['namingSemanticFamilyBridge', 'namingSemanticEvidenceEnrichment'].map((field) => {
    const value = staged[field];
    if (hasAddressedFraming(value)) {
      diagnostics.push(diagnostic(field, 'addressed-payload-in-staging'));
      return [field, undefined];
    }
    return [field, value];
  }));
  return { ...safe, diagnostics };
};

// [2.4] cfg-treeStructureAdvisor · Container · "prepareTreeAddressingCompatibilityIntake"
// Concern: Logic · Parent: Tree Naming evidence consumption
// Notes: retain the original input; addressed views mask inherited identity without using B2 rejections.
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
  for (const [key, recordsKey, section] of SECTIONS) qualify(payload?.[key]?.[recordsKey], section);
  diagnostics.sort((left, right) => left.section.localeCompare(right.section) ||
    (left.identityTuple ? keyOf(left.identityTuple) : '').localeCompare(right.identityTuple ? keyOf(right.identityTuple) : '') ||
    left.reason.localeCompare(right.reason));
  return { observations, diagnostics, addressedPayload: addressedPayloadView(payload) };
};
