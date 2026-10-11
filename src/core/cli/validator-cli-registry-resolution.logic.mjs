// One registry lifecycle resolution per CLI invocation (#41 registry lifecycle, spec §6).
// Validator CLI hosts resolve once and share the result between usage text (scope lists come from
// the resolved suite registries) and the run. A failed resolution is kept, not thrown: usage then
// uses Builtin roots so `--help` still works, and the run reports the lifecycle error before any
// report.
import {
  getBuiltinRegistryRoots,
  resolveActiveRegistrySet,
} from '../registry-lifecycle/registry-lifecycle-resolution.logic.mjs';

// Returns `{ registryResolution, usageRegistryRoots }` or `{ registryResolutionError, usageRegistryRoots }`.
export const resolveCliRegistrySet = (repositoryRoot) => {
  try {
    const registryResolution = resolveActiveRegistrySet({ targetRoot: repositoryRoot });
    return { registryResolution, usageRegistryRoots: registryResolution.registryRoots };
  } catch (error) {
    return { registryResolutionError: error, usageRegistryRoots: getBuiltinRegistryRoots() };
  }
};
