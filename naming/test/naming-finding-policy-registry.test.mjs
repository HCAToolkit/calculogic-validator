import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadFindingPolicyFromFile } from '../src/registries/naming-finding-policy-registry.logic.mjs';
import { resolveNamingRegistryInputs } from '../src/registries/registry-state.logic.mjs';
import {
  toNamingRolesRuntime,
  toMissingRolePatternsRuntime,
  toCaseRulesRuntime,
} from '../src/naming-runtime-converters.logic.mjs';
import { classifyPath } from '../src/naming-validator.logic.mjs';

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

test('finding-policy registry loader canonicalizes and validates payload shape', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'naming-finding-policy-'));
  const filePath = path.join(tempRoot, 'finding-policy.registry.json');

  try {
    const builtinOutcomes = JSON.parse(
      fs.readFileSync(new URL('../src/registries/_builtin/finding-policy.registry.json', import.meta.url), 'utf8'),
    ).outcomes;
    writeJson(filePath, {
      outcomes: { ...builtinOutcomes, canonical: { ...builtinOutcomes.canonical, message: '  Filename is canonical.  ' } },
    });

    const policy = loadFindingPolicyFromFile(filePath);
    assert.deepEqual(Object.keys(policy), Object.keys(builtinOutcomes).sort((a, b) => a.localeCompare(b)));
    assert.equal(policy.canonical.message, 'Filename is canonical.');

    // Every runtime outcome needs a policy, and severities follow the report schema.
    writeJson(filePath, { outcomes: { canonical: builtinOutcomes.canonical } });
    assert.throws(() => loadFindingPolicyFromFile(filePath), /missing outcomes allowed-special-case, /u);
    writeJson(filePath, {
      outcomes: { ...builtinOutcomes, canonical: { ...builtinOutcomes.canonical, severity: 'error' } },
    });
    assert.throws(() => loadFindingPolicyFromFile(filePath), /canonical\.severity must be one of info, warn/u);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('missing outcome policy entry fails deterministically during classification', () => {
  const registryInputs = resolveNamingRegistryInputs({ config: {} });

  assert.throws(
    () =>
      classifyPath(
        'src/rightpanel.results-style.css',
        toNamingRolesRuntime(registryInputs.roles),
        toMissingRolePatternsRuntime(registryInputs.missingRolePatterns),
        new Map(),
        toCaseRulesRuntime(registryInputs.caseRules),
      ),
    /Missing naming finding policy for outcome "canonical"/u,
  );
});
