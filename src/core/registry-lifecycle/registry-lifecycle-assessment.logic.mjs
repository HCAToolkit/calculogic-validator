/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.4)
 * Responsibility: Compares a Custom set with the current Builtin inventory and its Baseline.
 * Invariants: read-only; one classification per registry in the spec's precedence order; nullable
 *   status fields follow lifecycle spec §12.1; issue lists are deterministically sorted (§11.1).
 */
import fs from 'node:fs';
import path from 'node:path';
import { digestRegistryPayload, digestRegistrySet } from './registry-lifecycle-canonical-digest.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from './registry-lifecycle-inventory.knowledge.mjs';
import { validateSliceRegistrySet } from './registry-lifecycle-slice-validation.logic.mjs';
import {
  customSetExists,
  isLifecyclePathContained,
  readRegistrySetManifest,
} from './registry-lifecycle-state.logic.mjs';
import {
  BASELINE_DIRNAME,
  CUSTOM_ISSUE_CONDITIONS,
  REGISTRY_FILENAME_SUFFIX,
} from './registry-lifecycle.contracts.mjs';

const readJsonFile = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const isDirectory = (directoryPath) => {
  try {
    return fs.statSync(directoryPath).isDirectory();
  } catch {
    return false;
  }
};

// Reads one registry file and returns `{ present, payload?, digest, parseError? }`.
const readRegistryFile = (filePath, descriptor) => {
  if (!fs.existsSync(filePath)) {
    return { present: false, digest: null };
  }

  try {
    const payload = readJsonFile(filePath);
    return { present: true, payload, digest: digestRegistryPayload(payload, descriptor) };
  } catch (error) {
    return { present: true, digest: null, parseError: error.message };
  }
};

const ESCAPING_PATH_DETAIL = 'Resolves outside the validation target; the Validator does not read through it.';

// Reads one Custom-set file. A path that resolves outside the validation target is never read: it
// is reported as present but unreadable (lifecycle spec §4.1 "Containment").
const readCustomSetFile = (paths, filePath, descriptor) =>
  isLifecyclePathContained(paths, filePath)
    ? readRegistryFile(filePath, descriptor)
    : { present: true, digest: null, parseError: ESCAPING_PATH_DETAIL, escapes: true };

// [5.2.4] cfg-registryLifecycle · Primitive · "digestBuiltinRegistrySet"
export const digestBuiltinRegistrySet = ({ slices = REGISTRY_LIFECYCLE_SLICES } = {}) => {
  const digestsById = {};
  for (const slice of slices) {
    for (const entry of slice.inventory) {
      const builtin = readRegistryFile(path.join(slice.builtinRoot, entry.fileName), entry.descriptor);
      if (!builtin.present || builtin.parseError) {
        throw new Error(`Builtin registry ${entry.registryId} is missing or unreadable.`);
      }

      digestsById[entry.registryId] = builtin.digest;
    }
  }

  return digestsById;
};

// Lifecycle lists use ordinal (code-unit) order, the same order as set digests, so output never
// depends on the host locale.
const compareOrdinal = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

// Lists a Custom directory. An unreadable directory yields no entries: its registries then fail to
// read and are reported per registry, so an inactive Custom set never blocks a run (spec §7.2).
const listDirectoryEntries = (directoryPath) => {
  try {
    return fs.readdirSync(directoryPath).sort();
  } catch {
    return [];
  }
};

// Escaping directories are never listed (lifecycle spec §4.1 "Containment").
const listOrphanRegistries = ({ paths, slices }) => {
  const knownRegistryIds = new Set(
    slices.flatMap((slice) => slice.inventory.map((entry) => entry.registryId)),
  );
  const orphans = [];
  const customRoot = paths.customRoot;
  if (!isLifecyclePathContained(paths, customRoot)) {
    return orphans;
  }

  for (const sliceDirName of listDirectoryEntries(customRoot)) {
    const sliceDir = path.join(customRoot, sliceDirName);
    if (sliceDirName === BASELINE_DIRNAME || !isLifecyclePathContained(paths, sliceDir) || !isDirectory(sliceDir)) {
      continue;
    }

    for (const fileName of listDirectoryEntries(sliceDir)) {
      if (!fileName.endsWith(REGISTRY_FILENAME_SUFFIX)) {
        continue;
      }

      const registryId = `${sliceDirName}/${fileName.slice(0, -REGISTRY_FILENAME_SUFFIX.length)}`;
      if (!knownRegistryIds.has(registryId)) {
        orphans.push({ registryId, sliceId: sliceDirName, fileName, filePath: path.join(sliceDir, fileName) });
      }
    }
  }

  return orphans.sort((left, right) => compareOrdinal(left.registryId, right.registryId));
};

