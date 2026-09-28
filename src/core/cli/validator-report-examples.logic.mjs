import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const EXAMPLES_DIRECTORY = 'test/fixtures/report-examples';

// The examples document the Validator that is running, so its development root is where this
// module physically lives (symlinks resolved), never the caller's working directory. From a
// consumer repository, the current directory is the consumer, not the Validator.
const resolveExecutingValidatorRoot = () =>
  fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..'));

// Present in a development checkout and absent from an installed package (not in `files`), the
// same marker Calculogic_React_App's live-link guard uses.
const DEVELOPMENT_CHECKOUT_MARKER = 'test';

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
    const repositoryRoot = resolveExecutingValidatorRoot();
    const parsed = parseValidatorReportExamplesArgs(argv);

    // An explicit --out-dir is resolved from the caller's working directory, like any CLI path.
    // The default target is this checkout's checked-in fixtures, which only a development
    // checkout has; an installed package must never write fixtures into node_modules.
    if (!parsed.outDir && !fs.existsSync(path.join(repositoryRoot, DEVELOPMENT_CHECKOUT_MARKER))) {
      throw new Error(
        `${repositoryRoot} is not a Validator development checkout (no ${DEVELOPMENT_CHECKOUT_MARKER}/ ` +
          'directory), so it has no checked-in report examples to refresh. Run this from an editable ' +
          'calculogic-validator checkout, or pass --out-dir=<path>.',
      );
    }
    const outputDirectory = parsed.outDir
      ? path.resolve(cwd, parsed.outDir)
      : path.join(repositoryRoot, EXAMPLES_DIRECTORY);

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
