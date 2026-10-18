/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.13)
 * Responsibility: The update candidate (lifecycle spec §12.6): the Custom payload that a complete
 *   `differs` decisions record describes, constructed from the Baseline, current Builtin and current
 *   Custom payloads.
 * Invariants: pure, with no file access; applies the slice-owned comparison and reconciliation
 *   declarations mechanically and never interprets registry content; `keep-custom` changes nothing;
 *   merge-fields is checked and applied by the one shared rule (§12.7); a candidate whose extracted
 *   entries are not exactly the decided ones is refused, never repaired; the inputs are not mutated.
 */
import {
  ComparisonExtractionError,
  classifyEntry,
  extractComparisonEntries,
  walkComparisonEntries,
} from './registry-lifecycle-comparison.logic.mjs';
import {
  applyOrder,
  copyJson,
  hasKey,
  imageMismatches,
  listAt,
  placeEntry,
  readAt,
} from './registry-lifecycle-entry-placement.logic.mjs';
import { checkStructuredDecision, mergeFieldsForm } from './registry-lifecycle-reconciliation.logic.mjs';
import { ENTRY_DECISIONS, ENTRY_DECISIONS_BY_CLASS, STRUCTURED_ENTRY_DECISIONS } from './registry-lifecycle.contracts.mjs';

