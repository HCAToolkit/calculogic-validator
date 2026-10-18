/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.17)
 * Responsibility: The slice-atomic application mechanics shared by every command that changes an
 *   existing Custom set (`update`, spec §12.5; `migrate`, §12.9): selected registries grouped by
 *   slice, the slice's registry-set validation over its final Custom image, the advanced manifest,
 *   and one lifecycle transaction per slice.
 * Invariants: the slice is the unit of application; slices apply in ordinal slice-id order and
 *   registries within one in ordinal registry-id order; a failed slice stops the command and leaves
 *   earlier slices committed; `registry-state.json` is never read or written.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isPathInsideTarget } from '../target-path-containment.logic.mjs';
import { digestRegistryPayload } from './registry-lifecycle-canonical-digest.logic.mjs';
import { descriptorForPayload } from './registry-lifecycle-migration.logic.mjs';
import { validateSliceRegistrySet } from './registry-lifecycle-slice-validation.logic.mjs';
import {
  RegistryLifecycleError,
  isLifecyclePathContained,
  readRegistrySetManifest,
} from './registry-lifecycle-state.logic.mjs';
import {
  LIFECYCLE_TRANSACTION_SIMULATED_CRASH,
  recoverLifecycleTransaction,
  runLifecycleTransaction,
} from './registry-lifecycle-transaction.logic.mjs';

const compareOrdinal = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

const failureKey = (failure) => `${failure.registryId}\u0000${failure.detail}`;

// [5.2.17] cfg-registryLifecycle · Primitive · "isContainedFile"
export const isContainedFile = (paths, filePath) => {
  try {
    return isLifecyclePathContained(paths, filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
};

// [5.2.17] cfg-registryLifecycle · Primitive · "refusalFor"
// A refusal names its registry (or slice) and throws a lifecycle error.
export const refusalFor = (subject) => (detail) => {
  throw new RegistryLifecycleError(`${subject}: ${detail}`);
};

// [5.2.17] cfg-registryLifecycle · Primitive · "readJsonFile"
// Returns `{ bytes, payload }`, or refuses with the file's label.
export const readJsonFile = (filePath, refuse, label) => {
  try {
    const bytes = fs.readFileSync(filePath);
    return { bytes, payload: JSON.parse(bytes.toString('utf8')) };
  } catch (error) {
    return refuse(`the ${label} file is unreadable: ${error.message}`);
  }
};

// [5.2.17] cfg-registryLifecycle · Derived value · "readAuthorizedBuiltin"
// The Builtin file a document authorized: contained in its slice's Builtin root, parsed, with the
// authorized digest (`expectedDigest`) and a version this engine reads.
export const readAuthorizedBuiltin = ({ slice, entry, expectedDigest, refuse, document }) => {
  const builtinPath = path.join(slice.builtinRoot, entry.fileName);
  if (!isPathInsideTarget(slice.builtinRoot, builtinPath)) {
    refuse('the Builtin file resolves outside its slice Builtin root.');
  }

  const { bytes, payload } = readJsonFile(builtinPath, refuse, 'Builtin');
  const digest = digestRegistryPayload(payload, descriptorForPayload(entry, payload));
  if (digest !== expectedDigest) {
    refuse(`the Builtin file no longer has the digest the ${document} authorized; the document is stale.`);
  }

  if (!entry.readableVersions.includes(payload.version)) {
    refuse(`Builtin version ${JSON.stringify(payload.version ?? null)} is not readable by this engine.`);
  }
  return { bytes, payload, digest };
};

// [5.2.17] cfg-registryLifecycle · Derived value · "readBoundLifecycleFile"
// A lifecycle file a document was made against: contained, an ordinary file, parsed, and with the
// document's digest for it, canonicalized with the descriptor of its own version (spec §5).
export const readBoundLifecycleFile = ({ paths, filePath, entry, expectedDigest, refuse, label, document }) => {
  if (!isContainedFile(paths, filePath)) {
    refuse(`the ${label} file is missing or resolves outside the validation target.`);
  }
  const file = readJsonFile(filePath, refuse, label);
  if (digestRegistryPayload(file.payload, descriptorForPayload(entry, file.payload)) !== expectedDigest) {
    refuse(`the ${label} file no longer has the digest the ${document} was made against; the document is stale.`);
  }
  return file;
};

// [5.2.17] cfg-registryLifecycle · Primitive · "readTrustedManifest"
export const readTrustedManifest = (paths, refuse) => {
  const { manifest, manifestError } = readRegistrySetManifest(paths);
  if (manifestError) {
    refuse(manifestError);
  }
  return manifest;
};

// [5.2.17] cfg-registryLifecycle · Primitive · "serializeRegistryPayload"
// How a command writes a payload it constructed: two-space JSON with a final newline.
export const serializeRegistryPayload = (payload) => `${JSON.stringify(payload, null, 2)}\n`;

// [5.2.17] cfg-registryLifecycle · Derived value · "introducedSliceFailures"
// The slice failures the new files introduce: validation over one scratch copy of the Custom slice,
// before and after writing every new file (`files`: file name → bytes), at the same root so failure
// details compare exactly. Only contained files are copied: nothing is read through an escaping path
// (spec §4.1), so an escaping file is absent from both runs and fails the same way in each.
export const introducedSliceFailures = ({ paths, slice, files, validateSlice = validateSliceRegistrySet }) => {
  const customSliceRoot = path.join(paths.customRoot, slice.sliceId);
  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'calculogic-registry-slice-'));
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

    const before = new Set(validateSlice(slice.sliceId, candidateRoot).map(failureKey));
    for (const [fileName, bytes] of files) {
      fs.writeFileSync(path.join(candidateRoot, fileName), bytes);
    }
    return validateSlice(slice.sliceId, candidateRoot).filter((failure) => !before.has(failureKey(failure)));
  } finally {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }
};

