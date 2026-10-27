import fs from 'node:fs';
import path from 'node:path';

export const normalizePath = (relativePath) => relativePath.split(path.sep).join('/');

const sortPaths = (paths) => Array.from(paths).sort((left, right) => left.localeCompare(right));

const isPathOutsideRoot = (relativePath) =>
  relativePath.startsWith('..') || path.isAbsolute(relativePath);

const toRealPath = (absolutePath) => {
  try {
    return fs.realpathSync(absolutePath);
  } catch {
    return absolutePath;
  }
};

// The target as written, relative to the repository root (or to its real path, for an absolute
// target spelled through the physical checkout); the physical path when neither contains it.
const toWrittenRelPath = (repositoryRoot, rootRealPath, absoluteCandidatePath, physicalRelPath) => {
  for (const rootPath of [path.resolve(repositoryRoot), rootRealPath]) {
    const relativePath = path.relative(rootPath, absoluteCandidatePath);
    if (!isPathOutsideRoot(relativePath)) {
      return relativePath ? normalizePath(relativePath) : '.';
    }
  }

  return physicalRelPath;
};

export const resolveScopedTargets = (repositoryRoot, targets = []) => {
  if (!targets?.length) {
    return [];
  }

  const rootRealPath = fs.realpathSync(repositoryRoot);
  const resolvedTargets = [];
  const dedupeByAbsolutePath = new Set();

  for (const rawTarget of targets) {
    const trimmedTarget = String(rawTarget ?? '').trim();
    const normalizedInput = trimmedTarget.replaceAll('\\', '/');

    if (!normalizedInput) {
      throw new Error('Target path must be a non-empty string.');
    }

    const absoluteCandidatePath = path.isAbsolute(trimmedTarget)
      ? path.resolve(trimmedTarget)
      : path.resolve(repositoryRoot, normalizedInput);

    if (!fs.existsSync(absoluteCandidatePath)) {
      throw new Error(`Target path does not exist: ${normalizedInput}`);
    }

    const absoluteRealPath = fs.realpathSync(absoluteCandidatePath);
    const relativeToRoot = path.relative(rootRealPath, absoluteRealPath);
    if (isPathOutsideRoot(relativeToRoot)) {
      throw new Error(`Target path escapes repository root: ${normalizedInput}`);
    }

    if (dedupeByAbsolutePath.has(absoluteRealPath)) {
      continue;
    }

    const targetStat = fs.statSync(absoluteRealPath);
    const kind = targetStat.isDirectory() ? 'dir' : targetStat.isFile() ? 'file' : null;
    if (!kind) {
      throw new Error(`Target path must be a file or directory: ${normalizedInput}`);
    }

    dedupeByAbsolutePath.add(absoluteRealPath);
    const relPath = relativeToRoot ? normalizePath(relativeToRoot) : '.';
    resolvedTargets.push({
      absPath: absoluteRealPath,
      relPath,
      writtenRelPath: toWrittenRelPath(repositoryRoot, rootRealPath, absoluteCandidatePath, relPath),
      kind,
    });
  }

  return resolvedTargets.sort((left, right) => left.relPath.localeCompare(right.relPath));
};

// Targets are resolved to real paths, so collected paths are compared in the same real-path form;
// otherwise a path reached through an internal symlinked scope root or a symlinked checkout would
// never match its own target.
const isRealPathUnderTarget = (realPath, target) =>
  realPath === target.absPath || (target.kind === 'dir' && realPath.startsWith(`${target.absPath}${path.sep}`));

export const filterScopedPathsByTargets = (
  repositoryRoot,
  relativePaths,
  resolvedTargets = [],
) => {
  if (!resolvedTargets.length) {
    return sortPaths(new Set(relativePaths));
  }

  const selectedPaths = relativePaths.filter((relativePath) => {
    const realPath = toRealPath(path.resolve(repositoryRoot, relativePath));
    return resolvedTargets.some((target) => isRealPathUnderTarget(realPath, target));
  });

  return sortPaths(new Set(selectedPaths));
};

