/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.6)
 * Responsibility: Creates a complete Custom set, its Baseline copy and its manifest from Builtin.
 * Invariants: refuses when `custom/` exists, a lifecycle transaction is pending or the state selects
 *   `custom` (one condition list, shared with `import`); copies every inventory registry byte for
 *   byte; never changes the active set (writes the state file only when absent, with `builtin`),
 *   and never creates a set the state already selects; builds the
 *   set in a temporary directory and renames it into place; writes only inside the validation
 *   target (lifecycle spec §4, §4.1 "Containment", §12.1).
 */
import fs from 'node:fs';
import path from 'node:path';
import { digestRegistryPayload } from './registry-lifecycle-canonical-digest.logic.mjs';
import { descriptorForPayload } from './registry-lifecycle-migration.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from './registry-lifecycle-inventory.knowledge.mjs';
import { lifecycleTransactionPending } from './registry-lifecycle-transaction.logic.mjs';
import {
  RegistryLifecycleError,
  customSetExists,
  isLifecyclePathContained,
  readRegistryLifecycleState,
  resolveRegistryLifecyclePaths,
} from './registry-lifecycle-state.logic.mjs';
import {
  ACTIVE_SET_BUILTIN,
  ACTIVE_SET_CUSTOM,
  BASELINE_DIRNAME,
  NEW_CUSTOM_SET_CONDITIONS,
  REGISTRY_SET_MANIFEST_FILENAME,
  REGISTRY_SET_MANIFEST_SCHEMA_VERSION,
  REGISTRY_STATE_SCHEMA_VERSION,
} from './registry-lifecycle.contracts.mjs';

const writeJsonFile = (filePath, value) => {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

// [5.2.6] cfg-registryLifecycle · Primitive · "findNewCustomSetConditions"
// The one list of repository conditions that refuse creating a new Custom set (`init-custom`,
// `import`), in order. The state file must be readable and contained, and `custom/` contained, or
// it throws. Read-only. Returns `{ state, conditions }`.
export const findNewCustomSetConditions = ({ paths, command }) => {
  const state = readRegistryLifecycleState(paths);
  if (!isLifecyclePathContained(paths, paths.customRoot)) {
    throw new RegistryLifecycleError(
      `The Custom set path resolves outside the validation target (${paths.customRoot}). ${command} writes only inside the target repository.`,
    );
  }

  const conditions = [
    ...(customSetExists(paths) ? [NEW_CUSTOM_SET_CONDITIONS.customSetExists] : []),
    // A pending transaction journals Custom paths; a new set at those paths would be what its
    // recovery restores or removes (spec §4.6 item 5).
    ...(lifecycleTransactionPending(paths) ? [NEW_CUSTOM_SET_CONDITIONS.transactionPending] : []),
    // A state selecting `custom` names a set that does not exist yet; a set created under it would
    // be used by the next run without `use custom` checking it (spec §12.1).
    ...(state.activeSet === ACTIVE_SET_CUSTOM ? [NEW_CUSTOM_SET_CONDITIONS.customSelected] : []),
  ];
  return { state, conditions };
};

const newCustomSetRefusal = (condition, { paths, command }) => {
  switch (condition) {
    case NEW_CUSTOM_SET_CONDITIONS.customSetExists:
      return `A Custom registry set already exists (${paths.customRoot}). ${command} never overwrites it.`;
    case NEW_CUSTOM_SET_CONDITIONS.transactionPending:
      return `An interrupted lifecycle transaction is pending (${paths.lifecycleRoot}). ${command} refuses until it is recovered: the next update, migrate or edit recovers it before anything else.`;
    default:
      return `registry-state.json selects custom (${paths.statePath}), so a new Custom set would be used by the next run without \`use custom\` checking it. Run \`use builtin\` first, then ${command}, then \`use custom\` to activate the set.`;
  }
};

// [5.2.6] cfg-registryLifecycle · Primitive · "assertNewCustomSetAllowed"
// Refuses, before anything is written (spec §4.1), on the first condition that refuses a new Custom
// set. Returns the state (`activeSet`, `stateFileExists`).
export const assertNewCustomSetAllowed = ({ paths, command }) => {
  const { state, conditions } = findNewCustomSetConditions({ paths, command });
  if (conditions.length > 0) {
    throw new RegistryLifecycleError(newCustomSetRefusal(conditions[0], { paths, command }), {
      conditions: conditions.map((condition) => ({ condition })),
    });
  }
  return state;
};

// [5.2.6] cfg-registryLifecycle · Primitive · "installNewCustomSet"
// Creates `custom/` whole (spec §4.6): `populate(stagingRoot)` fills a staging directory inside the
// lifecycle root, on the same filesystem, which is then renamed into place. On any failure the
// staging directory is removed and no `custom/` is left.
export const installNewCustomSet = ({ paths, stagingPrefix, populate }) => {
  fs.mkdirSync(paths.lifecycleRoot, { recursive: true });
  const stagingRoot = fs.mkdtempSync(path.join(paths.lifecycleRoot, stagingPrefix));
  try {
    const result = populate(stagingRoot);
    fs.renameSync(stagingRoot, paths.customRoot);
    return result;
  } catch (error) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    throw error;
  }
};

