import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BUILTIN_SPECIAL_CASES_REGISTRY_PATH,
  getBuiltinSpecialCaseRules,
  loadNamingSpecialCaseRulesFromRegistryRoot,
} from '../src/registries/naming-special-case-rules-registry.logic.mjs';
import {
  getSpecialCaseType,
  isAllowedSpecialCase,
} from '../src/rules/naming-rule-classify-special-case.logic.mjs';

test('special-case classification stays behavior-preserving with builtin registry rules', () => {
  assert.equal(getSpecialCaseType('README.md'), 'conventional-doc');
  assert.equal(getSpecialCaseType('src/tabs/index.ts'), 'barrel');
  assert.equal(getSpecialCaseType('src/tabs/index.tsx'), 'barrel');
  assert.equal(getSpecialCaseType('test/example.test.ts'), 'test-convention');
  assert.equal(getSpecialCaseType('test/example.spec.tsx'), 'test-convention');
  assert.equal(getSpecialCaseType('types/global.d.ts'), 'ambient-declaration');
  assert.equal(getSpecialCaseType('tsconfig.json'), 'ecosystem-required');
  assert.equal(getSpecialCaseType('tsconfig.app.json'), 'ecosystem-required');
  assert.equal(getSpecialCaseType('vite.config.ts'), 'ecosystem-required');
  assert.equal(getSpecialCaseType('eslint.config.js'), 'ecosystem-required');
  assert.equal(getSpecialCaseType('prettier.config.cjs'), 'ecosystem-required');
  assert.equal(getSpecialCaseType('package.json'), 'ecosystem-required');
  assert.equal(getSpecialCaseType('package-lock.json'), 'ecosystem-required');
  assert.equal(getSpecialCaseType('src/not-special.logic.ts'), null);
});

test('isAllowedSpecialCase remains aligned with getSpecialCaseType', () => {
  assert.equal(isAllowedSpecialCase('README.md'), true);
  assert.equal(isAllowedSpecialCase('package.json'), true);
  assert.equal(isAllowedSpecialCase('src/leftpanel.logic.ts'), false);
});

test('runtime builtin special-case rules are loaded from builtin registry json', () => {
  const registryJson = JSON.parse(fs.readFileSync(BUILTIN_SPECIAL_CASES_REGISTRY_PATH, 'utf8'));
  const runtimeRules = getBuiltinSpecialCaseRules();

  assert.ok(Array.isArray(registryJson.specialCases));
  assert.ok(runtimeRules.length > 0);

  const hasPackageRule = registryJson.specialCases.some(
    (entry) =>
      entry.type === 'ecosystem-required' &&
      Array.isArray(entry.match?.basenameEquals) &&
      entry.match.basenameEquals.includes('package.json'),
  );


  assert.equal(runtimeRules.length, registryJson.specialCases.length);

  assert.equal(hasPackageRule, true);
  assert.equal(getSpecialCaseType('package.json'), 'ecosystem-required');
});

const loadSpecialCasesFromMatches = (matches) => {
  const registryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'naming-special-cases-'));
  try {
    fs.writeFileSync(
      path.join(registryRoot, 'special-cases.registry.json'),
      JSON.stringify({ version: '1', specialCases: matches.map((match) => ({ type: 'barrel', match })) }),
    );
    return loadNamingSpecialCaseRulesFromRegistryRoot(registryRoot);
  } finally {
    fs.rmSync(registryRoot, { recursive: true, force: true });
  }
};

test('a special case must declare exactly one match form', () => {
  assert.throws(
    () => loadSpecialCasesFromMatches([{ basenameEquals: ['index.ts'], suffixEquals: ['.d.ts'] }]),
    /match must declare exactly one of basenameEquals, suffixEquals, regex/u,
  );
  assert.throws(
    () => loadSpecialCasesFromMatches([{ suffixEquals: ['.d.ts'], regex: '^index\\.' }]),
    /match must declare exactly one/u,
  );
  assert.throws(() => loadSpecialCasesFromMatches([{}]), /match must declare exactly one/u);
  assert.throws(() => loadSpecialCasesFromMatches([{ regex: '' }]), /match\.regex must be a non-empty string/u);
  assert.equal(loadSpecialCasesFromMatches([{ regex: '^index\\.' }]).length, 1);
});
