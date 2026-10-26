// Tree Stage 2 Semantic Home eligibility (Tree slice spec S2.3, S2.5, S2.6; calculogic-validator#102
// D1, D4-D7, Q3). Pure: counts and the four loaded parameter values in, an outcome and its condition
// checks out. It knows nothing about candidates, members or folders.
//
// Counts are per reading (`root`, and `prefix` for a multi-token label): the members C definitely
// holds (`definite`) and its attribution-undetermined members (`undetermined`), each split into
// `support`, `contradiction` and `missing`. Under Definition 1 every undetermined member is kept or
// removed independently, and the corner procedure decides exactly over all those resolutions.

import {
  SEMANTIC_HOME_CHANNELS,
  SEMANTIC_HOME_CONDITIONS,
  SEMANTIC_HOME_OUTCOMES,
  SEMANTIC_HOME_REASONS,
} from './tree-semantic-home-reasoning.knowledge.mjs';

const { eligible, notEligible, undetermined } = SEMANTIC_HOME_OUTCOMES;

// S2.5: the six steps in order; the first that holds decides.
export const decideEligibility = ({ decisionMemberCount, support, contradiction }, parameters) => {
  if (decisionMemberCount === 0) return { outcome: undetermined, reason: SEMANTIC_HOME_REASONS.noActiveMembers };
  if ((support + contradiction) / decisionMemberCount < parameters.P_COVERAGE) {
    return { outcome: undetermined, reason: SEMANTIC_HOME_REASONS.insufficientEvaluatedCoverage };
  }
  const share = support / (support + contradiction);
  if (share <= parameters.P_NOT_ELIGIBLE_SHARE) return { outcome: notEligible, reason: SEMANTIC_HOME_REASONS.contradicted };
  if (share >= parameters.P_ELIGIBLE_SHARE && support >= parameters.P_MIN_SUPPORT) return { outcome: eligible, reason: SEMANTIC_HOME_REASONS.supported };
  if (share >= parameters.P_ELIGIBLE_SHARE) return { outcome: undetermined, reason: SEMANTIC_HOME_REASONS.insufficientSupport };
  return { outcome: undetermined, reason: SEMANTIC_HOME_REASONS.mixedEvidence };
};

// S2.3 E2: the prefix reading decides `eligible`; `not-eligible` needs both readings contradicted.
export const combineReadings = ({ prefix, root }) => {
  if (prefix.outcome === eligible || prefix.outcome === undetermined) return { outcome: prefix.outcome, reason: prefix.reason };
  if (root.outcome === notEligible) return { outcome: notEligible, reason: SEMANTIC_HOME_REASONS.contradicted };
  return { outcome: undetermined, reason: SEMANTIC_HOME_REASONS.claimUnresolved };
};

// The counts of one reading after `removed` undetermined members of each kind leave C.
const countsAt = ({ definite, undetermined: open }, removed) => {
  const support = definite.support + open.support - removed.support;
  const contradiction = definite.contradiction + open.contradiction - removed.contradiction;
  const missing = definite.missing + open.missing - removed.missing;
  return { decisionMemberCount: support + contradiction + missing, support, contradiction };
};

const ratio = (numerator, denominator) => (denominator === 0 ? null : numerator / denominator);

// Each condition: its value at a resolution, how it is compared with its bound, and the bound.
const CONDITIONS = Object.freeze([
  { condition: SEMANTIC_HOME_CONDITIONS.activeMembers, comparator: '>', bound: () => 0, value: (c) => c.decisionMemberCount },
  {
    condition: SEMANTIC_HOME_CONDITIONS.coverage,
    comparator: '>=',
    bound: (p) => p.P_COVERAGE,
    value: (c) => ratio(c.support + c.contradiction, c.decisionMemberCount),
  },
  {
    condition: SEMANTIC_HOME_CONDITIONS.eligibleShare,
    comparator: '>=',
    bound: (p) => p.P_ELIGIBLE_SHARE,
    value: (c) => ratio(c.support, c.support + c.contradiction),
  },
  { condition: SEMANTIC_HOME_CONDITIONS.minimumSupport, comparator: '>=', bound: (p) => p.P_MIN_SUPPORT, value: (c) => c.support },
  {
    condition: SEMANTIC_HOME_CONDITIONS.notEligibleShare,
    comparator: '<=',
    bound: (p) => p.P_NOT_ELIGIBLE_SHARE,
    value: (c) => ratio(c.support, c.support + c.contradiction),
  },
]);
const ELIGIBLE_CONDITIONS = new Set([
  SEMANTIC_HOME_CONDITIONS.activeMembers,
  SEMANTIC_HOME_CONDITIONS.coverage,
  SEMANTIC_HOME_CONDITIONS.eligibleShare,
  SEMANTIC_HOME_CONDITIONS.minimumSupport,
]);
const NOT_ELIGIBLE_CONDITIONS = new Set([
  SEMANTIC_HOME_CONDITIONS.activeMembers,
  SEMANTIC_HOME_CONDITIONS.coverage,
  SEMANTIC_HOME_CONDITIONS.notEligibleShare,
]);

