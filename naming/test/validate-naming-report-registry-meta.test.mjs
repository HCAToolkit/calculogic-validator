import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const digestPattern = /^[a-f0-9]{64}$/u;

const assertRegistryDigestShape = (registryDigests) => {
  assert.ok(registryDigests);
  assert.match(registryDigests.builtin, digestPattern);
  assert.match(registryDigests.custom, digestPattern);
  assert.match(registryDigests.resolved, digestPattern);
};

test('validate-naming script report includes registry metadata fields', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      'scripts/validate-naming.host.mjs',
      '--scope=system',
    ],
    { cwd: process.cwd(), encoding: 'utf8' },
  );

  assert.ok([0, 1, 2].includes(result.status));
  const report = JSON.parse(result.stdout);

  assert.equal(report.validatorId, 'naming');
  assert.ok(report.sourceSnapshot);
  assert.match(report.registryState, /^(builtin|custom)$/u);
  assert.match(report.registrySource, /^(builtin|custom)$/u);
  assertRegistryDigestShape(report.registryDigests);
});

test('validate-naming bin report aligns envelope and includes registry metadata fields', () => {
  const result = spawnSync(
    process.execPath,
    ['bin/calculogic-validate-naming.host.mjs', '--scope=system'],
    { cwd: process.cwd(), encoding: 'utf8' },
  );

  assert.ok([0, 1, 2].includes(result.status));
  const report = JSON.parse(result.stdout);

  assert.equal(report.validatorId, 'naming');
  assert.ok(report.sourceSnapshot);

  if (report.toolVersion) {
    assert.equal(typeof report.validatorVersion, 'string');
    assert.ok(report.validatorVersion.length > 0);
  }

  assert.match(report.registryState, /^(builtin|custom)$/u);
  assert.match(report.registrySource, /^(builtin|custom)$/u);
  assertRegistryDigestShape(report.registryDigests);
});

test('validate-naming with config includes configDigest and keeps lifecycle-derived registry source metadata', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      'scripts/validate-naming.host.mjs',
      '--scope=system',
      '--config=test/fixtures/validator-config.contracts.json',
    ],
    { cwd: process.cwd(), encoding: 'utf8' },
  );

  assert.ok([0, 1, 2].includes(result.status));
  const report = JSON.parse(result.stdout);

  assert.equal(typeof report.configDigest, 'string');
  assert.match(report.configDigest, digestPattern);
  assert.equal(report.scopeSummary?.scope, report.scope);
  assert.equal(report.scopeSummary?.findingsGenerated, report.findings.length);
  assert.equal(typeof report.scopeContract?.description, 'string');

  // Config no longer selects or overlays registries (#41); the transitional fields mirror the
  // lifecycle's active set.
  assert.equal(report.registrySource, report.registrySet.activeSet);
  assert.equal(report.registryState, report.registrySet.activeSet);
});
