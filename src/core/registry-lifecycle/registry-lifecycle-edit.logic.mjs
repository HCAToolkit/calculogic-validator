/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.19)
 * Responsibility: The edit document (lifecycle spec §12.10): `edit-check`, its read-only check
 *   against the current Custom set and the final Custom image of every slice it touches, and `edit`,
 *   which applies a document that passes the same check.
 * Invariants: the document is the only authority and is bound per registry to the Custom digest it
 *   was written against; only Custom files are written, never the Baseline, the manifest or
 *   Builtin; the slice is the unit of edit; classification stays with `diff`; `registry-state.json`
 *   is never read or written; problems and summaries are deterministic, in ordinal order.
 */
import fs from 'node:fs';
import path from 'node:path';
import { assessCustomRegistrySet } from './registry-lifecycle-assessment.logic.mjs';
import { ComparisonExtractionError, walkComparisonEntries } from './registry-lifecycle-comparison.logic.mjs';
import { buildRegistryEdit } from './registry-lifecycle-edit-candidate.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from './registry-lifecycle-inventory.knowledge.mjs';
import {
  applyBySlice,
  assertSliceImageValid,
  introducedSliceFailures,
  isContainedFile,
  openLifecycleWrite,
  readBoundLifecycleFile,
  refusalFor,
  serializeRegistryPayload,
} from './registry-lifecycle-slice-apply.logic.mjs';
import { validateSliceRegistrySet } from './registry-lifecycle-slice-validation.logic.mjs';
import { RegistryLifecycleError, resolveRegistryLifecyclePaths } from './registry-lifecycle-state.logic.mjs';
import {
  EDIT_DOCUMENT_KIND,
  EDIT_DOCUMENT_PROBLEMS as PROBLEMS,
  EDIT_DOCUMENT_SCHEMA_VERSION,
  EDIT_OPERATIONS,
} from './registry-lifecycle.contracts.mjs';

const DOCUMENT = 'edit document';
const DOCUMENT_FIELDS = Object.freeze(['kind', 'registries', 'schemaVersion']);
const RECORD_FIELDS = Object.freeze(['basedOn', 'operations', 'registryId']);
const OPERATION_FIELDS = Object.freeze(['address', 'op', 'value']);

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const compareOrdinal = (left, right) => (left === right ? 0 : left < right ? -1 : 1);
const unexpectedFields = (value, allowed) => Object.keys(value).filter((field) => !allowed.includes(field)).sort(compareOrdinal);
const isOperationName = (value) => typeof value === 'string' && Object.values(EDIT_OPERATIONS).includes(value);

const requireCustomSet = (assessment) => {
  if (!assessment.customExists) {
    throw new Error('No Custom registry set exists. Run registry:init-custom first.');
  }
};

// Why a record does not have the edit document's record shape, or null (spec §12.10 "Shape").
const recordShapeProblem = (record) => {
  const extra = unexpectedFields(record, RECORD_FIELDS);
  if (extra.length > 0) {
    return `Unexpected field(s): ${extra.join(', ')}.`;
  }
  if (!isPlainObject(record.basedOn) || unexpectedFields(record.basedOn, ['customDigest']).length > 0 || typeof record.basedOn.customDigest !== 'string') {
    return '"basedOn" has exactly a string "customDigest".';
  }
  if (!Array.isArray(record.operations) || record.operations.length === 0) {
    return '"operations" is a non-empty list: a record names a registry because it changes it.';
  }
  for (const operation of record.operations) {
    const fields = isPlainObject(operation) ? unexpectedFields(operation, OPERATION_FIELDS) : [];
    if (!isPlainObject(operation) || fields.length > 0 || !isOperationName(operation.op) || typeof operation.address !== 'string') {
      return fields.length > 0
        ? `An operation has unexpected field(s): ${fields.join(', ')}.`
        : `Every operation is { "op": "add" | "change" | "remove", "address", "value"? }.`;
    }
  }
  return null;
};

