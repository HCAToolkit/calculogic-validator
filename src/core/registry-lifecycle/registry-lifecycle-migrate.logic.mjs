/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.18)
 * Responsibility: `migrate` (lifecycle spec §12.9): applies the accepted records of a checked
 *   migration plan (§12.8), writing the migrated Baseline B0′, the migrated Custom C0′ and the
 *   manifest entry with its migration provenance (§4.3).
 * Invariants: the plan is the only authority and only `"accept"` selects a record; B0′ and C0′ are
 *   recomputed from the authorized files by the slice-owned transforms, never copied from the
 *   plan's preview and never derived from Builtin, and must have the plan's result digests; the
 *   slice is the unit of application, validated once over its final Custom image (C0′, never B0′);
 *   `validatorVersion` is kept and provenance is appended; `registry-state.json` is never read or
 *   written.
 */
import path from 'node:path';
import { digestRegistryPayload } from './registry-lifecycle-canonical-digest.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from './registry-lifecycle-inventory.knowledge.mjs';
import { checkRegistryMigrationPlan } from './registry-lifecycle-migration-plan.logic.mjs';
import { descriptorForPayload, migrateRegistryPayload, migrationPath } from './registry-lifecycle-migration.logic.mjs';
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
import { validateSliceRegistrySet } from './registry-lifecycle-slice-validation.logic.mjs';
import { SLICE_MIGRATION_TRANSFORMS } from './registry-lifecycle-slice-migrations.logic.mjs';
import { RegistryLifecycleError, resolveRegistryLifecyclePaths } from './registry-lifecycle-state.logic.mjs';
import { MIGRATE_SKIP_REASONS, MIGRATION_PLAN_DECISIONS } from './registry-lifecycle.contracts.mjs';

const DOCUMENT = 'migration plan';

const compareOrdinal = (left, right) => (left === right ? 0 : left < right ? -1 : 1);

const transformsOf = (migrationTransforms, sliceId) =>
  Object.hasOwn(migrationTransforms, sliceId) ? migrationTransforms[sliceId] : {};

// [5.2.18] cfg-registryLifecycle · Derived value · "migratedManifestEntry"
// The manifest entry of a migrated Baseline (spec §4.3): the previous `validatorVersion`, the target
// `version`, B0′'s digest, and the provenance, appended to an earlier migration's.
export const migratedManifestEntry = ({ previous, toVersion, digest, path: steps }) => ({
  validatorVersion: previous.validatorVersion,
  version: toVersion,
  digest,
  migration: {
    fromVersion: previous.migration?.fromVersion ?? previous.version,
    fromDigest: previous.migration?.fromDigest ?? previous.digest,
    path: [...(previous.migration?.path ?? []), ...steps.map((step) => step.transform)],
  },
});

// [5.2.18] cfg-registryLifecycle · Derived value · "prepareRegistryMigration"
// One accepted record, checked just before (spec §12.9 item 2) and bound again here: its manifest
// entry and files are the ones the plan was made against, and the transforms, run again over the
// authorized Baseline copy and Custom file, produce the plan's result digests (§12.9 item 4).
const prepareRegistryMigration = ({ paths, manifest, slice, entry, record, transforms }) => {
  const refuse = refusalFor(entry.registryId);
  const previous = Object.hasOwn(manifest.basedOn.registries, entry.registryId) ? manifest.basedOn.registries[entry.registryId] : null;
  if (previous?.digest !== record.basedOn.baselineDigest || previous.version !== record.fromVersion) {
    refuse('the manifest Baseline entry is not the one the migration plan was made against; the document is stale.');
  }

  // The three files are bound by digest to the bytes the check verified, versions included.
  readAuthorizedBuiltin({ slice, entry, expectedDigest: record.basedOn.builtinDigest, refuse, document: DOCUMENT });

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

  // The check matched the declared path to the record's; the inventory does not change in a run.
  const steps = migrationPath(entry, record.fromVersion, record.toVersion);

  const migrated = {};
  for (const [key, input, label] of [
    ['baseline', baseline.payload, 'Baseline'],
    ['custom', custom.payload, 'Custom'],
  ]) {
    const result = migrateRegistryPayload({ entry, path: steps, transforms, payload: input, label });
    if (result.failure) {
      refuse(result.failure);
    }
    const digest = digestRegistryPayload(result.payload, descriptorForPayload(entry, result.payload));
    if (digest !== record.result[`${key}Digest`]) {
      refuse(`the migrated ${label} payload does not have the digest the migration plan accepted; the document is stale.`);
    }
    migrated[key] = { bytes: serializeRegistryPayload(result.payload), digest };
  }

  return {
    registryId: entry.registryId,
    fileName: entry.fileName,
    baselineWrite: { targetPath: baselinePath, contents: migrated.baseline.bytes },
    customWrite: { targetPath: customPath, contents: migrated.custom.bytes },
    manifestEntry: migratedManifestEntry({ previous, toVersion: record.toVersion, digest: migrated.baseline.digest, path: steps }),
  };
};

