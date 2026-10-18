/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.19)
 * Responsibility: The edited Custom payload one edit-document record describes (lifecycle spec
 *   §12.10): every operation checked on its own against the current Custom registry, then applied in
 *   the fixed order and checked against the exact image.
 * Invariants: pure, with no file access; addresses are parsed only by the comparison module, which
 *   owns their grammar; operations are applied mechanically at their sites and never interpreted;
 *   document order carries no meaning; nothing is implied or repaired; the input is not mutated.
 */
import { stableStringify } from '../validator-report-meta.logic.mjs';
import {
  ComparisonExtractionError,
  extractComparisonEntries,
  impliedOrderAddress,
  parseComparisonAddress,
  walkComparisonEntries,
} from './registry-lifecycle-comparison.logic.mjs';
import {
  ANY_PRESENT_VALUE,
  applyOrder,
  copyJson,
  imageMismatches,
  placeEntry,
} from './registry-lifecycle-entry-placement.logic.mjs';
import { EDIT_DOCUMENT_PROBLEMS as PROBLEMS, EDIT_OPERATIONS as OPS } from './registry-lifecycle.contracts.mjs';

// The entry kinds each operation applies to (spec §12.10 "Operations").
const KINDS_BY_OPERATION = Object.freeze({
  [OPS.add]: Object.freeze(['record', 'member', 'value', 'group']),
  [OPS.change]: Object.freeze(['record', 'value', 'order']),
  [OPS.remove]: Object.freeze(['record', 'member', 'value', 'group']),
});
// The kinds whose `add` or `change` carries a `value`.
const VALUE_KINDS = Object.freeze(['record', 'value', 'order']);

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isScalar = (value) => value === null || ['string', 'number', 'boolean'].includes(typeof value);
const compareOrdinal = (left, right) => (left === right ? 0 : left < right ? -1 : 1);
const sameJson = (left, right) => stableStringify(left) === stableStringify(right);

// Why an operation's `value` does not fit its entry, or null (spec §12.10 "Values"). A no-op
// `change` of a record or value is found after construction, from canonical values.
const valueProblem = ({ op, site, operation, current }) => {
  const hasValue = Object.hasOwn(operation, 'value');
  const takesValue = op !== OPS.remove && VALUE_KINDS.includes(site.kind);
  if (!takesValue) {
    return hasValue ? `a ${op} of a ${site.kind} takes no value.` : null;
  }
  if (!hasValue) {
    return `a ${op} of a ${site.kind} needs a value.`;
  }
  const { value } = operation;
  if (site.kind === 'record' && (!isPlainObject(value) || value[site.keyField] !== site.key)) {
    return `the record must be an object whose "${site.keyField}" is ${JSON.stringify(site.key)}, the address's key; a rename is a remove and an add.`;
  }
  if (site.kind === 'order') {
    if (!Array.isArray(value) || !value.every((key) => isScalar(key) && key !== null)) {
      return 'an order is the list of the collection\'s keys.';
    }
    if (current !== undefined && sameJson(value, current)) {
      return 'the change sets the current value and changes nothing.';
    }
  }
  return null;
};

// The operation's phase in the fixed order (spec §12.10, as §12.6): group additions; records,
// members and values; order entries; group removals.
const phaseOf = ({ op, site }) => {
  if (site.kind === 'group') {
    return op === OPS.add ? 0 : 3;
  }
  return site.kind === 'order' ? 2 : 1;
};

