import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import caseRulesRegistry from '../src/registries/_builtin/case-rules.registry.json' with { type: 'json' };
import { resolveNamingRegistryInputs } from '../src/registries/registry-state.logic.mjs';
import { NAMING_BUILTIN_REGISTRY_ROOT } from '../src/registries/naming-registry-inventory.knowledge.mjs';
import { toCaseRulesRuntime } from '../src/naming-runtime-converters.logic.mjs';
import { getSemanticNameCaseRule } from '../src/rules/naming-rule-check-semantic-case.logic.mjs';
import { isCanonicalSemanticName } from '../src/rules/naming-rule-check-semantic-case.logic.mjs';

const getPreparedCaseRulesRuntime = () => {
  const registryInputs = resolveNamingRegistryInputs();
  return toCaseRulesRuntime(registryInputs.caseRules);
};

test('semantic-name case rule runtime is sourced from builtin registry style', () => {
  const semanticCaseRule = getSemanticNameCaseRule(getPreparedCaseRulesRuntime());

  assert.equal(semanticCaseRule.style, caseRulesRegistry.semanticName.style);
  assert.equal(semanticCaseRule.style, 'kebab-case');
  assert.equal(semanticCaseRule.pattern.test('left-panel'), true);
  assert.equal(semanticCaseRule.pattern.test('leftPanel'), false);
});

test('kebab-case semantic names are canonical', () => {
  const caseRulesRuntime = getPreparedCaseRulesRuntime();
  assert.equal(isCanonicalSemanticName('leftpanel', caseRulesRuntime), true);
  assert.equal(isCanonicalSemanticName('left-panel', caseRulesRuntime), true);
  assert.equal(isCanonicalSemanticName('left-panel-v2', caseRulesRuntime), true);
  assert.equal(isCanonicalSemanticName('v2-left-panel', caseRulesRuntime), true);
});

test('non-kebab semantic names are non-canonical', () => {
  const caseRulesRuntime = getPreparedCaseRulesRuntime();
  assert.equal(isCanonicalSemanticName('LeftPanel', caseRulesRuntime), false);
  assert.equal(isCanonicalSemanticName('leftPanel', caseRulesRuntime), false);
  assert.equal(isCanonicalSemanticName('left_panel', caseRulesRuntime), false);
  assert.equal(isCanonicalSemanticName('left..panel', caseRulesRuntime), false);
  assert.equal(isCanonicalSemanticName('left--panel', caseRulesRuntime), false);
});

// Builds a complete Naming registry root (a copy of Builtin) with the given case-rules payload.
const withCaseRulesRegistryRoot = (caseRules, run) => {
  const registryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'case-rules-registry-'));

  try {
    fs.cpSync(NAMING_BUILTIN_REGISTRY_ROOT, registryRoot, { recursive: true });
    fs.writeFileSync(
      path.join(registryRoot, 'case-rules.registry.json'),
      JSON.stringify(caseRules, null, 2),
    );
    return run(registryRoot);
  } finally {
    fs.rmSync(registryRoot, { recursive: true, force: true });
  }
};

test('case rules are read from the resolved registry root', () => {
  withCaseRulesRegistryRoot(
    { version: '1', semanticName: { style: '  kebab-case  ' } },
    (registryRoot) => {
      const result = resolveNamingRegistryInputs({ registryRoot });
      assert.deepEqual(result.caseRules, { semanticName: { style: 'kebab-case' } });
    },
  );
});

test('unsupported case-rules style is rejected when the registry loads', () => {
  withCaseRulesRegistryRoot(
    { version: '1', semanticName: { style: 'snake_case' } },
    (registryRoot) => {
      assert.throws(
        () => resolveNamingRegistryInputs({ registryRoot }),
        /Invalid case-rules registry: semanticName\.style must be one of kebab-case\./u,
      );
    },
  );
});

test('the case-rules runtime still rejects an unsupported style passed to it directly', () => {
  assert.throws(
    () => toCaseRulesRuntime({ semanticName: { style: 'snake_case' } }),
    /Unsupported semantic-name style in case rules runtime: snake_case/u,
  );
});
