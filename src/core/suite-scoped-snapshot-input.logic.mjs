import fs from 'node:fs';
import path from 'node:path';
import { resolveContextualValidatorScopeProfile, DEFAULT_VALIDATOR_SCOPE } from './validator-scopes.logic.mjs';
import {
  normalizePath,
  describeTargetsForSelectedPaths,
  resolveScopedTargets,
  filterScopedPathsByTargets,
  filterScopeExclusionsByTargets,
} from './scoped-target-paths.logic.mjs';
import { classifyTargetPathContainment, isPathInsideTarget } from './target-path-containment.logic.mjs';

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

// Nested-entry membership (#56): below a scope root, an entry is a candidate only when it is
// positively established as a contained regular file. A regular file is; a symlink is when it
// resolves inside the target to a regular file, and keeps its own lexical path. Every other entry
// is excluded and recorded with one reason, never read and never traversed:
// - `escaping-symlink`: resolves outside the target;
// - `unresolvable-symlink`: cannot be resolved or inspected (dangling, a looping chain, or a
//   permission or I/O error; `cause` keeps the error code for diagnosis, it is not reported);
// - `directory-symlink`: resolves inside the target to a directory, which is not followed;
// - `non-regular-entry`: a FIFO, socket or device, or a contained symlink to one.
// A symlink whose name a directory walk rule excludes (`walkExcludedDirectories`, dot directories)
// is skipped without a record unless it resolves to a contained regular file, as the directory of
// that name would be. Declared scope roots keep their own rule (#53).
export const SCOPE_EXCLUSION_REASONS = Object.freeze({
  escapingSymlink: 'escaping-symlink',
  unresolvableSymlink: 'unresolvable-symlink',
  directorySymlink: 'directory-symlink',
  nonRegularEntry: 'non-regular-entry',
});

const inspectSymlinkEntry = (repositoryRoot, absoluteEntryPath) => {
  let realPath;
  let realStat;
  try {
    realPath = fs.realpathSync(absoluteEntryPath);
    realStat = fs.statSync(realPath);
  } catch (error) {
    return { reason: SCOPE_EXCLUSION_REASONS.unresolvableSymlink, cause: error?.code ?? 'UNKNOWN' };
  }

  if (!isPathInsideTarget(repositoryRoot, realPath)) {
    return { reason: SCOPE_EXCLUSION_REASONS.escapingSymlink };
  }

  if (realStat.isFile()) {
    return { member: true };
  }

  return {
    reason: realStat.isDirectory() ? SCOPE_EXCLUSION_REASONS.directorySymlink : SCOPE_EXCLUSION_REASONS.nonRegularEntry,
  };
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
  const empty = { paths: [], exclusions: [] };
  if (!fs.existsSync(absoluteRoot)) {
    return empty;
  }

  const isRepositoryRootScope = path.normalize(scopeRoot) === '.';
  if (
    skipSymlinkedCandidateScopeRoots &&
    !isRepositoryRootScope &&
    fs.lstatSync(absoluteRoot).isSymbolicLink()
  ) {
    return empty;
  }

  const rootStat = fs.statSync(absoluteRoot);
  if (!rootStat.isDirectory()) {
    return empty;
  }

  const collected = [];
  const exclusions = [];
  const isExcludedDirectoryName = (name) =>
    walkExcludedDirectories.has(name) || (skipDotDirectories && name.startsWith('.'));

  const walk = (absoluteDirectoryPath) => {
    const entries = fs
      .readdirSync(absoluteDirectoryPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absoluteEntryPath = path.join(absoluteDirectoryPath, entry.name);
      if (entry.isDirectory()) {
        if (isExcludedDirectoryName(entry.name)) {
          continue;
        }

        walk(absoluteEntryPath);
        continue;
      }

      const relativeEntryPath = normalizePath(path.relative(repositoryRoot, absoluteEntryPath));
      if (entry.isFile()) {
        collected.push(relativeEntryPath);
        continue;
      }

      const inspection = entry.isSymbolicLink()
        ? inspectSymlinkEntry(repositoryRoot, absoluteEntryPath)
        : { reason: SCOPE_EXCLUSION_REASONS.nonRegularEntry };
      if (inspection.member) {
        collected.push(relativeEntryPath);
        continue;
      }

      if (entry.isSymbolicLink() && isExcludedDirectoryName(entry.name)) {
        continue;
      }

      exclusions.push({
        path: relativeEntryPath,
        reason: inspection.reason,
        ...(inspection.cause ? { cause: inspection.cause } : {}),
      });
    }
  };

  walk(absoluteRoot);
  return { paths: collected, exclusions };
};

// The reported form of scope exclusions: repo-relative path and reason only. The internal `cause`
// never reaches a report, and neither does a symlink destination or file content.
export const toReportedScopeExclusions = (scopeExclusions = []) =>
  scopeExclusions.map(({ path: exclusionPath, reason }) => ({ path: exclusionPath, reason }));

const sortScopeExclusions = (exclusions) => {
  const byPath = new Map(exclusions.map((exclusion) => [exclusion.path, exclusion]));
  return sortPaths(byPath.keys()).map((exclusionPath) => byPath.get(exclusionPath));
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

  const rootCollections = profile.includeRoots.map((scopeRoot) =>
    collectPathsFromScopeRoot(repositoryRoot, scopeRoot, {
      walkExcludedDirectories,
      skipDotDirectories,
      skipSymlinkedCandidateScopeRoots,
    }),
  );
  const scopedPaths = rootCollections.flatMap((collection) => collection.paths);
  const rootFilePaths = collectPathsFromRootFiles(repositoryRoot, profile.includeRootFiles);

  return {
    scope: selectedScope,
    includeRoots: [...profile.includeRoots],
    includeRootFiles: [...profile.includeRootFiles],
    inScopePaths: sortPaths(new Set([...scopedPaths, ...rootFilePaths])),
    scopeExclusions: sortScopeExclusions(rootCollections.flatMap((collection) => collection.exclusions)),
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
  const selectedPaths = filterScopedPathsByTargets(repositoryRoot, scopedCollection.inScopePaths, resolvedTargets);
  const scopeExclusions = filterScopeExclusionsByTargets(repositoryRoot, scopedCollection.scopeExclusions, resolvedTargets);
  const targetDescriptors = describeTargetsForSelectedPaths(repositoryRoot, selectedPaths, resolvedTargets);

  return {
    ...scopedCollection,
    selectedPaths,
    scopeExclusions,
    targetDescriptors,
    targets: targetDescriptors.map((target) => target.relPath),
  };
};
