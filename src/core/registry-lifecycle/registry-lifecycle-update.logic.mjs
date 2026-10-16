/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.12)
 * Responsibility: `update` (lifecycle spec §12.5): applies a checked decisions document:
 *   `registry-added` inheritance, and `differs` entry decisions through the update candidate (§12.6).
 * Invariants: the decisions document is the only authority; nothing is inferred from `null`; the
 *   slice is the unit of update: its selected registries are each prepared against the inputs their
 *   record was made for, validated together, and advanced atomically in one transaction (§4.6); the
 *   Baseline advances to the whole current Builtin; `registry-state.json` is never read or written;
 *   no other registry changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { checkRegistryUpdateDecisions } from './registry-lifecycle-decisions.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from './registry-lifecycle-inventory.knowledge.mjs';
import { RegistryUpdateCandidateError, buildRegistryUpdateCandidate } from './registry-lifecycle-update-candidate.logic.mjs';
import {
  applyBySlice,
  assertSliceImageValid,
  manifestBytesWith,
  openLifecycleWrite,
  readAuthorizedBuiltin,
  readBoundLifecycleFile,
  readTrustedManifest,
  refusalFor,
  serializeRegistryPayload,
} from './registry-lifecycle-slice-apply.logic.mjs';
import { RegistryLifecycleError, resolveRegistryLifecyclePaths } from './registry-lifecycle-state.logic.mjs';
import { STRUCTURED_ENTRY_DECISIONS, UPDATE_SKIP_REASONS } from './registry-lifecycle.contracts.mjs';

const compareOrdinal = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

const DOCUMENT = 'decisions document';

// What a prepared registry contributes to its slice's transaction (spec §12.5 item 5): its Baseline
// write, its Custom write (absent when Custom keeps its bytes), its new Custom bytes for slice
// validation, and its manifest entry.
const preparedRegistry = ({ entry, validatorVersion, builtin, baselinePath, customPath, customBytes, customChanged }) => ({
  registryId: entry.registryId,
  fileName: entry.fileName,
  baselineWrite: { targetPath: baselinePath, contents: builtin.bytes },
  customWrite: customChanged ? { targetPath: customPath, contents: customBytes } : null,
  customBytes,
  manifestEntry: { validatorVersion, version: builtin.payload.version, digest: builtin.digest },
});

// [5.2.12] cfg-registryLifecycle · Derived value · "prepareRegistryInheritance"
// A `registry-added` record decided `inherit` (spec §12.5 item 4).
const prepareRegistryInheritance = ({ paths, manifest, slice, entry, record, validatorVersion }) => {
  const refuse = refusalFor(entry.registryId);
  const builtin = readAuthorizedBuiltin({ slice, entry, expectedDigest: record.basedOn.builtinDigest, refuse, document: DOCUMENT });

  const customPath = path.join(paths.customRoot, slice.sliceId, entry.fileName);
  if (fs.existsSync(customPath)) {
    refuse('Custom already has this registry; the document is stale.');
  }

  if (Object.hasOwn(manifest.basedOn.registries, entry.registryId)) {
    refuse('the manifest already has a Baseline entry for this registry; the document is stale.');
  }

  return preparedRegistry({
    entry,
    validatorVersion,
    builtin,
    baselinePath: path.join(paths.baselineRoot, slice.sliceId, entry.fileName),
    customPath,
    customBytes: builtin.bytes,
    customChanged: true,
  });
};

// [5.2.12] cfg-registryLifecycle · Derived value · "prepareRegistryReconciliation"
// A complete `differs` record (spec §12.5 item 4, §12.6): the whole current Builtin as the Baseline,
// and the candidate as the Custom file when it changes Custom.
const prepareRegistryReconciliation = ({ paths, manifest, slice, entry, record, validatorVersion }) => {
  const refuse = refusalFor(entry.registryId);
  const builtin = readAuthorizedBuiltin({ slice, entry, expectedDigest: record.basedOn.builtinDigest, refuse, document: DOCUMENT });

  const manifestEntry = Object.hasOwn(manifest.basedOn.registries, entry.registryId)
    ? manifest.basedOn.registries[entry.registryId]
    : null;
  if (manifestEntry?.digest !== record.basedOn.baselineDigest) {
    refuse('the manifest Baseline entry is not the one the decisions document was made against; the document is stale.');
  }

  const baselinePath = path.join(paths.baselineRoot, slice.sliceId, entry.fileName);
  const customPath = path.join(paths.customRoot, slice.sliceId, entry.fileName);
  const baseline = readBoundLifecycleFile({
    paths,
    filePath: baselinePath,
    entry,
    expectedDigest: record.basedOn.baselineDigest,
    refuse,
    label: 'Baseline copy',
    document: DOCUMENT,
  });
  const custom = readBoundLifecycleFile({
    paths,
    filePath: customPath,
    entry,
    expectedDigest: record.basedOn.customDigest,
    refuse,
    label: 'Custom',
    document: DOCUMENT,
  });

  // Same-version content only (spec §12.5); a version change is a migration (§8.3).
  const version = builtin.payload.version;
  if (manifestEntry.version !== version || custom.payload.version !== version) {
    refuse(
      `the update applies within one version: Builtin ${JSON.stringify(version)}, Baseline ${JSON.stringify(manifestEntry.version)}, Custom ${JSON.stringify(custom.payload.version ?? null)}.`,
    );
  }

  let candidate;
  try {
    candidate = buildRegistryUpdateCandidate({
      entry,
      baselinePayload: baseline.payload,
      builtinPayload: builtin.payload,
      customPayload: custom.payload,
      decisions: record.entries,
    });
  } catch (error) {
    if (error instanceof RegistryUpdateCandidateError) {
      refuse(error.message);
    }
    throw error;
  }

  return preparedRegistry({
    entry,
    validatorVersion,
    builtin,
    baselinePath,
    customPath,
    customBytes: candidate.changed ? serializeRegistryPayload(candidate.payload) : custom.bytes,
    customChanged: candidate.changed,
  });
};

