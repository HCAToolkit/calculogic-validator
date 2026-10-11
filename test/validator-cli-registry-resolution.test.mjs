import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveCliRegistrySet } from '../src/core/cli/validator-cli-registry-resolution.logic.mjs';
import { buildDirectValidatorRunnerUsageLines } from '../src/core/cli/validator-cli-direct.logic.mjs';
import { buildNamingCliUsageLines } from '../naming/src/cli/naming-cli-usage.logic.mjs';
import { getBuiltinRegistryRoots } from '../src/core/registry-lifecycle/registry-lifecycle-resolution.logic.mjs';
import { RegistryLifecycleError } from '../src/core/registry-lifecycle/registry-lifecycle-state.logic.mjs';
import { SUITE_BUILTIN_REGISTRY_ROOT } from '../src/registries/suite-registry-inventory.knowledge.mjs';

const withTargetRoot = (run) => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'validator-cli-registry-resolution-'));
  try {
    return run(targetRoot);
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
};

test('one CLI resolution serves usage and the run; a failed one keeps Builtin usage roots', () => {
  withTargetRoot((targetRoot) => {
    const resolved = resolveCliRegistrySet(targetRoot);
    assert.equal(resolved.registryResolution.activeSet, 'builtin');
    assert.equal(resolved.usageRegistryRoots, resolved.registryResolution.registryRoots);
    assert.equal(resolved.registryResolutionError, undefined);

    const statePath = path.join(targetRoot, '.calculogic', 'registries', 'registry-state.json');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, '{"schemaVersion":"1","activeSet":"custom"}\n');

    const failed = resolveCliRegistrySet(targetRoot);
    assert.ok(failed.registryResolutionError instanceof RegistryLifecycleError);
    assert.equal(failed.registryResolution, undefined);
    assert.deepEqual(failed.usageRegistryRoots, getBuiltinRegistryRoots());
  });
});

test('usage text reads scope profiles from the supplied registry roots', () => {
  withTargetRoot((targetRoot) => {
    const suiteRoot = path.join(targetRoot, 'suite');
    fs.cpSync(SUITE_BUILTIN_REGISTRY_ROOT, suiteRoot, { recursive: true });
    const registryRoots = { ...getBuiltinRegistryRoots(), suite: suiteRoot };
    const directUsage = () =>
      buildDirectValidatorRunnerUsageLines({
        validatorId: 'tree-structure-advisor',
        defaultScopeLine: '',
        examples: [],
        repositoryRoot: targetRoot,
        registryRoots,
      });
    const namingUsage = () => buildNamingCliUsageLines({ repositoryRoot: targetRoot, registryRoots });

    assert.ok(directUsage().some((line) => line.startsWith('  - app:')));
    assert.ok(namingUsage().some((line) => line.startsWith('  - app:')));

    // Builtin is intact, so usage that read Builtin would not fail.
    fs.writeFileSync(path.join(suiteRoot, 'scope-profiles.registry.json'), '{ broken');
    assert.throws(directUsage, SyntaxError);
    assert.throws(namingUsage, SyntaxError);
  });
});
