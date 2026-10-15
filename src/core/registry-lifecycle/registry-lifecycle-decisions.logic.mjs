/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.10)
 * Responsibility: The update decisions document (lifecycle spec §12.4): its template from the
 *   current comparison, and its check against that comparison.
 * Invariants: read-only; the document is plain data bound per registry to the digests it was made
 *   against; entries are named by comparison address (§8.4); `null` is the only spelling of "no
 *   decision"; structured decisions are accepted only where a slice declares them (§12.7); the
 *   active set is never read into or from the document; problems and summaries are deterministic,
 *   in ordinal order.
 */
import { compareRegistryLifecycle } from './registry-lifecycle-diff.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from './registry-lifecycle-inventory.knowledge.mjs';
import {
  alongsideKeyGroup,
  checkStructuredDecision,
  collectionKeys,
  entryChoices,
} from './registry-lifecycle-reconciliation.logic.mjs';
import {
  ENTRY_DECISIONS_BY_CLASS,
  REGISTRY_DECISIONS_BY_CLASS,
  STRUCTURED_ENTRY_DECISIONS,
  UPDATE_DECISIONS_KIND,
  UPDATE_DECISIONS_PROBLEMS as PROBLEMS,
  UPDATE_DECISIONS_READABLE_SCHEMA_VERSIONS,
  UPDATE_DECISIONS_SCHEMA_VERSION,
} from './registry-lifecycle.contracts.mjs';

const BASED_ON_FIELDS = Object.freeze(['baselineDigest', 'builtinDigest', 'customDigest']);
const DOCUMENT_FIELDS = Object.freeze(['kind', 'registries', 'schemaVersion']);
const ENTRY_FIELDS = Object.freeze(['address', 'class', 'decision']);
// Schema "2" entries may also carry the template's informative `choices`, which the check ignores.
const ENTRY_FIELDS_V2 = Object.freeze([...ENTRY_FIELDS, 'choices']);
const REGISTRY_FIELDS_BY_CLASS = Object.freeze({
  'registry-added': Object.freeze(['basedOn', 'class', 'decision', 'registryId']),
  differs: Object.freeze(['basedOn', 'class', 'entries', 'registryId']),
});

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const compareOrdinal = (left, right) => (left === right ? 0 : left < right ? -1 : 1);
const isDigestOrNull = (value) => value === null || typeof value === 'string';

// Field names other than `allowed`, in ordinal order.
const unexpectedFields = (value, allowed) => Object.keys(value).filter((field) => !allowed.includes(field)).sort(compareOrdinal);

const toBasedOn = (statusEntry) => ({
  baselineDigest: statusEntry.baselineDigest,
  builtinDigest: statusEntry.builtinDigest,
  customDigest: statusEntry.customDigest,
});

// What one compared registry offers the decisions check for its entries (spec §12.7): its inventory
// entry, each address's site, its diff entry (with the Builtin and Custom values), and its walked
// inputs.
const entryContexts = ({ comparison, walkedById, slices }) => {
  const inventoryById = new Map(slices.flatMap((slice) => slice.inventory.map((entry) => [entry.registryId, entry])));
  return new Map(
    comparison.registries
      .filter((registry) => walkedById.has(registry.registryId))
      .map((registry) => {
        const walked = walkedById.get(registry.registryId);
        return [
          registry.registryId,
          {
            entry: inventoryById.get(registry.registryId),
            walked,
            siteByAddress: new Map([...walked.custom, ...walked.builtin].map(({ address, site }) => [address, site])),
            diffByAddress: new Map((registry.entries ?? []).map((diffEntry) => [diffEntry.address, diffEntry])),
          },
        ];
      }),
  );
};

const choicesFor = (context, diffEntry) =>
  entryChoices({
    entry: context.entry,
    entryClass: diffEntry.class,
    site: context.siteByAddress.get(diffEntry.address),
    builtin: diffEntry.builtin,
    custom: diffEntry.custom,
  });

// [5.2.10] cfg-registryLifecycle · Derived value · "decidableRegistries"
// The registries the current comparison asks the user to decide, each as its template record with
// every decision `null`. A `registry-added` registry takes one registry-level decision. A `differs`
// registry is decidable when Builtin changed any of its entries; its record lists the entries whose
// class takes a decision, each with its informative `choices`, and may list none when every Builtin
// change is `aligned`.
const decidableRegistries = ({ comparison, statusById, contexts }) =>
  comparison.registries.flatMap((registry) => {
    const statusEntry = statusById.get(registry.registryId);
    if (registry.class === 'registry-added') {
      return [{ registryId: registry.registryId, class: registry.class, basedOn: toBasedOn(statusEntry), decision: null }];
    }

    const builtinChanged = registry.class === 'differs' && registry.entries.some((entry) => entry.class !== 'custom-only');
    if (!builtinChanged) {
      return [];
    }

    return [
      {
        registryId: registry.registryId,
        class: registry.class,
        basedOn: toBasedOn(statusEntry),
        entries: registry.entries
          .filter((entry) => Object.hasOwn(ENTRY_DECISIONS_BY_CLASS, entry.class))
          .map((entry) => ({
            address: entry.address,
            class: entry.class,
            choices: choicesFor(contexts.get(registry.registryId), entry),
            decision: null,
          })),
      },
    ];
  });

