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
import os from 'node:os';
import path from 'node:path';
import { isPathInsideTarget } from '../target-path-containment.logic.mjs';
import { digestRegistryPayload } from './registry-lifecycle-canonical-digest.logic.mjs';
import { checkRegistryUpdateDecisions } from './registry-lifecycle-decisions.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from './registry-lifecycle-inventory.knowledge.mjs';
import { RegistryUpdateCandidateError, buildRegistryUpdateCandidate } from './registry-lifecycle-update-candidate.logic.mjs';
import { validateSliceRegistrySet } from './registry-lifecycle-slice-validation.logic.mjs';
import {
  RegistryLifecycleError,
  isLifecyclePathContained,
  readRegistrySetManifest,
  resolveRegistryLifecyclePaths,
} from './registry-lifecycle-state.logic.mjs';
import {
  LIFECYCLE_TRANSACTION_SIMULATED_CRASH,
  recoverLifecycleTransaction,
  runLifecycleTransaction,
} from './registry-lifecycle-transaction.logic.mjs';
import { STRUCTURED_ENTRY_DECISIONS, UPDATE_SKIP_REASONS } from './registry-lifecycle.contracts.mjs';

const compareOrdinal = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

const failureKey = (failure) => `${failure.registryId}\u0000${failure.detail}`;

const isContainedFile = (paths, filePath) => {
  try {
    return isLifecyclePathContained(paths, filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
};

// The slice failures the new files introduce: validation over one scratch copy of the Custom slice,
// before and after writing every new file (`files`: file name → bytes), at the same root so failure
// details compare exactly. Only contained files are copied: nothing is read through an escaping path
// (spec §4.1), so an escaping file is absent from both runs and fails the same way in each.
const newSliceFailures = ({ paths, slice, customSliceRoot, files }) => {
  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'calculogic-registry-update-'));
  try {
    const candidateRoot = path.join(scratchRoot, slice.sliceId);
    fs.mkdirSync(candidateRoot);
    if (isLifecyclePathContained(paths, customSliceRoot) && fs.existsSync(customSliceRoot)) {
      for (const name of fs.readdirSync(customSliceRoot)) {
        const sourcePath = path.join(customSliceRoot, name);
        if (isContainedFile(paths, sourcePath)) {
          fs.copyFileSync(sourcePath, path.join(candidateRoot, name));
        }
      }
    }

    const before = new Set(validateSliceRegistrySet(slice.sliceId, candidateRoot).map(failureKey));
    for (const [fileName, bytes] of files) {
      fs.writeFileSync(path.join(candidateRoot, fileName), bytes);
    }
    return validateSliceRegistrySet(slice.sliceId, candidateRoot).filter((failure) => !before.has(failureKey(failure)));
  } finally {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }
};

const refusalFor = (registryId) => (detail) => {
  throw new RegistryLifecycleError(`${registryId}: ${detail}`);
};

const readJson = (filePath, refuse, label) => {
  try {
    const bytes = fs.readFileSync(filePath);
    return { bytes, payload: JSON.parse(bytes.toString('utf8')) };
  } catch (error) {
    return refuse(`the ${label} file is unreadable: ${error.message}`);
  }
};

// The Builtin file the record authorized (spec §12.5 item 4): contained in its slice's Builtin root,
// parsed, with the record's Builtin digest and a readable version.
const readAuthorizedBuiltin = ({ slice, entry, record, refuse }) => {
  const builtinPath = path.join(slice.builtinRoot, entry.fileName);
  if (!isPathInsideTarget(slice.builtinRoot, builtinPath)) {
    refuse('the Builtin file resolves outside its slice Builtin root.');
  }

  const { bytes, payload } = readJson(builtinPath, refuse, 'Builtin');
  const digest = digestRegistryPayload(payload, entry.descriptor);
  if (digest !== record.basedOn.builtinDigest) {
    refuse('the Builtin file no longer has the digest the decisions document authorized; the document is stale.');
  }

  if (!entry.readableVersions.includes(payload.version)) {
    refuse(`Builtin version ${JSON.stringify(payload.version ?? null)} is not readable by this engine.`);
  }
  return { bytes, payload, digest };
};

const readManifestFor = (paths, refuse) => {
  const { manifest, manifestError } = readRegistrySetManifest(paths);
  if (manifestError) {
    refuse(manifestError);
  }
  return manifest;
};

// [5.2.12] cfg-registryLifecycle · Derived value · "assertSliceValid"
// The slice's registry-set validation, run once over its final image: every prepared registry's new
// Custom file in place, every other registry's current Custom file unchanged (spec §12.5 item 4).
// Nothing it does not already report for the current Custom slice.
const assertSliceValid = ({ paths, slice, prepared }) => {
  const customSliceRoot = path.join(paths.customRoot, slice.sliceId);
  const files = prepared.map(({ fileName, customBytes }) => [fileName, customBytes]);
  const introduced = newSliceFailures({ paths, slice, customSliceRoot, files });
  if (introduced.length > 0) {
    throw new RegistryLifecycleError(
      `the ${slice.sliceId} registry-set validation fails with the updated registries (${prepared
        .map(({ registryId }) => registryId)
        .join(', ')}): ${introduced.map((failure) => `${failure.registryId}: ${failure.detail}`).join('; ')}`,
    );
  }
};

