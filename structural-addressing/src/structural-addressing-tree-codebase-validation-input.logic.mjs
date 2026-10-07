// Validation input adapter for the tree-codebase profile (Refs #45).
// Contract: doc/ValidatorSpecs/structural-addressing-tree-codebase-validation-input.spec.md.
//
// Turns suite-core's prepared values (selected paths, include roots, target descriptors) into the
// two root sets and the node tree `prepareTreeCodebaseAddressedSnapshot` addresses. Pure: no
// filesystem access, and suite-core's selected paths are the only files it emits.

const POSIX_SEPARATOR = '/';
const REPOSITORY_ROOT = '.';

const normalizeRelativePath = (relativePath) =>
  String(relativePath ?? '')
    .replaceAll('\\', POSIX_SEPARATOR)
    .replace(/^\.\//u, '')
    .replace(/\/$/u, '');

const sortStrings = (values) => [...values].sort((left, right) => left.localeCompare(right));

const isPathInside = (candidatePath, folderPath) =>
  candidatePath === folderPath || candidatePath.startsWith(`${folderPath}${POSIX_SEPARATOR}`);

const toBasename = (relativePath) => relativePath.slice(relativePath.lastIndexOf(POSIX_SEPARATOR) + 1);

const toParentPath = (relativePath) =>
  relativePath.includes(POSIX_SEPARATOR) ? relativePath.slice(0, relativePath.lastIndexOf(POSIX_SEPARATOR)) : null;

// Targets are normalized before a derivation branch is chosen: empty and `.` targets drop out, so
// a `--target .` run falls through to the include roots.
const normalizeTargets = (targets) => {
  const targetsByPath = new Map();
  for (const target of targets) {
    const relPath = normalizeRelativePath(typeof target === 'string' ? target : target?.relPath);
    if (relPath && relPath !== REPOSITORY_ROOT && !targetsByPath.has(relPath)) {
      targetsByPath.set(relPath, { relPath, kind: typeof target === 'string' ? null : target?.kind ?? null });
    }
  }
  return [...targetsByPath.values()];
};

const resolveTargetKind = ({ relPath, kind }, selectedPathSet) => {
  if (kind === 'dir' || kind === 'file') {
    return kind;
  }
  if ([...selectedPathSet].some((selectedPath) => selectedPath.startsWith(`${relPath}${POSIX_SEPARATOR}`))) {
    return 'dir';
  }
  return selectedPathSet.has(relPath) ? 'file' : 'dir';
};

const toTargetScopeRoot = (target, selectedPathSet) => {
  if (resolveTargetKind(target, selectedPathSet) === 'dir') {
    return target.relPath;
  }
  return toParentPath(target.relPath) ?? REPOSITORY_ROOT;
};

// declaredScopeRoots: normalized, uncollapsed, sorted unique. Reproduces Tree's scope-root list.
const deriveDeclaredScopeRoots = ({ selectedPaths, includeRoots, targets }) => {
  const normalizedTargets = normalizeTargets(targets);
  if (normalizedTargets.length > 0) {
    const selectedPathSet = new Set(selectedPaths);
    return {
      declaredScopeRoots: sortStrings(new Set(normalizedTargets.map((target) => toTargetScopeRoot(target, selectedPathSet)))),
      isTopLevelEntryFallback: false,
    };
  }

  const normalizedIncludeRoots = includeRoots.map(normalizeRelativePath).filter(Boolean);
  if (normalizedIncludeRoots.length > 0) {
    return { declaredScopeRoots: sortStrings(new Set(normalizedIncludeRoots)), isTopLevelEntryFallback: false };
  }

  // Top-level-entry fallback (the `system` profile): each top-level entry is its own declared root.
  return {
    declaredScopeRoots: sortStrings(new Set(selectedPaths.map((selectedPath) => selectedPath.split(POSIX_SEPARATOR)[0]))),
    isTopLevelEntryFallback: true,
  };
};

// Folder roots other than `.` and fallback roots; a root inside another one collapses into it (D4).
const collapseFolderRoots = (declaredScopeRoots, isTopLevelEntryFallback) => {
  const folderRoots = isTopLevelEntryFallback ? [] : declaredScopeRoots.filter((rootPath) => rootPath !== REPOSITORY_ROOT);
  const effectiveFolderRoots = folderRoots.filter(
    (rootPath) => !folderRoots.some((otherRoot) => otherRoot !== rootPath && isPathInside(rootPath, otherRoot)),
  );
  return { folderRoots, effectiveFolderRoots };
};

const createNodeTree = () => {
  const rootNodes = [];
  const folderNodesByPath = new Map();

  const attach = (node, parentPath) => {
    if (parentPath === null) {
      rootNodes.push(node);
    } else {
      folderNodesByPath.get(parentPath).children.push(node);
    }
  };

  const ensureFolder = (folderPath, parentPath) => {
    if (!folderNodesByPath.has(folderPath)) {
      const node = { name: toBasename(folderPath), path: folderPath, occurrenceType: 'folder', children: [] };
      folderNodesByPath.set(folderPath, node);
      attach(node, parentPath);
    }
  };

  // Creates `targetPath` and every folder between `basePath` and it; `basePath` null means the
  // repository root, whose top-level entries are root nodes.
  const ensureFolderChain = (targetPath, basePath) => {
    const baseSegmentCount = basePath === null ? 0 : basePath.split(POSIX_SEPARATOR).length;
    const segments = targetPath.split(POSIX_SEPARATOR);
    for (let index = baseSegmentCount; index < segments.length; index += 1) {
      const folderPath = segments.slice(0, index + 1).join(POSIX_SEPARATOR);
      ensureFolder(folderPath, index === 0 ? null : segments.slice(0, index).join(POSIX_SEPARATOR));
    }
  };

  const addFile = (filePath, parentPath) => {
    attach({ name: toBasename(filePath), path: filePath, occurrenceType: 'file' }, parentPath);
  };

  return { rootNodes, ensureFolder, ensureFolderChain, addFile };
};

export const prepareTreeCodebaseValidationInput = ({ selectedPaths = [], includeRoots = [], targets = [] } = {}) => {
  const normalizedSelectedPaths = sortStrings(new Set(selectedPaths.map(normalizeRelativePath).filter(Boolean)));
  const { declaredScopeRoots, isTopLevelEntryFallback } = deriveDeclaredScopeRoots({
    selectedPaths: normalizedSelectedPaths,
    includeRoots,
    targets,
  });
  const { folderRoots, effectiveFolderRoots } = collapseFolderRoots(declaredScopeRoots, isTopLevelEntryFallback);
  const findEffectiveRoot = (relativePath) => effectiveFolderRoots.find((rootPath) => isPathInside(relativePath, rootPath));

  const tree = createNodeTree();

  // Effective folder roots are root nodes, even with no selected files below them (I3); nothing
  // above them is emitted (no D2 phantom ancestors).
  for (const rootPath of effectiveFolderRoots) {
    tree.ensureFolder(rootPath, null);
  }

  // A collapsed declared root keeps its occurrence, nested under its effective root (D4).
  for (const rootPath of folderRoots.filter((candidate) => !effectiveFolderRoots.includes(candidate))) {
    tree.ensureFolderChain(rootPath, findEffectiveRoot(rootPath));
  }

  let hasRepositoryRootEntries = false;
  for (const filePath of normalizedSelectedPaths) {
    const effectiveRoot = findEffectiveRoot(filePath) ?? null;
    const parentPath = toParentPath(filePath);
    if (effectiveRoot === null) {
      hasRepositoryRootEntries = true;
    }
    if (parentPath !== null && (effectiveRoot === null || parentPath !== effectiveRoot)) {
      tree.ensureFolderChain(parentPath, effectiveRoot);
    }
    tree.addFile(filePath, parentPath === null ? null : parentPath);
  }

  return {
    declaredScopeRoots,
    effectiveAddressingRoots: sortStrings([
      ...effectiveFolderRoots,
      ...(hasRepositoryRootEntries ? [REPOSITORY_ROOT] : []),
    ]),
    treeCodebaseInput: { scopeRoots: tree.rootNodes },
  };
};