const requireCustomSet = ({ comparison }) => {
  if (!comparison.customExists) {
    throw new Error('No Custom registry set exists. Run registry:init-custom first.');
  }
};

// [5.2.10] cfg-registryLifecycle · Workflow · "buildRegistryUpdateDecisionsTemplate"
// `registryIds` restricts the template the same way it restricts `diff`.
export const buildRegistryUpdateDecisionsTemplate = ({
  targetRoot,
  lifecycleRootOverride,
  registryIds,
  slices = REGISTRY_LIFECYCLE_SLICES,
} = {}) => {
  const compared = compareRegistryLifecycle({ targetRoot, lifecycleRootOverride, registryIds, slices });
  requireCustomSet(compared);
  return {
    kind: UPDATE_DECISIONS_KIND,
    schemaVersion: UPDATE_DECISIONS_SCHEMA_VERSION,
    registries: decidableRegistries({ ...compared, contexts: entryContexts({ ...compared, slices }) }),
  };
};

const describeCurrent = (registry) =>
  registry
    ? `Its current diff class is ${registry.class}${registry.reason ? ` (${registry.reason})` : ''}${
        registry.class === 'differs' ? ' with no Builtin change' : ''
      }.`
    : 'It is not in the current comparison.';

const isPlainDecisionObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// One structured decision against its entry (spec §12.7). Returns `{ problem, detail }` or null.
const checkStructured = ({ context, expected, decision }) => {
  const diffEntry = context.diffByAddress.get(expected.address);
  const site = context.siteByAddress.get(expected.address);
  return checkStructuredDecision({
    entry: context.entry,
    entryClass: expected.class,
    site,
    builtin: diffEntry.builtin,
    custom: diffEntry.custom,
    decision,
    keysInCollection: site?.kind === 'record'
      ? new Set([...collectionKeys(context.walked.builtin, site), ...collectionKeys(context.walked.custom, site)])
      : new Set(),
  });
};

// Two add-alongside decisions requesting the same key in one collection conflict as a group: every
// member is invalid, whatever the document order (spec §12.4 "document order carries no meaning",
// §12.7). Returns the conflicting addresses with their detail.
const conflictingAlongsideKeys = (accepted) => {
  const byGroup = new Map();
  for (const item of accepted) {
    byGroup.set(item.group, [...(byGroup.get(item.group) ?? []), item]);
  }
  return [...byGroup.values()]
    .filter((members) => members.length > 1)
    .flatMap((members) => {
      const addresses = members.map(({ address }) => address).sort(compareOrdinal);
      return members.map(({ address, key }) => ({
        address,
        detail: `The add-alongside decision does not fit the entry: ${JSON.stringify(key)} is requested by more than one add-alongside decision in the collection (${addresses.join(', ')}).`,
      }));
    });
};

