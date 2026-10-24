import { resolveRepositoryRoot } from '../src/core/repository-root.logic.mjs';
import {
  buildDirectValidatorRunnerUsageLines,
  parseDirectValidatorRunnerCliArgs,
} from '../src/core/cli/validator-cli-direct.logic.mjs';
import { runValidatorRunnerCli } from '../src/core/cli/validator-cli-runner.logic.mjs';
import {
  REGISTRY_CANDIDATE_FLAG_NAME,
  extractRegistryCandidateArgument,
  resolveCliRegistrySet,
} from '../src/core/cli/validator-cli-registry-resolution.logic.mjs';

const repositoryRoot = resolveRepositoryRoot();
// `--registry-candidate` selects the run's registry source before anything is resolved (spec §12.13).
const forwardedArgv = process.argv.slice(2);
const { argv, candidate } = extractRegistryCandidateArgument(forwardedArgv);
const cliRegistrySet = resolveCliRegistrySet(repositoryRoot, { candidate });

const usageLines = buildDirectValidatorRunnerUsageLines({
  validatorId: 'tree-structure-advisor',
  defaultScopeLine: 'Default scope: validator default (repo for tree-structure-advisor)',
  registryRoots: cliRegistrySet.usageRegistryRoots,
  examples: [
    '  ✅ npm run validate:tree -- --scope=repo',
    '  ✅ npm run validate:tree -- --scope=app --target src/tree',
    '  ✅ npm run validate:tree -- --target tree/src',
    '  ✅ npm run validate:all -- --validators=tree-structure-advisor --scope=repo',
  ],
});

const result = runValidatorRunnerCli({
  argv,
  forwardedArgv,
  usageLines,
  repositoryRoot,
  cliRegistrySet,
  expectedLifecycleEvent: 'validate:tree',
  supportedFlagNames: ['scope', 'target', 'config', REGISTRY_CANDIDATE_FLAG_NAME],
  parseCliArgs: parseDirectValidatorRunnerCliArgs,
  buildRunnerOptions: ({ parsed, config, toolVersion, configDigest }) => ({
    scope: parsed.selectedScope,
    validators: ['tree-structure-advisor'],
    config,
    targets: parsed.targets,
    toolVersion,
    ...(config ? { configDigest } : {}),
  }),
});

if (result.shouldExit) {
  process.exit(result.exitCode);
}
