import fs from 'node:fs';
import path from 'node:path';
import { resolveContextualValidatorScopeProfile, DEFAULT_VALIDATOR_SCOPE } from './validator-scopes.logic.mjs';
import {
  normalizePath,
  resolveScopedTargets,
  filterScopedPathsByTargets,
} from './scoped-target-paths.logic.mjs';
import { classifyTargetPathContainment } from './target-path-containment.logic.mjs';

const sortPaths = (paths) => Array.from(paths).sort((left, right) => left.localeCompare(right));

// Only a missing path is absent. Any other failure (for example EACCES on a parent) is a scope
// error, so an entry the Validator cannot inspect never silently narrows the scope.
const ABSENT_PATH_ERROR_CODES = new Set(['ENOENT', 'ENOTDIR']);

const isPresent = (absolutePath, label, entry) => {
  try {
    fs.lstatSync(absolutePath);
    return true;
  } catch (error) {
    if (ABSENT_PATH_ERROR_CODES.has(error?.code)) {
      return false;
    }

    throw new Error(`${label} cannot be accessed (${error?.code ?? error?.message}): ${entry}`);
  }
};

// Scope-root containment (#53): before any traversal, every declared scope root and root file must
// resolve by realpath inside the target. An absent entry contributes nothing; an internal symlink is
// allowed; an escaping, dangling or unresolvable entry stops the run like an invalid scope, so a
// requested scope is never silently narrowed.
const assertScopeEntriesContained = (repositoryRoot, { includeRoots, includeRootFiles }) => {
  const entries = [
    ...includeRoots.map((entry) => ['Scope root', entry]),
    ...includeRootFiles.map((entry) => ['Scope root file', entry]),
  ];

  for (const [label, entry] of entries) {
    const absolutePath = path.resolve(repositoryRoot, entry);
    // Classified first: an absent entry resolves through its nearest existing ancestor, so an entry
    // under a dangling or escaping symlink is caught here rather than treated as absent.
    const containment = classifyTargetPathContainment(repositoryRoot, absolutePath);
    if (containment === 'escaping') {
      throw new Error(`${label} escapes repository root: ${entry}`);
    }

    if (containment === 'unresolvable') {
      throw new Error(`${label} cannot be resolved (dangling or unreadable symlink): ${entry}`);
    }

    // Only a contained entry may be genuinely absent; any other inspection failure throws.
    isPresent(absolutePath, label, entry);
  }
};

const collectPathsFromScopeRoot = (
  repositoryRoot,
  scopeRoot,
  {
    walkExcludedDirectories = new Set(),
    skipDotDirectories = true,
    skipSymlinkedCandidateScopeRoots = false,
    packageRoot,
  } = {},
) => {
  const absoluteRoot = path.resolve(repositoryRoot, scopeRoot);
  if (!fs.existsSync(absoluteRoot)) {
    return [];
  }

  const isRepositoryRootScope = path.normalize(scopeRoot) === '.';
  if (
    skipSymlinkedCandidateScopeRoots &&
    !isRepositoryRootScope &&
    fs.lstatSync(absoluteRoot).isSymbolicLink()
  ) {
    return [];
  }

  const rootStat = fs.statSync(absoluteRoot);
  if (!rootStat.isDirectory()) {
    return [];
  }

  const collected = [];

  const walk = (absoluteDirectoryPath) => {
    const entries = fs
      .readdirSync(absoluteDirectoryPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (walkExcludedDirectories.has(entry.name)) {
          continue;
        }

        if (skipDotDirectories && entry.name.startsWith('.')) {
          continue;
        }

        walk(path.join(absoluteDirectoryPath, entry.name));
        continue;
      }

      const relativeFilePath = normalizePath(
        path.relative(repositoryRoot, path.join(absoluteDirectoryPath, entry.name)),
      );
      collected.push(relativeFilePath);
    }
  };

  walk(absoluteRoot);
  return collected;
};

const collectPathsFromRootFiles = (repositoryRoot, includeRootFiles) => {
  const repositoryAbsoluteRoot = path.resolve(repositoryRoot);

  return includeRootFiles.flatMap((rootFilePath) => {
    const absolutePath = path.resolve(repositoryRoot, rootFilePath);

    if (path.dirname(absolutePath) !== repositoryAbsoluteRoot || !fs.existsSync(absolutePath)) {
      return [];
    }

    const rootFileStat = fs.statSync(absolutePath);
    if (!rootFileStat.isFile()) {
      return [];
    }

    return [normalizePath(path.relative(repositoryRoot, absolutePath))];
  });
};

export const collectSuiteScopedPaths = (
  repositoryRoot,
  {
    scope,
    walkExcludedDirectories = new Set(),
    skipDotDirectories = true,
    skipSymlinkedCandidateScopeRoots = false,
    packageRoot,
    registryRoots,
  } = {},
) => {
  const selectedScope = scope ?? DEFAULT_VALIDATOR_SCOPE;
  const scopeResolution = resolveContextualValidatorScopeProfile(selectedScope, {
    targetRepositoryRoot: repositoryRoot,
    packageRoot,
    registryRoots,
  });

  if (scopeResolution.status === 'invalid-scope') {
    throw new Error(`Invalid scope profile: ${selectedScope}`);
  }

  if (scopeResolution.status === 'unavailable-scope') {
    throw new Error(scopeResolution.message);
  }

  const profile = scopeResolution.profile;
  assertScopeEntriesContained(repositoryRoot, profile);

  const scopedPaths = profile.includeRoots.flatMap((scopeRoot) =>
    collectPathsFromScopeRoot(repositoryRoot, scopeRoot, {
      walkExcludedDirectories,
      skipDotDirectories,
      skipSymlinkedCandidateScopeRoots,
    }),
  );
  const rootFilePaths = collectPathsFromRootFiles(repositoryRoot, profile.includeRootFiles);

  return {
    scope: selectedScope,
    includeRoots: [...profile.includeRoots],
    includeRootFiles: [...profile.includeRootFiles],
    inScopePaths: sortPaths(new Set([...scopedPaths, ...rootFilePaths])),
  };
};

export const collectSuiteScopedSnapshotInputs = (
  repositoryRoot,
  {
    scope,
    targets = [],
    walkExcludedDirectories = new Set(),
    skipDotDirectories = true,
    skipSymlinkedCandidateScopeRoots = false,
    packageRoot,
    registryRoots,
  } = {},
) => {
  const scopedCollection = collectSuiteScopedPaths(repositoryRoot, {
    scope,
    walkExcludedDirectories,
    skipDotDirectories,
    skipSymlinkedCandidateScopeRoots,
    packageRoot,
    registryRoots,
  });
  const resolvedTargets = resolveScopedTargets(repositoryRoot, targets);

  return {
    ...scopedCollection,
    selectedPaths: filterScopedPathsByTargets(
      repositoryRoot,
      scopedCollection.inScopePaths,
      resolvedTargets,
    ),
    targetDescriptors: resolvedTargets.map((target) => ({
      kind: target.kind,
      relPath: target.relPath,
    })),
    targets: resolvedTargets.map((target) => target.relPath),
  };
};
