#!/usr/bin/env node

import { resolveRepositoryRoot } from '../src/core/repository-root.logic.mjs';
import {
  buildDirectValidatorRunnerUsageLines,
  parseDirectValidatorRunnerCliArgs,
} from '../src/core/cli/validator-cli-direct.logic.mjs';
import { runValidatorRunnerCli } from '../src/core/cli/validator-cli-runner.logic.mjs';
import { resolveCliRegistrySet } from '../src/core/cli/validator-cli-registry-resolution.logic.mjs';

const repositoryRoot = resolveRepositoryRoot();
const cliRegistrySet = resolveCliRegistrySet(repositoryRoot);

const usageLines = buildDirectValidatorRunnerUsageLines({
  validatorId: 'tree-structure-advisor',
  defaultScopeLine: 'Default scope: validator default (repo for tree-structure-advisor)',
  registryRoots: cliRegistrySet.usageRegistryRoots,
  repositoryRoot,
  examples: [
    '  ✅ calculogic-validate-tree --scope=repo',
    '  ✅ calculogic-validate-tree --scope=app --target src/tree',
    '  ✅ calculogic-validate-tree --target tree/src',
    '  ✅ calculogic-validate --validators=tree-structure-advisor --scope=repo',
  ],
});

const result = runValidatorRunnerCli({
  argv: process.argv.slice(2),
  usageLines,
  repositoryRoot,
  cliRegistrySet,
  expectedLifecycleEvent: 'validate:tree',
  supportedFlagNames: ['scope', 'target', 'config'],
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