const describeBaselineMismatch = (baseline) => {
  if (baseline.escapes) {
    return 'The .baseline copy resolves outside the validation target.';
  }

  return baseline.present ? 'The .baseline copy does not match its manifest digest.' : 'The .baseline copy is missing.';
};

const compareIssues = (left, right) => {
  if (left.registryId !== right.registryId) {
    if (left.registryId === null) {
      return -1;
    }

    if (right.registryId === null) {
      return 1;
    }

    return compareOrdinal(left.registryId, right.registryId);
  }

  return compareOrdinal(left.condition, right.condition);
};

const classifyAgainstBaseline = ({ customDigest, builtinDigest, baselineDigest }) => {
  const customChanged = customDigest !== baselineDigest;
  const builtinChanged = builtinDigest !== baselineDigest;

  if (customChanged && builtinChanged) {
    return customDigest === builtinDigest ? 'aligned' : 'both-changed';
  }

  if (customChanged) {
    return 'custom-modified';
  }

  return builtinChanged ? 'builtin-changed' : 'unchanged';
};

const EMPTY_ASSESSMENT = Object.freeze({
  customExists: false,
  customDiffers: false,
  orphanRegistries: Object.freeze([]),
  customIssues: Object.freeze([]),
  registries: Object.freeze([]),
});