// [5.2.19] cfg-registryLifecycle · Derived value · "buildRegistryEdit"
// `entry` is the registry's inventory entry; `operations` is the record's operation list. Returns
// `{ payload, problems }`, where `problems` lists `{ address, problem, detail }` in ordinal order
// and `payload` is the edited Custom payload when there is none.
export const buildRegistryEdit = ({ entry, customPayload, operations }) => {
  const current = new Map(walkComparisonEntries(customPayload, entry).map(({ address, value }) => [address, value]));
  const problems = [];
  const problem = (address, code, detail) => problems.push({ address, problem: code, detail });

  // One operation per address: every member of a duplicate group is refused, whatever its order.
  const countByAddress = new Map();
  for (const { address } of operations) {
    countByAddress.set(address, (countByAddress.get(address) ?? 0) + 1);
  }

  const parsed = [];
  for (const operation of operations) {
    const { op, address } = operation;
    if (countByAddress.get(address) > 1) {
      problem(address, PROBLEMS.duplicateAddress, `${countByAddress.get(address)} operations name this address.`);
      continue;
    }
    const site = parseComparisonAddress(address, entry);
    if (!site) {
      problem(address, PROBLEMS.invalidAddress, 'The registry\'s comparison declaration produces no such address.');
      continue;
    }
    if (!KINDS_BY_OPERATION[op].includes(site.kind)) {
      problem(address, PROBLEMS.unsupportedOperation, `"${op}" does not apply to a ${site.kind} entry.`);
      continue;
    }
    parsed.push({ operation, op, address, site });
  }

  // An order entry a group `add` brings counts as present for a `change` in the same record.
  const impliedByGroupAdd = new Set(
    parsed
      .filter(({ op, site }) => op === OPS.add && site.kind === 'group')
      .map(({ address, site }) => impliedOrderAddress(address, site, entry))
      .filter(Boolean),
  );
  const accepted = [];
  for (const item of parsed) {
    const { op, address, site, operation } = item;
    const present = current.has(address) || impliedByGroupAdd.has(address);
    if (op === OPS.add && present) {
      problem(address, PROBLEMS.presentEntry, 'An add names an entry the Custom registry has.');
      continue;
    }
    if (op !== OPS.add && !present) {
      problem(address, PROBLEMS.absentEntry, `A ${op} names an entry the Custom registry lacks.`);
      continue;
    }
    const detail = valueProblem({ op, site, operation, current: current.get(address) });
    if (detail) {
      problem(address, PROBLEMS.invalidValue, `The value does not fit the entry: ${detail}`);
      continue;
    }
    accepted.push(item);
  }
  if (problems.length > 0) {
    return { problems: problems.sort((left, right) => compareOrdinal(left.address, right.address)) };
  }

  // Apply in the fixed order; document order carries no meaning.
  const payload = copyJson(customPayload);
  const ordered = [...accepted].sort((left, right) => phaseOf(left) - phaseOf(right) || compareOrdinal(left.address, right.address));
  for (const { op, site, operation } of ordered) {
    if (site.kind === 'order') {
      applyOrder({ payload, site, order: operation.value });
    } else {
      placeEntry({ payload, site, present: op !== OPS.remove, form: operation.value });
    }
  }

  let edited;
  try {
    edited = extractComparisonEntries(payload, entry);
  } catch (error) {
    if (error instanceof ComparisonExtractionError) {
      return { problems: [{ address: null, problem: PROBLEMS.inconsistentOperations, detail: `The operations do not form a registry: ${error.message}` }] };
    }
    throw error;
  }

  // A change of a record or value is written as given, so it is a no-op exactly when the edited
  // canonical value equals the current one.
  const noOps = accepted.filter(
    ({ op, site, address }) => op === OPS.change && site.kind !== 'order' && sameJson(edited.get(address), current.get(address)),
  );
  if (noOps.length > 0) {
    return {
      problems: noOps
        .map(({ address }) => ({
          address,
          problem: PROBLEMS.invalidValue,
          detail: 'The value does not fit the entry: the change sets the current value and changes nothing.',
        }))
        .sort((left, right) => compareOrdinal(left.address, right.address)),
    };
  }

  // Exact image: every operated address as stated (an add or change of a record or value is
  // written as given, so it must be present), every implied order entry of an added or removed
  // group as stated unless changed, and every other address unchanged.
  const expectedByAddress = new Map();
  for (const { op, address, site } of accepted) {
    const implied = impliedOrderAddress(address, site, entry);
    if (implied && !accepted.some((other) => other.address === implied)) {
      expectedByAddress.set(implied, op === OPS.add ? [] : undefined);
    }
  }
  for (const { op, address, site, operation } of accepted) {
    if (op === OPS.remove) {
      expectedByAddress.set(address, undefined);
    } else if (site.kind === 'member') {
      expectedByAddress.set(address, site.member);
    } else if (site.kind === 'group') {
      expectedByAddress.set(address, true);
    } else if (site.kind === 'order') {
      expectedByAddress.set(address, operation.value);
    } else {
      expectedByAddress.set(address, ANY_PRESENT_VALUE);
    }
  }
  const expectedAt = (address) => (expectedByAddress.has(address) ? expectedByAddress.get(address) : current.get(address));
  const describe = (value) => (value === undefined ? 'absent' : value === ANY_PRESENT_VALUE ? 'present' : stableStringify(value));
  const mismatches = imageMismatches({
    addresses: [...current.keys(), ...expectedByAddress.keys()],
    expectedAt,
    actual: edited,
  });
  if (mismatches.length > 0) {
    return {
      problems: mismatches.map(({ address }) => ({
        address,
        problem: PROBLEMS.inconsistentOperations,
        detail: `The operations together leave this entry ${describe(edited.get(address))}, not ${describe(expectedAt(address))}.`,
      })),
    };
  }

  return { payload, problems: [] };
};
