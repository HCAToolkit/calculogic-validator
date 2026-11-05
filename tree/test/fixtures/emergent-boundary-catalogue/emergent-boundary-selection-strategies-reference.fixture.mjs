// Test-only reference for the hypothetical selection strategies of Tree spec S3.13.9
// (calculogic-validator#175, slice S3). None is adopted, and none is runtime behavior: Stage 3 records
// `selection: unresolved` for every related complete opportunity, and EL5 keeps them from findings. This
// module reads a prepared Stage 3 directory record and computes, for comparison only, what each strategy
// would select. It reads recorded fields only (outcomes, selection, supported members) and adds no input,
// score or filename reading.

const prefixKey = (prefix) => prefix.join('-');
const supportedOf = (candidate) => new Set(candidate.members.filter((member) => member.set === 'supported').map((member) => member.path));
const unitsOf = (candidate) => new Set(candidate.members.filter((member) => member.set === 'supported').map((member) => member.semanticName));
const isProperSubset = (inner, outer) => inner.size < outer.size && [...inner].every((item) => outer.has(item));

// The directory's related complete opportunities: those whose selection the record leaves unresolved.
export const relatedOpportunitiesOf = (directory) =>
  directory.candidates.filter((candidate) => candidate.assessment.outcome === 'opportunity' && candidate.assessment.selection?.status === 'unresolved');

// Containment over supported members, which is what a nested subgroup means (S3.4).
const containment = (opportunities) =>
  opportunities.map((candidate) => ({
    key: prefixKey(candidate.prefix),
    candidate,
    inside: opportunities.filter((other) => other !== candidate && isProperSubset(supportedOf(candidate), supportedOf(other))).map((other) => prefixKey(other.prefix)),
    contains: opportunities.filter((other) => other !== candidate && isProperSubset(supportedOf(other), supportedOf(candidate))).map((other) => prefixKey(other.prefix)),
  }));

export const outerOnly = (directory) => containment(relatedOpportunitiesOf(directory)).filter((entry) => entry.inside.length === 0).map((entry) => entry.key).sort();
export const innerOnly = (directory) => containment(relatedOpportunitiesOf(directory)).filter((entry) => entry.contains.length === 0).map((entry) => entry.key).sort();

// Nesting depth: the longest containment path, counted in candidates.
export const nestingLevels = (directory) => {
  const entries = containment(relatedOpportunitiesOf(directory));
  const depth = (entry) => 1 + Math.max(0, ...entry.contains.map((key) => depth(entries.find((other) => other.key === key))));
  return Math.max(0, ...entries.map(depth));
};

// The outer candidate's supported units outside every nested opportunity. Units are semantic names.
export const remainderUnits = (directory, outerKey) => {
  const entries = containment(relatedOpportunitiesOf(directory));
  const outer = entries.find((entry) => entry.key === outerKey);
  const nestedUnits = new Set(outer.contains.flatMap((key) => [...unitsOf(entries.find((entry) => entry.key === key).candidate)]));
  return [...unitsOf(outer.candidate)].filter((unit) => !nestedUnits.has(unit)).length;
};

// Remainder-based selection (hypothesis): the outer boundary when its remainder reaches a threshold that
// is a separate, undecided value, so the result is stated as the largest threshold that still selects it.
// Defined only for one nesting step; a chain needs a recursive definition (S3.13.9).
export const remainderBased = (directory) => {
  if (nestingLevels(directory) !== 2) return { defined: false };
  const [outer] = outerOnly(directory);
  return { selectsOuterWhenThresholdAtMost: remainderUnits(directory, outer) };
};
