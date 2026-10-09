import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILTIN_REGISTRY_ROOT = new URL('./_builtin/', import.meta.url);

export const BUILTIN_NAMING_FOLDER_COMPOSITION_PATTERNS_REGISTRY_PATH = fileURLToPath(
  new URL('folder-composition-patterns.registry.json', BUILTIN_REGISTRY_ROOT),
);

let cachedBuiltinFolderCompositionPatternsRegistry = null;

const assertValidRegistry = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid Naming folder-composition patterns registry: expected object payload.');
  }
  if (!Array.isArray(payload.folderCompositionPatterns)) {
    throw new Error('Invalid Naming folder-composition patterns registry: folderCompositionPatterns must be an array.');
  }
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