// [5.2.4] cfg-registryLifecycle · Workflow · "assessCustomRegistrySet"
export const assessCustomRegistrySet = ({ paths, slices = REGISTRY_LIFECYCLE_SLICES } = {}) => {
  const builtinDigests = digestBuiltinRegistrySet({ slices });
  if (!customSetExists(paths)) {
    return { ...EMPTY_ASSESSMENT, builtinDigests };
  }

  const { manifest, manifestError: manifestReadError } = readRegistrySetManifest(paths);
  const manifestEntries = manifest?.basedOn.registries ?? {};
  const currentEntries = slices.flatMap((slice) =>
    slice.inventory.map((entry) => ({
      slice,
      entry,
      custom: readCustomSetFile(paths, path.join(paths.customRoot, slice.sliceId, entry.fileName), entry.descriptor),
    })),
  );

  // A readable manifest must cover every Custom registry the engine reads (spec §7.1 item 5).
  const uncoveredRegistryIds = manifest
    ? currentEntries
        .filter(({ entry, custom }) => custom.present && !custom.escapes && !manifestEntries[entry.registryId])
        .map(({ entry }) => entry.registryId)
    : [];
  const manifestError =
    manifestReadError ??
    (uncoveredRegistryIds.length > 0
      ? `Registry set manifest is malformed: no basedOn entry for ${uncoveredRegistryIds.join(', ')}.`
      : undefined);
  const trustedManifestEntries = manifestError ? {} : manifestEntries;

  const sliceFailuresById = new Map();
  for (const slice of slices) {
    const customSliceRoot = path.join(paths.customRoot, slice.sliceId);
    // A slice with an escaping registry file is not validated: that file is already reported
    // unreadable, and slice validation would read through it.
    const sliceHasEscapingFile = currentEntries.some(
      (current) => current.slice.sliceId === slice.sliceId && current.custom.escapes,
    );
    if (sliceHasEscapingFile || !isDirectory(customSliceRoot)) {
      continue;
    }

    for (const failure of validateSliceRegistrySet(slice.sliceId, customSliceRoot)) {
      if (!sliceFailuresById.has(failure.registryId)) {
        sliceFailuresById.set(failure.registryId, failure.detail);
      }
    }
  }

  const registries = [];
  const customIssues = [];
  const customDigests = {};

  for (const { slice, entry, custom } of currentEntries) {
    const registryId = entry.registryId;
    const builtinDigest = builtinDigests[registryId];
    const manifestEntry = trustedManifestEntries[registryId];
    const baselineDigest = manifestEntry ? manifestEntry.digest : null;
    let baselineMismatch = null;

    if (manifestEntry) {
      const baseline = readCustomSetFile(
        paths,
        path.join(paths.baselineRoot, slice.sliceId, entry.fileName),
        entry.descriptor,
      );
      baselineMismatch = baseline.digest !== manifestEntry.digest;
      if (baselineMismatch) {
        customIssues.push({
          registryId,
          condition: CUSTOM_ISSUE_CONDITIONS.baselineMismatch,
          detail: describeBaselineMismatch(baseline),
        });
      }
    }

    customDigests[registryId] = custom.digest;
    const statusEntry = {
      registryId,
      classification: null,
      customDigest: custom.digest,
      builtinDigest,
      baselineDigest,
      baselineMismatch,
    };

    const invalidDetail = custom.parseError ?? sliceFailuresById.get(registryId);
    const version = custom.payload?.version;

    if (!custom.present) {
      statusEntry.classification = 'missing';
      customIssues.push({ registryId, condition: CUSTOM_ISSUE_CONDITIONS.missing, detail: 'Absent from the Custom set.' });
    } else if (invalidDetail) {
      statusEntry.classification = 'invalid';
      statusEntry.detail = invalidDetail;
      customIssues.push({ registryId, condition: CUSTOM_ISSUE_CONDITIONS.invalid, detail: invalidDetail });
    } else if (!entry.readableVersions.includes(version)) {
      statusEntry.classification = 'version-incompatible';
      statusEntry.detail = `Version ${JSON.stringify(version ?? null)} is not readable; readable versions: ${entry.readableVersions.join(', ')}.`;
      customIssues.push({
        registryId,
        condition: CUSTOM_ISSUE_CONDITIONS.versionIncompatible,
        detail: statusEntry.detail,
      });
    } else if (manifestError || baselineDigest === null) {
      statusEntry.classification = 'baseline-unavailable';
    } else {
      statusEntry.classification = classifyAgainstBaseline({
        customDigest: custom.digest,
        builtinDigest,
        baselineDigest,
      });
    }

    registries.push(statusEntry);
  }

  // An orphan is canonicalized with its slice's retired descriptor. Without one this release cannot
  // reproduce its digests, so they are null and its Baseline copy is unverifiable, never a mismatch
  // (lifecycle spec §12.1 "Retired descriptors").
  const retiredDescriptorsById = new Map(
    slices.flatMap((slice) => (slice.retiredInventory ?? []).map((retired) => [retired.registryId, retired.descriptor])),
  );
  const orphanRegistries = listOrphanRegistries({ paths, slices });
  for (const orphan of orphanRegistries) {
    const retiredDescriptor = retiredDescriptorsById.get(orphan.registryId);
    const orphanFile = readCustomSetFile(paths, orphan.filePath, retiredDescriptor ?? {});
    const manifestEntry = trustedManifestEntries[orphan.registryId];
    let baselineMismatch = null;
    if (manifestEntry && retiredDescriptor) {
      const baseline = readCustomSetFile(
        paths,
        path.join(paths.baselineRoot, orphan.sliceId, orphan.fileName),
        retiredDescriptor,
      );
      baselineMismatch = baseline.digest !== manifestEntry.digest;
      if (baselineMismatch) {
        customIssues.push({
          registryId: orphan.registryId,
          condition: CUSTOM_ISSUE_CONDITIONS.baselineMismatch,
          detail: describeBaselineMismatch(baseline),
        });
      }
    }

    registries.push({
      registryId: orphan.registryId,
      classification: 'orphan',
      customDigest: retiredDescriptor ? orphanFile.digest : null,
      builtinDigest: null,
      baselineDigest: manifestEntry ? manifestEntry.digest : null,
      baselineMismatch,
      ...(orphanFile.parseError ? { detail: orphanFile.parseError } : {}),
    });
  }

  if (manifestError) {
    customIssues.push({
      registryId: null,
      condition: CUSTOM_ISSUE_CONDITIONS.manifestMalformed,
      detail: manifestError,
    });
  }

  const customDiffers =
    orphanRegistries.length > 0 ||
    currentEntries.some(
      ({ entry, custom }) => !custom.present || custom.digest === null || custom.digest !== builtinDigests[entry.registryId],
    );

  const assessment = {
    customExists: true,
    customDiffers,
    orphanRegistries: orphanRegistries.map((orphan) => orphan.registryId),
    customIssues: customIssues.sort(compareIssues),
    registries: registries.sort((left, right) => compareOrdinal(left.registryId, right.registryId)),
    builtinDigests,
    customDigests,
  };

  if (manifestError) {
    return { ...assessment, manifestError };
  }

  const baselineEntries = Object.values(manifestEntries);
  return {
    ...assessment,
    basedOn: {
      builtinSetDigest: digestRegistrySet(
        Object.fromEntries(Object.entries(manifestEntries).map(([registryId, item]) => [registryId, item.digest])),
      ),
      validatorVersions: [...new Set(baselineEntries.map((item) => item.validatorVersion))].sort(),
    },
    // Builtin drifted when a shared registry's digest changed, or when the current inventory and the
    // Baseline list different registries (one added or removed by a later release).
    builtinDriftSinceBaseline:
      currentEntries.some(
        ({ entry }) => manifestEntries[entry.registryId]?.digest !== builtinDigests[entry.registryId],
      ) || Object.keys(manifestEntries).some((registryId) => !(registryId in builtinDigests)),
  };
};