// [5.2.6] cfg-registryLifecycle · Workflow · "initCustomRegistrySet"
export const initCustomRegistrySet = ({
  targetRoot,
  lifecycleRootOverride,
  validatorVersion,
  slices = REGISTRY_LIFECYCLE_SLICES,
} = {}) => {
  if (typeof validatorVersion !== 'string' || validatorVersion.length === 0) {
    throw new Error('initCustomRegistrySet needs the Validator version for the Baseline.');
  }

  const paths = resolveRegistryLifecyclePaths({ targetRoot, lifecycleRootOverride });
  const { stateFileExists } = assertNewCustomSetAllowed({ paths, command: 'init-custom' });
  const manifestRegistries = {};

  // Every registry is copied byte for byte into Custom and its Baseline copy.
  const populate = (stagingRoot) => {
    for (const slice of slices) {
      const customSliceRoot = path.join(stagingRoot, slice.sliceId);
      const baselineSliceRoot = path.join(stagingRoot, BASELINE_DIRNAME, slice.sliceId);
      fs.mkdirSync(customSliceRoot, { recursive: true });
      fs.mkdirSync(baselineSliceRoot, { recursive: true });

      for (const entry of slice.inventory) {
        const builtinPath = path.join(slice.builtinRoot, entry.fileName);
        const builtinBytes = fs.readFileSync(builtinPath);
        const builtinPayload = JSON.parse(builtinBytes.toString('utf8'));
        fs.writeFileSync(path.join(customSliceRoot, entry.fileName), builtinBytes);
        fs.writeFileSync(path.join(baselineSliceRoot, entry.fileName), builtinBytes);
        manifestRegistries[entry.registryId] = {
          validatorVersion,
          version: builtinPayload.version,
          digest: digestRegistryPayload(builtinPayload, descriptorForPayload(entry, builtinPayload)),
        };
      }
    }

    writeJsonFile(path.join(stagingRoot, REGISTRY_SET_MANIFEST_FILENAME), {
      schemaVersion: REGISTRY_SET_MANIFEST_SCHEMA_VERSION,
      basedOn: {
        registries: Object.fromEntries(
          Object.keys(manifestRegistries)
            .sort()
            .map((registryId) => [registryId, manifestRegistries[registryId]]),
        ),
      },
    });
  };
  installNewCustomSet({ paths, stagingPrefix: '.custom-init-', populate });

  if (!stateFileExists) {
    writeJsonFile(paths.statePath, {
      schemaVersion: REGISTRY_STATE_SCHEMA_VERSION,
      activeSet: ACTIVE_SET_BUILTIN,
    });
  }

  return {
    customRoot: paths.customRoot,
    registryCount: Object.keys(manifestRegistries).length,
    stateFileCreated: !stateFileExists,
  };
};