// Checks one document entry list against the expected entries. Returns the problems and the
// decided/undecided counts of the entries that are well formed.
const checkEntries = ({ registryId, documentEntries, expectedEntries, context, structuredAllowed, problem }) => {
  const expectedByAddress = new Map(expectedEntries.map((entry) => [entry.address, entry]));
  const entryFields = structuredAllowed ? ENTRY_FIELDS_V2 : ENTRY_FIELDS;
  // add-alongside decisions that pass on their own, checked together after every entry.
  const acceptedAlongside = [];
  const seen = new Set();
  let decided = 0;
  let undecided = 0;

  for (const documentEntry of documentEntries) {
    if (!isPlainObject(documentEntry) || typeof documentEntry.address !== 'string') {
      problem(PROBLEMS.malformed, 'Every entry needs a string "address".', { registryId });
      continue;
    }

    const { address } = documentEntry;
    if (seen.has(address)) {
      problem(PROBLEMS.duplicateEntry, 'The address is decided more than once.', { registryId, address });
      continue;
    }
    // Seen before the shape check, so a malformed entry is reported once, never also as missing.
    seen.add(address);

    const extra = unexpectedFields(documentEntry, entryFields);
    if (extra.length > 0 || typeof documentEntry.class !== 'string' || !Object.hasOwn(documentEntry, 'decision')) {
      problem(
        PROBLEMS.malformed,
        extra.length > 0
          ? `Unexpected field(s): ${extra.join(', ')}.`
          : 'An entry has exactly "address", "class" and "decision".',
        { registryId, address },
      );
      continue;
    }

    const expected = expectedByAddress.get(address);
    if (!expected) {
      problem(PROBLEMS.unknownEntry, 'The address is not a decidable entry of the current comparison.', { registryId, address });
      continue;
    }

    if (documentEntry.class !== expected.class) {
      problem(
        PROBLEMS.entryClassMismatch,
        `The document says ${documentEntry.class}; the current class is ${expected.class}.`,
        { registryId, address },
      );
      continue;
    }

    if (documentEntry.decision === null) {
      undecided += 1;
      continue;
    }

    if (isPlainDecisionObject(documentEntry.decision)) {
      const result = structuredAllowed
        ? checkStructured({ context, expected, decision: documentEntry.decision })
        : { problem: PROBLEMS.malformed, detail: `Structured decisions need "schemaVersion": "${UPDATE_DECISIONS_SCHEMA_VERSION}".` };
      if (result) {
        problem(result.problem, result.detail, { registryId, address });
        continue;
      }
      if (documentEntry.decision.kind === STRUCTURED_ENTRY_DECISIONS.addAlongside) {
        acceptedAlongside.push({
          address,
          key: documentEntry.decision.key,
          group: alongsideKeyGroup(context.siteByAddress.get(address), documentEntry.decision.key),
        });
        continue;
      }
      decided += 1;
      continue;
    }

    const allowed = ENTRY_DECISIONS_BY_CLASS[expected.class];
    if (!allowed.includes(documentEntry.decision)) {
      problem(
        PROBLEMS.unsupportedDecision,
        `${JSON.stringify(documentEntry.decision)} is not a decision for ${expected.class}; use one of ${allowed.join(', ')}, or null for no decision.`,
        { registryId, address },
      );
      continue;
    }

    decided += 1;
  }

  const conflicts = conflictingAlongsideKeys(acceptedAlongside);
  for (const { address, detail } of conflicts) {
    problem(PROBLEMS.invalidDecision, detail, { registryId, address });
  }
  decided += acceptedAlongside.length - conflicts.length;

  for (const expected of expectedEntries) {
    if (!seen.has(expected.address)) {
      problem(PROBLEMS.missingEntry, 'The entry is absent from the document; record no decision as null.', {
        registryId,
        address: expected.address,
      });
    }
  }

  return { decided, undecided };
};

// Checks one document registry record against the current comparison.
const checkRegistry = ({ record, expected, current, context, structuredAllowed, problem }) => {
  const { registryId } = record;
  if (!expected) {
    problem(PROBLEMS.notDecidable, `The registry has nothing to decide. ${describeCurrent(current)}`, { registryId });
    return null;
  }

  // `class` is document input: only an own key of the table selects a shape.
  const allowedFields =
    typeof record.class === 'string' && Object.hasOwn(REGISTRY_FIELDS_BY_CLASS, record.class)
      ? REGISTRY_FIELDS_BY_CLASS[record.class]
      : null;
  if (!allowedFields) {
    problem(PROBLEMS.malformed, `"class" must be registry-added or differs.`, { registryId });
    return null;
  }

  const extra = unexpectedFields(record, allowedFields);
  const missing = allowedFields.filter((field) => !Object.hasOwn(record, field));
  if (extra.length > 0 || missing.length > 0) {
    problem(
      PROBLEMS.malformed,
      [
        extra.length > 0 ? `Unexpected field(s): ${extra.join(', ')}.` : null,
        missing.length > 0 ? `Missing field(s): ${missing.join(', ')}.` : null,
      ]
        .filter(Boolean)
        .join(' '),
      { registryId },
    );
    return null;
  }

  const basedOn = record.basedOn;
  if (
    !isPlainObject(basedOn) ||
    unexpectedFields(basedOn, BASED_ON_FIELDS).length > 0 ||
    !BASED_ON_FIELDS.every((field) => Object.hasOwn(basedOn, field) && isDigestOrNull(basedOn[field]))
  ) {
    problem(PROBLEMS.malformed, `"basedOn" has exactly ${BASED_ON_FIELDS.join(', ')}, each a digest or null.`, { registryId });
    return null;
  }

  const changedInputs = BASED_ON_FIELDS.filter((field) => basedOn[field] !== expected.basedOn[field]);
  if (record.class !== expected.class || changedInputs.length > 0) {
    problem(
      PROBLEMS.stale,
      record.class !== expected.class
        ? `The document was made for ${record.class}; the registry is now ${expected.class}.`
        : `The compared inputs changed since the document was made: ${changedInputs.join(', ')}.`,
      { registryId },
    );
    return null;
  }

  if (record.class === 'registry-added') {
    if (record.decision === null) {
      return { decided: 0, undecided: 1 };
    }

    const allowed = REGISTRY_DECISIONS_BY_CLASS[record.class];
    if (!allowed.includes(record.decision)) {
      problem(
        PROBLEMS.unsupportedDecision,
        `${JSON.stringify(record.decision)} is not a decision for registry-added; use one of ${allowed.join(', ')}, or null for no decision.`,
        { registryId },
      );
      return null;
    }

    return { decided: 1, undecided: 0 };
  }

  if (!Array.isArray(record.entries)) {
    problem(PROBLEMS.malformed, '"entries" must be an array.', { registryId });
    return null;
  }

  return checkEntries({
    registryId,
    documentEntries: record.entries,
    expectedEntries: expected.entries,
    context,
    structuredAllowed,
    problem,
  });
};

