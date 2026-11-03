/**
 * Configuration: cfg-treeStructureAdvisor
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-treeStructureAdvisor.md (§2.4, repository package expression)
 * Responsibility: Tree's repository-package evidence module (Tree slice spec S1.1, S3.2; bridge contract
 *   §4.4 rule 9, §4.8; calculogic-validator#157, #159): the intake of the payload-level Naming
 *   `namingRepositoryPackageLabels` section into `treeRepositoryPackageIntake`, and the package elements
 *   Stage 3 walks.
 * Invariants: outside `treeNamingSectionIntake` and every Stage 1/Stage 2 module; never reads a manifest,
 *   tokenizes a segment or touches an occurrence (no identity tuple, join or synthetic root occurrence);
 *   an absent section gives no record; record problems drop only their records, in the §4.8 table order;
 *   only accepted `parsed` records become elements; diagnostics stay in the intake and are never findings.
 *   It imports no Stage 1A module: those are conformance-bound (Tree spec S2.14), so the §6.3 parse-field
 *   check below restates Stage 1A's own, with the same vocabularies.
 */
const SOURCE_ID = 'tree-repository-package-evidence';
const SECTION_KEY = 'namingRepositoryPackageLabels';
const SECTION_VERSION = 'naming-repository-package-label.v1';
const DIAGNOSTIC_SECTION = 'naming-repository-package-label';
// §4.8: the record key, in walk order.
export const TREE_REPOSITORY_PACKAGE_ELEMENTS = Object.freeze(['scope', 'name']);
const ELEMENTS = TREE_REPOSITORY_PACKAGE_ELEMENTS;

export const TREE_REPOSITORY_PACKAGE_AVAILABILITY = Object.freeze({
  available: 'available',
  sectionUnsupported: 'section-unsupported',
  sectionInvalid: 'section-invalid',
});
// Bridge contract §4.8 consumer rules, in table order.
export const TREE_REPOSITORY_PACKAGE_REJECTION_REASONS = Object.freeze({
  invalidRecordShape: 'invalid-record-shape',
  duplicateElement: 'duplicate-element',
  elementOrder: 'element-order',
});
const AVAILABILITY = TREE_REPOSITORY_PACKAGE_AVAILABILITY;
const REASONS = TREE_REPOSITORY_PACKAGE_REJECTION_REASONS;

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
// The §6.3 vocabularies (bridge contract), as Stage 1A checks them for §4.6.
const LABEL_FACT_VALUES = new Set(['contains-connector-token']);
const NOT_PARSED_REASON_VALUES = new Set(['label-empty', 'label-has-uppercase', 'label-has-unsupported-character', 'label-has-malformed-separator']);
const PARSED_ONLY_FIELDS = Object.freeze(['labelTokens', 'labelRoot', 'labelFacts']);
const isSortedUniqueCodeArray = (value, vocabulary) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((code, index) => vocabulary.has(code) && (index === 0 || value[index - 1] < code));

// [2.4] cfg-treeStructureAdvisor · Primitive · "hasParseFieldGroup"
// Concern: Logic · Parent: "hasRecordShape"
// Notes: exactly one §6.3 field group, by `parseOutcome`, as for a §4.6 record.
const hasParseFieldGroup = (record) => {
  if (record.parseOutcome === 'parsed') {
    return (
      record.notParsedReasons === undefined &&
      Array.isArray(record.labelTokens) &&
      record.labelTokens.length > 0 &&
      record.labelTokens.every(isNonEmptyString) &&
      record.labelRoot === record.labelTokens[0] &&
      (record.labelFacts === undefined || isSortedUniqueCodeArray(record.labelFacts, LABEL_FACT_VALUES))
    );
  }
  if (record.parseOutcome === 'not-parsed') {
    return PARSED_ONLY_FIELDS.every((field) => record[field] === undefined) && isSortedUniqueCodeArray(record.notParsedReasons, NOT_PARSED_REASON_VALUES);
  }
  return false;
};

// Envelope (§4.4 rules 3 and 9): a plain object of the supported version, with no identity tuple fields,
// a `records` array and a matching `recordCount`.
const envelopeStateOf = (section) => {
  if (!isPlainObject(section)) return AVAILABILITY.sectionInvalid;
  if (section.contractVersion !== SECTION_VERSION) return AVAILABILITY.sectionUnsupported;
  if ('identityTupleFields' in section || !Array.isArray(section.records) || section.recordCount !== section.records.length) return AVAILABILITY.sectionInvalid;
  return AVAILABILITY.available;
};