// Scope exclusions (#56) follow the same target interpretation as selected paths: an entry is kept
// when its location is selected by a target. Its location is its real parent directory plus its own
// name, which for a regular file is exactly its real path; an excluded entry's own real path may lie
// outside the target or not exist, so it cannot be used. A file target selects only that location.
export const filterScopeExclusionsByTargets = (repositoryRoot, scopeExclusions, resolvedTargets = []) => {
  if (!resolvedTargets.length) {
    return [...scopeExclusions];
  }

  return scopeExclusions.filter((exclusion) => {
    const absolutePath = path.resolve(repositoryRoot, exclusion.path);
    const locationRealPath = path.join(toRealPath(path.dirname(absolutePath)), path.basename(absolutePath));
    return resolvedTargets.some((target) => isRealPathUnderTarget(locationRealPath, target));
  });
};

export const buildScopePathPredicate = (scopeProfile) => {
  const includeRootSet = new Set((scopeProfile?.includeRoots ?? []).map(normalizePath));
  const includeRootFileSet = new Set((scopeProfile?.includeRootFiles ?? []).map(normalizePath));

  return (relativePath) => {
    const normalizedPath = normalizePath(relativePath);
    if (normalizedPath.includes('/')) {
      const firstSegment = normalizedPath.split('/')[0];
      return includeRootSet.has(firstSegment);
    }

    return includeRootFileSet.has(normalizedPath);
  };
};

export const filterScopedPathsByProfile = (relativePaths, scopeProfile) => {
  const scopePathPredicate = buildScopePathPredicate(scopeProfile);
  const scopedPaths = relativePaths.filter(scopePathPredicate);
  return sortPaths(new Set(scopedPaths));
};

// Target descriptors in the selected paths' own spelling. Selection matches real paths, so a target
// written through a symlink, or as the physical path behind one, selects paths spelled differently
// from it; consumers that relate targets to selected paths (Tree's structural addressing) need both
// in one spelling. A target is described, for each selected path it matched, by that path's shortest
// lexical ancestor (`.` first, the path itself last) that resolves inside the target, so every
// selected path sits under a descriptor. A target that matched nothing keeps its written spelling.
export const describeTargetsForSelectedPaths = (repositoryRoot, selectedPaths, resolvedTargets = []) => {
  const realPathsByRelPath = new Map();
  const realPathOf = (relPath) => {
    if (!realPathsByRelPath.has(relPath)) {
      realPathsByRelPath.set(relPath, toRealPath(path.resolve(repositoryRoot, relPath)));
    }

    return realPathsByRelPath.get(relPath);
  };

  const descriptorsByRelPath = new Map();
  for (const target of resolvedTargets) {
    let matchedAny = false;
    for (const selectedPath of selectedPaths.map(normalizePath)) {
      if (!isRealPathUnderTarget(realPathOf(selectedPath), target)) {
        continue;
      }

      matchedAny = true;
      const segments = selectedPath.split('/');
      const ancestors = ['.', ...segments.map((_, index) => segments.slice(0, index + 1).join('/'))];
      const relPath = ancestors.find((ancestor) => isRealPathUnderTarget(realPathOf(ancestor), target));
      // The target itself keeps its kind; anything strictly inside it is a folder, or the file itself.
      const kind = realPathOf(relPath) === target.absPath ? target.kind : relPath === selectedPath ? 'file' : 'dir';
      if (!descriptorsByRelPath.has(relPath)) {
        descriptorsByRelPath.set(relPath, { kind, relPath });
      }
    }

    if (!matchedAny && !descriptorsByRelPath.has(target.writtenRelPath)) {
      descriptorsByRelPath.set(target.writtenRelPath, { kind: target.kind, relPath: target.writtenRelPath });
    }
  }

  return [...descriptorsByRelPath.values()].sort((left, right) => left.relPath.localeCompare(right.relPath));
};
