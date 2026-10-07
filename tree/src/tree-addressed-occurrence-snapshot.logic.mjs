// Tree-owned projection of Structural Addressing output onto Tree's snapshot contract (Refs #45).
// Contract: doc/ValidatorSpecs/tree-owned/tree-structural-address-probe-contract.spec.md,
// "Addressing-backed projection".
//
// Addressing decides identity and nesting; this module only adds Tree's contract vocabulary: the
// input-derived envelope, the `resolvedPath`/`actualName` aliases, the probe-contract concepts and
// the two scope flags. Records keep Tree's current path order; consumers that need traversal order
// read `orderIndex`.

const POSIX_SEPARATOR = '/';
const REPOSITORY_ROOT = '.';

const normalizeRelativePath = (relativePath) =>
  String(relativePath ?? '')
    .replaceAll('\\', POSIX_SEPARATOR)
    .replace(/^\.\//u, '')
    .replace(/\/$/u, '');

const isPathInside = (candidatePath, folderPath) =>
  candidatePath === folderPath || candidatePath.startsWith(`${folderPath}${POSIX_SEPARATOR}`);

// Today's envelope rule, unchanged: the descriptor kind is checked before the `.` case.
const inferEnvelopeTargetKind = (targets, selectedPaths) => {
  if (targets.length !== 1) {
    return 'mixed';
  }

  const [target] = targets;
  const kind = typeof target === 'string' ? null : target?.kind ?? null;
  if (kind === 'dir' || kind === 'file') {
    return kind;
  }

  const relPath = normalizeRelativePath(typeof target === 'string' ? target : target?.relPath);
  if (!relPath || relPath === REPOSITORY_ROOT) {
    return 'mixed';
  }

  const selectedPathSet = new Set(selectedPaths.map(normalizeRelativePath).filter(Boolean));
  if ([...selectedPathSet].some((selectedPath) => selectedPath.startsWith(`${relPath}${POSIX_SEPARATOR}`))) {
    return 'dir';
  }
  return selectedPathSet.has(relPath) ? 'file' : 'dir';
};

// Scope binding: the deepest declared root (other than `.`) equal to or containing the path, so an
// inner root keeps its own binding after the adapter collapsed it under an outer one.
const toScopeBinding = (relativePath, declaredScopeRoots) =>
  declaredScopeRoots
    .filter((rootPath) => rootPath !== REPOSITORY_ROOT && isPathInside(relativePath, rootPath))
    .sort((left, right) => right.length - left.length)[0] ?? REPOSITORY_ROOT;

const toLineageSegments = (relativePath, scopeRootPath) => {
  if (scopeRootPath === REPOSITORY_ROOT) {
    return relativePath.split(POSIX_SEPARATOR);
  }
  if (relativePath === scopeRootPath) {
    return [scopeRootPath];
  }
  return [scopeRootPath, ...relativePath.slice(scopeRootPath.length + 1).split(POSIX_SEPARATOR)];
};

export const prepareTreeAddressedOccurrenceSnapshot = ({
  occurrenceRecords = [],
  declaredScopeRoots = [],
  targets = [],
  selectedPaths = [],
  source = 'tree-addressed-occurrence-snapshot',
} = {}) => {
  const recordsByAddress = new Map(occurrenceRecords.map((record) => [record.addressPath, record]));

  const projectedRecords = occurrenceRecords.map((record) => {
    const scopeRootPath = toScopeBinding(record.path, declaredScopeRoots);
    const lineageSegments = toLineageSegments(record.path, scopeRootPath);
    return {
      resolvedPath: record.path,
      actualName: record.name,
      occurrenceType: record.occurrenceType,
      parentResolvedPath: record.parentAddressPath === null ? null : recordsByAddress.get(record.parentAddressPath).path,
      depth: record.depth,
      scopeRootPath,
      lineageSegments,
      markerSegments: record.addressPath.split('.'),
      occurrenceMarker: record.addressPath,
      isScopedRoot: record.path === scopeRootPath,
      isScopeTopOccurrence: lineageSegments.length === 1,
      path: record.path,
      name: record.name,
      addressPath: record.addressPath,
      parentAddressPath: record.parentAddressPath,
      orderIndex: record.orderIndex,
    };
  });

  return {
    scope: {
      scopeRootPath: declaredScopeRoots[0] ?? REPOSITORY_ROOT,
      targetKind: inferEnvelopeTargetKind(targets, selectedPaths),
      source,
    },
    scopeRoots: [...declaredScopeRoots],
    occurrenceRecords: projectedRecords.sort((left, right) => left.resolvedPath.localeCompare(right.resolvedPath)),
  };
};
