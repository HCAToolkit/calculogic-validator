/**
 * Suite core's registry-set validation entry point (#41 registry lifecycle, spec §9.3).
 *
 * Runs the suite registries' own shape validation over one suite registry root and returns a
 * deterministic list of `{ registryId, detail }` failures. It builds no runtime state.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadExitPolicyRegistryFromPayload } from './validator-exit-policy.logic.mjs';
import { loadScopeProfilesFromRegistryRoot } from '../core/validator-scopes.logic.mjs';
import { assertNoPaddedStrings, assertRegistryRootFields } from '../core/registry-entry-shape.logic.mjs';

// Root fields of each suite registry besides `version`. Payload roots are closed: a loader ignores
// an undeclared root field, so it would pass validation and never reach runtime.
const SUITE_REGISTRY_ROOT_FIELDS = Object.freeze({
  'exit-policy': ['policies'],
  'scope-profiles': ['profiles'],
});

const readRegistryPayload = (registryRoot, name) =>
  JSON.parse(fs.readFileSync(path.join(registryRoot, `${name}.registry.json`), 'utf8'));

export const validateSuiteRegistrySet = (registryRoot) => {
  const checks = [
    ['exit-policy', () => loadExitPolicyRegistryFromPayload(readRegistryPayload(registryRoot, 'exit-policy'))],
    ['scope-profiles', () => loadScopeProfilesFromRegistryRoot(registryRoot)],
  ];
  const failures = [];

  for (const [name, check] of checks) {
    const registryId = `suite/${name}`;
    try {
      const payload = readRegistryPayload(registryRoot, name);
      assertRegistryRootFields(payload, SUITE_REGISTRY_ROOT_FIELDS[name], { registryLabel: name });
      assertNoPaddedStrings(payload, { registryLabel: name });
      check();
    } catch (error) {
      failures.push({ registryId, detail: error.message });
    }
  }

  return failures;
};
