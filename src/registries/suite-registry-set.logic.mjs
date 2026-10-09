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

export const validateSuiteRegistrySet = (registryRoot) => {
  const checks = [
    [
      'suite/exit-policy',
      () =>
        loadExitPolicyRegistryFromPayload(
          JSON.parse(fs.readFileSync(path.join(registryRoot, 'exit-policy.registry.json'), 'utf8')),
        ),
    ],
    ['suite/scope-profiles', () => loadScopeProfilesFromRegistryRoot(registryRoot)],
  ];
  const failures = [];

  for (const [registryId, check] of checks) {
    try {
      check();
    } catch (error) {
      failures.push({ registryId, detail: error.message });
    }
  }

  return failures;
};
