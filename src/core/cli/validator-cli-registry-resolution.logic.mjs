// One registry lifecycle resolution per CLI invocation (#41 registry lifecycle, spec §6).
// Validator CLI hosts resolve once and share the result between usage text (scope lists come from
// the resolved suite registries) and the run. A failed resolution is kept, not thrown: usage then
// uses Builtin roots so `--help` still works, and the run reports the lifecycle error before any
// report. With `--registry-candidate`, the run's source is the candidate (spec §12.13).
import fs from 'node:fs';
import path from 'node:path';
import {
  getBuiltinRegistryRoots,
  resolveActiveRegistrySet,
} from '../registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { resolveCandidateRegistrySet } from '../registry-lifecycle/registry-lifecycle-candidate.logic.mjs';

const CANDIDATE_FLAG = '--registry-candidate';

// The candidate option's name for the npm argument-forwarding guard.
export const REGISTRY_CANDIDATE_FLAG_NAME = 'registry-candidate';

// Takes `--registry-candidate <file>` or `--registry-candidate=<file>` out of the arguments, before
// the run's source is resolved, so a host's own parser never sees it. Returns `{ argv, candidate }`,
// where `candidate` is undefined, `{ path }`, or `{ error }` for a missing value or a repeated option.
export const extractRegistryCandidateArgument = (argv) => {
  const rest = [];
  const paths = [];
  let error;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === CANDIDATE_FLAG) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        error = `${CANDIDATE_FLAG} needs an artifact path.`;
      } else {
        paths.push(value);
        index += 1;
      }
    } else if (argument.startsWith(`${CANDIDATE_FLAG}=`)) {
      const value = argument.slice(CANDIDATE_FLAG.length + 1);
      if (value === '') {
        error = `${CANDIDATE_FLAG} needs an artifact path.`;
      } else {
        paths.push(value);
      }
    } else {
      rest.push(argument);
    }
  }
  if (!error && paths.length > 1) {
    error = `${CANDIDATE_FLAG} may be given once.`;
  }
  if (error) {
    return { argv: rest, candidate: { error } };
  }
  return { argv: rest, candidate: paths.length === 1 ? { path: paths[0] } : undefined };
};

// The candidate's resolution, read from a path resolved against the working directory. Its candidate
// root is removed when the process exits, however the run ends.
const resolveCandidate = (candidatePath) => {
  let artifactBytes;
  try {
    artifactBytes = fs.readFileSync(path.resolve(candidatePath));
  } catch (error) {
    throw new Error(`Cannot read the registry candidate ${candidatePath}: ${error.message}`);
  }
  const registryResolution = resolveCandidateRegistrySet({ artifactBytes });
  process.once('exit', registryResolution.dispose);
  return registryResolution;
};

// Returns `{ registryResolution, usageRegistryRoots }` or `{ registryResolutionError, usageRegistryRoots }`.
// `candidate` is `extractRegistryCandidateArgument`'s result.
export const resolveCliRegistrySet = (repositoryRoot, { candidate } = {}) => {
  try {
    if (candidate?.error) {
      throw new Error(candidate.error);
    }
    const registryResolution = candidate
      ? resolveCandidate(candidate.path)
      : resolveActiveRegistrySet({ targetRoot: repositoryRoot });
    return { registryResolution, usageRegistryRoots: registryResolution.registryRoots };
  } catch (error) {
    return { registryResolutionError: error, usageRegistryRoots: getBuiltinRegistryRoots() };
  }
};
