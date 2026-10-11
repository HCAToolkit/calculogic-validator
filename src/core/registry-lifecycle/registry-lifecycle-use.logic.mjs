/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.7)
 * Responsibility: Sets the active registry set (`use builtin` | `use custom`).
 * Invariants: `use` is the only operation that changes the active set; `use custom` refuses on any
 *   blocking condition of the Custom set; `use builtin` needs no check; it writes only
 *   `registry-state.json`, never `custom/`; an escaping lifecycle root or state file is refused
 *   before anything is written (lifecycle spec §4.1, §7.1, §12.1).
 */
import fs from 'node:fs';
import path from 'node:path';
import { assessCustomRegistrySet } from './registry-lifecycle-assessment.logic.mjs';
import { REGISTRY_LIFECYCLE_SLICES } from './registry-lifecycle-inventory.knowledge.mjs';
import { createCustomSetBlockedError, findCustomSetBlockers } from './registry-lifecycle-resolution.logic.mjs';
import {
  RegistryLifecycleError,
  assertLifecycleStateContained,
  readRegistryLifecycleState,
  resolveRegistryLifecyclePaths,
} from './registry-lifecycle-state.logic.mjs';
import {
  ACTIVE_SET_CUSTOM,
  ACTIVE_SET_VALUES,
  REGISTRY_STATE_SCHEMA_VERSION,
} from './registry-lifecycle.contracts.mjs';

// [5.2.7] cfg-registryLifecycle · Primitive · "readPreviousActiveSet"
// The current selection, or `null` when the state file is contained but malformed: `use` replaces
// a malformed state file, so it is also the way to repair one.
const readPreviousActiveSet = (paths) => {
  try {
    return readRegistryLifecycleState(paths);
  } catch (error) {
    if (error instanceof RegistryLifecycleError) {
      return { activeSet: null, stateFileExists: true };
    }

    throw error;
  }
};

// [5.2.7] cfg-registryLifecycle · Primitive · "writeRegistryStateFile"
// Written through a temporary file in the lifecycle root and renamed into place, so a reader never
// sees a partial state file.
const writeRegistryStateFile = (paths, activeSet) => {
  fs.mkdirSync(paths.lifecycleRoot, { recursive: true });
  const temporaryPath = path.join(paths.lifecycleRoot, `.registry-state-${process.pid}-${Date.now()}.json`);
  try {
    fs.writeFileSync(
      temporaryPath,
      `${JSON.stringify({ schemaVersion: REGISTRY_STATE_SCHEMA_VERSION, activeSet }, null, 2)}\n`,
    );
    fs.renameSync(temporaryPath, paths.statePath);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
};

// [5.2.7] cfg-registryLifecycle · Workflow · "useRegistrySet"
// Returns `{ activeSet, previousActiveSet, stateFileCreated }`.
export const useRegistrySet = ({
  targetRoot,
  lifecycleRootOverride,
  activeSet,
  slices = REGISTRY_LIFECYCLE_SLICES,
} = {}) => {
  if (!ACTIVE_SET_VALUES.includes(activeSet)) {
    throw new Error(`The active set must be one of ${ACTIVE_SET_VALUES.join(', ')}.`);
  }

  const paths = resolveRegistryLifecyclePaths({ targetRoot, lifecycleRootOverride });
  assertLifecycleStateContained(paths);
  const previous = readPreviousActiveSet(paths);

  if (activeSet === ACTIVE_SET_CUSTOM) {
    const blockers = findCustomSetBlockers(assessCustomRegistrySet({ paths, slices }));
    if (blockers.length > 0) {
      throw createCustomSetBlockedError({ paths, blockers, action: 'use custom refused' });
    }
  }

  writeRegistryStateFile(paths, activeSet);

  return {
    activeSet,
    previousActiveSet: previous.activeSet,
    stateFileCreated: !previous.stateFileExists,
  };
};
