import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const verifierScriptPath = path.resolve('scripts/report-capture-verify.host.mjs');

const runVerifier = ({ reportsDir, scopes, cwd }) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [verifierScriptPath, `--scopes=${scopes.join(',')}`], {
      cwd,
      env: {
        ...process.env,
        REPORTS_DIR: reportsDir,
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });

test('report-capture verifier emits and validates docs scope report in custom reports dir', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-capture-verify-'));

  try {
    const result = await runVerifier({
      reportsDir: tempDir,
      scopes: ['docs'],
    });

    assert.equal(result.exitCode, 0, result.stderr || result.stdout);

    const files = fs.readdirSync(tempDir).filter((name) => /^naming-docs-.*\.txt$/u.test(name));
    assert.equal(files.length, 1, `expected one report file, got ${files.join(',')}`);

    const reportPath = path.join(tempDir, files[0]);
    const parsedReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.equal(parsedReport.scope, 'docs');
    assert.equal(parsedReport.mode, 'report');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// Regression coverage for the standalone-root off-by-one defect (Refs #23): the verifier's
// repository/tool root resolution must be independent of both the invoking process's cwd and any
// directory named `calculogic-validator` that happens to sit nearby on disk - it previously
// "passed" only by accident, when an unrelated sibling `calculogic-validator` checkout coincided
// with the old (incorrect) two-levels-up path arithmetic. This test builds its own synthetic
// decoy sibling with deliberately non-functional stand-ins for the report-capture tool and the
// naming validator, spawns the verifier with cwd pointed at that decoy's parent, and asserts the
// decoy was never invoked - proving resolution is anchored to the verifier script's own real
// location, not to cwd or to any coincidentally-named nearby directory. This does not depend on
// the surrounding checkout's location and is not satisfied merely by an accidental sibling.
test('report-capture verifier resolves its own real location and is not fooled by an unrelated cwd or a coincidentally named sibling calculogic-validator directory', async () => {
  const decoyParent = fs.mkdtempSync(path.join(os.tmpdir(), 'report-capture-verify-decoy-parent-'));
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-capture-verify-decoy-reports-'));
  const decoyRoot = path.join(decoyParent, 'calculogic-validator');
  const decoyHostPath = path.join(decoyRoot, 'tools', 'report-capture', 'src', 'report-capture.host.mjs');
  const decoyNamingValidatorPath = path.join(decoyRoot, 'scripts', 'validate-naming.host.mjs');

  fs.mkdirSync(path.dirname(decoyHostPath), { recursive: true });
  fs.mkdirSync(path.dirname(decoyNamingValidatorPath), { recursive: true });
  const decoyStub =
    "process.stderr.write('DECOY report-capture tooling was invoked - this indicates the " +
    "standalone root-resolution regression has returned.\\n'); process.exit(1);\n";
  fs.writeFileSync(decoyHostPath, decoyStub);
  fs.writeFileSync(decoyNamingValidatorPath, decoyStub);

  try {
    const result = await runVerifier({
      reportsDir,
      scopes: ['docs'],
      cwd: decoyParent,
    });

    assert.equal(result.exitCode, 0, result.stderr || result.stdout);
    assert.doesNotMatch(result.stderr, /DECOY/u);

    const files = fs.readdirSync(reportsDir).filter((name) => /^naming-docs-.*\.txt$/u.test(name));
    assert.equal(files.length, 1, `expected one report file, got ${files.join(',')}`);

    const parsedReport = JSON.parse(fs.readFileSync(path.join(reportsDir, files[0]), 'utf8'));
    assert.equal(parsedReport.scope, 'docs');
    assert.equal(parsedReport.mode, 'report');
  } finally {
    fs.rmSync(decoyParent, { recursive: true, force: true });
    fs.rmSync(reportsDir, { recursive: true, force: true });
  }
});
