import { resolveRepositoryRoot } from '../src/core/repository-root.logic.mjs';
import { detectNpmArgForwardingFootgun } from '../src/core/npm-arg-forwarding-guard.logic.mjs';
import { buildNamingCliUsageLines } from '../naming/src/cli/naming-cli-usage.logic.mjs';
import { runNamingCli } from '../naming/src/cli/naming-cli-runner.logic.mjs';
import { resolveCliRegistrySet } from '../src/core/cli/validator-cli-registry-resolution.logic.mjs';

const repositoryRoot = resolveRepositoryRoot();
const cliRegistrySet = resolveCliRegistrySet(repositoryRoot);
const usageLines = buildNamingCliUsageLines({ validatorId: 'naming', registryRoots: cliRegistrySet.usageRegistryRoots });

const npmArgForwardingMessage = detectNpmArgForwardingFootgun({
  argv: process.argv.slice(2),
  npmConfigArgvJson: process.env.npm_config_argv,
  lifecycleEvent: process.env.npm_lifecycle_event,
  expectedLifecycleEvent: 'validate:naming',
  supportedFlagNames: ['scope', 'target', 'config', 'strict'],
});

const result = runNamingCli({
  argv: process.argv.slice(2),
  usageLines,
  repositoryRoot,
  npmArgForwardingMessage,
  cliRegistrySet,
});

if (result.shouldExit) {
  process.exit(result.exitCode);
}