const satisfies = (value, comparator, bound) =>
  value !== null && (comparator === '>' ? value > bound : comparator === '>=' ? value >= bound : value <= bound);

// How unfavourable a value is for its condition: a larger rank is worse; an undefined value is worst.
const badness = (value, comparator) => (value === null ? Infinity : comparator === '<=' ? value : -value);

// The corners: each kind of undetermined member removed entirely or not at all, in a fixed order.
const cornersOf = ({ undetermined: open }) => {
  const corners = [];
  for (const support of [0, open.support]) {
    for (const contradiction of [0, open.contradiction]) {
      for (const missing of [0, open.missing]) {
        if (!corners.some((c) => c.support === support && c.contradiction === contradiction && c.missing === missing)) {
          corners.push({ support, contradiction, missing });
        }
      }
    }
  }
  return corners;
};

// S2.6 decision evidence for one reading: each condition at its least favourable corner. Each S2.5
// quantity moves in one direction along each removal count, so that corner is the worst admissible
// resolution for the condition, and the condition holds everywhere exactly when it holds there.
const checkReading = (reading, counts, parameters) => {
  const corners = cornersOf(counts);
  return CONDITIONS.map(({ condition, comparator, bound, value }) => {
    let worst = null;
    for (const corner of corners) {
      const candidate = { corner, value: value(countsAt(counts, corner)) };
      if (worst === null || badness(candidate.value, comparator) > badness(worst.value, comparator)) worst = candidate;
    }
    return {
      reading,
      condition,
      comparator,
      bound: bound(parameters),
      corner: { removedSupport: worst.corner.support, removedContradiction: worst.corner.contradiction, removedMissing: worst.corner.missing },
      value: worst.value,
      holds: satisfies(worst.value, comparator, bound(parameters)),
    };
  });
};

const holdsEverywhere = (checks, reading, conditions) =>
  checks.filter((check) => check.reading === reading && conditions.has(check.condition)).every((check) => check.holds);

const NO_REMOVAL = Object.freeze({ support: 0, contradiction: 0, missing: 0 });

// The S2.5 outcome of each reading, and the E2 combination, at one resolution.
const outcomeAt = (readings, multiToken, parameters, removedOf) => {
  const root = decideEligibility(countsAt(readings.root, removedOf(readings.root)), parameters);
  if (!multiToken) return { outcome: root.outcome, reason: root.reason, root };
  const prefix = decideEligibility(countsAt(readings.prefix, removedOf(readings.prefix)), parameters);
  return { ...combineReadings({ prefix, root }), prefix, root };
};

const hasUndetermined = ({ undetermined: open }) => open.support + open.contradiction + open.missing > 0;

// `readings.root` always, `readings.prefix` for a multi-token label candidate. Returns the outcome,
// its reason, each reading's own S2.5 result where it applies, the condition checks, and, with
// attribution-undetermined members, the two S2.6 reference resolutions.
export const decideCandidate = ({ readings, multiToken, parameters }) => {
  const tested = multiToken ? [SEMANTIC_HOME_CHANNELS.prefix, SEMANTIC_HOME_CHANNELS.root] : [SEMANTIC_HOME_CHANNELS.root];
  const conditionChecks = tested.flatMap((reading) => checkReading(reading, readings[reading], parameters));

  if (!tested.some((reading) => hasUndetermined(readings[reading]))) {
    return { ...outcomeAt(readings, multiToken, parameters, () => NO_REMOVAL), conditionChecks };
  }

  const governing = tested[0];
  const decided = holdsEverywhere(conditionChecks, governing, ELIGIBLE_CONDITIONS)
    ? { outcome: eligible, reason: SEMANTIC_HOME_REASONS.supported }
    : tested.every((reading) => holdsEverywhere(conditionChecks, reading, NOT_ELIGIBLE_CONDITIONS))
      ? { outcome: notEligible, reason: SEMANTIC_HOME_REASONS.contradicted }
      : { outcome: undetermined, reason: SEMANTIC_HOME_REASONS.dependsOnUndeterminedNestedCandidate };
  return {
    ...decided,
    conditionChecks,
    referenceResolutions: {
      retained: outcomeAt(readings, multiToken, parameters, () => NO_REMOVAL),
      removed: outcomeAt(readings, multiToken, parameters, (counts) => counts.undetermined),
    },
  };
};
