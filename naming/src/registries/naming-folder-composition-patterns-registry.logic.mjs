import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertRegistryEntries, isPathSegmentName } from '../../../src/core/registry-entry-shape.logic.mjs';
import { NAMING_FOLDER_COMPOSITION_KINDS } from '../naming-validator.contracts.mjs';

const BUILTIN_REGISTRY_ROOT = new URL('./_builtin/', import.meta.url);

export const BUILTIN_NAMING_FOLDER_COMPOSITION_PATTERNS_REGISTRY_PATH = fileURLToPath(
  new URL('folder-composition-patterns.registry.json', BUILTIN_REGISTRY_ROOT),
);

let cachedBuiltinFolderCompositionPatternsRegistry = null;

// Naming's registry status vocabulary; the projection reads only `active` patterns.
const FOLDER_COMPOSITION_PATTERN_STATUSES = Object.freeze(['active', 'deprecated']);
const REGISTRY_LABEL = 'Naming folder-composition patterns';

// The projection keeps the first active pattern per folder name, so a second active pattern for the
// same folder would never be read.
const assertUniqueActiveFolderNames = (patterns, listLabel) => {
  const seenFolderNames = new Set();
  for (const pattern of patterns) {
    // The projection looks a folder up by its single occurrence name.
    if (!isPathSegmentName(pattern.folderName)) {
      throw new Error(
        `Invalid ${REGISTRY_LABEL} registry: ${listLabel} folderName "${pattern.folderName}" must be a bare folder name without a path.`,
      );
    }

    if (pattern.status !== 'active') {
      continue;
    }

    if (seenFolderNames.has(pattern.folderName)) {
      throw new Error(
        `Invalid ${REGISTRY_LABEL} registry: ${listLabel} has more than one active pattern for folder "${pattern.folderName}".`,
      );
    }

    seenFolderNames.add(pattern.folderName);
  }
};

const assertValidRegistry = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid Naming folder-composition patterns registry: expected object payload.');
  }
  if (!Array.isArray(payload.folderCompositionPatterns)) {
    throw new Error('Invalid Naming folder-composition patterns registry: folderCompositionPatterns must be an array.');
  }
  assertRegistryEntries(payload.folderCompositionPatterns, {
    registryLabel: REGISTRY_LABEL,
    listLabel: 'folderCompositionPatterns',
    keyField: 'patternId',
    requiredStringFields: [
      'semanticQualifier',
      'structuralRoleToken',
      'folderName',
      'qualification',
      'confidence',
      'definition',
    ],
    stringArrayFields: ['tokenOrder'],
    enumFields: {
      status: FOLDER_COMPOSITION_PATTERN_STATUSES,
      // The projection interprets only these kinds; another kind would be skipped.
      compositionKind: Object.values(NAMING_FOLDER_COMPOSITION_KINDS),
    },
  });
  assertUniqueActiveFolderNames(payload.folderCompositionPatterns, 'folderCompositionPatterns');
  assertRegistryEntries(payload.folderSemanticContextPatterns, {
    registryLabel: REGISTRY_LABEL,
    listLabel: 'folderSemanticContextPatterns',
    keyField: 'patternId',
    requiredStringFields: ['folderName', 'semanticContext', 'qualification', 'confidence', 'definition'],
    enumFields: { status: FOLDER_COMPOSITION_PATTERN_STATUSES },
  });
  assertUniqueActiveFolderNames(payload.folderSemanticContextPatterns, 'folderSemanticContextPatterns');
  return payload;
};

const FOLDER_COMPOSITION_PATTERNS_REGISTRY_FILENAME = 'folder-composition-patterns.registry.json';

// Loads folder-composition patterns from a Naming registry root (#41 registry lifecycle).
export const loadNamingFolderCompositionPatternsRegistryFromRegistryRoot = (registryRoot) =>
  assertValidRegistry(
    JSON.parse(
      fs.readFileSync(path.join(registryRoot, FOLDER_COMPOSITION_PATTERNS_REGISTRY_FILENAME), 'utf8'),
    ),
  );

export const getBuiltinNamingFolderCompositionPatternsRegistry = () => {
  if (!cachedBuiltinFolderCompositionPatternsRegistry) {
    cachedBuiltinFolderCompositionPatternsRegistry = assertValidRegistry(
      JSON.parse(fs.readFileSync(BUILTIN_NAMING_FOLDER_COMPOSITION_PATTERNS_REGISTRY_PATH, 'utf8')),
    );
  }
  return cachedBuiltinFolderCompositionPatternsRegistry;
};
