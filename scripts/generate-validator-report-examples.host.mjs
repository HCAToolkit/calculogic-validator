import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolveRepositoryRoot } from '../src/core/repository-root.logic.mjs';

const EXAMPLES_DIRECTORY = 'test/fixtures/report-examples';

const SYSTEM_SCOPE_EXAMPLE_ROOT_FILES = Object.freeze({
  'eslint.config.mjs': 'export default [];\n',
  'package-lock.json': `${JSON.stringify({
    name: 'validator-system-scope-report-example',
    lockfileVersion: 3,
    requires: true,
    packages: {},
  }, null, 2)}\n`,
  'package.json': `${JSON.stringify({
    name: 'validator-system-scope-report-example',
    version: '0.0.0',
    private: true,
    type: 'module',
  }, null, 2)}\n`,
  'tsconfig.app.json': `${JSON.stringify({ extends: './tsconfig.json' }, null, 2)}\n`,
  'tsconfig.json': `${JSON.stringify({ compilerOptions: {} }, null, 2)}\n`,
  'tsconfig.node.json': `${JSON.stringify({ extends: './tsconfig.json' }, null, 2)}\n`,
  'vite.config.ts': 'export default {};\n',
});

const createSystemScopeExampleRepository = () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'validator-system-scope-report-example-'));

  for (const [fileName, contents] of Object.entries(SYSTEM_SCOPE_EXAMPLE_ROOT_FILES)) {
    fs.writeFileSync(path.join(fixtureRoot, fileName), contents, 'utf8');
  }

  return fixtureRoot;
};

const replaceUnstableSourceSnapshot = (sourceSnapshot) => {
  if (!sourceSnapshot || typeof sourceSnapshot !== 'object') {
    return sourceSnapshot;
  }

  const normalized = {
    ...sourceSnapshot,
  };

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

const parseArgs = (argv) => {
  const outDirArgument = argv.find((argument) => argument.startsWith('--out-dir='));
  if (!outDirArgument) {
    return {};
  }

  return {
    outDir: outDirArgument.slice('--out-dir='.length),
  };
};

export const generateValidatorReportExamples = ({ repositoryRoot, outputDirectory }) => {
  const systemScopeExampleRepositoryRoot = createSystemScopeExampleRepository();
  const validateNamingScriptPath = path.join(repositoryRoot, 'scripts/validate-naming.host.mjs');
  const validateAllScriptPath = path.join(repositoryRoot, 'scripts/validate-all.host.mjs');

  try {
    const namingReport = runValidatorScript(systemScopeExampleRepositoryRoot, validateNamingScriptPath, [
      '--scope=system',
    ]);

    const runnerReport = runValidatorScript(systemScopeExampleRepositoryRoot, validateAllScriptPath, [
      '--scope=system',
      '--validators=naming',
    ]);

    fs.mkdirSync(outputDirectory, { recursive: true });

    writeExample(path.join(outputDirectory, 'validate-naming.system.report.example.json'), namingReport);
    writeExample(path.join(outputDirectory, 'validate-all.system.naming.report.example.json'), runnerReport);
  } finally {
    fs.rmSync(systemScopeExampleRepositoryRoot, { recursive: true, force: true });
  }
};

const runAsScript = () => {
  const repositoryRoot = resolveRepositoryRoot();
  const parsed = parseArgs(process.argv.slice(2));
  const outputDirectory = path.resolve(
    repositoryRoot,
    parsed.outDir ?? EXAMPLES_DIRECTORY,
  );

  generateValidatorReportExamples({ repositoryRoot, outputDirectory });
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runAsScript();
}
