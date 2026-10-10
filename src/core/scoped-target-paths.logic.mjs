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
// never match its own target. Returns the real path's remainder below the target ('' for the target
// itself), or null when it is not under the target.
const matchTargetRemainder = (realPath, target) => {
  if (realPath === target.absPath) {
    return '';
  }

  if (target.kind === 'dir' && realPath.startsWith(`${target.absPath}${path.sep}`)) {
    return normalizePath(realPath.slice(target.absPath.length + 1));
  }

  return null;
};

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
    return resolvedTargets.some((target) => matchTargetRemainder(realPath, target) !== null);
  });

  return sortPaths(new Set(selectedPaths));
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
// written through a symlink (or as the physical path behind a symlinked scope root) selects paths
// spelled differently from it; consumers that relate targets to selected paths (Tree's structural
// addressing) need both in one spelling. Each target is described by the lexical prefix of every
// selected path it matched; a target that matched nothing keeps its written spelling.
export const describeTargetsForSelectedPaths = (repositoryRoot, selectedPaths, resolvedTargets = []) => {
  const descriptorsByRelPath = new Map();
  const addDescriptor = (relPath, kind) => {
    if (!descriptorsByRelPath.has(relPath)) {
      descriptorsByRelPath.set(relPath, { kind, relPath });
    }
  };

  for (const target of resolvedTargets) {
    let matchedAny = false;
    for (const selectedPath of selectedPaths) {
      const remainder = matchTargetRemainder(toRealPath(path.resolve(repositoryRoot, selectedPath)), target);
      if (remainder === null) {
        continue;
      }

      const normalizedSelectedPath = normalizePath(selectedPath);
      if (remainder === '') {
        matchedAny = true;
        addDescriptor(normalizedSelectedPath, target.kind);
      } else if (normalizedSelectedPath === remainder) {
        matchedAny = true;
        addDescriptor('.', target.kind);
      } else if (normalizedSelectedPath.endsWith(`/${remainder}`)) {
        matchedAny = true;
        addDescriptor(normalizedSelectedPath.slice(0, -(remainder.length + 1)), target.kind);
      }
    }

    if (!matchedAny) {
      addDescriptor(target.writtenRelPath, target.kind);
    }
  }

  return [...descriptorsByRelPath.values()].sort((left, right) => left.relPath.localeCompare(right.relPath));
};
