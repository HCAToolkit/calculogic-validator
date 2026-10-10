import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPathSegmentName } from '../../../src/core/registry-entry-shape.logic.mjs';

const BUILTIN_REGISTRY_ROOT = new URL('./_builtin/', import.meta.url);

export const BUILTIN_WALK_EXCLUSIONS_REGISTRY_PATH = fileURLToPath(
  new URL('walk-exclusions.registry.json', BUILTIN_REGISTRY_ROOT),
);

let cachedBuiltinWalkExclusions = null;

const WALK_EXCLUSIONS_REGISTRY_FILENAME = 'walk-exclusions.registry.json';

const loadWalkExclusionsFromFile = (registryFilePath) => {
  const payload = JSON.parse(fs.readFileSync(registryFilePath, 'utf8'));

  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid walk-exclusions registry: expected object payload.');
  }

  if (!Array.isArray(payload.excludedDirectories)) {
    throw new Error('Invalid walk-exclusions registry: missing excludedDirectories array.');
  }

  if (typeof payload.skipDotDirectories !== 'boolean') {
    throw new Error('Invalid walk-exclusions registry: missing boolean skipDotDirectories.');
  }

  if (!Array.isArray(payload.allowDotFiles)) {
    throw new Error('Invalid walk-exclusions registry: missing allowDotFiles array.');
  }

  const ensureNonEmptyStringArray = (values, fieldName) => {
    values.forEach((value, index) => {
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(
          `Invalid walk-exclusions registry: ${fieldName}[${index}] must be a non-empty string.`,
        );
      }
    });
  };

  ensureNonEmptyStringArray(payload.excludedDirectories, 'excludedDirectories');
  // The walk compares each directory entry name, so an excluded directory is one bare name.
  payload.excludedDirectories.forEach((directoryName, index) => {
    if (!isPathSegmentName(directoryName)) {
      throw new Error(
        `Invalid walk-exclusions registry: excludedDirectories[${index}] must be a bare directory name without a path.`,
      );
    }
  });
  ensureNonEmptyStringArray(payload.allowDotFiles, 'allowDotFiles');

  return {
    excludedDirectories: new Set(payload.excludedDirectories),
    skipDotDirectories: payload.skipDotDirectories,
    allowDotFiles: new Set(payload.allowDotFiles),
  };
};

// Loads walk exclusions from a resolved Naming registry root (#41 registry lifecycle).
export const loadNamingWalkExclusionsFromRegistryRoot = (registryRoot) =>
  loadWalkExclusionsFromFile(path.join(registryRoot, WALK_EXCLUSIONS_REGISTRY_FILENAME));

export const getBuiltinWalkExclusions = () => {
  if (cachedBuiltinWalkExclusions === null) {
    cachedBuiltinWalkExclusions = loadWalkExclusionsFromFile(BUILTIN_WALK_EXCLUSIONS_REGISTRY_PATH);
  }

  return cachedBuiltinWalkExclusions;
};
