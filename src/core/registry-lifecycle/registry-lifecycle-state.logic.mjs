/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.2.1)
 * Responsibility: Lifecycle paths, the local active-set state and the Custom set manifest.
 * Invariants: reads only; an absent state file means `builtin`; a malformed state file is a
 *   lifecycle error; manifest problems are returned, never thrown, so callers decide whether
 *   they block (lifecycle spec §4, §7).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ACTIVE_SET_BUILTIN,
  ACTIVE_SET_VALUES,
  BASELINE_DIRNAME,
  CUSTOM_SET_DIRNAME,
  REGISTRY_LIFECYCLE_ERROR_CODE,
  REGISTRY_LIFECYCLE_ROOT_SEGMENTS,
  REGISTRY_SET_MANIFEST_FILENAME,
  REGISTRY_SET_MANIFEST_SCHEMA_VERSION,
  REGISTRY_STATE_FILENAME,
  REGISTRY_STATE_SCHEMA_VERSION,
} from './registry-lifecycle.contracts.mjs';

// [5.2.1] cfg-registryLifecycle · Primitive · "RegistryLifecycleError"
export class RegistryLifecycleError extends Error {
  constructor(message, { conditions = [] } = {}) {
    super(message);
    this.name = 'RegistryLifecycleError';
    this.code = REGISTRY_LIFECYCLE_ERROR_CODE;
    this.conditions = conditions;
  }
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// [5.2.1] cfg-registryLifecycle · Primitive · "resolveRegistryLifecyclePaths"
// `lifecycleRootOverride` is an internal parameter for tests and package development only; it is
// never consumer configuration (lifecycle spec §4.1).
export const resolveRegistryLifecyclePaths = ({ targetRoot, lifecycleRootOverride } = {}) => {
  if (!lifecycleRootOverride && !targetRoot) {
    throw new Error('Registry lifecycle paths need a validation target root.');
  }

  const lifecycleRoot = path.resolve(
    lifecycleRootOverride ?? path.join(targetRoot, ...REGISTRY_LIFECYCLE_ROOT_SEGMENTS),
  );
  const customRoot = path.join(lifecycleRoot, CUSTOM_SET_DIRNAME);

  return {
    // Every lifecycle path must resolve inside this root (lifecycle spec §4.1 "Containment").
    containmentRoot: lifecycleRootOverride ? lifecycleRoot : path.resolve(targetRoot),
    lifecycleRoot,
    statePath: path.join(lifecycleRoot, REGISTRY_STATE_FILENAME),
    customRoot,
    manifestPath: path.join(customRoot, REGISTRY_SET_MANIFEST_FILENAME),
    baselineRoot: path.join(customRoot, BASELINE_DIRNAME),
  };
};

// Resolves a path through symlinks. A path that does not exist yet resolves through its nearest
// existing ancestor; a dangling symlink cannot be resolved and yields null.
const resolveRealPath = (candidatePath) => {
  try {
    return fs.realpathSync(candidatePath);
  } catch {
    let isLink = false;
    try {
      isLink = fs.lstatSync(candidatePath).isSymbolicLink();
    } catch {
      // Absent: resolve through the parent below.
    }

    const parentPath = path.dirname(candidatePath);
    if (isLink || parentPath === candidatePath) {
      return null;
    }

    const realParent = resolveRealPath(parentPath);
    return realParent === null ? null : path.join(realParent, path.basename(candidatePath));
  }
};

// [5.2.1] cfg-registryLifecycle · Primitive · "isLifecyclePathContained"
// True when `candidatePath` resolves by realpath inside the containment root: internal symlinks
// are allowed, escaping or unresolvable ones are not (lifecycle spec §4.1 "Containment").
export const isLifecyclePathContained = (paths, candidatePath) => {
  const realRoot = resolveRealPath(paths.containmentRoot);
  const realCandidate = resolveRealPath(candidatePath);
  if (realRoot === null || realCandidate === null) {
    return false;
  }

  const relativePath = path.relative(realRoot, realCandidate);
  return (
    relativePath === '' ||
    (relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath))
  );
};