const PREPARE_BY_CLASS = Object.freeze({
  'registry-added': prepareRegistryInheritance,
  differs: prepareRegistryReconciliation,
});

// [5.2.12] cfg-registryLifecycle · Derived value · "prepareSliceUpdate"
// Every selected registry of one slice, prepared against one manifest read, then the slice validated
// once with all of them in place. Returns the slice's transaction writes in commit order (spec §12.5
// item 5): every Baseline copy, every changed Custom file, then the manifest once.
const prepareSliceUpdate = ({ paths, slice, selections, validatorVersion }) => {
  const manifest = readTrustedManifest(paths, refusalFor(slice.sliceId));
  const prepared = selections.map(({ entry, record }) =>
    PREPARE_BY_CLASS[record.class]({ paths, manifest, slice, entry, record, validatorVersion }),
  );
  assertSliceImageValid({
    paths,
    slice,
    files: prepared.map(({ fileName, customBytes }) => [fileName, customBytes]),
    registryIds: prepared.map(({ registryId }) => registryId),
    label: 'updated',
  });
  return [
    ...prepared.map(({ baselineWrite }) => baselineWrite),
    ...prepared.flatMap(({ customWrite }) => (customWrite ? [customWrite] : [])),
    { targetPath: paths.manifestPath, contents: manifestBytesWith({ manifest, entries: prepared.map(({ registryId, manifestEntry }) => [registryId, manifestEntry]) }) },
  ];
};

// The complete records to apply, and the ones skipped (spec §12.5 item 3): undecided records, and
// complete records with an add-alongside decision (§12.7), which this release checks but does not
// apply; none of such a record's decisions is applied. merge-fields decisions apply. A checked
// document holds only decisions its classes accept.
const selectRecords = (document) => {
  const apply = [];
  const skipped = [];
  for (const record of [...document.registries].sort((left, right) => compareOrdinal(left.registryId, right.registryId))) {
    const decisions = record.class === 'registry-added' ? [record.decision] : record.entries.map((entry) => entry.decision);
    if (decisions.includes(null)) {
      skipped.push({ registryId: record.registryId, reason: UPDATE_SKIP_REASONS.undecided });
    } else if (decisions.some((decision) => decision?.kind === STRUCTURED_ENTRY_DECISIONS.addAlongside)) {
      skipped.push({ registryId: record.registryId, reason: UPDATE_SKIP_REASONS.notYetSupported });
    } else {
      apply.push(record);
    }
  }
  return { apply, skipped };
};

// [5.2.12] cfg-registryLifecycle · Workflow · "applyRegistryUpdateDecisions"
// Returns `{ recovered?, applied, skipped, failed? }` (`failed`: `{ sliceId, registryIds, detail }`), or `{ recovered?, applied: [], problems }`
// for a document that is not valid. The document is read through `loadDocument`, which is called
// only after recovery: recovery comes first even when the document cannot be read (spec §12.5).
// `onTransactionStep` is the transaction's internal test seam.
export const applyRegistryUpdateDecisions = ({
  loadDocument,
  targetRoot,
  lifecycleRootOverride,
  validatorVersion,
  slices = REGISTRY_LIFECYCLE_SLICES,
  onTransactionStep,
} = {}) => {
  if (typeof validatorVersion !== 'string' || validatorVersion.length === 0) {
    throw new Error('applyRegistryUpdateDecisions needs the Validator version for the Baseline.');
  }

  const paths = resolveRegistryLifecyclePaths({ targetRoot, lifecycleRootOverride });
  const recovered = openLifecycleWrite(paths, 'update');
  const withRecovered = (result) => (recovered ? { recovered, ...result } : result);

  let document;
  try {
    document = loadDocument();
  } catch (error) {
    const recoveryNote = recovered ? ` An interrupted transaction was recovered first (${recovered.outcome}).` : '';
    throw new RegistryLifecycleError(`Cannot read the decisions document: ${error.message}.${recoveryNote}`);
  }

  const check = checkRegistryUpdateDecisions({ document, targetRoot, lifecycleRootOverride, slices });
  if (!check.valid) {
    return withRecovered({ applied: [], problems: check.problems });
  }

  const { apply, skipped } = selectRecords(document);
  const result = applyBySlice({
    paths,
    slices,
    records: apply,
    prepareSlice: ({ slice, selections }) => prepareSliceUpdate({ paths, slice, selections, validatorVersion }),
    onTransactionStep,
  });
  return withRecovered({ ...result, skipped });
};
