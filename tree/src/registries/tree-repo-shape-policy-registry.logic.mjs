import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPathSegmentName } from '../../../src/core/registry-entry-shape.logic.mjs';

const BUILTIN_REGISTRY_ROOT = new URL('./_builtin/', import.meta.url);

const REPO_SHAPE_POLICY_REGISTRY_FILENAME = 'repo-shape-policy.registry.json';

export const BUILTIN_TREE_REPO_SHAPE_POLICY_REGISTRY_PATH = fileURLToPath(
  new URL(REPO_SHAPE_POLICY_REGISTRY_FILENAME, BUILTIN_REGISTRY_ROOT),
);

let cachedBuiltinTreeRepoShapePolicy = null;

const normalizeAllowedTopLevelDirectories = (allowedTopLevelDirectories) => {
  if (!Array.isArray(allowedTopLevelDirectories)) {
    throw new Error(
      'Invalid tree repo-shape policy registry: allowedTopLevelDirectories must be an array.',
    );
  }

  allowedTopLevelDirectories.forEach((directoryName, index) => {
    if (typeof directoryName !== 'string' || directoryName.length === 0) {
      throw new Error(
        `Invalid tree repo-shape policy registry: allowedTopLevelDirectories[${index}] must be a non-empty string.`,
      );
    }

    // Compared with top-level folder names, so a value with a path separator would never match.
    if (!isPathSegmentName(directoryName)) {
      throw new Error(
        `Invalid tree repo-shape policy registry: allowedTopLevelDirectories[${index}] must be a bare directory name without a path.`,
      );
    }
  });

  return [...new Set(allowedTopLevelDirectories)].sort((left, right) => left.localeCompare(right));
};

export const normalizeTreeRepoShapePolicyRegistryPayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid tree repo-shape policy registry: expected object payload.');
  }

  return {
    version: payload.version,
    allowedTopLevelDirectories: normalizeAllowedTopLevelDirectories(payload.allowedTopLevelDirectories),
  };
};

// Loads from one resolved Tree registry root, Builtin or Custom (#41 registry lifecycle, spec §9.3).
export const loadTreeRepoShapePolicyFromRegistryRoot = (registryRoot) =>
  normalizeTreeRepoShapePolicyRegistryPayload(
    JSON.parse(fs.readFileSync(path.join(registryRoot, REPO_SHAPE_POLICY_REGISTRY_FILENAME), 'utf8')),
  );

export const getBuiltinTreeRepoShapePolicy = () => {
  if (cachedBuiltinTreeRepoShapePolicy === null) {
    cachedBuiltinTreeRepoShapePolicy = loadTreeRepoShapePolicyFromRegistryRoot(fileURLToPath(BUILTIN_REGISTRY_ROOT));
  }

  return cachedBuiltinTreeRepoShapePolicy;
};