// The manifest with each prepared registry's Baseline entry advanced, computed exactly as
// `init-custom` computes it; every other entry and field unchanged, entries sorted by id.
const advancedManifestBytes = ({ manifest, prepared }) => {
  const registries = {
    ...manifest.basedOn.registries,
    ...Object.fromEntries(prepared.map(({ registryId, manifestEntry }) => [registryId, manifestEntry])),
  };
  const nextManifest = {
    ...manifest,
    basedOn: {
      ...manifest.basedOn,
      registries: Object.fromEntries(
        Object.keys(registries)
          .sort(compareOrdinal)
          .map((id) => [id, registries[id]]),
      ),
    },
  };
  return `${JSON.stringify(nextManifest, null, 2)}\n`;
};

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
  const builtin = readAuthorizedBuiltin({ slice, entry, record, refuse });

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

// A lifecycle file the record was made against: contained, an ordinary file, parsed, and with the
// record's digest for it.
const readBoundLifecycleFile = ({ paths, filePath, entry, expectedDigest, refuse, label }) => {
  if (!isContainedFile(paths, filePath)) {
    refuse(`the ${label} file is missing or resolves outside the validation target.`);
  }
  const file = readJson(filePath, refuse, label);
  if (digestRegistryPayload(file.payload, entry.descriptor) !== expectedDigest) {
    refuse(`the ${label} file no longer has the digest the decisions document was made against; the document is stale.`);
  }
  return file;
};

// [5.2.12] cfg-registryLifecycle · Derived value · "prepareRegistryReconciliation"
// A complete `differs` record (spec §12.5 item 4, §12.6): the whole current Builtin as the Baseline,
// and the candidate as the Custom file when it changes Custom.
const prepareRegistryReconciliation = ({ paths, manifest, slice, entry, record, validatorVersion }) => {
  const refuse = refusalFor(entry.registryId);
  const builtin = readAuthorizedBuiltin({ slice, entry, record, refuse });

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
  });
  const custom = readBoundLifecycleFile({
    paths,
    filePath: customPath,
    entry,
    expectedDigest: record.basedOn.customDigest,
    refuse,
    label: 'Custom',
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
    customBytes: candidate.changed ? `${JSON.stringify(candidate.payload, null, 2)}\n` : custom.bytes,
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
  const manifest = readManifestFor(paths, refusalFor(slice.sliceId));
  const prepared = selections.map(({ entry, record }) =>
    PREPARE_BY_CLASS[record.class]({ paths, manifest, slice, entry, record, validatorVersion }),
  );
  assertSliceValid({ paths, slice, prepared });
  return [
    ...prepared.map(({ baselineWrite }) => baselineWrite),
    ...prepared.flatMap(({ customWrite }) => (customWrite ? [customWrite] : [])),
    { targetPath: paths.manifestPath, contents: advancedManifestBytes({ manifest, prepared }) },
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
  for (const lifecyclePath of [paths.lifecycleRoot, paths.customRoot]) {
    if (!isLifecyclePathContained(paths, lifecyclePath)) {
      throw new RegistryLifecycleError(
        `Registry lifecycle path resolves outside the validation target (${lifecyclePath}); update writes only inside the target repository.`,
      );
    }
  }

  const recovered = recoverLifecycleTransaction(paths);
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

  const entriesById = new Map(
    slices.flatMap((slice) => slice.inventory.map((entry) => [entry.registryId, { slice, entry }])),
  );
  const { apply, skipped } = selectRecords(document);

  // The slice is the unit of update (spec §12.5 item 3): slices in ordinal id order, registries
  // within one in ordinal id order (`apply` is sorted).
  const selectionsBySlice = new Map();
  for (const record of apply) {
    const { slice, entry } = entriesById.get(record.registryId);
    if (!selectionsBySlice.has(slice.sliceId)) {
      selectionsBySlice.set(slice.sliceId, { slice, selections: [] });
    }
    selectionsBySlice.get(slice.sliceId).selections.push({ entry, record });
  }

  const applied = [];
  for (const sliceId of [...selectionsBySlice.keys()].sort(compareOrdinal)) {
    const { slice, selections } = selectionsBySlice.get(sliceId);
    const registryIds = selections.map(({ record }) => record.registryId);
    try {
      const writes = prepareSliceUpdate({ paths, slice, selections, validatorVersion });
      runLifecycleTransaction({ paths, writes, onStep: onTransactionStep });
    } catch (error) {
      // A simulated crash stands for a killed process, which reports nothing (test seam, §4.6).
      if (error?.[LIFECYCLE_TRANSACTION_SIMULATED_CRASH]) {
        throw error;
      }
      return withRecovered({ applied, skipped, failed: { sliceId, registryIds, detail: error.message } });
    }
    applied.push(...registryIds);
  }

  return withRecovered({ applied, skipped });
};