// [5.2.17] cfg-registryLifecycle · Derived value · "assertSliceImageValid"
// The slice's registry-set validation, run once over its final Custom image: every prepared
// registry's new Custom file in place (`files`: file name → bytes), every other registry's current
// Custom file unchanged (spec §12.5 item 4, §12.9). Nothing it does not already report for the
// current Custom slice. Only Custom files are validated: a Baseline copy is a merge base, not policy.
export const assertSliceImageValid = ({ paths, slice, files, registryIds, label, validateSlice = validateSliceRegistrySet }) => {
  const introduced = introducedSliceFailures({ paths, slice, files, validateSlice });
  if (introduced.length > 0) {
    throw new RegistryLifecycleError(
      `the ${slice.sliceId} registry-set validation fails with the ${label} registries (${registryIds.join(', ')}): ${introduced
        .map((failure) => `${failure.registryId}: ${failure.detail}`)
        .join('; ')}`,
    );
  }
};

// [5.2.17] cfg-registryLifecycle · Derived value · "manifestBytesWith"
// The manifest with the given Baseline entries replaced (`entries`: `[registryId, entry]`); every
// other entry and field unchanged, entries sorted by id.
export const manifestBytesWith = ({ manifest, entries }) => {
  const registries = { ...manifest.basedOn.registries, ...Object.fromEntries(entries) };
  return serializeRegistryPayload({
    ...manifest,
    basedOn: {
      ...manifest.basedOn,
      registries: Object.fromEntries(
        Object.keys(registries)
          .sort(compareOrdinal)
          .map((id) => [id, registries[id]]),
      ),
    },
  });
};

// [5.2.17] cfg-registryLifecycle · Primitive · "openLifecycleWrite"
// The start of every command that changes an existing Custom set: the lifecycle root and `custom/`
// are contained, then an interrupted transaction is recovered (spec §4.6 item 5). Returns the
// recovery outcome, or null.
export const openLifecycleWrite = (paths, command) => {
  for (const lifecyclePath of [paths.lifecycleRoot, paths.customRoot]) {
    if (!isLifecyclePathContained(paths, lifecyclePath)) {
      throw new RegistryLifecycleError(
        `Registry lifecycle path resolves outside the validation target (${lifecyclePath}); ${command} writes only inside the target repository.`,
      );
    }
  }
  return recoverLifecycleTransaction(paths);
};

// [5.2.17] cfg-registryLifecycle · Workflow · "applyBySlice"
// Groups the selected records by owning slice and applies each slice in one transaction:
// `prepareSlice({ slice, selections })` returns the slice's writes in commit order, or throws to
// refuse the slice before anything is written. Returns `{ applied, failed? }`, where `failed` is
// `{ sliceId, registryIds, detail }`. A simulated crash (the transaction's test seam, §4.6) stands for
// a killed process and is rethrown.
export const applyBySlice = ({ paths, slices, records, prepareSlice, onTransactionStep }) => {
  const entriesById = new Map(slices.flatMap((slice) => slice.inventory.map((entry) => [entry.registryId, { slice, entry }])));
  const selectionsBySlice = new Map();
  for (const record of [...records].sort((left, right) => compareOrdinal(left.registryId, right.registryId))) {
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
      const writes = prepareSlice({ slice, selections });
      runLifecycleTransaction({ paths, writes, onStep: onTransactionStep });
    } catch (error) {
      if (error?.[LIFECYCLE_TRANSACTION_SIMULATED_CRASH]) {
        throw error;
      }
      return { applied, failed: { sliceId, registryIds, detail: error.message } };
    }
    applied.push(...registryIds);
  }
  return { applied };
};
