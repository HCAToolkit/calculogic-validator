import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const verifierScriptPath = path.resolve('scripts/report-capture-verify.host.mjs');
const realReportCaptureSrcDir = path.resolve('tools/report-capture/src');

const runVerifier = ({ verifierPath = verifierScriptPath, reportsDir, scopes }) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [verifierPath, `--scopes=${scopes.join(',')}`], {
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

// A functional stand-in for scripts/validate-naming.host.mjs: the real script pulls in the whole
// naming validator, far more than a fixture needs. This satisfies exactly the shape
// report-capture-verify.host.mjs's runScopeVerification checks (mode, scope, findings,
// totalFilesScanned), so a correctly-resolved run produces a genuinely passing report, not just
// "avoided the decoy."
const namingValidatorStandIn =
  "const scopeArg = process.argv.find((arg) => arg.startsWith('--scope='));\n" +
  "const scope = scopeArg ? scopeArg.slice('--scope='.length) : 'unknown';\n" +
  "process.stdout.write(JSON.stringify({ mode: 'report', scope, findings: [], totalFilesScanned: 0 }));\n" +
  'process.exit(0);\n';

// Builds an isolated fixture with the verifier script's own real (symlink-resolved) location
// fully controlled by the test, per the review that changing a spawned child's cwd cannot change
// where the executing module's own file lives - the verifier resolves paths from
// `import.meta.url`, not `process.cwd()`, so only a decoy positioned relative to the *verifier
// script's own copy* can exercise the old off-by-one arithmetic. `workspaceRoot/scripts/` holds
// the verifier copy (`verifierSource`, either the real fixed script or, for control
// verification, the pre-fix source) and a minimal naming-validator stand-in;
// `workspaceRoot/tools/report-capture/src/` holds a byte-for-byte copy of the real, generic
// report-capture tool (copied, not reimplemented, so the fixture exercises the genuine
// contract). When `withDecoySibling` is set, a sibling `calculogic-validator/` directory - at the
// exact position the old two-levels-up arithmetic would look, one level above `workspaceRoot` - is
// also created, containing non-functional stand-ins that write a `decoySentinelPath` marker file
// if ever invoked, so an accidental fall-through to the decoy is unambiguous, independent of
// whatever error message shape results downstream.
const createVerifierFixture = ({ verifierSource, withDecoySibling }) => {
  const fixtureParent = fs.mkdtempSync(path.join(os.tmpdir(), 'report-capture-verify-fixture-'));
  const workspaceRoot = path.join(fixtureParent, 'workspace');
  const workspaceScriptsDir = path.join(workspaceRoot, 'scripts');
  const workspaceReportCaptureSrcDir = path.join(workspaceRoot, 'tools', 'report-capture', 'src');

  fs.mkdirSync(workspaceScriptsDir, { recursive: true });
  fs.cpSync(realReportCaptureSrcDir, workspaceReportCaptureSrcDir, { recursive: true });
  fs.writeFileSync(path.join(workspaceScriptsDir, 'validate-naming.host.mjs'), namingValidatorStandIn);
  fs.writeFileSync(path.join(workspaceScriptsDir, 'report-capture-verify.host.mjs'), verifierSource);

  let decoySentinelPath = null;
  if (withDecoySibling) {
    decoySentinelPath = path.join(fixtureParent, 'decoy-invoked.marker');
    const decoyRoot = path.join(fixtureParent, 'calculogic-validator');
    const decoyHostPath = path.join(decoyRoot, 'tools', 'report-capture', 'src', 'report-capture.host.mjs');
    const decoyNamingValidatorPath = path.join(decoyRoot, 'scripts', 'validate-naming.host.mjs');
    const decoyStub =
      `import fs from 'node:fs';\n` +
      `fs.writeFileSync(${JSON.stringify(decoySentinelPath)}, 'decoy invoked\\n');\n` +
      "process.stderr.write('DECOY report-capture tooling was invoked - the standalone " +
      "root-resolution regression has returned.\\n');\n" +
      'process.exit(1);\n';

    fs.mkdirSync(path.dirname(decoyHostPath), { recursive: true });
    fs.mkdirSync(path.dirname(decoyNamingValidatorPath), { recursive: true });
    fs.writeFileSync(decoyHostPath, decoyStub);
    fs.writeFileSync(decoyNamingValidatorPath, decoyStub);
  }

  return {
    fixtureParent,
    verifierPath: path.join(workspaceScriptsDir, 'report-capture-verify.host.mjs'),
    workspaceReportsDir: path.join(workspaceRoot, '.reports'),
    decoySentinelPath,
    cleanup: () => fs.rmSync(fixtureParent, { recursive: true, force: true }),
  };
};

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

// Regression coverage for the standalone-root off-by-one defect (Refs #23). The verifier resolves
// its repository/tool root from its own file's location (`import.meta.url`), never from
// `process.cwd()` - so the only way to prove immunity to a coincidentally-matching sibling
// `calculogic-validator/` directory is to control where the *verifier script's own copy* actually
// lives on disk and place the decoy at the exact position the old (incorrect) two-levels-up
// arithmetic would look, relative to that real copy - not relative to an arbitrary child-process
// cwd, which the verifier never reads. This is exactly the mechanism the original defect exploited
// (a real, unrelated sibling `calculogic-validator` checkout happening to sit at that position) and
// exactly what an accidental checkout-name or environment-layout coincidence could otherwise make a
// naive test pass "for the wrong reason." See `createVerifierFixture` above for the isolated
// fixture construction. The decoy's report-capture tool and naming validator both write a sentinel
// marker file if ever invoked, so a fall-through to the decoy is unambiguous regardless of what
// downstream error (if any) it happens to produce.
test('report-capture verifier (real, current script) resolves its own real location and ignores a coincidentally matching sibling calculogic-validator directory', async () => {
  const fixture = createVerifierFixture({
    verifierSource: fs.readFileSync(verifierScriptPath, 'utf8'),
    withDecoySibling: true,
  });

  try {
    const result = await runVerifier({
      verifierPath: fixture.verifierPath,
      reportsDir: './.reports',
      scopes: ['docs'],
    });

    // Checked first, and independently of exitCode/stderr shape below: a fall-through to the
    // decoy sibling is the specific defect this test guards against, so it must be reported as
    // exactly that - not folded into a generic exit-code mismatch that could equally mean the
    // fixture itself is broken.
    assert.equal(
      fs.existsSync(fixture.decoySentinelPath),
      false,
      'decoy report-capture/naming-validator stand-ins were invoked - root resolution fell through to the sibling',
    );
    assert.equal(result.exitCode, 0, result.stderr || result.stdout);

    const files = fs
      .readdirSync(fixture.workspaceReportsDir)
      .filter((name) => /^naming-docs-.*\.txt$/u.test(name));
    assert.equal(files.length, 1, `expected one report file under the workspace's own .reports/, got ${files.join(',')}`);

    const parsedReport = JSON.parse(fs.readFileSync(path.join(fixture.workspaceReportsDir, files[0]), 'utf8'));
    assert.equal(parsedReport.scope, 'docs');
    assert.equal(parsedReport.mode, 'report');
  } finally {
    fixture.cleanup();
  }
});
