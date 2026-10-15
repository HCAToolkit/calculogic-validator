/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.14)
 * Responsibility: Reconciliation capabilities (lifecycle spec §12.7): checks a slice's capability
 *   declaration against its comparison declaration, lists the decisions one diff entry accepts,
 *   and checks one structured entry decision (merge-fields, add-alongside).
 * Invariants: applies slice declarations only; never infers mergeable fields, never invents a key
 *   and never interprets registry content; read-only and deterministic.
 */
import { stableStringify } from '../validator-report-meta.logic.mjs';
import {
  ENTRY_DECISIONS_BY_CLASS,
  STRUCTURED_DECISION_CLASSES,
  STRUCTURED_ENTRY_DECISIONS,
  UPDATE_DECISIONS_PROBLEMS as PROBLEMS,
} from './registry-lifecycle.contracts.mjs';

const DECLARATION_FIELDS = Object.freeze(['addAlongside', 'mergeFields', 'path']);
const DECISION_FIELDS_BY_KIND = Object.freeze({
  [STRUCTURED_ENTRY_DECISIONS.mergeFields]: Object.freeze(['kind', 'takeBuiltin']),
  [STRUCTURED_ENTRY_DECISIONS.addAlongside]: Object.freeze(['key', 'kind']),
});
// The entry sites each structured decision can act on (spec §12.7): records and object values merge;
// only records gain a second form.
const SITE_KINDS_BY_DECISION = Object.freeze({
  [STRUCTURED_ENTRY_DECISIONS.mergeFields]: Object.freeze(['record', 'value']),
  [STRUCTURED_ENTRY_DECISIONS.addAlongside]: Object.freeze(['record']),
});
const CAPABILITY_BY_DECISION = Object.freeze({
  [STRUCTURED_ENTRY_DECISIONS.mergeFields]: 'mergeFields',
  [STRUCTURED_ENTRY_DECISIONS.addAlongside]: 'addAlongside',
});

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const compareOrdinal = (left, right) => (left === right ? 0 : left < right ? -1 : 1);
const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;
const fieldKey = (object, field) => (Object.hasOwn(object, field) ? stableStringify(object[field]) : undefined);
const describeGroup = (group) => `[${group.join(', ')}]`;

// [5.2.14] cfg-registryLifecycle · Primitive · "assertReconciliationDeclaration"
// Every `{ path, mergeFields?, addAlongside? }` names a comparison collection of the entry, at most
// once (spec §12.7). Throws on anything else: a declaration is slice code, so an invalid one is a
// programming error.
export const assertReconciliationDeclaration = (entry) => {
  const fail = (detail) => {
    throw new Error(`Registry ${entry.registryId} has a malformed reconciliation declaration: ${detail}`);
  };
  const declarations = entry.reconciliation ?? [];
  if (!Array.isArray(declarations)) {
    fail('it must be a list.');
  }

  const seen = new Set();
  for (const declaration of declarations) {
    const collection = entry.comparison.find((candidate) => candidate.path === declaration?.path);
    if (!isPlainObject(declaration) || !collection) {
      fail(`${JSON.stringify(declaration)} names no comparison collection.`);
    }
    if (seen.has(declaration.path)) {
      fail(`${declaration.path} is declared more than once.`);
    }
    seen.add(declaration.path);

    const extra = Object.keys(declaration).filter((field) => !DECLARATION_FIELDS.includes(field));
    if (extra.length > 0 || (declaration.mergeFields === undefined && declaration.addAlongside === undefined)) {
      fail(`${declaration.path} must declare mergeFields or addAlongside, and nothing else.`);
    }

    if (declaration.mergeFields !== undefined) {
      const groups = declaration.mergeFields;
      const fields = Array.isArray(groups) ? groups.flat() : [];
      const isValid =
        ['keyed', 'value'].includes(collection.kind) &&
        Array.isArray(groups) &&
        groups.length >= 2 &&
        groups.every((group) => Array.isArray(group) && group.length > 0 && group.every(isNonEmptyString)) &&
        new Set(fields).size === fields.length &&
        !fields.includes(collection.key);
      if (!isValid) {
        fail(
          `${declaration.path}: mergeFields is at least two disjoint, non-empty groups of field names without the key field, on a keyed or value collection.`,
        );
      }
    }

    if (declaration.addAlongside !== undefined && (declaration.addAlongside !== true || collection.kind !== 'keyed' || collection.ordered)) {
      fail(`${declaration.path}: addAlongside is true, on an unordered keyed collection.`);
    }
  }
};

