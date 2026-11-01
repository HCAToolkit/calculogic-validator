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

const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

// Validator config spec §10.1: `linguisticProfile` keeps only its declared fields, `profileVersion`
// only when provided, so an equivalent config without the key normalizes and digests as before.
const normalizeLinguisticProfile = (linguisticProfile) => ({
  profileId: linguisticProfile.profileId,
  ...(linguisticProfile.profileVersion === undefined ? {} : { profileVersion: linguisticProfile.profileVersion }),
});

const normalizeConfig = (config) => ({
  version: VALIDATOR_CONFIG_VERSION,
  ...(config?.strictExit === undefined ? {} : { strictExit: config.strictExit }),
  ...(config?.linguisticProfile === undefined ? {} : { linguisticProfile: normalizeLinguisticProfile(config.linguisticProfile) }),
});

// Validator config spec §10.4 stage 1: the shape of the selection, before any profile is resolved.
const validateLinguisticProfile = (linguisticProfile) => {
  if (!linguisticProfile || typeof linguisticProfile !== 'object' || Array.isArray(linguisticProfile)) {
    fail('linguisticProfile must be an object when provided.');
  }
  assertOnlyKeys(linguisticProfile, ['profileId', 'profileVersion'], 'linguisticProfile');
  if (!isNonEmptyString(linguisticProfile.profileId)) {
    fail('linguisticProfile.profileId must be a non-empty string.');
  }
  if (linguisticProfile.profileVersion !== undefined && !isNonEmptyString(linguisticProfile.profileVersion)) {
    fail('linguisticProfile.profileVersion must be a non-empty string when provided.');
  }
};

const validateConfig = (config) => {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    fail('root must be an object.');
  }

  if (Object.hasOwn(config, 'naming')) {
    fail(
      '"naming" is no longer accepted (#41). Configuration never carries registry records: customize Naming registries in the Custom registry set instead (run `calculogic-validator-registry init-custom`, then edit .calculogic/registries/custom/naming/).',
    );
  }

  assertOnlyKeys(config, ['version', 'strictExit', 'linguisticProfile', '$schema'], 'root');

  if (config.version !== VALIDATOR_CONFIG_VERSION) {
    fail(`version must be "${VALIDATOR_CONFIG_VERSION}".`);
  }

  if (config.strictExit !== undefined && typeof config.strictExit !== 'boolean') {
    fail('strictExit must be a boolean when provided.');
  }

  if (config.linguisticProfile !== undefined) {
    validateLinguisticProfile(config.linguisticProfile);
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