// [5.2.13] cfg-registryLifecycle · Primitive · "RegistryUpdateCandidateError"
// `mismatches` lists `{ address, expected?, actual? }` when the candidate is not the decided image.
export class RegistryUpdateCandidateError extends Error {
  constructor(message, mismatches = []) {
    super(message);
    this.name = 'RegistryUpdateCandidateError';
    this.mismatches = mismatches;
  }
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const compareOrdinal = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

// `take-builtin` at one site (spec §12.6 item 3): the candidate location takes its Builtin form
// (read from the raw Builtin payload at the same site), or is made absent where Builtin lacks it.
const takeBuiltin = ({ candidate, builtinPayload, site, inBuiltin }) => {
  const builtinNode = readAt(builtinPayload, site.container);
  const form = site.kind === 'record' ? builtinNode?.find?.(hasKey(site)) : builtinNode;
  placeEntry({ payload: candidate, site, present: inBuiltin, form });
};

const isMergeFields = (decision) => isPlainObject(decision) && decision.kind === STRUCTURED_ENTRY_DECISIONS.mergeFields;

// merge-fields at one site (spec §12.6 item 3, §12.7): the record or object value keeps its place
// and is replaced by `mergeFieldsForm` over its raw Custom form and the raw Builtin form at the same
// site. A missing form is left alone; the exact-image check refuses it.
const mergeAt = ({ candidate, builtinPayload, site, takeBuiltin }) => {
  const builtinNode = readAt(builtinPayload, site.container);
  const builtin = site.kind === 'record' ? builtinNode?.find?.(hasKey(site)) : builtinNode;
  const custom = site.kind === 'record' ? listAt(candidate, site.container, false)?.find(hasKey(site)) : readAt(candidate, site.container);
  if (isPlainObject(custom) && isPlainObject(builtin)) {
    placeEntry({ payload: candidate, site, present: true, form: mergeFieldsForm({ custom, builtin, takeBuiltin }) });
  }
};

// Step 1 (spec §12.6 item 1): the decided addresses are exactly the decidable ones, each with a
// string decision its class accepts or a merge-fields decision the §12.7 rules accept (the same
// `checkStructuredDecision` `decisions-check` runs). add-alongside is never applied here. Returns
// the decision by address.
const checkDecisions = ({ entry, classes, decisions, values, sites }) => {
  const problems = [];
  const decisionByAddress = new Map();
  for (const { address, class: entryClass, decision } of decisions) {
    const currentClass = classes.get(address);
    if (decisionByAddress.has(address)) {
      problems.push(`${address}: decided more than once`);
    } else if (!Object.hasOwn(ENTRY_DECISIONS_BY_CLASS, currentClass ?? '')) {
      problems.push(`${address}: not a decidable entry of the comparison`);
    } else if (entryClass !== currentClass) {
      problems.push(`${address}: recorded as ${entryClass}, currently ${currentClass}`);
    } else if (isPlainObject(decision)) {
      const result =
        decision.kind === STRUCTURED_ENTRY_DECISIONS.addAlongside
          ? { detail: 'add-alongside is not applied by update' }
          : checkStructuredDecision({
              entry,
              entryClass: currentClass,
              site: sites.get(address),
              builtin: values.builtin.get(address),
              custom: values.custom.get(address),
              decision,
              keysInCollection: new Set(),
            });
      if (result) {
        problems.push(`${address}: ${result.detail}`);
      }
    } else if (!ENTRY_DECISIONS_BY_CLASS[currentClass].includes(decision)) {
      problems.push(`${address}: ${JSON.stringify(decision)} is not a decision for ${currentClass}`);
    }
    decisionByAddress.set(address, decision);
  }
  for (const [address, entryClass] of classes) {
    if (Object.hasOwn(ENTRY_DECISIONS_BY_CLASS, entryClass) && !decisionByAddress.has(address)) {
      problems.push(`${address}: ${entryClass} has no decision`);
    }
  }
  if (problems.length > 0) {
    throw new RegistryUpdateCandidateError(`The decisions do not match the comparison: ${problems.sort(compareOrdinal).join('; ')}.`);
  }
  return decisionByAddress;
};

// [5.2.13] cfg-registryLifecycle · Derived value · "buildRegistryUpdateCandidate"
// `entry` is the registry's inventory entry (descriptor and comparison declaration); `decisions`
// is the record's entry list, `[{ address, class, decision }]`. Returns `{ payload, changed }`;
// `changed` is false when the candidate equals the Custom payload exactly.
export const buildRegistryUpdateCandidate = ({ entry, baselinePayload, builtinPayload, customPayload, decisions }) => {
  const walked = {
    baseline: walkComparisonEntries(baselinePayload, entry),
    builtin: walkComparisonEntries(builtinPayload, entry),
    custom: walkComparisonEntries(customPayload, entry),
  };
  const values = Object.fromEntries(
    Object.entries(walked).map(([input, entries]) => [input, new Map(entries.map(({ address, value }) => [address, value]))]),
  );
  const sites = new Map([...walked.custom, ...walked.builtin].map(({ address, site }) => [address, site]));
  const addresses = [...new Set([...values.baseline.keys(), ...values.builtin.keys(), ...values.custom.keys()])].sort(
    compareOrdinal,
  );
  const classes = new Map(
    addresses.map((address) => [
      address,
      classifyEntry(values.baseline.get(address), values.builtin.get(address), values.custom.get(address)),
    ]),
  );
  const decisionByAddress = checkDecisions({ entry, classes, decisions, values, sites });
  const takesBuiltin = (address) => decisionByAddress.get(address) === ENTRY_DECISIONS.takeBuiltin;
  const mergeOf = (address) => (isMergeFields(decisionByAddress.get(address)) ? decisionByAddress.get(address) : null);

  // Steps 2 and 3: start from Custom; group additions, then values, members and records, then group
  // removals, so a record never needs a group that is added later or loses one removed earlier.
  const candidate = copyJson(customPayload);
  const taken = addresses.filter((address) => takesBuiltin(address) && sites.get(address)?.kind !== 'order');
  const phase = (address) => {
    const site = sites.get(address);
    if (site.kind !== 'group') {
      return 1;
    }
    return values.builtin.has(address) ? 0 : 2;
  };
  for (const address of [...taken].sort((left, right) => phase(left) - phase(right) || compareOrdinal(left, right))) {
    takeBuiltin({ candidate, builtinPayload, site: sites.get(address), inBuiltin: values.builtin.has(address) });
  }
  // merge-fields entries (records and object values) exist in both forms, so no container changes.
  for (const address of addresses.filter((candidateAddress) => mergeOf(candidateAddress))) {
    mergeAt({ candidate, builtinPayload, site: sites.get(address), takeBuiltin: mergeOf(address).takeBuiltin });
  }

  // Step 4: order entries last.
  // An address absent from both Builtin and Custom has no site and nothing to apply.
  for (const address of addresses.filter((candidateAddress) => sites.get(candidateAddress)?.kind === 'order')) {
    const decidedOrder = takesBuiltin(address) ? values.builtin.get(address) : values.custom.get(address);
    applyOrder({ payload: candidate, site: sites.get(address), order: decidedOrder });
  }

  // Step 5: the candidate holds exactly the decided entries (spec §12.6 item 5).
  let candidateValues;
  try {
    candidateValues = extractComparisonEntries(candidate, entry);
  } catch (error) {
    if (error instanceof ComparisonExtractionError) {
      throw new RegistryUpdateCandidateError(`The decided entries do not form a registry: ${error.message}`);
    }
    throw error;
  }
  const expectedAt = (address) => {
    if (takesBuiltin(address)) {
      return values.builtin.get(address);
    }
    const merge = mergeOf(address);
    return merge
      ? mergeFieldsForm({ custom: values.custom.get(address), builtin: values.builtin.get(address), takeBuiltin: merge.takeBuiltin })
      : values.custom.get(address);
  };
  const mismatches = imageMismatches({ addresses, expectedAt, actual: candidateValues });
  if (mismatches.length > 0) {
    throw new RegistryUpdateCandidateError(
      `The decisions combine into an inconsistent registry; refused at: ${mismatches.map(({ address }) => address).join(', ')}.`,
      mismatches,
    );
  }

  return { payload: candidate, changed: JSON.stringify(candidate) !== JSON.stringify(customPayload) };
};
