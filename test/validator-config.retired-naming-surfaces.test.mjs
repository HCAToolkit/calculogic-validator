import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadValidatorConfigFromFile } from '../src/core/config/validator-config.logic.mjs';

// #41 registry lifecycle, slice 2: configuration never carries registry records (lifecycle spec
// §10). Naming's record-carrying config surfaces are rejected, not ignored or bridged.
const RETIRED_SURFACE_MESSAGE =
  /Invalid validator config: "naming" is no longer accepted \(#41\)\..*calculogic-validator-registry init-custom/u;

const RETIRED_NAMING_CONFIGS = [
  ['naming.roles.add', { roles: { add: [{ role: 'provider', category: 'architecture-support', status: 'active' }] } }],
  ['naming.reportableExtensions.add', { reportableExtensions: { add: ['.py'] } }],
  ['naming.caseRules', { caseRules: { semanticName: { style: 'kebab-case' } } }],
  ['an empty naming object', {}],
];

const withTempConfig = (payload, run) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validator-config-retired-'));
  const configPath = path.join(tempDir, 'config.json');

  try {
    fs.writeFileSync(configPath, JSON.stringify(payload));
    return run(configPath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

for (const [label, naming] of RETIRED_NAMING_CONFIGS) {
  test(`config loader rejects ${label} with the Custom registry set as the customization path`, () => {
    withTempConfig({ version: '0.1', naming }, (configPath) => {
      assert.throws(() => loadValidatorConfigFromFile(configPath), RETIRED_SURFACE_MESSAGE);
    });
  });
}

test('the checked-in retired-surface fixtures are rejected', () => {
  for (const fixture of [
    'test/fixtures/validator-config.retired-naming-extensions.json',
    'test/fixtures/validator-config.retired-naming-roles.json',
  ]) {
    assert.throws(
      () => loadValidatorConfigFromFile(fixture, { cwd: process.cwd() }),
      RETIRED_SURFACE_MESSAGE,
    );
  }
});

const runScript = (scriptPath, args) =>
  spawnSync(process.execPath, ['--experimental-strip-types', scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

for (const scriptPath of ['scripts/validate-naming.host.mjs', 'scripts/validate-all.host.mjs']) {
  test(`${path.basename(scriptPath)} stops with no report when config carries naming records`, () => {
    const result = runScript(scriptPath, [
      '--scope=docs',
      '--config=test/fixtures/validator-config.retired-naming-roles.json',
    ]);

    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, RETIRED_SURFACE_MESSAGE);
  });
}