const compareProblems = (left, right) =>
  (left.registryId === right.registryId
    ? 0
    : left.registryId === null
      ? -1
      : right.registryId === null
        ? 1
        : compareOrdinal(left.registryId, right.registryId)) ||
  compareOrdinal(left.address ?? '', right.address ?? '') ||
  compareOrdinal(left.problem, right.problem) ||
  compareOrdinal(left.detail, right.detail);

// [5.2.10] cfg-registryLifecycle · Workflow · "checkRegistryUpdateDecisions"
// Returns `{ valid, complete, problems, registries }`. `valid` is false when any problem exists.
// `registries` summarizes each record without a problem; it is `complete` when nothing in it is
// undecided. A record with a problem is never summarized, so it can never read as complete.
export const checkRegistryUpdateDecisions = ({
  document,
  targetRoot,
  lifecycleRootOverride,
  slices = REGISTRY_LIFECYCLE_SLICES,
} = {}) => {
  const compared = compareRegistryLifecycle({ targetRoot, lifecycleRootOverride, slices });
  requireCustomSet(compared);

  const problems = [];
  const problem = (code, detail, { registryId = null, address } = {}) => {
    problems.push({ registryId, ...(address === undefined ? {} : { address }), problem: code, detail });
  };
  const finish = (registries) => {
    const sortedProblems = problems.sort(compareProblems);
    const sortedRegistries = registries.sort((left, right) => compareOrdinal(left.registryId, right.registryId));
    return {
      valid: sortedProblems.length === 0,
      complete: sortedProblems.length === 0 && sortedRegistries.every((registry) => registry.complete),
      problems: sortedProblems,
      registries: sortedRegistries,
    };
  };

  const extra = isPlainObject(document) ? unexpectedFields(document, DOCUMENT_FIELDS) : [];
  if (
    !isPlainObject(document) ||
    extra.length > 0 ||
    document.kind !== UPDATE_DECISIONS_KIND ||
    !UPDATE_DECISIONS_READABLE_SCHEMA_VERSIONS.includes(document.schemaVersion) ||
    !Array.isArray(document.registries)
  ) {
    problem(
      PROBLEMS.malformed,
      extra.length > 0
        ? `Unexpected field(s): ${extra.join(', ')}.`
        : `The document is an object with "kind": "${UPDATE_DECISIONS_KIND}", "schemaVersion" ${UPDATE_DECISIONS_READABLE_SCHEMA_VERSIONS.map((version) => `"${version}"`).join(' or ')} and a "registries" array.`,
    );
    return finish([]);
  }

  const contexts = entryContexts({ ...compared, slices });
  const structuredAllowed = document.schemaVersion === UPDATE_DECISIONS_SCHEMA_VERSION;
  const expectedById = new Map(decidableRegistries({ ...compared, contexts }).map((record) => [record.registryId, record]));
  const currentById = new Map(compared.comparison.registries.map((registry) => [registry.registryId, registry]));
  const seenIds = new Set();
  const summaries = [];

  for (const record of document.registries) {
    if (!isPlainObject(record) || typeof record.registryId !== 'string') {
      problem(PROBLEMS.malformed, 'Every registry record needs a string "registryId".');
      continue;
    }

    const { registryId } = record;
    if (seenIds.has(registryId)) {
      problem(PROBLEMS.duplicateRegistry, 'The registry is listed more than once.', { registryId });
      continue;
    }
    seenIds.add(registryId);

    // The comparison covers every inventory registry and every orphan of this Custom set.
    if (!currentById.has(registryId)) {
      problem(PROBLEMS.unknownRegistry, 'Neither a current Builtin registry nor an orphan of this Custom set.', { registryId });
      continue;
    }

    const problemsBefore = problems.length;
    const counts = checkRegistry({
      record,
      expected: expectedById.get(registryId),
      current: currentById.get(registryId),
      context: contexts.get(registryId),
      structuredAllowed,
      problem,
    });
    if (counts && problems.length === problemsBefore) {
      summaries.push({ registryId, class: record.class, ...counts, complete: counts.undecided === 0 });
    }
  }

  return finish(summaries);
};
