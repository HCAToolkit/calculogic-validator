import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertAllowedFields,
  isPathSegmentName,
  isSingleFileExtension,
} from '../../../src/core/registry-entry-shape.logic.mjs';
import { TREE_ARTIFACT_SURFACES } from '../tree-structure-advisor.contracts.mjs';

// How each shim list is matched, and so which values could ever match: directory segments, basename
// tokens (the detector splits basenames on anything outside [a-z0-9]) and `path.extname` values.
const isBasenameToken = (value) => /^[a-z0-9]+$/u.test(value);
const isArtifactSurface = (value) => Object.values(TREE_ARTIFACT_SURFACES).includes(value);
const SHIM_LIST_VALUE_RULES = Object.freeze({
  'shimDetectionSignals.folderSignals': [isPathSegmentName, 'a bare directory name'],
  'shimDetectionSignals.surfaceSegmentSignals': [isPathSegmentName, 'a bare directory name'],
  'shimDetectionSignals.nameTokenSignals': [isBasenameToken, 'a basename token of letters and digits'],
  'shimSuppressionVocabularies.detectorImplementationTokens': [isBasenameToken, 'a basename token of letters and digits'],
  'shimExtensionAllowlist.relevantFileExtensions': [isSingleFileExtension, 'a single extension such as ".ts"'],
  // Compared with the surface the detector infers from a path.
  'shimSuppressionVocabularies.nonRuntimeWeakSignalSurfaces': [
    isArtifactSurface,
    `one of the inferred artifact surfaces ${Object.values(TREE_ARTIFACT_SURFACES).join(', ')}`,
  ],
});

const BUILTIN_REGISTRY_ROOT = new URL('./_builtin/', import.meta.url);

export const BUILTIN_VALIDATOR_OWNED_SIGNALS_REGISTRY_PATH = fileURLToPath(
  new URL('validator-owned-signals.registry.json', BUILTIN_REGISTRY_ROOT),
);

export const BUILTIN_SHIM_DETECTION_SIGNALS_REGISTRY_PATH = fileURLToPath(
  new URL('shim-detection-signals.registry.json', BUILTIN_REGISTRY_ROOT),
);

const VALIDATOR_OWNED_SIGNAL_CLASSES = new Set([
  'validator-module-surface',
  'validator-cli-entrypoint',
  'validator-quality-surface',
]);

const assertStringList = ({ payload, keyPath }) => {
  if (!Array.isArray(payload)) {
    throw new Error(`Invalid tree-signal registry: ${keyPath} must be an array.`);
  }

  payload.forEach((value, index) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(
        `Invalid tree-signal registry: ${keyPath}[${index}] must be a non-empty string.`,
      );
    }

    // Matching is case-insensitive, so the registry holds the lowercase form only; a cased
    // spelling would mean the same as its lowercase twin while comparing as different.
    if (value !== value.toLowerCase()) {
      throw new Error(`Invalid tree-signal registry: ${keyPath}[${index}] must be lowercase.`);
    }

    const valueRule = SHIM_LIST_VALUE_RULES[keyPath];
    if (valueRule && !valueRule[0](value)) {
      throw new Error(`Invalid tree-signal registry: ${keyPath}[${index}] must be ${valueRule[1]}.`);
    }
  });

  return payload.map((value) => value.toLowerCase());
};

export const loadValidatorOwnedSignalsRegistryPayload = (registryPath) => {
  const payload = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid tree-signal registry: validator-owned payload must be an object.');
  }

  if (!Array.isArray(payload.validatorOwnedBasenameSignals)) {
    throw new Error(
      'Invalid tree-signal registry: validatorOwnedBasenameSignals must be an array.',
    );
  }

  // The registry is keyed by pattern (lifecycle descriptor), so a pattern appears once.
  const seenPatterns = new Set();
  const validatorOwnedBasenameSignalMatchers = payload.validatorOwnedBasenameSignals.map(
    (signal, index) => {
      if (!signal || typeof signal !== 'object') {
        throw new Error(
          `Invalid tree-signal registry: validatorOwnedBasenameSignals[${index}] must be an object.`,
        );
      }

      assertAllowedFields(signal, ['signalClass', 'matchType', 'pattern'], {
        registryLabel: 'tree-signal',
        label: `validatorOwnedBasenameSignals[${index}]`,
      });

      if (!VALIDATOR_OWNED_SIGNAL_CLASSES.has(signal.signalClass)) {
        throw new Error(
          `Invalid tree-signal registry: validatorOwnedBasenameSignals[${index}].signalClass must be one of validator-module-surface, validator-cli-entrypoint, validator-quality-surface.`,
        );
      }

      if (signal.matchType !== 'regex') {
        throw new Error(
          `Invalid tree-signal registry: validatorOwnedBasenameSignals[${index}].matchType must be "regex".`,
        );
      }

      if (typeof signal.pattern !== 'string' || signal.pattern.length === 0) {
        throw new Error(
          `Invalid tree-signal registry: validatorOwnedBasenameSignals[${index}].pattern must be a non-empty string.`,
        );
      }

      if (seenPatterns.has(signal.pattern)) {
        throw new Error(
          `Invalid tree-signal registry: validatorOwnedBasenameSignals[${index}].pattern "${signal.pattern}" is duplicated.`,
        );
      }

      seenPatterns.add(signal.pattern);

      let pattern;
      try {
        pattern = new RegExp(signal.pattern, 'u');
      } catch (error) {
        throw new Error(
          `Invalid tree-signal registry: validatorOwnedBasenameSignals[${index}].pattern must compile as a regex: ${error.message}`,
        );
      }

      return {
        signalClass: signal.signalClass,
        matcher: pattern,
      };
    },
  );

  return {
    validatorOwnedBasenameSignalMatchers,
  };
};