const declarationFor = (entry, collectionPath) =>
  (entry.reconciliation ?? []).find((declaration) => declaration.path === collectionPath) ?? null;

// The declared field groups of one entry, each with whether it differs between Builtin and Custom,
// and the fields no group covers. Null when the entry is not two objects in a merge-declaring
// collection.
const mergeAnalysis = ({ declaration, site, builtin, custom }) => {
  if (!declaration?.mergeFields || !SITE_KINDS_BY_DECISION[STRUCTURED_ENTRY_DECISIONS.mergeFields].includes(site.kind)) {
    return null;
  }
  if (!isPlainObject(builtin) || !isPlainObject(custom)) {
    return { objects: false };
  }

  const covered = new Set(declaration.mergeFields.flat());
  const fields = [...new Set([...Object.keys(builtin), ...Object.keys(custom)])].filter(
    (field) => !(site.kind === 'record' && field === site.keyField),
  );
  return {
    objects: true,
    uncovered: fields.filter((field) => !covered.has(field)).sort(compareOrdinal),
    groups: declaration.mergeFields.map((group) => ({
      group,
      differs: group.some((field) => fieldKey(builtin, field) !== fieldKey(custom, field)),
    })),
  };
};

// [5.2.14] cfg-registryLifecycle · Derived value · "entryChoices"
// The decisions the check accepts for one diff entry (spec §12.4 `choices`): the class's string
// decisions, plus merge-fields (with the differing field groups) and add-alongside where declared
// and possible. `site` is the entry's site in Builtin or Custom.
export const entryChoices = ({ entry, entryClass, site, builtin, custom }) => {
  const choices = [...(ENTRY_DECISIONS_BY_CLASS[entryClass] ?? [])];
  if (!STRUCTURED_DECISION_CLASSES.includes(entryClass) || !site) {
    return choices;
  }

  const declaration = declarationFor(entry, site.collectionPath);
  const merge = mergeAnalysis({ declaration, site, builtin, custom });
  if (merge?.objects && merge.uncovered.length === 0) {
    const differing = merge.groups.filter(({ differs }) => differs).map(({ group }) => group);
    if (differing.length >= 2) {
      choices.push({ kind: STRUCTURED_ENTRY_DECISIONS.mergeFields, fieldGroups: differing });
    }
  }
  if (declaration?.addAlongside && SITE_KINDS_BY_DECISION[STRUCTURED_ENTRY_DECISIONS.addAlongside].includes(site.kind)) {
    choices.push({ kind: STRUCTURED_ENTRY_DECISIONS.addAlongside });
  }
  return choices;
};

const containerId = (site) => JSON.stringify(site.container);

// [5.2.14] cfg-registryLifecycle · Derived value · "alongsideKeyGroup"
// The identity of the record an add-alongside decision would create: its collection and its key.
// Two decisions with the same group conflict, whatever their order (spec §12.7).
export const alongsideKeyGroup = (site, key) => `${containerId(site)}\u0000${stableStringify(key)}`;

// [5.2.14] cfg-registryLifecycle · Derived value · "collectionKeys"
// The keys of the records sharing `site`'s keyed list, in the walked entries of one input.
export const collectionKeys = (walkedEntries, site) =>
  walkedEntries
    .filter((walked) => walked.site.kind === 'record' && containerId(walked.site) === containerId(site))
    .map((walked) => stableStringify(walked.site.key));

const checkMergeData = ({ declaration, site, builtin, custom, takeBuiltin }) => {
  const merge = mergeAnalysis({ declaration, site, builtin, custom });
  if (!merge.objects) {
    return 'both the Builtin and the Custom form must be objects.';
  }
  if (merge.uncovered.length > 0) {
    return `field(s) ${merge.uncovered.join(', ')} are in no declared merge group, so a merge cannot decide them.`;
  }
  if (takeBuiltin.length === 0) {
    return 'it takes no field from Builtin; record keep-custom instead.';
  }
  if (!takeBuiltin.every((field, index) => index === 0 || compareOrdinal(takeBuiltin[index - 1], field) < 0)) {
    return '"takeBuiltin" lists field names in ordinal order without repetition.';
  }

  const groupByField = new Map(declaration.mergeFields.flatMap((group) => group.map((field) => [field, group])));
  const unknown = takeBuiltin.filter((field) => !groupByField.has(field));
  if (unknown.length > 0) {
    return `field(s) ${unknown.join(', ')} are in no declared merge group.`;
  }
  const taken = [...new Set(takeBuiltin.map((field) => groupByField.get(field)))];
  const partial = taken.find((group) => group.some((field) => !takeBuiltin.includes(field)));
  if (partial) {
    return `the field group ${describeGroup(partial)} is taken whole or not at all.`;
  }
  const differsByGroup = new Map(merge.groups.map(({ group, differs }) => [group, differs]));
  const same = taken.find((group) => !differsByGroup.get(group));
  if (same) {
    return `the field group ${describeGroup(same)} is the same in Builtin and Custom.`;
  }
  if (merge.groups.every(({ group, differs }) => !differs || taken.includes(group))) {
    return 'it takes every differing field group; record take-builtin instead.';
  }
  return null;
};