// The current Custom payload of an editable registry, or why it is not editable (spec §12.10
// "Editable registries"). A registry that currently fails its slice's validation is editable.
const readEditable = ({ paths, slice, entry, statusEntry }) => {
  if (statusEntry.classification === 'missing') {
    return { reason: 'Absent from the Custom set; inherit it first (decisions-template, update).' };
  }
  const filePath = path.join(paths.customRoot, slice.sliceId, entry.fileName);
  if (statusEntry.customDigest === null || !isContainedFile(paths, filePath)) {
    return { reason: `The Custom registry cannot be read: ${statusEntry.detail ?? 'it resolves outside the validation target.'}` };
  }
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!entry.readableVersions.includes(payload?.version)) {
    return {
      reason: `The Custom registry is at version ${JSON.stringify(payload?.version ?? null)}, which this engine does not read; migrate it first (migrate-plan, migrate).`,
    };
  }
  try {
    walkComparisonEntries(payload, entry);
  } catch (error) {
    if (error instanceof ComparisonExtractionError) {
      return { reason: `The Custom registry has no valid comparison entries: ${error.message}` };
    }
    throw error;
  }
  return { payload };
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

// [5.2.19] cfg-registryLifecycle · Workflow · "checkRegistryEditDocument"
// Returns `{ valid, problems, registries }`. A record-level problem stops its operations from being
// checked; the exact image and the slice image are checked only for records, and slices, without
// another problem. A record with a problem, or in a slice that fails, is never summarized.
// `validateSlice` is an internal test seam.
export const checkRegistryEditDocument = ({
  document,
  targetRoot,
  lifecycleRootOverride,
  slices = REGISTRY_LIFECYCLE_SLICES,
  validateSlice = validateSliceRegistrySet,
} = {}) => {
  const paths = resolveRegistryLifecyclePaths({ targetRoot, lifecycleRootOverride });
  const assessment = assessCustomRegistrySet({ paths, slices });
  requireCustomSet(assessment);

  const problems = [];
  const problem = (code, detail, { registryId = null, address } = {}) => {
    problems.push({ registryId, ...(address === undefined || address === null ? {} : { address }), problem: code, detail });
  };
  const finish = (registries) => {
    const sortedProblems = problems.sort(compareProblems);
    return {
      valid: sortedProblems.length === 0,
      problems: sortedProblems,
      registries: registries.sort((left, right) => compareOrdinal(left.registryId, right.registryId)),
    };
  };

  const extra = isPlainObject(document) ? unexpectedFields(document, DOCUMENT_FIELDS) : [];
  if (
    !isPlainObject(document) ||
    extra.length > 0 ||
    document.kind !== EDIT_DOCUMENT_KIND ||
    document.schemaVersion !== EDIT_DOCUMENT_SCHEMA_VERSION ||
    !Array.isArray(document.registries)
  ) {
    problem(
      PROBLEMS.malformed,
      extra.length > 0
        ? `Unexpected field(s): ${extra.join(', ')}.`
        : `The document is an object with "kind": "${EDIT_DOCUMENT_KIND}", "schemaVersion": "${EDIT_DOCUMENT_SCHEMA_VERSION}" and a "registries" array.`,
    );
    return finish([]);
  }

  const located = new Map(slices.flatMap((slice) => slice.inventory.map((entry) => [entry.registryId, { slice, entry }])));
  const statusById = new Map(assessment.registries.map((statusEntry) => [statusEntry.registryId, statusEntry]));
  const seenIds = new Set();
  const edited = [];
  const failedSliceIds = new Set();

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
    if (!located.has(registryId)) {
      problem(PROBLEMS.unknownRegistry, 'Not a current Builtin registry.', { registryId });
      continue;
    }
    const { slice, entry } = located.get(registryId);
    const fail = (code, detail, address) => {
      problem(code, detail, { registryId, address });
      failedSliceIds.add(slice.sliceId);
    };

    const shapeProblem = recordShapeProblem(record);
    if (shapeProblem) {
      fail(PROBLEMS.malformed, shapeProblem);
      continue;
    }
    const statusEntry = statusById.get(registryId);
    const editable = readEditable({ paths, slice, entry, statusEntry });
    if (editable.reason) {
      fail(PROBLEMS.notEditable, editable.reason);
      continue;
    }
    if (statusEntry.customDigest !== record.basedOn.customDigest) {
      fail(PROBLEMS.stale, 'The Custom registry no longer has the digest the edit document was written against.');
      continue;
    }

    const result = buildRegistryEdit({ entry, customPayload: editable.payload, operations: record.operations });
    for (const item of result.problems) {
      fail(item.problem, item.detail, item.address);
    }
    if (result.problems.length === 0) {
      edited.push({ slice, entry, record, payload: result.payload });
    }
  }

  // The final Custom image of every slice whose records have no problem (spec §12.10).
  const summaries = [];
  for (const sliceId of [...new Set(edited.map(({ slice }) => slice.sliceId))].sort(compareOrdinal)) {
    if (failedSliceIds.has(sliceId)) {
      continue;
    }
    const sliceEdits = edited.filter(({ slice }) => slice.sliceId === sliceId);
    const introduced = introducedSliceFailures({
      paths,
      slice: sliceEdits[0].slice,
      files: sliceEdits.map(({ entry, payload }) => [entry.fileName, serializeRegistryPayload(payload)]),
      validateSlice,
    });
    for (const failure of introduced) {
      problem(PROBLEMS.invalidResult, failure.detail, { registryId: failure.registryId });
    }
    if (introduced.length === 0) {
      summaries.push(...sliceEdits.map(({ record }) => ({ registryId: record.registryId, operations: record.operations.length })));
    }
  }

  return finish(summaries);
};