// [5.2.18] cfg-registryLifecycle · Derived value · "prepareSliceMigration"
// Every accepted record of one slice, prepared against one manifest read, then the slice's final
// Custom image (every C0′ in place, every other Custom file unchanged) validated once. Returns the
// slice's writes in commit order: every B0′, every C0′, then the manifest once (spec §12.9 item 5).
const prepareSliceMigration = ({ paths, slice, selections, transforms, validateSlice }) => {
  const manifest = readTrustedManifest(paths, refusalFor(slice.sliceId));
  const prepared = selections.map(({ entry, record }) =>
    prepareRegistryMigration({ paths, manifest, slice, entry, record, transforms }),
  );
  assertSliceImageValid({
    paths,
    slice,
    files: prepared.map(({ fileName, customWrite }) => [fileName, customWrite.contents]),
    registryIds: prepared.map(({ registryId }) => registryId),
    label: 'migrated',
    validateSlice,
  });
  return [
    ...prepared.map(({ baselineWrite }) => baselineWrite),
    ...prepared.map(({ customWrite }) => customWrite),
    {
      targetPath: paths.manifestPath,
      contents: manifestBytesWith({ manifest, entries: prepared.map(({ registryId, manifestEntry }) => [registryId, manifestEntry]) }),
    },
  ];
};

// [5.2.18] cfg-registryLifecycle · Workflow · "applyRegistryMigrationPlan"
// Returns `{ recovered?, applied, skipped, failed? }`, or `{ recovered?, applied: [], problems }` for
// a plan that is not valid. The plan is read through `loadDocument`, only after recovery (spec
// §12.9 item 1). `migrationTransforms` defaults to the slices' own; `validateSlice` and
// `onTransactionStep` are internal test seams.
export const applyRegistryMigrationPlan = ({
  loadDocument,
  targetRoot,
  lifecycleRootOverride,
  slices = REGISTRY_LIFECYCLE_SLICES,
  migrationTransforms = SLICE_MIGRATION_TRANSFORMS,
  validateSlice = validateSliceRegistrySet,
  onTransactionStep,
} = {}) => {
  const paths = resolveRegistryLifecyclePaths({ targetRoot, lifecycleRootOverride });
  const recovered = openLifecycleWrite(paths, 'migrate');
  const withRecovered = (result) => (recovered ? { recovered, ...result } : result);

  let document;
  try {
    document = loadDocument();
  } catch (error) {
    const recoveryNote = recovered ? ` An interrupted transaction was recovered first (${recovered.outcome}).` : '';
    throw new RegistryLifecycleError(`Cannot read the migration plan: ${error.message}.${recoveryNote}`);
  }

  const check = checkRegistryMigrationPlan({ document, targetRoot, lifecycleRootOverride, slices, migrationTransforms });
  if (!check.valid) {
    return withRecovered({ applied: [], problems: check.problems });
  }

  // Only "accept" selects a record; nothing is inferred from null (spec §12.9 item 3).
  const records = [...document.registries].sort((left, right) => compareOrdinal(left.registryId, right.registryId));
  const accepted = records.filter((record) => record.decision === MIGRATION_PLAN_DECISIONS.accept);
  const skipped = records
    .filter((record) => record.decision !== MIGRATION_PLAN_DECISIONS.accept)
    .map((record) => ({ registryId: record.registryId, reason: MIGRATE_SKIP_REASONS.undecided }));

  const result = applyBySlice({
    paths,
    slices,
    records: accepted,
    prepareSlice: ({ slice, selections }) =>
      prepareSliceMigration({
        paths,
        slice,
        selections,
        transforms: transformsOf(migrationTransforms, slice.sliceId),
        validateSlice,
      }),
    onTransactionStep,
  });
  return withRecovered({ ...result, skipped });
};
