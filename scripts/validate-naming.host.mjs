import { resolveRepositoryRoot } from '../src/core/repository-root.logic.mjs';
import { detectNpmArgForwardingFootgun } from '../src/core/npm-arg-forwarding-guard.logic.mjs';
import { buildNamingCliUsageLines } from '../naming/src/cli/naming-cli-usage.logic.mjs';
import { runNamingCli } from '../naming/src/cli/naming-cli-runner.logic.mjs';
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
const usageLines = buildNamingCliUsageLines({ validatorId: 'naming', registryRoots: cliRegistrySet.usageRegistryRoots });

const npmArgForwardingMessage = detectNpmArgForwardingFootgun({
  argv: forwardedArgv,
  npmConfigArgvJson: process.env.npm_config_argv,
  lifecycleEvent: process.env.npm_lifecycle_event,
  expectedLifecycleEvent: 'validate:naming',
  supportedFlagNames: ['scope', 'target', 'config', 'strict', REGISTRY_CANDIDATE_FLAG_NAME],
});

const result = runNamingCli({
  argv,
  usageLines,
  repositoryRoot,
  npmArgForwardingMessage,
  cliRegistrySet,
});

if (result.shouldExit) {
  process.exit(result.exitCode);
}
