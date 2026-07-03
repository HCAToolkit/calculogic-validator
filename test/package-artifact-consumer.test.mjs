import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));

const run = (command, args, options = {}) =>
  spawnSync(command, args, {
    cwd: options.cwd ?? packageRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
    ...options,
  });

const formatResult = ({ command, args, cwd, result }) => [
  `command: ${[command, ...args].join(' ')}`,
  `working directory: ${cwd}`,
  `exit status: ${result.status}`,
  `stdout:\n${result.stdout}`,
  `stderr:\n${result.stderr}`,
].join('\n');

const assertCommandStatus = ({ command, args, cwd, result, allowedStatuses = [0] }) => {
  assert.ok(
    allowedStatuses.includes(result.status),
    formatResult({ command, args, cwd, result }),
  );
};

const parseJsonOutput = ({ command, args, cwd, result }) => {
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    assert.fail(`${formatResult({ command, args, cwd, result })}\nJSON parse error: ${error.message}`);
  }
};

const writeTemporaryConsumerHost = (hostRoot) => {
  fs.mkdirSync(path.join(hostRoot, 'src', 'configs', 'sample-widget'), { recursive: true });
  fs.mkdirSync(path.join(hostRoot, 'doc', 'nl-config'), { recursive: true });
  fs.writeFileSync(path.join(hostRoot, 'package.json'), `${JSON.stringify({
    name: 'calculogic-validator-artifact-consumer-host',
    version: '0.0.0',
    private: true,
    type: 'module',
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(hostRoot, 'src', 'configs', 'sample-widget', 'sample-widget.build.tsx'), 'export function SampleWidget() { return null; }\n');
  fs.writeFileSync(path.join(hostRoot, 'src', 'configs', 'sample-widget', 'sample-widget.logic.ts'), 'export const sampleWidgetReady = true;\n');
  fs.writeFileSync(path.join(hostRoot, 'doc', 'nl-config', 'cfg-sampleWidget.md'), '# cfg-sampleWidget\n\nSmall consumer fixture for package-artifact validation.\n');
};

const collectReportPaths = (report) => {
  const paths = new Set();
  for (const finding of report.findings ?? []) {
    if (typeof finding.path === 'string') paths.add(finding.path);
    if (typeof finding.filePath === 'string') paths.add(finding.filePath);
  }
  for (const validator of report.validators ?? []) {
    for (const finding of validator.findings ?? []) {
      if (typeof finding.path === 'string') paths.add(finding.path);
      if (typeof finding.filePath === 'string') paths.add(finding.filePath);
    }
  }
  return paths;
};

test('packed validator artifact installs in a clean consumer host and its public bins analyze that host', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'calculogic-validator-artifact-'));
  const packDir = path.join(tempRoot, 'pack');
  const hostRoot = path.join(tempRoot, 'temporary-host');

  try {
    fs.mkdirSync(packDir, { recursive: true });
    fs.mkdirSync(hostRoot, { recursive: true });
    writeTemporaryConsumerHost(hostRoot);

    const packResult = run('npm', ['pack', '--json', '--pack-destination', packDir], { cwd: packageRoot });
    assertCommandStatus({ command: 'npm', args: ['pack', '--json', '--pack-destination', packDir], cwd: packageRoot, result: packResult });
    const packEntries = parseJsonOutput({ command: 'npm', args: ['pack', '--json', '--pack-destination', packDir], cwd: packageRoot, result: packResult });
    assert.equal(Array.isArray(packEntries), true);
    assert.equal(packEntries.length, 1);
    const tarballName = packEntries[0].filename;
    const tarballPath = path.join(packDir, tarballName);
    assert.equal(fs.existsSync(tarballPath), true, `package tarball missing: ${tarballPath}`);

    const packedFiles = new Set(packEntries[0].files.map((entry) => entry.path));
    assert.equal(packedFiles.has('bin/calculogic-validate.host.mjs'), true);
    assert.equal(packedFiles.has('bin/calculogic-validate-naming.host.mjs'), true);
    assert.equal(packedFiles.has('bin/calculogic-validate-tree.host.mjs'), true);
    assert.equal(packedFiles.has('bin/calculogic-validator-health.host.mjs'), true);
    assert.equal([...packedFiles].some((filePath) => filePath === 'test' || filePath.startsWith('test/')), false);
    assert.equal([...packedFiles].some((filePath) => filePath.startsWith('naming/test/')), false);
    assert.equal([...packedFiles].some((filePath) => filePath.startsWith('tree/test/')), false);
    assert.equal([...packedFiles].some((filePath) => filePath.startsWith('structural-addressing/test/')), false);

    const installResult = run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarballPath], { cwd: hostRoot });
    assertCommandStatus({ command: 'npm', args: ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarballPath], cwd: hostRoot, result: installResult });

    const installedPackageRoot = path.join(hostRoot, 'node_modules', '@calculogic', 'validator');
    assert.equal(JSON.parse(fs.readFileSync(path.join(installedPackageRoot, 'package.json'), 'utf8')).name, '@calculogic/validator');
    assert.equal(fs.existsSync(path.join(installedPackageRoot, 'test')), false);
    assert.equal(fs.existsSync(path.join(installedPackageRoot, 'naming', 'test')), false);
    assert.equal(fs.existsSync(path.join(installedPackageRoot, 'tree', 'test')), false);
    assert.equal(fs.existsSync(path.join(installedPackageRoot, 'structural-addressing', 'test')), false);

    const expectedHostEvidencePaths = [
      'package.json',
      'src/configs/sample-widget/sample-widget.build.tsx',
      'src/configs/sample-widget/sample-widget.logic.ts',
      'doc/nl-config/cfg-sampleWidget.md',
    ];

    const binCases = [
      { bin: 'calculogic-validate-naming', args: ['--scope=repo'] },
      { bin: 'calculogic-validate', args: ['--scope=repo'] },
      { bin: 'calculogic-validate-tree', args: ['--scope=repo'] },
    ];

    for (const binCase of binCases) {
      assert.equal(typeof packageJson.bin[binCase.bin], 'string');
    }

    for (const binCase of binCases) {
      const binPath = path.join(hostRoot, 'node_modules', '.bin', binCase.bin);
      const result = run(binPath, binCase.args, { cwd: hostRoot });
      assertCommandStatus({ command: binPath, args: binCase.args, cwd: hostRoot, result, allowedStatuses: [0, 1, 2] });
      const report = parseJsonOutput({ command: binPath, args: binCase.args, cwd: hostRoot, result });
      assert.equal(report.scope, 'repo');
      const reportPaths = collectReportPaths(report);
      if (reportPaths.size > 0) {
        assert.ok(
          expectedHostEvidencePaths.some((evidencePath) => reportPaths.has(evidencePath)),
          `${formatResult({ command: binPath, args: binCase.args, cwd: hostRoot, result })}\nExpected report paths to include one of: ${expectedHostEvidencePaths.join(', ')}\nActual paths: ${[...reportPaths].sort().join(', ')}`,
        );
        assert.equal([...reportPaths].some((reportedPath) => reportedPath.includes('node_modules/@calculogic/validator')), false);
        assert.equal([...reportPaths].some((reportedPath) => path.isAbsolute(reportedPath) && reportedPath.startsWith(packageRoot)), false);
      } else {
        const scannedCount = report.totalFilesScanned ?? report.validators?.[0]?.totalFilesScanned;
        assert.equal(scannedCount, expectedHostEvidencePaths.length + 1);
      }
    }

    const healthBin = path.join(hostRoot, 'node_modules', '.bin', 'calculogic-validator-health');
    const healthResult = run(healthBin, [], { cwd: hostRoot });
    assertCommandStatus({ command: healthBin, args: [], cwd: hostRoot, result: healthResult });
    assert.match(healthResult.stdout, /Validator package health check passed/u);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
