import {
  listValidatorScopes,
} from '../src/core/validator-scopes.logic.mjs';
import { listRegisteredValidators } from '../src/core/validator-registry.knowledge.mjs';
import { resolveRepositoryRoot } from '../src/core/repository-root.logic.mjs';
import { parseRepeatableTargetArgument } from '../src/core/cli/validator-cli-targets.logic.mjs';
import {
  buildSupportedScopeToken,
  buildValidatorScopeUsageLinesFromRuntimeProfiles,
} from '../src/core/cli/validator-cli-scopes.logic.mjs';
import { runValidatorRunnerCli } from '../src/core/cli/validator-cli-runner.logic.mjs';
import {
  REGISTRY_CANDIDATE_FLAG_NAME,
  extractRegistryCandidateArgument,
  resolveCliRegistrySet,
} from '../src/core/cli/validator-cli-registry-resolution.logic.mjs';

const repositoryRoot = resolveRepositoryRoot();
// `--registry-candidate` selects the run's registry source before anything is resolved (spec §12.13).
const { argv, candidate } = extractRegistryCandidateArgument(process.argv.slice(2));
const cliRegistrySet = resolveCliRegistrySet(repositoryRoot, { candidate });
const registryRoots = cliRegistrySet.usageRegistryRoots;

const supportedScopes = listValidatorScopes({ registryRoots });
const supportedScopesToken = buildSupportedScopeToken(supportedScopes);

const usageLines = [
  `Usage: npm run validate:all -- [--scope=<${supportedScopesToken}>] [--validators=<id1,id2>] [--target=<path>]... [--config=<path>] [--strict] [--registry-candidate=<artifact.json>]`,
  'Validators:',
  ...listRegisteredValidators().map((validatorId) => `  - ${validatorId}`),
  'Scopes:',
  ...buildValidatorScopeUsageLinesFromRuntimeProfiles(supportedScopes, { registryRoots }),
  'Default scope: validator default (repo for naming)',
  'Default validators: all registered validators',
  'Examples:',
  '  ✅ npm run validate:naming -- --scope=app',
  '  ✅ npm run validate:all -- --validators=naming --scope=docs',
  '  ✅ npm run validate:all -- --validators=naming --scope=app --target src/buildsurface',
  '  ✅ npm run validate:all -- --target src --target test',
  '  ✅ node bin/calculogic-validate-naming.host.mjs --scope=app',
  '  ✅ node bin/calculogic-validate.host.mjs --scope=docs',
  '  ✅ npm run validate:all -- --scope=repo --strict',
];

const parseCliArgs = (argv) => {
  let selectedScope;
  let validators;
  let configPath;
  let strict = false;
  const targets = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      return { helpRequested: true, selectedScope, validators, configPath, strict, targets };
    }

    if (argument.startsWith('--scope=')) {
      selectedScope = argument.slice('--scope='.length);
      continue;
    }

    const targetArgumentResult = parseRepeatableTargetArgument({
      argv,
      index,
      argument,
      targets,
    });
    if (targetArgumentResult.handled) {
      index = targetArgumentResult.nextIndex;
      continue;
    }

    if (argument.startsWith('--config=')) {
      configPath = argument.slice('--config='.length);
      continue;
    }

    if (argument.startsWith('--validators=')) {
      const raw = argument.slice('--validators='.length);
      validators = raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      continue;
    }

    if (argument === '--strict') {
      strict = true;
      continue;
    }

    throw new Error(`Invalid argument: ${argument}`);
  }

  return { helpRequested: false, selectedScope, validators, configPath, strict, targets };
};

const result = runValidatorRunnerCli({
  argv,
  usageLines,
  repositoryRoot,
  cliRegistrySet,
  expectedLifecycleEvent: 'validate:all',
  supportedFlagNames: ['scope', 'target', 'config', 'strict', 'validators', REGISTRY_CANDIDATE_FLAG_NAME],
  parseCliArgs,
  buildRunnerOptions: ({ parsed, config, toolVersion, configDigest }) => ({
    scope: parsed.selectedScope,
    validators: parsed.validators,
    config,
    targets: parsed.targets,
    toolVersion,
    ...(config ? { configDigest } : {}),
  }),
  buildExitCodeOptions: ({ parsed }) => ({ strict: parsed.strict }),
});

if (result.shouldExit) {
  process.exit(result.exitCode);
}