export const loadShimDetectionSignalsRegistryPayload = (registryPath) => {
  const payload = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid tree-signal registry: shim-detection payload must be an object.');
  }

  const shimDetectionSignals = payload.shimDetectionSignals;
  const shimSuppressionVocabularies = payload.shimSuppressionVocabularies;
  const shimExtensionAllowlist = payload.shimExtensionAllowlist;

  if (!shimDetectionSignals || typeof shimDetectionSignals !== 'object') {
    throw new Error('Invalid tree-signal registry: shimDetectionSignals must be an object.');
  }

  if (!shimSuppressionVocabularies || typeof shimSuppressionVocabularies !== 'object') {
    throw new Error(
      'Invalid tree-signal registry: shimSuppressionVocabularies must be an object.',
    );
  }

  if (!shimExtensionAllowlist || typeof shimExtensionAllowlist !== 'object') {
    throw new Error('Invalid tree-signal registry: shimExtensionAllowlist must be an object.');
  }

  for (const [label, value, fields] of [
    ['shimDetectionSignals', shimDetectionSignals, ['folderSignals', 'nameTokenSignals', 'surfaceSegmentSignals']],
    ['shimSuppressionVocabularies', shimSuppressionVocabularies, ['detectorImplementationTokens', 'nonRuntimeWeakSignalSurfaces']],
    ['shimExtensionAllowlist', shimExtensionAllowlist, ['relevantFileExtensions']],
  ]) {
    assertAllowedFields(value, fields, { registryLabel: 'tree-signal', label });
  }

  return {
    shimFolderSignals: new Set(
      assertStringList({
        payload: shimDetectionSignals.folderSignals,
        keyPath: 'shimDetectionSignals.folderSignals',
      }),
    ),
    shimNameTokenSignals: new Set(
      assertStringList({
        payload: shimDetectionSignals.nameTokenSignals,
        keyPath: 'shimDetectionSignals.nameTokenSignals',
      }),
    ),
    shimSurfaceSegmentSignals: new Set(
      assertStringList({
        payload: shimDetectionSignals.surfaceSegmentSignals,
        keyPath: 'shimDetectionSignals.surfaceSegmentSignals',
      }),
    ),
    nonRuntimeWeakSignalSuppressedSurfaces: new Set(
      assertStringList({
        payload: shimSuppressionVocabularies.nonRuntimeWeakSignalSurfaces,
        keyPath: 'shimSuppressionVocabularies.nonRuntimeWeakSignalSurfaces',
      }),
    ),
    shimDetectorImplementationTokens: new Set(
      assertStringList({
        payload: shimSuppressionVocabularies.detectorImplementationTokens,
        keyPath: 'shimSuppressionVocabularies.detectorImplementationTokens',
      }),
    ),
    shimRelevantFileExtensions: new Set(
      assertStringList({
        payload: shimExtensionAllowlist.relevantFileExtensions,
        keyPath: 'shimExtensionAllowlist.relevantFileExtensions',
      }),
    ),
  };
};

let cachedBuiltinTreeSignalPolicy = null;

export const loadBuiltinTreeSignalPolicy = ({
  validatorOwnedSignalsRegistryPath = BUILTIN_VALIDATOR_OWNED_SIGNALS_REGISTRY_PATH,
  shimDetectionSignalsRegistryPath = BUILTIN_SHIM_DETECTION_SIGNALS_REGISTRY_PATH,
} = {}) => {
  const validatorOwnedSignals = loadValidatorOwnedSignalsRegistryPayload(
    validatorOwnedSignalsRegistryPath,
  );
  const shimDetectionSignals = loadShimDetectionSignalsRegistryPayload(shimDetectionSignalsRegistryPath);

  return {
    ...validatorOwnedSignals,
    ...shimDetectionSignals,
  };
};

export const getBuiltinTreeSignalPolicy = () => {
  if (cachedBuiltinTreeSignalPolicy === null) {
    cachedBuiltinTreeSignalPolicy = loadBuiltinTreeSignalPolicy();
  }

  return cachedBuiltinTreeSignalPolicy;
};
