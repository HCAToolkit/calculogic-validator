import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { VALIDATOR_REPORT_EXAMPLE_FILES } from '../src/core/cli/validator-report-examples.logic.mjs';

const runExampleGenerator = (outDir) =>
  spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      'scripts/generate-validator-report-examples.host.mjs',
      `--out-dir=${outDir}`,
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const assertCommonEnvelope = (report) => {
  assert.equal(report.mode, 'report');
  assert.equal(report.startedAt, '<iso-startedAt>');
  assert.equal(report.endedAt, '<iso-endedAt>');
  assert.equal(report.durationMs, 0);
  assert.ok(report.sourceSnapshot && typeof report.sourceSnapshot === 'object');
  assert.equal(report.sourceSnapshot.repositoryRoot, '<repository-root>');

  if (typeof report.sourceSnapshot.gitHeadSha === 'string') {
    assert.equal(report.sourceSnapshot.gitHeadSha, '<git-head-sha>');
  }

  if (report.sourceSnapshot.diagnostics) {
    assert.deepEqual(report.sourceSnapshot.diagnostics, {
      isDirty: false,
      changedCount: 0,
      untrackedCount: 0,
    });
  }
};

test('validator report example generator emits deterministic naming and runner examples', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validator-report-examples-'));

  const result = runExampleGenerator(outDir);
  assert.equal(result.status, 0, result.stderr);

  const namingFile = path.join(outDir, 'validate-naming.system.report.example.json');
  const runnerFile = path.join(outDir, 'validate-all.system.naming.report.example.json');

  assert.ok(fs.existsSync(namingFile));
  assert.ok(fs.existsSync(runnerFile));

  const namingReport = readJson(namingFile);
  const runnerReport = readJson(runnerFile);

  assertCommonEnvelope(namingReport);
  assert.equal(namingReport.validatorId, 'naming');
  assert.ok(Array.isArray(namingReport.findings));

  assertCommonEnvelope(runnerReport);
  assert.equal(runnerReport.validatorId, 'runner');
  assert.ok(Array.isArray(runnerReport.validators));
  assert.equal(runnerReport.validators.length, 1);
  assert.equal(runnerReport.validators[0].validatorId, 'naming');

  const secondResult = runExampleGenerator(outDir);
  assert.equal(secondResult.status, 0, secondResult.stderr);

  const namingReportSecond = readJson(namingFile);
  const runnerReportSecond = readJson(runnerFile);

  assert.deepEqual(namingReportSecond, namingReport);
  assert.deepEqual(runnerReportSecond, runnerReport);
});

test('checked-in generated report examples match current generator output', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validator-report-examples-checked-in-'));

  const result = runExampleGenerator(outDir);
  assert.equal(result.status, 0, result.stderr);

  const generatedNaming = readJson(path.join(outDir, 'validate-naming.system.report.example.json'));
  const generatedRunner = readJson(path.join(outDir, 'validate-all.system.naming.report.example.json'));

  const checkedInNaming = readJson(
    'test/fixtures/report-examples/validate-naming.system.report.example.json',
  );
  const checkedInRunner = readJson(
    'test/fixtures/report-examples/validate-all.system.naming.report.example.json',
  );

  assert.deepEqual(checkedInNaming, generatedNaming);
  assert.deepEqual(checkedInRunner, generatedRunner);
});

// Regression coverage for the silent no-op: the generator used to run only when
// `import.meta.url === \`file://${process.argv[1]}\``, so any invocation where those differed
// (a symlinked path, a path needing URL encoding such as one with a space, or Windows drive paths)
// exited 0 without writing anything. Each case below asserts both example files are actually
// written and valid, not merely that the process exited 0.
const assertBothExamplesGenerated = (outDir, result) => {
  assert.equal(result.status, 0, result.stderr);

  const namingFile = path.join(outDir, VALIDATOR_REPORT_EXAMPLE_FILES.naming);
  const runnerFile = path.join(outDir, VALIDATOR_REPORT_EXAMPLE_FILES.runner);
  assert.ok(fs.existsSync(namingFile), `expected ${namingFile} to be written`);
  assert.ok(fs.existsSync(runnerFile), `expected ${runnerFile} to be written`);
  assert.deepEqual(fs.readdirSync(outDir).sort(), Object.values(VALIDATOR_REPORT_EXAMPLE_FILES).sort());

  const namingReport = readJson(namingFile);
  const runnerReport = readJson(runnerFile);
  assertCommonEnvelope(namingReport);
  assert.equal(namingReport.validatorId, 'naming');
  assertCommonEnvelope(runnerReport);
  assert.equal(runnerReport.validatorId, 'runner');
  assert.match(result.stdout, /Wrote 2 report examples to /u);
};

