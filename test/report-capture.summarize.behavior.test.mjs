import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const summarizerScriptPath = path.resolve(
  'scripts/report-capture-summarize.host.mjs',
);

const runSummarizer = (args) => {
  const result = spawnSync(process.execPath, [summarizerScriptPath, ...args], {
    encoding: 'utf8',
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
};

test('missing reports directory is non-fatal by default', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-capture-summarize-behavior-'));

  try {
    const missingDir = path.join(tempDir, 'missing');
    const result = runSummarizer([`--dir=${missingDir}`, '--prefixes=naming-docs']);

    assert.equal(result.exitCode, 0, result.stderr || result.stdout);
    assert.match(result.stderr, /No reports directory found/u);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('missing prefix is SKIP when reports directory exists', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-capture-summarize-behavior-'));

  try {
    const result = runSummarizer([`--dir=${tempDir}`, '--prefixes=naming-docs']);

    assert.equal(result.exitCode, 0, result.stderr || result.stdout);
    assert.match(result.stderr, /SKIP naming-docs/u);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('naming report summarizes naming classification keys and warn count', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-capture-summarize-behavior-'));

  try {
    const reportPath = path.join(tempDir, 'naming-docs-2026-02-27_00-00-00.txt');
    fs.writeFileSync(
      reportPath,
      JSON.stringify({
        scope: 'docs',
        totalFilesScanned: 13,
        counts: {
          canonical: 8,
          'allowed-special-case': 2,
          'legacy-exception': 1,
          'invalid-ambiguous': 2,
        },
        codeCounts: {
          namingWarnA: 2,
          namingWarnB: 1,
        },
        findings: [
          {
            severity: 'warn',
            code: 'namingWarnA',
            path: 'doc/example.md',
          },
        ],
        scopeSummary: {
          findingsGenerated: 5,
        },
      }),
    );

    const result = runSummarizer([`--dir=${tempDir}`, '--prefixes=naming-docs']);

    assert.equal(result.exitCode, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /scope:\s*docs/u);
    assert.match(result.stdout, /allowedSpecialCase=/u);
    assert.match(result.stdout, /warnCount:\s*1/u);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('validate-all runner report summarizes validators without top-level findings assumptions', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-capture-summarize-behavior-'));

  try {
    const reportPath = path.join(tempDir, 'validate-all-docs-2026-02-27_00-00-00.txt');
    fs.writeFileSync(
      reportPath,
      JSON.stringify({
        mode: 'report',
        scope: 'docs',
        validators: [
          {
            id: 'naming-validator',
            totalFilesScanned: 9,
            counts: {
              canonical: 7,
              invalid: 2,
            },
            findings: [
              {
                severity: 'warn',
                code: 'ruleA',
                path: 'doc/bad.md',
              },
            ],
            codeCounts: {
              ruleA: 1,
            },
          },
        ],
      }),
    );

    const result = runSummarizer([`--dir=${tempDir}`, '--prefixes=validate-all-docs']);

    assert.equal(result.exitCode, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /validator:\s*naming-validator/u);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('--help prints usage and exits 0 without requiring a reports directory', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-capture-summarize-behavior-'));

  try {
    const missingDir = path.join(tempDir, 'missing');
    const result = runSummarizer([`--dir=${missingDir}`, '--strict', '--help']);

    assert.equal(result.exitCode, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Usage: npm run report:summarize --/u);
    for (const option of ['--dir=', '--prefixes=', '--top=', '--warn-samples=', '--strict']) {
      assert.ok(result.stdout.includes(option), `help should document ${option}`);
    }
    assert.equal(result.stderr, '');
    assert.doesNotMatch(result.stdout, /No reports directory found/u);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('-h is accepted as a help alias', () => {
  const result = runSummarizer(['-h']);

  assert.equal(result.exitCode, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Usage: npm run report:summarize --/u);
});

test('unknown options still fail with exit 1', () => {
  const result = runSummarizer(['--not-an-option']);

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /Unknown option: --not-an-option/u);
});
