import { resolveContextualValidatorScopeProfile } from '../validator-scopes.logic.mjs';
import { runValidatorRunner } from '../validator-runner.logic.mjs';
import { loadValidatorConfigFromFile } from '../config/validator-config.logic.mjs';
import {
  computeConfigDigest,
  getValidatorToolVersion,
} from '../validator-report-meta.logic.mjs';
import { deriveExitCodeFromRunnerReport } from '../validator-exit-code.logic.mjs';
import { detectNpmArgForwardingFootgun } from '../npm-arg-forwarding-guard.logic.mjs';
import { resolveCliRegistrySet } from './validator-cli-registry-resolution.logic.mjs';
import {
  writeValidatorReportToStdout,
  setValidatorReportExitCode,
} from './validator-cli-output.logic.mjs';
import {
  printValidatorUsageToStdout,
  printValidatorUsageErrorToStderr,
} from './validator-cli-usage.logic.mjs';

export const runValidatorRunnerCli = ({
  argv,
  usageLines,
  repositoryRoot,
  expectedLifecycleEvent,
  supportedFlagNames,
  parseCliArgs,
  buildRunnerOptions,
  buildExitCodeOptions,
  // From `resolveCliRegistrySet`, when the host already resolved for its usage text.
  cliRegistrySet = resolveCliRegistrySet(repositoryRoot),
  // The arguments as forwarded, for the npm forwarding guard; `argv` may have had host-level options
  // such as `--registry-candidate` taken out before parsing.
  forwardedArgv = argv,
}) => {
  const npmArgForwardingMessage = detectNpmArgForwardingFootgun({
    argv: forwardedArgv,
    npmConfigArgvJson: process.env.npm_config_argv,
    lifecycleEvent: process.env.npm_lifecycle_event,
    expectedLifecycleEvent,
    supportedFlagNames,
  });

  if (npmArgForwardingMessage) {
    printValidatorUsageErrorToStderr(npmArgForwardingMessage, usageLines);
    return { shouldExit: true, exitCode: 1 };
  }

  let parsed;
  try {
    parsed = parseCliArgs(argv);
  } catch (error) {
    printValidatorUsageErrorToStderr(error.message, usageLines);
    return { shouldExit: true, exitCode: 1 };
  }

  if (parsed.helpRequested) {
    printValidatorUsageToStdout(usageLines);
    return { shouldExit: true, exitCode: 0 };
  }

  // One lifecycle resolution per run; a lifecycle error stops the run before any report.
  if (cliRegistrySet.registryResolutionError) {
    printValidatorUsageErrorToStderr(cliRegistrySet.registryResolutionError.message, usageLines);
    return { shouldExit: true, exitCode: 1 };
  }
  const { registryResolution } = cliRegistrySet;

  if (parsed.selectedScope) {
    const scopeResolution = resolveContextualValidatorScopeProfile(parsed.selectedScope, {
      targetRepositoryRoot: repositoryRoot,
      registryRoots: registryResolution.registryRoots,
    });
    if (scopeResolution.status === 'invalid-scope') {
      printValidatorUsageErrorToStderr(`Invalid scope: ${parsed.selectedScope}`, usageLines);
      return { shouldExit: true, exitCode: 1 };
    }
    if (scopeResolution.status === 'unavailable-scope') {
      printValidatorUsageErrorToStderr(scopeResolution.message, usageLines);
      return { shouldExit: true, exitCode: 1 };
    }
  }

  try {
    const config = parsed.configPath
      ? loadValidatorConfigFromFile(parsed.configPath, { cwd: process.cwd() })
      : undefined;

    const toolVersion = getValidatorToolVersion();

    const report = runValidatorRunner(repositoryRoot, {
      ...buildRunnerOptions({
        parsed,
        config,
        toolVersion,
        configDigest: config ? computeConfigDigest(config) : undefined,
      }),
      registryResolution,
    });

    writeValidatorReportToStdout(report);
    setValidatorReportExitCode(
      deriveExitCodeFromRunnerReport(report, {
        ...(buildExitCodeOptions ? buildExitCodeOptions({ parsed, config }) : {}),
        registryRoots: registryResolution.registryRoots,
      }),
    );
  } catch (error) {
    printValidatorUsageErrorToStderr(error.message, usageLines);
    return { shouldExit: true, exitCode: 1 };
  }

  return { shouldExit: false };
};