// [5.2.1] cfg-registryLifecycle · Primitive · "assertLifecycleStateContained"
// An escaping lifecycle root or state file is unreadable state: it blocks every run and every
// lifecycle command (lifecycle spec §4.1, §7.1 item 5).
export const assertLifecycleStateContained = (paths) => {
  for (const lifecyclePath of [paths.lifecycleRoot, paths.statePath]) {
    if (!isLifecyclePathContained(paths, lifecyclePath)) {
      throw new RegistryLifecycleError(
        [
          `Registry lifecycle path resolves outside the validation target (${lifecyclePath}).`,
          'Lifecycle files must live inside the target repository; a symlink may not lead outside it.',
          'Replace the symlink with a copy of the registry set owned by this repository.',
        ].join(' '),
      );
    }
  }
};

// [5.2.1] cfg-registryLifecycle · Primitive · "readRegistryLifecycleState"
export const readRegistryLifecycleState = (paths) => {
  assertLifecycleStateContained(paths);
  if (!fs.existsSync(paths.statePath)) {
    return { activeSet: ACTIVE_SET_BUILTIN, stateFileExists: false };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(paths.statePath, 'utf8'));
  } catch (error) {
    throw new RegistryLifecycleError(
      `Registry lifecycle state is unreadable (${paths.statePath}): ${error.message}`,
    );
  }

  if (!isPlainObject(parsed) || parsed.schemaVersion !== REGISTRY_STATE_SCHEMA_VERSION) {
    throw new RegistryLifecycleError(
      `Registry lifecycle state is malformed (${paths.statePath}): expected schemaVersion "${REGISTRY_STATE_SCHEMA_VERSION}".`,
    );
  }

  if (!ACTIVE_SET_VALUES.includes(parsed.activeSet)) {
    throw new RegistryLifecycleError(
      `Registry lifecycle state is malformed (${paths.statePath}): activeSet must be one of ${ACTIVE_SET_VALUES.join(', ')}.`,
    );
  }

  return { activeSet: parsed.activeSet, stateFileExists: true };
};

// [5.2.1] cfg-registryLifecycle · Primitive · "customSetExists"
export const customSetExists = (paths) => {
  try {
    return fs.statSync(paths.customRoot).isDirectory();
  } catch {
    return false;
  }
};

const isValidManifestEntry = (entry) =>
  isPlainObject(entry) &&
  typeof entry.validatorVersion === 'string' &&
  typeof entry.version === 'string' &&
  typeof entry.digest === 'string' &&
  /^[a-f0-9]{64}$/u.test(entry.digest);

// [5.2.1] cfg-registryLifecycle · Primitive · "readRegistrySetManifest"
// Returns `{ manifest }` or `{ manifestError }`. Completeness against the Custom files present is
// checked by the assessment, which knows the inventory (lifecycle spec §7.1 item 5).
export const readRegistrySetManifest = (paths) => {
  if (!isLifecyclePathContained(paths, paths.manifestPath)) {
    return { manifestError: `Registry set manifest resolves outside the validation target: ${paths.manifestPath}` };
  }

  if (!fs.existsSync(paths.manifestPath)) {
    return { manifestError: `Registry set manifest is missing: ${paths.manifestPath}` };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(paths.manifestPath, 'utf8'));
  } catch (error) {
    return { manifestError: `Registry set manifest is unreadable: ${error.message}` };
  }

  if (!isPlainObject(parsed) || parsed.schemaVersion !== REGISTRY_SET_MANIFEST_SCHEMA_VERSION) {
    return {
      manifestError: `Registry set manifest is malformed: expected schemaVersion "${REGISTRY_SET_MANIFEST_SCHEMA_VERSION}".`,
    };
  }

  const registries = parsed.basedOn?.registries;
  if (!isPlainObject(registries)) {
    return { manifestError: 'Registry set manifest is malformed: basedOn.registries must be an object.' };
  }

  const invalidRegistryIds = Object.keys(registries)
    .filter((registryId) => !isValidManifestEntry(registries[registryId]))
    .sort();
  if (invalidRegistryIds.length > 0) {
    return {
      manifestError: `Registry set manifest is malformed: invalid basedOn entries for ${invalidRegistryIds.join(', ')}.`,
    };
  }

  return { manifest: parsed };
};
