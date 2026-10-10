/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.3, §7.3)
 * Responsibility: The lifecycle command interface: `init-custom` and `status`.
 * Invariants: operates on the validation target root; prints deterministic JSON on stdout;
 *   usage and lifecycle errors go to stderr with exit code 1. `use` ships with #41 slice 3.
 */
import { getValidatorToolVersion } from '../validator-report-meta.logic.mjs';
import {
  printValidatorUsageErrorToStderr,
  printValidatorUsageToStdout,
} from '../cli/validator-cli-usage.logic.mjs';
import { initCustomRegistrySet } from './registry-lifecycle-init.logic.mjs';
import { buildRegistryLifecycleStatus } from './registry-lifecycle-status.logic.mjs';

export const REGISTRY_LIFECYCLE_USAGE_LINES = Object.freeze([
  'Usage: calculogic-validator-registry <command>',
  '',
  'Commands:',
  '  init-custom   Create a complete Custom registry set from Builtin in .calculogic/registries/custom/.',
  '                Refuses if a Custom set exists. Does not change the active set.',
  '  status        Print the Builtin/Custom lifecycle state as JSON.',
  '',
  'Repository scripts:',
  '  npm run registry:init-custom',
  '  npm run registry:status',
]);

const writeJson = (value) => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

// [5.3] cfg-registryLifecycle · Container · "Lifecycle commands"
export const runRegistryLifecycleCli = ({ argv, targetRoot }) => {
  const [command, ...rest] = argv;

  if (command === undefined) {
    printValidatorUsageErrorToStderr('Missing command.', REGISTRY_LIFECYCLE_USAGE_LINES);
    return { exitCode: 1 };
  }

  if (command === '--help' || command === '-h' || command === 'help') {
    printValidatorUsageToStdout(REGISTRY_LIFECYCLE_USAGE_LINES);
    return { exitCode: 0 };
  }

  if (command === 'use') {
    console.error(
      '"use" is not available yet: Custom activation becomes available once every registry consumer reads the resolved set (#41 slice 3).',
    );
    return { exitCode: 1 };
  }

  if (rest.length > 0) {
    printValidatorUsageErrorToStderr(`Unexpected arguments for "${command}": ${rest.join(' ')}`, REGISTRY_LIFECYCLE_USAGE_LINES);
    return { exitCode: 1 };
  }

  try {
    if (command === 'init-custom') {
      const result = initCustomRegistrySet({ targetRoot, validatorVersion: getValidatorToolVersion() });
      writeJson({ command, ...result });
      return { exitCode: 0 };
    }

    if (command === 'status') {
      writeJson(buildRegistryLifecycleStatus({ targetRoot }));
      return { exitCode: 0 };
    }
  } catch (error) {
    console.error(error.message);
    return { exitCode: 1 };
  }

  printValidatorUsageErrorToStderr(`Unknown command: ${command}`, REGISTRY_LIFECYCLE_USAGE_LINES);
  return { exitCode: 1 };
};
