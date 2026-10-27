import fs from 'node:fs';
import path from 'node:path';
import { collectShimCompatFindings } from '../tree-shim-detection.logic.mjs';
import { isPathInsideTarget } from '../../../src/core/target-path-containment.logic.mjs';

// Read guard (#56): suite core admits only contained regular files, and this read checks again, with
// the shared containment rule, immediately before reading. A path that no longer resolves inside the
// target, is not a regular file, or cannot be read yields `null`, so shim detection falls back to
// path-only evidence instead of reading outside the target, crashing or blocking on a FIFO. The
// check precedes the read by path, so it is not race-proof: an entry retargeted or replaced between
// the check and the read can still be read.
const readGuardedContent = (repositoryRoot, relativePath) => {
  const absolutePath = path.resolve(repositoryRoot, relativePath);
  try {
    if (!isPathInsideTarget(repositoryRoot, absolutePath) || !fs.statSync(absolutePath).isFile()) {
      return null;
    }

    return fs.readFileSync(absolutePath, 'utf8');
  } catch {
    return null;
  }
};

// `treeSignalPolicy` is the run's resolved Tree signal policy (#41); without it shim detection uses Builtin.
export const attachTreeShimDiagnosticsContributor = ({
  repositoryRoot,
  selectedPaths,
  validatorDevelopmentRoot = null,
  treeSignalPolicy,
}) => {
  if (typeof repositoryRoot !== 'string' || repositoryRoot.length === 0) {
    throw new Error('Tree shim diagnostics attachment requires repositoryRoot prepared input.');
  }

  if (!Array.isArray(selectedPaths)) {
    throw new Error('Tree shim diagnostics attachment requires selectedPaths[] prepared input.');
  }

  const contentByPathCache = new Map();
  const selectedPathSet = new Set(selectedPaths);
  const getFileContent = (relativePath) => {
    if (!selectedPathSet.has(relativePath)) {
      throw new Error(
        `Tree shim diagnostics getFileContent received out-of-scope path: ${relativePath}`,
      );
    }

    if (contentByPathCache.has(relativePath)) {
      return contentByPathCache.get(relativePath);
    }

    const rawContent = readGuardedContent(repositoryRoot, relativePath);
    contentByPathCache.set(relativePath, rawContent);
    return rawContent;
  };

  return () =>
    collectShimCompatFindings(selectedPaths, getFileContent, { validatorDevelopmentRoot, signalPolicy: treeSignalPolicy });
};