// [2.4] cfg-treeStructureAdvisor · Primitive · "hasRecordShape"
// Concern: Logic · Parent: "prepareTreeRepositoryPackageIntake"
// Notes: §4.8 rows 1, 3 and 4: a known element, a non-empty segment, and exactly one §6.3 parse field group.
const hasRecordShape = (record) => isPlainObject(record) && ELEMENTS.includes(record.element) && isNonEmptyString(record.segment) && hasParseFieldGroup(record);

const toAcceptedRecord = (record) => ({
  element: record.element,
  segment: record.segment,
  parseOutcome: record.parseOutcome,
  ...(record.parseOutcome === 'parsed'
    ? { labelTokens: [...record.labelTokens], labelRoot: record.labelRoot, ...(record.labelFacts ? { labelFacts: [...record.labelFacts] } : {}) }
    : { notParsedReasons: [...record.notParsedReasons] }),
});

// [2.4] cfg-treeStructureAdvisor · Container · "prepareTreeRepositoryPackageIntake"
// Concern: Logic · Parent: Tree wiring
// Notes: reads only the payload's §4.8 section. Returns `null` when the payload carries none (absent:
// nothing is recorded). A malformed envelope records one section diagnostic and no records. Otherwise each
// record is checked in the §4.8 table order (shape, duplicate element, element order); a rejected record
// drops only itself (duplicates and an order violation drop every record involved).
export const prepareTreeRepositoryPackageIntake = ({ namingOccurrenceBridge } = {}) => {
  const payload = isPlainObject(namingOccurrenceBridge) ? namingOccurrenceBridge : null;
  if (!payload || payload[SECTION_KEY] === undefined) return null;
  const section = payload[SECTION_KEY];
  const availability = envelopeStateOf(section);
  if (availability !== AVAILABILITY.available) {
    return Object.freeze({
      source: SOURCE_ID,
      availability,
      acceptedRecords: [],
      rejectedRecords: [],
      diagnostics: [{ section: DIAGNOSTIC_SECTION, reason: availability, element: null }],
    });
  }

  const rejectedRecords = [];
  const shaped = [];
  section.records.forEach((record, index) => {
    if (hasRecordShape(record)) shaped.push(record);
    else rejectedRecords.push({ index, element: ELEMENTS.includes(record?.element) ? record.element : null, reason: REASONS.invalidRecordShape });
  });
  const counts = new Map();
  for (const record of shaped) counts.set(record.element, (counts.get(record.element) ?? 0) + 1);
  let kept = [];
  for (const record of shaped) {
    if (counts.get(record.element) > 1) rejectedRecords.push({ index: section.records.indexOf(record), element: record.element, reason: REASONS.duplicateElement });
    else kept.push(record);
  }
  if (kept.length === 2 && kept[0].element === 'name') {
    for (const record of kept) rejectedRecords.push({ index: section.records.indexOf(record), element: record.element, reason: REASONS.elementOrder });
    kept = [];
  }
  const sortedRejected = rejectedRecords.sort((left, right) => left.index - right.index || left.reason.localeCompare(right.reason));
  return Object.freeze({
    source: SOURCE_ID,
    availability,
    acceptedRecords: kept.map(toAcceptedRecord),
    rejectedRecords: sortedRejected,
    diagnostics: sortedRejected.map(({ element, reason }) => ({ section: DIAGNOSTIC_SECTION, reason, element })),
  });
};

// [2.4] cfg-treeStructureAdvisor · Container · "toTreeRepositoryPackageElements"
// Concern: Logic · Parent: Stage 3 repository package expression (S3.2)
// Notes: the elements Stage 3 walks, in order: accepted `parsed` records only, as `{ element, segment,
// labelTokens }`. Empty for an absent, unsupported or invalid section, or when nothing parsed was accepted.
export const toTreeRepositoryPackageElements = (intake) =>
  intake?.availability === AVAILABILITY.available
    ? intake.acceptedRecords.filter((record) => record.parseOutcome === 'parsed').map(({ element, segment, labelTokens }) => ({ element, segment, labelTokens: [...labelTokens] }))
    : [];
