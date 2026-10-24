// Tree-owned strength of Naming semantic evidence for Tree reasoning (#82). Naming supplies only the
// source facts; how strongly they support a Tree interpretation is Tree's decision. Each limiting
// fact is listed on its own, so ambiguity and split-family evidence can be weighed differently later
// without changing what Naming reports.
export const TREE_NAMING_EVIDENCE_STRENGTHS = Object.freeze({
  HIGH: 'high',
  BOUNDED: 'bounded',
});

const LIMITING_NAMING_FACTS = Object.freeze([
  Object.freeze({ field: 'ambiguityFlags', limitsTo: TREE_NAMING_EVIDENCE_STRENGTHS.BOUNDED }),
  Object.freeze({ field: 'splitFamilyFlags', limitsTo: TREE_NAMING_EVIDENCE_STRENGTHS.BOUNDED }),
]);

// Weakest first, so the strength of a record is the weakest limit among its present facts.
const STRENGTH_ORDER = Object.freeze([TREE_NAMING_EVIDENCE_STRENGTHS.BOUNDED, TREE_NAMING_EVIDENCE_STRENGTHS.HIGH]);

const hasFact = (namingRecord, field) => Array.isArray(namingRecord?.[field]) && namingRecord[field].length > 0;

export const deriveTreeNamingEvidenceStrength = (namingRecord) =>
  LIMITING_NAMING_FACTS.filter(({ field }) => hasFact(namingRecord, field)).reduce(
    (strength, { limitsTo }) => (STRENGTH_ORDER.indexOf(limitsTo) < STRENGTH_ORDER.indexOf(strength) ? limitsTo : strength),
    TREE_NAMING_EVIDENCE_STRENGTHS.HIGH,
  );
