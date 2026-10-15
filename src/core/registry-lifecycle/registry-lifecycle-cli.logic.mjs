/**
 * Configuration: cfg-registryLifecycle
 * Concern File: Logic
 * Source NL: doc/ValidatorSpecs/nl-config/cfg-registryLifecycle.md (§5.3, §7.3)
 * Responsibility: The lifecycle command interface: `init-custom`, `use`, `status`, `diff`,
 *   `decisions-template`, `decisions-check` and `update`.
 * Invariants: operates on the validation target root; prints deterministic JSON on stdout;
 *   usage and lifecycle errors go to stderr with exit code 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getValidatorToolVersion } from '../validator-report-meta.logic.mjs';
import {
  printValidatorUsageErrorToStderr,
  printValidatorUsageToStdout,
} from '../cli/validator-cli-usage.logic.mjs';
import { initCustomRegistrySet } from './registry-lifecycle-init.logic.mjs';
import { buildRegistryLifecycleStatus } from './registry-lifecycle-status.logic.mjs';
import { applyRegistryUpdateDecisions } from './registry-lifecycle-update.logic.mjs';
import { useRegistrySet } from './registry-lifecycle-use.logic.mjs';
import { buildRegistryLifecycleDiff } from './registry-lifecycle-diff.logic.mjs';
import {
  buildRegistryUpdateDecisionsTemplate,
  checkRegistryUpdateDecisions,
} from './registry-lifecycle-decisions.logic.mjs';
import { ACTIVE_SET_VALUES } from './registry-lifecycle.contracts.mjs';

export const REGISTRY_LIFECYCLE_USAGE_LINES = Object.freeze([
  'Usage: calculogic-validator-registry <command>',
  '',
  'Commands:',
  '  init-custom            Create a complete Custom registry set from Builtin in .calculogic/registries/custom/.',
  '                         Refuses if a Custom set exists. Does not change the active set.',
  '  use <builtin|custom>   Set the active registry set. "use custom" checks the Custom set first and refuses',
  '                         if it is missing, incomplete, version-incompatible or invalid. "use builtin" always',
  '                         works and keeps the Custom set as it is.',
  '  status                 Print the Builtin/Custom lifecycle state as JSON.',
  '  diff [registryId...]   Print the read-only three-way comparison of Custom with its Baseline and the',
  '                         current Builtin, per registry and per entry, as JSON. Writes nothing.',
  '  decisions-template [registryId...]',
  '                         Print an update decisions document for the current comparison, with every',
  '                         decision null (undecided), as JSON. Writes nothing.',
  '  decisions-check <file> Check an update decisions document against the current comparison and print',
  '                         the result as JSON. Exits 1 when it has problems. Writes nothing.',
  '  update <file>          Apply a checked update decisions document to the Custom set: registry-added',
  '                         records decided "inherit", and entries decided "keep-custom",',
  '                         "take-builtin" or merge-fields. Undecided records, and records with an',
  '                         add-alongside decision (checked, not yet applied), are skipped. The',
  '                         registries of a slice advance together; the active set never changes.',
  '',
  'Repository scripts:',
  '  npm run registry:init-custom',
  '  npm run registry:use -- <builtin|custom>',
  '  npm run registry:status',
  '  npm run registry:diff -- [registryId...]',
  '  npm run -s registry:decisions-template -- [registryId...] > <file>',
  '  npm run registry:decisions-check -- <file>',
  '  npm run registry:update -- <file>',
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
    const [activeSet, ...extra] = rest;
    if (!ACTIVE_SET_VALUES.includes(activeSet) || extra.length > 0) {
      printValidatorUsageErrorToStderr(
        `"use" needs exactly one of: ${ACTIVE_SET_VALUES.join(', ')}.`,
        REGISTRY_LIFECYCLE_USAGE_LINES,
      );
      return { exitCode: 1 };
    }

    try {
      writeJson({ command, ...useRegistrySet({ targetRoot, activeSet }) });
      return { exitCode: 0 };
    } catch (error) {
      console.error(error.message);
      return { exitCode: 1 };
    }
  }

  if (command === 'diff' || command === 'decisions-template') {
    const build = command === 'diff' ? buildRegistryLifecycleDiff : buildRegistryUpdateDecisionsTemplate;
    let output;
    try {
      output = build({ targetRoot, registryIds: rest });
    } catch (error) {
      const isUsageError = error.message.startsWith('Unknown registry id');
      if (isUsageError) {
        printValidatorUsageErrorToStderr(error.message, REGISTRY_LIFECYCLE_USAGE_LINES);
      } else {
        console.error(error.message);
      }
      return { exitCode: 1 };
    }

    writeJson(output);
    return { exitCode: 0 };
  }

  if (command === 'decisions-check' || command === 'update') {
    const [documentPath, ...extra] = rest;
    if (documentPath === undefined || extra.length > 0) {
      printValidatorUsageErrorToStderr(`"${command}" needs exactly one document path.`, REGISTRY_LIFECYCLE_USAGE_LINES);
      return { exitCode: 1 };
    }

    // The document is an ordinary input file, resolved from the working directory (spec §12.4).
    // `update` reads it only after recovering an interrupted transaction (spec §12.5).
    const loadDocument = () => JSON.parse(fs.readFileSync(path.resolve(documentPath), 'utf8'));
    try {
      if (command === 'update') {
        const result = applyRegistryUpdateDecisions({ loadDocument, targetRoot, validatorVersion: getValidatorToolVersion() });
        writeJson({ command, ...result });
        return { exitCode: result.problems || result.failed ? 1 : 0 };
      }

      let document;
      try {
        document = loadDocument();
      } catch (error) {
        console.error(`Cannot read ${documentPath}: ${error.message}`);
        return { exitCode: 1 };
      }

      const result = checkRegistryUpdateDecisions({ document, targetRoot });
      writeJson(result);
      return { exitCode: result.valid ? 0 : 1 };
    } catch (error) {
      console.error(error.message);
      return { exitCode: 1 };
    }
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
