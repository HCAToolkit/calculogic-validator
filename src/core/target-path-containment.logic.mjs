// Target-path containment (#53, lifecycle spec §4.1 "Containment").
// One suite rule for every path the Validator treats as part of a validation target: the path must
// resolve by realpath inside the target root. Symlinks that stay inside the target are allowed;
// symlinks that escape it, dangle or otherwise cannot be resolved are not.

import fs from 'node:fs';
import path from 'node:path';

// Resolves a path through symlinks. A path that does not exist yet resolves through its nearest
// existing ancestor; a dangling symlink cannot be resolved and yields null.
export const resolveRealPath = (candidatePath) => {
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

// Classifies `candidatePath` against `targetRoot`: `contained` when it resolves inside the target,
// `escaping` when it resolves outside it, and `unresolvable` when it (or the target) cannot be
// resolved, such as a dangling symlink.
export const classifyTargetPathContainment = (targetRoot, candidatePath) => {
  const realRoot = resolveRealPath(targetRoot);
  const realCandidate = resolveRealPath(candidatePath);
  if (realRoot === null || realCandidate === null) {
    return 'unresolvable';
  }

  const relativePath = path.relative(realRoot, realCandidate);
  const isInside =
    relativePath === '' ||
    (relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath));
  return isInside ? 'contained' : 'escaping';
};

export const isPathInsideTarget = (targetRoot, candidatePath) =>
  classifyTargetPathContainment(targetRoot, candidatePath) === 'contained';
