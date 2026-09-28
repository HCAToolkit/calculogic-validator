#!/usr/bin/env node
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const supportedScopes = ['repo', 'app', 'docs', 'validator', 'system'];

const parseScopes = (argv) => {
  const scopesArg = argv.find((argument) => argument.startsWith('--scopes='));
  if (!scopesArg) {
    return supportedScopes;
  }

  const requestedScopes = scopesArg
    .slice('--scopes='.length)
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);

  if (requestedScopes.length === 0) {
    throw new Error('At least one scope must be provided when using --scopes.');
  }

  const invalidScopes = requestedScopes.filter((scope) => !supportedScopes.includes(scope));
  if (invalidScopes.length > 0) {
    throw new Error(`Invalid scopes: ${invalidScopes.join(', ')}`);
  }

  return requestedScopes;
};

const parseMetadataFromStderr = (stderr) => {
  const metadataLine = stderr
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{') && line.includes('"path"'))
    .at(-1);

  if (!metadataLine) {
    throw new Error('Missing report-capture metadata JSON line on stderr.');
  }

  try {
    return JSON.parse(metadataLine);
  } catch {
    throw new Error(`Malformed report-capture metadata JSON: ${metadataLine}`);
  }
};

const ensurePathInsideDir = (targetPath, expectedDir) => {
  const relative = path.relative(expectedDir, targetPath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

const runScopeVerification = async ({
  scope,
  reportsDir,
  repositoryRoot,
  hostPath,
  namingValidatorPath,
}) => {
  const prefix = `naming-${scope}`;
  const commandArgs = [
    hostPath,
    '--dir',
    reportsDir,
    '--keep',
    '20',
    '--prefix',
    prefix,
    '--json',
    '--',
    process.execPath,
    '--experimental-strip-types',
    namingValidatorPath,
    `--scope=${scope}`,
  ];

  const execution = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, commandArgs, {
      cwd: repositoryRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
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
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });

  const metadata = parseMetadataFromStderr(execution.stderr);
  const expectedDir = path.resolve(repositoryRoot, reportsDir);
  const resolvedMetadataDir = path.resolve(repositoryRoot, metadata.dir);

  if (resolvedMetadataDir !== expectedDir) {
    throw new Error(`Unexpected metadata.dir for ${scope}: ${metadata.dir}`);
  }

  const resolvedReportPath = path.resolve(repositoryRoot, metadata.path);
  if (!ensurePathInsideDir(resolvedReportPath, expectedDir)) {
    throw new Error(`Report path is not inside reports directory for ${scope}: ${metadata.path}`);
  }

  if (typeof metadata.exitCode !== 'number') {
    throw new Error(`Expected numeric metadata.exitCode for ${scope}, got ${metadata.exitCode}`);
  }

  if (metadata.exitCode !== execution.exitCode) {
    throw new Error(
      `Mismatched exit code for ${scope}: metadata.exitCode=${metadata.exitCode}, process.exitCode=${execution.exitCode}`,
    );
  }

  if (typeof metadata.bytes !== 'number' || metadata.bytes <= 0) {
    throw new Error(`Expected positive metadata.bytes for ${scope}, got ${metadata.bytes}`);
  }

  const reportStats = await fs.stat(resolvedReportPath).catch(() => null);
  if (!reportStats || !reportStats.isFile()) {
    throw new Error(`Missing report file for ${scope}: ${resolvedReportPath}`);
  }

  const reportContent = await fs.readFile(resolvedReportPath, 'utf8');
  let parsedReport;
  try {
    parsedReport = JSON.parse(reportContent);
  } catch {
    throw new Error(`Report file is not valid JSON for ${scope}: ${resolvedReportPath}`);
  }

  if (parsedReport.mode !== 'report') {
    throw new Error(`Expected report.mode="report" for ${scope}.`);
  }

  if (parsedReport.scope !== scope) {
    throw new Error(`Expected report.scope="${scope}", received "${parsedReport.scope}".`);
  }

  if (!Array.isArray(parsedReport.findings)) {
    throw new Error(`Expected report.findings array for ${scope}.`);
  }

  if (typeof parsedReport.totalFilesScanned !== 'number') {
    throw new Error(`Expected numeric report.totalFilesScanned for ${scope}.`);
  }

  const relativeReportPath = path.relative(repositoryRoot, resolvedReportPath);
  process.stdout.write(
    `OK naming:${scope} -> ${relativeReportPath} (${metadata.bytes} bytes, ${metadata.durationMs} ms)\n`,
  );
};

// The generic report-capture tool is the @calculogic/report-capture dev dependency (pinned from
// HCAToolkit/calculogic-report-capture), installed by `npm ci` in this repository. It is resolved
// with Node module resolution starting at repositoryRoot, and its host path is read from that
// package's own `bin` declaration rather than assumed.
const resolveReportCaptureHostPath = (repositoryRoot) => {
  const requireFromRepositoryRoot = createRequire(
    pathToFileURL(path.join(repositoryRoot, 'package.json')),
  );

  let packageJsonPath;
  try {
    packageJsonPath = requireFromRepositoryRoot.resolve('@calculogic/report-capture/package.json');
  } catch {
    throw new Error(
      `The @calculogic/report-capture dev dependency is not installed for ${repositoryRoot}. ` +
        'Run `npm ci` in the Validator repository and try again.',
    );
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return path.resolve(path.dirname(packageJsonPath), packageJson.bin['calculogic-report-capture']);
};

// This script lives at <repositoryRoot>/scripts/report-capture-verify.host.mjs, so its own real
// (symlink-resolved) location, one level up from its own file, IS repositoryRoot - not two levels
// up, and not nested beneath a further 'calculogic-validator/' segment. The naming validator host
// script lives directly under that repositoryRoot, and the report-capture dev dependency is
// resolved from it (see resolveReportCaptureHostPath above). Deliberately derived from this
// script's own file location rather than `process.cwd()`: the consumer invocation cwd and the
// report output directory (below) are separate concepts that must not drive where the
// report-capture tool itself is found.
const run = async () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const reportsDir = process.env.REPORTS_DIR || './.reports';
  const hostPath = resolveReportCaptureHostPath(repositoryRoot);
  const namingValidatorPath = path.resolve(repositoryRoot, 'scripts/validate-naming.host.mjs');
  const scopes = parseScopes(process.argv.slice(2));

  let hasFailures = false;

  for (const scope of scopes) {
    try {
      await runScopeVerification({
        scope,
        reportsDir,
        repositoryRoot,
        hostPath,
        namingValidatorPath,
      });
    } catch (error) {
      hasFailures = true;
      process.stderr.write(`FAIL naming:${scope} -> ${error.message}\n`);
    }
  }

  process.exit(hasFailures ? 1 : 0);
};

run().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
