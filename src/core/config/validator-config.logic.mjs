import fs from 'node:fs';
import path from 'node:path';
import { VALIDATOR_CONFIG_VERSION } from './validator-config.contracts.mjs';

const fail = (message) => {
  throw new Error(`Invalid validator config: ${message}`);
};

const assertOnlyKeys = (obj, allowedKeys, pathLabel) => {
  const allowed = new Set(allowedKeys);
  Object.keys(obj).forEach((key) => {
    if (!allowed.has(key)) {
      fail(`${pathLabel} contains unknown key "${key}".`);
    }
  });
};

const normalizeConfig = (config) => ({
  version: VALIDATOR_CONFIG_VERSION,
  ...(config?.strictExit === undefined ? {} : { strictExit: config.strictExit }),
});

const validateConfig = (config) => {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    fail('root must be an object.');
  }

  if (Object.hasOwn(config, 'naming')) {
    fail(
      '"naming" is no longer accepted (#41). Configuration never carries registry records: customize Naming registries in the Custom registry set instead (run `calculogic-validator-registry init-custom`, then edit .calculogic/registries/custom/naming/).',
    );
  }

  assertOnlyKeys(config, ['version', 'strictExit', '$schema'], 'root');

  if (config.version !== VALIDATOR_CONFIG_VERSION) {
    fail(`version must be "${VALIDATOR_CONFIG_VERSION}".`);
  }

  if (config.strictExit !== undefined && typeof config.strictExit !== 'boolean') {
    fail('strictExit must be a boolean when provided.');
  }
};

export const loadValidatorConfigFromFile = (configPath, { cwd = process.cwd() } = {}) => {
  if (!configPath || typeof configPath !== 'string') {
    fail('path must be a non-empty string.');
  }

  const resolvedPath = path.resolve(cwd, configPath);

  let rawJson;
  try {
    rawJson = fs.readFileSync(resolvedPath, 'utf8');
  } catch {
    throw new Error(`Failed to read validator config file: ${resolvedPath}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error(`Failed to parse validator config JSON: ${resolvedPath}`);
  }

  validateConfig(parsed);
  return normalizeConfig(parsed);
};
