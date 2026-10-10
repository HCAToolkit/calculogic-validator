import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryBinPath = path.join(packageRoot, 'bin/calculogic-validator-registry.host.mjs');
const validateNamingScriptPath = path.join(packageRoot, 'scripts/validate-naming.host.mjs');
const validateAllScriptPath = path.join(packageRoot, 'scripts/validate-all.host.mjs');
const validateTreeScriptPath = path.join(packageRoot, 'scripts/validate-tree.host.mjs');

const run = (scriptPath, args, cwd) =>
  spawnSync(process.execPath, ['--experimental-strip-types', scriptPath, ...args], {
    cwd,
    encoding: 'utf8',
  });

// A minimal consumer repository: package.json marks the validation target root.
const withTargetRepository = (runTest) => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-lifecycle-cli-'));

  try {
    fs.writeFileSync(path.join(targetRoot, 'package.json'), '{"name":"fixture","private":true}\n');
    fs.mkdirSync(path.join(targetRoot, 'src'));
    fs.writeFileSync(path.join(targetRoot, 'src', 'app.logic.ts'), 'export {};\n');
    return runTest(targetRoot);
  } finally {
    fs.rmSync(targetRoot, { recursive: true, force: true });
  }
};

test('package.json declares the registry lifecycle bin and repository scripts', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));

  assert.equal(packageJson.bin['calculogic-validator-registry'], './bin/calculogic-validator-registry.host.mjs');
  assert.match(packageJson.scripts['registry:init-custom'], /registry-lifecycle\.host\.mjs init-custom$/u);
  assert.match(packageJson.scripts['registry:status'], /registry-lifecycle\.host\.mjs status$/u);
});

test('status prints the Builtin-only state as JSON without writing lifecycle files', () => {
  withTargetRepository((targetRoot) => {
    const result = run(registryBinPath, ['status'], targetRoot);

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      activeSet: 'builtin',
      customExists: false,
      customDiffers: false,
      orphanRegistries: [],
      customIssues: [],
      registries: [],
    });
    assert.equal(fs.existsSync(path.join(targetRoot, '.calculogic')), false);
  });
});

test('init-custom creates the Custom set once, keeps Builtin active, and refuses a second run', () => {
  withTargetRepository((targetRoot) => {
    const first = run(registryBinPath, ['init-custom'], targetRoot);
    assert.equal(first.status, 0, first.stderr);
    const firstOutput = JSON.parse(first.stdout);
    assert.equal(firstOutput.command, 'init-custom');
    assert.equal(fs.realpathSync(firstOutput.customRoot), fs.realpathSync(path.join(targetRoot, '.calculogic/registries/custom')));
    assert.equal(firstOutput.stateFileCreated, true);

    const status = JSON.parse(run(registryBinPath, ['status'], targetRoot).stdout);
    assert.equal(status.activeSet, 'builtin');
    assert.equal(status.customExists, true);
    assert.equal(status.customDiffers, false);
    assert.equal(status.registries.length, firstOutput.registryCount);
    assert.ok(status.registries.every((entry) => entry.classification === 'unchanged'));

    const second = run(registryBinPath, ['init-custom'], targetRoot);
    assert.equal(second.status, 1);
    assert.equal(second.stdout, '');
    assert.match(second.stderr, /A Custom registry set already exists/u);
  });
});

test('use is not available while Custom activation is gated', () => {
  withTargetRepository((targetRoot) => {
    const result = run(registryBinPath, ['use', 'custom'], targetRoot);

    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /"use" is not available yet/u);
  });
});

test('usage errors go to stderr; help goes to stdout', () => {
  withTargetRepository((targetRoot) => {
    const missing = run(registryBinPath, [], targetRoot);
    assert.equal(missing.status, 1);
    assert.equal(missing.stdout, '');
    assert.match(missing.stderr, /Missing command\./u);

    const unknown = run(registryBinPath, ['nope'], targetRoot);
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /Unknown command: nope/u);

    const extra = run(registryBinPath, ['status', '--json'], targetRoot);
    assert.equal(extra.status, 1);
    assert.match(extra.stderr, /Unexpected arguments for "status"/u);

    const help = run(registryBinPath, ['--help'], targetRoot);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Usage: calculogic-validator-registry <command>/u);
  });
});

test('validation runs report an inactive Custom set and keep Builtin provenance', () => {
  withTargetRepository((targetRoot) => {
    assert.equal(run(registryBinPath, ['init-custom'], targetRoot).status, 0);
    const extensionsPath = path.join(
      targetRoot,
      '.calculogic/registries/custom/naming/reportable-extensions.registry.json',
    );
    const extensions = JSON.parse(fs.readFileSync(extensionsPath, 'utf8'));
    extensions.reportableExtensions.push('.py');
    fs.writeFileSync(extensionsPath, JSON.stringify(extensions, null, 2));

    const result = run(validateNamingScriptPath, ['--scope=repo'], targetRoot);
    assert.ok([0, 1, 2].includes(result.status), result.stderr);
    const report = JSON.parse(result.stdout);

    assert.equal(report.registrySet.activeSet, 'builtin');
    assert.equal(report.registrySet.customExists, true);
    assert.equal(report.registrySet.customDiffers, true);
    assert.equal(report.registrySource, 'builtin');
    assert.equal(report.registryDigests.resolved, report.registryDigests.builtin);
    assert.notEqual(report.registryDigests.custom, report.registryDigests.builtin);
    assert.equal(report.registryProvenance['naming/reportable-extensions'].source, 'builtin');
  });
});

test('a state selecting custom stops every validation entry point with no report', () => {
  withTargetRepository((targetRoot) => {
    assert.equal(run(registryBinPath, ['init-custom'], targetRoot).status, 0);
    fs.writeFileSync(
      path.join(targetRoot, '.calculogic/registries/registry-state.json'),
      '{"schemaVersion":"1","activeSet":"custom"}\n',
    );

    for (const scriptPath of [validateNamingScriptPath, validateAllScriptPath, validateTreeScriptPath]) {
      const result = run(scriptPath, ['--scope=repo'], targetRoot);

      assert.equal(result.status, 1, path.basename(scriptPath));
      assert.equal(result.stdout, '', path.basename(scriptPath));
      assert.match(result.stderr, /Custom activation is not available yet/u, path.basename(scriptPath));
    }

    const status = run(registryBinPath, ['status'], targetRoot);
    assert.equal(status.status, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).activeSet, 'custom');
  });
});