const checkAlongsideData = ({ site, key, keysInCollection }) => {
  const isScalarOfKeyType =
    typeof key === typeof site.key &&
    (typeof key === 'string' ? key.length > 0 : typeof key === 'number' ? Number.isFinite(key) : typeof key === 'boolean');
  if (!isScalarOfKeyType) {
    return `"key" must be a ${typeof site.key === 'string' ? 'non-empty string' : typeof site.key}, like the record key "${site.keyField}".`;
  }
  if (keysInCollection.has(stableStringify(key))) {
    return `${JSON.stringify(key)} is already a "${site.keyField}" of the collection.`;
  }
  return null;
};

// [5.2.14] cfg-registryLifecycle · Derived value · "checkStructuredDecision"
// The spec §12.7 rules for one structured decision on its own. Returns `{ problem, detail }` or
// null. `keysInCollection` holds the keys of the Builtin and Custom collection the record belongs
// to. Whether two add-alongside decisions request the same key is a constraint on the whole
// collection, checked by the caller over every accepted decision (`alongsideKeyGroup`).
// The decision is document input: its `kind` selects a shape only when it is an own key of the
// shape table, so `__proto__` or `constructor` is an unknown kind like any other.
export const checkStructuredDecision = ({ entry, entryClass, site, builtin, custom, decision, keysInCollection }) => {
  const { kind } = decision;
  const fields = typeof kind === 'string' && Object.hasOwn(DECISION_FIELDS_BY_KIND, kind) ? DECISION_FIELDS_BY_KIND[kind] : null;
  const extra = fields ? Object.keys(decision).filter((field) => !fields.includes(field)).sort(compareOrdinal) : [];
  const missing = fields ? fields.filter((field) => !Object.hasOwn(decision, field)) : [];
  if (!fields || extra.length > 0 || missing.length > 0) {
    return {
      problem: PROBLEMS.malformed,
      detail: fields
        ? `A ${kind} decision has exactly the fields ${fields.join(', ')}.`
        : `A structured decision's "kind" is ${Object.values(STRUCTURED_ENTRY_DECISIONS).join(' or ')}.`,
    };
  }
  if (kind === STRUCTURED_ENTRY_DECISIONS.mergeFields && (!Array.isArray(decision.takeBuiltin) || !decision.takeBuiltin.every(isNonEmptyString))) {
    return { problem: PROBLEMS.malformed, detail: '"takeBuiltin" is a list of field names.' };
  }

  if (!STRUCTURED_DECISION_CLASSES.includes(entryClass)) {
    return {
      problem: PROBLEMS.unsupportedDecision,
      detail: `${kind} applies to ${STRUCTURED_DECISION_CLASSES.join(' and ')} entries, where both forms exist; this entry is ${entryClass}.`,
    };
  }
  const declaration = site ? declarationFor(entry, site.collectionPath) : null;
  if (!declaration?.[CAPABILITY_BY_DECISION[kind]] || !SITE_KINDS_BY_DECISION[kind].includes(site.kind)) {
    return {
      problem: PROBLEMS.unsupportedDecision,
      detail: `${entry.registryId} does not declare ${kind} for this ${site ? `${site.kind} entry of "${site.collectionPath}"` : 'entry'}.`,
    };
  }

  const invalid =
    kind === STRUCTURED_ENTRY_DECISIONS.mergeFields
      ? checkMergeData({ declaration, site, builtin, custom, takeBuiltin: decision.takeBuiltin })
      : checkAlongsideData({ site, key: decision.key, keysInCollection });
  if (invalid) {
    return { problem: PROBLEMS.invalidDecision, detail: `The ${kind} decision does not fit the entry: ${invalid}` };
  }
  return null;
};