const hostRelativePath = path.join('scripts', 'generate-validator-report-examples.host.mjs');

test('npm run report:examples:validator writes both report examples', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'validator-report-examples-npm-'));

  try {
    const outDir = path.join(tempRoot, 'out');
    const result = spawnSync('npm', ['run', '-s', 'report:examples:validator', '--', `--out-dir=${outDir}`], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    assertBothExamplesGenerated(outDir, result);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('generator writes both report examples when invoked through a symlinked checkout path', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'validator-report-examples-symlink-'));

  try {
    const linkedCheckout = path.join(tempRoot, 'linked-checkout');
    fs.symlinkSync(process.cwd(), linkedCheckout, 'dir');
    const outDir = path.join(tempRoot, 'out');

    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', path.join(linkedCheckout, hostRelativePath), `--out-dir=${outDir}`],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    assertBothExamplesGenerated(outDir, result);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

// The case a symlinked path alone does not cover: a consumer repository's working directory. The
// generator must take its development root from where its own code lives, not from the caller's
// package.json, and resolve a relative --out-dir from the caller's directory.
test('generator run through a linked path from a consumer directory uses the Validator checkout, not the consumer', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'validator-report-examples-consumer-'));

  try {
    const consumerRoot = path.join(tempRoot, 'consumer');
    const linkedValidator = path.join(consumerRoot, 'node_modules', '@calculogic', 'validator');
    fs.mkdirSync(path.dirname(linkedValidator), { recursive: true });
    fs.writeFileSync(path.join(consumerRoot, 'package.json'), '{"name":"consumer","private":true}\n');
    fs.symlinkSync(process.cwd(), linkedValidator, 'dir');

    const result = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        path.join('node_modules', '@calculogic', 'validator', hostRelativePath),
        '--out-dir=examples-out',
      ],
      { cwd: consumerRoot, encoding: 'utf8' },
    );

    assertBothExamplesGenerated(path.join(consumerRoot, 'examples-out'), result);
    assert.deepEqual(fs.readdirSync(consumerRoot).sort(), ['examples-out', 'node_modules', 'package.json']);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('generator refuses to refresh default fixtures outside a development checkout', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'validator-report-examples-installed-'));

  try {
    // Shaped like an installed package: runtime directories only, no test/.
    const installedCopy = path.join(tempRoot, 'installed-validator');
    for (const entry of ['package.json', 'scripts', 'src', 'naming', 'tree', 'structural-addressing']) {
      fs.cpSync(entry, path.join(installedCopy, entry), { recursive: true });
    }

    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', path.join(installedCopy, hostRelativePath)],
      { cwd: tempRoot, encoding: 'utf8' },
    );

    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /is not a Validator development checkout/u);
    assert.equal(result.stdout, '');
    assert.equal(fs.existsSync(path.join(installedCopy, 'test')), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('generator writes both report examples from a checkout path containing a space', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'validator-report-examples-space-'));

  try {
    const checkoutWithSpace = path.join(tempRoot, 'checkout with space');
    for (const entry of ['package.json', 'scripts', 'src', 'naming', 'tree', 'structural-addressing']) {
      fs.cpSync(entry, path.join(checkoutWithSpace, entry), { recursive: true });
    }
    const outDir = path.join(tempRoot, 'out');

    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', hostRelativePath, `--out-dir=${outDir}`],
      { cwd: checkoutWithSpace, encoding: 'utf8' },
    );

    assertBothExamplesGenerated(outDir, result);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

// Imported from an otherwise empty project: if importing ran the generator, it would resolve that
// project as the repository root and write its default test/fixtures/report-examples/ there. (Run
// inside this repository, an accidental run would rewrite the checked-in fixtures with identical
// content and go unnoticed.)
test('importing the report examples module does not run the generator or write files', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'validator-report-examples-import-'));

  try {
    fs.writeFileSync(path.join(tempRoot, 'package.json'), '{"name":"import-probe","private":true}\n');
    const moduleUrl = new URL('../src/core/cli/validator-report-examples.logic.mjs', import.meta.url).href;

    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', `await import(${JSON.stringify(moduleUrl)});`],
      { cwd: tempRoot, encoding: 'utf8' },
    );

    assert.equal(result.status, 0, result.stderr);
    // A generator run would either write files and print a "Wrote" line, or fail to find the
    // Validator scripts in this empty project and report that on stderr. Import must do neither.
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    assert.deepEqual(fs.readdirSync(tempRoot), ['package.json']);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
