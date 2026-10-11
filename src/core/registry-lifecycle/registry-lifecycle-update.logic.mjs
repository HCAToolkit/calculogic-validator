/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.12)
 * Responsibility: `update` (lifecycle spec §12.5): applies a checked decisions document. This
 *   slice applies `registry-added` inheritance only.
 * Invariants: the decisions document is the only authority; nothing is inferred from `null`; each
 *   registry is prepared and checked completely before its transaction, and advances atomically
 *   through it (§4.6); `registry-state.json` is never read or written; no other registry changes.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isPathInsideTarget } from '../target-path-containment.logic.mjs';
import { digestRegistryPayload } from './registry-lifecycle-canonical-digest.logic.mjs';
import { checkRegistryUpdateDecisions } from './registry-lifecycle-decisions.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from './registry-lifecycle-inventory.knowledge.mjs';
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
import { UPDATE_SKIP_REASONS } from './registry-lifecycle.contracts.mjs';

const compareOrdinal = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

const failureKey = (failure) => `${failure.registryId}\u0000${failure.detail}`;

const isContainedFile = (paths, filePath) => {
  try {
    return isLifecyclePathContained(paths, filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
};

// The slice failures the new file introduces: validation over a scratch copy of the Custom slice,
// before and after adding the file, at the same root so failure details compare exactly. Only
// contained files are copied: nothing is read through an escaping path (spec §4.1), so an escaping
// file is absent from both runs and fails the same way in each.
const newSliceFailures = ({ paths, slice, customSliceRoot, fileName, bytes }) => {
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
    fs.writeFileSync(path.join(candidateRoot, fileName), bytes);
    return validateSliceRegistrySet(slice.sliceId, candidateRoot).filter((failure) => !before.has(failureKey(failure)));
  } finally {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }
};

// [5.2.12] cfg-registryLifecycle · Derived value · "prepareRegistryInheritance"
// Everything spec §12.5 item 4 requires, checked before anything is written. Returns the
// transaction's writes in commit order (§12.5 item 5).
const prepareRegistryInheritance = ({ paths, slice, entry, record, validatorVersion }) => {
  const registryId = entry.registryId;
  const refuse = (detail) => {
    throw new RegistryLifecycleError(`${registryId}: ${detail}`);
  };

  const builtinPath = path.join(slice.builtinRoot, entry.fileName);
  if (!isPathInsideTarget(slice.builtinRoot, builtinPath)) {
    refuse('the Builtin file resolves outside its slice Builtin root.');
  }

  let bytes;
  let payload;
  try {
    bytes = fs.readFileSync(builtinPath);
    payload = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    refuse(`the Builtin file is unreadable: ${error.message}`);
  }

  const digest = digestRegistryPayload(payload, entry.descriptor);
  if (digest !== record.basedOn.builtinDigest) {
    refuse('the Builtin file no longer has the digest the decisions document authorized; the document is stale.');
  }

  if (!entry.readableVersions.includes(payload.version)) {
    refuse(`Builtin version ${JSON.stringify(payload.version ?? null)} is not readable by this engine.`);
  }

  const customSliceRoot = path.join(paths.customRoot, slice.sliceId);
  const customPath = path.join(customSliceRoot, entry.fileName);
  if (fs.existsSync(customPath)) {
    refuse('Custom already has this registry; the document is stale.');
  }

  const { manifest, manifestError } = readRegistrySetManifest(paths);
  if (manifestError) {
    refuse(manifestError);
  }
  if (Object.hasOwn(manifest.basedOn.registries, registryId)) {
    refuse('the manifest already has a Baseline entry for this registry; the document is stale.');
  }

  const introduced = newSliceFailures({ paths, slice, customSliceRoot, fileName: entry.fileName, bytes });
  if (introduced.length > 0) {
    refuse(
      `the ${slice.sliceId} registry-set validation fails with the inherited file: ${introduced
        .map((failure) => `${failure.registryId}: ${failure.detail}`)
        .join('; ')}`,
    );
  }

  const registries = { ...manifest.basedOn.registries, [registryId]: { validatorVersion, version: payload.version, digest } };
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

  return [
    { targetPath: path.join(paths.baselineRoot, slice.sliceId, entry.fileName), contents: bytes },
    { targetPath: customPath, contents: bytes },
    { targetPath: paths.manifestPath, contents: `${JSON.stringify(nextManifest, null, 2)}\n` },
  ];
};

// The records this slice applies, and why each other record is skipped (spec §12.5 item 3).
const selectRecords = (document) => {
  const apply = [];
  const skipped = [];
  for (const record of [...document.registries].sort((left, right) => compareOrdinal(left.registryId, right.registryId))) {
    const decisions = record.class === 'registry-added' ? [record.decision] : record.entries.map((entry) => entry.decision);
    if (decisions.includes(null)) {
      skipped.push({ registryId: record.registryId, reason: UPDATE_SKIP_REASONS.undecided });
    } else if (record.class === 'registry-added' && record.decision === 'inherit') {
      apply.push(record);
    } else {
      skipped.push({ registryId: record.registryId, reason: UPDATE_SKIP_REASONS.notYetSupported });
    }
  }
  return { apply, skipped };
};

// [5.2.12] cfg-registryLifecycle · Workflow · "applyRegistryUpdateDecisions"
// Returns `{ recovered?, applied, skipped, failed? }`, or `{ recovered?, applied: [], problems }`
// for a document that is not valid. `onTransactionStep` is the transaction's internal test seam.
export const applyRegistryUpdateDecisions = ({
  document,
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

  const check = checkRegistryUpdateDecisions({ document, targetRoot, lifecycleRootOverride, slices });
  if (!check.valid) {
    return withRecovered({ applied: [], problems: check.problems });
  }

  const entriesById = new Map(
    slices.flatMap((slice) => slice.inventory.map((entry) => [entry.registryId, { slice, entry }])),
  );
  const { apply, skipped } = selectRecords(document);
  const applied = [];
  for (const record of apply) {
    const { slice, entry } = entriesById.get(record.registryId);
    try {
      const writes = prepareRegistryInheritance({ paths, slice, entry, record, validatorVersion });
      runLifecycleTransaction({ paths, writes, onStep: onTransactionStep });
    } catch (error) {
      // A simulated crash stands for a killed process, which reports nothing (test seam, §4.6).
      if (error?.[LIFECYCLE_TRANSACTION_SIMULATED_CRASH]) {
        throw error;
      }
      return withRecovered({ applied, skipped, failed: { registryId: record.registryId, detail: error.message } });
    }
    applied.push(record.registryId);
  }

  return withRecovered({ applied, skipped });
};
