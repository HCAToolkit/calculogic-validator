import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveRepositoryRoot } from '../repository-root.logic.mjs';

const EXAMPLES_DIRECTORY = 'test/fixtures/report-examples';

export const VALIDATOR_REPORT_EXAMPLE_FILES = Object.freeze({
  naming: 'validate-naming.system.report.example.json',
  runner: 'validate-all.system.naming.report.example.json',
});

const replaceUnstableSourceSnapshot = (sourceSnapshot) => {
  if (!sourceSnapshot || typeof sourceSnapshot !== 'object') {
    return sourceSnapshot;
  }

  const normalized = {
    ...sourceSnapshot,
  };

  if (typeof normalized.repositoryRoot === 'string') {
    normalized.repositoryRoot = '<repository-root>';
  }

  if (typeof normalized.gitHeadSha === 'string') {
    normalized.gitHeadSha = '<git-head-sha>';
  }

  if (normalized.diagnostics && typeof normalized.diagnostics === 'object') {
    normalized.diagnostics = {
      isDirty: false,
      changedCount: 0,
      untrackedCount: 0,
    };
  }

  return normalized;
};

const normalizeReport = (report) => ({
  ...report,
  startedAt: '<iso-startedAt>',
  endedAt: '<iso-endedAt>',
  durationMs: 0,
  sourceSnapshot: replaceUnstableSourceSnapshot(report.sourceSnapshot),
});

const runValidatorScript = (repositoryRoot, scriptPath, args) => {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', scriptPath, ...args],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (![0, 1, 2].includes(result.status)) {
    throw new Error(result.stderr || `Command failed with status ${result.status}`);
  }

  return JSON.parse(result.stdout);
};

const writeExample = (outputPath, report) => {
  fs.writeFileSync(outputPath, `${JSON.stringify(normalizeReport(report), null, 2)}\n`, 'utf8');
};

const parseValidatorReportExamplesArgs = (argv) => {
  const outDirArgument = argv.find((argument) => argument.startsWith('--out-dir='));
  if (!outDirArgument) {
    return {};
  }

  return {
    outDir: outDirArgument.slice('--out-dir='.length),
  };
};

export const generateValidatorReportExamples = ({ repositoryRoot, outputDirectory }) => {
  const namingReport = runValidatorScript(repositoryRoot, 'scripts/validate-naming.host.mjs', [
    '--scope=system',
  ]);

  const runnerReport = runValidatorScript(repositoryRoot, 'scripts/validate-all.host.mjs', [
    '--scope=system',
    '--validators=naming',
  ]);

  fs.mkdirSync(outputDirectory, { recursive: true });

  writeExample(path.join(outputDirectory, VALIDATOR_REPORT_EXAMPLE_FILES.naming), namingReport);
  writeExample(path.join(outputDirectory, VALIDATOR_REPORT_EXAMPLE_FILES.runner), runnerReport);
};

export const runValidatorReportExamplesCli = ({ argv, cwd = process.cwd() }) => {
  try {
    const repositoryRoot = resolveRepositoryRoot({ cwd });
    const parsed = parseValidatorReportExamplesArgs(argv);
    const outputDirectory = path.resolve(repositoryRoot, parsed.outDir ?? EXAMPLES_DIRECTORY);

    generateValidatorReportExamples({ repositoryRoot, outputDirectory });

    process.stdout.write(
      `Wrote ${Object.keys(VALIDATOR_REPORT_EXAMPLE_FILES).length} report examples to ${outputDirectory}\n`,
    );
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
};