// [5.2.19] cfg-registryLifecycle · Workflow · "applyRegistryEditDocument"
// Returns `{ recovered?, applied, failed? }`, or `{ recovered?, applied: [], problems }` for a
// document that is not valid. The document is read through `loadDocument`, only after recovery
// (spec §12.10 `edit` item 1). `validateSlice` and `onTransactionStep` are internal test seams.
export const applyRegistryEditDocument = ({
  loadDocument,
  targetRoot,
  lifecycleRootOverride,
  slices = REGISTRY_LIFECYCLE_SLICES,
  validateSlice = validateSliceRegistrySet,
  onTransactionStep,
} = {}) => {
  const paths = resolveRegistryLifecyclePaths({ targetRoot, lifecycleRootOverride });
  const recovered = openLifecycleWrite(paths, 'edit');
  const withRecovered = (result) => (recovered ? { recovered, ...result } : result);

  let document;
  try {
    document = loadDocument();
  } catch (error) {
    const recoveryNote = recovered ? ` An interrupted transaction was recovered first (${recovered.outcome}).` : '';
    throw new RegistryLifecycleError(`Cannot read the edit document: ${error.message}.${recoveryNote}`);
  }

  const check = checkRegistryEditDocument({ document, targetRoot, lifecycleRootOverride, slices, validateSlice });
  if (!check.valid) {
    return withRecovered({ applied: [], problems: check.problems });
  }

  // Every record is applied; there is nothing undecided to skip (spec §12.10 `edit` item 3).
  const result = applyBySlice({
    paths,
    slices,
    records: document.registries,
    prepareSlice: ({ slice, selections }) => {
      const prepared = selections.map(({ entry, record }) => {
        const refuse = refusalFor(entry.registryId);
        const customPath = path.join(paths.customRoot, slice.sliceId, entry.fileName);
        const custom = readBoundLifecycleFile({
          paths,
          filePath: customPath,
          entry,
          expectedDigest: record.basedOn.customDigest,
          refuse,
          label: 'Custom',
          document: DOCUMENT,
        });
        const edit = buildRegistryEdit({ entry, customPayload: custom.payload, operations: record.operations });
        if (edit.problems.length > 0) {
          refuse(edit.problems.map((item) => `${item.address ?? 'registry'}: ${item.problem}: ${item.detail}`).join('; '));
        }
        return { registryId: entry.registryId, fileName: entry.fileName, write: { targetPath: customPath, contents: serializeRegistryPayload(edit.payload) } };
      });
      assertSliceImageValid({
        paths,
        slice,
        files: prepared.map(({ fileName, write }) => [fileName, write.contents]),
        registryIds: prepared.map(({ registryId }) => registryId),
        label: 'edited',
        validateSlice,
      });
      // Only Custom files; the last one is the commit point (spec §4.6, §12.10 `edit` item 5).
      return prepared.map(({ write }) => write);
    },
    onTransactionStep,
  });
  return withRecovered(result);
};
